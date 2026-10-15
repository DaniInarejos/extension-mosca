import { expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { brainMap } from '../scripts/brain-map.mjs';

it('agrega conexiones reales por grupo y descarta aristas internas sin inventar enlaces', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moscas-map-'));
  try {
    const bytes = Buffer.alloc(8 + 4 * 12 + 3 * 3);
    bytes.writeUInt32LE(3, 0); bytes.writeUInt32LE(4, 4);
    [[0, 1], [0, 2], [1, 2], [2, 0]].forEach(([pre, post], i) => { bytes.writeUInt32LE(pre, 8 + i * 12); bytes.writeUInt32LE(post, 12 + i * 12); bytes.writeFloatLE(1, 16 + i * 12); });
    [0, 0, 1].forEach((group, i) => bytes.writeUInt16LE(group, 8 + 4 * 12 + i * 3 + 1));
    await writeFile(join(dir, 'connectome.bin.gz'), gzipSync(bytes));
    await writeFile(join(dir, 'neuron_meta.json'), JSON.stringify({ neuron_count: 3, edge_count: 4, group_count: 2, groups: [{ id: 0, name: 'a', region: 'sensory', neuron_count: 2 }, { id: 1, name: 'b', region: 'motor', neuron_count: 1 }] }));
    const map = await brainMap(dir);
    expect(map.links).toEqual([{ source: 0, target: 1, count: 2 }, { source: 1, target: 0, count: 1 }]);
    expect(map.groups.map((group: { neurons: number }) => group.neurons)).toEqual([2, 1]);
    bytes.writeUInt32LE(4, 0);
    await writeFile(join(dir, 'connectome.bin.gz'), gzipSync(bytes));
    await expect(brainMap(dir)).rejects.toThrow('no coincide');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
