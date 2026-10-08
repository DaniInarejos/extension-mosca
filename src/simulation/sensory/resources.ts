import type { FlyState, Vec3, WorldObject } from '../protocol/index';
import { needsOf, wantsFood } from '../behavior/needs';
import { readyToDrink } from '../world/water';
import { BOUNDS, distance } from '../world/index';
import { windAt } from '../world/environment';

/** Needs amplify resource gradients, never choose a destination or supply a motor command. */
export function resourceCueAt(p: Vec3, objects: WorldObject[], fly: FlyState, now: number) {
  const needs = needsOf(fly),
    critical = fly.energy <= 0,
    h = Math.max(critical ? 0.75 : 0, 1 - needs.hunger / 100),
    t = Math.max(critical ? 0.75 : 0, 1 - needs.hydration / 100);
  const habitatScale = Math.sqrt(BOUNDS.max / 18);
  const foodGain = wantsFood(fly) ? (0.12 + 1.8 * h * h) / (1 + t * t) : 0;
  const waterGain = readyToDrink(fly, now) ? (0.12 + 1.8 * t * t) / (1 + h * h) : 0;
  let sum = 0;
  const wind = windAt(now);
  for (const o of objects) {
    if (o.type === 'food' && (o.amount ?? 0) > 0) {
      // Sample the plume at the body centre so both antennae keep a trustworthy
      // local gradient while the overall scent waxes and wanes with the wind.
      const dx = fly.position[0] - o.position[0],
        dz = fly.position[2] - o.position[2];
      const downwind = dx * wind.x + dz * wind.z;
      const crosswind = Math.abs(dx * wind.z - dz * wind.x);
      const plume = Math.max(
        0.78,
        Math.min(
          1.18,
          0.94 +
            Math.max(-0.08, Math.min(0.12, downwind * 0.018)) -
            Math.min(0.08, crosswind * 0.008) +
            0.06 * Math.sin(now / 1800 + downwind * 2.1),
        ),
      );
      sum +=
        foodGain *
        Math.exp(-distance(p, o.position) / ((3 + h * 4) * habitatScale)) *
        (0.2 + 0.8 * Math.min(1, o.amount! / (o.initialAmount ?? 500))) *
        plume;
    } else if (o.type === 'water')
      sum +=
        waterGain *
        Math.exp(-Math.max(0, distance(p, o.position) - o.radius) / ((2 + t * 4) * habitatScale));
  }
  // Smooth saturation preserves bilateral differences in a resource-rich area.
  return sum / (1 + sum);
}
