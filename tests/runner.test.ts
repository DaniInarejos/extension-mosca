import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoskaRunner } from '../src/core/runner';
import { DeviceResponseError } from '../src/core/api/device-error';
import type { DeviceClient, GardenConnection, GardenEvents } from '../src/core/ports';
import type { RunnerStatus } from '../src/core/types';
import { webClock } from '../src/adapters/web/clock';
import { createBrain, welcome } from './fixtures';
import { SERVER_SILENCE_TIMEOUT_MS, WELCOME_TIMEOUT_MS, MAX_RECONNECT_DELAY_MS } from '../src/core/connection-policy';

const config = { serverUrl: 'https://example.test', token: 'test-device-token' };

function harness(capacity = 0) {
  const sessions: { events: GardenEvents; socket: GardenConnection }[] = [];
  const statuses: RunnerStatus[] = [];
  const brainFactory = vi.fn(createBrain);
  const device: DeviceClient = {
    ticket: vi.fn(async () => 'test-ticket'),
    isFlyConnected: vi.fn(async () => false),
    connect: vi.fn((_config, _ticket, events) => {
      const socket: GardenConnection = {
        isOpen: () => true,
        send: vi.fn(),
        close: vi.fn(() => events.onClose(1000)),
      };
      sessions.push({ events, socket });
      return socket;
    }),
  };
  const runner = new MoskaRunner({
    device, clock: webClock, createBrain: brainFactory, volunteerCapacity: capacity,
    onStatus: (status) => { statuses.push(status); },
  });
  return { runner, device, sessions, statuses, brainFactory };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ciclo de vida del núcleo sin Chrome ni DOM', () => {
  it('inicia el cerebro, sincroniza y libera todos los recursos al detenerse', async () => {
    const h = harness(2);
    await h.runner.start(config);
    const { events, socket } = h.sessions[0];
    events.onOpen();
    await events.onMessage(welcome());
    expect(h.brainFactory).toHaveBeenCalledWith(30);
    expect(h.statuses.map((status) => status.state)).toEqual(['connecting', 'loading', 'online']);
    expect(socket.send).toHaveBeenCalledWith({ type: 'VOLUNTEER_CAPACITY', capacity: 2 });
    expect(h.runner.snapshot()).toMatchObject({ name: 'Mosca de prueba', energy: 80 });
    await vi.advanceTimersByTimeAsync(800);
    expect(socket.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'FLY_STATE', flyId: 'test-fly' }));
    h.runner.stop();
    expect(h.brainFactory.mock.results[0].value.dispose).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(h.runner.snapshot()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.statuses.at(-1)?.state).toBe('idle');
  });

  it.each([4001, 4002])('cede el control con código %s y espera hasta que quede libre', async (code) => {
    const h = harness();
    vi.mocked(h.device.isFlyConnected).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await h.runner.start(config);
    await h.sessions[0].events.onMessage(welcome());
    h.sessions[0].events.onClose(code);
    expect(h.statuses.at(-1)?.state).toBe('paused');
    expect(h.brainFactory.mock.results[0].value.dispose).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.device.ticket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.device.ticket).toHaveBeenCalledTimes(2);
    expect(h.sessions).toHaveLength(2);
    h.runner.stop();
  });

  it('reconecta con espera creciente y cancela el reintento al detenerse', async () => {
    const h = harness();
    await h.runner.start(config);
    h.sessions[0].events.onClose(1006);
    vi.mocked(h.device.ticket).mockRejectedValue(new Error('Sin red'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.device.ticket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(h.device.ticket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.device.ticket).toHaveBeenCalledTimes(3);
    h.runner.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.device.ticket).toHaveBeenCalledTimes(3);
  });

  it('ignora un ticket que llega después de detenerse', async () => {
    const h = harness();
    let resolveTicket!: (ticket: string) => void;
    vi.mocked(h.device.ticket).mockReturnValue(new Promise((resolve) => { resolveTicket = resolve; }));
    const starting = h.runner.start(config);
    await vi.advanceTimersByTimeAsync(0);
    h.runner.stop();
    resolveTicket('late-ticket');
    await starting;
    expect(h.device.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('no vuelve a iniciar la simulación si se detiene durante la carga del cerebro', async () => {
    const h = harness();
    const brain = createBrain();
    let ready!: () => void;
    vi.mocked(brain.initialize).mockReturnValue(new Promise((resolve) => { ready = resolve; }));
    h.brainFactory.mockReturnValue(brain);
    await h.runner.start(config);
    const loading = h.sessions[0].events.onMessage(welcome());
    h.runner.stop();
    ready();
    await loading;
    expect(brain.dispose).toHaveBeenCalledOnce();
    expect(h.statuses.at(-1)?.state).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignora eventos tardíos de una conexión sustituida', async () => {
    const h = harness();
    await h.runner.start(config);
    const previous = h.sessions[0].events;
    await h.runner.start(config);
    previous.onOpen();
    previous.onError('Error antiguo');
    previous.onClose(1006);
    await previous.onMessage(welcome());
    expect(h.brainFactory).not.toHaveBeenCalled();
    expect(h.statuses.at(-1)?.state).toBe('connecting');
    expect(vi.getTimerCount()).toBe(1); // Solo el límite de bienvenida de la nueva sesión.
    h.runner.stop();
  });

  it('no retoma el control si una consulta pendiente termina después de detenerse', async () => {
    const h = harness();
    let resolveState!: (connected: boolean) => void;
    vi.mocked(h.device.isFlyConnected).mockReturnValue(new Promise((resolve) => { resolveState = resolve; }));
    await h.runner.start(config);
    h.sessions[0].events.onClose(4002);
    await vi.advanceTimersByTimeAsync(5_000);
    h.runner.stop();
    resolveState(false);
    await Promise.resolve();
    expect(h.device.ticket).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('distingue fallos de red y respuestas HTTP rechazadas al consultar el control', async () => {
    const h = harness();
    vi.mocked(h.device.isFlyConnected)
      .mockRejectedValueOnce(new TypeError('Sin red'))
      .mockRejectedValueOnce(new DeviceResponseError('Token revocado'));
    await h.runner.start(config);
    h.sessions[0].events.onClose(4002);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.statuses.at(-1)?.state).toBe('paused');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.statuses.at(-1)).toMatchObject({ state: 'error', detail: 'Token revocado' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.device.ticket).toHaveBeenCalledTimes(2);
    h.runner.stop();
  });

  it('abandona una conexión sin bienvenida y cancela el límite al detenerse', async () => {
    const h = harness();
    await h.runner.start(config);
    h.sessions[0].events.onOpen();
    await vi.advanceTimersByTimeAsync(WELCOME_TIMEOUT_MS / 2);
    await h.sessions[0].events.onMessage({ type: 'ERROR', message: 'Aún sin bienvenida' });
    await vi.advanceTimersByTimeAsync(WELCOME_TIMEOUT_MS / 2);
    expect(h.sessions[0].socket.close).toHaveBeenCalledOnce();
    expect(h.statuses.at(-1)?.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.sessions).toHaveLength(2);
    h.runner.stop();
    await vi.advanceTimersByTimeAsync(WELCOME_TIMEOUT_MS * 2);
    expect(h.sessions).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renueva el límite con mensajes reales y libera el cerebro cuando el servidor queda silencioso', async () => {
    const h = harness();
    await h.runner.start(config);
    await h.sessions[0].events.onMessage(welcome());
    const brain = h.brainFactory.mock.results[0].value;
    await vi.advanceTimersByTimeAsync(SERVER_SILENCE_TIMEOUT_MS - 1);
    expect(brain.dispose).not.toHaveBeenCalled();
    await h.sessions[0].events.onMessage({ type: 'WORLD_STATE', world: welcome().world });
    await vi.advanceTimersByTimeAsync(SERVER_SILENCE_TIMEOUT_MS - 1);
    expect(brain.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(brain.dispose).toHaveBeenCalledOnce();
    expect(h.runner.snapshot()).toBeUndefined();
    expect(h.statuses.at(-1)?.detail).toContain('dejó de responder');
    await h.sessions[0].events.onMessage(welcome());
    expect(h.brainFactory).toHaveBeenCalledTimes(1);
    h.runner.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limita el backoff y no lo reinicia por handshakes sin una sesión utilizable', async () => {
    const h = harness();
    await h.runner.start(config);
    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, MAX_RECONNECT_DELAY_MS, MAX_RECONNECT_DELAY_MS]) {
      const session = h.sessions.at(-1)!;
      session.events.onOpen();
      session.events.onClose(1006);
      const attempts = h.sessions.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(h.sessions).toHaveLength(attempts);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.sessions).toHaveLength(attempts + 1);
    }
    await h.sessions.at(-1)!.events.onMessage(welcome());
    h.sessions.at(-1)!.events.onClose(1006);
    const attempts = h.sessions.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.sessions).toHaveLength(attempts + 1);
    h.runner.stop();
  });

  it('aborta el ticket pendiente al detenerse y no reintenta después', async () => {
    const h = harness();
    let signal!: AbortSignal;
    vi.mocked(h.device.ticket).mockImplementation((_config, abortSignal) => {
      signal = abortSignal!;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Cancelado')), { once: true });
      });
    });
    const starting = h.runner.start(config);
    await vi.advanceTimersByTimeAsync(0);
    h.runner.stop();
    await starting;
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.device.ticket).toHaveBeenCalledTimes(1);
    expect(h.device.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborta una consulta de control pendiente al detenerse', async () => {
    const h = harness();
    let signal!: AbortSignal;
    vi.mocked(h.device.isFlyConnected).mockImplementation((_config, abortSignal) => {
      signal = abortSignal!;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Cancelado')), { once: true });
      });
    });
    await h.runner.start(config);
    h.sessions[0].events.onClose(4002);
    await vi.advanceTimersByTimeAsync(15_000);
    h.runner.stop();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.device.isFlyConnected).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
