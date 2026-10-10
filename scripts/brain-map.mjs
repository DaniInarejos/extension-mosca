import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

/** Grafo agregado del mismo conectoma local. No contiene actividad ni datos de sesión. */
export async function brainMap(directory) {
  const metadata = JSON.parse(await readFile(join(directory, 'neuron_meta.json'), 'utf8'));
  const bytes = gunzipSync(await readFile(join(directory, 'connectome.bin.gz')));
  const neurons = bytes.readUInt32LE(0), edges = bytes.readUInt32LE(4);
  const offset = 8 + edges * 12;
  if (neurons !== metadata.neuron_count || edges !== metadata.edge_count || bytes.length < offset + neurons * 3)
    throw new Error('El mapa neuronal no coincide con el conectoma.');
  const size = metadata.group_count;
  const counts = new Uint32Array(size * size);
  const groups = new Uint16Array(neurons);
  for (let i = 0; i < neurons; i++) {
    groups[i] = bytes.readUInt16LE(offset + i * 3 + 1);
    if (groups[i] >= size) throw new Error('Grupo neuronal desconocido.');
  }
  for (let i = 0; i < edges; i++) {
    const pre = bytes.readUInt32LE(8 + i * 12), post = bytes.readUInt32LE(12 + i * 12);
    if (pre >= neurons || post >= neurons) throw new Error('Arista neuronal inválida.');
    if (groups[pre] !== groups[post]) counts[groups[pre] * size + groups[post]]++;
  }
  // Hasta tres salidas principales por grupo para mantener legible la ventana pequeña.
  const links = [];
  for (let source = 0; source < size; source++) {
    const outgoing = [];
    for (let target = 0; target < size; target++) {
      const count = counts[source * size + target];
      if (count) outgoing.push({ source, target, count });
    }
    links.push(...outgoing.sort((a, b) => b.count - a.count || a.target - b.target).slice(0, 3));
  }
  return { neurons, edges, groups: metadata.groups.map(({ id, name, region, neuron_count }) => ({ id, name, region, neurons: neuron_count })), links };
}
