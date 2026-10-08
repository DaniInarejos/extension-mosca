import { test, expect } from './extension';
import { startSession, expectOnline, stopSession } from './live-session';

test.use({ useOutageProxy: true });

test('arranca sin red, recupera cortes repetidos sin popup y reanuda tras reiniciar sin red', async ({ extension, network }) => {
  const link = network!;
  link.cut();
  let popup = await startSession(extension);
  await expect.poll(() => link.blockedAttempts, { timeout: 25_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await extension.storedState()).status?.state, { timeout: 25_000 }).toBe('error');
  expect(link.established).toBe(0);
  expect((await extension.storedState()).enabled).toBe(true);
  link.restore();
  await expectOnline(extension);
  expect(link.established).toBeGreaterThan(0);
  await popup.close();

  for (let cycle = 0; cycle < 2; cycle++) {
    const previousAttempts = link.blockedAttempts;
    const previousConnections = link.established;
    const bytes = link.forwardedBytes;
    link.cut();
    await expect.poll(async () => (await extension.storedState()).status?.state).not.toBe('online');
    await expect.poll(() => link.blockedAttempts, { timeout: 25_000 }).toBeGreaterThan(previousAttempts);
    expect(link.forwardedBytes).toBe(bytes);
    expect(Boolean(await extension.snapshot())).toBe(false);
    link.restore();
    await expectOnline(extension);
    expect(link.established).toBeGreaterThan(previousConnections);
    expect(link.forwardedBytes).toBeGreaterThan(bytes);
  }

  link.cut();
  await extension.restart();
  await expect.poll(() => link.blockedAttempts, { timeout: 25_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await extension.storedState()).status?.state, { timeout: 25_000 }).toBe('error');
  expect((await extension.storedState()).enabled).toBe(true);
  link.restore();
  await expectOnline(extension);
  popup = await extension.popup();
  await stopSession(extension, popup);
  expect(extension.errors).toEqual([]);
});

test('detecta una conexión silenciosa, limita la espera HTTP y recupera el servicio real', async ({ extension, network }) => {
  const link = network!;
  const popup = await startSession(extension);
  await expectOnline(extension);
  expect(link.established).toBeGreaterThan(0);
  expect(link.forwardedBytes).toBeGreaterThan(0);
  const previousConnections = link.established;
  link.stall();
  const bytes = link.forwardedBytes;
  await expect.poll(async () => (await extension.storedState()).status?.state, { timeout: 55_000 })
    .not.toBe('online');
  expect(link.forwardedBytes).toBe(bytes);
  expect(Boolean(await extension.snapshot())).toBe(false);
  await expect.poll(() => link.blockedAttempts, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await extension.storedState()).status?.detail, { timeout: 25_000 })
    .toContain('Tiempo de espera agotado');
  link.restore();
  await expectOnline(extension);
  expect(link.established).toBeGreaterThan(previousConnections);
  expect(link.forwardedBytes).toBeGreaterThan(bytes);
  await stopSession(extension, popup);
  expect(extension.errors).toEqual([]);
});

test('detener con una petición atascada cancela el arranque aunque vuelva la red o se reinicie', async ({ extension, network }) => {
  const link = network!;
  link.stall();
  let popup = await startSession(extension);
  await expect.poll(() => link.blockedAttempts).toBeGreaterThan(0);
  await expect.poll(async () => (await extension.storedState()).status?.state).toBe('connecting');
  await stopSession(extension, popup);
  link.restore();
  // Chromium puede terminar/reintentar un handshake TLS ya iniciado tras cancelar fetch.
  // Comprobar el runner durante todo el límite HTTP, no contar esos intentos de transporte.
  const deadline = Date.now() + 17_000;
  do {
    const state = await extension.storedState();
    expect(state.enabled).toBe(false);
    expect(state.status?.state).toBe('idle');
    expect(await extension.offscreenCount()).toBe(0);
    await popup.waitForTimeout(500);
  } while (Date.now() < deadline);
  await extension.restart();
  popup = await extension.popup();
  await popup.waitForTimeout(2_000);
  expect((await extension.storedState()).enabled).toBe(false);
  expect((await extension.storedState()).status?.state).toBe('idle');
  expect(await extension.offscreenCount()).toBe(0);
  expect(extension.errors).toEqual([]);
});
