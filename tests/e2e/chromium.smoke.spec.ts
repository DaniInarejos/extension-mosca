import { test, expect } from './extension';

test('carga la extensión MV3 real y muestra el popup sin iniciar una sesión', async ({ extension }) => {
  const popup = await extension.popup();
  expect(await extension.worker.evaluate(() => chrome.runtime.getManifest().manifest_version)).toBe(3);
  await expect(popup.getByRole('heading', { name: 'Moskas Brain' })).toBeVisible();
  await expect(popup.locator('#status')).toHaveText('Detenida');
  await expect(popup.getByLabel('Servidor', { exact: true })).toHaveValue('https://moscas.lol');
  await expect(popup.getByLabel('Token de dispositivo', { exact: true })).toHaveValue('');
  await expect(popup.locator('#fly-card')).toBeHidden();
  expect(await extension.offscreenCount()).toBe(0);
  expect((await extension.storedState()).enabled).toBe(false);
  expect(extension.errors).toEqual([]);
});

test('conserva la edición del formulario entre actualizaciones del estado', async ({ extension }) => {
  const popup = await extension.popup();
  const token = popup.getByLabel('Token de dispositivo', { exact: true });
  await token.fill('token-incompleto');
  const server = popup.getByLabel('Servidor', { exact: true });
  await server.fill('https://moscas.lol/');
  await popup.getByRole('heading', { name: 'Moskas Brain' }).click();
  // Comprobar dos ciclos reales de actualización del popup (750 ms), sin simular el reloj.
  await popup.waitForTimeout(1_600);
  await expect(token).toHaveValue('token-incompleto');
  await expect(server).toHaveValue('https://moscas.lol/');
  expect((await extension.storedState()).enabled).toBe(false);
});

test('rechaza un token incompleto sin abrir el runner ni enviar solicitudes', async ({ extension }) => {
  const requests: string[] = [];
  extension.context.on('request', (request) => {
    if (request.url().startsWith('https://moscas.lol/')) requests.push(request.method());
  });
  const popup = await extension.popup();
  await popup.getByLabel('Token de dispositivo', { exact: true }).fill('token-invalido');
  await popup.getByRole('button', { name: 'Iniciar cerebro' }).click();
  await expect(popup.locator('#detail')).toHaveText('Revisa la URL y el token de dispositivo.');
  expect(await extension.offscreenCount()).toBe(0);
  expect((await extension.storedState()).enabled).toBe(false);
  expect(requests).toEqual([]);
  expect(extension.errors).toEqual([]);
});

test('detener en reposo persiste la desactivación tras reiniciar Chromium', async ({ extension }) => {
  const popup = await extension.popup();
  await popup.getByRole('button', { name: 'Detener', exact: true }).click();
  await expect(popup.locator('#status')).toHaveText('Detenida');
  await expect.poll(async () => (await extension.storedState()).enabled).toBe(false);
  await extension.restart();
  const reopened = await extension.popup();
  await expect(reopened.locator('#status')).toHaveText('Detenida');
  expect((await extension.storedState()).enabled).toBe(false);
  expect(await extension.offscreenCount()).toBe(0);
  expect(extension.errors).toEqual([]);
});

test('carga el documento offscreen real y lo libera al detener desde el popup', async ({ extension }) => {
  await extension.worker.evaluate(() => chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Comprobar la carga y limpieza del runner sin iniciar una sesión.',
  }));
  await expect.poll(() => extension.offscreenCount()).toBe(1);
  // La respuesta prueba que el módulo real cargó y registró su listener bajo la CSP.
  await expect.poll(() => extension.worker.evaluate(async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'RUNNER_SNAPSHOT' });
      return true;
    } catch {
      return false;
    }
  })).toBe(true);
  const popup = await extension.popup();
  await popup.getByRole('button', { name: 'Detener', exact: true }).click();
  await expect.poll(() => extension.offscreenCount()).toBe(0);
  await expect(popup.locator('#status')).toHaveText('Detenida');
  expect((await extension.storedState()).enabled).toBe(false);
  expect(extension.errors).toEqual([]);
});
