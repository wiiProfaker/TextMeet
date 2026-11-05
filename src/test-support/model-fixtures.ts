// Настоящие модели и записи для интеграционных тестов (npm run test:models). Скачиваются один раз; повторные прогоны
// только проверяют суммы. Модели — в папку моделей программы (или TEXTMEET_MODELS_DIR — её кеширует GitHub Actions):
// они те же, что у программы. Записи — в свою папку (TEXTMEET_TEST_FIXTURES_DIR, иначе кеш в node_modules), со своим
// verified.json: в папке и списке моделей программы им не место — программа о них не знает и их не удаляет.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ASR_MODEL } from '../shared/asr-models';
import { downloadFile } from '../main/models/download';
import { ModelManager } from '../main/models/model-manager';
import { modelsRoot } from '../main/models/models-dir';
import type { ModelGroupId } from '../main/models/registry';
import { freeDiskBytes } from '../main/recording/monitors';
import type { Logger } from '../main/logger';

const quiet: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined, flush: async () => undefined };

export const MODELS_ROOT = modelsRoot({
  platform: process.platform,
  homeDir: homedir(),
  localAppData: process.env.LOCALAPPDATA,
  override: process.env.TEXTMEET_MODELS_DIR,
});

export const FIXTURES_ROOT =
  process.env.TEXTMEET_TEST_FIXTURES_DIR || join(process.cwd(), 'node_modules', '.cache', 'textmeet-test-fixtures');

/** Открытые записи: пример GigaAM (MIT; одна дикторша, стихи) и разговор четырёх человек из релизов sherpa-onnx. */
const FIXTURES = {
  gigaamExample: {
    path: 'gigaam-example.wav',
    url: 'https://huggingface.co/csukuangfj/tmp-files/resolve/main/GigaAM/example.wav',
    size: 361_324,
    sha256: 'd8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69',
  },
  fourSpeakers: {
    path: '0-four-speakers-zh.wav',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/0-four-speakers-zh.wav',
    size: 1_819_586,
    sha256: 'bedf036caed208386c67b4ef4b11f83d74dd0d420b102163a1c33cd09cde7010',
  },
  /** Английская речь для моделей каталога (пример из репозитория Parakeet v3 для sherpa-onnx). */
  englishExample: {
    path: 'english-example.wav',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78/test_wavs/en.wav',
    size: 184_608,
    sha256: '148b936b43ce7c546a866e64da059f0458aee2d65e617f16e9d94f06e8d99ed6',
  },
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Модели на месте (скачиваются, если нет): по умолчанию — GigaAM и общие модели голосов. */
export async function ensureModels(groups: readonly ModelGroupId[] = [DEFAULT_ASR_MODEL, 'voices']): Promise<void> {
  await new ModelManager({ root: MODELS_ROOT, logger: quiet, freeBytes: freeDiskBytes }).ensure(groups);
}

/** Где лежит открытая запись (без скачивания). */
export function fixturePath(name: FixtureName): string {
  return join(FIXTURES_ROOT, ...FIXTURES[name].path.split('/'));
}

/** Путь к открытой записи (скачивается, если нет). */
export async function fixture(name: FixtureName): Promise<string> {
  const { path, url, size, sha256 } = FIXTURES[name];
  // ModelManager — ради докачки, проверки сумм и verified.json, но со своей папкой: группа здесь ничего не значит.
  const manager = new ModelManager({
    root: FIXTURES_ROOT,
    logger: quiet,
    freeBytes: freeDiskBytes,
    files: [{ group: 'voices', path, url, size, sha256 }],
    download: downloadFile,
  });
  await manager.ensure(['voices']);
  return fixturePath(name);
}
