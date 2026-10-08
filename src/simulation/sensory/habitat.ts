import type { FlyState, Vec3, WorldObject } from '../protocol/index';
import { needsOf } from '../behavior/needs';
import { circadianProfile } from '../behavior/circadian';
import { yawOf } from '../physics/index';
import { distance } from '../world/index';

const fresh = (updatedAt: number | undefined, now: number, maxAge: number) =>
  updatedAt !== undefined && now - updatedAt <= maxAge;

function bilateral(fly: FlyState, target: Vec3, strength: number) {
  const bearing =
    Math.atan2(target[0] - fly.position[0], target[2] - fly.position[2]) - yawOf(fly.rotation);
  const right = 0.5 + Math.sin(bearing) * 0.5;
  return { left: strength * (1 - right), right: strength * right };
}

/** A weak preference signal from remembered resources and suitable resting surfaces. */
export function habitatCue(fly: FlyState, objects: readonly WorldObject[], now: number) {
  const memory = fly.habitatMemory;
  const needs = needsOf(fly);
  const rhythm = circadianProfile(fly, now);
  let target: Vec3 | undefined;
  let strength = 0;
  let heightPreference = rhythm.wakefulness * 0.55;

  if (
    needs.hydration < 55 &&
    memory?.water &&
    fresh(memory.water.updatedAt, now, 6 * 60 * 60_000)
  ) {
    target = memory.water.position;
    strength = 0.12 + (1 - needs.hydration / 100) * 0.16;
  } else if (needs.hunger < 55 && memory?.food && fresh(memory.food.updatedAt, now, 60 * 60_000)) {
    target = memory.food.position;
    strength = 0.1 + (1 - needs.hunger / 100) * 0.16;
  } else if (rhythm.resting) {
    const remembered = memory?.rest;
    if (remembered && fresh(remembered.updatedAt, now, 12 * 60 * 60_000))
      target = remembered.position;
    else {
      let best = Infinity;
      for (const object of objects) {
        if (object.type !== 'perch') continue;
        const score = distance(fly.position, object.position) - (object.height ?? 0) * 0.5;
        if (score < best) {
          best = score;
          target = object.position;
        }
      }
    }
    strength = 0.06 + rhythm.sleepPressure * 0.08;
    heightPreference = 0.25;
  }

  let left = 0,
    right = 0;
  if (target) ({ left, right } = bilateral(fly, target, strength));
  if (memory?.danger && fresh(memory.danger.updatedAt, now, 10 * 60_000)) {
    const d = distance(fly.position, memory.danger.position);
    if (d < 7) {
      const away = bilateral(fly, memory.danger.position, Math.max(0, 1 - d / 7) * 0.12);
      left += away.right;
      right += away.left;
    }
  }
  return { left: Math.min(0.3, left), right: Math.min(0.3, right), heightPreference };
}

/** Coarse local illumination: dense vegetation casts shade without expensive ray casting. */
export function localLight(position: Vec3, objects: readonly WorldObject[], ambient: number) {
  let shade = 0;
  for (const object of objects) {
    if (object.type !== 'bush' && object.type !== 'trunk') continue;
    const d = Math.hypot(position[0] - object.position[0], position[2] - object.position[2]);
    shade = Math.max(shade, Math.max(0, 1 - d / (object.radius + 1.5)));
  }
  return Math.max(0, Math.min(1, ambient * (1 - shade * 0.55)));
}
