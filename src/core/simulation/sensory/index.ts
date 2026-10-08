import type { FlyState, SensoryInput, Vec3, WorldState } from '../protocol/index';
import { BOUNDS, distance, solidRadius, foodScale } from '../world/index';
import { yawOf } from '../physics/index';
import { environmentAt, windAt } from '../world/environment';
import { sampleNeighborhood } from './neighborhood';
import { canReachWater, readyToDrink } from '../world/water';
import { needsOf, wantsFood } from '../behavior/needs';
import { resourceCueAt } from './resources';
import { explorationCue } from './exploration';
import { circadianProfile } from '../behavior/circadian';
import { habitatCue, localLight } from './habitat';
import { personalityOf } from '../behavior/personality';
import { intentTarget } from '../behavior/motivation';
export function sampleSensory(world: WorldState, fly: FlyState): SensoryInput {
  const yaw = yawOf(fly.rotation);
  const personality = personalityOf(fly);
  const rhythm = circadianProfile(fly, world.timestamp);
  const environment = environmentAt(world.timestamp);
  const breeze = windAt(world.timestamp);
  const thirsty = readyToDrink(fly, world.timestamp);
  const others = world.flies.filter((f) => f.flyId !== fly.flyId && !f.death);
  const antenna = (side: number): Vec3 => [
    fly.position[0] + Math.sin(yaw + side * 0.65) * 0.4,
    fly.position[1],
    fly.position[2] + Math.cos(yaw + side * 0.65) * 0.4,
  ];
  const odor = (p: Vec3) => resourceCueAt(p, world.objects, fly, world.timestamp);
  const cueLeft = odor(antenna(-1)),
    cueRight = odor(antenna(1));
  const exploring =
    !wantsFood(fly) && !thirsty ? explorationCue(fly, world.timestamp) : { left: 0, right: 0 };
  const motivationTarget =
    fly.intent?.stage === 'travel' && ['explore', 'socialize'].includes(fly.intent.kind)
      ? intentTarget(fly.intent, world)
      : undefined;
  if (motivationTarget) {
    const bearing =
        Math.atan2(motivationTarget[0] - fly.position[0], motivationTarget[2] - fly.position[2]) -
        yaw,
      right = 0.5 + Math.sin(bearing) * 0.5,
      strength = 0.08 + personality.activity * 0.05;
    exploring.left += strength * (1 - right);
    exploring.right += strength * right;
  }
  exploring.left *= rhythm.wakefulness;
  exploring.right *= rhythm.wakefulness;
  const habitat = habitatCue(fly, world.objects, world.timestamp);
  const lightSample = (side: number) => localLight(antenna(side), world.objects, environment.light);
  const lightLeft = lightSample(-1),
    lightRight = lightSample(1);
  const forwardX = Math.sin(yaw),
    forwardZ = Math.cos(yaw);
  const crosswind = forwardX * breeze.z - forwardZ * breeze.x;
  const meanCue = (cueLeft + cueRight) / 2;
  // Antennae are very close relative to the garden. Amplify their local contrast
  // before neural propagation; this does not inspect a target or set a turn.
  const contrast = (cueRight - cueLeft) * 3;
  const foodTaste =
    wantsFood(fly) &&
    world.objects.some(
      (o) =>
        o.type === 'food' &&
        (o.amount ?? 0) > 0 &&
        distance(fly.position, o.position) < o.radius * foodScale(o) + 0.4,
    )
      ? 1
      : 0;
  const waterTaste = thirsty && world.objects.some((o) => canReachWater(fly, o)) ? 1 : 0;
  const eye = (side: number) => {
    let intensity = 0.15;
    for (const offset of [-0.25, 0, 0.25]) {
      const direction = yaw + side * 0.5 + offset;
      for (let ahead = 0.3; ahead <= 3; ahead += 0.3) {
        const x = fly.position[0] + Math.sin(direction) * ahead,
          z = fly.position[2] + Math.cos(direction) * ahead;
        const blocked =
          Math.abs(x) > BOUNDS.max ||
          Math.abs(z) > BOUNDS.max ||
          (world.hunter !== undefined &&
            fly.position[1] < 1.25 &&
            Math.hypot(x - world.hunter.position[0], z - world.hunter.position[2]) < 0.85) ||
          others.some(
            (other) =>
              Math.hypot(x - other.position[0], z - other.position[2]) < 0.3 &&
              Math.abs(fly.position[1] - other.position[1]) < 0.4,
          ) ||
          world.objects.some(
            (o) =>
              (o.type === 'rock' ||
                o.type === 'bush' ||
                o.type === 'perch' ||
                o.type === 'trunk') &&
              solidRadius(o, fly.position[1]) > 0 &&
              Math.hypot(x - o.position[0], z - o.position[2]) <
                solidRadius(o, fly.position[1]) + 0.1,
          );
        if (blocked) {
          intensity = Math.max(intensity, 1 - ahead / 3);
          break;
        }
      }
    }
    return intensity;
  };
  const touch =
    (world.hunter !== undefined &&
      fly.position[1] < 1.25 &&
      Math.hypot(
        fly.position[0] - world.hunter.position[0],
        fly.position[2] - world.hunter.position[2],
      ) < 1) ||
    others.some((other) => distance(fly.position, other.position) < 0.45) ||
    world.objects.some(
      (o) =>
        (o.type === 'rock' || o.type === 'bush' || o.type === 'perch' || o.type === 'trunk') &&
        solidRadius(o, fly.position[1]) > 0 &&
        Math.hypot(fly.position[0] - o.position[0], fly.position[2] - o.position[2]) <
          solidRadius(o, fly.position[1]) + 0.15,
    ) ||
    Math.abs(fly.position[0]) > BOUNDS.max - 0.4 ||
    Math.abs(fly.position[2]) > BOUNDS.max - 0.4;
  const weather =
    world.gardenEvent && world.timestamp < world.gardenEvent.endsAt
      ? world.gardenEvent
      : world.naturalEvent && world.timestamp < world.naturalEvent.endsAt
        ? world.naturalEvent
        : undefined;
  const neighborhood = sampleNeighborhood(world, fly);
  const socialGain = 0.55 + personality.sociability * 0.9;
  const dangerGain = 1.08 - personality.boldness * 0.18;
  return {
    visionLeft: eye(-1),
    visionRight: eye(1),
    odorLeft: Math.max(0, Math.min(1, meanCue - contrast / 2)),
    odorRight: Math.max(0, Math.min(1, meanCue + contrast / 2)),
    explorationLeft: exploring.left,
    explorationRight: exploring.right,
    habitatLeft: habitat.left,
    habitatRight: habitat.right,
    touch: touch ? 1 : 0,
    taste: Math.max(foodTaste, waterTaste),
    foodTaste,
    waterTaste,
    // The neural input is a need drive, so invert the visible food reserve.
    hunger: 1 - needsOf(fly).hunger / 100,
    ...environment,
    lightLeft,
    lightRight,
    windLeft: Math.max(0, crosswind) * breeze.strength,
    windRight: Math.max(0, -crosswind) * breeze.strength,
    sleepPressure: rhythm.sleepPressure,
    wakefulness: rhythm.wakefulness,
    heightPreference: habitat.heightPreference,
    ...(weather && ['wind', 'rain'].includes(weather.code) ? { wind: 0.8 } : {}),
    ...neighborhood,
    socialLeft: Math.min(1, neighborhood.socialLeft * socialGain),
    socialRight: Math.min(1, neighborhood.socialRight * socialGain),
    socialContactLeft: Math.min(1, neighborhood.socialContactLeft * socialGain),
    socialContactRight: Math.min(1, neighborhood.socialContactRight * socialGain),
    dangerLeft: Math.min(1, neighborhood.dangerLeft * dangerGain),
    dangerRight: Math.min(1, neighborhood.dangerRight * dangerGain),
  };
}
