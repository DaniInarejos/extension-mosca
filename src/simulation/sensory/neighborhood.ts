import type { FlyState, WorldState } from '../protocol/index';
import { yawOf } from '../physics/index';
import { distance, pathCollides } from '../world/index';

/** Observable proximity, feeding and air displacement; no destinations or motor commands. */
export function sampleNeighborhood(world: WorldState, fly: FlyState) {
  const yaw = yawOf(fly.rotation);
  let socialLeft = 0,
    socialRight = 0,
    socialContactLeft = 0,
    socialContactRight = 0;
  let socialNear = 0,
    disturbance = 0;
  for (const other of world.flies) {
    if (other.flyId === fly.flyId || other.death) continue;
    const d = distance(other.position, fly.position);
    if (d > 12) continue;
    const bearing =
      Math.atan2(other.position[0] - fly.position[0], other.position[2] - fly.position[2]) - yaw;
    const right = 0.5 + Math.sin(bearing) * 0.5,
      left = 1 - right;
    const movement = Math.min(1, Math.hypot(...other.velocity) / 0.6);
    const sharing = other.body?.behavior === 'FEED' || other.status === 'Alimentándose';
    const signal =
      Math.exp(-d / 3.25) *
      (1 + movement * 0.25 + (sharing ? 0.18 : 0)) *
      (0.75 + Math.cos(bearing) * 0.25);
    socialLeft += signal * left;
    socialRight += signal * right;
    const contact = Math.max(0, 1 - d / 0.8);
    socialContactLeft += contact * left;
    socialContactRight += contact * right;
    socialNear = Math.max(socialNear, Math.max(0, 1 - d / 1.8));
    if (other.body?.flight === 'landing' || other.body?.flight === 'preparing')
      disturbance = Math.max(disturbance, Math.max(0, 1 - d / 2.4));
    if (d < 2.8 && movement > 0.65)
      disturbance = Math.max(disturbance, (1 - d / 2.8) * movement * 0.75);
  }
  let dangerLeft = 0,
    dangerRight = 0;
  if (world.hunter && fly.position[1] < 2.5) {
    const hunter = world.hunter;
    const d = Math.hypot(
      hunter.position[0] - fly.position[0],
      hunter.position[2] - fly.position[2],
    );
    if (
      d < 5.5 &&
      !pathCollides(
        fly.position,
        [hunter.position[0], fly.position[1], hunter.position[2]],
        world.objects,
        0.02,
      )
    ) {
      const bearing =
        Math.atan2(hunter.position[0] - fly.position[0], hunter.position[2] - fly.position[2]) -
        yaw;
      const proximity =
        Math.pow(1 - d / 5.5, 1.2) * Math.max(0, 1 - (fly.position[1] - 0.25) / 2.25);
      dangerLeft = proximity * (0.5 - Math.sin(bearing) * 0.5);
      dangerRight = proximity * (0.5 + Math.sin(bearing) * 0.5);
      const closing =
        d > 0.001
          ? -(
              (hunter.velocity[0] * (hunter.position[0] - fly.position[0]) +
                hunter.velocity[2] * (hunter.position[2] - fly.position[2])) /
              d
            )
          : 0;
      if (d < 3.2 && (hunter.status === 'pouncing' || closing > 0.18))
        disturbance = Math.max(disturbance, Math.max(0, 1 - d / 3.2) * 0.95);
    }
  }
  return {
    socialLeft: Math.min(1, socialLeft),
    socialRight: Math.min(1, socialRight),
    socialContactLeft: Math.min(1, socialContactLeft),
    socialContactRight: Math.min(1, socialContactRight),
    socialNear,
    disturbance,
    dangerLeft,
    dangerRight,
  };
}
