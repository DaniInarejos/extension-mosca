import { afterEach, expect, it, vi } from 'vitest';
import { FlyWireAdapter } from '../src/adapters/web/flywire';

afterEach(() => vi.unstubAllGlobals());

it('carga los assets con el adaptador del cliente y libera el worker sin depender de Chrome', async () => {
  class FakeWorker {
    static instance: FakeWorker;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror = null;
    terminate = vi.fn();
    postMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'init') this.onmessage?.({ data: { type: 'ready', neuronCount: 5, edgeCount: 10 } });
    });
    constructor(readonly url: string) { FakeWorker.instance = this; }
  }
  vi.stubGlobal('Worker', FakeWorker);
  const request = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', request);
  const brain = new FlyWireAdapter((path) => `https://assets.example.test/${path}`, 5);
  await brain.initialize();
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    'https://assets.example.test/brain/connectome.bin.gz',
    'https://assets.example.test/brain/laterality.bin',
  ]);
  const worker = FakeWorker.instance;
  expect(worker.url).toBe('https://assets.example.test/brain/flywire-worker.js');
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'setParams', threshold: 0.1, tickRate: 5 });
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'start' });
  brain.dispose();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.onmessage).toBeNull();
});
