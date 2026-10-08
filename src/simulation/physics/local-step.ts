import type {
  BodyMotorOutput,
  FlyState,
  MotorOutput,
  SensoryInput,
  WorldState,
  Vec3,
} from '../protocol/index';
import type { MotorBehavior } from '../behavior/index';
import { sampleSensory } from '../sensory/index';
import { integrateBody } from './index';
import { yawOf } from './index';
import { distance } from '../world/index';

/** Fixed physical substeps keep body time consistent on slower renderers.
 * Neural execution remains in its Worker; only the latest motor reading is consumed.
 */
export function advanceLocalFly(
  world: WorldState,
  fly: FlyState,
  behavior: MotorBehavior,
  readNeural: (input: SensoryInput, dt: number) => MotorOutput,
  elapsed: number,
  onStep?: (position: Vec3) => void,
) {
  let remaining = Math.max(0, Math.min(0.5, elapsed));
  let motor: BodyMotorOutput | undefined, sensory: SensoryInput | undefined;
  while (remaining > 1e-8) {
    const dt = Math.min(1 / 60, remaining);
    sensory = behavior.modulateSensory(sampleSensory(world, fly));
    motor = behavior.step(readNeural(sensory, dt), fly, dt, world.objects);
    const weather =
      world.gardenEvent && world.timestamp < world.gardenEvent.endsAt
        ? world.gardenEvent
        : world.naturalEvent && world.timestamp < world.naturalEvent.endsAt
          ? world.naturalEvent
          : undefined;
    // Shared weather is an external condition, not a neural achievement.
    if (
      weather?.code === 'rain' &&
      Math.max(sensory.dangerLeft ?? 0, sensory.dangerRight ?? 0) < 0.3
    ) {
      let shelter: (typeof world.objects)[number] | undefined,
        nearest = Infinity;
      for (const o of world.objects)
        if (o.type === 'bush') {
          const d = distance(o.position, fly.position);
          if (d < nearest) {
            nearest = d;
            shelter = o;
          }
        }
      if (shelter) {
        const yaw = yawOf(fly.rotation),
          desired = Math.atan2(
            shelter.position[0] - fly.position[0],
            shelter.position[2] - fly.position[2],
          );
        motor.turn = Math.max(
          -1,
          Math.min(1, Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw))),
        );
        motor.forward = nearest > shelter.radius + 0.6 ? 0.5 : 0;
        motor.feed = 0;
        motor.brake = 0;
        motor.lateral = 0;
        if (motor.pose.flight === 'airborne' || motor.pose.flight === 'landing') {
          motor.lift = -0.4;
          motor.pose.flight = 'landing';
          motor.pose.behavior = 'LAND';
        } else {
          motor.pose.flight = 'ground';
          motor.pose.behavior = motor.forward ? 'WALK' : 'IDLE';
          motor.pose.legs = motor.forward ? 0.7 : 0;
          motor.pose.proboscis = 0;
        }
      }
    }
    integrateBody(fly, motor, dt, world.objects);
    onStep?.([...fly.position]);
    remaining -= dt;
  }
  return { motor, sensory };
}
