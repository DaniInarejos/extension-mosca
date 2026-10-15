import { expect, it } from 'vitest';
import { gardenView } from '../src/clients/desktop/presentation';

it('el contexto ambiental solo usa el reloj del stream y marca los datos antiguos', () => {
  expect(gardenView().fresh).toBe(false);
  const garden = { timestamp: 100_000, receivedAt: 1000 };
  expect(gardenView(garden, 1000)).toMatchObject({ phase: 'dawn', phaseLabel: 'Amanecer', fresh: true });
  expect(gardenView(garden, 92_000)).toMatchObject({ fresh: false, detail: 'Sin datos recientes. Esperando conexión.' });
});
