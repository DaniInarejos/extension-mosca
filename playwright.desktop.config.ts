import { defineConfig } from '@playwright/test';
const live = process.env.MOSCAS_DESKTOP_LIVE === '1';
export default defineConfig({
  testDir: './tests/desktop', testMatch: live ? '**/*.live.spec.ts' : '**/*.smoke.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: Boolean(process.env.CI),
  timeout: live ? 240_000 : 40_000, expect: { timeout: 10_000 },
  reporter: [['list']], outputDir: 'test-results/desktop',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
