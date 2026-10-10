import { availableParallelism, totalmem } from 'node:os';

/** Reserva CPU y memoria para el sistema; el núcleo reduce la oferta si hay sobrecarga. */
export function desktopCapacity(threads = availableParallelism(), memory = totalmem()) {
  const gib = memory / 1024 ** 3;
  if (threads < 4 || gib < 4) return 0;
  if (threads >= 8 && gib >= 6) return 3;
  return threads >= 6 ? 2 : 1;
}
