import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brainMap } from './brain-map.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist-desktop');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'neural-map.json'), JSON.stringify(await brainMap(resolve(root, 'public/brain'))));
await build({ entryPoints: ['src/clients/desktop/main.ts', 'src/clients/desktop/preload.ts'], outdir: output,
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], outExtension: { '.js': '.cjs' } });
await build({ entryPoints: ['src/clients/desktop/renderer.ts'], outdir: output,
  bundle: true, platform: 'browser', format: 'iife', target: 'chrome140', alias: { '@brain-map': resolve(output, 'neural-map.json') } });
await cp(resolve(root, 'public/brain'), resolve(output, 'brain'), { recursive: true });
await cp(resolve(root, 'licenses'), resolve(output, 'licenses'), { recursive: true });
for (const dependency of ['undici', 'zod'])
  await cp(resolve(root, 'node_modules', dependency, 'LICENSE'), resolve(output, 'licenses', `${dependency}-LICENSE.txt`));
for (const html of ['index.html'])
  await cp(resolve(root, 'src/clients/desktop', html), resolve(output, html));
for (const icon of ['tray.png', 'trayTemplate.png', 'app-icon.png'])
  await cp(resolve(root, 'src/clients/desktop', icon), resolve(output, icon));
// Solo puente de mensajería; kernel, modelo y readout idénticos al worker Chromium.
const worker = await readFile(resolve(root, 'public/brain/flywire-worker.js'), 'utf8');
await writeFile(resolve(output, 'brain/flywire-node.cjs'), `const { parentPort } = require('node:worker_threads');\nglobalThis.self = globalThis;\nself.postMessage = (message) => parentPort.postMessage(message);\nparentPort.on('message', (data) => self.onmessage({ data }));\n${worker}`);
await writeFile(resolve(output, 'package.json'), JSON.stringify({ name: 'moscas-desktop', productName: 'Moscas', version: '0.1.0', main: 'main.cjs', description: 'Compañero de escritorio para moscas.lol', author: 'Contribuidores de Moscas' }, null, 2));
console.log('Cliente de escritorio generado en dist-desktop/.');
