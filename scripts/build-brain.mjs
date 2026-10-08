import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'src/brain');
const output = resolve(root, 'public/brain/flywire-worker.js');
const [kernel, adapter, readout] = await Promise.all([
  readFile(resolve(source, 'sim-worker.js'), 'utf8'),
  readFile(resolve(source, 'adapter-worker.js'), 'utf8'),
  readFile(resolve(source, 'motor-readout.json'), 'utf8'),
]);
await mkdir(resolve(root, 'public/brain'), { recursive: true });
await writeFile(output, `${kernel}\nvar flyworldReadout = ${readout};\n${adapter}\n`);
