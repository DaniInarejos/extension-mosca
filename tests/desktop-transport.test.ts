import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { desktopDeviceClient, AUTHENTICATION_ERROR } from '../src/adapters/desktop/device-client';

const fake = vi.hoisted(() => ({ request: vi.fn(), agents: [] as { destroy: ReturnType<typeof vi.fn> }[], sockets: [] as EventTarget[], options: [] as { headers: Record<string, string> }[] }));
vi.mock('undici', () => {
  class Agent {
    destroy = vi.fn(async () => {});
    constructor() { fake.agents.push(this); }
  }
  class WebSocket extends EventTarget {
    readyState = 1;
    bufferedAmount = 0;
    close = vi.fn();
    constructor(_url: URL, options: { headers: Record<string, string> }) { super(); fake.sockets.push(this); fake.options.push(options); }
  }
  return { Agent, ProxyAgent: Agent, WebSocket, fetch: fake.request };
});
const config = { serverUrl: 'https://example.test', token: 'test-token' };
const events = { onOpen() {}, onMessage: async () => {}, onClose() {}, onError() {} };
beforeEach(() => { vi.useFakeTimers(); fake.agents.length = 0; fake.sockets.length = 0; fake.options.length = 0; fake.request.mockReset(); });
afterEach(() => vi.useRealTimers());

it('cierre TCP silencioso libera su dispatcher y Salir libera también HTTP', async () => {
  const transport = desktopDeviceClient('7.8.9');
  const connection = transport.device.connect(config, 'test-ticket', events);
  connection.close();
  expect(fake.agents[1].destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fake.agents[1].destroy).toHaveBeenCalledOnce();
  transport.dispose();
  expect(fake.agents[0].destroy).toHaveBeenCalledOnce();
  expect(fake.agents[1].destroy).toHaveBeenCalledOnce();
});
it('cierre ordenado cancela el límite de limpieza', async () => {
  const transport = desktopDeviceClient('7.8.9');
  const connection = transport.device.connect(config, 'test-ticket', events);
  connection.close();
  fake.sockets[0].dispatchEvent(new Event('close'));
  expect(fake.agents[1].destroy).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  transport.dispose();
});
it('rechazo de credencial muestra un mensaje local y no refleja el cuerpo remoto', async () => {
  fake.request.mockResolvedValue(Response.json({ error: 'contenido remoto no confiable' }, { status: 401 }));
  const transport = desktopDeviceClient('7.8.9');
  try { await expect(transport.device.ticket(config)).rejects.toThrow(AUTHENTICATION_ERROR); }
  finally { transport.dispose(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('identifica el transporte como cliente de dispositivo sin poner el token en las cabeceras WebSocket', () => {
  const transport = desktopDeviceClient('7.8.9');
  try {
    transport.device.connect(config, 'test-ticket', events);
    expect(fake.options[0].headers).toEqual({ Origin: expect.stringMatching(/^chrome-extension:\/\/[a-p]{32}$/), 'User-Agent': `MoscasDesktop/7.8.9 (${process.platform}; ${process.arch})` });
    expect(JSON.stringify(fake.options[0].headers)).not.toContain(config.token);
  } finally { transport.dispose(); }
});

it('identifica HTTP como escritorio y conserva autenticación y cancelación en ticket y consulta de control', async () => {
  fake.request.mockResolvedValueOnce(Response.json({ ticket: 'test-ticket' }))
    .mockResolvedValueOnce(Response.json({ fly: { connected: false } }));
  const transport = desktopDeviceClient('7.8.9');
  const controller = new AbortController();
  try {
    await expect(transport.device.ticket(config, controller.signal)).resolves.toBe('test-ticket');
    await expect(transport.device.isFlyConnected(config, controller.signal)).resolves.toBe(false);
    for (const [, init] of fake.request.mock.calls) {
      expect(init.headers.get('User-Agent')).toBe(`MoscasDesktop/7.8.9 (${process.platform}; ${process.arch})`);
      expect(init.headers.get('Authorization')).toBe(`Bearer ${config.token}`);
      expect(init.headers.has('Origin')).toBe(false);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  } finally { transport.dispose(); }
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  new Headers({ 'X-Test': 'preservar', 'User-Agent': 'anterior' }),
  [['X-Test', 'preservar'], ['User-Agent', 'anterior']] as [string, string][],
  { 'X-Test': 'preservar', 'User-Agent': 'anterior' },
])('normaliza cabeceras HTTP sin perder valores ni duplicar User-Agent: %s', async (headers) => {
  fake.request.mockResolvedValue(new Response(null, { status: 204 }));
  const transport = desktopDeviceClient('7.8.9');
  const signal = new AbortController().signal;
  try {
    await transport.request('https://example.test', { headers, signal });
    const init = fake.request.mock.calls[0][1];
    expect(init.headers.get('User-Agent')).toBe(`MoscasDesktop/7.8.9 (${process.platform}; ${process.arch})`);
    expect(init.headers.get('X-Test')).toBe('preservar');
    expect(init.signal).toBe(signal);
    expect(new Headers(headers).get('User-Agent')).toBe('anterior');
  } finally { transport.dispose(); }
});
