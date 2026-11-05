// Каталог моделей расшифровки (решения Плана 7, §3): что видит человек — название, автор, языки, полоски.
// Только данные и чистые функции — файл подключают и main, и окно. Файлы моделей и настройки движка — в main
// (models/registry.ts, transcription/asr-config.ts).

export const ASR_MODEL_IDS = [
  'gigaam-v3-e2e-rnnt',
  'parakeet-tdt-0.6b-v3',
  'qwen3-asr-0.6b',
  'whisper-large-v3-turbo',
  'nemotron-3.5-asr',
  't-one',
  'parakeet-unified-en-0.6b',
  'canary-180m-flash',
] as const;

export type AsrModelId = (typeof ASR_MODEL_IDS)[number];

/** Модель по умолчанию — и та, что берётся вместо неизвестной (настройки и встречи более новой версии программы). */
export const DEFAULT_ASR_MODEL: AsrModelId = 'gigaam-v3-e2e-rnnt';

/** Группа каталога: модели, понимающие русский, и модели только для английского. */
export type AsrModelGroup = 'ru' | 'en';

export interface AsrModelInfo {
  id: AsrModelId;
  title: string;
  author: string;
  /** Одна строка под названием. */
  description: string;
  /** Языки для карточки: «Только русский», «25 языков»; у многоязычных с закреплённым русским — так и сказано. */
  languages: string;
  group: AsrModelGroup;
  /** Полоска «точность», 1–5: замеры на русском (у английских — на английском) и прочтение текста прототипа. */
  accuracy: number;
  /**
   * Скорость: время распознавания на секунду речи (RTF) на Ryzen 7 3700X, 7 потоков, без разделения по голосам —
   * прототип Плана 7 на записи пользователя (5 мин). Из него — полоска «скорость» и доли прогресса.
   */
  rtf: number;
  /** На шуме дописывает выдуманные фразы и зацикливается — текст кусков проходит через фильтр (решения Плана 7, §4.3). */
  hallucinates: boolean;
}

export const ASR_MODELS: readonly AsrModelInfo[] = [
  {
    id: 'gigaam-v3-e2e-rnnt',
    title: 'GigaAM v3',
    author: 'Сбер',
    description: 'Лучше всего понимает русский. Английские слова пишет русскими буквами.',
    languages: 'Только русский',
    group: 'ru',
    accuracy: 5,
    rtf: 0.035,
    hallucinates: false,
  },
  {
    id: 'parakeet-tdt-0.6b-v3',
    title: 'Parakeet v3',
    author: 'NVIDIA',
    description: 'Быстрая, английские слова пишет латиницей. На коротких репликах иногда путает язык.',
    languages: '25 языков',
    group: 'ru',
    accuracy: 3,
    rtf: 0.063,
    hallucinates: false,
  },
  {
    id: 'qwen3-asr-0.6b',
    title: 'Qwen3-ASR 0.6B',
    author: 'Alibaba',
    description: 'Хорошо понимает русский, английские слова пишет латиницей. Медленнее других.',
    languages: 'Русский · знает 30 языков',
    group: 'ru',
    accuracy: 4,
    rtf: 0.21,
    hallucinates: true,
  },
  {
    id: 'whisper-large-v3-turbo',
    title: 'Whisper large-v3-turbo',
    author: 'OpenAI',
    description: 'Самая известная модель. На процессоре медленная, иногда пропускает куски фраз.',
    languages: 'Русский · знает около 100 языков',
    group: 'ru',
    accuracy: 3,
    rtf: 0.55,
    hallucinates: true,
  },
  {
    id: 'nemotron-3.5-asr',
    title: 'Nemotron 3.5',
    author: 'NVIDIA',
    description: 'Новая модель NVIDIA. На русском — средняя точность.',
    languages: 'Русский · знает 40 языков',
    group: 'ru',
    accuracy: 3,
    rtf: 0.19,
    hallucinates: false,
  },
  {
    id: 't-one',
    title: 'T-one',
    author: 'Т-Банк',
    description: 'Маленькая, обучена на телефонных разговорах. Пишет без знаков препинания и заглавных букв.',
    languages: 'Только русский',
    group: 'ru',
    accuracy: 3,
    rtf: 0.057,
    hallucinates: false,
  },
  {
    id: 'parakeet-unified-en-0.6b',
    title: 'Parakeet Unified EN',
    author: 'NVIDIA',
    description: 'Очень точная для английского.',
    languages: 'Только английский',
    group: 'en',
    accuracy: 5,
    rtf: 0.075,
    hallucinates: false,
  },
  {
    id: 'canary-180m-flash',
    title: 'Canary 180M Flash',
    author: 'NVIDIA',
    description: 'Маленькая модель для английского.',
    languages: 'Только английский',
    group: 'en',
    accuracy: 3,
    rtf: 0.22,
    hallucinates: false,
  },
];

export const isAsrModelId = (value: unknown): value is AsrModelId =>
  typeof value === 'string' && (ASR_MODEL_IDS as readonly string[]).includes(value);

/** Модель каталога; неизвестный id (модель убрали из каталога в новой версии) — модель по умолчанию. */
export function asrModel(id: unknown): AsrModelInfo {
  const found = ASR_MODELS.find((m) => m.id === id);
  if (found) return found;
  const fallback = ASR_MODELS.find((m) => m.id === DEFAULT_ASR_MODEL);
  if (!fallback) throw new Error('В каталоге нет модели по умолчанию');
  return fallback;
}

/** Полоска «скорость», 1–5, по RTF: ≤ 0,05 — 5 делений … > 0,35 — одно. */
export function speedLevel(rtf: number): number {
  const limits = [0.05, 0.1, 0.2, 0.35];
  const index = limits.findIndex((limit) => rtf <= limit);
  return index === -1 ? 1 : 5 - index;
}

/** Во сколько раз модель медленнее модели по умолчанию (не меньше 1) — для сторожа зависания и прогресса. */
export function slowdown(id: AsrModelId): number {
  return Math.max(1, asrModel(id).rtf / asrModel(DEFAULT_ASR_MODEL).rtf);
}
