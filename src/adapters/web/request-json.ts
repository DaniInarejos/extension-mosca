import { HTTP_TIMEOUT_MS } from '../../core/connection-policy';

/** Limita tanto la llegada de cabeceras como la lectura del cuerpo y permite cancelar al parar. */
export async function requestJson<T>(url: string, init: RequestInit, signal?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = globalThis.setTimeout(() => {
    controller.abort(new Error('Tiempo de espera agotado al contactar con moscas.lol.'));
  }, HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let data: T;
    try {
      data = await response.json() as T;
    } catch (error) {
      // Un timeout del cuerpo no es una respuesta JSON vacía.
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!(error instanceof SyntaxError)) throw error;
      data = {} as T;
    }
    return { response, data };
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
