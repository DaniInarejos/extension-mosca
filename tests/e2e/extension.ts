import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { RunnerStatus, FlySnapshot } from '../../src/core/types';
import { OutageProxy } from './outage-proxy';

export class ExtensionSession {
  context!: BrowserContext;
  worker!: Worker;
  id = '';
  readonly errors: string[] = [];

  constructor(private profile: string, private proxyServer?: string) {}

  async launch() {
    const extensionPath = resolve('dist');
    this.context = await chromium.launchPersistentContext(this.profile, {
      channel: 'chromium',
      headless: true,
      proxy: this.proxyServer ? { server: this.proxyServer } : undefined,
      // Conservar las políticas normales de segundo plano del navegador.
      ignoreDefaultArgs: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
      args: [
        ...(this.proxyServer ? ['--disable-quic'] : []),
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    this.context.setDefaultTimeout(10_000);
    this.context.on('weberror', () => {
      // No incluir errores remotos que puedan contener un ticket o un token.
      this.errors.push('Error JavaScript no controlado en el cliente');
    });
    this.worker = this.context.serviceWorkers()[0]
      ?? await this.context.waitForEvent('serviceworker');
    this.id = new URL(this.worker.url()).host;
    // Esperar a que el background haya registrado sus manejadores.
    await this.worker.evaluate(() => chrome.runtime.id);
  }

  async popup(): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(`chrome-extension://${this.id}/popup.html`);
    await page.waitForLoadState('networkidle');
    return page;
  }

  async restart() {
    await this.context.close();
    await this.launch();
  }

  async offscreenCount() {
    return this.worker.evaluate(async () => (await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    })).length);
  }

  async storedState(): Promise<{ enabled: boolean; status?: RunnerStatus }> {
    return this.worker.evaluate(async () => {
      const { config, status } = await chrome.storage.local.get(['config', 'status']);
      // El token no debe salir del perfil en las aserciones ni en los logs.
      return {
        enabled: Boolean((config as { enabled?: boolean } | undefined)?.enabled),
        status: status as RunnerStatus | undefined,
      };
    });
  }

  async snapshot(): Promise<FlySnapshot | undefined> {
    return this.worker.evaluate(() => chrome.runtime.sendMessage({ type: 'RUNNER_SNAPSHOT' }));
  }

  async dispose() {
    try {
      // Cerrar el contexto libera sockets y workers incluso cuando falla una prueba.
      await this.context?.close();
    } finally {
      await rm(this.profile, { recursive: true, force: true });
    }
  }
}

export const test = base.extend<{
  extension: ExtensionSession;
  useOutageProxy: boolean;
  network: OutageProxy | undefined;
}>({
  useOutageProxy: [false, { option: true }],
  network: async ({ useOutageProxy }, use, testInfo) => {
    if (!useOutageProxy) { await use(undefined); return; }
    const proxy = new OutageProxy();
    try {
      await proxy.start();
      await use(proxy);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('red-de-pruebas', {
          body: JSON.stringify(proxy.diagnostics()), contentType: 'application/json',
        });
      }
      await proxy.dispose();
    }
  },
  extension: async ({ network }, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'moskas-playwright-'));
    const session = new ExtensionSession(profile, network?.url);
    try {
      await session.launch();
      await use(session);
    } finally {
      await session.dispose();
    }
  },
});

export { expect } from '@playwright/test';
