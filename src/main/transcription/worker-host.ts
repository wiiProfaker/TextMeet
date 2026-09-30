// Запуск процесса расшифровки (Electron utilityProcess) для очереди. Проверяется сквозными тестами.
import { constants as osConstants, setPriority } from 'node:os';
import { join } from 'node:path';
import { utilityProcess } from 'electron';
import type { MainToWorker } from './protocol';
import type { WorkerHandle } from './queue';

/** Файл процесса рядом с main (electron.vite.config.ts: вход transcription-worker). */
const WORKER_FILE = 'transcription-worker.js';

export function spawnTranscriptionWorker(): WorkerHandle {
  const child = utilityProcess.fork(join(__dirname, WORKER_FILE), [], { serviceName: 'TextMeet — расшифровка' });
  // До события spawn сообщения копим: процесс ещё не запущен.
  let started = false;
  const pending: MainToWorker[] = [];
  child.once('spawn', () => {
    started = true;
    if (child.pid !== undefined) {
      try {
        // Расшифровка не должна мешать созвону и записи (спецификация Плана 3, §5.3).
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Не удалось понизить приоритет — не страшно.
      }
    }
    for (const message of pending.splice(0)) child.postMessage(message);
  });
  return {
    send: (message) => {
      if (started) child.postMessage(message);
      else pending.push(message);
    },
    kill: () => {
      child.kill();
    },
    onMessage: (listener) => {
      child.on('message', listener);
    },
    onExit: (listener) => {
      child.on('exit', listener);
    },
  };
}
