import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestJson } from '../src/adapters/web/request-json';
import { HTTP_TIMEOUT_MS } from '../src/core/connection-policy';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('cancela una petición sin cabeceras dentro del límite de tiempo', async () => {
  let signal!: AbortSignal;
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => {
    signal = init.signal!;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  }));
  const pending = requestJson('https://example.test', {});
  const failed = expect(pending).rejects.toThrow('Tiempo de espera agotado');
  await vi.advanceTimersByTimeAsync(HTTP_TIMEOUT_MS - 1);
  expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await failed;
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('el límite también cubre un cuerpo que deja de llegar después de las cabeceras', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => ({
    json: () => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }),
  })));
  const failed = expect(requestJson('https://example.test', {})).rejects.toThrow('Tiempo de espera agotado');
  await vi.advanceTimersByTimeAsync(HTTP_TIMEOUT_MS);
  await failed;
  expect(vi.getTimerCount()).toBe(0);
});

it('propaga la cancelación del runner y limpia el temporizador', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  })));
  const failed = expect(requestJson('https://example.test', {}, controller.signal))
    .rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await failed;
  expect(vi.getTimerCount()).toBe(0);
});

it('libera los recursos tras una respuesta válida sin abortar después de completarse', async () => {
  const caller = new AbortController();
  let signal!: AbortSignal;
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    signal = init.signal!;
    return Response.json({ ok: true });
  }));
  expect((await requestJson('https://example.test', {}, caller.signal)).data).toEqual({ ok: true });
  expect(vi.getTimerCount()).toBe(0);
  caller.abort();
  expect(signal.aborted).toBe(false);
});
