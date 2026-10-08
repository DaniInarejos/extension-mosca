/** Conservative automatic ceiling for extra brains on the current device. */
export function volunteerCapacity(navigatorLike: Navigator = navigator) {
  const hardware = navigatorLike.hardwareConcurrency || 2;
  const memory = (navigatorLike as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const saveData = (navigatorLike as Navigator & { connection?: { saveData?: boolean } }).connection
    ?.saveData;
  if (saveData || hardware < 4 || memory < 4) return 0;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse) return 1;
  if (hardware >= 8 && memory >= 6) return 3;
  if (hardware >= 6 && memory >= 4) return 2;
  return 1;
}
