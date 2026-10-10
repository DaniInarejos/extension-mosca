import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DesktopSession } from './session';

let desktop: DesktopSession;
test.beforeEach(async () => { desktop = new DesktopSession(); await desktop.launch(); });
test.afterEach(async () => { await desktop.dispose(); });

test('ventana aislada, controles sin sesión y token inválido sin activar', async () => {
  expect(await desktop.page.evaluate(() => ({ node: typeof (window as unknown as { require?: unknown }).require, keys: Object.keys(window.moscas).sort() }))).toEqual({ node: 'undefined', keys: ['brain', 'forget', 'hide', 'login', 'quit', 'saveToken', 'start', 'state', 'stop', 'website'] });
  expect((await desktop.state()).enabled).toBe(false);
  await expect(desktop.page.locator('#session-toggle')).toHaveText('Conectar');
  await expect(desktop.page.locator('#session-toggle')).toBeDisabled();
  await expect(desktop.page.locator('#session-hint')).toContainText('Guarda un token');
  await desktop.page.getByLabel('Token de dispositivo', { exact: true }).fill('incompleto');
  await expect(desktop.page.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await expect(desktop.page.getByRole('button', { name: 'Guardar token', exact: true })).toBeDisabled();
  await expect(desktop.page.locator('#token-hint')).toContainText('Revisa el token');
  expect((await desktop.diagnostics()).brains).toEqual([]);
  expect((await desktop.state()).hasToken).toBe(false);
  await expect(desktop.page.getByLabel('Abrir al iniciar sesión')).toBeDisabled();
});

test('guardar el token habilita Conectar sin iniciar; Olvidar vuelve a bloquearlo', async () => {
  await desktop.page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#token')!;
    input.value = `fly_device_${'a'.repeat(64)}`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(desktop.page.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await desktop.page.getByRole('button', { name: 'Guardar token', exact: true }).click();
  await expect(desktop.page.getByRole('button', { name: 'Conectar', exact: true })).toBeEnabled();
  expect((await desktop.state()).hasToken).toBe(true);
  expect(await desktop.diagnostics()).toMatchObject({ enabled: false, brains: [], state: 'idle' });
  expect(await desktop.page.locator('#token').inputValue()).toBe('');
  const stored = await readFile(join(desktop.profile, 'settings.json'), 'utf8');
  expect(stored.includes(`fly_device_${'a'.repeat(64)}`)).toBe(false);
  await desktop.restart();
  await expect(desktop.page.getByRole('button', { name: 'Conectar', exact: true })).toBeEnabled();
  expect((await desktop.diagnostics()).brains).toEqual([]);
  await desktop.page.locator('#connection summary').click();
  await desktop.page.getByRole('button', { name: 'Olvidar dispositivo', exact: true }).click();
  await expect(desktop.page.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await expect(desktop.page.locator('#session-hint')).toContainText('Guarda un token');
});

test('cerrar oculta; activar vuelve a mostrar; Salir termina el proceso', async () => {
  await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/index.html'))!.close());
  expect(await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/index.html'))!.isVisible())).toBe(false);
  await desktop.app.evaluate(({ app }) => app.emit('activate'));
  expect(await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/index.html'))!.isVisible())).toBe(true);
  const closed = desktop.app.waitForEvent('close');
  await desktop.page.getByRole('button', { name: 'Salir', exact: true }).click();
  await closed;
});

test('Detener queda persistido al reiniciar y no se crean cerebros al despertar', async () => {
  await desktop.page.evaluate(() => window.moscas.stop());
  const stored = JSON.parse(await readFile(join(desktop.profile, 'settings.json'), 'utf8'));
  expect(stored).toEqual({ version: 1, enabled: false });
  await desktop.restart();
  await desktop.app.evaluate(({ powerMonitor }) => { powerMonitor.emit('suspend'); powerMonitor.emit('resume'); });
  expect(await desktop.diagnostics()).toMatchObject({ enabled: false, brains: [], powerBlocker: false });
});

test('segunda instancia cede su bloqueo sin crear una ventana ni sesión', async () => {
  const { spawn } = await import('node:child_process');
  const electron = (await import('electron')).default as unknown as string;
  const { resolve } = await import('node:path');
  const env: NodeJS.ProcessEnv = { ...process.env, MOSCAS_DESKTOP_PROFILE: desktop.profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MOSCAS_DEVICE_TOKEN;
  const child = spawn(electron, [resolve('dist-desktop/main.cjs')], { env, stdio: 'ignore' });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('La segunda instancia no termina.')), 10_000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
    });
    expect(code).toBe(0);
    expect((await desktop.diagnostics()).enabled).toBe(false);
    expect(await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally { child.kill(); }
});

test('el almacén nativo cifra y descifra sin devolver el secreto a la ventana', async () => {
  const result = await desktop.app.evaluate(({ safeStorage }) => {
    const value = `fly_device_${'a'.repeat(64)}`;
    const available = safeStorage.isEncryptionAvailable();
    if (!available) return { available, encrypted: false, roundtrip: false };
    const encrypted = safeStorage.encryptString(value);
    return { available, encrypted: !encrypted.includes(value), roundtrip: safeStorage.decryptString(encrypted) === value };
  });
  expect(result).toEqual({ available: true, encrypted: true, roundtrip: true });
});

test('una configuración antigua de mosca de escritorio no crea ventanas adicionales ni controles', async () => {
  await desktop.quit();
  await writeFile(join(desktop.profile, 'settings.json'), JSON.stringify({ version: 1, enabled: false, companionVisible: true, companionPosition: { x: 200, y: 200 } }));
  await desktop.launch();
  await expect(desktop.page.getByLabel('Mosca en el escritorio', { exact: true })).toHaveCount(0);
  expect(await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  expect((await desktop.diagnostics()).brains).toEqual([]);
  expect((await desktop.state()).enabled).toBe(false);
  await expect(desktop.page.locator('#garden')).toBeHidden();
  await expect(desktop.page.locator('#fly-card')).toBeHidden();
  await expect(desktop.page.locator('#status')).toHaveText('Sesión cerrada');
  await expect(desktop.page.getByRole('button', { name: /Abrir el jardín/ })).toBeVisible();
});

test('la vista cerebral es opcional, accesible y no inicia una simulación al abrirse', async () => {
  const panel = desktop.page.locator('#brain-view');
  await expect(panel).not.toHaveAttribute('open');
  expect(await desktop.page.evaluate(() => window.moscas.brain())).toBeUndefined();
  await panel.locator('summary').click();
  await desktop.page.locator('#brain-canvas').scrollIntoViewIfNeeded();
  await expect(desktop.page.locator('#brain-state')).toHaveText('Sin actividad local');
  await expect(desktop.page.locator('#brain-fired')).toHaveText('—');
  await expect(desktop.page.locator('#brain-canvas')).toHaveAttribute('aria-label', /Sin actividad local reciente/);
  await expect(panel.locator('select')).toHaveCount(0);
  await expect(panel.locator('.brain-stage-heading')).toContainText('Todos los grupos');
  expect((await desktop.page.locator('#brain-canvas').boundingBox())!.height).toBe(180);
  await desktop.page.emulateMedia({ reducedMotion: 'reduce' });
  const pixels = () => desktop.page.locator('#brain-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const beforeRotation = await pixels();
  await desktop.page.getByRole('button', { name: 'Girar cerebro a la derecha', exact: true }).click();
  expect(await pixels()).not.toBe(beforeRotation);
  await desktop.page.getByRole('button', { name: 'Centrar', exact: true }).click();
  expect(await pixels()).toBe(beforeRotation);
  const canvas = desktop.page.locator('#brain-canvas');
  const bounds = (await canvas.boundingBox())!;
  await desktop.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await desktop.page.mouse.down();
  await desktop.page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2, { steps: 8 });
  await desktop.page.mouse.up();
  expect(await pixels()).not.toBe(beforeRotation);
  await panel.locator('summary').click();
  expect((await desktop.diagnostics()).brains).toEqual([]);
  expect((await desktop.state()).enabled).toBe(false);
});
