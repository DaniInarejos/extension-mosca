import type { FlyState, WorldObject } from '../protocol/index';
import { needsOf, NEEDS_POLICY } from '../behavior/needs';

export const WATER_POLICY = { contactMs: 3000, cooldownMs: 120_000 } as const;

/** A shallow pool: no enclosing collision walls or scripted movement targets. */
export function canReachWater(fly: FlyState, water: WorldObject) {
  return (
    water.type === 'water' &&
    !fly.death &&
    (!fly.body || fly.body.flight === 'ground') &&
    Math.abs(fly.position[1] - water.position[1] - 0.25) < 0.1 &&
    Math.hypot(fly.position[0] - water.position[0], fly.position[2] - water.position[2]) <
      water.radius + 0.35
  );
}

export function readyToDrink(fly: FlyState, now: number) {
  return (
    !fly.death &&
    (fly.energy <= 0 || needsOf(fly).hydration <= NEEDS_POLICY.drinkThreshold) &&
    now - (fly.lastDrankAt ?? -Infinity) >= WATER_POLICY.cooldownMs
  );
}
