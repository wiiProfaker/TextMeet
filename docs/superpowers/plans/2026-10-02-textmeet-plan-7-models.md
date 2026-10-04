# TextMeet — План 7: каталог моделей расшифровки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каталог моделей расшифровки, как в программе Handy: 8 моделей (GigaAM v3 по умолчанию, Parakeet v3, Qwen3-ASR 0.6B, Whisper large-v3-turbo, Nemotron 3.5, T-one, Parakeet Unified EN, Canary 180M Flash) — карточки в настройках со «Скачать» / «Отменить» / «Выбрать» / «Удалить», выбор модели для встречи в окне «Расшифровать», подпись «Текст: <модель>» во встрече; всё на процессоре через sherpa-onnx.

**Architecture:** Каталог — данные в `src/shared/asr-models.ts` (видит и main, и окно); файлы моделей — реестр `src/main/models/registry.ts` (группа файлов = модель расшифровки или общая `voices`); `ModelManager.ensure(groups, { onProgress, signal })` качает только нужные группы, по очереди и с отменой. Настройки sherpa-onnx для каждой модели — чистые данные `src/main/transcription/asr-config.ts`, по ним `sherpa-engines.ts` строит `OfflineRecognizer` или потоковый `OnlineRecognizer`; конвейер Плана 3 не меняется, кроме фильтра выдумок у Whisper и Qwen3. Очередь берёт модель встречи из `meeting.json`; скачивание из карточки — `CatalogDownloads` (одно за раз, событие `models:changed`). В сквозных тестах хранилище моделей подменяет `FakeModelStore`.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0, React 19.3, TypeScript 7.0.2, zod 4.6.5, sherpa-onnx-node 1.13.8, Vitest 5.0.2, Playwright 1.63.0, GitHub Actions.

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.3, §3.6, §5.4, §5.5, §6. **Решения Плана 7:** [2026-10-02-textmeet-plan-7-design.md](../specs/2026-10-02-textmeet-plan-7-design.md). **Решения Плана 3** (конвейер, очередь, менеджер моделей): [2026-09-29-textmeet-plan-3-design.md](../specs/2026-09-29-textmeet-plan-3-design.md). Проверки Плана 3: [plan-3-checks.md](../plan-3-checks.md).

---

## Факты, на которые опирается план (проверены 2026-10-02 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии ветки `plan-7-models` на Windows 11 (Ryzen 7 3700X): 673
модульных теста (покрытие ~98 % строк), 28 сквозных, 5 тестов на настоящих моделях (`test:models`), 8 тестов каталога
на настоящих файлах (`test:catalog`) и очередь из 6 встреч разными моделями в собранной программе (процесс расшифровки
Electron). Workflow `models-check` (временная ветка, удалена) — запуск
[36995454168](https://github.com/wiiProfaker/TextMeet/actions/runs/36995454168): **все 8 моделей работают на
`windows-latest`, `macos-latest` и `ubuntu-latest`**. Ревью кода прототипа нашло недочёты — исправлены в коде этого
плана и закрыты тестами (Task 5, 6, 7, 8). Затем план проигран по задачам на чистой копии: после каждой задачи проверка
типов и модульные тесты проходят, итог совпал с прототипом файл в файл.

- **Модели и замеры** (5 минут записи пользователя, только распознавание, 7 потоков): GigaAM 11 с (RTF 0,035), T-one
  17 с, Parakeet v3 19 с, Nemotron 56 с, Qwen3 62 с, Whisper 2,5–3 мин (RTF 0,55); английские — на английском примере.
  Лучший текст — GigaAM; Qwen3 и Whisper близко; T-one без знаков препинания. **Moonshine Base убрана** — на кусках
  до 20 с (и 8–10 с) часто пустой текст.
- **Источник файлов** — зеркала автора sherpa-onnx на Hugging Face (`csukuangfj`, `csukuangfj2`), отдельные файлы, адреса
  закреплены на коммитах (так же теперь и GigaAM, и pyannote); суммы небольших файлов из git (`tokens.txt`, `merges.txt`)
  посчитаны по скачанным файлам. Архивы не нужны.
- **`sherpa-onnx-node` 1.13.8** умеет всё нужное: `qwen3Asr`, `whisper`, `canary`, NeMo transducer, потоковые
  transducer (Nemotron) и `toneCtc` (T-one); язык потока — `stream.setOption('language', …)` (Qwen3 — «Russian»,
  Nemotron — «ru»); у Whisper язык — в конфиге модели, у Canary — `srcLang` / `tgtLang`.
- **Автоопределение языка путало русский** на коротких кусках (Qwen3 — китайский, Whisper — английский) → русский
  закреплён. У Parakeet v3 настройки языка нет: «да», «алло» иногда латиницей — сказано в описании модели.
- **Потоковые модели теряли начало и конец реплики** без тишины вокруг куска (Nemotron: «для за…», «транскриба…»);
  Whisper без секунды тишины после куска обрывал последнее слово. Значения в `asr-config.ts` подобраны на прототипе.
- **Whisper и Qwen3 выдумывают на шуме** («Продолжение следует…», «Эээээээ…») — фильтр только для них: у других моделей
  такие фразы — настоящая речь.
- **Сквозные тесты** работают без сети: `TEXTMEET_TEST_ASR=fake` теперь подменяет и хранилище моделей
  (`FakeModelStore`), шаг поддельного скачивания — `TEXTMEET_TEST_DOWNLOAD_MS` (по умолчанию мгновенно).
- **`npm run test:models`** (и `ci`) по-прежнему качает только GigaAM и модели голосов (`ensureModels()` по умолчанию —
  эти две группы). Ключ кеша моделей в `ci.yml` — хеш `registry.ts`: он меняется, и первый `ci` после слияния скачает
  ~360 МБ заново.
- **Файлы в рабочей копии — с окончаниями CRLF** (`core.autocrlf=true`), в блоках плана — LF: заменяйте блоки
  инструментом правки (он сопоставляет строки без учёта окончаний), а не побайтовыми скриптами.

## Что сознательно не входит в План 7

- Видеокарта (CUDA / Metal) — отдельным планом потом. Свои файлы моделей — нет (новую модель добавляем в каталог по
  просьбе). Выбор языка встречи — нет (для английских встреч — английские модели).
- Выбор модели ИИ — План 6. Правка текста, поиск — План 4.

## Карта файлов

```
src/shared/asr-models.ts                 # каталог: id, название, автор, описание, языки, группа, точность, RTF, hallucinates
src/shared/settings.ts                   # + asrModel
src/shared/transcript.ts                 # + modelTitle, transcriptModelTitle()
src/shared/transcription.ts              # ModelGroupId = модель | voices; ModelsState каталога; TranscribeRequest.model
src/shared/format.ts                     # formatMegabytes, formatDownloaded
src/shared/ipc.ts, src/preload/index.ts  # models:download / cancel-download / select, событие models:changed
src/main/models/download.ts              # отмена (signal), причина cancelled
src/main/models/registry.ts              # файлы всего каталога, ASR_FOLDERS, voicePaths, asrFilePath, MODEL_GROUP_IDS
src/main/models/model-manager.ts         # ensure(groups, {onProgress, signal}), ModelStore
src/main/models/fake-model-store.ts      # хранилище для сквозных тестов
src/main/models/models-state.ts          # buildModelsState — что окно видит в каталоге
src/main/models/catalog-downloads.ts     # «Скачать» / «Отменить» из карточки
src/main/transcription/asr-config.ts     # настройки sherpa-onnx каждой модели
src/main/transcription/sherpa-engines.ts # распознаватель по настройкам; ModelLoadError
src/main/transcription/text-cleanup.ts   # фильтр выдумок Whisper и Qwen3
src/main/transcription/engines.ts        # кеш движков по папке и модели
src/main/transcription/pipeline.ts       # ранняя загрузка модели, cleanText, скорость в прогрессе
src/main/transcription/progress.ts       # planSteps(…, slowdown)
src/main/transcription/protocol.ts       # model в команде, code: model-load
src/main/transcription/worker.ts         # движки модели встречи
src/main/transcription/queue.ts          # модель встречи, отменяемое скачивание, «Готовим модель»
src/main/texts.ts                        # cancelled, modelLoad
src/main/ipc.ts, src/main/index.ts       # каталог, хранилище моделей, модель из настроек
src/renderer/main/model-catalog.ts       # разделы карточек и подписи
src/renderer/main/ModelCard.tsx          # карточка модели
src/renderer/main/TranscriptionSettings.tsx, TranscribeDialog.tsx, MeetingPane.tsx, styles.css
src/renderer/main/format.ts, transcription-format.ts   # «готовим модель…», «Скачиваем модель X — N из M МБ»
src/test-support/model-fixtures.ts       # ensureModels(groups), английский пример
src/main/transcription/catalog.catalog-test.ts, vitest.catalog.config.ts, package.json (test:catalog)
.github/workflows/models-check.yml       # все модели на Windows, Mac, Linux
e2e/helpers.ts, e2e/models.spec.ts, e2e/transcription.spec.ts
```

## Задачи

Ветка — `plan-7-models` (на ней уже документ решений). Проверка после каждой задачи: `npm run typecheck`, затем
`npx vitest run`; где указано — сквозные тесты (`npm run build`, затем `npx playwright test`) и тесты на настоящих
моделях.

### Task 1: Каталог моделей в общем коде

**Files:**
- Create: `src/shared/asr-models.test.ts`, `src/shared/asr-models.ts`

Что видит человек о каждой модели: название, автор, описание, языки, группа (`ru` — понимают русский,
`en` — только английский), полоска «точность» и скорость (RTF из прототипа). Неизвестный id (модель убрали из каталога
в новой версии) читается как GigaAM. `hallucinates` — модели, текст которых проходит через фильтр выдумок (Task 6).
Файл подключают и main, и окно, поэтому в нём только данные и чистые функции.

- [ ] **Step 1: Тесты**

**Создать `src/shared/asr-models.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS, ASR_MODELS, DEFAULT_ASR_MODEL, asrModel, isAsrModelId, slowdown, speedLevel } from './asr-models';

describe('ASR model catalog', () => {
  it('lists every id once, in the order of the ids', () => {
    expect(ASR_MODELS.map((m) => m.id)).toEqual([...ASR_MODEL_IDS]);
  });

  it('describes every model for its card', () => {
    for (const model of ASR_MODELS) {
      expect(model.title.length).toBeGreaterThan(0);
      expect(model.author.length).toBeGreaterThan(0);
      expect(model.description.length).toBeGreaterThan(0);
      expect(model.languages.length).toBeGreaterThan(0);
      expect(model.accuracy).toBeGreaterThanOrEqual(1);
      expect(model.accuracy).toBeLessThanOrEqual(5);
      expect(model.rtf).toBeGreaterThan(0);
    }
  });

  it('starts with the default model and keeps the English-only models last', () => {
    expect(ASR_MODELS[0]!.id).toBe(DEFAULT_ASR_MODEL);
    const groups = ASR_MODELS.map((m) => m.group);
    expect(groups.indexOf('en')).toBeGreaterThan(groups.lastIndexOf('ru'));
  });

  it('filters the text only of the models that make things up', () => {
    expect(ASR_MODELS.filter((m) => m.hallucinates).map((m) => m.id)).toEqual(['qwen3-asr-0.6b', 'whisper-large-v3-turbo']);
  });

  it('recognizes catalog ids', () => {
    expect(isAsrModelId('t-one')).toBe(true);
    expect(isAsrModelId('whisper-tiny')).toBe(false);
    expect(isAsrModelId(null)).toBe(false);
  });

  it('falls back to the default model for an unknown id', () => {
    expect(asrModel('canary-180m-flash').title).toBe('Canary 180M Flash');
    expect(asrModel('whisper-tiny').id).toBe(DEFAULT_ASR_MODEL);
    expect(asrModel(undefined).id).toBe(DEFAULT_ASR_MODEL);
  });

  it('turns the measured speed into a five-step bar', () => {
    expect(speedLevel(0.035)).toBe(5);
    expect(speedLevel(0.05)).toBe(5);
    expect(speedLevel(0.063)).toBe(4);
    expect(speedLevel(0.19)).toBe(3);
    expect(speedLevel(0.21)).toBe(2);
    expect(speedLevel(0.55)).toBe(1);
  });

  it('tells how much slower than the default a model is, never less than once', () => {
    expect(slowdown(DEFAULT_ASR_MODEL)).toBe(1);
    expect(slowdown('whisper-large-v3-turbo')).toBeCloseTo(0.55 / 0.035);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/shared/asr-models.test.ts`
Ожидается: FAIL — нет модуля `./asr-models`.

- [ ] **Step 3: Код**

**Создать `src/shared/asr-models.ts`:**

```ts
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
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  618 passed (618)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ASR model catalog shared by main and the window"
```

### Task 2: Выбранная модель в настройках, название модели в тексте встречи

**Files:**
- Modify: `src/shared/settings.test.ts`, `src/shared/settings.ts`, `src/shared/transcript.test.ts`, `src/shared/transcript.ts`

`settings.json` получает `asrModel`: неизвестное значение читается как GigaAM (`.catch`), остальные
настройки при этом не сбрасываются. `transcript.json` получает необязательное `modelTitle` — подпись «Текст: …» во
встрече остаётся и после удаления модели; у текстов Плана 3 подпись берётся по каталогу.

- [ ] **Step 1: Тесты**

**В `src/shared/settings.test.ts` заменить:**

```ts
      microphoneId: null,
      recordHotkey: null,
      recordSounds: true,
    });
  });
```

**на:**

```ts
      microphoneId: null,
      recordHotkey: null,
      recordSounds: true,
      asrModel: 'gigaam-v3-e2e-rnnt',
    });
  });
```

**В `src/shared/settings.test.ts` заменить:**

```ts
    expect(parsed).toMatchObject({ microphoneId: 'abc', recordHotkey: 'Control+Alt+R', recordSounds: false });
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
```

**на:**

```ts
    expect(parsed).toMatchObject({ microphoneId: 'abc', recordHotkey: 'Control+Alt+R', recordSounds: false });
  });

  it('keeps the chosen transcription model', () => {
    expect(SettingsSchema.parse({ asrModel: 'parakeet-tdt-0.6b-v3' }).asrModel).toBe('parakeet-tdt-0.6b-v3');
  });

  it('reads an unknown or broken model as the default one without dropping the other settings', () => {
    const parsed = SettingsSchema.parse({ asrModel: 'whisper-tiny', recordSounds: false });
    expect(parsed).toMatchObject({ asrModel: 'gigaam-v3-e2e-rnnt', recordSounds: false });
    expect(SettingsSchema.parse({ asrModel: 42 }).asrModel).toBe('gigaam-v3-e2e-rnnt');
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
```

**В `src/shared/transcript.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { otherSpeakerId, speakerLabel, TranscriptSchema } from './transcript';

const valid = {
  schemaVersion: 1,
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import { otherSpeakerId, speakerLabel, transcriptModelTitle, TranscriptSchema } from './transcript';

const valid = {
  schemaVersion: 1,
```

**В `src/shared/transcript.test.ts` заменить:**

```ts
    expect(TranscriptSchema.parse({ ...valid, future: 1 })).toMatchObject({ future: 1 });
  });

  it('rejects unknown speaker ids', () => {
    const bad = { ...valid, segments: [{ ...valid.segments[0], speakerId: '../x' }] };
    expect(TranscriptSchema.safeParse(bad).success).toBe(false);
  });
});

describe('speakerLabel', () => {
  it('names the owner and the others', () => {
    expect(speakerLabel('me')).toBe('Я');
```

**на:**

```ts
    expect(TranscriptSchema.parse({ ...valid, future: 1 })).toMatchObject({ future: 1 });
  });

  it('keeps the title of the model the text was made with', () => {
    expect(TranscriptSchema.parse({ ...valid, modelTitle: 'Parakeet v3' }).modelTitle).toBe('Parakeet v3');
    expect(TranscriptSchema.parse(valid).modelTitle).toBeUndefined();
  });

  it('rejects unknown speaker ids', () => {
    const bad = { ...valid, segments: [{ ...valid.segments[0], speakerId: '../x' }] };
    expect(TranscriptSchema.safeParse(bad).success).toBe(false);
  });
});

describe('transcriptModelTitle', () => {
  it('takes the saved title, then the catalog, then the bare id', () => {
    expect(transcriptModelTitle({ model: 't-one', modelTitle: 'Старое имя' })).toBe('Старое имя');
    expect(transcriptModelTitle({ model: 'gigaam-v3-e2e-rnnt' })).toBe('GigaAM v3');
    expect(transcriptModelTitle({ model: 'future-model' })).toBe('future-model');
  });
});

describe('speakerLabel', () => {
  it('names the owner and the others', () => {
    expect(speakerLabel('me')).toBe('Я');
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/shared/settings.test.ts src/shared/transcript.test.ts`
Ожидается: FAIL — нет поля `asrModel`, нет `transcriptModelTitle`.

- [ ] **Step 3: Код**

**Заменить всё содержимое `src/shared/settings.ts` на:**

```ts
import { z } from 'zod';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL } from './asr-models';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
export const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  /** null — папка по умолчанию: ~/TextMeet */
  libraryDir: z.string().min(1).nullable().default(null),
  launchAtLogin: z.boolean().default(true),
  /** deviceId микрофона; null — микрофон, выбранный в системе. */
  microphoneId: z.string().min(1).max(500).nullable().default(null),
  /** Горячая клавиша записи в формате Electron (accelerator); null — по умолчанию для ОС. */
  recordHotkey: z.string().min(1).max(100).nullable().default(null),
  /** Короткий звук при начале и остановке записи. */
  recordSounds: z.boolean().default(true),
  /**
   * Модель расшифровки для новых встреч. Неизвестная (из более новой версии программы) — модель по умолчанию:
   * из-за одного поля остальные настройки не сбрасываются.
   */
  asrModel: z.enum(ASR_MODEL_IDS).default(DEFAULT_ASR_MODEL).catch(DEFAULT_ASR_MODEL),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
```

**В `src/shared/transcript.ts` заменить:**

```ts
import { z } from 'zod';

/** Спикер: «me» — владелец (дорожка микрофона), «s1», «s2»… — собеседники по порядку первого появления. */
export const SpeakerIdSchema = z.string().regex(/^(me|s[1-9]\d{0,2})$/);
```

**на:**

```ts
import { z } from 'zod';
import { asrModel, isAsrModelId } from './asr-models';

/** Спикер: «me» — владелец (дорожка микрофона), «s1», «s2»… — собеседники по порядку первого появления. */
export const SpeakerIdSchema = z.string().regex(/^(me|s[1-9]\d{0,2})$/);
```

**В `src/shared/transcript.ts` заменить:**

```ts
export const TranscriptSchema = z.looseObject({
  schemaVersion: z.literal(1),
  model: z.string().min(1),
  createdAt: z.iso.datetime(),
  speakers: z.array(z.object({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) })),
  segments: z.array(TranscriptSegmentSchema),
```

**на:**

```ts
export const TranscriptSchema = z.looseObject({
  schemaVersion: z.literal(1),
  model: z.string().min(1),
  /** Название модели на момент расшифровки — для подписи во встрече (План 7); у текстов Плана 3 его нет. */
  modelTitle: z.string().min(1).max(200).optional(),
  createdAt: z.iso.datetime(),
  speakers: z.array(z.object({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) })),
  segments: z.array(TranscriptSegmentSchema),
```

**В `src/shared/transcript.ts` заменить:**

```ts

export const ME: SpeakerId = 'me';

/** Номер собеседника → id: 0 → «s1». */
export const otherSpeakerId = (index: number): SpeakerId => `s${index + 1}`;
```

**на:**

```ts

export const ME: SpeakerId = 'me';

/** Подпись «Текст: …» во встрече: название из текста, иначе — по каталогу, неизвестная модель — её id. */
export function transcriptModelTitle(transcript: Pick<Transcript, 'model' | 'modelTitle'>): string {
  if (transcript.modelTitle) return transcript.modelTitle;
  return isAsrModelId(transcript.model) ? asrModel(transcript.model).title : transcript.model;
}

/** Номер собеседника → id: 0 → «s1». */
export const otherSpeakerId = (index: number): SpeakerId => `s${index + 1}`;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  622 passed (622)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remember the chosen transcription model and the model title of a transcript"
```

### Task 3: Размеры и ход скачивания в мегабайтах

**Files:**
- Modify: `src/shared/format.test.ts`, `src/shared/format.ts`

Карточки и ход скачивания показывают мегабайты («671 МБ», «120 из 671 МБ»): в гигабайтах с одной цифрой
после запятой число у моделей на 0,5–1 ГБ почти не двигалось.

- [ ] **Step 1: Тесты**

**В `src/shared/format.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { formatBytes, formatDurationShort } from './format';

describe('formatDurationShort', () => {
  it.each([
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import { formatBytes, formatDownloaded, formatDurationShort, formatMegabytes } from './format';

describe('formatDurationShort', () => {
  it.each([
```

**В `src/shared/format.test.ts` заменить:**

```ts
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 МБ'],
```

**на:**

```ts
  });
});

describe('formatDownloaded', () => {
  it('counts in megabytes', () => {
    expect(formatDownloaded(120.4 * 1024 * 1024, 464 * 1024 * 1024)).toBe('120 из 464 МБ');
    expect(formatDownloaded(-1, 0)).toBe('0 из 0 МБ');
    expect(formatMegabytes(670.6 * 1024 * 1024)).toBe('671 МБ');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 МБ'],
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/shared/format.test.ts`
Ожидается: FAIL — нет `formatMegabytes` / `formatDownloaded`.

- [ ] **Step 3: Код**

**В `src/shared/format.ts` заменить:**

```ts
const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
```

**на:**

```ts
const MB = 1024 * 1024;
const GB = 1024 * MB;

const megabytes = (bytes: number): number => Math.round(Math.max(0, bytes) / MB);

/** Размер модели: всегда в мегабайтах («671 МБ») — как и ход её скачивания. */
export const formatMegabytes = (bytes: number): string => `${megabytes(bytes)} МБ`;

/** Ход скачивания: «120 из 464 МБ» — мегабайты, чтобы число росло заметно и у больших моделей. */
export const formatDownloaded = (done: number, total: number): string => `${megabytes(done)} из ${megabytes(total)} МБ`;

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  623 passed (623)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: model sizes and download progress in megabytes"
```

### Task 4: Отмена скачивания модели

**Files:**
- Modify: `src/main/models/download.test.ts`, `src/main/models/download.ts`, `src/main/texts.test.ts`, `src/main/texts.ts`

`downloadFile` принимает `signal`: отмена обрывает запрос и паузу перед повтором, повторов нет, `.part`
остаётся (его стирает тот, кто отменил). Новая причина неудачи — `cancelled` с текстом «Скачивание модели отменено.».

- [ ] **Step 1: Тесты**

**В `src/main/models/download.test.ts` заменить:**

```ts
    await expect(downloadFile(options(url, join(blocker, 'model.onnx')))).rejects.toMatchObject({ kind: 'disk' });
    expect(ranges).toEqual([]);
  });
});

describe('sha256File', () => {
```

**на:**

```ts
    await expect(downloadFile(options(url, join(blocker, 'model.onnx')))).rejects.toMatchObject({ kind: 'disk' });
    expect(ranges).toEqual([]);
  });

  it('stops a running download when cancelled and keeps the part', async () => {
    const controller = new AbortController();
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': BODY.length });
      // Часть файла — и сервер замолкает: отмену прерывает ожидание, а не сторож тишины.
      res.write(BODY.subarray(0, 4000));
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const download = downloadFile({
      ...options(url, dest),
      idleTimeoutMs: 60_000,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(download).rejects.toMatchObject({ kind: 'cancelled' });
    expect(ranges).toHaveLength(1);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(true);
  });

  it('does not wait for the next attempt once cancelled', async () => {
    const controller = new AbortController();
    const { url, ranges } = await serve((_req, res, n) => {
      res.writeHead(500);
      res.end();
      if (n === 0) setTimeout(() => controller.abort(), 20);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const started = Date.now();
    const download = downloadFile({ ...options(url, dest), retryDelayMs: 60_000, signal: controller.signal });
    await expect(download).rejects.toMatchObject({ kind: 'cancelled' });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(ranges).toHaveLength(1);
  });

  it('does not start when already cancelled', async () => {
    const { url, ranges } = await serve(sendBody);
    const controller = new AbortController();
    controller.abort();
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile({ ...options(url, dest), signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(ranges).toEqual([]);
  });
});

describe('sha256File', () => {
```

**В `src/main/texts.test.ts` заменить:**

```ts
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toMatch(/нужно \d+ МБ/);
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
  });

  it('asks for the space the download needs, not for the size of all models', () => {
```

**на:**

```ts
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toMatch(/нужно \d+ МБ/);
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
    expect(transcriptionTexts.download(new DownloadError('cancelled', 'x'))).toBe('Скачивание модели отменено.');
  });

  it('asks for the space the download needs, not for the size of all models', () => {
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/models/download.test.ts src/main/texts.test.ts`
Ожидается: FAIL — отмена не прерывает скачивание (тест ждёт `kind: cancelled`).

- [ ] **Step 3: Код**

**В `src/main/models/download.ts` заменить:**

```ts

/**
 * Почему не скачалось: нет связи (повторяли), сервер отказал в файле (403, 404 — повтор не поможет), файл пришёл
 * испорченным, не хватает места, не записать на диск.
 */
export type DownloadFailure = 'network' | 'server' | 'corrupt' | 'space' | 'disk';

export interface DownloadErrorOptions extends ErrorOptions {
  /** Для 'space': сколько свободного места нужно (недостающие файлы и запас), байт. */
```

**на:**

```ts

/**
 * Почему не скачалось: нет связи (повторяли), сервер отказал в файле (403, 404 — повтор не поможет), файл пришёл
 * испорченным, не хватает места, не записать на диск, скачивание отменили («Отменить» в карточке модели).
 */
export type DownloadFailure = 'network' | 'server' | 'corrupt' | 'space' | 'disk' | 'cancelled';

export interface DownloadErrorOptions extends ErrorOptions {
  /** Для 'space': сколько свободного места нужно (недостающие файлы и запас), байт. */
```

**В `src/main/models/download.ts` заменить:**

```ts
  retryDelayMs?: number;
  /** На столько байт попытка должна продвинуть файл дальше достигнутого, чтобы счёт повторов начался заново. */
  minProgressBytes?: number;
}

export const IDLE_TIMEOUT_MS = 30_000;
```

**на:**

```ts
  retryDelayMs?: number;
  /** На столько байт попытка должна продвинуть файл дальше достигнутого, чтобы счёт повторов начался заново. */
  minProgressBytes?: number;
  /** Отмена: запрос обрывается, повторов нет, `.part` остаётся (его удаляет тот, кто отменил). */
  signal?: AbortSignal;
}

const cancelled = (cause?: unknown): DownloadError => new DownloadError('cancelled', 'скачивание отменено', { cause });

/** Пауза перед повтором; отмена её прерывает. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const IDLE_TIMEOUT_MS = 30_000;
```

**В `src/main/models/download.ts` заменить:**

```ts
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };
  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      headers: from > 0 ? { Range: `bytes=${from}-` } : {},
```

**на:**

```ts
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };
  const stop = (): void => controller.abort();
  options.signal?.addEventListener('abort', stop, { once: true });
  if (options.signal?.aborted) stop();
  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      headers: from > 0 ? { Range: `bytes=${from}-` } : {},
```

**В `src/main/models/download.ts` заменить:**

```ts
    }
  } finally {
    clearTimeout(timer);
    // Запрос освобождается при любом исходе (ошибка сервера, нет данных, файл не открылся); после полного чтения — no-op.
    controller.abort();
  }
```

**на:**

```ts
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
    // Запрос освобождается при любом исходе (ошибка сервера, нет данных, файл не открылся); после полного чтения — no-op.
    controller.abort();
  }
```

**В `src/main/models/download.ts` заменить:**

```ts
  // Самый длинный .part за всё скачивание: сервер без Range качает с нуля, и рост от нуля — не продвижение.
  let reached = await sizeOf(part);
  for (let attempt = 0; ; attempt++) {
    try {
      await fetchInto(part, options);
      // Сервер закрыл ответ раньше времени без ошибки — докачиваем, как после обрыва.
      if ((await sizeOf(part)) < options.size) throw new Error('ответ оборвался');
      break;
    } catch (err) {
      if (isDiskError(err)) throw new DownloadError('disk', 'не удалось записать файл модели', { cause: err });
      if (err instanceof FinalHttpError) throw new DownloadError('server', err.message, { cause: err });
      if (err instanceof OversizeError) {
```

**на:**

```ts
  // Самый длинный .part за всё скачивание: сервер без Range качает с нуля, и рост от нуля — не продвижение.
  let reached = await sizeOf(part);
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw cancelled();
    try {
      await fetchInto(part, options);
      // Сервер закрыл ответ раньше времени без ошибки — докачиваем, как после обрыва.
      if ((await sizeOf(part)) < options.size) throw new Error('ответ оборвался');
      break;
    } catch (err) {
      if (options.signal?.aborted) throw cancelled(err);
      if (isDiskError(err)) throw new DownloadError('disk', 'не удалось записать файл модели', { cause: err });
      if (err instanceof FinalHttpError) throw new DownloadError('server', err.message, { cause: err });
      if (err instanceof OversizeError) {
```

**В `src/main/models/download.ts` заменить:**

```ts
      if (now >= reached + minProgress) attempt = -1;
      else if (attempt >= retries) throw new DownloadError('network', 'нет связи с сервером', { cause: err });
      reached = Math.max(reached, now);
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
    }
  }
  const size = await sizeOf(part);
```

**на:**

```ts
      if (now >= reached + minProgress) attempt = -1;
      else if (attempt >= retries) throw new DownloadError('network', 'нет связи с сервером', { cause: err });
      reached = Math.max(reached, now);
      await pause(options.retryDelayMs ?? RETRY_DELAY_MS, options.signal);
    }
  }
  const size = await sizeOf(part);
```

**В `src/main/texts.ts` заменить:**

```ts
        return `Не хватает места на диске для модели расшифровки: нужно ${Math.ceil((err.neededBytes ?? TOTAL_MODELS_SIZE) / 1024 ** 2)} МБ свободного места.`;
      case 'disk':
        return MODELS_DISK_TEXT;
    }
  },
  /** Сбой процесса расшифровки (его текст — для журнала: вывод sherpa-onnx и ffmpeg, пути к файлам) → текст для человека. */
```

**на:**

```ts
        return `Не хватает места на диске для модели расшифровки: нужно ${Math.ceil((err.neededBytes ?? TOTAL_MODELS_SIZE) / 1024 ** 2)} МБ свободного места.`;
      case 'disk':
        return MODELS_DISK_TEXT;
      case 'cancelled':
        return 'Скачивание модели отменено.';
    }
  },
  /** Сбой процесса расшифровки (его текст — для журнала: вывод sherpa-onnx и ffmpeg, пути к файлам) → текст для человека. */
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  626 passed (626)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cancel a model download"
```

### Task 5: Файлы всего каталога; скачивание и удаление по модели

**Files:**
- Create: `src/main/models/fake-model-store.test.ts`, `src/main/models/fake-model-store.ts`, `src/main/models/models-state.test.ts`, `src/main/models/models-state.ts`
- Modify: `e2e/transcription.spec.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/models/model-manager.test.ts`, `src/main/models/model-manager.ts`, `src/main/models/registry.test.ts`, `src/main/models/registry.ts`, `src/main/texts.test.ts`, `src/main/texts.ts`, `src/main/transcription/queue.test.ts`, `src/main/transcription/queue.ts`, `src/main/transcription/sherpa-engines.ts`, `src/main/transcription/sherpa.int.test.ts`, `src/main/transcription/worker.ts`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/TranscribeDialog.tsx`, `src/renderer/main/TranscriptionSettings.tsx`, `src/renderer/main/format.test.ts`, `src/renderer/main/format.ts`, `src/renderer/main/transcription-format.test.ts`, `src/renderer/main/transcription-format.ts`, `src/shared/transcription.ts`, `src/test-support/model-fixtures.ts`

Реестр получает файлы всех моделей каталога (у каждой — своя папка; адреса Hugging Face закреплены на
коммитах, размеры и SHA-256 сверены 2026-10-02). Группа файлов теперь — модель расшифровки (`gigaam-v3-e2e-rnnt`,
`t-one`, …) или `voices`; прежний id группы `gigaam` уходит (в `verified.json` ключи — пути файлов, переносить
нечего). `ModelManager.ensure(groups, { onProgress, signal })` проверяет и качает только нужные группы; вызовы идут по
очереди, отменённый вызов снимается сразу, даже если ещё ждёт очереди, и не пропускает следующий вперёд чужого
скачивания. `ModelStore` — то, что main знает о хранилище моделей; в сквозных тестах его заменяет `FakeModelStore`
(«скачивание» за пять шагов по `TEXTMEET_TEST_DOWNLOAD_MS`). `buildModelsState` собирает то, что окно увидит в
каталоге.

Временно (до Task 6–10): очередь расшифровывает только GigaAM и просит группы `[gigaam, voices]`, раздел настроек
показывает прежний список скачанных моделей, окно передаёт `model: null`. В сквозных тестах перед расшифровкой
появляется этап «Скачиваем модель GigaAM v3» (поддельная модель «скачивается» мгновенно) — тесты его допускают.

- [ ] **Step 1: Тесты**

**В `e2e/transcription.spec.ts` заменить:**

```ts
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toBeFocused();

  // Пока новая расшифровка идёт, старый текст виден, а над ним — её ход.
  await expect(page.getByText('Текст заменится, когда новая расшифровка закончится.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /В очереди на расшифровку|Готовим звук/ })).toBeVisible();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText(/в очереди на расшифровку|расшифровка/);

  await transcription.release();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
```

**на:**

```ts
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toBeFocused();

  // Пока новая расшифровка идёт, старый текст виден, а над ним — её ход (модели в тестах «скачиваются» мгновенно).
  await expect(page.getByText('Текст заменится, когда новая расшифровка закончится.')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: /В очереди на расшифровку|Скачиваем модель GigaAM v3|Готовим звук/ }),
  ).toBeVisible();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText(/в очереди на расшифровку|скачиваем модель|расшифровка/);

  await transcription.release();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
```

**Создать `src/main/models/fake-model-store.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { FakeModelStore } from './fake-model-store';
import { groupSize } from './registry';

describe('FakeModelStore', () => {
  it('«downloads» in steps and then shows the groups as installed', async () => {
    const store = new FakeModelStore('M', 0);
    const progress: number[] = [];
    await store.ensure(['t-one', 'voices'], { onProgress: (p) => progress.push(p.done) });
    const total = groupSize('t-one') + groupSize('voices');
    expect(progress).toHaveLength(5);
    expect(progress.at(-1)).toBe(total);
    const state = await store.state();
    expect(state.find((g) => g.id === 't-one')).toEqual({ id: 't-one', sizeBytes: groupSize('t-one'), installed: true });
    expect(state.find((g) => g.id === 'gigaam-v3-e2e-rnnt')?.installed).toBe(false);
    expect(store.root).toBe('M');
  });

  it('stops when cancelled and can remove a group', async () => {
    const store = new FakeModelStore('M', 0);
    const controller = new AbortController();
    controller.abort();
    await expect(store.ensure(['t-one'], { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    await store.ensure(['t-one']);
    await store.remove('t-one');
    expect((await store.state()).find((g) => g.id === 't-one')?.installed).toBe(false);
    // Уже скачанное — без «скачивания».
    await store.ensure([]);
  });
});
```

**Заменить всё содержимое `src/main/models/model-manager.test.ts` на:**

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, promises as fsp, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import type { Logger } from '../logger';
import { DownloadError, type DownloadOptions } from './download';
import { ModelManager, VERIFIED_FILE } from './model-manager';
import type { ModelFile } from './registry';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };
const content = (name: string) => Buffer.from(`model ${name}`);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const G = 'gigaam-v3-e2e-rnnt';
const ALL = [G, 'voices'] as const;
const file = (group: typeof G | 'voices', path: string): ModelFile => ({
  group,
  path,
  url: `https://example.test/${path}`,
  size: content(path).length,
  sha256: sha(content(path)),
});
const FILES = [file(G, 'g/encoder.onnx'), file(G, 'g/tokens.txt'), file('voices', 'v/vad.onnx')];

/** Поддельное скачивание: пишет правильное содержимое и сообщает прогресс. */
const fakeDownload = vi.fn(async (options: DownloadOptions) => {
  const name = FILES.find((f) => f.url === options.url)?.path ?? '';
  mkdirSync(dirname(options.dest), { recursive: true });
  options.onProgress?.(options.size);
  writeFileSync(options.dest, content(name));
});

function manager(root: string, overrides: Partial<ConstructorParameters<typeof ModelManager>[0]> = {}) {
  fakeDownload.mockClear();
  return new ModelManager({
    root,
    logger,
    files: FILES,
    download: fakeDownload,
    freeBytes: async () => 10 ** 12,
    ...overrides,
  });
}

const put = (root: string, path: string, data: Buffer) => {
  const target = join(root, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
};

describe('ModelManager.ensure', () => {
  it('downloads every missing file and reports bytes', async () => {
    const root = makeTempDir();
    const progress: { done: number; total: number }[] = [];
    await manager(root).ensure(ALL, { onProgress: (p) => progress.push(p) });
    expect(fakeDownload).toHaveBeenCalledTimes(3);
    const total = FILES.reduce((sum, f) => sum + f.size, 0);
    expect(progress[0]).toEqual({ done: 0, total });
    expect(progress.at(-1)).toEqual({ done: total, total });
    expect(JSON.parse(readFileSync(join(root, VERIFIED_FILE), 'utf8'))).toHaveProperty(['g/encoder.onnx']);
  });

  it('keeps files that are already there and intact', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, f.path, content(f.path));
    const hash = vi.fn(async (path: string) => sha(readFileSync(path)));
    await manager(root, { hash }).ensure(ALL);
    expect(fakeDownload).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledTimes(3);
    // Второй раз суммы не пересчитываются — хватает запомненного.
    hash.mockClear();
    await manager(root, { hash }).ensure(ALL);
    expect(hash).not.toHaveBeenCalled();
  });

  it('replaces a damaged file', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, f.path, content(f.path));
    put(root, 'v/vad.onnx', Buffer.alloc(content('v/vad.onnx').length, 7));
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(root, 'v', 'vad.onnx'))).toEqual(content('v/vad.onnx'));
  });

  it('checks a file again after it changed on disk', async () => {
    const root = makeTempDir();
    await manager(root).ensure(ALL);
    put(root, 'g/tokens.txt', Buffer.from('other'));
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(1);
  });

  it('refuses to start without enough free space', async () => {
    const root = makeTempDir();
    await expect(manager(root, { freeBytes: async () => 10 }).ensure(ALL)).rejects.toMatchObject({ kind: 'space' });
    expect(fakeDownload).not.toHaveBeenCalled();
  });

  it('does not count already downloaded parts as needed space', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, `${f.path}.part`, content(f.path));
    // Места ровно на запас: без учёта .part не хватило бы.
    const m = manager(root, { freeBytes: async () => 50 * 1024 * 1024 + 1 });
    await m.ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('counts a .part longer than the file as nothing downloaded', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, `${f.path}.part`, Buffer.alloc(f.size * 100));
    const needed = FILES.reduce((sum, f) => sum + f.size, 0);
    // Места на запас и на файлы целиком — хватает, только если лишние .part не вычтены из нужного.
    const m = manager(root, { freeBytes: async () => 50 * 1024 * 1024 + needed - 1 });
    // Нужное место — недостающие файлы и запас: столько и назовёт сообщение.
    await expect(m.ensure(ALL)).rejects.toMatchObject({ kind: 'space', neededBytes: 50 * 1024 * 1024 + needed });
    await manager(root, { freeBytes: async () => 50 * 1024 * 1024 + needed }).ensure(ALL);
  });

  it('does not fail when the list of checked files cannot be saved', async () => {
    const root = makeTempDir();
    // Папка на месте verified.json: ни прочитать, ни записать.
    mkdirSync(join(root, VERIFIED_FILE), { recursive: true });
    vi.mocked(logger.warn).mockClear();
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
    expect(readFileSync(join(root, 'v', 'vad.onnx'))).toEqual(content('v/vad.onnx'));
    expect(logger.warn).toHaveBeenCalled();
  });

  it('warns about a damaged verified.json instead of silently ignoring it', async () => {
    const root = makeTempDir();
    writeFileSync(join(root, VERIFIED_FILE), '{broken');
    vi.mocked(logger.warn).mockClear();
    await manager(root).state();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(VERIFIED_FILE), expect.anything());
  });

  it('shares one check between callers', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await Promise.all([m.ensure(ALL), m.ensure(ALL)]);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('downloads only the groups asked for', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure(['voices']);
    expect(fakeDownload).toHaveBeenCalledTimes(1);
    expect((await m.state()).map((g) => [g.id, g.installed])).toEqual([
      [G, false],
      ['voices', true],
    ]);
  });

  it('runs calls one after another, so a file is downloaded once', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await Promise.all([m.ensure([G]), m.ensure(ALL)]);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('passes the cancel signal to the download and keeps working after a cancel', async () => {
    const root = makeTempDir();
    const controller = new AbortController();
    const m = manager(root, {
      download: async (options) => {
        if (!options.signal) return fakeDownload(options);
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        throw new DownloadError('cancelled', 'скачивание отменено');
      },
    });
    await expect(m.ensure([G], { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    // Уже отменённое не начинается; следующая проверка без отмены идёт как обычно.
    await expect(m.ensure([G], { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    await m.ensure(['voices']);
    expect((await m.state()).find((g) => g.id === 'voices')?.installed).toBe(true);
  });

  it('drops a cancelled call that is still waiting for its turn, without letting the next one jump the queue', async () => {
    const root = makeTempDir();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const m = manager(root, {
      download: async (options) => {
        order.push(options.dest);
        if (order.length === 1) await gate;
        await fakeDownload(options);
      },
    });
    const first = m.ensure([G]);
    const controller = new AbortController();
    const waiting = m.ensure(['voices'], { signal: controller.signal });
    const third = m.ensure(['voices']);
    controller.abort();
    // Снятый вызов отвечает сразу, хотя первое скачивание ещё идёт.
    await expect(waiting).rejects.toMatchObject({ kind: 'cancelled' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Третий не начал скачивать раньше, чем закончился первый.
    expect(order.some((dest) => dest.endsWith('vad.onnx'))).toBe(false);
    release();
    await Promise.all([first, third]);
    expect((await m.state()).every((g) => g.installed)).toBe(true);
  });

  it('survives a damaged verified.json', async () => {
    const root = makeTempDir();
    writeFileSync(join(root, VERIFIED_FILE), '{broken');
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });
});

describe('ModelManager.state and remove', () => {
  it('shows each group with its size and whether it is installed', async () => {
    const root = makeTempDir();
    const m = manager(root);
    expect((await m.state()).map((g) => [g.id, g.installed])).toEqual([
      [G, false],
      ['voices', false],
    ]);
    await m.ensure(ALL);
    const groups = await m.state();
    expect(groups.every((g) => g.installed)).toBe(true);
    expect(groups[0]?.sizeBytes).toBe(FILES[0]!.size + FILES[1]!.size);
  });

  it('removes one group and forgets it was checked', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure(ALL);
    await m.remove(G);
    expect(existsSync(join(root, 'g', 'encoder.onnx'))).toBe(false);
    expect(existsSync(join(root, 'v', 'vad.onnx'))).toBe(true);
    expect((await m.state()).map((g) => g.installed)).toEqual([false, true]);
    expect(Object.keys(JSON.parse(readFileSync(join(root, VERIFIED_FILE), 'utf8')))).toEqual(['v/vad.onnx']);
  });

  it('refuses to remove models while they are being checked or downloaded', async () => {
    const root = makeTempDir();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const m = manager(root, {
      download: async (options) => {
        await gate;
        await fakeDownload(options);
      },
    });
    const ensuring = m.ensure(ALL);
    await expect(m.remove(G)).rejects.toThrow('скачиваются');
    release();
    await ensuring;
    expect((await m.state()).every((g) => g.installed)).toBe(true);
    await m.remove(G);
    expect((await m.state()).map((g) => g.installed)).toEqual([false, true]);
  });

  it('checks the models only after a running removal has finished', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure(ALL);
    fakeDownload.mockClear();
    // Удаление медленное (антивирус держит файл): без ожидания проверка успела бы признать файлы целыми.
    const rm = fsp.rm.bind(fsp);
    const slowRm = vi.spyOn(fsp, 'rm').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      await rm(...args);
    });
    try {
      const removing = m.remove(G);
      const ensuring = m.ensure(ALL);
      await Promise.all([removing, ensuring]);
    } finally {
      slowRm.mockRestore();
    }
    // Проверка не увидела файлы, которые удаление вот-вот сотрёт: удалённое скачано заново.
    expect(fakeDownload).toHaveBeenCalledTimes(2);
    expect((await m.state()).every((g) => g.installed)).toBe(true);
  });
});
```

**Создать `src/main/models/models-state.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { buildModelsState } from './models-state';
import { groupSize } from './registry';

describe('buildModelsState', () => {
  it('lists every catalog model in order, the shared voice models apart, and what is going on', () => {
    const state = buildModelsState(
      [
        { id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true },
        { id: 'voices', sizeBytes: 3, installed: true },
      ],
      't-one',
      { download: { id: 't-one', done: 1, total: 2 }, downloadError: null },
      true,
    );
    expect(state.models.map((m) => m.id)).toEqual([...ASR_MODEL_IDS]);
    expect(state.models[0]).toEqual({ id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true });
    expect(state.models.find((m) => m.id === 't-one')).toEqual({ id: 't-one', sizeBytes: groupSize('t-one'), installed: false });
    expect(state.voices).toEqual({ sizeBytes: 3, installed: true });
    expect(state).toMatchObject({ selected: 't-one', download: { id: 't-one', done: 1, total: 2 }, downloadError: null, busy: true });
  });

  it('shows a failed download only while the model is still missing', () => {
    const failed = (id: 't-one' | 'gigaam-v3-e2e-rnnt') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    const groups = [{ id: 'gigaam-v3-e2e-rnnt' as const, sizeBytes: 10, installed: true }];
    expect(buildModelsState(groups, 't-one', failed('t-one'), false).downloadError).toEqual({ id: 't-one', message: 'нет связи' });
    expect(buildModelsState(groups, 't-one', failed('gigaam-v3-e2e-rnnt'), false).downloadError).toBeNull();
  });
});
```

**Заменить всё содержимое `src/main/models/registry.test.ts` на:**

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { modelsRoot } from './models-dir';
import { ASR_FOLDERS, asrFilePath, groupFiles, groupSize, MODEL_FILES, MODEL_GROUP_IDS, modelFilePath, voicePaths } from './registry';

describe('model registry', () => {
  it('describes every file with a url, a size and a SHA-256', () => {
    for (const file of MODEL_FILES) {
      expect(file.url).toMatch(/^https:\/\//);
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(MODEL_GROUP_IDS).toContain(file.group);
    }
  });

  it('keeps paths unique and inside the models folder', () => {
    const paths = MODEL_FILES.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).not.toMatch(/\.\.|^\/|\\/);
  });

  it('has files for every catalog model, each in its own folder', () => {
    for (const id of ASR_MODEL_IDS) {
      const files = groupFiles(id);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) expect(file.path.startsWith(`${ASR_FOLDERS[id]}/`)).toBe(true);
    }
    expect(new Set(Object.values(ASR_FOLDERS)).size).toBe(ASR_MODEL_IDS.length);
  });

  it('pins every Hugging Face file to a commit', () => {
    const fromHuggingFace = MODEL_FILES.filter((f) => f.url.startsWith('https://huggingface.co/'));
    expect(fromHuggingFace.length).toBeGreaterThan(30);
    for (const file of fromHuggingFace) expect(file.url).toMatch(/\/resolve\/[0-9a-f]{40}\//);
  });

  it('adds up the sizes shown in the settings', () => {
    expect(groupSize('gigaam-v3-e2e-rnnt')).toBe(326_322_304);
    expect(groupSize('voices')).toBe(33_122_030);
    expect(groupSize('t-one')).toBe(144_193_904);
  });

  it('builds the paths the transcription process loads', () => {
    const paths = voicePaths('M');
    expect(paths.segmentation).toBe(join('M', 'pyannote-segmentation-3-0', 'model.onnx'));
    expect(paths.embedding).toBe(join('M', 'speaker-embedding', '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'));
    expect(paths.vad).toBe(join('M', 'silero-vad', 'silero_vad.onnx'));
    expect(asrFilePath('M', 'qwen3-asr-0.6b', 'tokenizer/vocab.json')).toBe(join('M', 'qwen3-asr-0.6b-int8', 'tokenizer', 'vocab.json'));
  });

  it('refuses a file the registry does not know', () => {
    expect(() => asrFilePath('M', 't-one', 'encoder.onnx')).toThrow('В реестре нет модели t-one-ru/encoder.onnx');
  });

  it('turns a registry path into a path of this system', () => {
    expect(modelFilePath('M', { path: 'a/b.onnx' })).toBe(join('M', 'a', 'b.onnx'));
  });
});

describe('modelsRoot', () => {
  it('uses the service folders of each system', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', localAppData: 'L' })).toBe(join('L', 'TextMeet', 'models'));
    expect(modelsRoot({ platform: 'win32', homeDir: 'H' })).toBe(join('H', 'AppData', 'Local', 'TextMeet', 'models'));
    expect(modelsRoot({ platform: 'darwin', homeDir: 'H' })).toBe(
      join('H', 'Library', 'Application Support', 'TextMeet', 'models'),
    );
    expect(modelsRoot({ platform: 'linux', homeDir: 'H' })).toBe(join('H', '.local', 'share', 'TextMeet', 'models'));
  });

  it('treats an empty %LOCALAPPDATA% as missing', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', localAppData: '' })).toBe(join('H', 'AppData', 'Local', 'TextMeet', 'models'));
  });

  it('takes the folder from tests when given', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', override: 'T' })).toBe('T');
  });
});
```

**В `src/main/texts.test.ts` заменить:**

```ts
  it('explains why models could not be prepared', () => {
    expect(transcriptionTexts.download(new DownloadError('network', 'x'))).toContain('нет связи');
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toMatch(/нужно \d+ МБ/);
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
    expect(transcriptionTexts.download(new DownloadError('cancelled', 'x'))).toBe('Скачивание модели отменено.');
  });

  it('asks for the space the download needs, not for the size of all models', () => {
    const text = transcriptionTexts.download(new DownloadError('space', 'x', { neededBytes: 70.2 * 1024 ** 2 }));
    expect(text).toBe('Не хватает места на диске для модели расшифровки: нужно 71 МБ свободного места.');
```

**на:**

```ts
  it('explains why models could not be prepared', () => {
    expect(transcriptionTexts.download(new DownloadError('network', 'x'))).toContain('нет связи');
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toBe('Не хватает места на диске для модели расшифровки.');
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
    expect(transcriptionTexts.download(new DownloadError('cancelled', 'x'))).toBe('Скачивание модели отменено.');
  });

  it('names the model that could not be loaded', () => {
    expect(transcriptionTexts.modelLoad('Parakeet v3')).toMatch(/^Не удалось загрузить модель «Parakeet v3»\. /);
  });

  it('asks for the space the download needs, not for the size of all models', () => {
    const text = transcriptionTexts.download(new DownloadError('space', 'x', { neededBytes: 70.2 * 1024 ** 2 }));
    expect(text).toBe('Не хватает места на диске для модели расшифровки: нужно 71 МБ свободного места.');
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
  } = {},
) {
  const workers: FakeWorker[] = [];
  const finished: { meeting: Meeting; ok: boolean }[] = [];
  const progress: TranscriptionProgress[][] = [];
  let now = 1_000;
```

**на:**

```ts
  } = {},
) {
  const workers: FakeWorker[] = [];
  /** Какие группы моделей просила каждая задача. */
  const ensured: string[][] = [];
  const finished: { meeting: Meeting; ok: boolean }[] = [];
  const progress: TranscriptionProgress[][] = [];
  let now = 1_000;
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
      workers.push(worker);
      return worker;
    },
    models: { root: 'M', ensure: overrides.ensure ?? (async () => undefined) },
    ffmpegPath: overrides.ffmpegPath ?? (() => 'ffmpeg'),
    threads: () => threads,
    now: () => now,
```

**на:**

```ts
      workers.push(worker);
      return worker;
    },
    models: {
      root: 'M',
      ensure: (groups, options) => {
        ensured.push([...groups]);
        return (overrides.ensure ?? (async () => undefined))(options.onProgress ?? (() => undefined));
      },
    },
    ffmpegPath: overrides.ffmpegPath ?? (() => 'ffmpeg'),
    threads: () => threads,
    now: () => now,
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
  return {
    queue,
    workers,
    finished,
    progress,
    worker: () => workers.at(-1)!,
```

**на:**

```ts
  return {
    queue,
    workers,
    ensured,
    finished,
    progress,
    worker: () => workers.at(-1)!,
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    expect(command).toMatchObject({ modelsDir: 'M', ffmpegPath: 'ffmpeg', threads: 7 });
    expect(command.input).toEqual({
      tracks: [
        { kind: 'mic', file: join(audioDir(lib, meeting.id), 'mic.webm'), offsetSec: 0 },
```

**на:**

```ts
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    expect(command).toMatchObject({ modelsDir: 'M', ffmpegPath: 'ffmpeg', threads: 7 });
    expect(t.ensured).toEqual([['gigaam-v3-e2e-rnnt', 'voices']]);
    expect(command.input).toEqual({
      tracks: [
        { kind: 'mic', file: join(audioDir(lib, meeting.id), 'mic.webm'), offsetSec: 0 },
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
      meetingId: meeting.id,
      stage: 'download',
      fraction: 0,
      download: { done: 100, total: 400 },
    });
    expect((await readMeeting(lib, meeting.id)).errorMessage).toContain('нет связи');
    expect(t.workers).toHaveLength(0);
```

**на:**

```ts
      meetingId: meeting.id,
      stage: 'download',
      fraction: 0,
      download: { done: 100, total: 400, title: 'GigaAM v3' },
    });
    expect((await readMeeting(lib, meeting.id)).errorMessage).toContain('нет связи');
    expect(t.workers).toHaveLength(0);
```

**В `src/main/transcription/sherpa.int.test.ts` заменить:**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureModels, fixture, MODELS_ROOT } from '../../test-support/model-fixtures';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { modelPaths } from '../models/registry';
import { decodeToMono16k } from './decode';
import type { Engines } from './engines';
import { runPipeline, type PipelineInput } from './pipeline';
```

**на:**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureModels, fixture, MODELS_ROOT } from '../../test-support/model-fixtures';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { decodeToMono16k } from './decode';
import type { Engines } from './engines';
import { runPipeline, type PipelineInput } from './pipeline';
```

**В `src/main/transcription/sherpa.int.test.ts` заменить:**

```ts

// Одни движки на все проверки — как в процессе расшифровки: модели загружаются один раз.
let shared: Engines | null = null;
const engines = (): Engines => (shared ??= sherpaEngines(modelPaths(MODELS_ROOT)));
/** Запись четырёх человек — на китайском: русская GigaAM даёт по ней пустой текст, а пустые реплики не пишутся.
 *  Поэтому разделение по голосам проверяется с настоящими моделями голосов, но с «текстом» вместо распознавания. */
const withoutAsr = (): Engines => ({ ...engines(), recognizer: () => ({ recognize: () => 'реплика' }) });
```

**на:**

```ts

// Одни движки на все проверки — как в процессе расшифровки: модели загружаются один раз.
let shared: Engines | null = null;
const engines = (): Engines => (shared ??= sherpaEngines(MODELS_ROOT));
/** Запись четырёх человек — на китайском: русская GigaAM даёт по ней пустой текст, а пустые реплики не пишутся.
 *  Поэтому разделение по голосам проверяется с настоящими моделями голосов, но с «текстом» вместо распознавания. */
const withoutAsr = (): Engines => ({ ...engines(), recognizer: () => ({ recognize: () => 'реплика' }) });
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
    expect(
      meetingNote(meeting('a', at, { status: 'transcribing' }), { ...progress, stage: 'download', fraction: 0 })?.text,
    ).toBe('скачиваем модель…');
    expect(meetingNote(meeting('a', at, { status: 'error', tracks }))).toEqual({ text: 'ошибка расшифровки', tone: 'error' });
  });
```

**на:**

```ts
    expect(
      meetingNote(meeting('a', at, { status: 'transcribing' }), { ...progress, stage: 'download', fraction: 0 })?.text,
    ).toBe('скачиваем модель…');
    const preparing = { ...progress, stage: 'download' as const, fraction: 0, download: { done: 0, total: 0, title: 'T-one' } };
    expect(meetingNote(meeting('a', at, { status: 'transcribing' }), preparing)?.text).toBe('готовим модель…');
    expect(meetingNote(meeting('a', at, { status: 'error', tracks }))).toEqual({ text: 'ошибка расшифровки', tone: 'error' });
  });
```

**В `src/renderer/main/transcription-format.test.ts` заменить:**

```ts

  it('shows how much of the models is downloaded', () => {
    const MB = 1024 * 1024;
    expect(stageText(progress({ stage: 'download', download: { done: 20 * MB, total: 60 * MB } }))).toBe(
      'Скачиваем модель расшифровки — 20 МБ из 60 МБ',
    );
    expect(stageText(progress({ stage: 'download' }))).toBe('Скачиваем модель расшифровки');
  });
});

describe('barFraction and percent', () => {
  it('uses bytes while downloading and the whole work otherwise', () => {
    expect(barFraction(progress({ stage: 'download', fraction: 0, download: { done: 25, total: 100 } }))).toBe(0.25);
    expect(barFraction(progress({ stage: 'download', fraction: 0.1, download: { done: 0, total: 0 } }))).toBe(0.1);
    expect(barFraction(progress({ fraction: 0.7 }))).toBe(0.7);
    expect(percent(0.624)).toBe(62);
    expect(percent(2)).toBe(100);
```

**на:**

```ts

  it('shows how much of the models is downloaded', () => {
    const MB = 1024 * 1024;
    expect(stageText(progress({ stage: 'download', download: { done: 20 * MB, total: 60 * MB, title: 'Parakeet v3' } }))).toBe(
      'Скачиваем модель Parakeet v3 — 20 из 60 МБ',
    );
    expect(stageText(progress({ stage: 'download' }))).toBe('Скачиваем модель расшифровки');
    expect(stageText(progress({ stage: 'download', download: { done: 0, total: 0, title: 'Whisper large-v3-turbo' } }))).toBe(
      'Готовим модель Whisper large-v3-turbo',
    );
  });
});

describe('barFraction and percent', () => {
  it('uses bytes while downloading and the whole work otherwise', () => {
    const download = (done: number, total: number) => ({ done, total, title: 'GigaAM v3' });
    expect(barFraction(progress({ stage: 'download', fraction: 0, download: download(25, 100) }))).toBe(0.25);
    expect(barFraction(progress({ stage: 'download', fraction: 0.1, download: download(0, 0) }))).toBe(0.1);
    expect(barFraction(progress({ fraction: 0.7 }))).toBe(0.7);
    expect(percent(0.624)).toBe(62);
    expect(percent(2)).toBe(100);
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/models/fake-model-store.test.ts src/main/models/model-manager.test.ts src/main/models/models-state.test.ts src/main/models/registry.test.ts src/main/texts.test.ts src/main/transcription/queue.test.ts src/main/transcription/sherpa.int.test.ts src/renderer/main/format.test.ts src/renderer/main/transcription-format.test.ts`
Ожидается: FAIL — нет `MODEL_GROUP_IDS`, `voicePaths`, `FakeModelStore`, `buildModelsState`; `ensure` без групп.

- [ ] **Step 3: Код**

**В `src/main/index.ts` заменить:**

```ts
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { ModelManager } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
```

**на:**

```ts
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { FakeModelStore } from './models/fake-model-store';
import { ModelManager, type ModelStore } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
```

**В `src/main/index.ts` заменить:**

```ts
// Разрешение на микрофон по-прежнему решает обработчик программы (permissions.ts).
const testMedia = testMediaMode();
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
// Только для автотестов: поддельные движки расшифровки (worker.ts) — без моделей и их скачивания.
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
```

**на:**

```ts
// Разрешение на микрофон по-прежнему решает обработчик программы (permissions.ts).
const testMedia = testMediaMode();
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
// Только для автотестов: поддельные движки расшифровки (worker.ts) и поддельное хранилище моделей — без моделей и
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
```

**В `src/main/index.ts` заменить:**

```ts
    onSettled: () => sendToMain(IPC.libraryChanged),
  });

  const modelManager = new ModelManager({
    root: modelsRoot({
      platform: process.platform,
      homeDir: app.getPath('home'),
      localAppData: process.env.LOCALAPPDATA,
      override: process.env.TEXTMEET_MODELS_DIR,
    }),
    logger,
    freeBytes: freeDiskBytes,
  });
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger),
    models: fakeAsr ? { root: modelManager.root, ensure: async () => undefined } : modelManager,
    ffmpegPath: () => resolveFfmpegPath(),
    // Запись начинается и кончается по ходу расшифровки: число потоков спрашивается каждый раз.
    threads: () => (controller.getState().phase === 'idle' ? FULL_THREADS : RECORDING_THREADS),
```

**на:**

```ts
    onSettled: () => sendToMain(IPC.libraryChanged),
  });

  const modelsDir = modelsRoot({
    platform: process.platform,
    homeDir: app.getPath('home'),
    localAppData: process.env.LOCALAPPDATA,
    override: process.env.TEXTMEET_MODELS_DIR,
  });
  const models: ModelStore = fakeAsr
    ? new FakeModelStore(modelsDir, fakeDownloadStepMs)
    : new ModelManager({ root: modelsDir, logger, freeBytes: freeDiskBytes });
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger),
    models,
    ffmpegPath: () => resolveFfmpegPath(),
    // Запись начинается и кончается по ходу расшифровки: число потоков спрашивается каждый раз.
    threads: () => (controller.getState().phase === 'idle' ? FULL_THREADS : RECORDING_THREADS),
```

**В `src/main/index.ts` заменить:**

```ts
    },
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    transcription: queue,
    models: modelManager,
  });

  app.on('before-quit', (event) => {
```

**на:**

```ts
    },
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    transcription: queue,
    models,
  });

  app.on('before-quit', (event) => {
```

**В `src/main/ipc.ts` заменить:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelGroupState, ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { systemSettingsUrl } from './texts';
```

**на:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { DEFAULT_ASR_MODEL } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildModelsState } from './models/models-state';
import { MODEL_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { systemSettingsUrl } from './texts';
```

**В `src/main/ipc.ts` заменить:**

```ts
    isBusy(): boolean;
    stopIdleWorker(): void;
  };
  models: {
    state(): Promise<ModelGroupState[]>;
    remove(group: 'gigaam' | 'voices'): Promise<void>;
  };
}

const StopDialogAnswerSchema = z.object({
```

**на:**

```ts
    isBusy(): boolean;
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
}

const StopDialogAnswerSchema = z.object({
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.getTranscriptionProgress, () => deps.transcription.progress());

  const modelsState = async (): Promise<ModelsState> => ({
    groups: await deps.models.state(),
    busy: deps.transcription.isBusy(),
  });

  handle(IPC.getModels, () => modelsState());

  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(['gigaam', 'voices']).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    deps.transcription.stopIdleWorker();
    try {
```

**на:**

```ts

  handle(IPC.getTranscriptionProgress, () => deps.transcription.progress());

  const modelsState = async (): Promise<ModelsState> =>
    buildModelsState(
      await deps.models.state(),
      deps.settings.get().asrModel,
      { download: null, downloadError: null },
      deps.transcription.isBusy(),
    );

  handle(IPC.getModels, () => modelsState());

  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(MODEL_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    deps.transcription.stopIdleWorker();
    try {
```

**В `src/main/ipc.ts` заменить:**

```ts
    } catch (err) {
      throw humanFsError('Не удалось удалить модели', err);
    }
    return modelsState();
  });
```

**на:**

```ts
    } catch (err) {
      throw humanFsError('Не удалось удалить модели', err);
    }
    // Удалили выбранную модель — новые встречи пойдут на модель по умолчанию (она скачается при расшифровке).
    if (group === deps.settings.get().asrModel) await deps.settings.update({ asrModel: DEFAULT_ASR_MODEL });
    return modelsState();
  });
```

**Создать `src/main/models/fake-model-store.ts`:**

```ts
// Поддельное хранилище моделей — только для автотестов (TEXTMEET_TEST_ASR=fake): «скачивание» без сети за пять шагов
// по stepMs (TEXTMEET_TEST_DOWNLOAD_MS), отмена, удаление. Сквозные тесты проверяют каталог в окне, а не загрузку.
import type { ModelGroupState } from '../../shared/transcription';
import { DownloadError } from './download';
import type { EnsureOptions, ModelStore } from './model-manager';
import { groupSize, MODEL_GROUP_IDS, type ModelGroupId } from './registry';

const STEPS = 5;

export class FakeModelStore implements ModelStore {
  private readonly installed = new Set<ModelGroupId>();

  constructor(
    readonly root: string,
    private readonly stepMs: number,
  ) {}

  async ensure(groups: readonly ModelGroupId[], options: EnsureOptions = {}): Promise<void> {
    const missing = groups.filter((g) => !this.installed.has(g));
    if (missing.length === 0) return;
    const total = missing.reduce((sum, g) => sum + groupSize(g), 0);
    for (let step = 1; step <= STEPS; step++) {
      if (options.signal?.aborted) throw new DownloadError('cancelled', 'скачивание отменено');
      await new Promise((resolve) => setTimeout(resolve, this.stepMs));
      options.onProgress?.({ done: Math.round((total * step) / STEPS), total });
    }
    if (options.signal?.aborted) throw new DownloadError('cancelled', 'скачивание отменено');
    for (const group of missing) this.installed.add(group);
  }

  async state(): Promise<(ModelGroupState & { id: ModelGroupId })[]> {
    return MODEL_GROUP_IDS.map((id) => ({ id, sizeBytes: groupSize(id), installed: this.installed.has(id) }));
  }

  async remove(group: ModelGroupId): Promise<void> {
    this.installed.delete(group);
  }
}
```

**В `src/main/models/model-manager.ts` заменить:**

```ts
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { DownloadError, downloadFile, sha256File } from './download';
import { MODEL_FILES, MODEL_GROUPS, modelFilePath, type ModelFile, type ModelGroupId } from './registry';

/** Файл, куда запоминается, какие модели уже проверены по SHA-256 (проверка 320 МБ — пара секунд). */
export const VERIFIED_FILE = 'verified.json';
```

**на:**

```ts
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { DownloadError, downloadFile, sha256File } from './download';
import { MODEL_FILES, MODEL_GROUP_IDS, modelFilePath, type ModelFile, type ModelGroupId } from './registry';

/** Файл, куда запоминается, какие модели уже проверены по SHA-256 (проверка 320 МБ — пара секунд). */
export const VERIFIED_FILE = 'verified.json';
```

**В `src/main/models/model-manager.ts` заменить:**

```ts
  total: number;
}

export interface ModelManagerDeps {
  root: string;
  logger: Logger;
```

**на:**

```ts
  total: number;
}

export interface EnsureOptions {
  onProgress?(progress: DownloadProgress): void;
  /** Отмена скачивания (кнопка «Отменить» в карточке модели). */
  signal?: AbortSignal;
}

/** Модели на диске глазами main: ModelManager, а в автотестах — FakeModelStore. */
export interface ModelStore {
  readonly root: string;
  ensure(groups: readonly ModelGroupId[], options?: EnsureOptions): Promise<void>;
  state(): Promise<(ModelGroupState & { id: ModelGroupId })[]>;
  remove(group: ModelGroupId): Promise<void>;
}

const cancelled = (): DownloadError => new DownloadError('cancelled', 'скачивание отменено');

/** Дождаться своей очереди; отмена прерывает ожидание. */
function untilAborted(turn: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return turn;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    void turn.then(() => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) reject(cancelled());
      else resolve();
    });
  });
}

export interface ModelManagerDeps {
  root: string;
  logger: Logger;
```

**В `src/main/models/model-manager.ts` заменить:**

```ts
}

/** Модели на диске: проверка, скачивание недостающих, удаление по группам. */
export class ModelManager {
  private ensuring: Promise<void> | null = null;
  private removing: Promise<void> | null = null;
  private readonly files: readonly ModelFile[];
```

**на:**

```ts
}

/** Модели на диске: проверка, скачивание недостающих, удаление по группам. */
export class ModelManager implements ModelStore {
  /** Проверки и скачивания идут по одной: две не качают один файл и не делят место на диске. */
  private chain: Promise<void> = Promise.resolve();
  private ensuring = 0;
  private removing: Promise<void> | null = null;
  private readonly files: readonly ModelFile[];
```

**В `src/main/models/model-manager.ts` заменить:**

```ts
  }

  /**
   * Все модели на месте и целы; недостающие и испорченные скачиваются.
   * Одновременные вызовы ждут одну и ту же проверку; идущее удаление проверка сначала дожидается.
   */
  ensure(onProgress: (progress: DownloadProgress) => void = () => undefined): Promise<void> {
    const removing = this.removing?.catch(() => undefined);
    this.ensuring ??= (async () => {
      await removing;
      await this.runEnsure(onProgress);
    })().finally(() => {
      this.ensuring = null;
    });
    return this.ensuring;
  }

  async state(): Promise<ModelGroupState[]> {
    const verified = await this.readVerified();
    return Promise.all(
      MODEL_GROUPS.map(async (group) => {
        const files = this.files.filter((f) => f.group === group.id);
        const present = await Promise.all(files.map((f) => this.isVerified(f, verified)));
        return {
          id: group.id,
          title: group.title,
          sizeBytes: files.reduce((sum, f) => sum + f.size, 0),
          installed: present.every(Boolean),
        };
      }),
    );
  }

  /** Удаляет группу моделей. Во время проверки или скачивания (ensure) отказывает: main удаляет только без очереди. */
  remove(group: ModelGroupId): Promise<void> {
    if (this.ensuring) return Promise.reject(new Error(MODELS_ENSURING));
    const previous = this.removing?.catch(() => undefined);
    const removing = (async () => {
      await previous;
```

**на:**

```ts
  }

  /**
   * Файлы групп на месте и целы; недостающие и испорченные скачиваются. Вызовы идут по очереди: второй ждёт первого
   * и находит уже скачанное. Идущее удаление проверка сначала дожидается. Отмена (options.signal) снимает и вызов,
   * который ещё ждёт своей очереди, — сразу, не дожидаясь чужого скачивания.
   */
  ensure(groups: readonly ModelGroupId[], options: EnsureOptions = {}): Promise<void> {
    this.ensuring += 1;
    const removing = this.removing?.catch(() => undefined);
    const turn = this.chain;
    const run = untilAborted(turn, options.signal).then(async () => {
      await removing;
      await this.runEnsure(this.files.filter((f) => groups.includes(f.group)), options);
    });
    // Следующий вызов ждёт и этот, и предыдущий: снятый с очереди вызов не пропускает его вперёд чужого скачивания.
    this.chain = Promise.all([turn, run.catch(() => undefined)]).then(() => undefined);
    return run.finally(() => {
      this.ensuring -= 1;
    });
  }

  /** Группы, у которых есть файлы, в порядке каталога: размер и скачаны ли. */
  async state(): Promise<(ModelGroupState & { id: ModelGroupId })[]> {
    const verified = await this.readVerified();
    const groups = MODEL_GROUP_IDS.filter((id) => this.files.some((f) => f.group === id));
    return Promise.all(
      groups.map(async (id) => {
        const files = this.files.filter((f) => f.group === id);
        const present = await Promise.all(files.map((f) => this.isVerified(f, verified)));
        return { id, sizeBytes: files.reduce((sum, f) => sum + f.size, 0), installed: present.every(Boolean) };
      }),
    );
  }

  /**
   * Удаляет группу моделей вместе с недокачанными кусками. Во время проверки или скачивания (ensure) отказывает:
   * main удаляет только без очереди и без скачивания из каталога.
   */
  remove(group: ModelGroupId): Promise<void> {
    if (this.ensuring > 0) return Promise.reject(new Error(MODELS_ENSURING));
    const previous = this.removing?.catch(() => undefined);
    const removing = (async () => {
      await previous;
```

**В `src/main/models/model-manager.ts` заменить:**

```ts
    this.deps.logger.info(`Модели удалены: ${group}`);
  }

  private async runEnsure(onProgress: (progress: DownloadProgress) => void): Promise<void> {
    const verified = await this.readVerified();
    const missing: ModelFile[] = [];
    for (const file of this.files) {
      if (await this.isVerified(file, verified)) continue;
      if (await this.checkExisting(file, verified)) continue;
      missing.push(file);
    }
    if (missing.length === 0) return;

    const total = missing.reduce((sum, f) => sum + f.size, 0);
    await fsp.mkdir(this.deps.root, { recursive: true }).catch((err: unknown) => {
```

**на:**

```ts
    this.deps.logger.info(`Модели удалены: ${group}`);
  }

  private async runEnsure(files: readonly ModelFile[], options: EnsureOptions): Promise<void> {
    if (options.signal?.aborted) throw cancelled();
    const onProgress = options.onProgress ?? (() => undefined);
    const verified = await this.readVerified();
    const missing: ModelFile[] = [];
    for (const file of files) {
      if (await this.isVerified(file, verified)) continue;
      if (await this.checkExisting(file, verified)) continue;
      missing.push(file);
    }
    if (missing.length === 0) return;
    if (options.signal?.aborted) throw cancelled();

    const total = missing.reduce((sum, f) => sum + f.size, 0);
    await fsp.mkdir(this.deps.root, { recursive: true }).catch((err: unknown) => {
```

**В `src/main/models/model-manager.ts` заменить:**

```ts
        size: file.size,
        sha256: file.sha256,
        onProgress: (bytes) => onProgress({ done: finished + bytes, total }),
      });
      finished += file.size;
      verified[file.path] = await this.fingerprint(dest, file.sha256);
```

**на:**

```ts
        size: file.size,
        sha256: file.sha256,
        onProgress: (bytes) => onProgress({ done: finished + bytes, total }),
        ...(options.signal && { signal: options.signal }),
      });
      finished += file.size;
      verified[file.path] = await this.fingerprint(dest, file.sha256);
```

**Создать `src/main/models/models-state.ts`:**

```ts
// Что окно видит в каталоге моделей: модели расшифровки по порядку, общие модели голосов, выбор, скачивание.
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelGroupState, ModelsState } from '../../shared/transcription';
import { groupSize, type ModelGroupId } from './registry';

/** Скачивание из каталога глазами окна: что качается и чем кончилась последняя неудача. */
export interface CatalogDownloadsSnapshot {
  download: ModelsState['download'];
  downloadError: ModelsState['downloadError'];
}

export function buildModelsState(
  groups: readonly (ModelGroupState & { id: ModelGroupId })[],
  selected: AsrModelId,
  downloads: CatalogDownloadsSnapshot,
  busy: boolean,
): ModelsState {
  // Группы, которых нет в ответе хранилища, — не скачаны (размер — из реестра).
  const stateOf = (id: ModelGroupId): ModelGroupState =>
    groups.find((g) => g.id === id) ?? { sizeBytes: groupSize(id), installed: false };
  const plain = (state: ModelGroupState): ModelGroupState => ({ sizeBytes: state.sizeBytes, installed: state.installed });
  return {
    selected,
    models: ASR_MODEL_IDS.map((id) => ({ id, ...plain(stateOf(id)) })),
    voices: plain(stateOf('voices')),
    download: downloads.download,
    // Модель всё же скачалась (например, расшифровкой) — прежняя неудача её карточке больше не нужна.
    downloadError:
      downloads.downloadError && !stateOf(downloads.downloadError.id).installed ? downloads.downloadError : null,
    busy,
  };
}
```

**Заменить всё содержимое `src/main/models/registry.ts` на:**

```ts
import { join } from 'node:path';
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelGroupId } from '../../shared/transcription';

// Группа моделей — то, что пользователь скачивает и удаляет одной кнопкой: модель расшифровки или «voices».
export type { ModelGroupId };

export interface ModelFile {
  group: ModelGroupId;
  /** Путь внутри папки моделей, через «/». */
  path: string;
  url: string;
  size: number;
  sha256: string;
}

const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/6888903da215c7735f51101d939f3bfa679fb2b8';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/** Все группы: модели расшифровки в порядке каталога, затем общая группа. */
export const MODEL_GROUP_IDS = [...ASR_MODEL_IDS, 'voices'] as const satisfies readonly ModelGroupId[];

/** Папка модели расшифровки внутри папки моделей. */
export const ASR_FOLDERS: Record<AsrModelId, string> = {
  'gigaam-v3-e2e-rnnt': 'gigaam-v3-e2e-rnnt',
  'parakeet-tdt-0.6b-v3': 'parakeet-tdt-0.6b-v3-int8',
  'qwen3-asr-0.6b': 'qwen3-asr-0.6b-int8',
  'whisper-large-v3-turbo': 'whisper-large-v3-turbo-int8',
  'nemotron-3.5-asr': 'nemotron-3.5-asr-streaming-1120ms-int8',
  't-one': 't-one-ru',
  'parakeet-unified-en-0.6b': 'parakeet-unified-en-0.6b-int8',
  'canary-180m-flash': 'canary-180m-flash-int8',
};

/**
 * Файлы модели из репозитория Hugging Face, закреплённого на коммите: файлы по адресу не подменятся.
 * files: [имя в репозитории, размер, SHA-256]; в папке моделей файл лежит под тем же именем в папке модели.
 */
function huggingFace(group: AsrModelId, repo: string, commit: string, files: [string, number, string][]): ModelFile[] {
  return files.map(([name, size, sha256]) => ({
    group,
    path: `${ASR_FOLDERS[group]}/${name}`,
    url: `https://huggingface.co/${repo}/resolve/${commit}/${name}`,
    size,
    sha256,
  }));
}

// Размеры и SHA-256 сверены 2026-09-29 (GigaAM, голоса) и 2026-10-02 (остальные модели) с Hugging Face (LFS oid;
// у небольших файлов в git — сумма скачанного файла) и релизами sherpa-onnx на GitHub. Адреса Hugging Face закреплены
// на коммитах (2026-10-02): файл по адресу не подменится, а сумма не разойдётся с реестром.
export const MODEL_FILES: readonly ModelFile[] = [
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_encoder_int8.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_encoder_int8.onnx`,
    size: 318_995_997,
    sha256: '2cac62d0c270bd128f898f2be1a2d34780d524a6e9483888ebac7b00f97410f1',
  },
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_decoder.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_decoder.onnx`,
    size: 4_600_058,
    sha256: '781971998e6a355d6a714f6932a30eab295e7ba0d14fd7e0f78c83b87e811860',
  },
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_joint.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_joint.onnx`,
    size: 2_712_896,
    sha256: '602ff7017a93311aad34df1437c8d7f49911353c13d6eae7a6ee7b041339465c',
  },
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_tokens.txt',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_tokens.txt`,
    size: 13_353,
    sha256: '7ddf22514c42c531358182c81446a8159771e9921019f09ae743ea622d40221d',
  },
  ...huggingFace('parakeet-tdt-0.6b-v3', 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', '2bda32ec70b097a55adaa07d9a7173915b43cc78', [
    ['encoder.int8.onnx', 652_184_281, 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247'],
    ['decoder.int8.onnx', 11_845_275, '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e'],
    ['joiner.int8.onnx', 6_355_277, '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3'],
    ['tokens.txt', 93_939, 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d'],
  ]),
  ...huggingFace('qwen3-asr-0.6b', 'csukuangfj2/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25', '68818b2313fe77bd06f6a7c5068ff3ef59d02b8a', [
    ['conv_frontend.onnx', 44_148_281, 'd22dc4423e0940e49884e903d2ea2f7e5567c14fc1aed97e4e26d6b8f208ef9e'],
    ['encoder.int8.onnx', 182_491_662, '60748d3e6744a57c9c91e1b17424a6c2990567e8adceb0783940c03ed98fa9d9'],
    ['decoder.int8.onnx', 755_914_231, '4f6885be5959ae26af3089d38ee7972c5fafbeeb1cf8d5e76eab6d8b61ca5771'],
    ['tokenizer/merges.txt', 1_671_853, '8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5'],
    ['tokenizer/tokenizer_config.json', 12_487, '4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c'],
    ['tokenizer/vocab.json', 2_776_833, 'ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910'],
  ]),
  ...huggingFace('whisper-large-v3-turbo', 'csukuangfj/sherpa-onnx-whisper-turbo', '2ca6ff69fc878651b770880507669577ac41c2ff', [
    ['turbo-encoder.int8.onnx', 674_716_297, 'b02dcdf54f348741e93fe732b67d933c8dcb6735655f710640143081db38878b'],
    ['turbo-decoder.int8.onnx', 361_080_764, '20accd02388482eb3a46bd615631adfdc85e1eb2c7db9ea3f02a40ffe6b81547'],
    ['turbo-tokens.txt', 816_730, 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126'],
  ]),
  ...huggingFace('nemotron-3.5-asr', 'csukuangfj2/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11', 'cba1c96ca5ef0e8393b50584ae153a79145dc492', [
    ['encoder.int8.onnx', 657_601_521, '2fff2166acaa535bd969fb223c1f0783d71029f143cb298bc54c2afe85abf772'],
    ['decoder.int8.onnx', 14_978_075, '19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0'],
    ['joiner.int8.onnx', 9_504_438, '4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce'],
    ['tokens.txt', 131_440, '729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a'],
  ]),
  ...huggingFace('t-one', 'csukuangfj/sherpa-onnx-streaming-t-one-russian-2025-09-08', '9d63341e0f2d8a8b2edaa825aa1fcfe3c5283b47', [
    ['model.onnx', 144_193_702, '5ded080e2a6c86ecc11bcb0902d77524eb3e8b0844cb0c0754347f5aafb4dabc'],
    ['tokens.txt', 202, '27f7b3ba2096c572375fba1a6b29af1f80d86e08a329940612908112695f97e0'],
  ]),
  ...huggingFace('parakeet-unified-en-0.6b', 'csukuangfj2/sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-non-streaming', '8c3a10fb13408c7a7054f6898958bf1c64a8d6c7', [
    ['encoder.int8.onnx', 654_040_552, '6716910b7a0833997fec7a410494c995d70124001a0e9b66d6370d6aced577e0'],
    ['decoder.int8.onnx', 7_257_753, 'a5e223392c90e75f8144cdb5eb95af7625db389e39edef2bd1a9c872b3298fe6'],
    ['joiner.int8.onnx', 1_735_860, '869f43f7d24595c55581ad3bf249a935fb8a71389fbdaa7504b9f46f93140f8a'],
    ['tokens.txt', 8_952, 'dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff'],
  ]),
  ...huggingFace('canary-180m-flash', 'csukuangfj/sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8', '9077164e0d3dd1d5353743e89ceaa1d3a770838c', [
    ['encoder.int8.onnx', 132_678_643, '7a75b4e2a5857a6dcc0819503bbe3fad66943db4a3ccf21d3f27c633667d303f'],
    ['decoder.int8.onnx', 74_437_848, 'e41a2ab9c0c2fe81a1e8ade5a45fb02a74bc4db7d1f91b89a54a25e2cf79cba2'],
    ['tokens.txt', 53_555, '2dae6fc7815f9640645e0c765522b278ee0cef49b482d91f6913e334628d3e77'],
  ]),
  {
    group: 'voices',
    path: 'pyannote-segmentation-3-0/model.onnx',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/9403a6902bb58e3d5ae8c7e77c3422de279db2e0/model.onnx',
    size: 5_992_913,
    sha256: '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079',
  },
  {
    group: 'voices',
    path: 'speaker-embedding/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx',
    url: `${SHERPA_RELEASES}/speaker-recongition-models/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`,
    size: 26_485_263,
    sha256: 'c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5',
  },
  {
    group: 'voices',
    path: 'silero-vad/silero_vad.onnx',
    url: `${SHERPA_RELEASES}/asr-models/silero_vad.onnx`,
    size: 643_854,
    sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
  },
];

/** Пути к общим моделям (разделение по голосам, поиск речи) для процесса расшифровки. */
export interface VoicePaths {
  segmentation: string;
  embedding: string;
  vad: string;
}

/** Абсолютный путь к файлу модели. */
export const modelFilePath = (root: string, file: Pick<ModelFile, 'path'>): string =>
  join(root, ...file.path.split('/'));

function pathOf(root: string, path: string): string {
  const file = MODEL_FILES.find((f) => f.path === path);
  if (!file) throw new Error(`В реестре нет модели ${path}`);
  return modelFilePath(root, file);
}

export function voicePaths(root: string): VoicePaths {
  return {
    segmentation: pathOf(root, 'pyannote-segmentation-3-0/model.onnx'),
    embedding: pathOf(root, 'speaker-embedding/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'),
    vad: pathOf(root, 'silero-vad/silero_vad.onnx'),
  };
}

/** Путь к файлу модели расшифровки по имени внутри её папки; файла нет в реестре — ошибка (опечатка в коде). */
export const asrFilePath = (root: string, model: AsrModelId, name: string): string =>
  pathOf(root, `${ASR_FOLDERS[model]}/${name}`);

export const groupFiles = (group: ModelGroupId): ModelFile[] => MODEL_FILES.filter((f) => f.group === group);
export const groupSize = (group: ModelGroupId): number => groupFiles(group).reduce((sum, f) => sum + f.size, 0);
```

**В `src/main/texts.ts` заменить:**

```ts
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { knownFsReason } from './fs/fs-errors';
import { DownloadError } from './models/download';
import { TOTAL_MODELS_SIZE } from './models/registry';
import { WORKER_REFUSALS } from './transcription/protocol';

const RECORDER_BROKEN_TEXT = 'Окно записи несколько раз закрылось из-за сбоя. Перезапустите TextMeet.';
```

**на:**

```ts
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { knownFsReason } from './fs/fs-errors';
import { DownloadError } from './models/download';
import { WORKER_REFUSALS } from './transcription/protocol';

const RECORDER_BROKEN_TEXT = 'Окно записи несколько раз закрылось из-за сбоя. Перезапустите TextMeet.';
```

**В `src/main/texts.ts` заменить:**

```ts
      case 'corrupt':
        return 'Скачанный файл модели повреждён — при повторе он скачается заново.';
      case 'space':
        // В мегабайтах с округлением вверх: «0,3 ГБ» преуменьшало бы нужное место.
        return `Не хватает места на диске для модели расшифровки: нужно ${Math.ceil((err.neededBytes ?? TOTAL_MODELS_SIZE) / 1024 ** 2)} МБ свободного места.`;
      case 'disk':
        return MODELS_DISK_TEXT;
      case 'cancelled':
        return 'Скачивание модели отменено.';
    }
  },
  /** Сбой процесса расшифровки (его текст — для журнала: вывод sherpa-onnx и ffmpeg, пути к файлам) → текст для человека. */
  workerFailed(raw: string): string {
    if ((Object.values(WORKER_REFUSALS) as string[]).includes(raw)) return raw;
```

**на:**

```ts
      case 'corrupt':
        return 'Скачанный файл модели повреждён — при повторе он скачается заново.';
      case 'space':
        if (err.neededBytes === undefined) return 'Не хватает места на диске для модели расшифровки.';
        // В мегабайтах с округлением вверх: «0,3 ГБ» преуменьшало бы нужное место.
        return `Не хватает места на диске для модели расшифровки: нужно ${Math.ceil(err.neededBytes / 1024 ** 2)} МБ свободного места.`;
      case 'disk':
        return MODELS_DISK_TEXT;
      case 'cancelled':
        return 'Скачивание модели отменено.';
    }
  },
  /** Файлы модели целы (суммы сошлись), но движок их не принял — подробности в журнале. */
  modelLoad: (title: string): string => `Не удалось загрузить модель «${title}». ${SEE_LOG}`,
  /** Сбой процесса расшифровки (его текст — для журнала: вывод sherpa-onnx и ffmpeg, пути к файлам) → текст для человека. */
  workerFailed(raw: string): string {
    if ((Object.values(WORKER_REFUSALS) as string[]).includes(raw)) return raw;
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
// Очередь расшифровки в main (спецификация Плана 3, §5): одна встреча за раз, процесс расшифровки,
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import type { DownloadProgress } from '../models/model-manager';
import { ASR_MODEL_ID } from '../models/registry';
import { transcriptionTexts } from '../texts';
import { buildPipelineInput } from './job-input';
import type { PipelineInput, PipelineResult } from './pipeline';
```

**на:**

```ts
// Очередь расшифровки в main (спецификация Плана 3, §5): одна встреча за раз, процесс расшифровки,
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import { asrModel, DEFAULT_ASR_MODEL } from '../../shared/asr-models';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import type { EnsureOptions } from '../models/model-manager';
import type { ModelGroupId } from '../models/registry';
import { transcriptionTexts } from '../texts';
import { buildPipelineInput } from './job-input';
import type { PipelineInput, PipelineResult } from './pipeline';
```

**В `src/main/transcription/queue.ts` заменить:**

```ts

export interface TranscriptionQueueDeps {
  spawn(): WorkerHandle;
  models: { root: string; ensure(onProgress: (progress: DownloadProgress) => void): Promise<void> };
  ffmpegPath(): string;
  /** Сколько потоков можно занять сейчас (во время записи — меньше, §5.3). */
  threads(): number;
```

**на:**

```ts

export interface TranscriptionQueueDeps {
  spawn(): WorkerHandle;
  models: { root: string; ensure(groups: readonly ModelGroupId[], options: EnsureOptions): Promise<void> };
  ffmpegPath(): string;
  /** Сколько потоков можно занять сейчас (во время записи — меньше, §5.3). */
  threads(): number;
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
  private async transcribe(current: Current, meeting: Meeting): Promise<{ meeting: Meeting; ok: boolean } | null> {
    const { libraryDir, meetingId } = current.job;
    try {
      await this.deps.models
        .ensure((download) => this.setProgress(current, { stage: 'download', fraction: 0, download }))
        .catch((err: unknown) => {
          throw new ShownError(transcriptionTexts.download(err), { cause: err });
        });
```

**на:**

```ts
  private async transcribe(current: Current, meeting: Meeting): Promise<{ meeting: Meeting; ok: boolean } | null> {
    const { libraryDir, meetingId } = current.job;
    try {
      const { title } = asrModel(DEFAULT_ASR_MODEL);
      await this.deps.models
        .ensure([DEFAULT_ASR_MODEL, 'voices'], {
          onProgress: (download) => this.setProgress(current, { stage: 'download', fraction: 0, download: { ...download, title } }),
        })
        .catch((err: unknown) => {
          throw new ShownError(transcriptionTexts.download(err), { cause: err });
        });
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
      }
      await writeTranscript(libraryDir, meetingId, {
        schemaVersion: 1,
        model: ASR_MODEL_ID,
        createdAt: new Date(this.deps.now()).toISOString(),
        speakers: outcome.result.speakers,
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'done', model: ASR_MODEL_ID, errorMessage: null } : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
```

**на:**

```ts
      }
      await writeTranscript(libraryDir, meetingId, {
        schemaVersion: 1,
        model: DEFAULT_ASR_MODEL,
        createdAt: new Date(this.deps.now()).toISOString(),
        speakers: outcome.result.speakers,
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'done', model: DEFAULT_ASR_MODEL, errorMessage: null } : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import type { ModelPaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import { latestByThreads, type Diarizer, type Engines, type Recognizer, type SpeechDetector, type VoiceprintExtractor } from './engines';
import type { Interval } from './turns';
```

**на:**

```ts
// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import { asrFilePath, voicePaths, type VoicePaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import { latestByThreads, type Diarizer, type Engines, type Recognizer, type SpeechDetector, type VoiceprintExtractor } from './engines';
import type { Interval } from './turns';
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts

export const sherpaVersion = (): string => `sherpa-onnx ${sherpa.version}`;

function detector(paths: ModelPaths): SpeechDetector {
  return {
    detect(samples: Float32Array): Interval[] {
      const vad = new sherpa.Vad(
```

**на:**

```ts

export const sherpaVersion = (): string => `sherpa-onnx ${sherpa.version}`;

function detector(paths: VoicePaths): SpeechDetector {
  return {
    detect(samples: Float32Array): Interval[] {
      const vad = new sherpa.Vad(
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
  };
}

function recognizer(paths: ModelPaths, threads: number): Recognizer {
  const native = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
    modelConfig: {
      transducer: { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner },
      tokens: paths.tokens,
      modelType: 'nemo_transducer',
      numThreads: threads,
      provider: 'cpu',
```

**на:**

```ts
  };
}

function recognizer(root: string, threads: number): Recognizer {
  const file = (name: string): string => asrFilePath(root, 'gigaam-v3-e2e-rnnt', name);
  const native = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
    modelConfig: {
      transducer: {
        encoder: file('gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
        decoder: file('gigaam_v3_e2e_rnnt_decoder.onnx'),
        joiner: file('gigaam_v3_e2e_rnnt_joint.onnx'),
      },
      tokens: file('gigaam_v3_e2e_rnnt_tokens.txt'),
      modelType: 'nemo_transducer',
      numThreads: threads,
      provider: 'cpu',
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
}

/** Модели разделения загружаются при первом разделении: встречам без «других» они не нужны. */
function diarizer(paths: ModelPaths, threads: number): Diarizer {
  let native: sherpa.OfflineSpeakerDiarization | null = null;
  return {
    diarize(samples: Float32Array, speakers: number) {
```

**на:**

```ts
}

/** Модели разделения загружаются при первом разделении: встречам без «других» они не нужны. */
function diarizer(paths: VoicePaths, threads: number): Diarizer {
  let native: sherpa.OfflineSpeakerDiarization | null = null;
  return {
    diarize(samples: Float32Array, speakers: number) {
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
  };
}

function voiceprints(paths: ModelPaths, threads: number): VoiceprintExtractor {
  const native = new sherpa.SpeakerEmbeddingExtractor({ model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 });
  return {
    extract(samples: Float32Array): Float32Array | null {
```

**на:**

```ts
  };
}

function voiceprints(paths: VoicePaths, threads: number): VoiceprintExtractor {
  const native = new sherpa.SpeakerEmbeddingExtractor({ model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 });
  return {
    extract(samples: Float32Array): Float32Array | null {
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
 * Движки sherpa-onnx. Распознаватель, разделение по голосам и отпечатки живут, пока жив этот объект, и переиспользуются
 * встречами (загрузка GigaAM — секунды); каждого вида — одна копия, для последнего числа потоков (latestByThreads).
 */
export function sherpaEngines(paths: ModelPaths): Engines {
  return {
    detector: () => detector(paths),
    recognizer: latestByThreads((threads) => recognizer(paths, threads)),
    diarizer: latestByThreads((threads) => diarizer(paths, threads)),
    voiceprints: latestByThreads((threads) => voiceprints(paths, threads)),
  };
```

**на:**

```ts
 * Движки sherpa-onnx. Распознаватель, разделение по голосам и отпечатки живут, пока жив этот объект, и переиспользуются
 * встречами (загрузка GigaAM — секунды); каждого вида — одна копия, для последнего числа потоков (latestByThreads).
 */
export function sherpaEngines(root: string): Engines {
  const paths = voicePaths(root);
  return {
    detector: () => detector(paths),
    recognizer: latestByThreads((threads) => recognizer(root, threads)),
    diarizer: latestByThreads((threads) => diarizer(paths, threads)),
    voiceprints: latestByThreads((threads) => voiceprints(paths, threads)),
  };
```

**В `src/main/transcription/worker.ts` заменить:**

```ts
// Процесс расшифровки (Electron utilityProcess): тяжёлый нативный код отдельно от окон и записи (спецификация §5.2).
// Одна задача за раз; main присылает команды, процесс — прогресс и результат. Падение процесса ловит main.
import { modelPaths } from '../models/registry';
import { decodeToMono16k } from './decode';
import { enginesByModelsDir } from './engines';
import { fakeEngines } from './fake-engines';
```

**на:**

```ts
// Процесс расшифровки (Electron utilityProcess): тяжёлый нативный код отдельно от окон и записи (спецификация §5.2).
// Одна задача за раз; main присылает команды, процесс — прогресс и результат. Падение процесса ловит main.
import { decodeToMono16k } from './decode';
import { enginesByModelsDir } from './engines';
import { fakeEngines } from './fake-engines';
```

**В `src/main/transcription/worker.ts` заменить:**

```ts
let threads = 1;
let busy = false;
/** Загруженные модели остаются в процессе между встречами (он закрывается сам после простоя). */
const enginesFor = enginesByModelsDir((modelsDir) => (fake ? fakeEngines() : sherpaEngines(modelPaths(modelsDir))));

async function transcribe(command: TranscribeCommand): Promise<void> {
  threads = command.threads;
```

**на:**

```ts
let threads = 1;
let busy = false;
/** Загруженные модели остаются в процессе между встречами (он закрывается сам после простоя). */
const enginesFor = enginesByModelsDir((modelsDir) => (fake ? fakeEngines() : sherpaEngines(modelsDir)));

async function transcribe(command: TranscribeCommand): Promise<void> {
  threads = command.threads;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  const retry = () =>
    window.textmeet
      .transcribe({ meetingId: meeting.id, participantsHint: meeting.participantsHint })
      .catch((err: unknown) => onError(errorText(err)));

  return (
```

**на:**

```tsx
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  const retry = () =>
    window.textmeet
      .transcribe({ meetingId: meeting.id, participantsHint: meeting.participantsHint, model: null })
      .catch((err: unknown) => onError(errorText(err)));

  return (
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n });
      onClose();
    } catch (err) {
      setError(errorText(err));
```

**на:**

```tsx
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n, model: null });
      onClose();
    } catch (err) {
      setError(errorText(err));
```

**В `src/renderer/main/TranscriptionSettings.tsx` заменить:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
```

**на:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { asrModel, DEFAULT_ASR_MODEL } from '../../shared/asr-models';
import { formatBytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
```

**В `src/renderer/main/TranscriptionSettings.tsx` заменить:**

```tsx
    }
  };

  const gigaam = models?.groups.find((g) => g.id === 'gigaam');
  const installed = models?.groups.filter((g) => g.installed) ?? [];
  return (
    <section className="sec">
      <h2>Расшифровка</h2>
```

**на:**

```tsx
    }
  };

  const gigaam = models?.models.find((m) => m.id === DEFAULT_ASR_MODEL);
  // Скачанные модели расшифровки и общие модели голосов — одним списком, как в Плане 3.
  const installed: { id: ModelGroupId; title: string; sizeBytes: number }[] = models
    ? [
        ...models.models.filter((m) => m.installed).map((m) => ({ id: m.id, title: asrModel(m.id).title, sizeBytes: m.sizeBytes })),
        ...(models.voices.installed
          ? [{ id: 'voices' as const, title: 'Разделение по голосам и поиск речи', sizeBytes: models.voices.sizeBytes }]
          : []),
      ]
    : [];
  return (
    <section className="sec">
      <h2>Расшифровка</h2>
```

**В `src/renderer/main/format.ts` заменить:**

```ts
    case 'queued':
      return { text: 'в очереди на расшифровку', tone: 'accent' };
    case 'transcribing':
      if (progress?.stage === 'download') return { text: 'скачиваем модель…', tone: 'accent' };
      return progress
        ? { text: `расшифровка ${percent(progress.fraction)}%`, tone: 'accent' }
        : { text: 'расшифровка…', tone: 'accent' };
```

**на:**

```ts
    case 'queued':
      return { text: 'в очереди на расшифровку', tone: 'accent' };
    case 'transcribing':
      if (progress?.stage === 'download') {
        // Байтов нет — модель проверяется или ждёт другого скачивания.
        return { text: progress.download?.total === 0 ? 'готовим модель…' : 'скачиваем модель…', tone: 'accent' };
      }
      return progress
        ? { text: `расшифровка ${percent(progress.fraction)}%`, tone: 'accent' }
        : { text: 'расшифровка…', tone: 'accent' };
```

**В `src/renderer/main/transcription-format.ts` заменить:**

```ts
// Тексты и форматы расшифровки для окна (чистые функции — проверяются модульными тестами).
import { formatBytes } from '../../shared/format';
import type { MeetingStatus } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
```

**на:**

```ts
// Тексты и форматы расшифровки для окна (чистые функции — проверяются модульными тестами).
import { formatDownloaded } from '../../shared/format';
import type { MeetingStatus } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
```

**В `src/renderer/main/transcription-format.ts` заменить:**

```ts
    case 'queued':
      return 'В очереди на расшифровку';
    case 'download':
      return progress.download
        ? `Скачиваем модель расшифровки — ${formatBytes(progress.download.done)} из ${formatBytes(progress.download.total)}`
        : 'Скачиваем модель расшифровки';
    case 'prepare':
      return 'Готовим звук';
    case 'me':
```

**на:**

```ts
    case 'queued':
      return 'В очереди на расшифровку';
    case 'download':
      if (!progress.download) return 'Скачиваем модель расшифровки';
      // Байтов нет — модель проверяется по суммам или ждёт, пока скачается другая.
      if (progress.download.total === 0) return `Готовим модель ${progress.download.title}`;
      return `Скачиваем модель ${progress.download.title} — ${formatDownloaded(progress.download.done, progress.download.total)}`;
    case 'prepare':
      return 'Готовим звук';
    case 'me':
```

**Заменить всё содержимое `src/shared/transcription.ts` на:**

```ts
// Расшифровка: что main сообщает окну. Только типы и константы — файл подключает и preload.
import type { AsrModelId } from './asr-models';

/** Этап расшифровки встречи, как его видит человек. */
export type TranscriptionStage = 'queued' | 'download' | 'prepare' | 'me' | 'diarize' | 'others';

export interface TranscriptionProgress {
  meetingId: string;
  stage: TranscriptionStage;
  /** Доля всей работы по встрече, 0…1 (скачивание моделей не входит — у него свои байты). */
  fraction: number;
  /** Этап «download»: сколько байт моделей скачано из скольких; title — модель расшифровки этой встречи. */
  download: { done: number; total: number; title: string } | null;
}

/** Группа файлов моделей: модель расшифровки или общая — «разделение по голосам и поиск речи». */
export type ModelGroupId = AsrModelId | 'voices';

export interface ModelGroupState {
  sizeBytes: number;
  /** Все файлы группы на месте и проверены. */
  installed: boolean;
}

/** Скачивание из каталога (кнопка «Скачать» в карточке модели). */
export interface CatalogDownload {
  id: AsrModelId;
  done: number;
  total: number;
}

export interface ModelsState {
  /** Модель из настроек — для новых встреч. */
  selected: AsrModelId;
  /** Модели расшифровки в порядке каталога. */
  models: (ModelGroupState & { id: AsrModelId })[];
  /** Разделение по голосам и поиск речи — общие для всех моделей. */
  voices: ModelGroupState;
  /** Идёт скачивание из каталога. */
  download: CatalogDownload | null;
  /** Последнее скачивание из каталога не удалось — причина для человека. */
  downloadError: { id: AsrModelId; message: string } | null;
  /** Идёт расшифровка — удалять модели нельзя. */
  busy: boolean;
}

/**
 * «Расшифровать», «Расшифровать заново», «Повторить»: число участников, включая владельца (null — определить самим),
 * и модель (null — из настроек).
 */
export interface TranscribeRequest {
  meetingId: string;
  participantsHint: number | null;
  model: AsrModelId | null;
}
```

**В `src/test-support/model-fixtures.ts` заменить:**

```ts
// verified.json: в папке и списке моделей программы им не место — программа о них не знает и их не удаляет.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { downloadFile } from '../main/models/download';
import { ModelManager } from '../main/models/model-manager';
import { modelsRoot } from '../main/models/models-dir';
import { freeDiskBytes } from '../main/recording/monitors';
import type { Logger } from '../main/logger';
```

**на:**

```ts
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
```

**В `src/test-support/model-fixtures.ts` заменить:**

```ts
    size: 1_819_586,
    sha256: 'bedf036caed208386c67b4ef4b11f83d74dd0d420b102163a1c33cd09cde7010',
  },
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Модели на месте (скачиваются, если нет). */
export async function ensureModels(): Promise<void> {
  await new ModelManager({ root: MODELS_ROOT, logger: quiet, freeBytes: freeDiskBytes }).ensure();
}

/** Где лежит открытая запись (без скачивания). */
```

**на:**

```ts
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
```

**В `src/test-support/model-fixtures.ts` заменить:**

```ts
    files: [{ group: 'voices', path, url, size, sha256 }],
    download: downloadFile,
  });
  await manager.ensure();
  return fixturePath(name);
}
```

**на:**

```ts
    files: [{ group: 'voices', path, url, size, sha256 }],
    download: downloadFile,
  });
  await manager.ensure(['voices']);
  return fixturePath(name);
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  638 passed (638)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `26 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: model files of the whole catalog, downloaded and removed by model"
```

### Task 6: Распознаватель для каждой модели каталога

**Files:**
- Create: `src/main/transcription/asr-config.test.ts`, `src/main/transcription/asr-config.ts`, `src/main/transcription/text-cleanup.test.ts`, `src/main/transcription/text-cleanup.ts`
- Modify: `src/main/transcription/engines.test.ts`, `src/main/transcription/engines.ts`, `src/main/transcription/pipeline.test.ts`, `src/main/transcription/pipeline.ts`, `src/main/transcription/progress.test.ts`, `src/main/transcription/progress.ts`, `src/main/transcription/protocol.ts`, `src/main/transcription/queue.ts`, `src/main/transcription/sherpa-engines.ts`, `src/main/transcription/sherpa-onnx-node.d.ts`, `src/main/transcription/sherpa.int.test.ts`, `src/main/transcription/worker.ts`

`asr-config.ts` — настройки sherpa-onnx для каждой модели (чистые данные, проверяются без нативного кода):
вид распознавателя (`OfflineRecognizer` / потоковый `OnlineRecognizer`), закреплённый язык (Qwen3 — «Russian»,
Nemotron и Whisper — «ru», Canary — «en»), тишина вокруг куска (Nemotron 0,5 + 2,5 с, T-one 0,3 + 1,5 с и признаки на
8 кГц, Whisper 1 с после) — всё по замерам прототипа. `sherpaEngines(root, model)` строит распознаватель по ним;
ошибка загрузки модели — `ModelLoadError`, процесс расшифровки сообщает её кодом `model-load`. Кеш движков в процессе —
по папке моделей и модели (две модели расшифровки в памяти разом не держим).

Конвейер загружает распознаватель сразу при старте (сломанная модель — ошибка за секунды, а не после разделения по
голосам), доли прогресса учитывают скорость модели, а текст кусков Whisper и Qwen3 проходит через фильтр выдумок
(`text-cleanup.ts`): фразы из субтитров, зацикливания, «Эээээээ». У остальных моделей фильтра нет — для них
«Продолжение следует» или «нет нет нет нет» — настоящая речь.

Временно (до Task 7): очередь передаёт процессу модель по умолчанию.

- [ ] **Step 1: Тесты**

**Создать `src/main/transcription/asr-config.test.ts`:**

```ts
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { groupFiles, modelFilePath } from '../models/registry';
import { recognizerSpec } from './asr-config';

const ROOT = join('M', 'models');

/** Все строки-пути внутри конфига (рекурсивно). */
function pathsIn(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith(ROOT) ? [value] : [];
  if (value && typeof value === 'object') return Object.values(value).flatMap(pathsIn);
  return [];
}

describe('recognizerSpec', () => {
  /** Путь в конфиге — сам файл модели или папка (токенизатор Qwen3), в которой он лежит. */
  const covers = (path: string, file: string): boolean => file === path || file.startsWith(path + sep);

  it('points every model only at files of that model in the registry', () => {
    for (const id of ASR_MODEL_IDS) {
      const files = groupFiles(id).map((f) => modelFilePath(ROOT, f));
      for (const path of pathsIn(recognizerSpec(id, ROOT, 4).config)) {
        expect(files.some((file) => covers(path, file))).toBe(true);
      }
    }
  });

  it('uses every file a model downloads', () => {
    for (const id of ASR_MODEL_IDS) {
      const used = pathsIn(recognizerSpec(id, ROOT, 4).config);
      for (const file of groupFiles(id).map((f) => modelFilePath(ROOT, f))) {
        expect(used.some((path) => covers(path, file))).toBe(true);
      }
    }
  });

  it('passes the number of threads and keeps everything on the processor', () => {
    for (const id of ASR_MODEL_IDS) {
      expect(recognizerSpec(id, ROOT, 3).config.modelConfig).toMatchObject({ numThreads: 3, provider: 'cpu', debug: 0 });
    }
  });

  it('keeps GigaAM exactly as in plan 3', () => {
    expect(recognizerSpec('gigaam-v3-e2e-rnnt', ROOT, 4)).toEqual({
      online: false,
      language: null,
      leadSec: 0,
      tailSec: 0,
      config: {
        featConfig: { sampleRate: 16_000, featureDim: 64 },
        modelConfig: {
          transducer: {
            encoder: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
            decoder: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_decoder.onnx'),
            joiner: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_joint.onnx'),
          },
          tokens: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_tokens.txt'),
          modelType: 'nemo_transducer',
          numThreads: 4,
          provider: 'cpu',
          debug: 0,
        },
      },
    });
  });

  it('pins Russian for the multilingual models that guessed the language wrong', () => {
    expect(recognizerSpec('qwen3-asr-0.6b', ROOT, 4).language).toBe('Russian');
    expect(recognizerSpec('nemotron-3.5-asr', ROOT, 4).language).toBe('ru');
    expect(recognizerSpec('whisper-large-v3-turbo', ROOT, 4).config.modelConfig).toMatchObject({
      whisper: { language: 'ru', task: 'transcribe' },
    });
    expect(recognizerSpec('canary-180m-flash', ROOT, 4).config.modelConfig).toMatchObject({
      canary: { srcLang: 'en', tgtLang: 'en', usePnc: 1 },
    });
    expect(recognizerSpec('parakeet-tdt-0.6b-v3', ROOT, 4).language).toBeNull();
  });

  it('feeds the streaming models whole pieces with silence around them', () => {
    expect(recognizerSpec('nemotron-3.5-asr', ROOT, 4)).toMatchObject({ online: true, leadSec: 0.5, tailSec: 2.5 });
    expect(recognizerSpec('t-one', ROOT, 4)).toMatchObject({ online: true, leadSec: 0.3, tailSec: 1.5 });
    expect(recognizerSpec('t-one', ROOT, 4).config.featConfig).toEqual({ sampleRate: 8000, featureDim: 80 });
    expect(recognizerSpec('whisper-large-v3-turbo', ROOT, 4)).toMatchObject({ online: false, leadSec: 0, tailSec: 1 });
  });

  it('gives Qwen3 the folder of its tokenizer', () => {
    const spec = recognizerSpec('qwen3-asr-0.6b', ROOT, 4).config.modelConfig as { qwen3Asr: { tokenizer: string } };
    expect(spec.qwen3Asr.tokenizer).toBe(join(ROOT, 'qwen3-asr-0.6b-int8', 'tokenizer'));
  });
});
```

**В `src/main/transcription/engines.test.ts` заменить:**

```ts
import { describe, expect, it, vi } from 'vitest';
import { enginesByModelsDir, latestByThreads } from './engines';
import { fakeEngines } from './fake-engines';

describe('enginesByModelsDir', () => {
  it('loads the engines once per models folder and again only when the folder changes', () => {
    const create = vi.fn((_modelsDir: string) => fakeEngines());
    const enginesFor = enginesByModelsDir(create);
    const first = enginesFor('M');
    expect(enginesFor('M')).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    const other = enginesFor('N');
    expect(other).not.toBe(first);
    expect(enginesFor('N')).toBe(other);
    expect(create.mock.calls.map(([dir]) => dir)).toEqual(['M', 'N']);
  });
});
```

**на:**

```ts
import { describe, expect, it, vi } from 'vitest';
import { enginesByModel, latestByThreads } from './engines';
import { fakeEngines } from './fake-engines';

describe('enginesByModel', () => {
  it('loads the engines once per models folder and model, and again only when one of them changes', () => {
    const create = vi.fn((_modelsDir: string, _model: string) => fakeEngines());
    const enginesFor = enginesByModel(create);
    const first = enginesFor('M', 'gigaam-v3-e2e-rnnt');
    expect(enginesFor('M', 'gigaam-v3-e2e-rnnt')).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    const otherDir = enginesFor('N', 'gigaam-v3-e2e-rnnt');
    expect(otherDir).not.toBe(first);
    const otherModel = enginesFor('N', 't-one');
    expect(otherModel).not.toBe(otherDir);
    expect(enginesFor('N', 't-one')).toBe(otherModel);
    expect(create.mock.calls).toEqual([
      ['M', 'gigaam-v3-e2e-rnnt'],
      ['N', 'gigaam-v3-e2e-rnnt'],
      ['N', 't-one'],
    ]);
  });
});
```

**В `src/main/transcription/pipeline.test.ts` заменить:**

```ts
import { fakeEngines, loudIntervals } from './fake-engines';
import { runPipeline, type PipelineDeps, type PipelineInput, type PipelineProgress } from './pipeline';
import type { TrackInput } from './routing';
import type { Interval, Turn } from './turns';

/** Сигнал длиной seconds: громкий (0,1) в заданных участках, тишина вокруг. */
```

**на:**

```ts
import { fakeEngines, loudIntervals } from './fake-engines';
import { runPipeline, type PipelineDeps, type PipelineInput, type PipelineProgress } from './pipeline';
import type { TrackInput } from './routing';
import { cleanRecognizedText } from './text-cleanup';
import type { Interval, Turn } from './turns';

/** Сигнал длиной seconds: громкий (0,1) в заданных участках, тишина вокруг. */
```

**В `src/main/transcription/pipeline.test.ts` заменить:**

```ts
    const run = runPipeline(input({ tracks: [mic] }), deps);
    threads = 2;
    await run;
    expect(recognizerThreads).toEqual([2]);
    const { deps: deps2, recognizerThreads: seen } = setup({
      audio: { mic: signal(30, [{ start: 0, end: 2 }, { start: 5, end: 7 }]) },
      threads: () => (seen.length === 0 ? 4 : 2),
```

**на:**

```ts
    const run = runPipeline(input({ tracks: [mic] }), deps);
    threads = 2;
    await run;
    // Первый — сразу при запуске (проверка, что модель загружается), второй — после смены числа потоков.
    expect(recognizerThreads).toEqual([4, 2]);
    const { deps: deps2, recognizerThreads: seen } = setup({
      audio: { mic: signal(30, [{ start: 0, end: 2 }, { start: 5, end: 7 }]) },
      threads: () => (seen.length === 0 ? 4 : 2),
```

**В `src/main/transcription/pipeline.test.ts` заменить:**

```ts
    expect(progress.at(-1)?.fraction).toBe(1);
  });

  it('transcribes the readable track when the other one cannot be read', async () => {
    const { deps, progress } = setup({ audio: { system: signal(10, [{ start: 1, end: 3 }]) } });
    const broken: PipelineDeps = {
```

**на:**

```ts
    expect(progress.at(-1)?.fraction).toBe(1);
  });

  it('passes the text of every piece through the filter of the model, if it has one', async () => {
    const audio = { mic: signal(30, [{ start: 1, end: 3 }, { start: 10, end: 12 }]), system: signal(30, []) };
    const made = setup({ audio, text: () => 'Продолжение следует...' });
    const dropped = await runPipeline(input({ participantsHint: null }), { ...made.deps, cleanText: cleanRecognizedText });
    expect(dropped.segments.map((s) => s.text)).toEqual([]);
    // Модель без фильтра: та же фраза — настоящая речь.
    const real = setup({ audio, text: () => ' Продолжение следует... ' });
    const kept = await runPipeline(input({ participantsHint: null }), real.deps);
    expect(kept.segments.map((s) => s.text)).toEqual(['Продолжение следует...', 'Продолжение следует...']);
  });

  it('loads the recognizer before reading the sound, so a broken model fails at once', async () => {
    const { deps } = setup({ audio: { mic: signal(10, [{ start: 1, end: 3 }]) } });
    const decode = vi.fn(deps.decode);
    const broken = { ...deps, decode, engines: { ...deps.engines, recognizer: () => { throw new Error('модель не загрузилась'); } } };
    await expect(runPipeline(input({ tracks: [mic] }), broken)).rejects.toThrow('модель не загрузилась');
    expect(decode).not.toHaveBeenCalled();
  });

  it('transcribes the readable track when the other one cannot be read', async () => {
    const { deps, progress } = setup({ audio: { system: signal(10, [{ start: 1, end: 3 }]) } });
    const broken: PipelineDeps = {
```

**В `src/main/transcription/progress.test.ts` заменить:**

```ts
    expect(overallFraction(steps, 4, 7)).toBeCloseTo(1, 10);
  });

  it('is zero without steps', () => {
    expect(overallFraction([], 0, 0.5)).toBe(0);
  });
```

**на:**

```ts
    expect(overallFraction(steps, 4, 7)).toBeCloseTo(1, 10);
  });

  it('gives recognition a bigger share for a slower model', () => {
    const slow = planSteps(plans, [100, 100], 10);
    expect(slow.map((s) => s.stage)).toEqual(steps.map((s) => s.stage));
    // Конец разделения по голосам (начало распознавания собеседников) у медленной модели — раньше по доле.
    expect(overallFraction(slow, 4, 0)).toBeLessThan(overallFraction(steps, 4, 0));
    expect(slow[1]!.cost).toBeCloseTo(steps[1]!.cost * 10);
  });

  it('is zero without steps', () => {
    expect(overallFraction([], 0, 0.5)).toBe(0);
  });
```

**В `src/main/transcription/sherpa.int.test.ts` заменить:**

```ts

// Одни движки на все проверки — как в процессе расшифровки: модели загружаются один раз.
let shared: Engines | null = null;
const engines = (): Engines => (shared ??= sherpaEngines(MODELS_ROOT));
/** Запись четырёх человек — на китайском: русская GigaAM даёт по ней пустой текст, а пустые реплики не пишутся.
 *  Поэтому разделение по голосам проверяется с настоящими моделями голосов, но с «текстом» вместо распознавания. */
const withoutAsr = (): Engines => ({ ...engines(), recognizer: () => ({ recognize: () => 'реплика' }) });
```

**на:**

```ts

// Одни движки на все проверки — как в процессе расшифровки: модели загружаются один раз.
let shared: Engines | null = null;
const engines = (): Engines => (shared ??= sherpaEngines(MODELS_ROOT, 'gigaam-v3-e2e-rnnt'));
/** Запись четырёх человек — на китайском: русская GigaAM даёт по ней пустой текст, а пустые реплики не пишутся.
 *  Поэтому разделение по голосам проверяется с настоящими моделями голосов, но с «текстом» вместо распознавания. */
const withoutAsr = (): Engines => ({ ...engines(), recognizer: () => ({ recognize: () => 'реплика' }) });
```

**Создать `src/main/transcription/text-cleanup.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { cleanRecognizedText } from './text-cleanup';

describe('cleanRecognizedText', () => {
  it('keeps ordinary speech as it is', () => {
    expect(cleanRecognizedText('  Да, да, я OBS включил. Ну нет, нет, нет. ')).toBe('Да, да, я OBS включил. Ну нет, нет, нет.');
  });

  it('drops a piece that is only a known subtitle phrase', () => {
    expect(cleanRecognizedText('Продолжение следует...')).toBe('');
    expect(cleanRecognizedText('Спасибо за просмотр!')).toBe('');
    expect(cleanRecognizedText('Thanks for watching!')).toBe('');
    expect(cleanRecognizedText('Субтитры сделал DimaTorzok')).toBe('');
    expect(cleanRecognizedText('Редактор субтитров А.Синецкая Корректор А.Егорова')).toBe('');
  });

  it('keeps a known phrase that is part of a longer sentence', () => {
    expect(cleanRecognizedText('Спасибо за просмотр презентации, теперь к делу.')).toBe(
      'Спасибо за просмотр презентации, теперь к делу.',
    );
  });

  it('cuts a phrase repeated over and over down to one', () => {
    expect(cleanRecognizedText('Ну что, ну что, ну что, ну что, ну что, поехали')).toBe('Ну что, поехали');
    expect(cleanRecognizedText('да да да да да да да')).toBe('да');
    // Одно слово четыре раза подряд — бывает и в жизни.
    expect(cleanRecognizedText('нет нет нет нет')).toBe('нет нет нет нет');
    expect(cleanRecognizedText('Я думаю. Я думаю. Я думаю. Я думаю.')).toBe('Я думаю.');
  });

  it('keeps up to three repeats', () => {
    expect(cleanRecognizedText('нет, нет, нет')).toBe('нет, нет, нет');
  });

  it('shortens a long run of one letter', () => {
    expect(cleanRecognizedText('Эээээээээээээээээээ')).toBe('Эээ');
    expect(cleanRecognizedText('Ммм, понятно')).toBe('Ммм, понятно');
  });

  it('gives an empty string for an empty piece', () => {
    expect(cleanRecognizedText('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/transcription/asr-config.test.ts src/main/transcription/engines.test.ts src/main/transcription/pipeline.test.ts src/main/transcription/progress.test.ts src/main/transcription/sherpa.int.test.ts src/main/transcription/text-cleanup.test.ts`
Ожидается: FAIL — нет модулей `./asr-config` и `./text-cleanup`, нет `enginesByModel`, `planSteps` без скорости модели.

- [ ] **Step 3: Код**

**Создать `src/main/transcription/asr-config.ts`:**

```ts
// Настройки sherpa-onnx для каждой модели каталога (решения Плана 7, §4.1–4.2). Чистые данные: проверяются без
// нативного кода; распознаватель по ним строит sherpa-engines.ts. Числа — из прототипа Плана 7 на записи пользователя.
import { dirname } from 'node:path';
import type { AsrModelId } from '../../shared/asr-models';
import { asrFilePath } from '../models/registry';
import { SAMPLE_RATE } from './decode';

export interface RecognizerSpec {
  /** Потоковая модель (OnlineRecognizer): кусок подаётся целиком, затем «конец ввода» и декодирование до конца. */
  online: boolean;
  /** Конфиг конструктора sherpa-onnx (OfflineRecognizer / OnlineRecognizer). */
  config: { featConfig: { sampleRate: number; featureDim: number }; modelConfig: Record<string, unknown> };
  /** Язык, закреплённый в потоке (stream.setOption('language', …)); null — модель его не спрашивает. */
  language: string | null;
  /** Тишина перед куском и после него, с: потоковые модели иначе теряют начало и конец, Whisper — конец фразы. */
  leadSec: number;
  tailSec: number;
}

type Build = (file: (name: string) => string) => Omit<RecognizerSpec, 'config'> & {
  featureDim: number;
  sampleRate?: number;
  model: Record<string, unknown>;
};

const transducer = (file: (name: string) => string, prefix = '') => ({
  transducer: {
    encoder: file(`${prefix}encoder.int8.onnx`),
    decoder: file(`${prefix}decoder.int8.onnx`),
    joiner: file(`${prefix}joiner.int8.onnx`),
  },
  tokens: file('tokens.txt'),
});

const plain = { online: false, language: null, leadSec: 0, tailSec: 0 } as const;

const BUILDS: Record<AsrModelId, Build> = {
  'gigaam-v3-e2e-rnnt': (file) => ({
    ...plain,
    featureDim: 64,
    model: {
      transducer: {
        encoder: file('gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
        decoder: file('gigaam_v3_e2e_rnnt_decoder.onnx'),
        joiner: file('gigaam_v3_e2e_rnnt_joint.onnx'),
      },
      tokens: file('gigaam_v3_e2e_rnnt_tokens.txt'),
      modelType: 'nemo_transducer',
    },
  }),
  'parakeet-tdt-0.6b-v3': (file) => ({
    ...plain,
    featureDim: 80,
    model: { ...transducer(file), modelType: 'nemo_transducer' },
  }),
  // Без закреплённого языка Qwen3 на коротких репликах уходила в китайский (прототип Плана 7).
  'qwen3-asr-0.6b': (file) => ({
    ...plain,
    language: 'Russian',
    featureDim: 80,
    model: {
      qwen3Asr: {
        convFrontend: file('conv_frontend.onnx'),
        encoder: file('encoder.int8.onnx'),
        decoder: file('decoder.int8.onnx'),
        // Папка токенизатора — та, где лежат его файлы.
        tokenizer: dirname(file('tokenizer/vocab.json')),
        hotwords: '',
      },
      tokens: '',
    },
  }),
  // Язык — в настройках модели (автоопределение путало русский с английским); секунда тишины в конце — иначе
  // Whisper обрывал последнее слово куска.
  'whisper-large-v3-turbo': (file) => ({
    ...plain,
    tailSec: 1,
    featureDim: 128,
    model: {
      whisper: { encoder: file('turbo-encoder.int8.onnx'), decoder: file('turbo-decoder.int8.onnx'), language: 'ru', task: 'transcribe' },
      tokens: file('turbo-tokens.txt'),
    },
  }),
  'nemotron-3.5-asr': (file) => ({
    online: true,
    language: 'ru',
    leadSec: 0.5,
    tailSec: 2.5,
    featureDim: 128,
    model: transducer(file),
  }),
  // T-one обучена на телефонном звуке 8 кГц: признаки считаются на 8 кГц, sherpa-onnx сам понижает частоту.
  't-one': (file) => ({
    online: true,
    language: null,
    leadSec: 0.3,
    tailSec: 1.5,
    featureDim: 80,
    sampleRate: 8000,
    model: { toneCtc: { model: file('model.onnx') }, tokens: file('tokens.txt') },
  }),
  'parakeet-unified-en-0.6b': (file) => ({
    ...plain,
    featureDim: 80,
    model: { ...transducer(file), modelType: 'nemo_transducer' },
  }),
  'canary-180m-flash': (file) => ({
    ...plain,
    featureDim: 80,
    model: {
      canary: { encoder: file('encoder.int8.onnx'), decoder: file('decoder.int8.onnx'), srcLang: 'en', tgtLang: 'en', usePnc: 1 },
      tokens: file('tokens.txt'),
    },
  }),
};

/** Настройки распознавателя модели с файлами из папки моделей root. */
export function recognizerSpec(model: AsrModelId, root: string, threads: number): RecognizerSpec {
  const file = (name: string): string => asrFilePath(root, model, name);
  const { featureDim, sampleRate, model: modelConfig, ...rest } = BUILDS[model](file);
  return {
    ...rest,
    config: {
      featConfig: { sampleRate: sampleRate ?? SAMPLE_RATE, featureDim },
      modelConfig: { ...modelConfig, numThreads: threads, provider: 'cpu', debug: 0 },
    },
  };
}
```

**В `src/main/transcription/engines.ts` заменить:**

```ts
// Тонкие интерфейсы над нативными движками: конвейер проверяется без sherpa-onnx (поддельные движки в тестах).
import type { Interval, Turn } from './turns';

/** Детектор речи: участки речи на дорожке. */
```

**на:**

```ts
// Тонкие интерфейсы над нативными движками: конвейер проверяется без sherpa-onnx (поддельные движки в тестах).
import type { AsrModelId } from '../../shared/asr-models';
import type { Interval, Turn } from './turns';

/** Детектор речи: участки речи на дорожке. */
```

**В `src/main/transcription/engines.ts` заменить:**

```ts
}

/**
 * Движки процесса расшифровки: один объект на папку моделей, общий для всех встреч, — модели загружаются один раз
 * на процесс, а не для каждой встречи. Другая папка — новые движки.
 */
export function enginesByModelsDir(create: (modelsDir: string) => Engines): (modelsDir: string) => Engines {
  let last: { modelsDir: string; engines: Engines } | null = null;
  return (modelsDir) => {
    if (last?.modelsDir !== modelsDir) last = { modelsDir, engines: create(modelsDir) };
    return last.engines;
  };
}
```

**на:**

```ts
}

/**
 * Движки процесса расшифровки: один объект на папку моделей и модель расшифровки, общий для встреч подряд, — модели
 * загружаются один раз, а не для каждой встречи. Другая папка или модель — новые движки; прежние отпускаются
 * (две модели расшифровки в памяти разом не держим).
 */
export function enginesByModel(
  create: (modelsDir: string, model: AsrModelId) => Engines,
): (modelsDir: string, model: AsrModelId) => Engines {
  let last: { modelsDir: string; model: AsrModelId; engines: Engines } | null = null;
  return (modelsDir, model) => {
    if (last?.modelsDir !== modelsDir || last.model !== model) {
      last = null;
      last = { modelsDir, model, engines: create(modelsDir, model) };
    }
    return last.engines;
  };
}
```

**В `src/main/transcription/pipeline.ts` заменить:**

```ts
  /** Сколько потоков можно занять сейчас (во время записи — меньше). */
  threads(): number;
  onProgress(progress: PipelineProgress): void;
}

/** Отпечаток голоса снимается с начала хода — этого хватает, а длинные ходы не тормозят. */
```

**на:**

```ts
  /** Сколько потоков можно занять сейчас (во время записи — меньше). */
  threads(): number;
  onProgress(progress: PipelineProgress): void;
  /** Во сколько раз модель расшифровки медленнее GigaAM — для долей прогресса; нет — как GigaAM. */
  slowdown?: number;
  /** Чистка текста куска (фильтр «галлюцинаций» у Whisper и Qwen3); нет — только обрезка пробелов. */
  cleanText?(text: string): string;
}

/** Отпечаток голоса снимается с начала хода — этого хватает, а длинные ходы не тормозят. */
```

**В `src/main/transcription/pipeline.ts` заменить:**

```ts

class Run {
  private stepIndex = 0;
  private readonly recognizer: RecognizerHolder;

  constructor(
    private readonly deps: PipelineDeps,
    private readonly steps: readonly Step[],
  ) {
    this.recognizer = new RecognizerHolder(deps.engines, deps.threads);
  }

  report(fraction: number, diarize?: { expectedMs: number }): void {
```

**на:**

```ts

class Run {
  private stepIndex = 0;
  readonly recognizer: RecognizerHolder;
  private readonly clean: (text: string) => string;

  constructor(
    private readonly deps: PipelineDeps,
    private readonly steps: readonly Step[],
  ) {
    this.recognizer = new RecognizerHolder(deps.engines, deps.threads);
    this.clean = deps.cleanText ?? ((text) => text.trim());
  }

  report(fraction: number, diarize?: { expectedMs: number }): void {
```

**В `src/main/transcription/pipeline.ts` заменить:**

```ts
    let done = 0;
    for (const piece of pieces) {
      await breathe();
      const text = piece.end - piece.start < MIN_PIECE_SEC ? '' : this.recognizer.get().recognize(slice(samples, piece)).trim();
      done += piece.end - piece.start;
      this.report(total > 0 ? done / total : 1);
      if (text === '') continue;
```

**на:**

```ts
    let done = 0;
    for (const piece of pieces) {
      await breathe();
      const text = piece.end - piece.start < MIN_PIECE_SEC ? '' : this.clean(this.recognizer.get().recognize(slice(samples, piece)));
      done += piece.end - piece.start;
      this.report(total > 0 ? done / total : 1);
      if (text === '') continue;
```

**В `src/main/transcription/pipeline.ts` заменить:**

```ts
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const plans = planTracks(input.tracks, input.recordedSystem, input.participantsHint);
  const durations = plans.map(() => input.durationSec);
  const steps = planSteps(plans, durations);
  const run = new Run(deps, steps);
  run.report(0);

  const segments: DraftSegment[] = [];
  const skippedTracks: PipelineResult['skippedTracks'] = [];
```

**на:**

```ts
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const plans = planTracks(input.tracks, input.recordedSystem, input.participantsHint);
  const durations = plans.map(() => input.durationSec);
  const steps = planSteps(plans, durations, deps.slowdown);
  const run = new Run(deps, steps);
  run.report(0);
  // Модель расшифровки загружается сразу: если она не загружается, встреча узнает об этом за секунды, а не после
  // чтения звука и разделения по голосам.
  if (plans.length > 0) run.recognizer.get();

  const segments: DraftSegment[] = [];
  const skippedTracks: PipelineResult['skippedTracks'] = [];
```

**В `src/main/transcription/progress.ts` заменить:**

```ts
  cost: number;
}

/** Шаги по порядку: для каждой дорожки — подготовка, (разделение), распознавание. */
export function planSteps(plans: readonly TrackPlan[], durationsSec: readonly number[]): Step[] {
  return plans.flatMap((plan, track) => {
    const sec = Math.max(1, durationsSec[track] ?? 0);
    const steps: Step[] = [{ stage: 'prepare', track, cost: COST_PER_SEC.prepare * sec }];
    if (plan.role === 'others' && plan.diarize.mode !== 'none') {
      steps.push({ stage: 'diarize', track, cost: COST_PER_SEC.diarize * sec });
    }
    steps.push({ stage: plan.role === 'me' ? 'me' : 'others', track, cost: COST_PER_SEC.recognize * sec });
    return steps;
  });
}
```

**на:**

```ts
  cost: number;
}

/**
 * Шаги по порядку: для каждой дорожки — подготовка, (разделение), распознавание. slowdown — во сколько раз модель
 * расшифровки медленнее GigaAM (каталог): у Whisper распознавание — почти вся работа, у GigaAM — треть.
 */
export function planSteps(plans: readonly TrackPlan[], durationsSec: readonly number[], slowdown = 1): Step[] {
  return plans.flatMap((plan, track) => {
    const sec = Math.max(1, durationsSec[track] ?? 0);
    const steps: Step[] = [{ stage: 'prepare', track, cost: COST_PER_SEC.prepare * sec }];
    if (plan.role === 'others' && plan.diarize.mode !== 'none') {
      steps.push({ stage: 'diarize', track, cost: COST_PER_SEC.diarize * sec });
    }
    steps.push({ stage: plan.role === 'me' ? 'me' : 'others', track, cost: COST_PER_SEC.recognize * slowdown * sec });
    return steps;
  });
}
```

**В `src/main/transcription/protocol.ts` заменить:**

```ts
// Сообщения между main и процессом расшифровки (utilityProcess). Проверяются zod с обеих сторон.
import { z } from 'zod';
import { TrackKindSchema } from '../../shared/meeting';
import { SpeakerIdSchema } from '../../shared/transcript';
```

**на:**

```ts
// Сообщения между main и процессом расшифровки (utilityProcess). Проверяются zod с обеих сторон.
import { z } from 'zod';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { TrackKindSchema } from '../../shared/meeting';
import { SpeakerIdSchema } from '../../shared/transcript';
```

**В `src/main/transcription/protocol.ts` заменить:**

```ts
    jobId: z.string().min(1),
    input: PipelineInputSchema,
    modelsDir: z.string().min(1),
    ffmpegPath: z.string().min(1),
    threads: z.number().int().min(1).max(64),
  }),
```

**на:**

```ts
    jobId: z.string().min(1),
    input: PipelineInputSchema,
    modelsDir: z.string().min(1),
    /** Модель расшифровки этой встречи (каталог). */
    model: z.enum(ASR_MODEL_IDS),
    ffmpegPath: z.string().min(1),
    threads: z.number().int().min(1).max(64),
  }),
```

**В `src/main/transcription/protocol.ts` заменить:**

```ts
      skippedTracks: z.array(z.object({ kind: TrackKindSchema, message: z.string() })).default([]),
    }),
  }),
  z.object({ type: z.literal('failed'), jobId: z.string(), message: z.string() }),
]);

/** Отказы процесса расшифровки: написаны для человека, main показывает их как есть (прочие ошибки — общим текстом). */
```

**на:**

```ts
      skippedTracks: z.array(z.object({ kind: TrackKindSchema, message: z.string() })).default([]),
    }),
  }),
  z.object({
    type: z.literal('failed'),
    jobId: z.string(),
    message: z.string(),
    /** model-load — не загрузилась модель расшифровки (файлы целы по суммам, но движок их не принял). */
    code: z.literal('model-load').optional(),
  }),
]);

/** Отказы процесса расшифровки: написаны для человека, main показывает их как есть (прочие ошибки — общим текстом). */
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
      jobId: `job-${++this.jobCounter}`,
      input,
      modelsDir: this.deps.models.root,
      ffmpegPath: this.deps.ffmpegPath(),
      threads: this.deps.threads(),
    };
```

**на:**

```ts
      jobId: `job-${++this.jobCounter}`,
      input,
      modelsDir: this.deps.models.root,
      model: DEFAULT_ASR_MODEL,
      ffmpegPath: this.deps.ffmpegPath(),
      threads: this.deps.threads(),
    };
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import { asrFilePath, voicePaths, type VoicePaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import { latestByThreads, type Diarizer, type Engines, type Recognizer, type SpeechDetector, type VoiceprintExtractor } from './engines';
import type { Interval } from './turns';
```

**на:**

```ts
// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import type { AsrModelId } from '../../shared/asr-models';
import { voicePaths, type VoicePaths } from '../models/registry';
import { recognizerSpec, type RecognizerSpec } from './asr-config';
import { SAMPLE_RATE } from './decode';
import { latestByThreads, type Diarizer, type Engines, type Recognizer, type SpeechDetector, type VoiceprintExtractor } from './engines';
import type { Interval } from './turns';
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
  };
}

function recognizer(root: string, threads: number): Recognizer {
  const file = (name: string): string => asrFilePath(root, 'gigaam-v3-e2e-rnnt', name);
  const native = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
    modelConfig: {
      transducer: {
        encoder: file('gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
        decoder: file('gigaam_v3_e2e_rnnt_decoder.onnx'),
        joiner: file('gigaam_v3_e2e_rnnt_joint.onnx'),
      },
      tokens: file('gigaam_v3_e2e_rnnt_tokens.txt'),
      modelType: 'nemo_transducer',
      numThreads: threads,
      provider: 'cpu',
      debug: 0,
    },
  });
  return {
    recognize(samples: Float32Array): string {
      const stream = native.createStream();
      stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
      native.decode(stream);
      return String(native.getResult(stream).text ?? '');
    },
  };
}

/** Модели разделения загружаются при первом разделении: встречам без «других» они не нужны. */
```

**на:**

```ts
  };
}

/** Кусок с тишиной до и после (spec.leadSec / tailSec); без неё — тот же буфер. */
function padded(samples: Float32Array, spec: RecognizerSpec): Float32Array {
  if (spec.leadSec === 0 && spec.tailSec === 0) return samples;
  const lead = Math.round(spec.leadSec * SAMPLE_RATE);
  const result = new Float32Array(lead + samples.length + Math.round(spec.tailSec * SAMPLE_RATE));
  result.set(samples, lead);
  return result;
}

/** Ошибка загрузки модели: процесс расшифровки сообщает о ней отдельно («Не удалось загрузить модель …»). */
export class ModelLoadError extends Error {}

function recognizer(spec: RecognizerSpec): Recognizer {
  try {
    if (spec.online) {
      const native = new sherpa.OnlineRecognizer(spec.config);
      return {
        recognize(samples: Float32Array): string {
          const stream = native.createStream();
          if (spec.language) stream.setOption('language', spec.language);
          stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: padded(samples, spec) });
          stream.inputFinished();
          while (native.isReady(stream)) native.decode(stream);
          return String(native.getResult(stream).text ?? '');
        },
      };
    }
    const native = new sherpa.OfflineRecognizer(spec.config);
    return {
      recognize(samples: Float32Array): string {
        const stream = native.createStream();
        if (spec.language) stream.setOption('language', spec.language);
        stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: padded(samples, spec) });
        native.decode(stream);
        return String(native.getResult(stream).text ?? '');
      },
    };
  } catch (err) {
    throw new ModelLoadError(err instanceof Error ? err.message : String(err), { cause: err });
  }
}

/** Модели разделения загружаются при первом разделении: встречам без «других» они не нужны. */
```

**В `src/main/transcription/sherpa-engines.ts` заменить:**

```ts
}

/**
 * Движки sherpa-onnx. Распознаватель, разделение по голосам и отпечатки живут, пока жив этот объект, и переиспользуются
 * встречами (загрузка GigaAM — секунды); каждого вида — одна копия, для последнего числа потоков (latestByThreads).
 */
export function sherpaEngines(root: string): Engines {
  const paths = voicePaths(root);
  return {
    detector: () => detector(paths),
    recognizer: latestByThreads((threads) => recognizer(root, threads)),
    diarizer: latestByThreads((threads) => diarizer(paths, threads)),
    voiceprints: latestByThreads((threads) => voiceprints(paths, threads)),
  };
```

**на:**

```ts
}

/**
 * Движки sherpa-onnx с моделью расшифровки model из папки моделей root. Распознаватель, разделение по голосам и
 * отпечатки живут, пока жив этот объект, и переиспользуются встречами (загрузка модели — секунды); каждого вида —
 * одна копия, для последнего числа потоков (latestByThreads).
 */
export function sherpaEngines(root: string, model: AsrModelId): Engines {
  const paths = voicePaths(root);
  return {
    detector: () => detector(paths),
    recognizer: latestByThreads((threads) => recognizer(recognizerSpec(model, root, threads))),
    diarizer: latestByThreads((threads) => diarizer(paths, threads)),
    voiceprints: latestByThreads((threads) => voiceprints(paths, threads)),
  };
```

**В `src/main/transcription/sherpa-onnx-node.d.ts` заменить:**

```ts

  export interface OfflineStream {
    acceptWaveform(wave: Waveform): void;
  }

  export class OfflineRecognizer {
```

**на:**

```ts

  export interface OfflineStream {
    acceptWaveform(wave: Waveform): void;
    /** Настройка потока, например язык ('language') у Qwen3-ASR. */
    setOption(key: string, value: string): void;
  }

  export class OfflineRecognizer {
```

**В `src/main/transcription/sherpa-onnx-node.d.ts` заменить:**

```ts
    getResult(stream: OfflineStream): { text?: string };
  }

  export interface SpeechSegment {
    /** Номер первого отсчёта участка речи. */
    start: number;
```

**на:**

```ts
    getResult(stream: OfflineStream): { text?: string };
  }

  export interface OnlineStream {
    acceptWaveform(wave: Waveform): void;
    inputFinished(): void;
    /** Настройка потока, например язык ('language') у Nemotron. */
    setOption(key: string, value: string): void;
  }

  /** Потоковое распознавание (Nemotron, T-one): TextMeet подаёт кусок целиком и декодирует до конца. */
  export class OnlineRecognizer {
    constructor(config: object);
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    decode(stream: OnlineStream): void;
    getResult(stream: OnlineStream): { text?: string };
  }

  export interface SpeechSegment {
    /** Номер первого отсчёта участка речи. */
    start: number;
```

**Создать `src/main/transcription/text-cleanup.ts`:**

```ts
// Защита от «галлюцинаций» моделей (решения Плана 7, §4.3): на шуме Whisper и Qwen3 дописывают фразы из субтитров
// и зацикливаются. Применяется только к их тексту (asrModel(id).hallucinates): у других моделей «Продолжение
// следует» или «нет нет нет нет» — настоящая речь.

/** Кусок, целиком совпадающий с одной из фраз (без регистра, «ё» и знаков), — выдумка модели. */
const KNOWN_PHRASES = [
  'продолжение следует',
  'спасибо за просмотр',
  'подписывайтесь на канал',
  'ставьте лайки',
  'thank you for watching',
  'thanks for watching',
  'please subscribe',
];
/** Кусок, начинающийся с этих слов, — подпись из субтитров («Субтитры сделал DimaTorzok»). */
const KNOWN_PREFIXES = ['субтитры сделал', 'субтитры делал', 'субтитры создавал', 'субтитры подготовил', 'редактор субтитров'];
/** Одна и та же фраза из 2–8 слов подряд больше трёх раз — модель зациклилась; одно слово — больше шести раз. */
const MAX_PHRASE_WORDS = 8;
const MAX_REPEATS = 3;
const MAX_WORD_REPEATS = 6;
/** Одна буква подряд столько раз и больше («Эээээээээ») сокращается до трёх. */
const LETTER_RUN = 6;

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function isKnownPhrase(text: string): boolean {
  const plain = normalize(text);
  return KNOWN_PHRASES.includes(plain) || KNOWN_PREFIXES.some((prefix) => plain.startsWith(prefix));
}

/** Слова i…i+n и j…j+n совпадают (без регистра и знаков). */
function samePhrase(words: readonly string[], i: number, j: number, n: number): boolean {
  for (let k = 0; k < n; k++) if (normalize(words[i + k] ?? '') !== normalize(words[j + k] ?? '')) return false;
  return true;
}

/** Повторы фразы из n слов подряд больше MAX_REPEATS раз — одна фраза. */
function collapsePhrases(words: readonly string[], n: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < words.length) {
    let count = 1;
    while (i + (count + 1) * n <= words.length && samePhrase(words, i, i + count * n, n)) count += 1;
    if (count > (n === 1 ? MAX_WORD_REPEATS : MAX_REPEATS)) {
      result.push(...words.slice(i, i + n));
      i += count * n;
    } else {
      result.push(words[i]!);
      i += 1;
    }
  }
  return result;
}

/** Без учёта регистра: «Эээээ» — тоже одна буква подряд; остаются первые три (с прежним регистром). */
const shortenLetterRuns = (word: string): string =>
  word.replace(new RegExp(`(\\p{L})\\1{${LETTER_RUN - 1},}`, 'giu'), (run: string) => [...run].slice(0, 3).join(''));

/** Текст куска без выдуманных фраз и зацикливаний; пустая строка — кусок выбрасывается. */
export function cleanRecognizedText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '' || isKnownPhrase(trimmed)) return '';
  let words = trimmed.split(/\s+/).map(shortenLetterRuns);
  for (let n = 1; n <= MAX_PHRASE_WORDS; n++) words = collapsePhrases(words, n);
  return words.join(' ');
}
```

**Заменить всё содержимое `src/main/transcription/worker.ts` на:**

```ts
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
/** Только для автотестов: мгновенные поддельные движки вместо моделей. */
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
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  655 passed (655)`.
- [ ] **Тесты на настоящих моделях:** `npm run test:models`. Ожидается: `Tests  5 passed (5)` (GigaAM и модели голосов — как в Плане 3).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: a recognizer for every catalog model; the hallucination filter for Whisper and Qwen3"
```

### Task 7: Очередь расшифровывает встречу её моделью

**Files:**
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/main/transcription/queue.test.ts`, `src/main/transcription/queue.ts`

Модель пишется в `meeting.json` (поле `model`) при постановке в очередь: по нему расшифровка продолжается
после перезапуска; у встреч Плана 3 (`model: null`) и с неизвестной моделью — GigaAM (с записью в журнал). Очередь
скачивает `[модель, voices]` с отменой: повторная постановка той же встречи («Расшифровать заново» другой моделью) и
выход из программы прерывают и скачивание. Если подготовка моделей идёт дольше 0,7 с (первая проверка сумм, ожидание
другого скачивания), во встрече — «Готовим модель …». В `transcript.json` пишутся id и название модели; неудачная
загрузка модели — «Не удалось загрузить модель «…». …журнал». Окно «Запись остановлена» ставит встречу с моделью из
настроек, запрос окна — со своей моделью или моделью из настроек.

- [ ] **Step 1: Тесты**

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
import { DownloadError } from '../models/download';
import { transcriptionTexts } from '../texts';
import type { MainToWorker, TranscribeCommand, WorkerToMain } from './protocol';
import { IDLE_SHUTDOWN_MS, TranscriptionQueue, WATCHDOG_MIN_MS, type WorkerHandle } from './queue';

/** Поддельный процесс расшифровки: запоминает команды, тест присылает ответы и «роняет» его. */
class FakeWorker implements WorkerHandle {
```

**на:**

```ts
import { DownloadError } from '../models/download';
import { transcriptionTexts } from '../texts';
import type { MainToWorker, TranscribeCommand, WorkerToMain } from './protocol';
import { IDLE_SHUTDOWN_MS, MODELS_SLOW_MS, TranscriptionQueue, WATCHDOG_MIN_MS, type WorkerHandle } from './queue';

/** Поддельный процесс расшифровки: запоминает команды, тест присылает ответы и «роняет» его. */
class FakeWorker implements WorkerHandle {
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts

function setup(
  overrides: {
    ensure?: (onProgress: (p: { done: number; total: number }) => void) => Promise<void>;
    deferExit?: boolean;
    ffmpegPath?: () => string;
    finished?: (event: { meeting: Meeting; ok: boolean }) => void;
```

**на:**

```ts

function setup(
  overrides: {
    ensure?: (onProgress: (p: { done: number; total: number }) => void, signal?: AbortSignal) => Promise<void>;
    deferExit?: boolean;
    ffmpegPath?: () => string;
    finished?: (event: { meeting: Meeting; ok: boolean }) => void;
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
      root: 'M',
      ensure: (groups, options) => {
        ensured.push([...groups]);
        return (overrides.ensure ?? (async () => undefined))(options.onProgress ?? (() => undefined));
      },
    },
    ffmpegPath: overrides.ffmpegPath ?? (() => 'ffmpeg'),
```

**на:**

```ts
      root: 'M',
      ensure: (groups, options) => {
        ensured.push([...groups]);
        return (overrides.ensure ?? (async () => undefined))(options.onProgress ?? (() => undefined), options.signal);
      },
    },
    ffmpegPath: overrides.ffmpegPath ?? (() => 'ffmpeg'),
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    expect(command).toMatchObject({ modelsDir: 'M', ffmpegPath: 'ffmpeg', threads: 7 });
    expect(t.ensured).toEqual([['gigaam-v3-e2e-rnnt', 'voices']]);
    expect(command.input).toEqual({
      tracks: [
```

**на:**

```ts
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    expect(command).toMatchObject({ modelsDir: 'M', model: 'gigaam-v3-e2e-rnnt', ffmpegPath: 'ffmpeg', threads: 7 });
    expect(t.ensured).toEqual([['gigaam-v3-e2e-rnnt', 'voices']]);
    expect(command.input).toEqual({
      tracks: [
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]).toMatchObject({ ok: true, meeting: { status: 'done', model: 'gigaam-v3-e2e-rnnt' } });
    const transcript = await readTranscript(lib, meeting.id);
    expect(transcript?.segments.map((s) => s.text)).toEqual(['Привет.', 'Здравствуйте.']);
    expect(transcript?.segments[0]?.edited).toBe(false);
    expect(t.queue.isBusy()).toBe(false);
    expect(t.queue.progress()).toEqual([]);
  });

  it('saves a new number of participants and passes it on', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
```

**на:**

```ts
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]).toMatchObject({ ok: true, meeting: { status: 'done', model: 'gigaam-v3-e2e-rnnt' } });
    const transcript = await readTranscript(lib, meeting.id);
    expect(transcript).toMatchObject({ model: 'gigaam-v3-e2e-rnnt', modelTitle: 'GigaAM v3' });
    expect(transcript?.segments.map((s) => s.text)).toEqual(['Привет.', 'Здравствуйте.']);
    expect(transcript?.segments[0]?.edited).toBe(false);
    expect(t.queue.isBusy()).toBe(false);
    expect(t.queue.progress()).toEqual([]);
  });

  it('transcribes with the model asked for and remembers it in meeting.json', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id, undefined, 'parakeet-tdt-0.6b-v3');
    expect((await readMeeting(lib, meeting.id)).model).toBe('parakeet-tdt-0.6b-v3');
    const command = await transcribeSent(t.worker);
    expect(command.model).toBe('parakeet-tdt-0.6b-v3');
    expect(t.ensured).toEqual([['parakeet-tdt-0.6b-v3', 'voices']]);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.meeting.model).toBe('parakeet-tdt-0.6b-v3');
    expect(await readTranscript(lib, meeting.id)).toMatchObject({ model: 'parakeet-tdt-0.6b-v3', modelTitle: 'Parakeet v3' });
  });

  it('keeps the model of meeting.json when none is given, and takes the default one for an unknown model', async () => {
    const lib = makeTempDir();
    const chosen = await recordedMeeting(lib, { model: 't-one' });
    const unknown = await recordedMeeting(lib, { model: 'whisper-tiny' });
    const t = setup();
    await t.queue.enqueue(lib, chosen.id);
    const first = await transcribeSent(t.worker);
    expect(first.model).toBe('t-one');
    t.worker().post(done(first.jobId));
    await t.queue.enqueue(lib, unknown.id);
    const second = await transcribeSent(t.worker, 2);
    expect(second.model).toBe('gigaam-v3-e2e-rnnt');
    expect(vi.mocked(logger.warn).mock.calls.map(([m]) => m).join('\n')).toContain('whisper-tiny');
  });

  it('names the model that could not be loaded', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id, undefined, 'qwen3-asr-0.6b');
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'failed', jobId: command.jobId, message: 'Load model failed: C:\\models\\x', code: 'model-load' });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.modelLoad('Qwen3-ASR 0.6B'));
  });

  it('saves a new number of participants and passes it on', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    expect(loggedErrors()).toContain('DownloadError: нет связи с сервером');
  });

  it('fails clearly when there are no recorded tracks', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { tracks: [] });
```

**на:**

```ts
    expect(loggedErrors()).toContain('DownloadError: нет связи с сервером');
  });

  it('shows «preparing the model» when the check of the models takes long', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    let finish = (): void => undefined;
    const t = setup({
      ensure: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    await t.queue.enqueue(lib, meeting.id, undefined, 'whisper-large-v3-turbo');
    await vi.waitFor(() => expect(t.queue.progress()[0]?.stage).toBe('download'), { timeout: MODELS_SLOW_MS + 2000 });
    expect(t.queue.progress()[0]?.download).toEqual({ done: 0, total: 0, title: 'Whisper large-v3-turbo' });
    finish();
    await transcribeSent(t.worker);
  });

  it('a new request for the same meeting stops the download of its models and starts over', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const signals: (AbortSignal | undefined)[] = [];
    const t = setup({
      ensure: (_onProgress, signal) => {
        signals.push(signal);
        if (signals.length > 1) return Promise.resolve();
        return new Promise<void>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new DownloadError('cancelled', 'скачивание отменено'))),
        );
      },
    });
    await t.queue.enqueue(lib, meeting.id, undefined, 'qwen3-asr-0.6b');
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    await t.queue.enqueue(lib, meeting.id, undefined, 't-one');
    expect(signals[0]?.aborted).toBe(true);
    const command = await transcribeSent(t.worker);
    expect(command.model).toBe('t-one');
    expect(t.finished).toEqual([]);
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBeNull();
  });

  it('fails clearly when there are no recorded tracks', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { tracks: [] });
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/transcription/queue.test.ts`
Ожидается: FAIL — команда процессу без модели встречи, нет `MODELS_SLOW_MS`.

- [ ] **Step 3: Код**

**В `src/main/index.ts` заменить:**

```ts
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
    enqueueTranscription: (dir, id) => {
      queue.enqueue(dir, id).catch((err: unknown) => {
        logger.error(`Не удалось поставить встречу ${id} в очередь расшифровки`, err);
        notify(notificationTexts.transcribeNotQueued());
      });
```

**на:**

```ts
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
    enqueueTranscription: (dir, id) => {
      // Модель — из настроек на момент ответа в окне «Запись остановлена».
      queue.enqueue(dir, id, undefined, settings.get().asrModel).catch((err: unknown) => {
        logger.error(`Не удалось поставить встречу ${id} в очередь расшифровки`, err);
        notify(notificationTexts.transcribeNotQueued());
      });
```

**В `src/main/ipc.ts` заменить:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { DEFAULT_ASR_MODEL } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
```

**на:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
```

**В `src/main/ipc.ts` заменить:**

```ts
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null): Promise<void>;
    progress(): TranscriptionProgress[];
    isBusy(): boolean;
    stopIdleWorker(): void;
```

**на:**

```ts
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
    isBusy(): boolean;
    stopIdleWorker(): void;
```

**В `src/main/ipc.ts` заменить:**

```ts
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';

const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
});

const RecorderSchemas = {
```

**на:**

```ts
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
  model: AsrModelIdSchema.nullable(),
});

const RecorderSchemas = {
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.transcribe, async (arg) => {
    const request = TranscribeRequestSchema.parse(arg);
    await deps.transcription.enqueue(deps.libraryDir(), request.meetingId, request.participantsHint);
  });

  handle(IPC.getTranscript, (arg) => readTranscript(deps.libraryDir(), MeetingIdSchema.parse(arg)));
```

**на:**

```ts

  handle(IPC.transcribe, async (arg) => {
    const request = TranscribeRequestSchema.parse(arg);
    const model = request.model ?? deps.settings.get().asrModel;
    await deps.transcription.enqueue(deps.libraryDir(), request.meetingId, request.participantsHint, model);
  });

  handle(IPC.getTranscript, (arg) => readTranscript(deps.libraryDir(), MeetingIdSchema.parse(arg)));
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
// Очередь расшифровки в main (спецификация Плана 3, §5): одна встреча за раз, процесс расшифровки,
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import { asrModel, DEFAULT_ASR_MODEL } from '../../shared/asr-models';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
```

**на:**

```ts
// Очередь расшифровки в main (спецификация Плана 3, §5): одна встреча за раз, процесс расшифровки,
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import { asrModel, DEFAULT_ASR_MODEL, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
 * у которой длительность встречи ещё неизвестна.
 */
export const DIARIZE_WATCHDOG_FACTOR = 6;
/** Процесс без задач закрывается: модели занимают ~1 ГБ памяти. */
export const IDLE_SHUTDOWN_MS = 5 * 60_000;
/** Прогресс в окно — не чаще. */
```

**на:**

```ts
 * у которой длительность встречи ещё неизвестна.
 */
export const DIARIZE_WATCHDOG_FACTOR = 6;
/** Модели проверяются дольше — во встрече «Готовим модель …» (первая проверка сумм, ожидание чужого скачивания). */
export const MODELS_SLOW_MS = 700;
/** Процесс без задач закрывается: модели занимают ~1 ГБ памяти. */
export const IDLE_SHUTDOWN_MS = 5 * 60_000;
/** Прогресс в окно — не чаще. */
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
  meetingId: string;
}

/** failed: message — для человека, detail — исходный текст процесса расшифровки (только в журнал). */
type Outcome =
  | { kind: 'done'; result: PipelineResult }
  | { kind: 'failed'; message: string; detail?: string }
  | { kind: 'cancelled' };

/** Ошибка, текст которой написан для человека: во встречу он попадает как есть, остальные — общим текстом. */
```

**на:**

```ts
  meetingId: string;
}

/**
 * failed: message — для человека, detail — исходный текст процесса расшифровки (только в журнал); modelLoad —
 * не загрузилась модель расшифровки.
 */
type Outcome =
  | { kind: 'done'; result: PipelineResult }
  | { kind: 'failed'; message: string; detail?: string; modelLoad?: boolean }
  | { kind: 'cancelled' };

/** Ошибка, текст которой написан для человека: во встречу он попадает как есть, остальные — общим текстом. */
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
  progress: TranscriptionProgress;
  clock: (DiarizeClock & { startedAt: number }) | null;
  cancelled: boolean;
  /** Задача в процессе расшифровки: завершить её (один раз). */
  settle: ((outcome: Outcome) => void) | null;
  /** Сообщение от процесса — сторож зависания начинает отсчёт заново (с новым сроком). */
```

**на:**

```ts
  progress: TranscriptionProgress;
  clock: (DiarizeClock & { startedAt: number }) | null;
  cancelled: boolean;
  /** Отмена скачивания моделей этой задачи (встречу поставили заново, программа закрывается). */
  abort: AbortController;
  /** Задача в процессе расшифровки: завершить её (один раз). */
  settle: ((outcome: Outcome) => void) | null;
  /** Сообщение от процесса — сторож зависания начинает отсчёт заново (с новым сроком). */
```

**В `src/main/transcription/queue.ts` заменить:**

```ts

  /**
   * Поставить встречу в очередь («Расшифровать», «Расшифровать заново», «Повторить», после окна «Запись
   * остановлена»). participantsHint: undefined — оставить как в meeting.json. Если встреча уже расшифровывается —
   * работа прерывается и начинается заново.
   */
  async enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null): Promise<void> {
    this.pendingEnqueues += 1;
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
```

**на:**

```ts

  /**
   * Поставить встречу в очередь («Расшифровать», «Расшифровать заново», «Повторить», после окна «Запись
   * остановлена»). participantsHint и model: undefined — оставить как в meeting.json. Модель пишется в meeting.json
   * (поле model): по ней продолжится расшифровка после перезапуска. Если встреча уже расшифровывается — работа
   * прерывается и начинается заново.
   */
  async enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void> {
    this.pendingEnqueues += 1;
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
          status: 'queued',
          errorMessage: null,
          ...(participantsHint !== undefined && { participantsHint }),
        };
      });
      // Сначала в очередь: сбой обработчика окна не должен оставить встречу «в очереди» без задачи.
```

**на:**

```ts
          status: 'queued',
          errorMessage: null,
          ...(participantsHint !== undefined && { participantsHint }),
          ...(model !== undefined && { model }),
        };
      });
      // Сначала в очередь: сбой обработчика окна не должен оставить встречу «в очереди» без задачи.
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    clearTimeout(this.idleTimer);
    clearTimeout(this.watchdog);
    clearInterval(this.ticker);
    if (this.current) this.current.cancelled = true;
    this.killWorker(this.worker);
  }
```

**на:**

```ts
    clearTimeout(this.idleTimer);
    clearTimeout(this.watchdog);
    clearInterval(this.ticker);
    if (this.current) {
      this.current.cancelled = true;
      this.current.abort.abort();
    }
    this.killWorker(this.worker);
  }
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    const current = this.current;
    if (current && sameJob(current.job, job)) {
      current.cancelled = true;
      // Процесс останавливается, только пока он занят этой встречей: готовый результат он уже прислал.
      if (current.settle) this.killWorker(current.worker);
    }
```

**на:**

```ts
    const current = this.current;
    if (current && sameJob(current.job, job)) {
      current.cancelled = true;
      current.abort.abort();
      // Процесс останавливается, только пока он занят этой встречей: готовый результат он уже прислал.
      if (current.settle) this.killWorker(current.worker);
    }
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
      progress: { meetingId, stage: 'prepare', fraction: 0, download: null },
      clock: null,
      cancelled: this.disposed,
      settle: null,
      rearm: null,
      baseLimitMs: WATCHDOG_MIN_MS,
```

**на:**

```ts
      progress: { meetingId, stage: 'prepare', fraction: 0, download: null },
      clock: null,
      cancelled: this.disposed,
      abort: new AbortController(),
      settle: null,
      rearm: null,
      baseLimitMs: WATCHDOG_MIN_MS,
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    if (event) this.report(() => this.deps.finished(event));
  }

  /** Модели, процесс расшифровки, запись результата. null — уведомлять не о чем (встречу поставили заново). */
  private async transcribe(current: Current, meeting: Meeting): Promise<{ meeting: Meeting; ok: boolean } | null> {
    const { libraryDir, meetingId } = current.job;
    try {
      const { title } = asrModel(DEFAULT_ASR_MODEL);
      await this.deps.models
        .ensure([DEFAULT_ASR_MODEL, 'voices'], {
          onProgress: (download) => this.setProgress(current, { stage: 'download', fraction: 0, download: { ...download, title } }),
        })
        .catch((err: unknown) => {
          throw new ShownError(transcriptionTexts.download(err), { cause: err });
        });
      if (current.cancelled) return null;
      const input = await buildPipelineInput(libraryDir, meeting);
      if (current.cancelled) return null;
      if (input.tracks.length === 0) throw new ShownError(transcriptionTexts.noTracks);
      const outcome = await this.runInWorker(current, input);
      // Встречу поставили заново (или программа закрывается), пока шла работа: этот результат не нужен.
      if (current.cancelled || outcome.kind === 'cancelled') return null;
      if (outcome.kind === 'failed') throw new ShownError(outcome.message, { cause: outcome.detail });
      for (const skipped of outcome.result.skippedTracks) {
        this.deps.logger.warn(`Расшифровка ${meetingId}: дорожка ${skipped.kind} не прочитана — ${skipped.message}`);
      }
      await writeTranscript(libraryDir, meetingId, {
        schemaVersion: 1,
        model: DEFAULT_ASR_MODEL,
        createdAt: new Date(this.deps.now()).toISOString(),
        speakers: outcome.result.speakers,
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'done', model: DEFAULT_ASR_MODEL, errorMessage: null } : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
```

**на:**

```ts
    if (event) this.report(() => this.deps.finished(event));
  }

  /** Модель встречи; встреча Плана 3 (model: null) и неизвестная модель — модель по умолчанию. */
  private modelOf(meeting: Meeting): AsrModelId {
    if (isAsrModelId(meeting.model)) return meeting.model;
    if (meeting.model !== null) {
      this.deps.logger.warn(`Расшифровка ${meeting.id}: модели «${meeting.model}» нет в каталоге — берём ${DEFAULT_ASR_MODEL}`);
    }
    return DEFAULT_ASR_MODEL;
  }

  /**
   * Модель встречи и общие модели голосов на месте (скачиваются, если нет). Обычно это доли секунды; дольше —
   * во встрече «Готовим модель …», пока не пошли байты своего скачивания.
   */
  private async ensureModels(current: Current, model: AsrModelId, title: string): Promise<void> {
    const slow = setTimeout(() => {
      if (current.progress.stage !== 'download') {
        this.setProgress(current, { stage: 'download', fraction: 0, download: { done: 0, total: 0, title } });
      }
    }, MODELS_SLOW_MS);
    try {
      await this.deps.models.ensure([model, 'voices'], {
        signal: current.abort.signal,
        onProgress: (download) => this.setProgress(current, { stage: 'download', fraction: 0, download: { ...download, title } }),
      });
    } catch (err) {
      throw new ShownError(transcriptionTexts.download(err), { cause: err });
    } finally {
      clearTimeout(slow);
    }
  }

  /** Модели, процесс расшифровки, запись результата. null — уведомлять не о чем (встречу поставили заново). */
  private async transcribe(current: Current, meeting: Meeting): Promise<{ meeting: Meeting; ok: boolean } | null> {
    const { libraryDir, meetingId } = current.job;
    const model = this.modelOf(meeting);
    const { title } = asrModel(model);
    try {
      await this.ensureModels(current, model, title);
      if (current.cancelled) return null;
      const input = await buildPipelineInput(libraryDir, meeting);
      if (current.cancelled) return null;
      if (input.tracks.length === 0) throw new ShownError(transcriptionTexts.noTracks);
      const outcome = await this.runInWorker(current, input, model);
      // Встречу поставили заново (или программа закрывается), пока шла работа: этот результат не нужен.
      if (current.cancelled || outcome.kind === 'cancelled') return null;
      if (outcome.kind === 'failed') {
        const message = outcome.modelLoad ? transcriptionTexts.modelLoad(title) : outcome.message;
        throw new ShownError(message, { cause: outcome.detail });
      }
      for (const skipped of outcome.result.skippedTracks) {
        this.deps.logger.warn(`Расшифровка ${meetingId}: дорожка ${skipped.kind} не прочитана — ${skipped.message}`);
      }
      await writeTranscript(libraryDir, meetingId, {
        schemaVersion: 1,
        model,
        modelTitle: title,
        createdAt: new Date(this.deps.now()).toISOString(),
        speakers: outcome.result.speakers,
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'done', model, errorMessage: null } : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    }
  }

  private runInWorker(current: Current, input: PipelineInput): Promise<Outcome> {
    // Команда собирается до запуска процесса и сторожа: сбой здесь не оставит взведённого сторожа.
    const command: TranscribeCommand = {
      type: 'transcribe',
      jobId: `job-${++this.jobCounter}`,
      input,
      modelsDir: this.deps.models.root,
      model: DEFAULT_ASR_MODEL,
      ffmpegPath: this.deps.ffmpegPath(),
      threads: this.deps.threads(),
    };
```

**на:**

```ts
    }
  }

  private runInWorker(current: Current, input: PipelineInput, model: AsrModelId): Promise<Outcome> {
    // Команда собирается до запуска процесса и сторожа: сбой здесь не оставит взведённого сторожа.
    const command: TranscribeCommand = {
      type: 'transcribe',
      jobId: `job-${++this.jobCounter}`,
      input,
      modelsDir: this.deps.models.root,
      model,
      ffmpegPath: this.deps.ffmpegPath(),
      threads: this.deps.threads(),
    };
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    current.settle?.(
      message.type === 'done'
        ? { kind: 'done', result: message.result }
        : { kind: 'failed', message: transcriptionTexts.workerFailed(message.message), detail: message.message },
    );
  }
```

**на:**

```ts
    current.settle?.(
      message.type === 'done'
        ? { kind: 'done', result: message.result }
        : {
            kind: 'failed',
            message: transcriptionTexts.workerFailed(message.message),
            detail: message.message,
            modelLoad: message.code === 'model-load',
          },
    );
  }
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  660 passed (660)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: a meeting is transcribed with its own model; model downloads of a job can be cancelled"
```

### Task 8: Скачивание, отмена и выбор модели из окна

**Files:**
- Create: `src/main/models/catalog-downloads.test.ts`, `src/main/models/catalog-downloads.ts`
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`

`CatalogDownloads` — кнопки «Скачать» / «Отменить» в карточке: одна модель за раз (вместе с общими моделями
голосов, если их нет), ход — в окно не чаще двух раз в секунду (событие `models:changed`), отмена стирает недокачанное,
а успевшая скачаться до отмены модель остаётся; неудача остаётся в карточке до нового скачивания (скачанной модели её
не показываем). Новые каналы: `models:download`, `models:cancel-download`, `models:select`; «Удалить» отказывает и во
время скачивания из каталога.

- [ ] **Step 1: Тесты**

**Создать `src/main/models/catalog-downloads.test.ts`:**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { transcriptionTexts } from '../texts';
import { CatalogDownloads, DOWNLOAD_REPORT_MS, DOWNLOAD_RUNNING } from './catalog-downloads';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { ModelGroupId } from './registry';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };

/** Скачивание, которым управляет тест: прогресс, конец, ошибка; отмена отклоняет его, как настоящее. */
function controllableModels() {
  const calls: { groups: readonly ModelGroupId[]; options: EnsureOptions; resolve(): void; reject(err: unknown): void }[] = [];
  const removed: ModelGroupId[] = [];
  const models = {
    ensure: (groups: readonly ModelGroupId[], options: EnsureOptions) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ groups, options, resolve, reject });
        options.signal?.addEventListener('abort', () => reject(new DownloadError('cancelled', 'скачивание отменено')));
      }),
    remove: vi.fn(async (group: ModelGroupId) => {
      removed.push(group);
    }),
  };
  return { models, calls, removed };
}

function setup() {
  const { models, calls, removed } = controllableModels();
  let now = 0;
  const changed = vi.fn();
  const downloads = new CatalogDownloads({ models, logger, changed, now: () => now });
  return {
    downloads,
    calls,
    removed,
    models,
    changed,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe('CatalogDownloads', () => {
  it('downloads a model together with the shared voice models and shows the bytes', async () => {
    const t = setup();
    t.downloads.start('t-one');
    expect(t.calls[0]?.groups).toEqual(['t-one', 'voices']);
    expect(t.downloads.snapshot()).toEqual({ download: { id: 't-one', done: 0, total: 0 }, downloadError: null });
    expect(t.downloads.isBusy()).toBe(true);
    t.tick(DOWNLOAD_REPORT_MS);
    t.calls[0]!.options.onProgress?.({ done: 50, total: 200 });
    expect(t.downloads.snapshot().download).toEqual({ id: 't-one', done: 50, total: 200 });
    t.calls[0]!.resolve();
    await vi.waitFor(() => expect(t.downloads.isBusy()).toBe(false));
    expect(t.downloads.snapshot()).toEqual({ download: null, downloadError: null });
  });

  it('tells the window at most twice a second, but always at the start and the end', async () => {
    const t = setup();
    t.downloads.start('t-one');
    expect(t.changed).toHaveBeenCalledTimes(1);
    t.calls[0]!.options.onProgress?.({ done: 1, total: 10 });
    t.calls[0]!.options.onProgress?.({ done: 2, total: 10 });
    expect(t.changed).toHaveBeenCalledTimes(1);
    t.tick(DOWNLOAD_REPORT_MS);
    t.calls[0]!.options.onProgress?.({ done: 3, total: 10 });
    expect(t.changed).toHaveBeenCalledTimes(2);
    t.calls[0]!.resolve();
    await vi.waitFor(() => expect(t.changed).toHaveBeenCalledTimes(3));
  });

  it('downloads one model at a time and ignores a second press on the same one', () => {
    const t = setup();
    t.downloads.start('t-one');
    t.downloads.start('t-one');
    expect(t.calls).toHaveLength(1);
    expect(() => t.downloads.start('canary-180m-flash')).toThrow(DOWNLOAD_RUNNING);
  });

  it('cancels: stops the download and erases what was downloaded, without an error', async () => {
    const t = setup();
    t.downloads.start('qwen3-asr-0.6b');
    await t.downloads.cancel('qwen3-asr-0.6b');
    expect(t.calls[0]!.options.signal?.aborted).toBe(true);
    expect(t.removed).toEqual(['qwen3-asr-0.6b']);
    expect(t.downloads.snapshot()).toEqual({ download: null, downloadError: null });
  });

  it('keeps a model that finished downloading right before the cancel', async () => {
    const t = setup();
    t.downloads.start('t-one');
    t.calls[0]!.resolve();
    await t.downloads.cancel('t-one');
    expect(t.removed).toEqual([]);
  });

  it('cancelling another model does nothing', async () => {
    const t = setup();
    t.downloads.start('t-one');
    await t.downloads.cancel('canary-180m-flash');
    expect(t.calls[0]!.options.signal?.aborted).toBe(false);
    expect(t.removed).toEqual([]);
  });

  it('keeps the reason of a failed download for the card and clears it on a new try', async () => {
    const t = setup();
    t.downloads.start('t-one');
    t.calls[0]!.reject(new DownloadError('network', 'нет связи с сервером'));
    await vi.waitFor(() => expect(t.downloads.isBusy()).toBe(false));
    expect(t.downloads.snapshot().downloadError).toEqual({
      id: 't-one',
      message: transcriptionTexts.download(new DownloadError('network', 'x')),
    });
    t.downloads.start('t-one');
    expect(t.downloads.snapshot().downloadError).toBeNull();
  });

  it('keeps the partial files when they cannot be removed right now', async () => {
    const t = setup();
    t.models.remove.mockRejectedValueOnce(new Error('модели сейчас проверяются или скачиваются'));
    t.downloads.start('t-one');
    await t.downloads.cancel('t-one');
    expect(logger.warn).toHaveBeenCalled();
    expect(t.downloads.isBusy()).toBe(false);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/models/catalog-downloads.test.ts`
Ожидается: FAIL — нет модуля `./catalog-downloads`.

- [ ] **Step 3: Код**

**В `src/main/index.ts` заменить:**

```ts
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { FakeModelStore } from './models/fake-model-store';
import { ModelManager, type ModelStore } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
```

**на:**

```ts
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { CatalogDownloads } from './models/catalog-downloads';
import { FakeModelStore } from './models/fake-model-store';
import { ModelManager, type ModelStore } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
```

**В `src/main/index.ts` заменить:**

```ts
  const models: ModelStore = fakeAsr
    ? new FakeModelStore(modelsDir, fakeDownloadStepMs)
    : new ModelManager({ root: modelsDir, logger, freeBytes: freeDiskBytes });
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger),
    models,
```

**на:**

```ts
  const models: ModelStore = fakeAsr
    ? new FakeModelStore(modelsDir, fakeDownloadStepMs)
    : new ModelManager({ root: modelsDir, logger, freeBytes: freeDiskBytes });
  const catalogDownloads = new CatalogDownloads({
    models,
    logger,
    changed: () => sendToMain(IPC.modelsChanged),
    now: () => Date.now(),
  });
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger),
    models,
```

**В `src/main/index.ts` заменить:**

```ts
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    transcription: queue,
    models,
  });

  app.on('before-quit', (event) => {
```

**на:**

```ts
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    transcription: queue,
    models,
    downloads: catalogDownloads,
  });

  app.on('before-quit', (event) => {
```

**В `src/main/ipc.ts` заменить:**

```ts
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildModelsState } from './models/models-state';
import { MODEL_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
```

**на:**

```ts
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildModelsState, type CatalogDownloadsSnapshot } from './models/models-state';
import { MODEL_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
```

**В `src/main/ipc.ts` заменить:**

```ts
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
}

const StopDialogAnswerSchema = z.object({
```

**на:**

```ts
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  downloads: {
    start(id: AsrModelId): void;
    cancel(id: AsrModelId): Promise<void>;
    snapshot(): CatalogDownloadsSnapshot;
    isBusy(): boolean;
  };
}

const StopDialogAnswerSchema = z.object({
```

**В `src/main/ipc.ts` заменить:**

```ts
const STOP_DIALOG_OPEN = 'Сначала ответьте в окне «Запись остановлена».';
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
```

**на:**

```ts
const STOP_DIALOG_OPEN = 'Сначала ответьте в окне «Запись остановлена».';
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
```

**В `src/main/ipc.ts` заменить:**

```ts
    buildModelsState(
      await deps.models.state(),
      deps.settings.get().asrModel,
      { download: null, downloadError: null },
      deps.transcription.isBusy(),
    );
```

**на:**

```ts
    buildModelsState(
      await deps.models.state(),
      deps.settings.get().asrModel,
      deps.downloads.snapshot(),
      deps.transcription.isBusy(),
    );
```

**В `src/main/ipc.ts` заменить:**

```ts
  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(MODEL_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    deps.transcription.stopIdleWorker();
    try {
      await deps.models.remove(group);
```

**на:**

```ts
  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(MODEL_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    deps.transcription.stopIdleWorker();
    try {
      await deps.models.remove(group);
```

**В `src/main/ipc.ts` заменить:**

```ts
    return modelsState();
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
  onRecorder(IPC.recorderStarted, (message) => deps.controller.onStarted(message));
  onRecorder(IPC.recorderStartFailed, (message) => deps.controller.onStartFailed(message));
```

**на:**

```ts
    return modelsState();
  });

  handle(IPC.downloadModel, async (arg) => {
    deps.downloads.start(AsrModelIdSchema.parse(arg));
    return modelsState();
  });

  handle(IPC.cancelModelDownload, async (arg) => {
    await deps.downloads.cancel(AsrModelIdSchema.parse(arg));
    return modelsState();
  });

  handle(IPC.selectModel, async (arg) => {
    await deps.settings.update({ asrModel: AsrModelIdSchema.parse(arg) });
    return modelsState();
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
  onRecorder(IPC.recorderStarted, (message) => deps.controller.onStarted(message));
  onRecorder(IPC.recorderStartFailed, (message) => deps.controller.onStartFailed(message));
```

**Создать `src/main/models/catalog-downloads.ts`:**

```ts
// Скачивание из каталога моделей (кнопки «Скачать» / «Отменить» в карточке, решения Плана 7, §2): одна модель за раз,
// прогресс в окно не чаще двух раз в секунду, отмена стирает недокачанное. Electron сюда не подключается.
import type { AsrModelId } from '../../shared/asr-models';
import type { Logger } from '../logger';
import { transcriptionTexts } from '../texts';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { CatalogDownloadsSnapshot } from './models-state';
import type { ModelGroupId } from './registry';

/** Прогресс в окно — не чаще. */
export const DOWNLOAD_REPORT_MS = 500;
export const DOWNLOAD_RUNNING = 'Сейчас скачивается другая модель — дождитесь конца или отмените её скачивание.';

export interface CatalogDownloadsDeps {
  models: {
    ensure(groups: readonly ModelGroupId[], options: EnsureOptions): Promise<void>;
    remove(group: ModelGroupId): Promise<void>;
  };
  logger: Logger;
  /** Состояние скачивания изменилось — окно перечитает модели. */
  changed(): void;
  now(): number;
}

interface Running {
  id: AsrModelId;
  done: number;
  total: number;
  controller: AbortController;
  /** Скачивание закончилось; true — его отменили (а не скачалось или сломалось). */
  finished: Promise<boolean>;
}

export class CatalogDownloads {
  private running: Running | null = null;
  private error: CatalogDownloadsSnapshot['downloadError'] = null;
  private lastReport = 0;

  constructor(private readonly deps: CatalogDownloadsDeps) {}

  snapshot(): CatalogDownloadsSnapshot {
    const running = this.running;
    return {
      download: running && { id: running.id, done: running.done, total: running.total },
      downloadError: this.error,
    };
  }

  isBusy(): boolean {
    return this.running !== null;
  }

  /**
   * Начать скачивание модели (и общих моделей голосов, если их нет). Та же модель уже качается — ничего не делает;
   * другая — отказ: две загрузки разом делили бы канал и место на диске.
   */
  start(id: AsrModelId): void {
    if (this.running?.id === id) return;
    if (this.running) throw new Error(DOWNLOAD_RUNNING);
    const controller = new AbortController();
    const running: Running = { id, done: 0, total: 0, controller, finished: Promise.resolve(false) };
    this.running = running;
    if (this.error?.id === id) this.error = null;
    running.finished = this.deps.models
      .ensure([id, 'voices'], {
        signal: controller.signal,
        onProgress: ({ done, total }) => {
          running.done = done;
          running.total = total;
          this.report(false);
        },
      })
      .then(
        () => {
          this.deps.logger.info(`Модель скачана: ${id}`);
          return false;
        },
        (err: unknown) => {
          if (err instanceof DownloadError && err.kind === 'cancelled') return true;
          this.deps.logger.error(`Модель не скачалась: ${id}`, err);
          this.error = { id, message: transcriptionTexts.download(err) };
          return false;
        },
      )
      .finally(() => {
        if (this.running === running) this.running = null;
        this.report(true);
      });
    this.report(true);
  }

  /**
   * Отменить скачивание модели id: загрузка обрывается, скачанные файлы этой модели стираются. Успела скачаться
   * целиком до отмены — остаётся.
   */
  async cancel(id: AsrModelId): Promise<void> {
    const running = this.running;
    if (running?.id !== id) return;
    running.controller.abort();
    if (!(await running.finished)) return;
    try {
      await this.deps.models.remove(id);
    } catch (err) {
      // Модель сейчас проверяет расшифровка — недокачанное останется и докачается при следующем скачивании.
      this.deps.logger.warn(`Недокачанная модель ${id} не удалена`, err);
    }
    this.report(true);
  }

  private report(force: boolean): void {
    const now = this.deps.now();
    if (!force && now - this.lastReport < DOWNLOAD_REPORT_MS) return;
    this.lastReport = now;
    try {
      this.deps.changed();
    } catch (err) {
      this.deps.logger.error('Скачивание моделей: сбой обработчика', err);
    }
  }
}
```

**В `src/preload/index.ts` заменить:**

```ts
  getTranscriptionProgress: () => invoke(IPC.getTranscriptionProgress),
  getModels: () => invoke(IPC.getModels),
  deleteModels: (group) => invoke(IPC.deleteModels, group),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
};
```

**на:**

```ts
  getTranscriptionProgress: () => invoke(IPC.getTranscriptionProgress),
  getModels: () => invoke(IPC.getModels),
  deleteModels: (group) => invoke(IPC.deleteModels, group),
  downloadModel: (id) => invoke(IPC.downloadModel, id),
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onModelsChanged: (listener) => subscribe(IPC.modelsChanged, () => listener()),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
};
```

**В `src/shared/ipc.ts` заменить:**

```ts
// preload и main пользуются типизированными обёртками над этими таблицами, поэтому расхождение ловит
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { MeetingListEntry } from './meeting';
import type {
  Peaks,
```

**на:**

```ts
// preload и main пользуются типизированными обёртками над этими таблицами, поэтому расхождение ловит
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { MeetingListEntry } from './meeting';
import type {
  Peaks,
```

**В `src/shared/ipc.ts` заменить:**

```ts
  getTranscriptionProgress: 'transcription:get-progress',
  getModels: 'models:get',
  deleteModels: 'models:delete',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
  libraryChanged: 'library:changed',
  transcriptionProgress: 'transcription:progress',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  // main → окно записи (команды).
```

**на:**

```ts
  getTranscriptionProgress: 'transcription:get-progress',
  getModels: 'models:get',
  deleteModels: 'models:delete',
  downloadModel: 'models:download',
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
  libraryChanged: 'library:changed',
  transcriptionProgress: 'transcription:progress',
  /** Скачивание из каталога продвинулось, началось или закончилось — перечитать модели. */
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  // main → окно записи (команды).
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.getTranscriptionProgress]: { arg: void; result: TranscriptionProgress[] };
  [IPC.getModels]: { arg: void; result: ModelsState };
  [IPC.deleteModels]: { arg: ModelGroupId; result: ModelsState };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
```

**на:**

```ts
  [IPC.getTranscriptionProgress]: { arg: void; result: TranscriptionProgress[] };
  [IPC.getModels]: { arg: void; result: ModelsState };
  [IPC.deleteModels]: { arg: ModelGroupId; result: ModelsState };
  [IPC.downloadModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.recordingPeaks]: Peaks;
  [IPC.libraryChanged]: void;
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.showMeeting]: string;
}
export type MainEventChannel = keyof MainEventContract;
```

**на:**

```ts
  [IPC.recordingPeaks]: Peaks;
  [IPC.libraryChanged]: void;
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.modelsChanged]: void;
  [IPC.showMeeting]: string;
}
export type MainEventChannel = keyof MainEventContract;
```

**В `src/shared/ipc.ts` заменить:**

```ts
  getTranscriptionProgress(): Promise<TranscriptionProgress[]>;
  getModels(): Promise<ModelsState>;
  deleteModels(group: ModelGroupId): Promise<ModelsState>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
}
```

**на:**

```ts
  getTranscriptionProgress(): Promise<TranscriptionProgress[]>;
  getModels(): Promise<ModelsState>;
  deleteModels(group: ModelGroupId): Promise<ModelsState>;
  /** «Скачать» в карточке модели. */
  downloadModel(id: AsrModelId): Promise<ModelsState>;
  /** «Отменить» скачивание: недокачанное стирается. */
  cancelModelDownload(id: AsrModelId): Promise<ModelsState>;
  /** «Выбрать»: модель для новых встреч. */
  selectModel(id: AsrModelId): Promise<ModelsState>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onModelsChanged(listener: () => void): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  668 passed (668)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: download, cancel and select catalog models from the window"
```

### Task 9: Каталог моделей в настройках

**Files:**
- Create: `e2e/models.spec.ts`, `src/renderer/main/ModelCard.tsx`, `src/renderer/main/model-catalog.test.ts`, `src/renderer/main/model-catalog.ts`
- Modify: `e2e/helpers.ts`, `e2e/transcription.spec.ts`, `src/renderer/main/TranscriptionSettings.tsx`, `src/renderer/main/styles.css`

Раздел «Расшифровка» — карточки, как на снимке Handy, в стиле «Бумага»: «Выбрана», «Скачанные», «Понимают
русский», «Только английский». Карточка: название и автор, описание, полоски «точность» и «скорость», языки, размер,
«Рекомендуется» у GigaAM, кнопки по состоянию, ход скачивания с «Отменить». Общие модели голосов — отдельной строкой.
Старые стили выбора модели (`.opts`, `.opt`, `.radio`) больше не нужны и заменяются стилями каталога.

- [ ] **Step 1: Тесты**

**В `e2e/helpers.ts` заменить:**

```ts
  executablePath?: string;
  /** Уже расшифрованные встречи: id → transcript.json. */
  transcripts?: Record<string, unknown>;
}

export interface LaunchedApp {
```

**на:**

```ts
  executablePath?: string;
  /** Уже расшифрованные встречи: id → transcript.json. */
  transcripts?: Record<string, unknown>;
  /** Сколько длится каждый из пяти шагов поддельного скачивания модели, мс (по умолчанию — мгновенно). */
  downloadStepMs?: number;
}

export interface LaunchedApp {
```

**В `e2e/helpers.ts` заменить:**

```ts
        // Расшифровка — поддельными движками, без моделей; папка моделей — своя (настройки её показывают).
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
      },
    });
    page = await mainWindow(app);
```

**на:**

```ts
        // Расшифровка — поддельными движками, без моделей; папка моделей — своя (настройки её показывают).
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
        TEXTMEET_TEST_DOWNLOAD_MS: String(options.downloadStepMs ?? 0),
      },
    });
    page = await mainWindow(app);
```

**Создать `e2e/models.spec.ts`:**

```ts
// Каталог моделей расшифровки (План 7): поддельное хранилище моделей и поддельные движки (TEXTMEET_TEST_ASR=fake) —
// проверяется окно и склейка с main, а не скачивание и распознавание.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const settingsFile = async (userDataDir: string) =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')) as Record<string, unknown>;

test('the catalog downloads, cancels, selects and deletes models', async () => {
  launched = await launchApp({ downloadStepMs: 600 });
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();

  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect(selected).toContainText('Скачается при первой расшифровке.');
  const russian = page.getByRole('group', { name: 'Понимают русский' });
  await expect(russian.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('group', { name: 'Только английский' }).getByRole('article')).toHaveCount(2);

  // Скачивание идёт: прогресс в карточке, остальные «Скачать» ждут; «Отменить» возвращает всё как было.
  const qwen = page.getByRole('article', { name: 'Qwen3-ASR 0.6B' });
  await qwen.getByRole('button', { name: 'Скачать: Qwen3-ASR 0.6B' }).click();
  await expect(qwen.getByRole('status')).toContainText('Скачиваем');
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeDisabled();
  await qwen.getByRole('button', { name: 'Отменить' }).click();
  await expect(qwen.getByRole('button', { name: 'Скачать: Qwen3-ASR 0.6B' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeEnabled();

  // Скачанная модель переезжает в «Скачанные», её можно выбрать.
  await page.getByRole('button', { name: 'Скачать: T-one' }).click();
  const downloaded = page.getByRole('group', { name: 'Скачанные' });
  await expect(downloaded.getByRole('article', { name: 'T-one' })).toBeVisible({ timeout: 15_000 });
  await downloaded.getByRole('button', { name: 'Выбрать: T-one' }).click();
  await expect(selected.getByRole('article', { name: 'T-one' })).toBeVisible();
  await expect.poll(async () => (await settingsFile(userDataDir)).asrModel).toBe('t-one');
  await expect(page.getByRole('list', { name: 'Общие модели' })).toContainText('Разделение по голосам и поиск речи');

  // Удалили выбранную — новые встречи пойдут на GigaAM.
  await selected.getByRole('button', { name: 'Удалить: T-one' }).click();
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect.poll(async () => (await settingsFile(userDataDir)).asrModel).toBe('gigaam-v3-e2e-rnnt');
  await expect(russian.getByRole('article', { name: 'T-one' })).toBeVisible();
});
```

**В `e2e/transcription.spec.ts` заменить:**

```ts
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', participantsHint: 3 });
});

test('settings show the transcription model and that nothing is downloaded yet', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Расшифровка' })).toBeVisible();
  await expect(page.getByText('Скачается при первой расшифровке.')).toBeVisible();
  await expect(page.getByText('Пока ничего не скачано.')).toBeVisible();
});
```

**на:**

```ts
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', participantsHint: 3 });
});

test('settings show the transcription model and that it is not downloaded yet', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Расшифровка' })).toBeVisible();
  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect(selected).toContainText('Скачается при первой расшифровке.');
  // Общие модели голосов ещё не скачаны — их строки нет.
  await expect(page.getByRole('list', { name: 'Общие модели' })).toHaveCount(0);
});
```

**Создать `src/renderer/main/model-catalog.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelsState } from '../../shared/transcription';
import { catalogSections, downloadText, modelBars, modelChoiceLabel } from './model-catalog';

const MB = 1024 * 1024;

function state(selected: AsrModelId, installed: AsrModelId[]): ModelsState {
  return {
    selected,
    models: ASR_MODEL_IDS.map((id) => ({ id, sizeBytes: 464 * MB, installed: installed.includes(id) })),
    voices: { sizeBytes: 33 * MB, installed: true },
    download: null,
    downloadError: null,
    busy: false,
  };
}

describe('catalogSections', () => {
  it('puts the chosen model first, then the downloaded ones, then the rest by language', () => {
    const sections = catalogSections(state('parakeet-tdt-0.6b-v3', ['gigaam-v3-e2e-rnnt', 'parakeet-tdt-0.6b-v3', 'canary-180m-flash']));
    expect(sections).toEqual({
      selected: 'parakeet-tdt-0.6b-v3',
      downloaded: ['gigaam-v3-e2e-rnnt', 'canary-180m-flash'],
      russian: ['qwen3-asr-0.6b', 'whisper-large-v3-turbo', 'nemotron-3.5-asr', 't-one'],
      english: ['parakeet-unified-en-0.6b'],
    });
  });

  it('keeps the chosen model on top even when it is not downloaded yet', () => {
    const sections = catalogSections(state('gigaam-v3-e2e-rnnt', []));
    expect(sections.selected).toBe('gigaam-v3-e2e-rnnt');
    expect(sections.downloaded).toEqual([]);
    expect(sections.russian).not.toContain('gigaam-v3-e2e-rnnt');
    expect([sections.selected, ...sections.russian, ...sections.english]).toHaveLength(ASR_MODEL_IDS.length);
  });
});

describe('model card texts', () => {
  it('shows the bars of a model', () => {
    expect(modelBars('gigaam-v3-e2e-rnnt')).toEqual({ accuracy: 5, speed: 5 });
    expect(modelBars('whisper-large-v3-turbo')).toEqual({ accuracy: 3, speed: 1 });
  });

  it('names a model in the transcribe window with what choosing it means', () => {
    const s = state('gigaam-v3-e2e-rnnt', ['gigaam-v3-e2e-rnnt']);
    expect(modelChoiceLabel(s, 'gigaam-v3-e2e-rnnt')).toBe('GigaAM v3');
    expect(modelChoiceLabel(s, 't-one')).toBe('T-one — скачается, 464 МБ');
    expect(modelChoiceLabel(s, 'canary-180m-flash')).toBe('Canary 180M Flash — только английский — скачается, 464 МБ');
  });

  it('shows the downloaded bytes', () => {
    expect(downloadText(120 * MB, 464 * MB)).toBe('Скачиваем — 120 из 464 МБ');
    expect(downloadText(0, 0)).toBe('Скачиваем…');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/model-catalog.test.ts`
Ожидается: FAIL — нет модуля `./model-catalog`; сквозной тест не находит группу «Выбрана».

- [ ] **Step 3: Код**

**Создать `src/renderer/main/ModelCard.tsx`:**

```tsx
import { asrModel, DEFAULT_ASR_MODEL, type AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { downloadText, modelBars, modelState } from './model-catalog';
import { percent } from './transcription-format';

/** Пять делений: «точность» или «скорость». */
function Pips({ label, value }: { label: string; value: number }) {
  return (
    <div className="pips-row">
      <span>{label}</span>
      <span className="pips" role="meter" aria-label={label} aria-valuemin={1} aria-valuemax={5} aria-valuenow={value}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= value ? 'on' : undefined} />
        ))}
      </span>
    </div>
  );
}

export interface ModelCardActions {
  onSelect(id: AsrModelId): void;
  onDownload(id: AsrModelId): void;
  onCancel(id: AsrModelId): void;
  onDelete(id: ModelGroupId): void;
}

/** Карточка модели в каталоге: название, автор, описание, полоски, языки, размер и действия по состоянию. */
export function ModelCard({ id, state, actions }: { id: AsrModelId; state: ModelsState; actions: ModelCardActions }) {
  const info = asrModel(id);
  const { installed, sizeBytes } = modelState(state, id);
  const selected = state.selected === id;
  const download = state.download?.id === id ? state.download : null;
  const error = state.downloadError?.id === id ? state.downloadError.message : null;
  const bars = modelBars(id);
  const otherDownload = state.download !== null && !download;

  return (
    <article className={selected ? 'mcard on' : 'mcard'} aria-label={info.title}>
      <div className="mcard-top">
        <div className="mcard-name">
          <b>{info.title}</b>
          <span className="by">{info.author}</span>
          {id === DEFAULT_ASR_MODEL && <span className="tag">Рекомендуется</span>}
        </div>
        <div className="mcard-bars">
          <Pips label="точность" value={bars.accuracy} />
          <Pips label="скорость" value={bars.speed} />
        </div>
      </div>
      <p className="mcard-desc">{info.description}</p>
      {info.group === 'en' && <p className="mcard-warn">Только английский — русская речь распознаётся неверно.</p>}
      {download && (
        <div className="mcard-progress">
          <span role="status">{downloadText(download.done, download.total)}</span>
          <span
            className="prog"
            role="progressbar"
            aria-label={`Скачивание: ${info.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent(download.total > 0 ? download.done / download.total : 0)}
          >
            <i style={{ width: `${percent(download.total > 0 ? download.done / download.total : 0)}%` }} />
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <div className="mcard-foot">
        <span>{info.languages}</span>
        <span>{installed ? `скачана · ${formatMegabytes(sizeBytes)}` : formatMegabytes(sizeBytes)}</span>
        <div className="mcard-acts">
          {download ? (
            <button type="button" className="btn" onClick={() => actions.onCancel(id)}>
              Отменить
            </button>
          ) : (
            <>
              {!installed && (
                <button
                  type="button"
                  className="btn"
                  disabled={otherDownload}
                  aria-label={`Скачать: ${info.title}`}
                  onClick={() => actions.onDownload(id)}
                >
                  {error ? 'Повторить' : 'Скачать'}
                </button>
              )}
              {installed && !selected && (
                <button type="button" className="btn" aria-label={`Выбрать: ${info.title}`} onClick={() => actions.onSelect(id)}>
                  Выбрать
                </button>
              )}
              {installed && (
                <button
                  type="button"
                  className="lnk"
                  disabled={state.busy || state.download !== null}
                  aria-label={`Удалить: ${info.title}`}
                  onClick={() => actions.onDelete(id)}
                >
                  Удалить
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {selected && !installed && !download && <small className="mcard-note">Скачается при первой расшифровке.</small>}
    </article>
  );
}
```

**Заменить всё содержимое `src/renderer/main/TranscriptionSettings.tsx` на:**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { catalogSections } from './model-catalog';
import { ModelCard, type ModelCardActions } from './ModelCard';

/** Настройки → «Расшифровка»: каталог моделей (решения Плана 7, §2) и общие модели голосов. */
export function TranscriptionSettings() {
  const [models, setModels] = useState<ModelsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Запросы могут наложиться и ответить не по порядку — показываем только ответ на последний.
  const latestRequest = useRef(0);

  useEffect(() => {
    const load = () => {
      const request = ++latestRequest.current;
      return window.textmeet
        .getModels()
        .then((state) => {
          if (request === latestRequest.current) setModels(state);
        })
        .catch((err: unknown) => {
          if (request === latestRequest.current) setError(errorText(err));
        });
    };
    void load();
    // Скачивание из каталога продвинулось или закончилось — перечитать.
    const unsubscribeModels = window.textmeet.onModelsChanged(() => void load());
    // Расшифровка началась или закончилась (и модели могли скачаться) — перечитать.
    let busy: boolean | null = null;
    const unsubscribeProgress = window.textmeet.onTranscriptionProgress((list) => {
      const nowBusy = list.length > 0;
      if (nowBusy !== busy) void load();
      busy = nowBusy;
    });
    return () => {
      // Ответы после закрытия настроек не нужны.
      latestRequest.current += 1;
      unsubscribeModels();
      unsubscribeProgress();
    };
  }, []);

  /** Действие с ответом-состоянием; его ошибку показываем всегда — это ответ на нажатие. */
  const run = async (action: () => Promise<ModelsState>) => {
    const request = ++latestRequest.current;
    try {
      const state = await action();
      setError(null);
      if (request === latestRequest.current) setModels(state);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const actions: ModelCardActions = {
    onSelect: (id: AsrModelId) => void run(() => window.textmeet.selectModel(id)),
    onDownload: (id: AsrModelId) => void run(() => window.textmeet.downloadModel(id)),
    onCancel: (id: AsrModelId) => void run(() => window.textmeet.cancelModelDownload(id)),
    onDelete: (id: ModelGroupId) => void run(() => window.textmeet.deleteModels(id)),
  };

  const sections = models && catalogSections(models);
  const group = (title: string, ids: AsrModelId[]) =>
    models &&
    ids.length > 0 && (
      <div className="mgroup" role="group" aria-label={title}>
        <h3>{title}</h3>
        {ids.map((id) => (
          <ModelCard key={id} id={id} state={models} actions={actions} />
        ))}
      </div>
    );

  return (
    <section className="sec">
      <h2>Расшифровка</h2>
      <div className="fld">
        <div className="lb">Модель</div>
        <div className="ctl">
          {error && (
            <p role="alert" className="err">
              {error}
            </p>
          )}
          {models && sections && (
            <div className="catalog">
              {group('Выбрана', [sections.selected])}
              {group('Скачанные', sections.downloaded)}
              {group('Понимают русский', sections.russian)}
              {group('Только английский', sections.english)}
            </div>
          )}
          <small>
            {models?.busy
              ? 'Пока идёт расшифровка, модели удалить нельзя.'
              : 'Скачанные модели работают без интернета. Удалённую модель можно скачать снова.'}
          </small>
        </div>
      </div>
      {models?.voices.installed && (
        <div className="fld">
          <div className="lb">Общие модели</div>
          <div className="ctl">
            <div className="mlist" role="list" aria-label="Общие модели">
              <div role="listitem">
                Разделение по голосам и поиск речи
                <span>{formatMegabytes(models.voices.sizeBytes)}</span>
                <button
                  type="button"
                  className="lnk"
                  disabled={models.busy || models.download !== null}
                  aria-label="Удалить: Разделение по голосам и поиск речи"
                  onClick={() => actions.onDelete('voices')}
                >
                  Удалить
                </button>
              </div>
            </div>
            <small>Нужны любой модели расшифровки; удалённые скачаются заново при следующей расшифровке.</small>
          </div>
        </div>
      )}
    </section>
  );
}
```

**Создать `src/renderer/main/model-catalog.ts`:**

```ts
// Каталог моделей в настройках (решения Плана 7, §2): разделы карточек и подписи. Чистые функции — проверяются
// модульными тестами.
import { ASR_MODELS, asrModel, speedLevel, type AsrModelId, type AsrModelInfo } from '../../shared/asr-models';
import { formatDownloaded, formatMegabytes } from '../../shared/format';
import type { ModelGroupState, ModelsState } from '../../shared/transcription';

export interface CatalogSections {
  selected: AsrModelId;
  /** Скачанные, кроме выбранной. */
  downloaded: AsrModelId[];
  /** Не скачанные, понимают русский. */
  russian: AsrModelId[];
  /** Не скачанные, только английский. */
  english: AsrModelId[];
}

/** Раскладка карточек: выбранная сверху, затем скачанные, затем доступные для загрузки по группам. */
export function catalogSections(state: ModelsState): CatalogSections {
  const installed = new Set(state.models.filter((m) => m.installed).map((m) => m.id));
  const rest = ASR_MODELS.filter((m) => m.id !== state.selected);
  const available = (group: AsrModelInfo['group']): AsrModelId[] =>
    rest.filter((m) => m.group === group && !installed.has(m.id)).map((m) => m.id);
  return {
    selected: state.selected,
    downloaded: rest.filter((m) => installed.has(m.id)).map((m) => m.id),
    russian: available('ru'),
    english: available('en'),
  };
}

export const modelState = (state: ModelsState, id: AsrModelId): ModelGroupState =>
  state.models.find((m) => m.id === id) ?? { sizeBytes: 0, installed: false };

/** Полоски карточки: точность и скорость, 1–5. */
export function modelBars(id: AsrModelId): { accuracy: number; speed: number } {
  const info = asrModel(id);
  return { accuracy: info.accuracy, speed: speedLevel(info.rtf) };
}

/** Строка модели в окне «Расшифровать»: название и что будет, если её выбрать. */
export function modelChoiceLabel(state: ModelsState, id: AsrModelId): string {
  const info = asrModel(id);
  const { installed, sizeBytes } = modelState(state, id);
  const parts = [info.title];
  if (info.group === 'en') parts.push('только английский');
  if (!installed) parts.push(`скачается, ${formatMegabytes(sizeBytes)}`);
  return parts.join(' — ');
}

/** Подпись скачивания в карточке. */
export const downloadText = (done: number, total: number): string =>
  total > 0 ? `Скачиваем — ${formatDownloaded(done, total)}` : 'Скачиваем…';
```

**В `src/renderer/main/styles.css` заменить:**

```css
  margin-left: auto;
}

/* ---- Настройки → Расшифровка ---- */
.opts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.opt {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  text-align: left;
}

.opt.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--muted);
  flex: none;
  margin-top: 2px;
  position: relative;
}

.opt.on .radio {
  border-color: var(--accent);
}

.opt.on .radio i {
  position: absolute;
  left: 3px;
  top: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}

.opt-text {
  flex: 1;
  min-width: 0;
}

.opt b {
  display: block;
  font-weight: 600;
}

.opt small {
  display: block;
  margin-top: 2px;
}

.opt .side-note {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.mlist {
```

**на:**

```css
  margin-left: auto;
}

/* ---- Настройки → Расшифровка: каталог моделей (решения Плана 7, §2) ---- */
.catalog {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

.mgroup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mgroup h3 {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.mcard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out;
}

.mcard:hover {
  border-color: var(--muted);
}

/* Выбранная модель — чернильная рамка, как у главных кнопок. */
.mcard.on {
  border-color: var(--btn);
  box-shadow: 0 0 0 1px var(--btn), 0 6px 18px rgba(38, 34, 27, 0.08);
}

.mcard-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.mcard-name {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  flex: 1;
  min-width: 0;
}

.mcard-name b {
  font-family: var(--f-text);
  font-size: 17px;
  font-weight: 600;
}

.mcard-name .by {
  color: var(--muted);
  font-size: 12.5px;
}

.tag {
  align-self: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--now);
  font-size: 11.5px;
  font-weight: 600;
}

.mcard-bars {
  display: grid;
  gap: 4px;
  flex: none;
}

.pips-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 11.5px;
  color: var(--muted);
}

.pips {
  display: inline-flex;
  gap: 3px;
}

.pips i {
  width: 12px;
  height: 5px;
  border-radius: 2px;
  background: var(--meter-off);
}

.pips i.on {
  background: var(--accent);
}

.mcard-desc,
.mcard-warn {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}

.mcard-warn {
  color: var(--warn);
}

.mcard-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.mcard-progress .prog {
  flex: 1;
}

.mcard-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
  padding-top: 9px;
  border-top: 1px dashed var(--line);
  font-size: 12.5px;
  color: var(--muted);
}

.mcard-acts {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.mcard-acts .btn {
  height: 30px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.mcard-note {
  color: var(--muted);
  font-size: 12px;
}

/* Окно «Расшифровать»: выбор модели. */
.dlg-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dlg-field .selw select {
  min-width: 0;
  width: 100%;
}

.dlg-field .selw {
  display: flex;
}

.mlist {
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  673 passed (673)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `27 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: catalog of transcription models in the settings"
```

### Task 10: Модель в окне «Расшифровать» и подпись во встрече

**Files:**
- Modify: `e2e/models.spec.ts`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/TranscribeDialog.tsx`

Окно «Расшифровать» / «Расшифровать заново» — выпадающий список всех моделей каталога (нескачанные —
«скачается, N МБ», английские — «только английский»), по умолчанию — модель из настроек; настройка не меняется.
Во встрече в строке под заголовком — «Текст: <модель>». «Повторить» после ошибки — той же моделью, что не справилась.

- [ ] **Step 1: Тесты**

**В `e2e/models.spec.ts` заменить:**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });
```

**на:**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, pollMeetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });
```

**В `e2e/models.spec.ts` заменить:**

```ts
  await expect.poll(async () => (await settingsFile(userDataDir)).asrModel).toBe('gigaam-v3-e2e-rnnt');
  await expect(russian.getByRole('article', { name: 'T-one' })).toBeVisible();
});
```

**на:**

```ts
  await expect.poll(async () => (await settingsFile(userDataDir)).asrModel).toBe('gigaam-v3-e2e-rnnt');
  await expect(russian.getByRole('article', { name: 'T-one' })).toBeVisible();
});

const ID = '2026-09-25_1430_a1b2c3';

test('a meeting is transcribed with the model chosen in the window and shows it', async () => {
  launched = await launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          durationSec: 3,
          tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
        }),
        audio: { 'mic.webm': 2 },
      },
    ],
  });
  const { page, libraryDir } = launched;
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Расшифровать' });
  const select = dialog.getByRole('combobox', { name: 'Модель расшифровки' });
  await expect(select).toHaveValue('gigaam-v3-e2e-rnnt');
  await expect(select.locator('option[value="canary-180m-flash"]')).toHaveText(/только английский — скачается, \d+ МБ/);
  await select.selectOption('t-one');
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  await expect(page.getByLabel('Текст встречи')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('main', { name: 'Встреча' })).toContainText('Текст: T-one');
  await expect.poll(async () => (await pollMeetingJson(libraryDir, ID))?.model).toBe('t-one');
  const transcript = JSON.parse(await readFile(join(libraryDir, ID, 'transcript.json'), 'utf8')) as Record<string, unknown>;
  expect(transcript).toMatchObject({ model: 't-one', modelTitle: 'T-one' });
});
```

- [ ] **Step 2: Тесты падают**

Сквозные тесты новой части падают до кода (сквозной тест не находит список «Модель расшифровки» и подпись «Текст: T-one») — проверяются после Step 4.

- [ ] **Step 3: Код**

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useState } from 'react';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
```

**на:**

```tsx
import { useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const load = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  const hasAudio = meeting.tracks.length > 0;
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  const retry = () =>
    window.textmeet
      .transcribe({ meetingId: meeting.id, participantsHint: meeting.participantsHint, model: null })
      .catch((err: unknown) => onError(errorText(err)));

  return (
```

**на:**

```tsx
  const load = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
  const hasAudio = meeting.tracks.length > 0;
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
      .transcribe({
        meetingId: meeting.id,
        participantsHint: meeting.participantsHint,
        model: isAsrModelId(meeting.model) ? meeting.model : null,
      })
      .catch((err: unknown) => onError(errorText(err)));

  return (
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';
```

**на:**

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { ASR_MODEL_IDS, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import type { ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { ChevronIcon } from './icons';
import { modelChoiceLabel } from './model-catalog';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: число участников и запуск. */
export function TranscribeDialog({ meetingId, again, replacesText, participantsHint, onClose }: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
```

**на:**

```tsx
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: модель (по умолчанию — из настроек), число участников и запуск. */
export function TranscribeDialog({ meetingId, again, replacesText, participantsHint, onClose }: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [models, setModels] = useState<ModelsState | null>(null);
  /** null — пока не выбрали сами: модель из настроек. */
  const [model, setModel] = useState<AsrModelId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
    return () => opener?.focus();
  }, []);

  const confirm = async () => {
    const n = readChoice(participants);
    if (n === 'invalid') {
```

**на:**

```tsx
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    // Список моделей не пришёл — окно работает и без него: расшифровка пойдёт моделью из настроек.
    window.textmeet
      .getModels()
      .then((state) => {
        if (active) setModels(state);
      })
      .catch((err: unknown) => console.error('TextMeet: список моделей не получен', errorText(err)));
    return () => {
      active = false;
    };
  }, []);

  const confirm = async () => {
    const n = readChoice(participants);
    if (n === 'invalid') {
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n, model: null });
      onClose();
    } catch (err) {
      setError(errorText(err));
```

**на:**

```tsx
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n, model });
      onClose();
    } catch (err) {
      setError(errorText(err));
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
      >
        <h2 id={titleId}>{title}</h2>
        {replacesText && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
```

**на:**

```tsx
      >
        <h2 id={titleId}>{title}</h2>
        {replacesText && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        {models && (
          <div className="dlg-field">
            <div className="q">Модель</div>
            <span className="selw">
              <select
                aria-label="Модель расшифровки"
                value={model ?? models.selected}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (isAsrModelId(next)) setModel(next);
                }}
              >
                {ASR_MODEL_IDS.map((id) => (
                  <option key={id} value={id}>
                    {modelChoiceLabel(models, id)}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </span>
          </div>
        )}
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  673 passed (673)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `28 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: choose the model in the transcribe window and show it in the meeting"
```

### Task 11: Проверка всех моделей на настоящих файлах на трёх ОС

**Files:**
- Create: `.github/workflows/models-check.yml`, `src/main/transcription/catalog.catalog-test.ts`, `vitest.catalog.config.ts`
- Modify: `package.json`, `vitest.config.ts`

`npm run test:catalog` — каждая модель каталога распознаёт эталон (русские — стихи из примера GigaAM, английские —
английский пример): узнано не меньше 70 % ключевых слов (точная фраза не годится — модели и даже одна модель на разных
ОС ошибаются в отдельных буквах). Первый прогон скачивает ~4,5 ГБ. В `ci` и `npm run test:models` не входит; на всех
трёх ОС его гоняет workflow `models-check` — по кнопке или отправкой ветки `models-check/…` (так проверяется ветка, где
этого файла ещё нет на `main`).

- [ ] **Step 1: Тесты**

**Создать `src/main/transcription/catalog.catalog-test.ts`:**

```ts
// Каждая модель каталога на настоящих файлах (решения Плана 7, §3: «модель попадает в каталог, только если работает»).
// npm run test:catalog — первый прогон скачивает все модели (~4,5 ГБ); в CI — workflow models-check на Windows, Mac
// и Linux. Русские модели слушают эталон GigaAM (стихи Пушкина), английские — английский пример.
import { describe, expect, it } from 'vitest';
import { ASR_MODELS } from '../../shared/asr-models';
import { ensureModels, fixture, MODELS_ROOT } from '../../test-support/model-fixtures';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { decodeToMono16k, SAMPLE_RATE } from './decode';
import { sherpaEngines } from './sherpa-engines';
import { cleanRecognizedText } from './text-cleanup';

const THREADS = 4;
/**
 * Ключевые слова эталонов. Модели и даже одна модель на разных ОС ошибаются в отдельных буквах («дево с трепетом»
 * на Mac и Linux) — проверяется, что узнано большинство слов, а не точная фраза.
 */
const KEYWORDS = {
  ru: ['требуя', 'похвал', 'счастлив', 'сладкой', 'трепетом', 'любви', 'посмотрит', 'украдкой', 'грешные', 'зеленый'],
  en: ['ask', 'not', 'what', 'your', 'country', 'can', 'do', 'for', 'you'],
};
const MIN_SHARE = 0.7;

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replaceAll('ё', 'е')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );

describe('every model of the catalog recognizes speech', () => {
  for (const model of ASR_MODELS) {
    it(`${model.title}`, async () => {
      await ensureModels([model.id, 'voices']);
      const file = await fixture(model.group === 'ru' ? 'gigaamExample' : 'englishExample');
      const samples = await decodeToMono16k(resolveFfmpegPath(), file, 12);
      // Как в конвейере: участки речи режет детектор, каждый распознаётся отдельно (фильтр — у тех, кому он нужен).
      const engines = sherpaEngines(MODELS_ROOT, model.id);
      const recognizer = engines.recognizer(THREADS);
      const clean = model.hallucinates ? cleanRecognizedText : (text: string) => text.trim();
      const speech = engines.detector().detect(samples);
      expect(speech.length).toBeGreaterThan(0);
      const text = speech
        .map((i) => clean(recognizer.recognize(samples.slice(Math.floor(i.start * SAMPLE_RATE), Math.ceil(i.end * SAMPLE_RATE)))))
        .join(' ');
      const heard = words(text);
      const keywords = KEYWORDS[model.group];
      const found = keywords.filter((word) => heard.has(word));
      expect(found.length / keywords.length, `${model.title}: «${text}»`).toBeGreaterThanOrEqual(MIN_SHARE);
    });
  }
});
```

- [ ] **Step 2: Код**

**Создать `.github/workflows/models-check.yml`:**

```yaml
name: models-check

# Каждая модель каталога на настоящих файлах (npm run test:catalog, ~4,5 ГБ моделей) на всех трёх ОС: модель
# остаётся в каталоге, только если работает и на Windows, и на Mac (решения Плана 7, §3). Запуск — по кнопке
# или отправкой ветки models-check/… (так проверяют ветку, где этого файла ещё нет на main).
on:
  workflow_dispatch:
  push:
    branches: ['models-check/**']

permissions:
  contents: read

jobs:
  models:
    # Скачивание ~4,5 ГБ и восемь моделей подряд; macOS считается с множителем — зависший запуск не должен съесть минуты.
    timeout-minutes: 45
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    env:
      TEXTMEET_MODELS_DIR: ${{ github.workspace }}/../textmeet-models
      TEXTMEET_TEST_FIXTURES_DIR: ${{ github.workspace }}/../textmeet-test-fixtures
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run test:catalog
```

**В `package.json` заменить:**

```json
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:models": "vitest run --config vitest.models.config.ts",
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && electron-builder --win --publish never",
    "dist:mac": "npm run build && electron-builder --mac dir --arm64 --publish never",
```

**на:**

```json
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:models": "vitest run --config vitest.models.config.ts",
    "test:catalog": "vitest run --config vitest.catalog.config.ts",
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && electron-builder --win --publish never",
    "dist:mac": "npm run build && electron-builder --mac dir --arm64 --publish never",
```

**Создать `vitest.catalog.config.ts`:**

```ts
import { defineConfig } from 'vitest/config';

// Все модели каталога на настоящих файлах (npm run test:catalog): первый прогон скачивает ~4,5 ГБ моделей.
// В обычные тесты и в npm run test:models не входит — CI гоняет его отдельным workflow models-check.
export default defineConfig({
  test: {
    include: ['src/**/*.catalog-test.ts'],
    environment: 'node',
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
    // По одной модели за раз: несколько больших моделей в памяти разом не нужны.
    fileParallelism: false,
  },
});
```

**В `vitest.config.ts` заменить:**

```ts
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        'src/test-support/**',
        'src/shared/ipc.ts',
        'src/preload/**',
```

**на:**

```ts
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        '**/*.catalog-test.ts',
        'src/test-support/**',
        'src/shared/ipc.ts',
        'src/preload/**',
```

- [ ] **Step 3: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  673 passed (673)`.
- [ ] **Все модели на настоящих файлах:** `npm run test:catalog` (долго при первом прогоне — скачивание ~4,5 ГБ). Ожидается: `Tests  8 passed (8)`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: check every catalog model on real files on all three systems"
```

### Task 12: Сборка и проверка моделей на GitHub (Windows и Mac)

Отправка ветки — действие наружу: **спросить пользователя перед `git push`**.

- [ ] **Step 1: Отправить ветку** (после «да» пользователя)

```bash
git push -u origin plan-7-models
```

- [ ] **Step 2: Сборка** — `build.yml` есть на `main`, запускается на ветке:

```bash
gh workflow run build.yml --ref plan-7-models
gh run list -w build -L 1
gh run watch <id> --exit-status
```

Ожидается: оба задания (`windows-latest`, `macos-latest`) зелёные — модульные тесты, сквозные, проверка собранной программы.

- [ ] **Step 3: Все модели на трёх ОС.** `models-check.yml` ещё не на `main`, поэтому кнопкой его не запустить — он
запускается отправкой той же ветки под именем `models-check/…`, затем эта ветка удаляется:

```bash
git push origin plan-7-models:refs/heads/models-check/plan-7
gh run list -w models-check -L 1
gh run watch <id> --exit-status
git push origin --delete models-check/plan-7
```

Ожидается: `ubuntu-latest`, `windows-latest`, `macos-latest` — `Tests  8 passed (8)`.

### Task 13: Ручная проверка на Windows и Mac (контрольная точка с пользователем)

Собранные программы — артефакты запуска `build.yml` из Task 12 (`TextMeet-windows`, `TextMeet-mac`). Дать пользователю
простой список и дождаться ответа. На каждой машине:

1. Настройки → «Расшифровка»: видны карточки «Выбрана» (GigaAM), «Понимают русский», «Только английский».
2. Скачать одну небольшую модель (T-one) — ход в карточке, затем она в «Скачанных»; «Выбрать».
3. Начать скачивание большой модели (Qwen3) и нажать «Отменить» — карточка вернулась к «Скачать».
4. Записать короткую встречу — после окна «Запись остановлена» текст сделан выбранной моделью, под заголовком
   «Текст: T-one».
5. «Расшифровать заново» этой встречи, в окне выбрать GigaAM — текст заменился, подпись «Текст: GigaAM v3».
6. Удалить выбранную модель — выбранной стала GigaAM.
7. Выйти из программы во время скачивания модели и запустить снова — программа работает, недокачанное докачивается
   при следующем «Скачать».

Записать ответы (что прошло, что нет) — они нужны в Task 14.

### Task 14: Документы, память и слияние

- [ ] **Step 1: `docs/superpowers/plan-7-checks.md`** — как `plan-3-checks.md`: что проверено (Task 13 по пунктам на
  Windows и Mac, ссылки на запуски из Task 12), что исправлено по ревью сверх первой версии прототипа (отмена
  скачивания, ждущего очереди; отменяемое скачивание задачи очереди; «Готовим модель»; фильтр только у Whisper и Qwen3;
  ранняя загрузка модели; старая ошибка на скачанной карточке; закреплённые адреса GigaAM и pyannote) и «Отложено»:
  видеокарта; задача очереди ждёт идущего скачивания из каталога (в это время — «Готовим модель …»); `FakeModelStore`
  не повторяет отказ `remove` во время `ensure`; Parakeet v3 иногда пишет короткие реплики латиницей; Whisper на
  процессоре — около получаса на час записи.
- [ ] **Step 2: Спецификация** — правки из §8 решений Плана 7 (§3.3, §3.6, §5.1, §5.2, §5.4, §5.5, §6);
  **дорожная карта** — строка Плана 7: «каталог моделей расшифровки (на процессоре)», статус «выполнен» со ссылками на
  решения, план и проверки; новая строка «Ускорение на видеокарте» — «потом».
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: record plan 7 checks and mark plan 7 done"
```

- [ ] **Step 4: Слияние** (спросить пользователя перед `git push`)

```bash
git checkout main
git merge --no-ff plan-7-models -m "Merge plan 7: catalog of transcription models"
npm ci
npm run typecheck
npm test
git push origin main
gh run list -w ci -L 1
```

Ожидается: `ci` на `main` зелёный (модульные тесты и `test:models`; кеш моделей скачается заново один раз).

- [ ] **Step 5: Память** — в `textmeet-project.md`: План 7 выполнен, что дальше по дорожной карте (Планы 4–6, 8).
