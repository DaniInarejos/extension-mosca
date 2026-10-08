export const DAY_CYCLE_MS = 60 * 60_000;
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

const smooth = (value: number) => value * value * (3 - 2 * value);

/** Shared one-hour day, sampled from server time so every visitor sees the same phase. */
export function environmentAt(timestamp: number) {
  const cycle = (((timestamp % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  const phaseIndex = Math.min(3, Math.floor(cycle * 4));
  const phaseProgress = cycle * 4 - phaseIndex;
  const phase = (['dawn', 'day', 'dusk', 'night'] as const)[phaseIndex];
  const transition = smooth(phaseProgress);
  const light =
    phase === 'dawn'
      ? 0.12 + transition * 0.78
      : phase === 'day'
        ? 0.9 + Math.sin(phaseProgress * Math.PI) * 0.06
        : phase === 'dusk'
          ? 0.9 - transition * 0.78
          : 0.12 + Math.sin(phaseProgress * Math.PI) * 0.03;
  return {
    cycle,
    phase,
    phaseProgress,
    phaseRemainingMs: (1 - phaseProgress) * (DAY_CYCLE_MS / 4),
    light,
    wind: windAt(timestamp).strength,
    temperature: 21 + 3 * Math.sin(cycle * Math.PI * 2 - Math.PI / 4),
  };
}
export type GardenEnvironment = ReturnType<typeof environmentAt>;

/** Shared breeze: bounded gusts and a slowly changing direction, never random per frame. */
export function windAt(timestamp: number) {
  const angle = -0.6 + Math.sin(timestamp / 93000) * 0.45;
  const gust = Math.max(0, Math.sin(timestamp / 17000)) ** 10;
  return {
    x: Math.cos(angle),
    z: Math.sin(angle),
    gust,
    strength: 0.15 + 0.08 * Math.sin(timestamp / 45000) * Math.sin(timestamp / 12300) + gust * 0.12,
  };
}
