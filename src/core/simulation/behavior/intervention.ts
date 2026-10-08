import type { BodyPose, FlyState, Vec3, WorldObject } from '../protocol/index';
import type { Purchase } from '../protocol/shop';
import { constrain, distance, supportAt } from '../world/index';
import { wantsFood } from './needs';
import { readyToDrink } from '../world/water';

/** Explicit purchased choreography, separate from the neural controller. Uses swept collisions. */
export function stepIntervention(
  fly: FlyState,
  p: Purchase,
  objects: WorldObject[],
  now: number,
  dt: number,
) {
  if (dt <= 0 || fly.death) return;
  const t = Math.max(0, (now - p.startedAt) / 1000),
    remaining = (p.endsAt - now) / 1000;
  const pose: BodyPose = {
    behavior: 'WALK',
    flight: 'ground',
    phase: t * 5,
    intensity: 0.8,
    groomingTarget: (['legs', 'antennae', 'wings'] as const)[Math.floor(t / 5) % 3],
    legs: 0.8,
    wings: 0.1,
    headYaw: Math.sin(t * 3) * 0.3,
    headPitch: 0,
    antennaLeft: 0.3,
    antennaRight: 0.3,
    proboscis: 0,
    pitch: 0,
    roll: 0,
  };
  let goal: Vec3 = [...p.target];
  const grounded = fly.position[1] <= supportAt(fly.position, objects).height + 0.07;
  if (p.code === 'dance' || p.code === 'groom') {
    goal =
      p.code === 'dance'
        ? [p.origin[0] + Math.sin(t * 3) * 0.3, p.target[1], p.origin[2] + Math.cos(t * 3) * 0.3]
        : [...p.target];
    pose.behavior = p.code === 'groom' && grounded ? 'GROOM' : 'WALK';
    pose.wings = p.code === 'dance' ? 0.4 + Math.sin(t * 8) * 0.3 : 0.2;
  } else {
    const horizontal = Math.hypot(goal[0] - fly.position[0], goal[2] - fly.position[2]);
    if (p.code === 'acrobatics' && remaining > 7)
      goal = [
        p.origin[0] + Math.sin(t * 0.9) * 2,
        Math.min(5, p.origin[1] + 2.5 + Math.sin(t) * 0.6),
        p.origin[2] + Math.cos(t * 0.9) * 2,
      ];
    else if (remaining <= 6) goal = [fly.position[0], 0.25, fly.position[2]];
    else if (horizontal > 0.6) {
      // Climb before crossing scenery; descend only at the clear destination.
      goal[1] = 4.8;
      if (fly.position[1] < 4.5) {
        goal[0] = fly.position[0];
        goal[2] = fly.position[2];
      }
    }
    if (!grounded || goal[1] > fly.position[1] + 0.1) {
      pose.flight = goal[1] < fly.position[1] - 0.1 ? 'landing' : 'airborne';
      pose.behavior = pose.flight === 'landing' ? 'LAND' : 'FLIGHT';
      pose.wings = 1;
      pose.roll = p.code === 'acrobatics' ? Math.sin(t) * 0.6 : 0;
    } else if (horizontal < 0.65) {
      pose.behavior =
        (p.code === 'eat' && wantsFood(fly)) || (p.code === 'drink' && readyToDrink(fly, now))
          ? 'FEED'
          : 'IDLE';
      pose.proboscis = pose.behavior === 'FEED' ? 0.85 : 0;
      pose.legs = 0;
    }
  }
  const d = distance(goal, fly.position),
    speed = pose.flight === 'ground' ? 1.2 : 2.8;
  const amount = Math.min(1, (speed * dt) / Math.max(d, 0.001));
  const next = fly.position.map((n, i) => n + (goal[i] - n) * amount) as Vec3;
  const position = constrain(next, fly.position, objects);
  fly.velocity = position.map((n, i) => (n - fly.position[i]) / dt) as Vec3;
  const yaw =
    p.code === 'dance'
      ? t * 3
      : Math.hypot(fly.velocity[0], fly.velocity[2]) > 0.01
        ? Math.atan2(fly.velocity[0], fly.velocity[2])
        : 2 * Math.atan2(fly.rotation[1], fly.rotation[3]);
  fly.rotation = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  fly.position = position;
  fly.body = pose;
}
