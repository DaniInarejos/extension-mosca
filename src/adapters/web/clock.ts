import type { Clock } from '../../core/ports';

export const webClock: Clock = {
  now: () => performance.now(),
  timestamp: () => Date.now(),
  setTimeout(callback, delay) {
    const timer = globalThis.setTimeout(callback, delay);
    return () => globalThis.clearTimeout(timer);
  },
  setInterval(callback, delay) {
    const timer = globalThis.setInterval(callback, delay);
    return () => globalThis.clearInterval(timer);
  },
};
