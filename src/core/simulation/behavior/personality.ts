import type { FlyPersonality, FlyState } from '../protocol/index';

const unit = (value: number) => Math.max(0, Math.min(1, value));

function seedOf(identity: string) {
  let seed = 2166136261;
  for (const character of identity)
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return seed || 1;
}

/** Stable PRNG: personalities survive legacy migration and never depend on client input. */
export function personalityFor(identity: string): FlyPersonality {
  let seed = seedOf(identity);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const trait = () => 0.18 + random() * 0.72;
  const foods = ['apple', 'pear', 'berry'] as const;
  return {
    curiosity: trait(),
    sociability: trait(),
    boldness: trait(),
    activity: trait(),
    flightAffinity: trait(),
    favoriteFood: foods[Math.floor(random() * foods.length)]!,
  };
}

function valid(personality: FlyPersonality | undefined): personality is FlyPersonality {
  return (
    !!personality &&
    ['curiosity', 'sociability', 'boldness', 'activity', 'flightAffinity'].every((trait) =>
      Number.isFinite(personality[trait as keyof FlyPersonality]),
    ) &&
    ['apple', 'pear', 'berry'].includes(personality.favoriteFood)
  );
}

export function personalityOf(fly: Pick<FlyState, 'flyId' | 'personality'>): FlyPersonality {
  if (!valid(fly.personality)) return personalityFor(fly.flyId);
  return {
    curiosity: unit(fly.personality.curiosity),
    sociability: unit(fly.personality.sociability),
    boldness: unit(fly.personality.boldness),
    activity: unit(fly.personality.activity),
    flightAffinity: unit(fly.personality.flightAffinity),
    favoriteFood: fly.personality.favoriteFood,
  };
}

export function ensurePersonality(fly: FlyState) {
  fly.personality = personalityOf(fly);
  return fly.personality;
}

const traitNames = {
  curiosity: ['Prudente', 'Curiosa'],
  sociability: ['Independiente', 'Sociable'],
  boldness: ['Cautelosa', 'Valiente'],
  activity: ['Tranquila', 'Activa'],
  flightAffinity: ['Caminante', 'Voladora'],
} as const;

export function personalityLabels(personality: FlyPersonality, limit = 2) {
  return (Object.keys(traitNames) as (keyof typeof traitNames)[])
    .map((key) => ({
      label: traitNames[key][personality[key] >= 0.5 ? 1 : 0],
      strength: Math.abs(personality[key] - 0.5),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit)
    .map(({ label }) => label);
}
