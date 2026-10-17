// Процесс расшифровки (Electron utilityProcess): тяжёлый нативный код отдельно от окон и записи (спецификация §5.2).
// Одна задача за раз; main присылает команды, процесс — прогресс и результат. Падение процесса ловит main.
import { asrModel, slowdown } from '../../shared/asr-models';
import { decodeToMono16k } from './decode';
import { enginesByModel } from './engines';
import { fakeEngines } from './fake-engines';
import { runPipeline } from './pipeline';
import { cleanRecognizedText } from './text-cleanup';
import { MainToWorkerSchema, WORKER_REFUSALS, type TranscribeCommand, type WorkerToMain } from './protocol';
import { ModelLoadError, sherpaEngines, sherpaVersion } from './sherpa-engines';

const port = process.parentPort;
const post = (message: WorkerToMain): void => port.postMessage(message);
/** Только для автотестов: мгновенные поддельные движки вместо моделей. Переменную ставит main (worker-host.ts) —
 *  только когда подмены разрешены; переменные TEXTMEET_* из окружения программы сюда не доходят. */
const fake = process.env.TEXTMEET_TEST_ASR === 'fake';

let threads = 1;
let busy = false;
/** Загруженные модели остаются в процессе между встречами (он закрывается сам после простоя). */
const enginesFor = enginesByModel((modelsDir, model) => (fake ? fakeEngines() : sherpaEngines(modelsDir, model)));

async function transcribe(command: TranscribeCommand): Promise<void> {
  threads = command.threads;
  const result = await runPipeline(command.input, {
    engines: enginesFor(command.modelsDir, command.model),
    decode: (track, expectedSec) => decodeToMono16k(command.ffmpegPath, track.file, expectedSec),
    threads: () => threads,
    slowdown: slowdown(command.model),
    ...(asrModel(command.model).hallucinates && { cleanText: cleanRecognizedText }),
    onProgress: (progress) => post({ type: 'progress', jobId: command.jobId, progress }),
  });
  post({ type: 'done', jobId: command.jobId, result });
}

port.on('message', (event: { data: unknown }) => {
  const parsed = MainToWorkerSchema.safeParse(event.data);
  if (!parsed.success) {
    const jobId = (event.data as { jobId?: unknown } | null)?.jobId;
    if (typeof jobId === 'string') post({ type: 'failed', jobId, message: WORKER_REFUSALS.badCommand });
    return;
  }
  const command = parsed.data;
  if (command.type === 'threads') {
    threads = command.threads;
    return;
  }
  if (busy) {
    post({ type: 'failed', jobId: command.jobId, message: WORKER_REFUSALS.busy });
    return;
  }
  busy = true;
  transcribe(command)
    .catch((err: unknown) =>
      post({
        type: 'failed',
        jobId: command.jobId,
        message: err instanceof Error ? err.message : String(err),
        ...(err instanceof ModelLoadError && { code: 'model-load' as const }),
      }),
    )
    .finally(() => {
      busy = false;
    });
});

// Нативная библиотека загружается при старте: если она не открылась, main узнает об этом сразу (падение процесса).
post({ type: 'ready', engine: fake ? `поддельные движки, ${sherpaVersion()}` : sherpaVersion() });
