import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Brain } from '../../core/ports';
import type { MotorOutput, NeuralActivity, SensoryInput } from '../../core/simulation/protocol';

/** El mismo kernel local, ejecutado fuera del renderer y sus políticas de suspensión. */
export class DesktopBrain implements Brain {
  private worker?: Worker;
  private startup?: AbortController;
  private cancelStartup?: () => void;
  private sample = 0;
  private activity: NeuralActivity = {
    tick: 0, fired: 0, neurons: 0, edges: 0, tickMs: 0, groups: [], groupActive: [],
    motor: { forward: 0, turn: 0, lift: 0, feed: 0 },
  };
  onError: (detail: string) => void = () => {};
  constructor(private assets: string, private tickRate = 30, private failed: () => void = () => {}) {}

  async initialize() {
    if (this.startup || this.worker) throw new Error('El cerebro ya está iniciado.');
    const controller = this.startup = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const buffers = await Promise.all(['connectome.bin.gz', 'laterality.bin'].map(async (name) => {
        const bytes = await readFile(join(this.assets, name), { signal: controller.signal });
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      }));
      controller.signal.throwIfAborted();
      const worker = this.worker = new Worker(join(this.assets, 'flywire-node.cjs'));
      await new Promise<void>((resolve, reject) => {
        const fail = () => reject(new Error('No se pudo iniciar el cerebro local.'));
        this.cancelStartup = fail;
        controller.signal.addEventListener('abort', fail, { once: true });
        worker.on('error', () => {
          if (this.worker !== worker) return;
          this.failed();
          this.activity.motor = { forward: 0, turn: 0, lift: 0, feed: 0 };
          this.onError('El worker neuronal se ha interrumpido.');
          fail();
        });
        worker.on('exit', () => {
          if (this.worker === worker) {
            this.failed();
            this.onError('El worker neuronal se ha cerrado inesperadamente.');
            fail();
          }
        });
        worker.on('message', (message) => {
          if (this.worker !== worker) return;
          if (message.type === 'ready') {
            this.activity.neurons = message.neuronCount;
            this.activity.edges = message.edgeCount;
            worker.postMessage({ type: 'setParams', threshold: 0.1, tickRate: this.tickRate });
            worker.postMessage({ type: 'start' });
            resolve();
          } else if (message.type === 'activity') this.activity = message;
          else if (message.type === 'stats') this.activity.tickMs = message.avgTickMs;
          else if (message.type === 'error') {
            this.failed();
            this.onError('No se pudo ejecutar el cerebro local.');
            fail();
          }
        });
        worker.postMessage({ type: 'laterality', buffer: buffers[1] }, [buffers[1]]);
        worker.postMessage({ type: 'init', buffer: buffers[0] }, [buffers[0]]);
      });
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      clearTimeout(timer);
      this.cancelStartup = undefined;
      this.startup = undefined;
    }
  }

  step(input: SensoryInput, dt: number): MotorOutput {
    this.sample += dt;
    if (this.sample >= 1 / 30) {
      this.worker?.postMessage({ type: 'sensory', input });
      this.sample %= 1 / 30;
    }
    return this.activity.motor;
  }
  reset() {
    this.worker?.postMessage({ type: 'reset' });
    this.activity.motor = { forward: 0, turn: 0, lift: 0, feed: 0 };
  }
  getActivity() { return this.activity; }
  dispose() {
    this.startup?.abort();
    this.cancelStartup?.();
    const worker = this.worker;
    this.worker = undefined;
    if (worker) void worker.terminate();
    this.reset();
  }
}
