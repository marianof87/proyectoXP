/**
 * Ejecuta `tasks` con como máximo `limit` en vuelo a la vez (un semáforo).
 *
 * Node es de un solo hilo: lo "paralelo" aquí son peticiones intercaladas en
 * el bucle de eventos. Cada tarea está aislada: si una lanza, las demás
 * siguen y el resultado queda en su posición como `{ ok: false }`.
 */
export type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export const runPool = async <T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<Settled<T>>> => {
  const results = new Array<Settled<T>>(tasks.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await tasks[index]() };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  };

  const workers = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
};
