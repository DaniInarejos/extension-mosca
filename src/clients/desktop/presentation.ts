import type { GardenSnapshot } from '../../core/types';
import { environmentAt } from '../../core/simulation/world/environment';

/** Solo contexto ambiental del stream de la sesión; sin eventos ni consultas públicas. */
export function gardenView(garden?: GardenSnapshot, now = Date.now()) {
  if (!garden) return { phase: 'unknown', phaseLabel: 'El jardín', detail: 'Esperando información de la conexión.', fresh: false };
  const age = Math.max(0, now - garden.receivedAt);
  const fresh = age < 90_000;
  const environment = environmentAt(garden.timestamp + (fresh ? age : 0));
  return {
    phase: environment.phase,
    phaseLabel: { dawn: 'Amanecer', day: 'Día', dusk: 'Atardecer', night: 'Noche' }[environment.phase],
    fresh,
    detail: fresh ? `${Math.round(environment.temperature)} °C · Conectado al jardín` : 'Sin datos recientes. Esperando conexión.',
  };
}
