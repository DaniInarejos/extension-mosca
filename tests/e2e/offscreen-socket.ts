import type { BrowserContext, CDPSession } from '@playwright/test';

/** El documento offscreen no forma parte de context.pages(): dirigir CDP a su target. */
export async function interruptOffscreenSocket(context: BrowserContext, extensionId: string) {
  const browser = context.browser();
  if (!browser) throw new Error('Chromium no está disponible.');
  const cdp = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find((info) => info.url === `chrome-extension://${extensionId}/offscreen.html`);
    if (!target) throw new Error('No se encontró el documento offscreen.');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    const prototype = await command<{ result: { objectId: string } }>(cdp, sessionId, 'Runtime.evaluate', {
      expression: 'WebSocket.prototype', objectGroup: 'moskas-e2e',
    });
    const { objects } = await command<{ objects: { objectId: string } }>(cdp, sessionId, 'Runtime.queryObjects', {
      prototypeObjectId: prototype.result.objectId, objectGroup: 'moskas-e2e',
    });
    // Cerrar el socket real: no sustituir WebSocket, no emitir eventos sintéticos.
    const result = await command<{ result: { value?: number }; exceptionDetails?: unknown }>(
      cdp, sessionId, 'Runtime.callFunctionOn', {
        objectId: objects.objectId,
        functionDeclaration: `async function() {
          const sockets = this.filter(socket =>
            socket.readyState === WebSocket.OPEN &&
            new URL(socket.url).origin === 'wss://moscas.lol' &&
            new URL(socket.url).pathname === '/ws/device');
          if (sockets.length !== 1) throw new Error('Se esperaba una conexión real de simulación.');
          await new Promise(resolve => {
            sockets[0].addEventListener('close', resolve, { once: true });
            sockets[0].close(4000, 'Prueba de reconexión');
          });
          return sockets.length;
        }`,
        awaitPromise: true,
        returnByValue: true,
      },
    );
    if (result.exceptionDetails || result.result.value !== 1)
      throw new Error('No se pudo interrumpir la conexión real de simulación.');
    await command(cdp, sessionId, 'Runtime.releaseObjectGroup', { objectGroup: 'moskas-e2e' });
  } finally {
    await cdp.detach();
  }
}

let nextId = 0;

function command<T = unknown>(cdp: CDPSession, sessionId: string, method: string, params = {}) {
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      cdp.off('Target.receivedMessageFromTarget', onMessage);
    };
    const onMessage = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const response = JSON.parse(event.message) as { id?: number; result: T; error?: { message: string } };
      if (response.id !== id) return;
      cleanup();
      if (response.error) reject(new Error(`CDP rechazó ${method}.`));
      else resolve(response.result);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`CDP no respondió a ${method}.`));
    }, 10_000);
    cdp.on('Target.receivedMessageFromTarget', onMessage);
    void cdp.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id, method, params }),
    }).catch((error: unknown) => {
      cleanup();
      reject(error);
    });
  });
}
