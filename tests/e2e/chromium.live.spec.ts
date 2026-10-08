import { test, expect } from './extension';
import { interruptOffscreenSocket } from './offscreen-socket';

test.beforeAll(() => {
  if (!/^fly_device_[a-f0-9]{64}$/.test(process.env.MOSCAS_DEVICE_TOKEN ?? '')) {
    throw new Error('Falta MOSCAS_DEVICE_TOKEN. Las pruebas reales requieren un token válido.');
  }
});

test('mantiene una sesión real con moscas.lol a través del ciclo de vida de Chromium', async ({ extension }) => {
  let popup = await extension.popup();

  await test.step('vincular la extensión e iniciar el cerebro real', async () => {
    await expect(popup.getByLabel('Servidor', { exact: true })).toHaveValue('https://moscas.lol');
    // Evitar que una llamada fill(token) incluya la credencial en un mensaje de error.
    await popup.evaluate((token) => {
      const input = document.querySelector<HTMLInputElement>('#token')!;
      input.value = token;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, process.env.MOSCAS_DEVICE_TOKEN!);
    await popup.getByRole('button', { name: 'Iniciar cerebro' }).click();
    await expect(popup.locator('#status'), 'La web y otros clientes deben dejar libre el control de la mosca.')
      .toHaveText('En línea', { timeout: 60_000 });
    await expect(popup.locator('#fly-card')).toBeVisible();
    await expect(popup.locator('#fly-name')).not.toHaveText('');
    await expect.poll(() => extension.offscreenCount()).toBe(1);
  });

  await test.step('cerrar el popup y comprobar la continuidad del runner', async () => {
    await popup.close();
    // Mantener una ventana sin interfaz de extensión para reproducir el uso habitual.
    const blank = extension.context.pages()[0] ?? await extension.context.newPage();
    await blank.waitForTimeout(3_000);
    expect((await extension.storedState()).status?.state).toBe('online');
    expect(await extension.offscreenCount()).toBe(1);
    const snapshot = await extension.snapshot();
    expect(Boolean(snapshot?.name)).toBe(true);
    expect(Number.isFinite(snapshot?.energy)).toBe(true);
    popup = await extension.popup();
    await expect(popup.locator('#status')).toHaveText('En línea');
    await expect(popup.locator('#fly-card')).toBeVisible();
  });

  await test.step('reconectar después de cerrar el WebSocket real', async () => {
    await interruptOffscreenSocket(extension.context, extension.id);
    await expect.poll(async () => (await extension.storedState()).status?.state).not.toBe('online');
    // El popup puede conservar «En línea» hasta su siguiente refresco: exigir estado nuevo del runner.
    await expect.poll(async () => (await extension.storedState()).status?.state, { timeout: 45_000 })
      .toBe('online');
    await expect(popup.locator('#status')).toHaveText('En línea', { timeout: 45_000 });
    expect(Boolean((await extension.snapshot())?.name)).toBe(true);
    expect(await extension.offscreenCount()).toBe(1);
  });

  await test.step('reiniciar el navegador y reanudar la sesión guardada', async () => {
    await extension.restart();
    popup = await extension.popup();
    await expect.poll(() => extension.offscreenCount(), { timeout: 60_000 }).toBe(1);
    await expect.poll(async () => Boolean((await extension.snapshot())?.name), { timeout: 60_000 })
      .toBe(true);
    await expect.poll(async () => (await extension.storedState()).status?.state, { timeout: 60_000 })
      .toBe('online');
    await expect(popup.locator('#status')).toHaveText('En línea', { timeout: 60_000 });
    expect((await extension.storedState()).enabled).toBe(true);
    expect(await extension.offscreenCount()).toBe(1);
  });

  await test.step('detener y verificar que el siguiente arranque no vuelve a activarse', async () => {
    if (await popup.locator('#connection').getAttribute('open') === null) {
      await popup.locator('#connection > summary').click();
    }
    await popup.getByRole('button', { name: 'Detener', exact: true }).click();
    await expect(popup.locator('#status')).toHaveText('Detenida');
    await expect(popup.locator('#fly-card')).toBeHidden();
    await expect.poll(() => extension.offscreenCount()).toBe(0);
    expect((await extension.storedState()).enabled).toBe(false);
    await extension.restart();
    popup = await extension.popup();
    await expect(popup.locator('#status')).toHaveText('Detenida');
    await popup.waitForTimeout(1_600);
    expect((await extension.storedState()).enabled).toBe(false);
    expect(await extension.offscreenCount()).toBe(0);
  });

  expect(extension.errors).toEqual([]);
});
