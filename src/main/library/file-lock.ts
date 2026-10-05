import { resolve } from 'node:path';

// Изменения одного файла (прочитать → изменить → записать) выполняются строго по очереди, иначе два почти
// одновременных изменения прочитают одно и то же, и второе затрёт первое.
const queues = new Map<string, Promise<unknown>>();

/** Выполнить work после всего, что раньше поставлено для этого файла. Сбой одной работы не мешает следующим. */
export function withFileLock<T>(file: string, work: () => Promise<T>): Promise<T> {
  const key = resolve(file);
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(work);
  const settled = run.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}
