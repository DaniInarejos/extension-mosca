import type { FlyState, WorldDelta, WorldObject, WorldState } from './index';

const optionalWorldFields = [
  'gardenEvent',
  'naturalEvent',
  'naturalEventNextAt',
  'hunter',
] as const;

/** Apply a server delta without discarding the static bootstrap information. */
export function applyWorldDelta(current: WorldState, delta: WorldDelta): WorldState {
  if (current.worldId !== delta.worldId) throw new Error('El jardín incremental no coincide.');

  const changesFlies = Boolean(
    delta.addedFlies?.length || delta.flies?.length || delta.removedFlyIds?.length,
  );
  const flies = new Map(changesFlies ? current.flies.map((fly) => [fly.flyId, fly]) : []);
  for (const fly of delta.addedFlies ?? []) flies.set(fly.flyId, fly);
  for (const patch of delta.flies ?? []) {
    const previous = flies.get(patch.flyId);
    if (!previous) continue;
    const next = { ...previous, ...patch.set } as FlyState;
    for (const field of patch.unset ?? [])
      delete (next as unknown as Record<string, unknown>)[field];
    flies.set(patch.flyId, next);
  }
  for (const flyId of delta.removedFlyIds ?? []) flies.delete(flyId);

  let objects = current.objects;
  if (delta.replaceObjectTypes?.length) {
    const replaced = new Set<WorldObject['type']>(delta.replaceObjectTypes);
    objects = objects.filter((object) => !replaced.has(object.type));
  }
  if (delta.objects?.length || delta.removedObjectIds?.length) {
    const byId = new Map(objects.map((object) => [object.id, object]));
    for (const object of delta.objects ?? []) byId.set(object.id, object);
    for (const objectId of delta.removedObjectIds ?? []) byId.delete(objectId);
    objects = [...byId.values()];
  }

  const next: WorldState = {
    ...current,
    tick: delta.tick,
    timestamp: delta.timestamp,
    flies: changesFlies ? [...flies.values()] : current.flies,
    objects,
  };
  for (const field of optionalWorldFields) {
    const value = delta[field];
    if (value === undefined) continue;
    if (value === null) delete (next as unknown as Record<string, unknown>)[field];
    else (next as unknown as Record<string, unknown>)[field] = value;
  }
  return next;
}
