import { GardenStream } from './runtime/garden-stream';
import { ObservationCadence } from './runtime/observation-cadence';
import { MotorBehavior } from './simulation/behavior/index';
import { advanceLocalFly } from './simulation/physics/local-step';
import type { FlyState, ServerMessage, WorldState } from './simulation/protocol/index';
import type { RunnerConfig, FlySnapshot, RunnerStatus } from './types';
import type { Brain, CancelTimer, GardenConnection, RunnerDependencies } from './ports';
import { restingPose } from './simulation/behavior/index';
import { DEFAULT_APPEARANCE } from './simulation/protocol/appearance';
import { VolunteerBrains } from './volunteer';
import { DeviceResponseError } from './api/device-error';
import { MAX_RECONNECT_DELAY_MS, SERVER_SILENCE_TIMEOUT_MS, WELCOME_TIMEOUT_MS } from './connection-policy';

const FRAME_INTERVAL_MS = 1000 / 30;
const CONTROL_CHECK_INTERVAL_MS = 15_000;

export class MoskaRunner {
  private config?: RunnerConfig;
  private socket?: GardenConnection;
  private brain?: Brain;
  private behavior?: MotorBehavior;
  private volunteers?: VolunteerBrains;
  private world?: WorldState;
  private fly?: FlyState;
  private frameTimer?: CancelTimer;
  private reconnectTimer?: CancelTimer;
  private controlCheckTimer?: CancelTimer;
  private responseTimer?: CancelTimer;
  private request?: AbortController;
  private welcomed = false;
  private reconnectAttempt = 0;
  private lastFrame = 0;
  private stream = new GardenStream();
  private cadence = new ObservationCadence();
  private trace: FlyState['position'][] = [];
  private lastCheckpoint = 0;
  private lastFeed = 0;
  private pendingAction?: 'FEED' | 'DRINK';
  private generation = 0;

  constructor(private dependencies: RunnerDependencies) {}

  async start(config: RunnerConfig, resetReconnect = true) {
    this.stop(false, resetReconnect);
    this.config = config;
    const generation = ++this.generation;
    await this.report('connecting', 'Solicitando acceso al servidor…');
    if (generation !== this.generation) return;
    const request = this.request = new AbortController();
    try {
      const ticket = await this.dependencies.device.ticket(config, request.signal);
      if (generation !== this.generation) return;
      this.connect(ticket);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.report('error', error instanceof Error ? error.message : String(error));
      if (generation === this.generation) this.scheduleReconnect();
    } finally {
      if (this.request === request) this.request = undefined;
    }
  }

  stop(report = true, resetReconnect = true) {
    this.checkpoint();
    this.generation++;
    this.frameTimer?.();
    this.reconnectTimer?.();
    this.controlCheckTimer?.();
    this.responseTimer?.();
    this.request?.abort();
    this.request = undefined;
    this.frameTimer = undefined;
    this.reconnectTimer = undefined;
    this.controlCheckTimer = undefined;
    this.responseTimer = undefined;
    this.welcomed = false;
    const socket = this.socket;
    this.socket = undefined;
    this.config = undefined;
    socket?.close();
    this.brain?.dispose();
    this.brain = undefined;
    this.behavior = undefined;
    this.volunteers?.clear();
    this.volunteers = undefined;
    this.world = undefined;
    this.fly = undefined;
    this.pendingAction = undefined;
    this.stream = new GardenStream();
    this.cadence = new ObservationCadence();
    this.trace = [];
    this.lastFeed = this.lastCheckpoint = 0;
    if (resetReconnect) this.reconnectAttempt = 0;
    if (report) void this.report('idle', 'El cerebro está detenido.');
  }

  snapshot(): FlySnapshot | undefined {
    if (!this.fly) return;
    const pose = this.fly.body ?? restingPose();
    return {
      name: this.fly.name,
      energy: Math.max(0, Math.min(100, this.fly.energy)),
      status: this.fly.status,
      appearance: { ...DEFAULT_APPEARANCE, ...this.fly.appearance },
      pose: {
        behavior: pose.behavior,
        flight: pose.flight,
        phase: pose.phase,
        intensity: pose.intensity,
        groomingTarget: pose.groomingTarget,
        wings: pose.wings,
        antennaLeft: pose.antennaLeft,
        antennaRight: pose.antennaRight,
        proboscis: pose.proboscis,
        pitch: pose.pitch,
        roll: pose.roll,
      },
      updatedAt: this.dependencies.clock.timestamp(),
    };
  }

  private connect(ticket: string) {
    if (!this.config) return;
    const generation = this.generation;
    const current = () => generation === this.generation && this.socket === socket;
    const socket = this.dependencies.device.connect(this.config, ticket, {
      onOpen: () => {
        if (!current()) return;
        void this.report('loading', 'Conexión aceptada; cargando el conectoma…');
      },
      onMessage: async (message) => {
        if (!current()) return;
        if (message.type === 'WELCOME') this.welcomed = true;
        if (this.welcomed)
          this.watchResponse(SERVER_SILENCE_TIMEOUT_MS, 'El servidor dejó de responder; reconectando…');
        await this.message(message);
      },
      onError: (detail) => {
        if (current()) void this.report('error', detail);
      },
      onClose: (code) => {
        if (!current()) return;
        const config = this.config;
        const flyName = this.fly?.name;
        this.stop(false, false);
        this.config = config;
        if (this.config && (code === 4001 || code === 4002)) {
          const detail =
            code === 4002
              ? 'La web de moscas.lol está controlando tu mosca. Se retomará el cerebro al salir.'
              : 'Otra sesión está controlando tu mosca. Se esperará hasta que quede libre.';
          void this.report('paused', detail, flyName);
          this.scheduleControlCheck();
        } else if (this.config) {
          void this.report('connecting', 'Conexión interrumpida; reintentando…');
          this.scheduleReconnect();
        }
      },
    });
    this.socket = socket;
    this.watchResponse(WELCOME_TIMEOUT_MS, 'El servidor no inició la sesión; reconectando…');
  }

  private watchResponse(delay: number, detail: string) {
    this.responseTimer?.();
    const generation = this.generation;
    this.responseTimer = this.dependencies.clock.setTimeout(() => {
      if (generation !== this.generation || !this.config) return;
      const config = this.config;
      this.stop(false, false);
      this.config = config;
      void this.report('connecting', detail);
      this.scheduleReconnect();
    }, delay);
  }

  private async message(message: ServerMessage) {
    if (message.type === 'WELCOME') {
      this.world = this.stream.apply(message)!;
      this.fly = structuredClone(message.fly);
      this.behavior = new MotorBehavior(this.fly.flyId, this.fly.bodyMemory?.value);
      this.behavior.reconcile(this.fly, this.world.objects);
      this.volunteers = new VolunteerBrains(
        (outgoing) => {
          if (this.socket?.isOpen()) this.socket.send(outgoing);
        },
        this.dependencies.createBrain,
        this.dependencies.volunteerCapacity,
        this.dependencies.clock,
      );
      const brain = (this.brain = this.dependencies.createBrain(30));
      brain.onError = (detail) => {
        if (brain === this.brain) void this.report('error', detail);
      };
      await brain.initialize();
      if (brain !== this.brain || !this.fly) return;
      // No reiniciar el backoff por un handshake que nunca llega a una sesión utilizable.
      this.reconnectAttempt = 0;
      this.lastFrame = this.dependencies.clock.now();
      this.frameTimer = this.dependencies.clock.setInterval(() => this.frame(), FRAME_INTERVAL_MS);
      this.volunteers.announce(true);
      await this.report('online', 'Cerebro FlyWire activo y sincronizando.', this.fly.name);
      return;
    }
    if (
      message.type === 'WORLD_STATE' ||
      message.type === 'WORLD_DELTA' ||
      message.type === 'WORLD_FRAME'
    ) {
      this.world = this.stream.apply(message, this.fly)!;
      if (message.type === 'WORLD_FRAME') this.volunteers?.updateControl(message.control);
      const authoritative =
        this.fly && this.world.flies.find((fly) => fly.flyId === this.fly!.flyId);
      if (authoritative && this.fly) {
        const wasIntervention = Boolean(this.fly.intervention);
        if (wasIntervention || authoritative.intervention) {
          this.trace = [];
          this.fly.position = [...authoritative.position];
          this.fly.velocity = [...authoritative.velocity];
          this.fly.rotation = [...authoritative.rotation];
          this.fly.body = structuredClone(authoritative.body);
        }
        this.fly.energy = authoritative.energy;
        this.fly.needs = structuredClone(authoritative.needs);
        this.fly.intent = structuredClone(authoritative.intent);
        this.fly.habitatMemory = structuredClone(authoritative.habitatMemory);
        this.fly.intervention = structuredClone(authoritative.intervention);
        this.fly.death = structuredClone(authoritative.death);
        this.fly.status = authoritative.status;
        if (wasIntervention && !this.fly.intervention)
          this.behavior?.reconcile(this.fly, this.world.objects);
      }
      return;
    }
    if (message.type === 'SIMULATION_LEASES' && this.world)
      this.volunteers?.sync(message.leases, this.world);
    if (message.type === 'SIMULATION_LEASE_REVOKED') this.volunteers?.revoke(message.leaseId);
    if (message.type === 'CORRECTION' && this.fly && message.fly.flyId === this.fly.flyId) {
      this.trace = [];
      this.fly = structuredClone(message.fly);
      this.behavior?.reconcile(this.fly, this.world?.objects ?? []);
      return;
    }
    if (message.type === 'ERROR') await this.report('error', message.message, this.fly?.name);
  }

  private frame() {
    if (!this.world || !this.fly || !this.behavior || !this.brain || this.fly.death) return;
    const now = this.dependencies.clock.now();
    const elapsed = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.volunteers?.frame(now, elapsed, this.world);
    if (this.fly.intervention) return;
    const result = advanceLocalFly(
      this.world,
      this.fly,
      this.behavior,
      (sensory, dt) => this.brain!.step(sensory, dt),
      elapsed,
      (position) => {
        this.trace.push(position);
        if (this.trace.length > 16)
          this.trace = this.trace.filter((_, i) => i % 2 === 0 || i === this.trace.length - 1);
      },
    );
    if (
      result.sensory &&
      result.motor &&
      result.sensory.taste > 0 &&
      result.motor.feed > 0.2 &&
      now - this.lastFeed > 1000
    ) {
      this.pendingAction =
        (result.sensory.waterTaste ?? 0) > (result.sensory.foodTaste ?? 0) ? 'DRINK' : 'FEED';
      this.lastFeed = now;
    }
    if (now - this.lastCheckpoint >= 10_000) this.checkpoint();
    if (!this.socket?.isOpen() || !this.cadence.due(this.fly, now)) return;
    this.socket?.send({
      type: 'FLY_STATE',
      flyId: this.fly.flyId,
      position: this.fly.position,
      velocity: this.fly.velocity,
      rotation: this.fly.rotation,
      body: this.fly.body,
      path: this.trace.length
        ? this.trace.map((p) => p.map((v) => Math.round(v * 100000) / 100000) as FlyState['position'])
        : undefined,
      timestamp: this.dependencies.clock.timestamp(),
    });
    if (this.pendingAction) {
      this.socket?.send({
        type: 'FLY_ACTION',
        action: this.pendingAction,
        timestamp: this.dependencies.clock.timestamp(),
      });
      delete this.pendingAction;
    }
    this.trace = [];
  }

  private checkpoint() {
    if (!this.fly || !this.behavior || this.fly.death || this.fly.intervention || !this.socket?.isOpen()) return;
    this.socket.send({ type: 'BODY_CHECKPOINT', flyId: this.fly.flyId, value: this.behavior.checkpoint(), timestamp: this.dependencies.clock.timestamp() });
    this.lastCheckpoint = this.dependencies.clock.now();
  }

  private scheduleReconnect() {
    if (!this.config || this.reconnectTimer) return;
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** Math.min(this.reconnectAttempt++, 5));
    this.reconnectTimer = this.dependencies.clock.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.config) void this.start(this.config, false);
    }, delay);
  }

  private scheduleControlCheck() {
    if (!this.config || this.controlCheckTimer) return;
    const generation = this.generation;
    this.controlCheckTimer = this.dependencies.clock.setTimeout(() => {
      this.controlCheckTimer = undefined;
      void this.checkControlAvailability(generation);
    }, CONTROL_CHECK_INTERVAL_MS);
  }

  private async checkControlAvailability(generation: number) {
    const config = this.config;
    if (!config || generation !== this.generation) return;
    const request = this.request = new AbortController();
    try {
      const connected = await this.dependencies.device.isFlyConnected(config, request.signal);
      if (generation !== this.generation) return;
      if (connected) {
        this.scheduleControlCheck();
        return;
      }
      void this.start(config, false);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof DeviceResponseError) {
        await this.report('error', error.message);
        if (generation === this.generation) this.scheduleReconnect();
      } else {
        this.scheduleControlCheck();
      }
    } finally {
      if (this.request === request) this.request = undefined;
    }
  }

  private async report(state: RunnerStatus['state'], detail: string, flyName?: string) {
    await this.dependencies.onStatus({
      state, detail, flyName, updatedAt: this.dependencies.clock.timestamp(),
    });
  }
}
