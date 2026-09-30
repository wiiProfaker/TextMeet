// Процесс расшифровки (Electron utilityProcess): тяжёлый нативный код отдельно от окон и записи (спецификация §5.2).
// Одна задача за раз; main присылает команды, процесс — прогресс и результат. Падение процесса ловит main.
import { modelPaths } from '../models/registry';
import { decodeToMono16k } from './decode';
import type { Engines } from './engines';
import { fakeEngines } from './fake-engines';
import { runPipeline } from './pipeline';
import { MainToWorkerSchema, type TranscribeCommand, type WorkerToMain } from './protocol';
import { sherpaEngines, sherpaVersion } from './sherpa-engines';

const port = process.parentPort;
const post = (message: WorkerToMain): void => port.postMessage(message);
/** Только для автотестов: мгновенные поддельные движки вместо моделей. */
const fake = process.env.TEXTMEET_TEST_ASR === 'fake';

let threads = 1;
let busy = false;

async function transcribe(command: TranscribeCommand): Promise<void> {
  threads = command.threads;
  const engines: Engines = fake ? fakeEngines() : sherpaEngines(modelPaths(command.modelsDir));
  const result = await runPipeline(command.input, {
    engines,
    decode: (track, expectedSec) => decodeToMono16k(command.ffmpegPath, track.file, expectedSec),
    threads: () => threads,
    onProgress: (progress) => post({ type: 'progress', jobId: command.jobId, progress }),
  });
  post({ type: 'done', jobId: command.jobId, result });
}

port.on('message', (event: { data: unknown }) => {
  const parsed = MainToWorkerSchema.safeParse(event.data);
  if (!parsed.success) {
    const jobId = (event.data as { jobId?: unknown } | null)?.jobId;
    if (typeof jobId === 'string') post({ type: 'failed', jobId, message: 'неверная команда расшифровки' });
    return;
  }
  const command = parsed.data;
  if (command.type === 'threads') {
    threads = command.threads;
    return;
  }
  if (busy) {
    post({ type: 'failed', jobId: command.jobId, message: 'процесс расшифровки уже занят' });
    return;
  }
  busy = true;
  transcribe(command)
    .catch((err: unknown) => post({ type: 'failed', jobId: command.jobId, message: err instanceof Error ? err.message : String(err) }))
    .finally(() => {
      busy = false;
    });
});

// Нативная библиотека загружается при старте: если она не открылась, main узнает об этом сразу (падение процесса).
post({ type: 'ready', engine: fake ? `поддельные движки, ${sherpaVersion()}` : sherpaVersion() });
