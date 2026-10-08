import { defineConfig } from '@playwright/test';

const live = process.env.MOSCAS_E2E_LIVE === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: live ? 180_000 : 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list', { printSteps: live }]],
  outputDir: 'test-results/e2e',
  use: {
    headless: true,
    // Las pruebas reales usan credenciales: no guardar trazas, capturas ni vídeos.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{
    name: live ? 'chromium-live' : 'chromium',
    testMatch: live ? '**/*.live.spec.ts' : '**/*.smoke.spec.ts',
  }],
});
