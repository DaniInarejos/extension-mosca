import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!/^fly_device_[a-f0-9]{64}$/.test(process.env.MOSCAS_DEVICE_TOKEN ?? '')) {
  console.error('Define MOSCAS_DEVICE_TOKEN con un token de dispositivo válido antes de ejecutar las pruebas reales.');
  process.exit(1);
}

const cli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
const result = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, MOSCAS_E2E_LIVE: '1' },
});
if (result.error) console.error('No se pudo iniciar Playwright.');
process.exit(result.status ?? 1);
