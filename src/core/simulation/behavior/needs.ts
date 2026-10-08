import type { FlyState } from '../protocol/index';

/** Game pacing, not biological units. Both values are satisfaction reserves. */
export const NEEDS_POLICY = {
  // The legacy `hunger` field now stores food satisfaction: 0 is empty and
  // 100 is fully fed. Hydration follows the same 0–100 scale.
  initialHunger: 80,
  initialHydration: 80,
  foodLossPerMinute: 1.2,
  hydrationPerMinute: 1.8,
  mealGain: 18,
  drinkRelief: 55,
  eatThreshold: 25,
  drinkThreshold: 35,
} as const;
const bounded = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
export function needsOf(fly: Pick<FlyState, 'needs'>) {
  return {
    hunger: bounded(fly.needs?.hunger ?? NEEDS_POLICY.initialHunger, NEEDS_POLICY.initialHunger),
    hydration: bounded(
      fly.needs?.hydration ?? NEEDS_POLICY.initialHydration,
      NEEDS_POLICY.initialHydration,
    ),
  };
}
/** Food and hydration contribute exactly half of the visible energy each. */
export function energyFromNeeds(fly: Pick<FlyState, 'needs'>) {
  const needs = needsOf(fly);
  return (needs.hunger + needs.hydration) / 2;
}
export function syncEnergy(fly: Pick<FlyState, 'needs' | 'energy'>) {
  fly.energy = energyFromNeeds(fly);
  return fly.energy;
}
export function initializeNeeds(fly: FlyState, now: number) {
  const values = needsOf(fly);
  // Migrate saves written before food became a satisfaction reserve. Those
  // saves stored accumulated hunger, where a low value meant satisfaction.
  const hunger = fly.needs && fly.needs.scale !== 'food' ? 100 - values.hunger : values.hunger;
  fly.needs = {
    ...values,
    hunger,
    scale: 'food',
    updatedAt: Number.isFinite(fly.needs?.updatedAt) ? fly.needs!.updatedAt : now,
  };
  syncEnergy(fly);
}
/** Called only by authority. Independent clock prevents socket/tick double counting. */
export function advanceNeeds(fly: FlyState, now: number) {
  if (fly.death) return;
  if (!fly.needs || fly.needs.scale !== 'food') initializeNeeds(fly, now);
  const needs = fly.needs!;
  if (now <= needs.updatedAt) return;
  const minutes = Math.min(1440, (now - needs.updatedAt) / 60000);
  const effort =
    fly.connected && fly.body?.flight === 'airborne'
      ? 1.6
      : fly.connected && fly.body?.behavior === 'IDLE'
        ? 0.7
        : 1;
  needs.hunger = Math.max(0, needs.hunger - minutes * NEEDS_POLICY.foodLossPerMinute * effort);
  needs.hydration = Math.max(
    0,
    needs.hydration - minutes * NEEDS_POLICY.hydrationPerMinute * effort,
  );
  needs.updatedAt = now;
  syncEnergy(fly);
}
export function wantsFood(fly: Pick<FlyState, 'needs' | 'energy'>) {
  return fly.energy <= 0 || needsOf(fly).hunger <= NEEDS_POLICY.eatThreshold;
}
