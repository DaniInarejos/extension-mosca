import type { DayPhase } from '../world/environment';

export const NATURAL_GARDEN_EVENTS = {
  rain: { label: 'Lluvia suave', phases: ['dawn', 'day', 'dusk', 'night'] },
  wind: { label: 'Viento entre las hojas', phases: ['dawn', 'day', 'dusk'] },
  petals: { label: 'Lluvia de pétalos', phases: ['dawn', 'day', 'dusk'] },
  bloom: { label: 'Floración repentina', phases: ['dawn', 'day'] },
  ants: { label: 'Procesión de hormigas', phases: ['dawn', 'day', 'dusk'] },
  'shooting-stars': { label: 'Estrellas fugaces', phases: ['night'] },
  moon: { label: 'Luna brillante', phases: ['night'] },
  fog: { label: 'Niebla baja', phases: ['dawn', 'night'] },
  fireflies: { label: 'Danza de luciérnagas', phases: ['dusk', 'night'] },
  'ripe-fruit': { label: 'Fruta madura', phases: ['dawn', 'day', 'dusk', 'night'] },
} as const satisfies Record<string, { label: string; phases: readonly DayPhase[] }>;

export type NaturalGardenEventCode = keyof typeof NATURAL_GARDEN_EVENTS;

export interface NaturalGardenEvent {
  id: string;
  code: NaturalGardenEventCode;
  startedAt: number;
  endsAt: number;
  /** Stable visual variation shared by every browser. */
  seed: number;
}

export interface NaturalGardenSchedule {
  active?: NaturalGardenEvent;
  nextAt: number;
  lastCode?: NaturalGardenEventCode;
}

export const NATURAL_EVENT_POLICY = {
  durationMs: 5 * 60_000,
  minDelayMs: 10 * 60_000,
  maxDelayMs: 30 * 60_000,
} as const;
