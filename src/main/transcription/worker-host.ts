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
/** Переменная, по которой процесс включает поддельные движки (worker.ts); её ставит только main. */
export const FAKE_ENGINES_VAR = 'TEXTMEET_TEST_ASR';

/** Окружение процесса: без переменных TEXTMEET_* программы; поддельные движки — только если их включил main. */
export function workerEnv(env: NodeJS.ProcessEnv, fakeEngines: boolean): Record<string, string> {
  const clean = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => !entry[0].startsWith('TEXTMEET_') && entry[1] !== undefined),
  );
  return fakeEngines ? { ...clean, [FAKE_ENGINES_VAR]: 'fake' } : clean;
}

export function spawnTranscriptionWorker(logger: Logger, options: { fakeEngines: boolean }): WorkerHandle {
  const child = utilityProcess.fork(join(__dirname, WORKER_FILE), [], {
    serviceName: 'TextMeet — расшифровка',
    env: workerEnv(process.env, options.fakeEngines),
  });
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
