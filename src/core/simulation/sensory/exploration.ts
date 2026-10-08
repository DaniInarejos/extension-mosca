import type { FlyState, Vec3 } from '../protocol/index';
import { BOUNDS } from '../world/index';
import { yawOf } from '../physics/index';
import { personalityOf } from '../behavior/personality';

function identityPhase(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

/** A cheap, continuous and identity-specific roaming focus. It never issues a motor command. */
export function explorationTarget(fly: Pick<FlyState, 'flyId'>, timestamp: number): Vec3 {
  const identity = identityPhase(fly.flyId);
  const time = timestamp / 190_000;
  const extent = (BOUNDS.max - 2) * 0.78;
  return [
    Math.sin(time + identity) * extent,
    BOUNDS.floor,
    Math.sin(time * 0.73 + identity * 1.61) * extent,
  ];
}

/** Weak bilateral novelty cue; needs and threats remain stronger inputs. */
export function explorationCue(fly: FlyState, timestamp: number) {
  const personality = personalityOf(fly);
  const target = explorationTarget(fly, timestamp);
  const dx = target[0] - fly.position[0],
    dz = target[2] - fly.position[2],
    distance = Math.hypot(dx, dz),
    bearing = Math.atan2(dx, dz) - yawOf(fly.rotation),
    strength =
      (0.055 + Math.min(1, distance / 12) * 0.075) *
      (0.78 + personality.curiosity * 0.32 + personality.activity * 0.08),
    right = 0.5 + Math.sin(bearing) * 0.5;
  return { left: strength * (1 - right), right: strength * right, target };
}
