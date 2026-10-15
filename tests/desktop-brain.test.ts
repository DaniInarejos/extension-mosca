import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { DesktopBrain } from '../src/adapters/desktop/brain';

it('carga los assets reales y avanza el kernel en un worker Node, sin DOM', async () => {
  const brain = new DesktopBrain(resolve('dist-desktop/brain'), 5);
  try {
    await brain.initialize();
    expect(brain.getActivity().neurons).toBeGreaterThan(100_000);
    await expect.poll(() => brain.getActivity().tick, { timeout: 10_000 }).toBeGreaterThan(2);
    brain.dispose();
    const tick = brain.getActivity().tick;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(brain.getActivity().tick).toBe(tick);
  } finally { brain.dispose(); }
}, 30_000);
it('cancelar durante la carga rechaza el inicio sin dejar un worker vivo', async () => {
  const brain = new DesktopBrain(resolve('dist-desktop/brain'));
  const pending = brain.initialize();
  brain.dispose();
  await expect(pending).rejects.toThrow();
  expect(brain.getActivity().tick).toBe(0);
});
it('un asset ausente falla de forma acotada', async () => {
  const brain = new DesktopBrain(resolve('dist-desktop/ausente'));
  await expect(brain.initialize()).rejects.toThrow();
  brain.dispose();
});
