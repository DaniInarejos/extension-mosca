import type {
  FlyWireBrain,
  SensoryInput,
  MotorOutput,
  NeuralActivity,
} from '../../core/simulation/protocol/index';
export class FlyWireAdapter implements FlyWireBrain {
  private worker?: Worker;
  private startup?: AbortController;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private cancelStartup?: () => void;
  private lastSample = 0;
  private activity: NeuralActivity = {
    tick: 0,
    fired: 0,
    neurons: 0,
    edges: 0,
    tickMs: 0,
    groups: [],
    groupActive: [],
    motor: { forward: 0, turn: 0, lift: 0, feed: 0 },
  };
  onError: (message: string) => void = () => {};
  constructor(
    private resolveAssetUrl: (path: string) => string,
    private tickRate = 30,
  ) {}
  async initialize() {
    if (this.worker || this.startup) throw new Error('El cerebro ya se está iniciando.');
    const controller = (this.startup = new AbortController());
    try {
      const [response, sides] = await Promise.all([
        fetch(this.resolveAssetUrl('brain/connectome.bin.gz'), { signal: controller.signal }),
        fetch(this.resolveAssetUrl('brain/laterality.bin'), { signal: controller.signal }),
      ]);
      if (!response.ok || !sides.ok) throw new Error('No se pudo cargar el conectoma local.');
      const [buffer, laterality] = await Promise.all([response.arrayBuffer(), sides.arrayBuffer()]);
      if (controller.signal.aborted) throw new DOMException('Inicio cancelado.', 'AbortError');
      this.worker = new Worker(this.resolveAssetUrl('brain/flywire-worker.js'));
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(this.startupTimer);
          this.startupTimer = undefined;
          this.cancelStartup = undefined;
        };
        this.cancelStartup = () => {
          cleanup();
          reject(new DOMException('Inicio cancelado.', 'AbortError'));
        };
        this.startupTimer = setTimeout(() => {
          reject(new Error('El cerebro tardó demasiado en iniciar.'));
        }, 30000);
        this.worker!.onerror = (e) => {
          cleanup();
          this.activity.motor = { forward: 0, turn: 0, lift: 0, feed: 0 };
          this.onError(e.message);
          reject(new Error(e.message));
        };
        this.worker!.onmessage = (e) => {
          if (e.data.type === 'ready') {
            cleanup();
            this.activity.neurons = e.data.neuronCount;
            this.activity.edges = e.data.edgeCount;
            this.worker!.postMessage({
              type: 'setParams',
              threshold: 0.1,
              tickRate: this.tickRate,
            });
            this.worker!.postMessage({ type: 'start' });
            resolve();
          }
          if (e.data.type === 'activity') this.activity = e.data;
          if (e.data.type === 'stats') this.activity.tickMs = e.data.avgTickMs;
          if (e.data.type === 'error') {
            cleanup();
            this.onError(e.data.message);
            reject(new Error(e.data.message));
          }
        };
        this.worker!.postMessage({ type: 'laterality', buffer: laterality }, [laterality]);
        this.worker!.postMessage({ type: 'init', buffer }, [buffer]);
      });
      this.startup = undefined;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  reset() {
    this.worker?.postMessage({ type: 'reset' });
    this.activity.motor = { forward: 0, turn: 0, lift: 0, feed: 0 };
  }
  step(input: SensoryInput, dt: number): MotorOutput {
    this.lastSample += dt;
    if (this.lastSample >= 1 / 30) {
      this.worker?.postMessage({ type: 'sensory', input });
      this.lastSample %= 1 / 30;
    }
    return this.activity.motor;
  }
  getActivity() {
    return this.activity;
  }
  dispose() {
    this.startup?.abort();
    this.startup = undefined;
    this.cancelStartup?.();
    clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
    }
    this.worker?.terminate();
    this.worker = undefined;
  }
}
