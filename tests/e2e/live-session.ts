import type { Page } from '@playwright/test';
import { expect, type ExtensionSession } from './extension';

export async function startSession(extension: ExtensionSession) {
  const token = process.env.MOSCAS_DEVICE_TOKEN;
  if (!/^fly_device_[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Falta MOSCAS_DEVICE_TOKEN.');
  const popup = await extension.popup();
  await expect(popup.getByLabel('Servidor', { exact: true })).toHaveValue('https://moscas.lol');
  await popup.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>('#token')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, token!);
  await popup.getByRole('button', { name: 'Iniciar cerebro' }).click();
  return popup;
}

export async function expectOnline(extension: ExtensionSession) {
  await expect.poll(async () => {
    if ((await extension.storedState()).status?.state !== 'online') return false;
    try { return Boolean((await extension.snapshot())?.name); }
    catch { return false; }
  }, { timeout: 60_000 }).toBe(true);
  expect(await extension.offscreenCount()).toBe(1);
}

export async function stopSession(extension: ExtensionSession, popup: Page) {
  if (await popup.locator('#connection').getAttribute('open') === null)
    await popup.locator('#connection > summary').click();
  await popup.getByRole('button', { name: 'Detener', exact: true }).click();
  await expect.poll(() => extension.offscreenCount()).toBe(0);
  await expect.poll(async () => (await extension.storedState()).enabled).toBe(false);
  await expect(popup.locator('#status')).toHaveText('Detenida');
}
