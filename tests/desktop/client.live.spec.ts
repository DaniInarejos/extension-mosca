import { test, expect } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesktopSession } from './session';
import { OutageProxy } from '../e2e/outage-proxy';
import { ExtensionSession } from '../e2e/extension';
import { startSession, expectOnline, stopSession } from '../e2e/live-session';

let desktop: DesktopSession;
let network: OutageProxy;
test.beforeEach(async () => {
  network = new OutageProxy();
  await network.start();
  desktop = new DesktopSession(network.url);
  await desktop.launch();
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus) {
      await info.attach('transporte', { body: JSON.stringify(network?.diagnostics()), contentType: 'application/json' });
      try { await info.attach('runner', { body: JSON.stringify(await desktop.diagnostics()), contentType: 'application/json' }); }
      catch { /* Un fallo de arranque puede no dejar proceso que inspeccionar. */ }
    }
  } finally { try { await desktop?.dispose(); } finally { await network?.dispose(); } }
});

async function stopped() {
  await expect.poll(async () => {
    const state = await desktop.diagnostics();
    return !state.enabled && state.state === 'idle' && !state.hasFly && state.brains.length === 0 && !state.powerBlocker;
  }).toBe(true);
}

test('assets locales, ocultar/cerrar/destruir ventana, suspensión, reinicio y parada persistida', async () => {
  await desktop.start();
  const stored = await readFile(join(desktop.profile, 'settings.json'), 'utf8');
  expect(stored.includes(process.env.MOSCAS_DEVICE_TOKEN!)).toBe(false);
  expect((await desktop.state()).hasToken).toBe(true);
  expect(await desktop.page.locator('#token').inputValue()).toBe('');
  expect((await desktop.diagnostics()).powerBlocker).toBe(true);

  for (const operation of ['hide', 'close', 'destroy'] as const) {
    const previous = (await desktop.diagnostics()).brains[0].tick;
    await desktop.app.evaluate(({ BrowserWindow }, operation) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/index.html'))![operation](), operation);
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    expect((await desktop.diagnostics()).brains[0]?.tick ?? 0).toBeGreaterThan(previous + 15);
    expect((await desktop.diagnostics()).state).toBe('online');
    if (operation === 'destroy') {
      await desktop.app.evaluate(({ app }) => app.emit('activate'));
      await desktop.selectMainWindow();
      await desktop.page.waitForFunction(() => Boolean(window.moscas));
    }
  }
  await desktop.app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  expect(await desktop.diagnostics()).toMatchObject({ enabled: true, state: 'paused', brains: [], powerBlocker: false });
  await desktop.app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  await desktop.online();
  await desktop.restart();
  await desktop.online();
  await desktop.page.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await stopped();
  await desktop.restart();
  await stopped();
  await desktop.app.evaluate(({ powerMonitor }) => { powerMonitor.emit('suspend'); powerMonitor.emit('resume'); });
  await stopped();
});

test('cortes TCP repetidos sin ventana y reinicio durante una interrupción real', async () => {
  await desktop.start();
  await desktop.page.getByRole('button', { name: 'Ocultar ventana' }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    const established = network.established;
    network.cut();
    await expect.poll(async () => (await desktop.diagnostics()).state).not.toBe('online');
    expect((await desktop.diagnostics()).brains).toEqual([]);
    if (attempt === 1) await desktop.restart();
    expect((await desktop.diagnostics()).enabled).toBe(true);
    network.restore();
    await desktop.online();
    expect(network.established).toBeGreaterThan(established);
  }
  expect(network.forwardedBytes).toBeGreaterThan(0);
});

test('silencio TCP activa el watchdog; Detener cancela el ticket atascado', async () => {
  await desktop.start();
  network.stall();
  await expect.poll(async () => (await desktop.diagnostics()).state, { timeout: 55_000 }).not.toBe('online');
  expect((await desktop.diagnostics()).brains).toEqual([]);
  await expect.poll(() => network.blockedAttempts, { timeout: 15_000 }).toBeGreaterThan(0);
  // Dar tiempo al deadline HTTP real antes de recuperar el servicio.
  await expect.poll(() => network.blockedAttempts, { timeout: 25_000 }).toBeGreaterThan(1);
  network.restore();
  await desktop.online();
  await desktop.page.evaluate(() => window.moscas.stop());
  // Cerrar también el HTTP keep-alive de la recuperación: stall por sí solo puede
  // atascar un túnel reutilizado sin incrementar el contador de nuevos CONNECT.
  network.cut();
  network.stall();
  const attempts = network.blockedAttempts;
  await desktop.page.evaluate(() => window.moscas.start());
  await expect.poll(() => network.blockedAttempts).toBeGreaterThan(attempts);
  await desktop.page.evaluate(() => window.moscas.stop());
  await stopped();
  network.restore();
  const deadline = Date.now() + 17_000;
  while (Date.now() < deadline) {
    await stopped();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await desktop.restart();
  await stopped();
});

test('cede el control a otro cliente real y lo recupera cuando queda libre', async () => {
  await desktop.start();
  const profile = await mkdtemp(join(tmpdir(), 'moskas-playwright-'));
  const extension = new ExtensionSession(profile);
  try {
    await extension.launch();
    const popup = await startSession(extension);
    await expectOnline(extension);
    await expect.poll(async () => (await desktop.diagnostics()).state).toBe('paused');
    expect(await desktop.diagnostics()).toMatchObject({ enabled: true, brains: [], powerBlocker: false });
    await desktop.restart();
    await expect.poll(async () => (await desktop.diagnostics()).state).toBe('paused');
    await desktop.app.evaluate(({ powerMonitor }) => { powerMonitor.emit('suspend'); powerMonitor.emit('resume'); });
    await new Promise((resolve) => setTimeout(resolve, 16_000));
    expect((await desktop.diagnostics()).state).toBe('paused');
    expect((await extension.storedState()).status?.state).toBe('online');
    await stopSession(extension, popup);
    await desktop.online();
  } finally { await extension.dispose(); }
});


test('arranque sin red conserva la activación y recupera al volver el transporte', async () => {
  network.cut();
  const result = await desktop.page.evaluate((token) => window.moscas.start(token), process.env.MOSCAS_DEVICE_TOKEN!);
  expect(result.ok).toBe(true);
  await expect.poll(() => network.blockedAttempts).toBeGreaterThan(0);
  expect(await desktop.diagnostics()).toMatchObject({ enabled: true, hasFly: false, brains: [] });
  await desktop.restart();
  expect((await desktop.diagnostics()).enabled).toBe(true);
  network.restore();
  await desktop.online();
  expect(network.established).toBeGreaterThan(0);
});
