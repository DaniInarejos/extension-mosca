import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DesktopState } from '../../src/clients/desktop/contracts';

export class DesktopSession {
  app!: ElectronApplication;
  page!: Page;
  profile = '';
  constructor(private proxy?: string) {}
  async launch() {
    if (!this.profile) this.profile = await mkdtemp(join(tmpdir(), 'moscas-desktop-'));
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !['MOSCAS_DEVICE_TOKEN', 'ELECTRON_RUN_AS_NODE'].includes(entry[0])));
    this.app = await _electron.launch({ args: [resolve('dist-desktop/main.cjs')], env: { ...env, MOSCAS_DESKTOP_PROFILE: this.profile, ...(this.proxy ? { MOSCAS_DESKTOP_PROXY: this.proxy } : {}) }, timeout: 20_000 });
    await this.selectMainWindow();
  }
  async selectMainWindow() {
    await expect.poll(() => this.app.windows().some((page) => page.url().endsWith('/index.html'))).toBe(true);
    this.page = this.app.windows().find((page) => page.url().endsWith('/index.html'))!;
    await this.page.waitForFunction(() => Boolean(window.moscas));
  }
  state(): Promise<DesktopState> { return this.page.evaluate(() => window.moscas.state()); }
  diagnostics() {
    return this.app.evaluate((_electron, path) => process.getBuiltinModule('module').createRequire(path)(path).diagnostics() as { enabled: boolean; state: string; hasFly: boolean; brains: { tick: number; neurons: number }[]; powerBlocker: boolean }, resolve('dist-desktop/main.cjs'));
  }
  async start() {
    const token = process.env.MOSCAS_DEVICE_TOKEN;
    if (!/^fly_device_[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Falta MOSCAS_DEVICE_TOKEN.');
    // Sin acciones fill ni expect que impriman el valor en los informes.
    await this.page.evaluate((value) => { const input = document.querySelector<HTMLInputElement>('#token')!; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, token!);
    await this.page.getByRole('button', { name: 'Guardar token', exact: true }).click();
    expect((await this.state()).enabled).toBe(false);
    expect((await this.diagnostics()).brains).toEqual([]);
    await this.page.getByRole('button', { name: 'Conectar', exact: true }).click();
    await this.online();
  }
  async online() {
    await expect.poll(async () => {
      const value = await this.diagnostics();
      return value.state === 'online' && value.hasFly && value.brains.some((brain) => brain.tick > 2);
    }, { timeout: 75_000 }).toBe(true);
  }
  async quit() {
    const closed = this.app.waitForEvent('close');
    await this.app.evaluate(({ app }) => app.quit());
    await closed;
  }
  async restart() { await this.quit(); await this.launch(); }
  async dispose() {
    try { await this.app?.close(); } catch { /* Ya cerrada. */ }
    if (this.profile) await rm(this.profile, { recursive: true, force: true });
  }
}
