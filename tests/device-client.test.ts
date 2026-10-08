import { afterEach, expect, it, vi } from 'vitest';
import { webDeviceClient } from '../src/adapters/web/device-client';
import { DeviceResponseError } from '../src/core/api/device-error';
import type { GardenEvents } from '../src/core/ports';

const config = { serverUrl: 'https://example.test', token: 'test-device-token' };
afterEach(() => vi.unstubAllGlobals());

it('intercambia el token por un ticket con la cabecera Bearer', async () => {
  const request = vi.fn(async () => Response.json({ ticket: 'ephemeral-ticket', expiresAt: 60_000 }));
  vi.stubGlobal('fetch', request);
  expect(await webDeviceClient.ticket(config)).toBe('ephemeral-ticket');
  expect(request).toHaveBeenCalledWith('https://example.test/api/device/simulation-ticket', {
    method: 'POST', headers: { Authorization: 'Bearer test-device-token' }, signal: expect.any(AbortSignal),
  });
});

it('propaga un rechazo HTTP sin confundirlo con un fallo de red', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Token revocado' }, { status: 401 })));
  await expect(webDeviceClient.ticket(config)).rejects.toThrow(DeviceResponseError);
  await expect(webDeviceClient.isFlyConnected(config)).rejects.toThrow('Token revocado');
});

it('rechaza respuestas incompletas y consulta el propietario actual', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({ fly: { connected: true } }));
  vi.stubGlobal('fetch', request);
  await expect(webDeviceClient.ticket(config)).rejects.toThrow(DeviceResponseError);
  expect(await webDeviceClient.isFlyConnected(config)).toBe(true);
  expect(request).toHaveBeenLastCalledWith('https://example.test/api/device/state', {
    headers: { Authorization: 'Bearer test-device-token' }, signal: expect.any(AbortSignal),
  });
});

it('envía solo el ticket en el WebSocket y conserva mensajes y códigos de cierre', async () => {
  class FakeSocket {
    static OPEN = 1;
    static instance: FakeSocket;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code: number }) => void;
    onerror?: () => void;
    send = vi.fn();
    close = vi.fn();
    constructor(readonly url: URL) { FakeSocket.instance = this; }
  }
  vi.stubGlobal('WebSocket', FakeSocket);
  const events: GardenEvents = {
    onOpen: vi.fn(), onMessage: vi.fn(async () => {}), onClose: vi.fn(), onError: vi.fn(),
  };
  const connection = webDeviceClient.connect(config, 'ticket/with?symbols', events);
  const socket = FakeSocket.instance;
  expect(socket.url.href).toBe('wss://example.test/ws/device?ticket=ticket%2Fwith%3Fsymbols');
  expect(socket.url.href).not.toContain(config.token);
  socket.onopen?.();
  expect(events.onOpen).toHaveBeenCalledOnce();
  socket.onmessage?.({ data: '{"type":"ERROR","message":"Prueba"}' });
  expect(events.onMessage).toHaveBeenCalledWith({ type: 'ERROR', message: 'Prueba' });
  socket.onmessage?.({ data: 'invalid json' });
  expect(events.onError).toHaveBeenCalledOnce();
  vi.mocked(events.onMessage).mockRejectedValueOnce(new Error('Fallo de inicialización'));
  socket.onmessage?.({ data: '{"type":"ERROR","message":"Prueba"}' });
  await Promise.resolve();
  expect(events.onError).toHaveBeenLastCalledWith('Error: Fallo de inicialización');
  connection.send({ type: 'VOLUNTEER_CAPACITY', capacity: 1 });
  expect(socket.send).toHaveBeenCalledWith('{"type":"VOLUNTEER_CAPACITY","capacity":1}');
  socket.onclose?.({ code: 4002 });
  expect(events.onClose).toHaveBeenCalledWith(4002);
  expect(connection.isOpen()).toBe(true);
  socket.readyState = 3;
  expect(connection.isOpen()).toBe(false);
  connection.close();
  expect(socket.close).toHaveBeenCalledWith(1000, 'Cliente detenido');
});
