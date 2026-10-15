// Каталог моделей для итогов (решения Плана 9, §3): что видит человек и сколько встречи помещается в модель.
// Только данные, типы и чистые функции — файл подключают и main, и окно. Файлы моделей — в main (models/registry.ts).
import type { CatalogDownload, ModelGroupState } from './transcription';

export const LLM_MODEL_IDS = ['qwen3.5-9b', 'gigachat-3.1-lightning', 't-lite-it-2.1', 'qwen3.5-4b'] as const;

export type LlmModelId = (typeof LLM_MODEL_IDS)[number];

/** Пометка «Рекомендуется»: её итоги пользователь сравнил с итогами Claude (решения Плана 9, §9). */
export const RECOMMENDED_LLM_MODEL: LlmModelId = 'qwen3.5-9b';

export interface LlmModelInfo {
  id: LlmModelId;
  title: string;
  author: string;
  /** Одна-две строки под названием. */
  description: string;
  /** Предупреждение цветом под описанием; null — нет. */
  warning: string | null;
  languages: string;
  /** Полоски «качество» и «скорость», 1–5. */
  quality: number;
  speed: number;
  /** Замерена на компьютере пользователя; false — полоски примерные (пометка «оценка»). */
  measured: boolean;
  /** Окно модели в программе — сколько «кусочков» текста (токенов) помещается: встреча, запрос и ответ вместе. */
  contextTokens: number;
}

export const LLM_MODELS: readonly LlmModelInfo[] = [
  {
    id: 'qwen3.5-9b',
    title: 'Qwen3.5 9B',
    author: 'Alibaba',
    description: 'Проверена на полуторачасовой встрече: итоги примерно за минуту, хороший русский. Встречи до ~3 часов.',
    warning: null,
    languages: 'Русский · знает около 200 языков',
    quality: 4,
    speed: 4,
    measured: true,
    contextTokens: 65_536,
  },
  {
    id: 'gigachat-3.1-lightning',
    title: 'GigaChat 3.1 Lightning',
    author: 'Сбер',
    description: 'Сделана для русского языка. Быстрая: в каждый момент работает лишь небольшая её часть. Встречи до ~3 часов.',
    warning: null,
    languages: 'Русский и английский',
    quality: 4,
    speed: 5,
    measured: false,
    contextTokens: 65_536,
  },
  {
    id: 't-lite-it-2.1',
    title: 'T-lite-it 2.1',
    author: 'Т-Банк',
    description: 'Qwen3, дообученная на русских текстах.',
    warning: 'Встречи до ~2,5 часа — более длинные в неё не поместятся.',
    languages: 'Русский и английский',
    quality: 4,
    speed: 3,
    measured: false,
    contextTokens: 40_960,
  },
  {
    id: 'qwen3.5-4b',
    title: 'Qwen3.5 4B',
    author: 'Alibaba',
    description: 'Лёгкая и быстрая — если 9B медленно работает на вашем компьютере. Итоги проще и короче.',
    warning: null,
    languages: 'Русский · знает около 200 языков',
    quality: 3,
    speed: 5,
    measured: false,
    contextTokens: 65_536,
  },
];

export const isLlmModelId = (value: unknown): value is LlmModelId =>
  typeof value === 'string' && (LLM_MODEL_IDS as readonly string[]).includes(value);

export function llmModel(id: LlmModelId): LlmModelInfo {
  const found = LLM_MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`В каталоге нет модели ${id}`);
  return found;
}

/**
 * Модель для итогов: выбранная, если она скачана; иначе первая скачанная по порядку каталога (первая скачанная
 * выбирается сама, удалили выбранную — выбирается другая); ни одной не скачано — null.
 */
export function effectiveAiModel(selected: LlmModelId | null, installed: readonly LlmModelId[]): LlmModelId | null {
  if (selected !== null && installed.includes(selected)) return selected;
  return LLM_MODEL_IDS.find((id) => installed.includes(id)) ?? null;
}

/** Каталог «Модель для итогов» глазами окна (вкладка настроек «ИИ»). */
export interface AiModelsState {
  /** Модель для итогов (выбранная и скачанная); null — ни одной не скачано. */
  selected: LlmModelId | null;
  /** Модели в порядке каталога. */
  models: (ModelGroupState & { id: LlmModelId })[];
  /** Идёт скачивание из любого каталога (расшифровки или ИИ): одно на всю программу. */
  download: CatalogDownload | null;
  /** Последнее скачивание модели для итогов не удалось — причина для человека. */
  downloadError: { id: LlmModelId; message: string } | null;
}
