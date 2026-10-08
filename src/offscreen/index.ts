import { FlyWireAdapter } from '../brain';
import { MotorBehavior } from '../simulation/behavior/index';
import { advanceLocalFly } from '../simulation/physics/local-step';
import type { FlyState, ServerMessage, WorldState } from '../simulation/protocol/index';
import type { ExtensionConfig, ExtensionMessage, FlySnapshot, RunnerStatus } from '../shared';
import { restingPose } from '../simulation/behavior/index';
import { DEFAULT_APPEARANCE } from '../simulation/protocol/appearance';
import { VolunteerBrains } from '../volunteer';
import type { DeviceSimulationTicketResponse, DeviceStateResponse } from '../api/public-contract';

const SEND_INTERVAL_MS = 750;
const FRAME_INTERVAL_MS = 1000 / 30;
const CONTROL_CHECK_INTERVAL_MS = 5_000;

class MoskaRunner {
  private config?: ExtensionConfig;
  private socket?: WebSocket;
  private brain?: FlyWireAdapter;
  private behavior?: MotorBehavior;
  private volunteers?: VolunteerBrains;
  private world?: WorldState;
  private fly?: FlyState;
  private frameTimer?: number;
  private reconnectTimer?: number;
  private controlCheckTimer?: number;
  private reconnectAttempt = 0;
  private lastFrame = 0;
  private lastSend = 0;
  private lastFeed = 0;
  private pendingAction?: 'FEED' | 'DRINK';
  private generation = 0;

  async start(config: ExtensionConfig, resetReconnect = true) {
    this.stop(false, resetReconnect);
    this.config = config;
    const generation = ++this.generation;
    await this.report('connecting', 'Solicitando acceso al servidor…');
    try {
      const ticket = await this.ticket(config);
      if (generation !== this.generation) return;
      this.connect(ticket);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.report('error', error instanceof Error ? error.message : String(error));
      this.scheduleReconnect();
    }
  }

  stop(report = true, resetReconnect = true) {
    this.generation++;
    window.clearInterval(this.frameTimer);
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.controlCheckTimer);
    this.frameTimer = undefined;
    this.reconnectTimer = undefined;
    this.controlCheckTimer = undefined;
    this.socket?.close(1000, 'Extensión detenida');
    this.socket = undefined;
    this.brain?.dispose();
    this.brain = undefined;
    this.behavior = undefined;
    this.volunteers?.clear();
    this.volunteers = undefined;
    this.world = undefined;
    this.fly = undefined;
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
      updatedAt: Date.now(),
    };
  }

  private async ticket(config: ExtensionConfig) {
    const response = await fetch(`${config.serverUrl}/api/device/simulation-ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<
      DeviceSimulationTicketResponse & { error: string }
    >;
    if (!response.ok || !result.ticket)
      throw new Error(result.error ?? `El servidor respondió ${response.status}.`);
    return result.ticket;
  }

  private connect(ticket: string) {
    if (!this.config) return;
    const url = new URL(this.config.serverUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/device';
    url.search = `ticket=${encodeURIComponent(ticket)}`;
    const socket = (this.socket = new WebSocket(url));
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      void this.report('loading', 'Conexión aceptada; cargando el conectoma…');
    };
    socket.onmessage = (event) => {
      try {
        void this.message(JSON.parse(event.data) as ServerMessage);
      } catch (error) {
        void this.report('error', `Mensaje del servidor no válido: ${String(error)}`);
      }
    };
    socket.onerror = () => {};
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.brain?.dispose();
      this.brain = undefined;
      this.volunteers?.clear();
      this.volunteers = undefined;
      window.clearInterval(this.frameTimer);
      this.frameTimer = undefined;
      if (this.config && (event.code === 4001 || event.code === 4002)) {
        const detail =
          event.code === 4002
            ? 'La web de moscas.lol está controlando tu mosca. La extensión retomará el cerebro al salir.'
            : 'Otra sesión está controlando tu mosca. La extensión esperará hasta que quede libre.';
        void this.report('paused', detail, this.fly?.name);
        this.scheduleControlCheck();
      } else if (this.config && event.code !== 1000) {
        void this.report('connecting', 'Conexión interrumpida; reintentando…');
        this.scheduleReconnect();
      }
    };
  }

  private async message(message: ServerMessage) {
    if (message.type === 'WELCOME') {
      this.world = message.world;
      this.fly = structuredClone(message.fly);
      this.behavior = new MotorBehavior(this.fly.flyId);
      this.behavior.reconcile(this.fly, this.world.objects);
      this.volunteers = new VolunteerBrains((outgoing) => {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(outgoing));
      });
      const brain = (this.brain = new FlyWireAdapter(30));
      brain.onError = (detail) => void this.report('error', detail);
      await brain.initialize();
      if (brain !== this.brain || !this.fly) return;
      this.lastFrame = performance.now();
      this.frameTimer = window.setInterval(() => this.frame(), FRAME_INTERVAL_MS);
      this.volunteers.announce(true);
      await this.report('online', 'Cerebro FlyWire activo y sincronizando.', this.fly.name);
      return;
    }
    if (message.type === 'WORLD_STATE') {
      this.world = message.world;
      const authoritative =
        this.fly && message.world.flies.find((fly) => fly.flyId === this.fly!.flyId);
      if (authoritative && this.fly) {
        this.fly.energy = authoritative.energy;
        this.fly.needs = structuredClone(authoritative.needs);
        this.fly.intent = structuredClone(authoritative.intent);
        this.fly.habitatMemory = structuredClone(authoritative.habitatMemory);
        this.fly.intervention = structuredClone(authoritative.intervention);
        this.fly.death = structuredClone(authoritative.death);
        this.fly.status = authoritative.status;
      }
      return;
    }
    if (message.type === 'SIMULATION_LEASES' && this.world)
      this.volunteers?.sync(message.leases, this.world);
    if (message.type === 'SIMULATION_LEASE_REVOKED') this.volunteers?.revoke(message.leaseId);
    if (message.type === 'CORRECTION' && this.fly && message.fly.flyId === this.fly.flyId) {
      this.fly = structuredClone(message.fly);
      this.behavior?.reconcile(this.fly, this.world?.objects ?? []);
      return;
    }
    if (message.type === 'ERROR') await this.report('error', message.message, this.fly?.name);
  }

  private frame() {
    if (!this.world || !this.fly || !this.behavior || !this.brain || this.fly.death) return;
    const now = performance.now();
    const elapsed = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const result = advanceLocalFly(
      this.world,
      this.fly,
      this.behavior,
      (sensory, dt) => this.brain!.step(sensory, dt),
      elapsed,
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
    this.volunteers?.frame(now, elapsed, this.world);
    if (now - this.lastSend < SEND_INTERVAL_MS || this.socket?.readyState !== WebSocket.OPEN)
      return;
    this.socket.send(
      JSON.stringify({
        type: 'FLY_STATE',
        flyId: this.fly.flyId,
        position: this.fly.position,
        velocity: this.fly.velocity,
        rotation: this.fly.rotation,
        body: this.fly.body,
        timestamp: Date.now(),
      }),
    );
    if (this.pendingAction) {
      this.socket.send(
        JSON.stringify({
          type: 'FLY_ACTION',
          action: this.pendingAction,
          timestamp: Date.now(),
        }),
      );
      delete this.pendingAction;
    }
    this.lastSend = now;
  }

  private scheduleReconnect() {
    if (!this.config || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.config) void this.start(this.config, false);
    }, delay);
  }

  private scheduleControlCheck() {
    if (!this.config || this.controlCheckTimer) return;
    const generation = this.generation;
    this.controlCheckTimer = window.setTimeout(() => {
      this.controlCheckTimer = undefined;
      void this.checkControlAvailability(generation);
    }, CONTROL_CHECK_INTERVAL_MS);
  }

  private async checkControlAvailability(generation: number) {
    const config = this.config;
    if (!config || generation !== this.generation) return;
    try {
      const response = await fetch(`${config.serverUrl}/api/device/state`, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      const result = (await response.json().catch(() => ({}))) as Partial<
        DeviceStateResponse & { error: string }
      >;
      if (generation !== this.generation) return;
      if (!response.ok || !result.fly) {
        await this.report('error', result.error ?? `El servidor respondió ${response.status}.`);
        this.scheduleReconnect();
        return;
      }
      if (result.fly.connected) {
        this.scheduleControlCheck();
        return;
      }
      void this.start(config, false);
    } catch {
      if (generation === this.generation) this.scheduleControlCheck();
    }
  }

  private async report(state: RunnerStatus['state'], detail: string, flyName?: string) {
    await chrome.runtime.sendMessage({
      type: 'RUNNER_STATUS',
      status: { state, detail, flyName, updatedAt: Date.now() },
    } satisfies ExtensionMessage);
  }
}

const runner = new MoskaRunner();

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'RUNNER_START') void runner.start(message.config);
  if (message.type === 'RUNNER_STOP') runner.stop();
  if (message.type === 'RUNNER_SNAPSHOT') sendResponse(runner.snapshot());
});
