import type { FlyState } from '../protocol/index';
import { environmentAt } from '../world/environment';

function identityOffset(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 4294967296 - 0.5) * 0.12;
}

/** Individual circadian tendency. It is continuous so the colony never sleeps in unison. */
export function circadianProfile(fly: Pick<FlyState, 'flyId'>, timestamp: number) {
  const environment = environmentAt(timestamp);
  const progress = Math.max(0, Math.min(1, environment.phaseProgress + identityOffset(fly.flyId)));
  let sleepPressure = 0.08;
  if (environment.phase === 'night') sleepPressure = 0.72 + Math.sin(progress * Math.PI) * 0.2;
  else if (environment.phase === 'day') {
    const siesta = Math.max(0, 1 - Math.abs(progress - 0.62) / 0.2);
    sleepPressure = 0.08 + siesta * 0.48;
  } else if (environment.phase === 'dusk') sleepPressure = 0.12 + progress * 0.42;
  else sleepPressure = 0.44 * (1 - progress) + 0.06;
  sleepPressure = Math.max(0, Math.min(1, sleepPressure));
  return {
    ...environment,
    sleepPressure,
    wakefulness: 1 - sleepPressure * 0.72,
    resting: sleepPressure >= 0.52,
    label: environment.phase === 'day' ? 'siesta' : 'sueño',
  };
}
