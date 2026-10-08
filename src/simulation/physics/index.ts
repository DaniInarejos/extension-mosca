import type { BodyMotorOutput, FlyState, MotorOutput, Vec3, WorldObject } from '../protocol/index';
import { constrain, distance, recoverPosition, supportAt, MAX_SPEED } from '../world/index';
export function integrateBody(
  fly: FlyState,
  motor: MotorOutput,
  dt: number,
  objects: WorldObject[],
) {
  const recovered = recoverPosition(fly.position, objects);
  if (distance(recovered, fly.position) > 0.00001) {
    fly.position = recovered;
    fly.velocity = [0, 0, 0];
  }
  const yaw = yawOf(fly.rotation) + motor.turn * dt * 2.2;
  const rich = 'pose' in motor ? (motor as BodyMotorOutput) : undefined;
  const speed =
    Math.min(MAX_SPEED, motor.forward * 2.1) *
    Math.pow(1 - motor.feed, 3) *
    (1 - (rich?.brake ?? 0));
  const desired: Vec3 = [
    Math.sin(yaw) * speed + Math.cos(yaw) * (rich?.lateral ?? 0),
    rich?.pose.flight === 'airborne' || rich?.pose.flight === 'landing'
      ? motor.lift * 1.5
      : fly.position[1] > supportAt(fly.position, objects).height + 0.002
        ? -0.45
        : 0,
    Math.cos(yaw) * speed - Math.sin(yaw) * (rich?.lateral ?? 0),
  ];
  const blend = 1 - Math.exp(-dt * 4);
  const v = fly.velocity.map((n, i) => n + (desired[i] - n) * blend) as Vec3;
  const next = fly.position.map((n, i) => n + v[i] * dt) as Vec3;
  const p = constrain(next, fly.position, objects);
  fly.velocity = p.map((n, i) => (n - fly.position[i]) / dt) as Vec3;
  fly.position = p;
  if (
    rich &&
    ['ground', 'preparing'].includes(rich.pose.flight) &&
    p[1] > supportAt(p, objects).height + 0.05
  ) {
    rich.pose.behavior = 'LAND';
    rich.pose.flight = 'landing';
  }
  const pitch = (rich?.pose.pitch ?? 0) * 0.35,
    roll = (rich?.pose.roll ?? 0) * 0.45;
  const c1 = Math.cos(pitch / 2),
    c2 = Math.cos(yaw / 2),
    c3 = Math.cos(roll / 2),
    s1 = Math.sin(pitch / 2),
    s2 = Math.sin(yaw / 2),
    s3 = Math.sin(roll / 2);
  fly.rotation = [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}
export function yawOf(q: FlyState['rotation']) {
  return Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));
}
