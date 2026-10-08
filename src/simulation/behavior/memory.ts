import type { BodyMemory } from '../protocol/index';

/** Approximate rest/hunger during absence; never fabricate neural behavior counters. */
export function ageBodyMemory(value: BodyMemory, seconds: number): BodyMemory {
  const elapsed = Math.max(0, Math.min(86400 * 365, seconds));
  return {
    ...structuredClone(value),
    fatigue: Math.max(0, value.fatigue - elapsed * 0.12),
    satiety: Math.max(0, value.satiety - elapsed * 0.004),
    wingFatigue: Math.max(0, value.wingFatigue - elapsed * 0.03),
    flightLoad: Math.max(0, value.flightLoad - elapsed * 0.005),
    refractory: Math.max(0, value.refractory - elapsed),
  };
}
