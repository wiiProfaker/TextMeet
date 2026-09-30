// Настоящие модели и записи для интеграционных тестов (npm run test:models). Скачиваются один раз в папку моделей
// (или TEXTMEET_MODELS_DIR — её кеширует GitHub Actions); повторные прогоны только проверяют суммы.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { downloadFile } from '../main/models/download';
import { ModelManager } from '../main/models/model-manager';
import { modelsRoot } from '../main/models/models-dir';
import { freeDiskBytes } from '../main/recording/monitors';
import type { Logger } from '../main/logger';

const quiet: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined, flush: async () => undefined };

export const MODELS_ROOT = modelsRoot({
  platform: process.platform,
  homeDir: homedir(),
  localAppData: process.env.LOCALAPPDATA,
  override: process.env.TEXTMEET_MODELS_DIR,
});

/** Открытые записи: пример GigaAM (MIT; одна дикторша, стихи) и разговор четырёх человек из релизов sherpa-onnx. */
const FIXTURES = {
  gigaamExample: {
    path: 'test-fixtures/gigaam-example.wav',
    url: 'https://huggingface.co/csukuangfj/tmp-files/resolve/main/GigaAM/example.wav',
    size: 361_324,
    sha256: 'd8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69',
  },
  fourSpeakers: {
    path: 'test-fixtures/0-four-speakers-zh.wav',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/0-four-speakers-zh.wav',
    size: 1_819_586,
    sha256: 'bedf036caed208386c67b4ef4b11f83d74dd0d420b102163a1c33cd09cde7010',
  },
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Модели на месте (скачиваются, если нет). */
export async function ensureModels(): Promise<void> {
  await new ModelManager({ root: MODELS_ROOT, logger: quiet, freeBytes: freeDiskBytes }).ensure();
}

/** Путь к открытой записи (скачивается, если нет). */
export async function fixture(name: FixtureName): Promise<string> {
  const { path, url, size, sha256 } = FIXTURES[name];
  const dest = join(MODELS_ROOT, ...path.split('/'));
  const manager = new ModelManager({
    root: MODELS_ROOT,
    logger: quiet,
    freeBytes: freeDiskBytes,
    files: [{ group: 'voices', path, url, size, sha256 }],
    download: downloadFile,
  });
  await manager.ensure();
  return dest;
}
