import type {
  FlyStatePatch,
  SimulationLease,
  VolunteerState,
  WorldState,
} from './simulation/protocol/index';
import { MotorBehavior } from './simulation/behavior/index';
import { advanceLocalFly } from './simulation/physics/local-step';
import type { Brain, BrainFactory, Clock } from './ports';

const SEND_INTERVAL_MS = 750;
const HEARTBEAT_INTERVAL_MS = 10_000;

type VolunteerMessage =
  | { type: 'VOLUNTEER_CAPACITY'; capacity: number }
  | { type: 'VOLUNTEER_STATES'; states: VolunteerState[] };

type Runtime = {
  lease: SimulationLease;
  fly: SimulationLease['fly'];
  behavior: MotorBehavior;
  brain: Brain;
  ready: boolean;
  pendingAction?: 'FEED' | 'DRINK';
  lastFeed: number;
};

/** Copied from the web client for the extension 0.1; no shared package dependency. */
export class VolunteerBrains {
  readonly enabled: boolean;
  private runtimes = new Map<string, Runtime>();
  private startupQueue = Promise.resolve();
  private lastSend = 0;
  private lastHeartbeat = 0;
  private announcedCapacity = -1;

  constructor(
    private send: (message: VolunteerMessage) => void,
    private createBrain: BrainFactory,
    readonly supportedCapacity: number,
    private clock: Clock,
  ) {
    this.enabled = supportedCapacity > 0;
  }

  announce(force = false) {
    const capacity = this.enabled ? this.supportedCapacity : 0;
    if (force || capacity !== this.announcedCapacity) {
      this.send({ type: 'VOLUNTEER_CAPACITY', capacity });
      this.announcedCapacity = capacity;
      this.lastHeartbeat = this.clock.now();
    }
  }

  sync(leases: SimulationLease[], world: WorldState) {
    const incoming = new Set(leases.map((lease) => lease.leaseId));
    for (const [leaseId, runtime] of this.runtimes)
      if (!incoming.has(leaseId)) {
        runtime.brain.dispose();
        this.runtimes.delete(leaseId);
      }
    if (!this.enabled) {
      this.clear();
      this.announce(true);
      return;
    }
    for (const lease of leases) {
      const current = this.runtimes.get(lease.leaseId);
      if (current) {
        current.lease = lease;
        current.fly.needs = structuredClone(lease.fly.needs);
        current.fly.energy = lease.fly.energy;
        current.fly.intent = structuredClone(lease.fly.intent);
        current.fly.habitatMemory = structuredClone(lease.fly.habitatMemory);
        current.fly.intervention = structuredClone(lease.fly.intervention);
        current.fly.death = structuredClone(lease.fly.death);
        continue;
      }
      const runtime: Runtime = {
        lease,
        fly: structuredClone(lease.fly),
        behavior: new MotorBehavior(lease.fly.flyId),
        brain: this.createBrain(lease.tickRate),
        ready: false,
        lastFeed: 0,
      };
      runtime.behavior.reconcile(runtime.fly, world.objects);
      this.runtimes.set(lease.leaseId, runtime);
      // Start sequentially so extra brains never create a burst of CPU and memory
      // that could affect the owner's animation.
      this.startupQueue = this.startupQueue.then(async () => {
        if (!this.runtimes.has(lease.leaseId)) return;
        try {
          await runtime.brain.initialize();
          if (this.runtimes.has(lease.leaseId)) runtime.ready = true;
          else runtime.brain.dispose();
        } catch {
          runtime.brain.dispose();
          this.runtimes.delete(lease.leaseId);
          this.reduceCapacity();
        }
      });
    }
  }

  revoke(leaseId: string) {
    const runtime = this.runtimes.get(leaseId);
    runtime?.brain.dispose();
    this.runtimes.delete(leaseId);
  }

  updateControl(patches: FlyStatePatch[]) {
    for (const patch of patches) {
      for (const runtime of this.runtimes.values()) {
        if (runtime.fly.flyId !== patch.flyId) continue;
        Object.assign(runtime.fly, structuredClone(patch.set));
        for (const key of patch.unset ?? [])
          delete (runtime.fly as unknown as Record<string, unknown>)[key];
      }
    }
  }

  frame(now: number, elapsed: number, world: WorldState) {
    if (!this.enabled) return;
    if (now - this.lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      this.send({
        type: 'VOLUNTEER_CAPACITY',
        capacity: this.announcedCapacity,
      });
      this.lastHeartbeat = now;
    }
    for (const runtime of this.runtimes.values()) {
      if (!runtime.ready || runtime.fly.death || runtime.fly.intervention) continue;
      const result = advanceLocalFly(
        world,
        runtime.fly,
        runtime.behavior,
        (sensory, dt) => runtime.brain.step(sensory, dt),
        Math.min(elapsed, 0.1),
      );
      if (
        result.sensory &&
        result.motor &&
        result.sensory.taste > 0 &&
        result.motor.feed > 0.2 &&
        now - runtime.lastFeed > 1000
      ) {
        runtime.pendingAction =
          (result.sensory.waterTaste ?? 0) > (result.sensory.foodTaste ?? 0) ? 'DRINK' : 'FEED';
        runtime.lastFeed = now;
      }
    }
    if (now - this.lastSend < SEND_INTERVAL_MS) return;
    const timestamp = this.clock.timestamp();
    const states: VolunteerState[] = [];
    for (const runtime of this.runtimes.values()) {
      if (!runtime.ready) continue;
      states.push({
        leaseId: runtime.lease.leaseId,
        epoch: runtime.lease.epoch,
        flyId: runtime.fly.flyId,
        position: runtime.fly.position,
        velocity: runtime.fly.velocity,
        rotation: runtime.fly.rotation,
        body: runtime.fly.body,
        timestamp,
        ...(runtime.pendingAction ? { action: runtime.pendingAction } : {}),
      });
      delete runtime.pendingAction;
    }
    if (states.length) this.send({ type: 'VOLUNTEER_STATES', states });
    this.lastSend = now;
    const slowest = Math.max(
      0,
      ...[...this.runtimes.values()]
        .filter((runtime) => runtime.ready)
        .map((runtime) => runtime.brain.getActivity().tickMs),
    );
    if (slowest > 120 && this.announcedCapacity > 1) this.reduceCapacity();
  }

  clear() {
    for (const runtime of this.runtimes.values()) runtime.brain.dispose();
    this.runtimes.clear();
  }

  private reduceCapacity() {
    this.announcedCapacity = Math.max(0, this.announcedCapacity - 1);
    this.send({ type: 'VOLUNTEER_CAPACITY', capacity: this.announcedCapacity });
  }
}
