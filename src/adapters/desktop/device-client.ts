import { Agent, fetch, WebSocket, ProxyAgent } from 'undici';
import { createDeviceClient } from '../web/device-client';
import { DeviceResponseError } from '../../core/api/device-error';

// El servicio desplegado exige un Origin de extensión para aceptar tickets de dispositivo.
// Identificador estable derivado del appId lol.moscas.desktop; no es una extensión instalada
// ni una credencial. La autenticación sigue siendo el ticket efímero obtenido con el token.
const DEVICE_ORIGIN = 'chrome-extension://emfpeffhjoceehcmlhceehnkdihglhgn';

export const AUTHENTICATION_ERROR = 'El servidor rechazó el token. Pulsa Detener y vincula un token de dispositivo válido.';

/** HTTP/WSS de Node: comparte protocolo, cancelación, deadlines y backpressure con Chrome. */
export function desktopDeviceClient(proxy?: string) {
  const makeDispatcher = () => proxy ? new ProxyAgent(proxy) : new Agent();
  const http = makeDispatcher();
  const sockets = new Set<ReturnType<typeof makeDispatcher>>();
  const request = (async (url, init) => {
    const response = await fetch(url as string, { ...init, dispatcher: http } as Parameters<typeof fetch>[1]);
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new DeviceResponseError(AUTHENTICATION_ERROR);
    }
    return response;
  }) as typeof globalThis.fetch;
  return {
    request,
    device: createDeviceClient(
      request,
      (url) => {
        // Cada socket tiene su propio transporte, para acotar también el cierre con TCP atascado.
        const dispatcher = makeDispatcher();
        sockets.add(dispatcher);
        const socket = new WebSocket(url, { dispatcher, headers: { Origin: DEVICE_ORIGIN } });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const release = () => {
          clearTimeout(timer);
          if (sockets.delete(dispatcher)) void dispatcher.destroy();
        };
        socket.addEventListener('close', release, { once: true });
        const close = socket.close.bind(socket);
        socket.close = (code, reason) => {
          close(code, reason);
          // Dar margen al checkpoint/cierre normal, sin retener recursos indefinidamente.
          if (!timer) { timer = setTimeout(release, 1_000); timer.unref(); }
        };
        return socket as unknown as globalThis.WebSocket;
      },
    ),
    dispose: () => {
      void http.destroy();
      for (const dispatcher of sockets) void dispatcher.destroy();
      sockets.clear();
    },
  };
}
