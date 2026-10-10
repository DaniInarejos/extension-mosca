import { test, expect } from '@playwright/test';
import { DesktopSession } from './session';
import type { DeviceDisplayResponse, PublicWorldResponse } from '../../src/core/api/public-contract';

/** Solo servicio real; sin trazas, capturas, identidades ni credenciales en informes. */
test('cerebro visible y movimiento confirmado por el jardín real, sin mosca de escritorio', async () => {
  const desktop = new DesktopSession();
  let readPresence = false;
  const headers = { Authorization: `Bearer ${process.env.MOSCAS_DEVICE_TOKEN}` };
  try {
    await desktop.launch();
    await desktop.start();
    await desktop.page.locator('#brain-view summary').click();
    await desktop.page.locator('#brain-canvas').scrollIntoViewIfNeeded();
    await expect(desktop.page.locator('#brain-state')).toHaveText('En vivo');
    const first = await desktop.page.evaluate(() => window.moscas.brain());
    expect(first?.neurons).toBe(139_255);
    await expect.poll(async () => (await desktop.page.evaluate(() => window.moscas.brain()))?.tick ?? 0).toBeGreaterThan(first!.tick);
    await expect(desktop.page.locator('#brain-fired')).not.toHaveText('—');

    const response = await fetch('https://moscas.lol/api/device/state?view=display', { headers, signal: AbortSignal.timeout(15_000) });
    readPresence = true;
    expect(response.status).toBe(200);
    const { fly } = await response.json() as DeviceDisplayResponse;
    // Contrastar con la posición publicada por el servidor, no solo con el contador local.
    await expect.poll(async () => {
      const response = await fetch('https://moscas.lol/api/world', { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) { await response.body?.cancel(); return false; }
      const world = await response.json() as PublicWorldResponse;
      const current = world.flies.find((other) => other.flyId === fly.flyId);
      return Boolean(current && Math.hypot(...current.position.map((value, index) => value - fly.position[index])) > .02);
    }, { timeout: 60_000, intervals: [1000, 2000, 4000] }).toBe(true);

    expect(await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(desktop.page.getByLabel('Mosca en el escritorio', { exact: true })).toHaveCount(0);
    await expect(desktop.page.locator('#fly-card > #garden')).toBeVisible();
    await expect(desktop.page.locator('#session-toggle')).toHaveText('Desconectar');
    await expect(desktop.page.locator('#session-hint')).toContainText('detiene el cerebro y cierra la sesión');
    await desktop.page.getByRole('button', { name: 'Desconectar', exact: true }).click();
    await desktop.page.locator('#brain-canvas').scrollIntoViewIfNeeded();
    await expect(desktop.page.locator('#brain-state')).toHaveText('Sin actividad local');
    expect(await desktop.page.evaluate(() => window.moscas.brain())).toBeUndefined();
    await expect(desktop.page.locator('#status')).toHaveText('Sesión cerrada');
    await expect(desktop.page.locator('#session-toggle')).toHaveText('Conectar');
    await expect(desktop.page.locator('#fly-card')).toBeHidden();
    await expect(desktop.page.locator('#garden')).toBeHidden();
    expect(await desktop.state()).toMatchObject({ hasToken: true, enabled: false });
    expect((await desktop.state()).garden).toBeUndefined();
    expect((await desktop.state()).fly).toBeUndefined();
    expect(await desktop.diagnostics()).toMatchObject({ enabled: false, state: 'idle', brains: [], powerBlocker: false });
  } finally {
    try { await desktop.dispose(); }
    finally {
      // El GET de pantalla renueva presencia HTTP: liberarla además del WebSocket del test.
      if (readPresence) {
        const response = await fetch('https://moscas.lol/api/device/state', { method: 'DELETE', headers, signal: AbortSignal.timeout(15_000) });
        await response.body?.cancel();
      }
    }
  }
});
