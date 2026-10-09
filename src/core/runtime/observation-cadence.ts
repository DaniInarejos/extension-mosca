import type { FlyState } from '../simulation/protocol/index';

/** Preserve transitions without broadcasting unchanged resting poses. */
export class ObservationCadence {
  private lastAt = -Infinity;
  private flight?: string;
  private behavior?: string;
  private position?: number[];
  due(fly: FlyState, now: number) {
    const transition = this.flight !== fly.body?.flight || this.behavior !== fly.body?.behavior;
    const moving =
      !this.position ||
      fly.position.some((v, i) => Math.abs(v - this.position![i]) > 0.00001) ||
      Math.hypot(...fly.velocity) > 0.01;
    const interval = transition ? 60 : moving ? 750 : 1000;
    if (now - this.lastAt < interval) return false;
    this.lastAt = now;
    this.flight = fly.body?.flight;
    this.behavior = fly.body?.behavior;
    this.position = [...fly.position];
    return true;
  }
}
