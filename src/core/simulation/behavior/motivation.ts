import type {
  EventType,
  FlyIntent,
  FlyIntentKind,
  FlyRelationship,
  FlyState,
  Vec3,
  WorldObject,
} from '../protocol/index';
import { distance, foodScale } from '../world/index';
import { explorationTarget } from '../sensory/exploration';
import { NEEDS_POLICY, needsOf } from './needs';
import { personalityOf } from './personality';

type MotivationWorld = { objects: WorldObject[]; flies: FlyState[] };

const PLAN_LIMIT_MS = 2 * 60_000;
const NOTICE_MS = 2_000;
const RECOVERY_MS = 6_000;

function hash01(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

function relationFor(relationships: readonly FlyRelationship[], first: string, second: string) {
  return relationships.find(
    (row) =>
      (row.flyAId === first && row.flyBId === second) ||
      (row.flyAId === second && row.flyBId === first),
  );
}

function nearestFood(fly: FlyState, objects: readonly WorldObject[]) {
  const personality = personalityOf(fly);
  return objects
    .filter((object) => object.type === 'food' && (object.amount ?? 0) > 0)
    .sort((first, second) => {
      const score = (object: WorldObject) =>
        distance(fly.position, object.position) *
        (object.foodKind === personality.favoriteFood ? 0.72 : 1);
      return score(first) - score(second);
    })[0];
}

function nearestWater(fly: FlyState, objects: readonly WorldObject[]) {
  return objects
    .filter((object) => object.type === 'water')
    .sort((a, b) => distance(fly.position, a.position) - distance(fly.position, b.position))[0];
}

function socialTarget(
  fly: FlyState,
  flies: readonly FlyState[],
  relationships: readonly FlyRelationship[],
) {
  return flies
    .filter((other) => other.flyId !== fly.flyId && !other.death)
    .sort((first, second) => {
      const score = (other: FlyState) => {
        const relationship = relationFor(relationships, fly.flyId, other.flyId);
        return (
          distance(fly.position, other.position) -
          (relationship?.affinity ?? 0) * 0.035 -
          (relationship?.familiarity ?? 0) * 0.015
        );
      };
      return score(first) - score(second);
    })[0];
}

function rivalTarget(
  fly: FlyState,
  flies: readonly FlyState[],
  relationships: readonly FlyRelationship[],
) {
  return flies
    .filter((other) => other.flyId !== fly.flyId && !other.death)
    .map((other) => ({
      fly: other,
      relationship: relationFor(relationships, fly.flyId, other.flyId),
    }))
    .filter(({ relationship }) => (relationship?.affinity ?? 0) <= -12)
    .sort(
      (first, second) =>
        distance(fly.position, first.fly.position) - distance(fly.position, second.fly.position),
    )[0]?.fly;
}

function beginIntent(
  fly: FlyState,
  kind: FlyIntentKind,
  world: MotivationWorld,
  relationships: readonly FlyRelationship[],
  now: number,
) {
  let targetId: string | undefined,
    targetName: string | undefined,
    targetPosition: Vec3 | undefined;
  if (kind === 'eat') {
    const target = nearestFood(fly, world.objects);
    targetId = target?.id;
    targetName = target?.name;
    targetPosition = target ? ([...target.position] as Vec3) : undefined;
  } else if (kind === 'drink') {
    const target = nearestWater(fly, world.objects);
    targetId = target?.id;
    targetName = target?.name;
    targetPosition = target ? ([...target.position] as Vec3) : undefined;
  } else if (kind === 'socialize' || kind === 'avoid') {
    const target =
      kind === 'avoid'
        ? rivalTarget(fly, world.flies, relationships)
        : socialTarget(fly, world.flies, relationships);
    targetId = target?.flyId;
    targetName = target?.name;
    targetPosition = target ? ([...target.position] as Vec3) : undefined;
    if (!target) kind = 'explore';
  }
  if (kind === 'explore') targetPosition = explorationTarget(fly, now);
  fly.intent = {
    kind,
    stage: 'notice',
    startedAt: now,
    stageStartedAt: now,
    ...(targetId ? { targetId } : {}),
    ...(targetName ? { targetName } : {}),
    ...(targetPosition ? { targetPosition } : {}),
  };
  return fly.intent;
}

function chooseIntent(
  fly: FlyState,
  world: MotivationWorld,
  relationships: readonly FlyRelationship[],
  now: number,
) {
  const needs = needsOf(fly);
  if (
    needs.hydration <= NEEDS_POLICY.drinkThreshold ||
    needs.hunger <= NEEDS_POLICY.eatThreshold ||
    fly.energy <= 0
  ) {
    const kind =
      needs.hydration / NEEDS_POLICY.drinkThreshold < needs.hunger / NEEDS_POLICY.eatThreshold
        ? 'drink'
        : 'eat';
    return beginIntent(fly, kind, world, relationships, now);
  }
  const personality = personalityOf(fly);
  const rival = rivalTarget(fly, world.flies, relationships);
  if (rival && distance(fly.position, rival.position) < 2.2 && personality.boldness < 0.75)
    return beginIntent(fly, 'avoid', world, relationships, now);
  const options: { kind: FlyIntentKind; weight: number }[] = [
    { kind: 'explore', weight: 0.2 + personality.curiosity * 0.65 },
    {
      kind: 'socialize',
      weight: world.flies.some((other) => other.flyId !== fly.flyId && !other.death)
        ? 0.08 + personality.sociability * 0.55
        : 0,
    },
    { kind: 'groom', weight: 0.08 + (1 - personality.activity) * 0.12 },
    { kind: 'rest', weight: 0.08 + (1 - personality.activity) * 0.3 },
  ];
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = hash01(`${fly.flyId}:${Math.floor(now / 20_000)}`) * total;
  const selected =
    options.find((option) => {
      roll -= option.weight;
      return roll <= 0;
    })?.kind ?? 'explore';
  return beginIntent(fly, selected, world, relationships, now);
}

export function intentTarget(intent: FlyIntent, world: MotivationWorld): Vec3 | undefined {
  if (intent.kind === 'socialize' || intent.kind === 'avoid') {
    const target = world.flies.find((fly) => fly.flyId === intent.targetId && !fly.death);
    return target ? ([...target.position] as Vec3) : undefined;
  }
  if (intent.targetId) {
    const target = world.objects.find((object) => object.id === intent.targetId);
    if (target) return [...target.position] as Vec3;
  }
  return intent.targetPosition ? ([...intent.targetPosition] as Vec3) : undefined;
}

export function advanceIntent(
  fly: FlyState,
  world: MotivationWorld,
  relationships: readonly FlyRelationship[] = [],
  now = Date.now(),
) {
  if (fly.death) {
    delete fly.intent;
    return;
  }
  const needs = needsOf(fly);
  const urgent: FlyIntentKind | undefined =
    needs.hydration <= NEEDS_POLICY.drinkThreshold ||
    needs.hunger <= NEEDS_POLICY.eatThreshold ||
    fly.energy <= 0
      ? needs.hydration / NEEDS_POLICY.drinkThreshold < needs.hunger / NEEDS_POLICY.eatThreshold
        ? 'drink'
        : 'eat'
      : undefined;
  if (urgent && fly.intent?.kind !== urgent)
    return beginIntent(fly, urgent, world, relationships, now);
  let intent = fly.intent;
  if (!intent || now - intent.startedAt > PLAN_LIMIT_MS)
    return chooseIntent(fly, world, relationships, now);
  if (intent.stage === 'recover') {
    if (now - intent.stageStartedAt >= RECOVERY_MS)
      return chooseIntent(fly, world, relationships, now);
    return intent;
  }
  if (intent.stage === 'notice' && now - intent.stageStartedAt >= NOTICE_MS) {
    intent.stage = ['rest', 'groom'].includes(intent.kind) ? 'act' : 'travel';
    intent.stageStartedAt = now;
  }
  if (intent.stage === 'travel') {
    const target = intentTarget(intent, world);
    if (!target) return chooseIntent(fly, world, relationships, now);
    intent.targetPosition = target;
    const targetObject = world.objects.find((object) => object.id === intent.targetId);
    const threshold =
      intent.kind === 'eat' && targetObject
        ? targetObject.radius * foodScale(targetObject) + 0.45
        : intent.kind === 'drink' && targetObject
          ? targetObject.radius + 0.35
          : intent.kind === 'socialize' || intent.kind === 'avoid'
            ? 1.8
            : 1.25;
    if (distance(fly.position, target) <= threshold) {
      intent.stage = 'act';
      intent.stageStartedAt = now;
    }
  }
  if (
    intent.stage === 'act' &&
    now - intent.stageStartedAt >=
      (intent.kind === 'socialize'
        ? 10_000
        : ['rest', 'groom'].includes(intent.kind)
          ? 8_000
          : 4_000)
  ) {
    intent.stage = 'recover';
    intent.stageStartedAt = now;
  }
  return intent;
}

export function completeIntentFromEvent(fly: FlyState, type: EventType, now: number) {
  const matches =
    (fly.intent?.kind === 'eat' && type === 'FOOD_CONSUMED') ||
    (fly.intent?.kind === 'drink' && type === 'WATER_DRANK') ||
    (fly.intent?.kind === 'explore' && ['NEW_AREA', 'RETURN_TO_LOCATION'].includes(type)) ||
    (fly.intent?.kind === 'socialize' && type === 'LONG_INTERACTION') ||
    (fly.intent?.kind === 'avoid' && type === 'AVOIDED_FLY') ||
    (fly.intent?.kind === 'rest' && type === 'RESTED') ||
    (fly.intent?.kind === 'groom' && type === 'GROOMED');
  if (!matches || !fly.intent) return;
  fly.intent.stage = 'recover';
  fly.intent.stageStartedAt = now;
}

const intentActions: Record<FlyIntentKind, string> = {
  eat: 'comer',
  drink: 'beber',
  explore: 'explorar',
  socialize: 'visitar a otra mosca',
  avoid: 'alejarse de una rival',
  rest: 'descansar',
  groom: 'limpiarse',
};

export function intentLabel(intent: FlyIntent | undefined) {
  if (!intent) return;
  const target = intent.targetName ? ` ${intent.targetName}` : '';
  if (intent.stage === 'notice') return `Pensando en ${intentActions[intent.kind]}`;
  if (intent.stage === 'travel')
    return intent.kind === 'socialize'
      ? `Va a ver a${target}`
      : intent.kind === 'avoid'
        ? `Se aleja de${target || ' una rival'}`
        : intent.kind === 'eat'
          ? `Va hacia${target || ' la comida'}`
          : intent.kind === 'drink'
            ? `Va hacia${target || ' el agua'}`
            : 'Explorando un lugar nuevo';
  if (intent.stage === 'recover') return `Satisfecha después de ${intentActions[intent.kind]}`;
  return {
    eat: 'Comiendo',
    drink: 'Bebiendo',
    explore: 'Inspeccionando un lugar nuevo',
    socialize: `Compartiendo un rato con${target || ' otra mosca'}`,
    avoid: `Evitando a${target || ' otra mosca'}`,
    rest: 'Descansando',
    groom: 'Limpiándose',
  }[intent.kind];
}
