import type { DeviceSimulationTicketResponse, DeviceControlResponse } from '../../core/api/public-contract';
import type { DeviceClient } from '../../core/ports';
import type { ServerMessage } from '../../core/simulation/protocol/index';
import { DeviceResponseError } from '../../core/api/device-error';
import { requestJson } from './request-json';

export const webDeviceClient: DeviceClient = {
  async ticket(config, signal) {
    const { response, data: result } = await requestJson<Partial<DeviceSimulationTicketResponse & { error: string }>>(
      `${config.serverUrl}/api/device/simulation-ticket`,
      { method: 'POST', headers: { Authorization: `Bearer ${config.token}` } },
      signal,
    );
    if (!response.ok || !result.ticket)
      throw new DeviceResponseError(result.error ?? `El servidor respondió ${response.status}.`);
    return result.ticket;
  },
  connect(config, ticket, events) {
    const url = new URL(config.serverUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/device';
    url.search = `ticket=${encodeURIComponent(ticket)}&protocol=3`;
    const socket = new WebSocket(url);
    socket.onopen = () => events.onOpen();
    socket.onmessage = (event) => {
      try {
        void events.onMessage(JSON.parse(event.data) as ServerMessage).catch((error: unknown) => {
          events.onError(String(error));
          socket.close(4000, 'Resincronizar el jardín');
        });
      } catch (error) {
        events.onError(`Mensaje del servidor no válido: ${String(error)}`);
        socket.close(4000, 'Resincronizar el jardín');
      }
    };
    // El cierre del socket activa la reconexión; evita un segundo camino de reintentos.
    socket.onerror = () => {};
    socket.onclose = (event) => events.onClose(event.code);
    return {
      isOpen: () => socket.readyState === WebSocket.OPEN,
      send: (message) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount >= 512_000) {
          socket.close(4000, 'Resincronizar el jardín');
          return;
        }
        socket.send(JSON.stringify(message));
      },
      close: () => socket.close(1000, 'Cliente detenido'),
    };
  },
  async isFlyConnected(config, signal) {
    const { response, data: result } = await requestJson<Partial<DeviceControlResponse & { error: string }>>(
      `${config.serverUrl}/api/device/state?view=control`,
      { headers: { Authorization: `Bearer ${config.token}` } },
      signal,
    );
    if (!response.ok || !result.fly)
      throw new DeviceResponseError(result.error ?? `El servidor respondió ${response.status}.`);
    return result.fly.connected;
  },
};
