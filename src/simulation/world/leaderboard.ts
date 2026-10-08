import type { FlyState } from '../protocol/index';

export interface LifeRecord {
  flyId: string;
  name: string;
  lifetimeSeconds: number;
  diedAt: number;
  cause: NonNullable<FlyState['death']>['cause'];
}
/** Only completed lives; retain five records without sorting or copying the whole world. */
export function longestLives(flies: readonly FlyState[]): LifeRecord[] {
  const best: LifeRecord[] = [];
  for (const fly of flies) {
    if (
      !fly.death ||
      !Number.isFinite(fly.createdAt) ||
      !Number.isFinite(fly.death.at) ||
      fly.death.at < fly.createdAt
    )
      continue;
    const row: LifeRecord = {
      flyId: fly.flyId,
      name: fly.name,
      lifetimeSeconds: (fly.death.at - fly.createdAt) / 1000,
      diedAt: fly.death.at,
      cause: fly.death.cause,
    };
    const index = best.findIndex(
      (other) =>
        row.lifetimeSeconds > other.lifetimeSeconds ||
        (row.lifetimeSeconds === other.lifetimeSeconds &&
          (row.diedAt < other.diedAt || (row.diedAt === other.diedAt && row.flyId < other.flyId))),
    );
    if (index >= 0) best.splice(index, 0, row);
    else if (best.length < 5) best.push(row);
    if (best.length > 5) best.pop();
  }
  return best;
}
