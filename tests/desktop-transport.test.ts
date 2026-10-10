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
  const transport = desktopDeviceClient();
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
  const transport = desktopDeviceClient();
  const connection = transport.device.connect(config, 'test-ticket', events);
  connection.close();
  fake.sockets[0].dispatchEvent(new Event('close'));
  expect(fake.agents[1].destroy).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  transport.dispose();
});
it('rechazo de credencial muestra un mensaje local y no refleja el cuerpo remoto', async () => {
  fake.request.mockResolvedValue(Response.json({ error: 'contenido remoto no confiable' }, { status: 401 }));
  const transport = desktopDeviceClient();
  try { await expect(transport.device.ticket(config)).rejects.toThrow(AUTHENTICATION_ERROR); }
  finally { transport.dispose(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('identifica el transporte como cliente de dispositivo sin poner el token en las cabeceras WebSocket', () => {
  const transport = desktopDeviceClient();
  try {
    transport.device.connect(config, 'test-ticket', events);
    expect(fake.options[0].headers).toEqual({ Origin: expect.stringMatching(/^chrome-extension:\/\/[a-p]{32}$/) });
    expect(JSON.stringify(fake.options[0].headers)).not.toContain(config.token);
  } finally { transport.dispose(); }
});
