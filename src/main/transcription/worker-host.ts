// Запуск процесса расшифровки (Electron utilityProcess) для очереди. Проверяется сквозными тестами.
import { constants as osConstants, setPriority } from 'node:os';
import { join } from 'node:path';
import { utilityProcess } from 'electron';
import type { Logger } from '../logger';
import type { MainToWorker } from './protocol';
import type { WorkerHandle } from './queue';
import { spawnGate } from './spawn-gate';

/** Файл процесса рядом с main (electron.vite.config.ts: вход transcription-worker). */
const WORKER_FILE = 'transcription-worker.js';

export function spawnTranscriptionWorker(logger: Logger): WorkerHandle {
  const child = utilityProcess.fork(join(__dirname, WORKER_FILE), [], { serviceName: 'TextMeet — расшифровка' });
  const gate = spawnGate<MainToWorker>(child);
  child.once('spawn', () => {
    if (!gate.started() || child.pid === undefined) return;
    try {
      // Расшифровка не должна мешать созвону и записи (спецификация Плана 3, §5.3).
      setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      // Не удалось понизить приоритет — не страшно.
    }
  });
  // Неисправимая ошибка V8 в процессе; за ней последует exit — его разбирает очередь.
  child.on('error', (type, location) => logger.error(`Процесс расшифровки: ${type} (${location})`));
  return {
    send: (message) => gate.send(message),
    kill: () => gate.kill(),
    onMessage: (listener) => {
      child.on('message', listener);
    },
    onExit: (listener) => {
      child.on('exit', listener);
    },
  };
}
