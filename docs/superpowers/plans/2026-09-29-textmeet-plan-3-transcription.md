# TextMeet — План 3: расшифровка

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальная расшифровка встреч в TextMeet: модели GigaAM v3 e2e rnnt + разделение по голосам (pyannote + eres2net) + детектор речи (Silero), скачивание моделей с докачкой и проверкой SHA-256, отдельный процесс расшифровки с очередью, прогрессом, сторожем и продолжением после перезапуска, автоматическое определение числа собеседников, текст встречи во встрече, «Расшифровать» / «Расшифровать заново» / «Повторить», раздел настроек «Расшифровка».

**Architecture:** Main держит очередь (`src/main/transcription/queue.ts`, без Electron — процесс внедряется) и менеджер моделей (`src/main/models/`). Тяжёлая работа — в процессе `utilityProcess` (`src/main/transcription/worker.ts`, второй вход сборки main): ffmpeg → 16 кГц моно float32 → конвейер (`pipeline.ts`) поверх тонких интерфейсов движков (`engines.ts`): настоящие — `sherpa-engines.ts` (sherpa-onnx-node), поддельные — `fake-engines.ts` (для сквозных тестов). Вся логика ходов, наложений, промежутков, группировки голосов и прогресса — чистые функции с модульными тестами; нативная часть проверяется интеграционными тестами на настоящих моделях (`npm run test:models`). Окно получает прогресс событиями и читает `transcript.json` по запросу.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0, React 19.3, TypeScript 7.0.2, zod 4.6.5, sherpa-onnx-node 1.13.8 (GigaAM v3 e2e rnnt int8, pyannote segmentation 3.0, 3D-Speaker eres2net, Silero VAD), ffmpeg-static 5.3.0, Vitest 5.0.2, Playwright 1.63.0, electron-builder 26.15.3, GitHub Actions (`actions/cache@v5`).

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.3, §5.2, §5.4, §5.5, §5.6, §6, §7. **Решения Плана 3:** [2026-09-29-textmeet-plan-3-design.md](../specs/2026-09-29-textmeet-plan-3-design.md). **Макет:** [Макет TextMeet](https://claude.ai/artifact/Urmc3atvSFifUpDyBzjeR6) (лист 1 — текст встречи, лист 6 — настройки). Итоги спайка: [spike-results.md](../spike-results.md); проверки Плана 2: [plan-2-checks.md](../plan-2-checks.md).

---

## Факты, на которые опирается план (проверены 2026-09-29 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии ветки `plan-3-transcription`: на Windows 11 (Ryzen 7 3700X) —
544 модульных теста (покрытие 97,7 % строк, 10 прогонов подряд без сбоев), 25 сквозных (не меньше 3 полных прогонов подряд без сбоев после последних правок), 4 теста на
настоящих моделях, сборка `win-unpacked` и расшифровка через собранную программу; в GitHub Actions (запуски
[36558486468](https://github.com/wiiProfaker/TextMeet/actions/runs/36558486468) и
[36561069320](https://github.com/wiiProfaker/TextMeet/actions/runs/36561069320) временной ветки) — то же на
`windows-latest` и `macos-latest` (включая проверку собранной программы) и модульные тесты + тесты на настоящих моделях
на `ubuntu-latest`. Ревью кода прототипа нашло 12 недочётов (две гонки в очереди, наложения на цепочках вложенных
ходов, медленная группировка на длинных встречах, сторож для записи без длительности и др.) — все исправлены в коде
этого плана и закрыты тестами (подробности — в Task 6, 7, 13). Затем план проигран по задачам на чистой копии: после
каждой задачи проверка типов и модульные тесты проходят, итог совпал с прототипом файл в файл.

- **Живая проверка:** запись пользователя из Плана 2 (43 с: голос в микрофон + ролик YouTube) расшифрована собранной
  программой с настоящими моделями: 7 реплик «Я» / «Спикер 1», текст разборчивый; без указания числа участников
  найден ровно 1 собеседник; вся работа — 4–9 с, включая загрузку моделей.
- **sherpa-onnx-node 1.13.8** ставит нативную часть через `optionalDependencies` (`sherpa-onnx-win-x64`,
  `sherpa-onnx-darwin-arm64`, `sherpa-onnx-linux-x64`, …): `npm ci` ставит только пакет своей ОС, `package-lock.json`
  содержит все. В пакете — `sherpa-onnx.node` и рядом `onnxruntime.dll` / `.dylib`.
- **Собранная программа:** `asarUnpack: node_modules/sherpa-onnx-*/**` — достаточно: Electron сам берёт `.node` из
  `app.asar.unpacked`, а зависимые `.dll`/`.dylib` грузятся из той же папки (проверено на `win-unpacked` и в
  `macos-latest`, где `build.yml` уже подписывает ad-hoc все `*.node` и `*.dylib`).
- **Процесс расшифровки:** второй вход сборки main (`rollupOptions.input`) → `out/main/transcription-worker.js` рядом с
  `index.js`; `utilityProcess.fork(join(__dirname, 'transcription-worker.js'))`; `sherpa-onnx-node` в сборке main
  остаётся внешним `require`. Сообщения, отправленные до события `spawn`, копятся в `worker-host.ts`.
- **`enableExternalBuffer = false`** (итоги спайка): `vad.front(false)`, `extractor.compute(stream, false)`; в
  `acceptWaveform` уходят копии (`slice`), не `subarray`.
- **`OfflineSpeakerDiarization.process` синхронный** и прогресса не сообщает; `setConfig({ clustering })` меняет число
  кластеров без перезагрузки моделей. Поэтому процесс сообщает оценку длительности, а main двигает полоску по времени.
- **Число собеседников без подсказки:** встроенный порог библиотеки на записи двоих давал 72 / 40 / 21 / 6 / 1
  (порог 0,5 / 0,7 / 0,9 / 1,1 / 1,3); собственная группировка (`clustering.ts`) — 2, на половинах записи — по 1, на
  открытой записи четырёх человек (`0-four-speakers-zh.wav`) — 4, в том числе через весь конвейер с настоящими моделями.
- **Тексты на китайском** русская GigaAM распознаёт как пустые — реплики с пустым текстом не пишутся. Поэтому тест на
  четырёх человек проверяет разделение с «текстом» вместо распознавания.
- **Суммы моделей** сверены с Hugging Face и GitHub (Task 3); уже скачанные в спайке файлы совпали.
- **`.gitignore`:** строка `models/` прятала от git папку кода `src/main/models` → `/models/` (Task 1).
- **Linux-сборка ffmpeg 7** не отвечает на SIGTERM — уже исправлено на `main` (сторож ffmpeg убивает жёстко).
- **Сквозные тесты:** `TEXTMEET_TEST_ASR=fake` (поддельные движки, модели не нужны) и `TEXTMEET_MODELS_DIR` (своя
  папка моделей); запуск программы в тестах завершается по её процессу, не по имени — установленная TextMeet на этом ПК
  называется так же.
- **Переиспользуемые находки Планов 1–2** в силе: один preload, без `"type": "module"`, `TEXTMEET_USER_DATA` /
  `TEXTMEET_HOME`, главное окно ищется по адресу `…/main/index.html`, тестовый режим записи `TEXTMEET_TEST_MEDIA`.


## Что сознательно не входит в План 3

- Переход по щелчку к месту записи, правка текста, переименование спикеров (чипы «Спикеры» пока без карандаша), поиск,
  удаление встреч — План 4. Отложенное из Плана 2 («Готовим…» у старых встреч с ошибкой, замена окна «Запись
  остановлена» новым) — тоже План 4.
- «Импорт файла» — План 5 (одноголосый путь конвейера уже есть: им расшифровывается запись без звука компьютера).
- Whisper — План 7; в настройках его нет. Защиты от эха (голоса собеседников на дорожке «Я») нет — пользователь
  созванивается в наушниках (спецификация §4).
- Electron fuses — План 8.

## Карта файлов

```
package.json                        # + sherpa-onnx-node 1.13.8, npm run test:models
.gitignore                          # models/ → /models/ (иначе прячется src/main/models)
electron-builder.yml                # + asarUnpack node_modules/sherpa-onnx-*/**
electron.vite.config.ts             # второй вход main: transcription-worker
vitest.config.ts                    # без *.int.test.ts; исключения покрытия для склейки с Electron
vitest.models.config.ts             # тесты на настоящих моделях
tsconfig.node.json                  # + vitest.models.config.ts
.github/workflows/ci.yml            # кеш моделей + npm run test:models
src/
  shared/
    transcript.ts                   # transcript.json: схема, «Я» / «Спикер N»
    transcription.ts                # прогресс, модели, запрос «расшифровать» — для окна и preload
    ipc.ts                          # + каналы расшифровки и моделей, события прогресса и «показать встречу»
  main/
    models/
      registry.ts                   # файлы моделей: адрес, размер, SHA-256; пути для процесса расшифровки
      models-dir.ts                 # папка моделей (%LOCALAPPDATA% / Application Support)
      download.ts                   # скачивание: .part, докачка Range, тайм-аут, повторы, SHA-256
      model-manager.ts              # проверка, скачивание недостающих, удаление, verified.json
    transcription/
      turns.ts, split.ts            # ходы: без наложений, промежутки, склейка, резка ≤ 20 с
      clustering.ts                 # число собеседников по «отпечаткам голоса»
      routing.ts, progress.ts       # путь по дорожкам (§4.1), доля работы, часы для разделения
      decode.ts                     # ffmpeg → Float32Array без тройного расхода памяти
      engines.ts                    # интерфейсы движков
      fake-engines.ts               # поддельные движки (TEXTMEET_TEST_ASR=fake)
      sherpa-onnx-node.d.ts         # типы используемой части sherpa-onnx-node
      sherpa-engines.ts             # настоящие движки
      pipeline.ts                   # конвейер одной встречи
      protocol.ts                   # сообщения main ↔ процесс расшифровки (zod)
      worker.ts                     # процесс расшифровки (utilityProcess)
      worker-host.ts                # запуск процесса из main
      job-input.ts                  # дорожки встречи → вход конвейера
      queue.ts                      # очередь в main: статусы, прогресс, сторож, отмена, продолжение
    library/transcript-store.ts     # чтение и запись transcript.json
    recording/controller.ts         # окно «Запись остановлена» ставит встречу в очередь
    texts.ts                        # уведомления и причины ошибок расшифровки
    notifications.ts                # щелчок по уведомлению может показать встречу
    ipc.ts, index.ts                # обработчики и склейка
  preload/index.ts                  # + методы и события расшифровки
  renderer/main/
    transcription-format.ts         # время реплики, этапы, цвета спикеров
    participants.ts, ParticipantsPicker.tsx  # вопрос о числе участников (общий для двух окон)
    focus.ts                        # фокус внутри окна-диалога
    StopDialog.tsx                  # на общем ParticipantsPicker
    TranscribeDialog.tsx            # «Расшифровать» / «Расшифровать заново»
    TranscriptView.tsx              # текст встречи (лист 1 макета)
    MeetingPane.tsx                 # текст, ход расшифровки, кнопки, ошибка + «Повторить»
    MeetingList.tsx, format.ts      # «расшифровка 62%», «ошибка расшифровки»
    TranscriptionSettings.tsx       # Настройки → «Расшифровка»
    hooks.ts, App.tsx, SettingsPane.tsx, styles.css
  test-support/model-fixtures.ts    # модели и открытые записи для npm run test:models
e2e/
  helpers.ts                        # TEXTMEET_TEST_ASR=fake, своя папка моделей, готовые transcript.json
  transcription.spec.ts             # запись → текст, «Расшифровать», ошибка → «Повторить», перезапуск, заново, настройки
  recording.spec.ts, packaged.spec.ts
```

Файлы встречи: к `meeting.json` и `audio/` добавляется `transcript.json`. Модели: `%LOCALAPPDATA%\TextMeet\models`
(Windows) и `~/Library/Application Support/TextMeet/models` (Mac) + `verified.json` (какие файлы уже проверены по SHA-256).

**Порядок задач выбран так, чтобы после каждой проходили `npm run typecheck` и `npm test`.** `npm run build` —
с Task 11 (там появляется второй вход сборки). Сквозные тесты обновляются в Task 16; до неё их не запускать.

---

### Task 1: Пакеты и инструменты

**Files:**
- Modify: `package.json`, `package-lock.json` (через npm), `.gitignore`, `electron-builder.yml`, `vitest.config.ts`, `tsconfig.node.json`
- Create: `vitest.models.config.ts`

- [ ] **Step 1: sherpa-onnx-node**

**Выполнить (установка):**

```bash
npm install --save-exact sherpa-onnx-node@1.13.8
```

Expected: в `package.json` → `dependencies` появилась строка `"sherpa-onnx-node": "1.13.8"`; в `package-lock.json` —
пакеты под все ОС (`sherpa-onnx-win-x64`, `sherpa-onnx-darwin-arm64`, `sherpa-onnx-linux-x64` …), а в `node_modules` —
только пакет своей ОС.

- [ ] **Step 2: Команда тестов на настоящих моделях**

**В `package.json` заменить:**

```json
    "test:coverage": "vitest run --coverage",
    "e2e": "npm run build && playwright test",
```

**на:**

```json
    "test:coverage": "vitest run --coverage",
    "test:models": "vitest run --config vitest.models.config.ts",
    "e2e": "npm run build && playwright test",
```

- [ ] **Step 3: `.gitignore` не должен прятать папку кода `src/main/models`**

Строка `models/` без косой черты в начале прячет **любую** папку `models`, в том числе будущую `src/main/models`
(прототип на этом споткнулся: `git status` её не видел). Правило нужно только для корня.

**В `.gitignore` заменить:**

```gitignore
# Модели и записи никогда не попадают в репозиторий
models/
samples/
*.wav
```

**на:**

```gitignore
# Модели и записи никогда не попадают в репозиторий
/models/
/samples/
*.wav
```

- [ ] **Step 4: Нативная библиотека — из распакованной копии**

**Заменить целиком `electron-builder.yml`:**

```yaml
appId: dev.textmeet.app
productName: TextMeet
directories:
  output: release
files:
  - out/**
  - package.json
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: true
  perMachine: false
  artifactName: TextMeet-Setup-${version}.exe
mac:
  target: dir
  identity: null
  category: public.app-category.productivity
  extendInfo:
    NSMicrophoneUsageDescription: TextMeet записывает ваш микрофон во время встречи.
    NSAudioCaptureUsageDescription: TextMeet записывает звук компьютера во время встречи.
# ffmpeg — отдельная программа, sherpa-onnx — нативная библиотека (.node и .dll/.dylib рядом):
# запускать и загружать их можно только из распакованной копии, не из app.asar.
asarUnpack:
  - node_modules/ffmpeg-static/**
  - node_modules/sherpa-onnx-*/**
```

- [ ] **Step 5: Тесты на настоящих моделях — отдельно от обычных**

**Создать `vitest.models.config.ts`:**

```ts
import { defineConfig } from 'vitest/config';

// Интеграционные тесты на настоящих моделях (npm run test:models): первый прогон скачивает ~360 МБ моделей.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 10 * 60_000,
    hookTimeout: 30 * 60_000,
  },
});
```

**Заменить целиком `vitest.config.ts`:**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Тесты на настоящих моделях — отдельно: npm run test:models (vitest.models.config.ts).
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Считаем все модули src/. Исключения — только склейка с Electron и DOM (её проверяют сквозные
      // тесты в e2e/) и React-компоненты; новый модуль с логикой сюда не добавлять.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        'src/test-support/**',
        'src/shared/ipc.ts',
        'src/preload/**',
        'src/main/index.ts',
        'src/main/ipc.ts',
        'src/main/windows.ts',
        'src/main/tray.ts',
        'src/main/notifications.ts',
        // Процесс расшифровки и нативные движки — сквозные тесты и npm run test:models.
        'src/main/transcription/worker.ts',
        'src/main/transcription/worker-host.ts',
        'src/main/transcription/sherpa-engines.ts',
        'src/main/transcription/sherpa-onnx-node.d.ts',
        'src/main/autostart.ts',
        'src/renderer/env.d.ts',
        'src/renderer/**/*.tsx',
        'src/renderer/main/hooks.ts',
        'src/renderer/main/focus.ts',
        'src/renderer/recorder/recorder.ts',
        'src/renderer/recorder/capture.ts',
        'src/renderer/recorder/levels.ts',
        'src/renderer/recorder/sounds.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

**В `tsconfig.node.json` заменить:**

```json
    "vitest.config.ts",
    "playwright.config.ts"
```

**на:**

```json
    "vitest.config.ts",
    "vitest.models.config.ts",
    "playwright.config.ts"
```

- [ ] **Step 6: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 7: Коммит**

```bash
git add package.json package-lock.json .gitignore electron-builder.yml vitest.config.ts vitest.models.config.ts tsconfig.node.json
git commit -m "chore: add sherpa-onnx-node and a separate run for tests on real models"
```

---

### Task 2: Текст встречи (`transcript.json`) и типы расшифровки

**Files:**
- Create: `src/shared/transcript.ts`, `src/shared/transcript.test.ts`, `src/shared/transcription.ts`,
  `src/main/library/transcript-store.ts`, `src/main/library/transcript-store.test.ts`

- [ ] **Step 1: Тесты**

**Создать `src/shared/transcript.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { otherSpeakerId, speakerLabel, TranscriptSchema } from './transcript';

const valid = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-29T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [{ id: 'seg-1', start: 0.5, end: 2, speakerId: 's1', text: 'Привет.' }],
};

describe('TranscriptSchema', () => {
  it('accepts a transcript and fills «edited»', () => {
    expect(TranscriptSchema.parse(valid).segments[0]?.edited).toBe(false);
  });

  it('keeps fields written by a newer version', () => {
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
    expect(speakerLabel(otherSpeakerId(0))).toBe('Спикер 1');
    expect(speakerLabel('s12')).toBe('Спикер 12');
  });

  it('prefers a name given by the user', () => {
    expect(speakerLabel('s2', { s2: 'Ирина' })).toBe('Ирина');
  });

  it('shows an unknown id as is', () => {
    expect(speakerLabel('x')).toBe('x');
  });
});
```

**Создать `src/main/library/transcript-store.test.ts`:**

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { readTranscript, transcriptPath, writeTranscript } from './transcript-store';

const ID = '2026-09-29_1000_a1b2c3';
const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-29T10:00:00.000Z',
  speakers: [{ id: 'me', kind: 'me' }],
  segments: [{ id: 'seg-1', start: 0, end: 1.5, speakerId: 'me', text: 'Да.', edited: false }],
};

const library = () => {
  const lib = makeTempDir('textmeet-transcript-');
  mkdirSync(join(lib, ID));
  return lib;
};

describe('transcript store', () => {
  it('returns null when the meeting has no transcript yet', async () => {
    expect(await readTranscript(library(), ID)).toBeNull();
  });

  it('writes and reads a transcript back', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    expect(await readTranscript(lib, ID)).toEqual(transcript);
    expect(readFileSync(transcriptPath(lib, ID), 'utf8')).toContain('"model": "gigaam-v3-e2e-rnnt"');
  });

  it('reports a damaged file', async () => {
    const lib = library();
    writeFileSync(transcriptPath(lib, ID), '{"schemaVersion": 2}');
    await expect(readTranscript(lib, ID)).rejects.toThrow('Текст встречи не прочитан');
  });

  it('refuses an invalid transcript', async () => {
    const bad = { ...transcript, segments: [{ ...transcript.segments[0], speakerId: 'бог' }] } as unknown as Transcript;
    await expect(writeTranscript(library(), ID, bad)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

```bash
npx vitest run src/shared/transcript.test.ts src/main/library/transcript-store.test.ts
```

Expected: FAIL — модулей `./transcript` и `./transcript-store` ещё нет.

- [ ] **Step 3: Схема, подписи спикеров, хранилище, типы для окна**

**Создать `src/shared/transcript.ts`:**

```ts
import { z } from 'zod';

/** Спикер: «me» — владелец (дорожка микрофона), «s1», «s2»… — собеседники по порядку первого появления. */
export const SpeakerIdSchema = z.string().regex(/^(me|s[1-9]\d{0,2})$/);

export const TranscriptSegmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Секунды от начала встречи (начала самой ранней дорожки) — то же начало, что у mix.opus. */
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  speakerId: SpeakerIdSchema,
  text: z.string().max(20_000),
  /** Текст правили руками (правка — План 4). */
  edited: z.boolean().default(false),
});

// looseObject: как у meeting.json — поля более новой версии программы не теряются при перезаписи.
export const TranscriptSchema = z.looseObject({
  schemaVersion: z.literal(1),
  model: z.string().min(1),
  createdAt: z.iso.datetime(),
  speakers: z.array(z.object({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) })),
  segments: z.array(TranscriptSegmentSchema),
});

export type SpeakerId = z.infer<typeof SpeakerIdSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

export const ME: SpeakerId = 'me';

/** Номер собеседника → id: 0 → «s1». */
export const otherSpeakerId = (index: number): SpeakerId => `s${index + 1}`;

/** Подпись спикера: имя из meeting.json (переименование — План 4), иначе «Я» / «Спикер N». */
export function speakerLabel(id: string, names: Readonly<Record<string, string>> = {}): string {
  const name = names[id];
  if (name) return name;
  if (id === ME) return 'Я';
  const match = /^s(\d+)$/.exec(id);
  return match ? `Спикер ${match[1]}` : id;
}
```

**Создать `src/shared/transcription.ts`:**

```ts
// Расшифровка: что main сообщает окну. Только типы и константы — файл подключает и preload.

/** Этап расшифровки встречи, как его видит человек. */
export type TranscriptionStage = 'queued' | 'download' | 'prepare' | 'me' | 'diarize' | 'others';

export interface TranscriptionProgress {
  meetingId: string;
  stage: TranscriptionStage;
  /** Доля всей работы по встрече, 0…1 (скачивание моделей не входит — у него свои байты). */
  fraction: number;
  /** Этап «download»: сколько байт моделей скачано из скольких. */
  download: { done: number; total: number } | null;
}

export type ModelGroupId = 'gigaam' | 'voices';

export interface ModelGroupState {
  id: ModelGroupId;
  title: string;
  sizeBytes: number;
  /** Все файлы группы на месте и проверены. */
  installed: boolean;
}

export interface ModelsState {
  groups: ModelGroupState[];
  /** Идёт расшифровка — удалять модели нельзя. */
  busy: boolean;
}

/** «Расшифровать», «Расшифровать заново», «Повторить»: число участников, включая владельца; null — определить самим. */
export interface TranscribeRequest {
  meetingId: string;
  participantsHint: number | null;
}
```

**Создать `src/main/library/transcript-store.ts`:**

```ts
import { join } from 'node:path';
import { TranscriptSchema, type Transcript } from '../../shared/transcript';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { meetingDir } from './library';

export const TRANSCRIPT_FILE = 'transcript.json';

export const transcriptPath = (libraryDir: string, id: string): string =>
  join(meetingDir(libraryDir, id), TRANSCRIPT_FILE);

/** Текст встречи; null — встречу ещё не расшифровывали. Повреждённый файл — ошибка с причиной. */
export async function readTranscript(libraryDir: string, id: string): Promise<Transcript | null> {
  const result = await readJsonFile(transcriptPath(libraryDir, id), TranscriptSchema);
  if (result.ok) return result.value;
  if (result.reason === 'missing') return null;
  throw new Error(`Текст встречи не прочитан: ${result.message}`);
}

export async function writeTranscript(libraryDir: string, id: string, transcript: Transcript): Promise<void> {
  await writeJsonAtomic(transcriptPath(libraryDir, id), TranscriptSchema.parse(transcript));
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/shared/transcript.ts src/shared/transcript.test.ts src/shared/transcription.ts src/main/library/transcript-store.ts src/main/library/transcript-store.test.ts
git commit -m "feat: add the transcript file and transcription types"
```

---

### Task 3: Реестр и папка моделей

**Files:**
- Create: `src/main/models/registry.ts`, `src/main/models/models-dir.ts`, `src/main/models/registry.test.ts`

Размеры и SHA-256 сверены 2026-09-29: GigaAM — LFS oid на Hugging Face (`Smirnov75/GigaAM-v3-sherpa-onnx`), `tokens.txt` —
git-хэш файла на Hugging Face совпал с локальной копией; pyannote — LFS oid (`csukuangfj/sherpa-onnx-pyannote-segmentation-3-0`);
eres2net — LFS oid зеркала `csukuangfj/speaker-embedding-models` (у релиза GitHub суммы нет); Silero — `digest` релиза
`asr-models` на GitHub. Все совпали с файлами, скачанными в спайке.

- [ ] **Step 1: Тест**

**Создать `src/main/models/registry.test.ts`:**

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelsRoot } from './models-dir';
import { groupSize, MODEL_FILES, MODEL_GROUPS, modelFilePath, modelPaths, TOTAL_MODELS_SIZE } from './registry';

describe('model registry', () => {
  it('describes every file with a url, a size and a SHA-256', () => {
    for (const file of MODEL_FILES) {
      expect(file.url).toMatch(/^https:\/\//);
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(MODEL_GROUPS.map((g) => g.id)).toContain(file.group);
    }
  });

  it('keeps paths unique and inside the models folder', () => {
    const paths = MODEL_FILES.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).not.toMatch(/\.\.|^\/|\\/);
  });

  it('adds up the sizes shown in the settings', () => {
    expect(groupSize('gigaam')).toBe(326_322_304);
    expect(groupSize('voices')).toBe(33_122_030);
    expect(TOTAL_MODELS_SIZE).toBe(groupSize('gigaam') + groupSize('voices'));
  });

  it('builds the paths the transcription process loads', () => {
    const paths = modelPaths('M');
    expect(paths.encoder).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_encoder_int8.onnx'));
    expect(paths.decoder).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_decoder.onnx'));
    expect(paths.joiner).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_joint.onnx'));
    expect(paths.tokens).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_tokens.txt'));
    expect(paths.segmentation).toBe(join('M', 'pyannote-segmentation-3-0', 'model.onnx'));
    expect(paths.embedding).toBe(join('M', 'speaker-embedding', '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'));
    expect(paths.vad).toBe(join('M', 'silero-vad', 'silero_vad.onnx'));
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

  it('takes the folder from tests when given', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', override: 'T' })).toBe('T');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/models/registry.test.ts
```

Expected: FAIL — нет `./registry` и `./models-dir`.

- [ ] **Step 3: Реестр и папка**

**Создать `src/main/models/registry.ts`:**

```ts
import { join } from 'node:path';
import type { ModelGroupId } from '../../shared/transcription';

// Группа моделей — то, что пользователь видит и удаляет в настройках одной строкой.
export type { ModelGroupId };

export interface ModelFile {
  group: ModelGroupId;
  /** Путь внутри папки моделей, через «/». */
  path: string;
  url: string;
  size: number;
  sha256: string;
}

export interface ModelGroup {
  id: ModelGroupId;
  title: string;
}

const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/main';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

export const MODEL_GROUPS: readonly ModelGroup[] = [
  { id: 'gigaam', title: 'GigaAM v3' },
  { id: 'voices', title: 'Разделение по голосам и поиск речи' },
];

// Размеры и SHA-256 сверены 2026-09-29 с Hugging Face (LFS oid, git-хэш tokens.txt) и релизами sherpa-onnx на GitHub.
export const MODEL_FILES: readonly ModelFile[] = [
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_encoder_int8.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_encoder_int8.onnx`,
    size: 318_995_997,
    sha256: '2cac62d0c270bd128f898f2be1a2d34780d524a6e9483888ebac7b00f97410f1',
  },
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_decoder.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_decoder.onnx`,
    size: 4_600_058,
    sha256: '781971998e6a355d6a714f6932a30eab295e7ba0d14fd7e0f78c83b87e811860',
  },
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_joint.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_joint.onnx`,
    size: 2_712_896,
    sha256: '602ff7017a93311aad34df1437c8d7f49911353c13d6eae7a6ee7b041339465c',
  },
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_tokens.txt',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_tokens.txt`,
    size: 13_353,
    sha256: '7ddf22514c42c531358182c81446a8159771e9921019f09ae743ea622d40221d',
  },
  {
    group: 'voices',
    path: 'pyannote-segmentation-3-0/model.onnx',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx',
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

/** Модель расшифровки — пишется в meeting.json и transcript.json. */
export const ASR_MODEL_ID = 'gigaam-v3-e2e-rnnt';

/** Пути к файлам моделей для процесса расшифровки. */
export interface ModelPaths {
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  segmentation: string;
  embedding: string;
  vad: string;
}

/** Абсолютный путь к файлу модели. */
export const modelFilePath = (root: string, file: Pick<ModelFile, 'path'>): string =>
  join(root, ...file.path.split('/'));

function pathOf(root: string, suffix: string): string {
  const file = MODEL_FILES.find((f) => f.path.endsWith(suffix));
  if (!file) throw new Error(`В реестре нет модели ${suffix}`);
  return modelFilePath(root, file);
}

export function modelPaths(root: string): ModelPaths {
  return {
    encoder: pathOf(root, '_encoder_int8.onnx'),
    decoder: pathOf(root, '_decoder.onnx'),
    joiner: pathOf(root, '_joint.onnx'),
    tokens: pathOf(root, '_tokens.txt'),
    segmentation: pathOf(root, 'pyannote-segmentation-3-0/model.onnx'),
    embedding: pathOf(root, 'eres2net_sv_en_voxceleb_16k.onnx'),
    vad: pathOf(root, 'silero_vad.onnx'),
  };
}

export const groupFiles = (group: ModelGroupId): ModelFile[] => MODEL_FILES.filter((f) => f.group === group);
export const groupSize = (group: ModelGroupId): number => groupFiles(group).reduce((sum, f) => sum + f.size, 0);
export const TOTAL_MODELS_SIZE = MODEL_FILES.reduce((sum, f) => sum + f.size, 0);
```

**Создать `src/main/models/models-dir.ts`:**

```ts
import { join } from 'node:path';

export interface ModelsDirEnv {
  platform: string;
  homeDir: string;
  /** %LOCALAPPDATA% на Windows. */
  localAppData?: string | undefined;
  /** Только для автотестов: своя папка моделей (TEXTMEET_MODELS_DIR). */
  override?: string | undefined;
}

/**
 * Папка моделей — служебная, вне облачных папок (модели большие, синхронизировать их незачем):
 * Windows %LOCALAPPDATA%\TextMeet\models, macOS ~/Library/Application Support/TextMeet/models.
 * Та же папка, что в спайке; версия для разработки пользуется ею же — данные в моделях не меняются.
 */
export function modelsRoot(env: ModelsDirEnv): string {
  if (env.override) return env.override;
  if (env.platform === 'win32') {
    return join(env.localAppData ?? join(env.homeDir, 'AppData', 'Local'), 'TextMeet', 'models');
  }
  if (env.platform === 'darwin') return join(env.homeDir, 'Library', 'Application Support', 'TextMeet', 'models');
  return join(env.homeDir, '.local', 'share', 'TextMeet', 'models');
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/models/registry.ts src/main/models/models-dir.ts src/main/models/registry.test.ts
git commit -m "feat: add the model registry with sizes and checksums"
```

---

### Task 4: Скачивание файла модели

**Files:**
- Create: `src/main/models/download.ts`, `src/main/models/download.test.ts`

Замечание спайка: у `fetch` не было тайм-аута и повторов, `.part` оставался при ошибке. Здесь: `.part` рядом с файлом,
докачка через `Range` (сервер без `Range` → с нуля; ответ, закончившийся раньше времени без ошибки, — тоже докачка),
обрыв «молчащего» сервера через 30 с, 3 повтора (ответы 4xx, кроме 408/429, не повторяются — «нет файла» повтором не
исправить), проверка размера и SHA-256, испорченный файл удаляется. Ошибки делятся на `network` / `corrupt` / `space` / `disk` — от этого зависит текст
для человека (Task 12). Тесты — на локальном HTTP-сервере.

- [ ] **Step 1: Тест**

**Создать `src/main/models/download.test.ts`:**

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { DownloadError, downloadFile, sha256File } from './download';

const BODY = Buffer.from('0123456789'.repeat(1000));
const SHA = createHash('sha256').update(BODY).digest('hex');

type Behaviour = (req: IncomingMessage, res: ServerResponse, request: number) => void;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

/** Локальный сервер: behaviour решает, что ответить на n-й запрос (с нуля). */
async function serve(behaviour: Behaviour): Promise<{ url: string; ranges: (string | undefined)[] }> {
  const ranges: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    ranges.push(req.headers.range);
    behaviour(req, res, ranges.length - 1);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/model.onnx`, ranges };
}

/** Отдаёт BODY с поддержкой Range. */
const sendBody = (req: IncomingMessage, res: ServerResponse): void => {
  const match = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
  const from = match ? Number(match[1]) : 0;
  res.writeHead(match ? 206 : 200, { 'content-length': BODY.length - from });
  res.end(BODY.subarray(from));
};

const options = (url: string, dest: string) => ({
  url,
  dest,
  size: BODY.length,
  sha256: SHA,
  retryDelayMs: 1,
  idleTimeoutMs: 300,
});

describe('downloadFile', () => {
  it('downloads, checks and renames the file', async () => {
    const { url } = await serve(sendBody);
    const dest = join(makeTempDir(), 'models', 'model.onnx');
    const progress: number[] = [];
    await downloadFile({ ...options(url, dest), onProgress: (n) => progress.push(n) });
    expect(readFileSync(dest)).toEqual(BODY);
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(progress.at(-1)).toBe(BODY.length);
  });

  it('resumes after a dropped connection instead of starting over', async () => {
    const { url, ranges } = await serve((req, res, n) => {
      if (n === 0) {
        res.writeHead(200, { 'content-length': BODY.length });
        res.write(BODY.subarray(0, 4000));
        setTimeout(() => res.destroy(), 20);
        return;
      }
      sendBody(req, res);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
    expect(ranges).toEqual([undefined, 'bytes=4000-']);
  });

  it('starts over when the server ignores Range', async () => {
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': BODY.length });
      res.end(BODY);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    writeFileSync(`${dest}.part`, BODY.subarray(0, 5000));
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('keeps a finished .part and only checks it', async () => {
    const { url, ranges } = await serve(sendBody);
    const dest = join(makeTempDir(), 'model.onnx');
    writeFileSync(`${dest}.part`, BODY);
    await downloadFile(options(url, dest));
    expect(ranges).toEqual([]);
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('drops a .part that is longer than the file', async () => {
    const { url } = await serve(sendBody);
    const dest = join(makeTempDir(), 'model.onnx');
    writeFileSync(`${dest}.part`, Buffer.concat([BODY, BODY]));
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('gives up after the retries when the server keeps failing', async () => {
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const error = await downloadFile({ ...options(url, dest), retries: 2 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DownloadError);
    expect(error).toMatchObject({ kind: 'network' });
    expect(ranges).toHaveLength(3);
  });

  it('does not retry a missing file', async () => {
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile(options(url, dest))).rejects.toMatchObject({ kind: 'network', message: 'сервер ответил 404' });
    expect(ranges).toHaveLength(1);
  });

  it('resumes a response that ended early without an error', async () => {
    const { url, ranges } = await serve((req, res, n) => {
      if (n === 0) {
        // Длина не указана — клиент не знает, что данных мало.
        res.writeHead(200);
        res.end(BODY.subarray(0, 3000));
        return;
      }
      sendBody(req, res);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
    expect(ranges).toEqual([undefined, 'bytes=3000-']);
  });

  it('breaks off a server that stops sending', async () => {
    const { url } = await serve((_req, res, n) => {
      res.writeHead(200, { 'content-length': BODY.length });
      if (n === 0) {
        res.write(BODY.subarray(0, 100));
        return; // молчит дальше
      }
      res.end(BODY);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('deletes a file with a wrong checksum', async () => {
    const { url } = await serve((_req, res) => {
      res.writeHead(200);
      res.end(Buffer.alloc(BODY.length, 1));
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile(options(url, dest))).rejects.toMatchObject({ kind: 'corrupt' });
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(existsSync(dest)).toBe(false);
  });

  it('reports a disk problem without retrying', async () => {
    const { url, ranges } = await serve(sendBody);
    const blocker = join(makeTempDir(), 'file');
    writeFileSync(blocker, 'not a folder');
    await expect(downloadFile(options(url, join(blocker, 'model.onnx')))).rejects.toMatchObject({ kind: 'disk' });
    expect(ranges).toEqual([]);
  });
});

describe('sha256File', () => {
  it('hashes a file', async () => {
    const file = join(makeTempDir(), 'x');
    writeFileSync(file, BODY);
    expect(await sha256File(file)).toBe(SHA);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/models/download.test.ts
```

Expected: FAIL — нет `./download`.

- [ ] **Step 3: Скачивание**

**Создать `src/main/models/download.ts`:**

```ts
import { createHash } from 'node:crypto';
import { createReadStream, promises as fsp } from 'node:fs';
import { dirname } from 'node:path';

/** Почему не скачалось: нет связи (повторяли), файл пришёл испорченным, не хватает места, не записать на диск. */
export type DownloadFailure = 'network' | 'corrupt' | 'space' | 'disk';

export class DownloadError extends Error {
  constructor(
    readonly kind: DownloadFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

export interface DownloadOptions {
  url: string;
  dest: string;
  size: number;
  sha256: string;
  /** Сколько байт файла уже на диске (вместе с докачанным ранее) — для полоски прогресса. */
  onProgress?(bytesOnDisk: number): void;
  fetch?: typeof fetch;
  /** Сервер молчит дольше — попытка обрывается. */
  idleTimeoutMs?: number;
  /** Повторов после первой попытки при обрыве связи. */
  retries?: number;
  retryDelayMs?: number;
}

export const IDLE_TIMEOUT_MS = 30_000;
export const DOWNLOAD_RETRIES = 3;
export const RETRY_DELAY_MS = 2_000;

/** SHA-256 файла потоком (файлы моделей — сотни мегабайт). */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function sizeOf(file: string): Promise<number> {
  return fsp.stat(file).then(
    (stats) => stats.size,
    () => 0,
  );
}

const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS']);

/** Ответ сервера, который повтором не исправить (нет файла, нет доступа). */
class FinalHttpError extends Error {}
const retryableStatus = (status: number): boolean => status >= 500 || status === 408 || status === 429;
const isDiskError = (err: unknown): boolean => DISK_CODES.has((err as NodeJS.ErrnoException | null)?.code ?? '');

/** Одна попытка: докачивает `.part` с места обрыва (Range), сервер без Range — качает заново. */
async function fetchInto(part: string, options: DownloadOptions): Promise<void> {
  const have = await sizeOf(part);
  if (have === options.size) return;
  if (have > options.size) await fsp.rm(part, { force: true });
  const from = have > options.size ? 0 : have;

  const controller = new AbortController();
  const idleMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  let timer = setTimeout(() => controller.abort(), idleMs);
  const touch = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };
  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      headers: from > 0 ? { Range: `bytes=${from}-` } : {},
      signal: controller.signal,
    });
    if (response.status !== 200 && response.status !== 206) {
      const message = `сервер ответил ${response.status}`;
      throw retryableStatus(response.status) ? new Error(message) : new FinalHttpError(message);
    }
    if (!response.body) throw new Error('сервер не прислал данных');
    const resumed = response.status === 206 && from > 0;
    const handle = await fsp.open(part, resumed ? 'a' : 'w');
    let done = resumed ? from : 0;
    try {
      for await (const chunk of response.body) {
        touch();
        await handle.write(chunk);
        done += chunk.byteLength;
        options.onProgress?.(done);
      }
    } finally {
      await handle.close();
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Скачивает файл модели: `.part` рядом, докачка после обрыва, повторы, проверка размера и SHA-256,
 * затем переименование. Испорченный файл удаляется — следующая попытка начнёт с нуля.
 */
export async function downloadFile(options: DownloadOptions): Promise<void> {
  const part = `${options.dest}.part`;
  const retries = options.retries ?? DOWNLOAD_RETRIES;
  try {
    await fsp.mkdir(dirname(options.dest), { recursive: true });
  } catch (err) {
    throw new DownloadError('disk', 'не удалось создать папку моделей', { cause: err });
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fetchInto(part, options);
      // Сервер закрыл ответ раньше времени без ошибки — докачиваем, как после обрыва.
      if ((await sizeOf(part)) < options.size) throw new Error('ответ оборвался');
      break;
    } catch (err) {
      if (isDiskError(err)) throw new DownloadError('disk', 'не удалось записать файл модели', { cause: err });
      if (err instanceof FinalHttpError) throw new DownloadError('network', err.message, { cause: err });
      if (attempt >= retries) throw new DownloadError('network', 'нет связи с сервером', { cause: err });
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
    }
  }
  const size = await sizeOf(part);
  const sha = size === options.size ? await sha256File(part) : null;
  if (sha !== options.sha256) {
    await fsp.rm(part, { force: true });
    throw new DownloadError('corrupt', `файл модели повреждён (${size} байт, ожидалось ${options.size})`);
  }
  await fsp.rename(part, options.dest);
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/models/download.ts src/main/models/download.test.ts
git commit -m "feat: download model files with resume, retries and checksum"
```

---

### Task 5: Менеджер моделей

**Files:**
- Create: `src/main/models/model-manager.ts`, `src/main/models/model-manager.test.ts`

Файлы, уже лежащие в папке (на Windows пользователя — со спайка), проверяются по SHA-256 один раз; результат — в
`verified.json` (размер + время изменения + сумма), дальше проверка мгновенная. Недостающие скачиваются по очереди,
прогресс — в байтах. Перед скачиванием — проверка места (+50 МБ запаса; уже докачанные `.part` не считаются).
Одновременные вызовы `ensure()` ждут одну проверку.

- [ ] **Step 1: Тест**

**Создать `src/main/models/model-manager.test.ts`:**

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import type { Logger } from '../logger';
import type { DownloadOptions } from './download';
import { ModelManager, VERIFIED_FILE } from './model-manager';
import type { ModelFile } from './registry';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };
const content = (name: string) => Buffer.from(`model ${name}`);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const file = (group: 'gigaam' | 'voices', path: string): ModelFile => ({
  group,
  path,
  url: `https://example.test/${path}`,
  size: content(path).length,
  sha256: sha(content(path)),
});
const FILES = [file('gigaam', 'g/encoder.onnx'), file('gigaam', 'g/tokens.txt'), file('voices', 'v/vad.onnx')];

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
    await manager(root).ensure((p) => progress.push(p));
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
    await manager(root, { hash }).ensure();
    expect(fakeDownload).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledTimes(3);
    // Второй раз суммы не пересчитываются — хватает запомненного.
    hash.mockClear();
    await manager(root, { hash }).ensure();
    expect(hash).not.toHaveBeenCalled();
  });

  it('replaces a damaged file', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, f.path, content(f.path));
    put(root, 'v/vad.onnx', Buffer.alloc(content('v/vad.onnx').length, 7));
    await manager(root).ensure();
    expect(fakeDownload).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(root, 'v', 'vad.onnx'))).toEqual(content('v/vad.onnx'));
  });

  it('checks a file again after it changed on disk', async () => {
    const root = makeTempDir();
    await manager(root).ensure();
    put(root, 'g/tokens.txt', Buffer.from('other'));
    await manager(root).ensure();
    expect(fakeDownload).toHaveBeenCalledTimes(1);
  });

  it('refuses to start without enough free space', async () => {
    const root = makeTempDir();
    await expect(manager(root, { freeBytes: async () => 10 }).ensure()).rejects.toMatchObject({ kind: 'space' });
    expect(fakeDownload).not.toHaveBeenCalled();
  });

  it('does not count already downloaded parts as needed space', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, `${f.path}.part`, content(f.path));
    // Места ровно на запас: без учёта .part не хватило бы.
    const m = manager(root, { freeBytes: async () => 50 * 1024 * 1024 + 1 });
    await m.ensure();
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('shares one check between callers', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await Promise.all([m.ensure(), m.ensure()]);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('survives a damaged verified.json', async () => {
    const root = makeTempDir();
    writeFileSync(join(root, VERIFIED_FILE), '{broken');
    await manager(root).ensure();
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });
});

describe('ModelManager.state and remove', () => {
  it('shows each group with its size and whether it is installed', async () => {
    const root = makeTempDir();
    const m = manager(root);
    expect((await m.state()).map((g) => [g.id, g.installed])).toEqual([
      ['gigaam', false],
      ['voices', false],
    ]);
    await m.ensure();
    const groups = await m.state();
    expect(groups.every((g) => g.installed)).toBe(true);
    expect(groups[0]?.sizeBytes).toBe(FILES[0]!.size + FILES[1]!.size);
  });

  it('removes one group and forgets it was checked', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure();
    await m.remove('gigaam');
    expect(existsSync(join(root, 'g', 'encoder.onnx'))).toBe(false);
    expect(existsSync(join(root, 'v', 'vad.onnx'))).toBe(true);
    expect((await m.state()).map((g) => g.installed)).toEqual([false, true]);
    expect(Object.keys(JSON.parse(readFileSync(join(root, VERIFIED_FILE), 'utf8')))).toEqual(['v/vad.onnx']);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/models/model-manager.test.ts
```

Expected: FAIL — нет `./model-manager`.

- [ ] **Step 3: Менеджер**

**Создать `src/main/models/model-manager.ts`:**

```ts
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { ModelGroupState } from '../../shared/transcription';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { DownloadError, downloadFile, sha256File } from './download';
import { MODEL_FILES, MODEL_GROUPS, modelFilePath, type ModelFile, type ModelGroupId } from './registry';

/** Файл, куда запоминается, какие модели уже проверены по SHA-256 (проверка 320 МБ — пара секунд). */
export const VERIFIED_FILE = 'verified.json';
/** Запас места сверх размера моделей. */
const DISK_MARGIN_BYTES = 50 * 1024 * 1024;

const VerifiedSchema = z.record(z.string(), z.object({ size: z.number(), mtimeMs: z.number(), sha256: z.string() }));
type Verified = z.infer<typeof VerifiedSchema>;

export interface DownloadProgress {
  done: number;
  total: number;
}

export interface ModelManagerDeps {
  root: string;
  logger: Logger;
  freeBytes(dir: string): Promise<number>;
  files?: readonly ModelFile[];
  download?: typeof downloadFile;
  hash?: (file: string) => Promise<string>;
}

/** Модели на диске: проверка, скачивание недостающих, удаление по группам. */
export class ModelManager {
  private ensuring: Promise<void> | null = null;
  private readonly files: readonly ModelFile[];

  constructor(private readonly deps: ModelManagerDeps) {
    this.files = deps.files ?? MODEL_FILES;
  }

  get root(): string {
    return this.deps.root;
  }

  /**
   * Все модели на месте и целы; недостающие и испорченные скачиваются.
   * Одновременные вызовы ждут одну и ту же проверку.
   */
  ensure(onProgress: (progress: DownloadProgress) => void = () => undefined): Promise<void> {
    this.ensuring ??= this.runEnsure(onProgress).finally(() => {
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

  async remove(group: ModelGroupId): Promise<void> {
    const files = this.files.filter((f) => f.group === group);
    for (const file of files) {
      const path = modelFilePath(this.deps.root, file);
      await fsp.rm(path, { force: true, maxRetries: 4, retryDelay: 100 });
      await fsp.rm(`${path}.part`, { force: true });
    }
    const removed = new Set(files.map((f) => f.path));
    const verified = await this.readVerified();
    await this.writeVerified(Object.fromEntries(Object.entries(verified).filter(([path]) => !removed.has(path))));
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
      throw new DownloadError('disk', 'не удалось создать папку моделей', { cause: err });
    });
    // Уже докачанные куски (.part) место не требуют.
    const partial = await Promise.all(
      missing.map((f) =>
        fsp.stat(`${modelFilePath(this.deps.root, f)}.part`).then(
          (s) => Math.min(s.size, f.size),
          () => 0,
        ),
      ),
    );
    const needed = total - partial.reduce((sum, n) => sum + n, 0);
    const free = await this.deps.freeBytes(this.deps.root);
    if (free < needed + DISK_MARGIN_BYTES) {
      throw new DownloadError('space', `мало места: нужно ${needed} байт, свободно ${free}`);
    }
    let finished = 0;
    onProgress({ done: 0, total });
    for (const file of missing) {
      const dest = modelFilePath(this.deps.root, file);
      this.deps.logger.info(`Скачиваем модель ${file.path}`);
      await (this.deps.download ?? downloadFile)({
        url: file.url,
        dest,
        size: file.size,
        sha256: file.sha256,
        onProgress: (bytes) => onProgress({ done: finished + bytes, total }),
      });
      finished += file.size;
      verified[file.path] = await this.fingerprint(dest, file.sha256);
      await this.writeVerified(verified);
    }
  }

  /** Файл уже лежит (например, со спайка): проверить сумму один раз и запомнить. */
  private async checkExisting(file: ModelFile, verified: Verified): Promise<boolean> {
    const path = modelFilePath(this.deps.root, file);
    const stats = await fsp.stat(path).catch(() => null);
    if (!stats || stats.size !== file.size) return false;
    const sha = await (this.deps.hash ?? sha256File)(path);
    if (sha !== file.sha256) {
      this.deps.logger.warn(`Модель ${file.path} повреждена — скачаем заново`);
      await fsp.rm(path, { force: true });
      return false;
    }
    verified[file.path] = { size: stats.size, mtimeMs: stats.mtimeMs, sha256: sha };
    await this.writeVerified(verified);
    return true;
  }

  private async isVerified(file: ModelFile, verified: Verified): Promise<boolean> {
    const known = verified[file.path];
    if (!known || known.sha256 !== file.sha256) return false;
    const stats = await fsp.stat(modelFilePath(this.deps.root, file)).catch(() => null);
    return !!stats && stats.size === known.size && stats.mtimeMs === known.mtimeMs;
  }

  private async fingerprint(path: string, sha256: string): Promise<Verified[string]> {
    const stats = await fsp.stat(path);
    return { size: stats.size, mtimeMs: stats.mtimeMs, sha256 };
  }

  private async readVerified(): Promise<Verified> {
    const result = await readJsonFile(join(this.deps.root, VERIFIED_FILE), VerifiedSchema).catch(() => null);
    return result?.ok ? result.value : {};
  }

  private async writeVerified(verified: Verified): Promise<void> {
    const file = join(this.deps.root, VERIFIED_FILE);
    await fsp.mkdir(dirname(file), { recursive: true });
    await writeJsonAtomic(file, verified);
  }
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/models/model-manager.ts src/main/models/model-manager.test.ts
git commit -m "feat: verify, download and remove transcription models"
```

---

### Task 6: Ходы спикеров: без наложений, промежутки, склейка, резка

**Files:**
- Create: `src/main/transcription/turns.ts`, `src/main/transcription/turns.test.ts`,
  `src/main/transcription/split.ts`, `src/main/transcription/split.test.ts`

Закрывает два открытых вопроса спайка (решения, §4.5–4.6): перекрывающаяся речь распознавалась дважды, звук вне ходов
терялся. `exclusiveTurns` делит время на участки между границами всех ходов и на каждом решает, чей он: вложенный ход
побеждает накрывающий, остальным участок делится поровну по порядку начала (два частично наложенных хода — граница
посередине). Первый вариант прототипа сравнивал новый ход только с последним и на цепочках вложенных ходов оставлял
наложения — это поймало ревью и проверка на 300 случайных наборах (тест «never leaves overlaps»); участки короче 1 мс
(округление дробных секунд) пропускаются. `split.ts` — перенос `splitAtQuietPoints` из спайка без рекурсии.

- [ ] **Step 1: Тесты**

**Создать `src/main/transcription/turns.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { exclusiveTurns, fillGaps, mergeTurns, renumberByFirstAppearance, type Turn } from './turns';

const t = (start: number, end: number, speaker: number): Turn => ({ start, end, speaker });

describe('exclusiveTurns', () => {
  it('keeps turns that do not overlap', () => {
    expect(exclusiveTurns([t(5, 6, 1), t(0, 2, 0)])).toEqual([t(0, 2, 0), t(5, 6, 1)]);
  });

  it('drops a short interjection inside another speaker', () => {
    expect(exclusiveTurns([t(0, 10, 0), t(4, 5, 1)])).toEqual([t(0, 10, 0)]);
  });

  it('cuts a long turn around a long one inside it', () => {
    expect(exclusiveTurns([t(0, 10, 0), t(3, 6, 1)])).toEqual([t(0, 3, 0), t(3, 6, 1), t(6, 10, 0)]);
  });

  it('does not leave an empty piece when both start together', () => {
    expect(exclusiveTurns([t(0, 10, 0), t(0, 4, 1)])).toEqual([t(0, 4, 1), t(4, 10, 0)]);
  });

  it('splits a partial overlap in the middle', () => {
    expect(exclusiveTurns([t(0, 4, 0), t(3, 8, 1)])).toEqual([t(0, 3.5, 0), t(3.5, 8, 1)]);
  });

  it('joins overlapping turns of the same speaker', () => {
    expect(exclusiveTurns([t(0, 4, 0), t(3, 8, 0)])).toEqual([t(0, 8, 0)]);
    expect(exclusiveTurns([t(0, 8, 0), t(3, 4, 0)])).toEqual([t(0, 8, 0)]);
  });

  it('handles a chain of overlaps', () => {
    const out = exclusiveTurns([t(0, 4, 0), t(3, 7, 1), t(6, 9, 2)]);
    expect(out).toEqual([t(0, 3.5, 0), t(3.5, 6.5, 1), t(6.5, 9, 2)]);
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.end);
  });

  it('shares a stretch where several nested turns overlap', () => {
    // Внутри хода 0–10 сначала 2–6, затем 4–8 другого голоса: 4–6 не должно распознаваться дважды.
    const out = exclusiveTurns([t(0, 10, 0), t(2, 6, 1), t(4, 8, 2)]);
    expect(out).toEqual([t(0, 2, 0), t(2, 5, 1), t(5, 8, 2), t(8, 10, 0)]);
  });

  it('skips empty turns', () => {
    expect(exclusiveTurns([t(2, 2, 0), t(3, 4, 1)])).toEqual([t(3, 4, 1)]);
  });

  it('never leaves overlaps, whatever the input', () => {
    // Детерминированные «случайные» ходы: 300 наборов по 12 ходов трёх спикеров.
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 300; round++) {
      const input = Array.from({ length: 12 }, () => {
        const start = Math.round(random() * 600) / 10;
        return t(start, start + Math.round(random() * 150) / 10, Math.floor(random() * 3));
      });
      const out = exclusiveTurns(input);
      for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.end);
      for (const turn of out) expect(turn.end).toBeGreaterThan(turn.start);
    }
  });
});

describe('fillGaps', () => {
  it('gives uncovered speech to the nearest speaker', () => {
    const turns = [t(0, 2, 0), t(10, 12, 1)];
    expect(fillGaps(turns, [{ start: 2.5, end: 4 }, { start: 8, end: 9.5 }])).toEqual([
      t(0, 2, 0),
      t(2.5, 4, 0),
      t(8, 9.5, 1),
      t(10, 12, 1),
    ]);
  });

  it('adds only the uncovered part of speech', () => {
    expect(fillGaps([t(1, 3, 0), t(4, 5, 1)], [{ start: 0, end: 6 }])).toEqual([
      t(0, 1, 0),
      t(1, 3, 0),
      t(3, 4, 0),
      t(4, 5, 1),
      t(5, 6, 1),
    ]);
  });

  it('ignores very short leftovers', () => {
    expect(fillGaps([t(0, 2, 0)], [{ start: 1.5, end: 2.3 }])).toEqual([t(0, 2, 0)]);
  });

  it('ignores speech that is already covered', () => {
    expect(fillGaps([t(0, 5, 0)], [{ start: 1, end: 4 }])).toEqual([t(0, 5, 0)]);
  });

  it('assigns speaker 0 when diarization found nothing', () => {
    expect(fillGaps([], [{ start: 1, end: 3 }])).toEqual([t(1, 3, 0)]);
  });
});

describe('mergeTurns', () => {
  it('joins close turns of the same speaker', () => {
    expect(mergeTurns([t(0, 2, 0), t(2.5, 4, 0), t(6, 7, 0)])).toEqual([t(0, 4, 0), t(6, 7, 0)]);
  });

  it('does not join different speakers', () => {
    expect(mergeTurns([t(0, 2, 0), t(2.1, 4, 1)])).toEqual([t(0, 2, 0), t(2.1, 4, 1)]);
  });

  it('stops growing a turn past the length limit', () => {
    expect(mergeTurns([t(0, 50, 0), t(50.5, 70, 0)])).toEqual([t(0, 50, 0), t(50.5, 70, 0)]);
    expect(mergeTurns([t(0, 5, 0), t(5.5, 9, 0)], 1, 8)).toEqual([t(0, 5, 0), t(5.5, 9, 0)]);
  });
});

describe('renumberByFirstAppearance', () => {
  it('numbers speakers in the order they first speak', () => {
    expect(renumberByFirstAppearance([t(0, 1, 3), t(1, 2, 1), t(2, 3, 3)])).toEqual([
      t(0, 1, 0),
      t(1, 2, 1),
      t(2, 3, 0),
    ]);
  });
});
```

**Создать `src/main/transcription/split.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { quietestPoint, splitAtQuietPoints } from './split';

const RATE = 100;
/** Громкий сигнал с тишиной в заданных секундах. */
function signal(seconds: number, quiet: number[]): Float32Array {
  const samples = new Float32Array(seconds * RATE).fill(0.5);
  for (const q of quiet) samples.fill(0, q * RATE, (q + 1) * RATE);
  return samples;
}

describe('quietestPoint', () => {
  it('finds the silent frame', () => {
    expect(quietestPoint(signal(30, [14]), RATE, 10, 20, 0.5)).toBeCloseTo(14.25, 5);
  });

  it('stays inside the given range', () => {
    const point = quietestPoint(signal(30, [5]), RATE, 10, 20, 0.5);
    expect(point).toBeGreaterThanOrEqual(10);
    expect(point).toBeLessThanOrEqual(20);
  });
});

describe('splitAtQuietPoints', () => {
  it('keeps a short interval whole', () => {
    expect(splitAtQuietPoints(signal(30, []), RATE, { start: 2, end: 15 })).toEqual([{ start: 2, end: 15 }]);
  });

  it('cuts a long interval at quiet places into pieces of at most 20 s', () => {
    const pieces = splitAtQuietPoints(signal(60, [15, 33]), RATE, { start: 0, end: 50 });
    expect(pieces).toHaveLength(3);
    // Разрезы — внутри тихих секунд 15 и 33.
    expect(Math.floor(pieces[0]!.end)).toBe(15);
    expect(Math.floor(pieces[1]!.end)).toBe(33);
    expect(pieces.at(-1)!.end).toBe(50);
    for (const p of pieces) expect(p.end - p.start).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

```bash
npx vitest run src/main/transcription/turns.test.ts src/main/transcription/split.test.ts
```

Expected: FAIL — нет `./turns` и `./split`.

- [ ] **Step 3: Реализация**

**Создать `src/main/transcription/turns.ts`:**

```ts
// Ходы спикеров на одной дорожке: чистые функции без нативного кода (спецификация Плана 3, §4.2, §4.5, §4.6).

export interface Interval {
  /** Секунды от начала дорожки. */
  start: number;
  end: number;
}

export interface Turn extends Interval {
  /** Номер спикера на дорожке, с нуля. */
  speaker: number;
}

/** Вложенная в чужую реплику короткая реплика («угу», «да») отбрасывается — её слова и так звучат в чужой. */
export const BACKCHANNEL_MAX_SEC = 1.5;
/** Речь, которую не покрыло разделение по голосам, короче этого не добавляется. */
export const MIN_GAP_SPEECH_SEC = 0.5;
/** Участки короче (доли миллисекунды из-за округления) при делении наложений пропускаются. */
const MIN_PIECE_SEC = 0.001;
/** Соседние ходы одного спикера с паузой не длиннее этой склеиваются. */
export const MERGE_GAP_SEC = 1.0;
/** Склеенная реплика не длиннее (дальше её всё равно режут на куски ≤ 20 с для распознавания). */
export const MERGE_MAX_SEC = 60;

const length = (i: Interval): number => i.end - i.start;
// При одинаковом начале длинный ход первым: тогда короткий оказывается «внутри» него.
const byStart = <T extends Interval>(a: T, b: T): number => a.start - b.start || b.end - a.end;

const contains = (outer: Interval, inner: Interval): boolean => outer.start <= inner.start && inner.end <= outer.end;
/** outer шире inner и целиком его накрывает. */
const strictlyContains = (outer: Interval, inner: Interval): boolean =>
  contains(outer, inner) && (outer.start < inner.start || inner.end < outer.end);

/**
 * Реплики без наложений: каждый участок звука распознаётся один раз (решения Плана 3, §4.5).
 * - короткая (< 1,5 с) реплика целиком внутри чужой («угу», «да») отбрасывается;
 * - на участке, где звучат несколько ходов, вложенный ход побеждает тот, что его накрывает;
 * - остальным участок делится поровну по порядку начала (два частично наложенных хода — граница посередине);
 * - соседние куски одного спикера сливаются.
 */
export function exclusiveTurns(turns: readonly Turn[]): Turn[] {
  const valid = turns.filter((t) => length(t) > 0);
  const kept = valid.filter(
    (t) => length(t) >= BACKCHANNEL_MAX_SEC || !valid.some((o) => o !== t && o.speaker !== t.speaker && contains(o, t)),
  );
  const bounds = [...new Set(kept.flatMap((t) => [t.start, t.end]))].sort((a, b) => a - b);
  const pieces: Turn[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const from = bounds[k]!;
    const to = bounds[k + 1]!;
    // Границы из дробных секунд бывают «почти равны» (12.399999… и 12.4): такие щели звука не содержат.
    if (to - from < MIN_PIECE_SEC) continue;
    const active = kept.filter((t) => t.start <= from && to <= t.end);
    const owners = active.filter((a) => !active.some((b) => b !== a && strictlyContains(a, b))).sort(byStart);
    const share = (to - from) / owners.length;
    owners.forEach((owner, n) => {
      // Последний кусок кончается ровно на границе: иначе округление даст наложение на следующий участок.
      const end = n === owners.length - 1 ? to : from + share * (n + 1);
      pieces.push({ start: from + share * n, end, speaker: owner.speaker });
    });
  }
  const result: Turn[] = [];
  for (const piece of pieces) {
    const last = result.at(-1);
    if (last && last.speaker === piece.speaker && last.end === piece.start) result[result.length - 1] = { ...last, end: piece.end };
    else result.push(piece);
  }
  return result;
}

/** Части интервала, не покрытые ни одним из (отсортированных, непересекающихся) ходов. */
function uncovered(speech: Interval, turns: readonly Turn[]): Interval[] {
  const parts: Interval[] = [];
  let cursor = speech.start;
  for (const turn of turns) {
    if (turn.end <= cursor) continue;
    if (turn.start >= speech.end) break;
    if (turn.start > cursor) parts.push({ start: cursor, end: turn.start });
    cursor = Math.max(cursor, turn.end);
    if (cursor >= speech.end) break;
  }
  if (cursor < speech.end) parts.push({ start: cursor, end: speech.end });
  return parts;
}

const distance = (a: Interval, b: Interval): number => Math.max(0, a.start - b.end, b.start - a.end);

/**
 * Речь, найденная детектором речи, но не попавшая ни в один ход, становится ходом спикера
 * ближайшего по времени хода (если ходов нет — спикера 0). Ожидает ходы без наложений.
 */
export function fillGaps(turns: readonly Turn[], speech: readonly Interval[]): Turn[] {
  const sorted = [...turns].sort(byStart);
  const added: Turn[] = [];
  for (const part of speech.flatMap((s) => uncovered(s, sorted))) {
    if (length(part) < MIN_GAP_SPEECH_SEC) continue;
    const nearest = sorted.reduce<Turn | null>(
      (best, t) => (best === null || distance(part, t) < distance(part, best) ? t : best),
      null,
    );
    added.push({ ...part, speaker: nearest?.speaker ?? 0 });
  }
  return [...sorted, ...added].sort(byStart);
}

/** Склеивает соседние ходы одного спикера с короткой паузой, не длиннее maxLenSec. */
export function mergeTurns(turns: readonly Turn[], maxGapSec = MERGE_GAP_SEC, maxLenSec = MERGE_MAX_SEC): Turn[] {
  const result: Turn[] = [];
  for (const turn of [...turns].sort(byStart)) {
    const last = result.at(-1);
    if (
      last &&
      last.speaker === turn.speaker &&
      turn.start - last.end <= maxGapSec &&
      Math.max(last.end, turn.end) - last.start <= maxLenSec
    ) {
      result[result.length - 1] = { ...last, end: Math.max(last.end, turn.end) };
    } else {
      result.push({ ...turn });
    }
  }
  return result;
}

/** Номера спикеров по порядку первого появления: первый заговоривший — 0. Ожидает ходы по времени. */
export function renumberByFirstAppearance(turns: readonly Turn[]): Turn[] {
  const order: number[] = [];
  for (const turn of turns) if (!order.includes(turn.speaker)) order.push(turn.speaker);
  return turns.map((turn) => ({ ...turn, speaker: order.indexOf(turn.speaker) }));
}
```

**Создать `src/main/transcription/split.ts`:**

```ts
import type { Interval } from './turns';

export interface SplitOptions {
  /** Самый длинный кусок для распознавания, с. */
  maxLen: number;
  /** Раньше этого места от начала куска не режем, с. */
  minLen: number;
  /** Длина кадра для оценки громкости, с. */
  frameSec: number;
}

/** GigaAM обучена на кусках до ~25 с: длинную реплику режем на куски ≤ 20 с по самому тихому месту. */
export const SPLIT: SplitOptions = { maxLen: 20, minLen: 10, frameSec: 0.05 };

/** Середина самого тихого кадра в промежутке [fromSec; toSec], в секундах. */
export function quietestPoint(
  samples: Float32Array,
  sampleRate: number,
  fromSec: number,
  toSec: number,
  frameSec: number,
): number {
  const frameLen = Math.max(1, Math.round(frameSec * sampleRate));
  const from = Math.max(0, Math.round(fromSec * sampleRate));
  const to = Math.min(samples.length, Math.round(toSec * sampleRate));
  let best = from;
  let bestEnergy = Number.POSITIVE_INFINITY;
  for (let i = from; i + frameLen <= to; i += frameLen) {
    let energy = 0;
    for (let j = i; j < i + frameLen; j++) energy += (samples[j] ?? 0) ** 2;
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = i;
    }
  }
  return (best + Math.floor(frameLen / 2)) / sampleRate;
}

/** Режет интервал на куски не длиннее maxLen по самым тихим местам. */
export function splitAtQuietPoints(
  samples: Float32Array,
  sampleRate: number,
  interval: Interval,
  opts: SplitOptions = SPLIT,
): Interval[] {
  const pieces: Interval[] = [];
  let rest = interval;
  while (rest.end - rest.start > opts.maxLen) {
    const cut = quietestPoint(samples, sampleRate, rest.start + opts.minLen, rest.start + opts.maxLen, opts.frameSec);
    pieces.push({ start: rest.start, end: cut });
    rest = { start: cut, end: rest.end };
  }
  return [...pieces, rest];
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/transcription/turns.ts src/main/transcription/turns.test.ts src/main/transcription/split.ts src/main/transcription/split.test.ts
git commit -m "feat: make speaker turns exclusive and keep speech between turns"
```

---

### Task 7: Число собеседников по «отпечаткам голоса»

**Files:**
- Create: `src/main/transcription/clustering.ts`, `src/main/transcription/clustering.test.ts`

Решения §4.4. Порог сходства 0,6 и правило «растворять группы меньше min(20 с, 10 % речи)» проверены на настоящих
отпечатках (eres2net) из опытов 2026-09-29: запись на двоих → 2 (совпадение 96–98 %), половины этой записи → по 1,
запись четырёх человек → 4. Этот же код на тех же данных дал те же ответы (проверено скриптом прототипа).
Скорость: сходства центров хранятся в таблице, у каждой группы — ближайший сосед (после объединения пересчитываются
только затронутые), групп-«зёрен» не больше 400 самых длинных ходов (остальные ходы получают ближайшую группу в конце).
Первый вариант пересчитывал все пары на каждом шаге: 400 ходов — 4 с, тысячи ходов многочасовой встречи — минуты,
и всё это время процесс молчал бы для сторожа. Теперь 2000 ходов — ~0,6 с (тест «groups a multi-hour meeting quickly»).

- [ ] **Step 1: Тест**

**Создать `src/main/transcription/clustering.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { AUTO_CLUSTERING, clusterVoiceprints, type Voiceprint } from './clustering';

/** «Голос» — направление в пространстве отпечатков; шум — небольшой сдвиг, детерминированный по номеру. */
const VOICES = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
function print(voice: number, durationSec: number, n: number): Voiceprint {
  const base = VOICES[voice]!;
  const noise = [0.1, -0.05, 0.08, -0.02].map((x, i) => x * Math.sin(n + i));
  return { durationSec, embedding: Float32Array.from(base.map((x, i) => x + noise[i]!)) };
}

/** Одинаковые номера — один человек (сами номера групп могут отличаться). */
function samePartition(labels: number[], truth: number[]): boolean {
  const map = new Map<number, number>();
  return labels.every((label, i) => {
    const expected = map.get(label);
    if (expected === undefined) map.set(label, truth[i]!);
    return (map.get(label) ?? -1) === truth[i];
  }) && new Set(labels).size === new Set(truth).size;
}

describe('clusterVoiceprints', () => {
  it('finds two speakers of a dialogue', () => {
    const truth = [0, 1, 0, 1, 0, 1, 1, 0];
    const labels = clusterVoiceprints(truth.map((v, n) => print(v, 30, n)));
    expect(samePartition(labels, truth)).toBe(true);
  });

  it('finds one speaker when there is one voice', () => {
    const labels = clusterVoiceprints([0, 0, 0, 0, 0].map((v, n) => print(v, 40, n)));
    expect(new Set(labels)).toEqual(new Set([0]));
  });

  it('finds four speakers of a short recording (small absolute amount of speech)', () => {
    const truth = [0, 1, 2, 3, 0, 1, 2, 3];
    const labels = clusterVoiceprints(truth.map((v, n) => print(v, 3, n)));
    expect(samePartition(labels, truth)).toBe(true);
  });

  it('dissolves a group with too little speech into the nearest big one', () => {
    // Третий «голос» сказал 5 с за 20-минутную встречу — скорее обрывок одного из двух.
    const prints = [print(0, 600, 1), print(1, 600, 2), { durationSec: 5, embedding: Float32Array.from([0.8, 0.2, 0.6, 0]) }];
    const labels = clusterVoiceprints(prints);
    expect(new Set(labels).size).toBe(2);
    expect(labels[2]).toBe(labels[0]);
  });

  it('does not seed groups from very short turns but still labels them', () => {
    const prints = [print(0, 30, 1), print(1, 30, 2), print(1, 0.2, 3)];
    const labels = clusterVoiceprints(prints);
    expect(labels[2]).toBe(labels[1]);
  });

  it('marks turns without a voiceprint', () => {
    expect(clusterVoiceprints([print(0, 30, 1), { durationSec: 0.1, embedding: null }])).toEqual([0, -1]);
  });

  it('copes with no usable voiceprints at all', () => {
    expect(clusterVoiceprints([{ durationSec: 0.2, embedding: Float32Array.from([1, 0]) }])).toEqual([0]);
    expect(clusterVoiceprints([{ durationSec: 3, embedding: null }])).toEqual([-1]);
    expect(clusterVoiceprints([])).toEqual([]);
  });

  it('keeps the largest group when all groups are small', () => {
    const labels = clusterVoiceprints([print(0, 1, 1), print(1, 1, 2)], { ...AUTO_CLUSTERING, minGroupShare: 0.9 });
    expect(new Set(labels).size).toBe(1);
  });

  it('groups a multi-hour meeting quickly', () => {
    // 2000 ходов трёх голосов, отпечатки по 192 числа (как у eres2net).
    const prints = Array.from({ length: 2000 }, (_, n) => {
      const voice = n % 3;
      const embedding = Float32Array.from({ length: 192 }, (_, k) => (k % 3 === voice ? 1 : 0) + 0.05 * Math.sin(n * 7 + k));
      return { durationSec: 2 + (n % 5), embedding };
    });
    const started = performance.now();
    const labels = clusterVoiceprints(prints);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(new Set(labels).size).toBe(3);
    expect(labels[3]).toBe(labels[0]);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/transcription/clustering.test.ts
```

Expected: FAIL — нет `./clustering`.

- [ ] **Step 3: Группировка**

**Создать `src/main/transcription/clustering.ts`:**

```ts
// Число собеседников, если его не указали: своя группировка «отпечатков голоса» (спецификация Плана 3, §4.4).
// Опыты 2026-09-29: запись на двоих → 2 (совпадение с одобренным разделением 96–98 %), один голос → 1,
// открытая запись четырёх человек → 4; встроенный порог библиотеки давал от 1 до 72.

export interface Voiceprint {
  /** Длительность хода, с — вес его отпечатка. */
  durationSec: number;
  /** Отпечаток голоса; null — ход слишком короткий, отпечатка нет. */
  embedding: Float32Array | null;
}

export interface ClusteringOptions {
  /** Группы объединяются, пока косинусное сходство их центров не ниже этого. */
  similarity: number;
  /** Ходы короче не создают групп (их отпечатки ненадёжны), но получают ближайшую. */
  minSeedSec: number;
  /** Группа, у которой речи меньше min(этого, доли всей речи), растворяется в ближайшей крупной. */
  minGroupSec: number;
  minGroupShare: number;
}

export const AUTO_CLUSTERING: ClusteringOptions = {
  similarity: 0.6,
  minSeedSec: 0.5,
  minGroupSec: 20,
  minGroupShare: 0.1,
};

/**
 * Больше стольких ходов группы не создают: самые длинные создают, остальные получают ближайшую группу в конце.
 * Иначе на многочасовой встрече (тысячи ходов) объединение шло бы минутами (сложность — куб числа групп).
 */
export const MAX_SEED_TURNS = 400;

function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function nearest(centroids: readonly Float32Array[], v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < centroids.length; i++) {
    if (dot(centroids[i]!, v) > dot(centroids[best]!, v)) best = i;
  }
  return best;
}

/**
 * Номер собеседника для каждого хода (по порядку входа). Ходы без отпечатка получают −1 —
 * их спикера решает время (соседний ход), см. pipeline.
 */
export function clusterVoiceprints(prints: readonly Voiceprint[], opts: ClusteringOptions = AUTO_CLUSTERING): number[] {
  const unit = prints.map((p) => (p.embedding ? normalize(p.embedding) : null));
  const seeds = prints
    .map((p, i) => ({ i, durationSec: p.durationSec }))
    .filter(({ i, durationSec }) => unit[i] && durationSec >= opts.minSeedSec)
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, MAX_SEED_TURNS);
  if (seeds.length === 0) return prints.map((p) => (p.embedding ? 0 : -1));

  // Группы: сумма нормированных отпечатков с весом длительности, её центр и длительность речи.
  const sums = seeds.map(({ i, durationSec }) => unit[i]!.map((x) => x * durationSec));
  const centers = sums.map(normalize);
  const durations = seeds.map((s) => s.durationSec);
  const alive = seeds.map(() => true);
  const n = seeds.length;
  // Таблица сходств центров и ближайший сосед каждой группы: после объединения пересчитываются одна строка и соседи
  // тех групп, чьим ближайшим была одна из объединённых, а не все пары заново.
  const sim = new Float64Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const s = dot(centers[a]!, centers[b]!);
      sim[a * n + b] = s;
      sim[b * n + a] = s;
    }
  }
  const nearestOf = new Int32Array(n).fill(-1);
  const nearestSim = new Float64Array(n).fill(-Infinity);
  const findNearest = (a: number): void => {
    nearestOf[a] = -1;
    nearestSim[a] = -Infinity;
    for (let b = 0; b < n; b++) {
      if (b !== a && alive[b] && sim[a * n + b]! > nearestSim[a]!) {
        nearestSim[a] = sim[a * n + b]!;
        nearestOf[a] = b;
      }
    }
  };
  for (let a = 0; a < n; a++) findNearest(a);

  // Объединяем самые похожие группы, пока сходство не ниже порога.
  for (;;) {
    let pa = -1;
    for (let a = 0; a < n; a++) {
      if (alive[a] && nearestOf[a]! >= 0 && (pa < 0 || nearestSim[a]! > nearestSim[pa]!)) pa = a;
    }
    if (pa < 0 || nearestSim[pa]! < opts.similarity) break;
    const pb = nearestOf[pa]!;
    sums[pa] = sums[pa]!.map((x, k) => x + (sums[pb]![k] ?? 0));
    centers[pa] = normalize(sums[pa]!);
    durations[pa] = durations[pa]! + durations[pb]!;
    alive[pb] = false;
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === pa) continue;
      const s = dot(centers[pa]!, centers[c]!);
      sim[pa * n + c] = s;
      sim[c * n + pa] = s;
    }
    findNearest(pa);
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === pa) continue;
      if (nearestOf[c] === pa || nearestOf[c] === pb) findNearest(c);
      else if (sim[c * n + pa]! > nearestSim[c]!) {
        nearestSim[c] = sim[c * n + pa]!;
        nearestOf[c] = pa;
      }
    }
  }

  // Мелкие группы — почти всегда обрывки одного из крупных голосов.
  const groups = centers.map((center, g) => ({ center, durationSec: durations[g]! })).filter((_, g) => alive[g]);
  const totalSec = groups.reduce((sum, g) => sum + g.durationSec, 0);
  const minSec = Math.min(opts.minGroupSec, opts.minGroupShare * totalSec);
  const big = groups.filter((g) => g.durationSec >= minSec);
  const kept = big.length > 0 ? big : [groups.reduce((a, b) => (b.durationSec > a.durationSec ? b : a))];
  const keptCenters = kept.map((g) => g.center);
  return unit.map((e) => (e ? nearest(keptCenters, e) : -1));
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/transcription/clustering.ts src/main/transcription/clustering.test.ts
git commit -m "feat: find the number of speakers by grouping voiceprints"
```

---

### Task 8: Путь по дорожкам и доля выполненной работы

**Files:**
- Create: `src/main/transcription/routing.ts`, `src/main/transcription/routing.test.ts`,
  `src/main/transcription/progress.ts`, `src/main/transcription/progress.test.ts`

Таблица §4.1 решений: созвон на двоих — без разделения по голосам (на треть быстрее); не указано или указан 1 при
двух дорожках — автоматически; живая встреча (дорожки system нет в `meeting.json`) — вся запись делится, все «Спикер N».
Разделение по голосам — один долгий вызов без прогресса изнутри: процесс сообщает, сколько он примерно займёт, а main
двигает полоску по времени до 95 % шага.

- [ ] **Step 1: Тесты**

**Создать `src/main/transcription/routing.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { othersMode, planTracks, type TrackInput } from './routing';

const mic: TrackInput = { kind: 'mic', file: 'mic.webm', offsetSec: 0 };
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.3 };

describe('othersMode', () => {
  it('turns a number of voices into a way to split', () => {
    expect(othersMode(null)).toEqual({ mode: 'auto' });
    expect(othersMode(0)).toEqual({ mode: 'auto' });
    expect(othersMode(1)).toEqual({ mode: 'none' });
    expect(othersMode(4)).toEqual({ mode: 'fixed', speakers: 4 });
  });
});

describe('planTracks', () => {
  it('a call for two: me and one other, no splitting', () => {
    expect(planTracks([mic, system], true, 2)).toEqual([
      { track: mic, role: 'me', diarize: { mode: 'none' } },
      { track: system, role: 'others', diarize: { mode: 'none' } },
    ]);
  });

  it('a call for four: the others are split into three voices', () => {
    expect(planTracks([mic, system], true, 4)[1]?.diarize).toEqual({ mode: 'fixed', speakers: 3 });
  });

  it('no hint or a hint of one: the number of others is found automatically', () => {
    expect(planTracks([mic, system], true, null)[1]?.diarize).toEqual({ mode: 'auto' });
    expect(planTracks([mic, system], true, 1)[1]?.diarize).toEqual({ mode: 'auto' });
  });

  it('computer sound recorded but empty: only «me»', () => {
    expect(planTracks([mic], true, 3)).toEqual([{ track: mic, role: 'me', diarize: { mode: 'none' } }]);
  });

  it('a live meeting: the microphone hears everyone', () => {
    expect(planTracks([mic], false, 3)).toEqual([{ track: mic, role: 'others', diarize: { mode: 'fixed', speakers: 3 } }]);
    expect(planTracks([mic], false, null)[0]?.diarize).toEqual({ mode: 'auto' });
    expect(planTracks([mic], false, 1)[0]?.diarize).toEqual({ mode: 'none' });
  });

  it('computer sound without a microphone file', () => {
    expect(planTracks([system], true, 3)).toEqual([{ track: system, role: 'others', diarize: { mode: 'fixed', speakers: 2 } }]);
  });

  it('nothing to transcribe', () => {
    expect(planTracks([], false, 2)).toEqual([]);
  });
});
```

**Создать `src/main/transcription/progress.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { interpolateDiarize, overallFraction, planSteps } from './progress';
import { planTracks, type TrackInput } from './routing';

const mic: TrackInput = { kind: 'mic', file: 'mic.webm', offsetSec: 0 };
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.3 };

describe('progress', () => {
  const plans = planTracks([mic, system], true, 3);
  const steps = planSteps(plans, [100, 100]);

  it('lists the steps in order', () => {
    expect(steps.map((s) => s.stage)).toEqual(['prepare', 'me', 'prepare', 'diarize', 'others']);
  });

  it('grows from 0 to 1 across the steps', () => {
    expect(overallFraction(steps, 0, 0)).toBe(0);
    const middle = overallFraction(steps, 3, 0.5);
    expect(middle).toBeGreaterThan(overallFraction(steps, 3, 0));
    expect(middle).toBeLessThan(overallFraction(steps, 4, 0));
    expect(overallFraction(steps, 4, 1)).toBeCloseTo(1, 10);
    expect(overallFraction(steps, 4, 7)).toBeCloseTo(1, 10);
  });

  it('is zero without steps', () => {
    expect(overallFraction([], 0, 0.5)).toBe(0);
  });

  it('moves the diarization bar by time and stops short of the end', () => {
    const clock = { from: 0.4, to: 0.6, expectedMs: 1000 };
    expect(interpolateDiarize(clock, 0)).toBe(0.4);
    expect(interpolateDiarize(clock, 500)).toBeCloseTo(0.5, 10);
    expect(interpolateDiarize(clock, 10_000)).toBeCloseTo(0.59, 10);
    expect(interpolateDiarize({ ...clock, expectedMs: 0 }, 0)).toBeCloseTo(0.59, 10);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

```bash
npx vitest run src/main/transcription/routing.test.ts src/main/transcription/progress.test.ts
```

Expected: FAIL — нет `./routing` и `./progress`.

- [ ] **Step 3: Реализация**

**Создать `src/main/transcription/routing.ts`:**

```ts
// Какая дорожка как обрабатывается (спецификация Плана 3, §4.1).
import type { TrackKind } from '../../shared/meeting';

export interface TrackInput {
  kind: TrackKind;
  /** Файл дорожки (есть на диске и не пустой). */
  file: string;
  /** Сдвиг начала дорожки от начала встречи, с. */
  offsetSec: number;
}

/** Делить ли дорожку по голосам: нет (один голос), на известное число, или определить самим. */
export type DiarizeMode = { mode: 'none' } | { mode: 'fixed'; speakers: number } | { mode: 'auto' };

export interface TrackPlan {
  track: TrackInput;
  /** «me» — всё подписывается «Я»; «others» — «Спикер N». */
  role: 'me' | 'others';
  diarize: DiarizeMode;
}

/** Сколько голосов на дорожке собеседников: 1 — делить не нужно; неизвестно (или 0) — определить самим. */
export function othersMode(voices: number | null): DiarizeMode {
  if (voices === null || voices < 1) return { mode: 'auto' };
  if (voices === 1) return { mode: 'none' };
  return { mode: 'fixed', speakers: voices };
}

/**
 * План по дорожкам.
 * - Запись со звуком компьютера: микрофон — «Я»; звук компьютера — собеседники, их на одного меньше, чем участников.
 * - Запись без звука компьютера (живая встреча): микрофон слышит всех — делится по голосам, все — «Спикер N».
 * recordedSystem — писался ли звук компьютера (есть ли дорожка system в meeting.json), даже если её файл пуст.
 */
export function planTracks(
  tracks: readonly TrackInput[],
  recordedSystem: boolean,
  participantsHint: number | null,
): TrackPlan[] {
  const mic = tracks.find((t) => t.kind === 'mic');
  const system = tracks.find((t) => t.kind === 'system');
  if (!recordedSystem) {
    return mic ? [{ track: mic, role: 'others', diarize: othersMode(participantsHint) }] : [];
  }
  const others = othersMode(participantsHint === null ? null : participantsHint - 1);
  return [
    ...(mic ? [{ track: mic, role: 'me' as const, diarize: { mode: 'none' } as const }] : []),
    ...(system ? [{ track: system, role: 'others' as const, diarize: others }] : []),
  ];
}
```

**Создать `src/main/transcription/progress.ts`:**

```ts
// Доля выполненной работы по встрече: шаги взвешены по ожидаемому времени (спецификация Плана 3, §5.4).
import type { TranscriptionStage } from '../../shared/transcription';
import type { TrackPlan } from './routing';

/** Ожидаемое время шага на секунду звука (Ryzen 7 3700X, спайк: распознавание RTF 0,13, разделение 0,15). */
export const COST_PER_SEC = { prepare: 0.01, recognize: 0.13, diarize: 0.15 } as const;
/** Для оценки длительности разделения по голосам берём с запасом: прогресс не должен упираться в потолок. */
export const DIARIZE_ESTIMATE_PER_SEC = 0.25;
/** Пока идёт разделение (прогресса изнутри нет), полоска доходит до этой доли шага и ждёт. */
export const DIARIZE_CEILING = 0.95;

export interface Step {
  stage: Exclude<TranscriptionStage, 'queued' | 'download'>;
  /** Номер дорожки в плане. */
  track: number;
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

/** Общая доля при шаге index, выполненном на fraction (0…1): [начало шага, текущая]. */
export function overallFraction(steps: readonly Step[], index: number, fraction: number): number {
  const total = steps.reduce((sum, s) => sum + s.cost, 0);
  if (total <= 0) return 0;
  const before = steps.slice(0, index).reduce((sum, s) => sum + s.cost, 0);
  const current = (steps[index]?.cost ?? 0) * Math.min(1, Math.max(0, fraction));
  return Math.min(1, (before + current) / total);
}

/** Разделение по голосам — один долгий вызов без прогресса: main двигает полоску по времени. */
export interface DiarizeClock {
  /** Доля всей работы в начале и в конце шага. */
  from: number;
  to: number;
  expectedMs: number;
}

export function interpolateDiarize(clock: DiarizeClock, elapsedMs: number): number {
  const share = clock.expectedMs <= 0 ? DIARIZE_CEILING : Math.min(DIARIZE_CEILING, elapsedMs / clock.expectedMs);
  return clock.from + (clock.to - clock.from) * share;
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/transcription/routing.ts src/main/transcription/routing.test.ts src/main/transcription/progress.ts src/main/transcription/progress.test.ts
git commit -m "feat: plan the tracks of a meeting and weigh the transcription steps"
```

---

### Task 9: Звук дорожки → 16 кГц моно

**Files:**
- Create: `src/main/transcription/decode.ts`, `src/main/transcription/decode.test.ts`

Замечание спайка: пик памяти ≈ 3× звука (куски → склейка → копия). Здесь буфер выделяется сразу по длительности встречи
(+5 %) и растёт удвоением только при нехватке; `Buffer.allocUnsafeSlow` даёт свой `ArrayBuffer` с нулевым смещением —
`Float32Array` ложится на него без копии. ffmpeg — с пониженным приоритетом.

- [ ] **Step 1: Тест**

**Создать `src/main/transcription/decode.test.ts`:**

```ts
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { decodeToMono16k, SAMPLE_RATE } from './decode';

/** Тон 440 Гц заданной длины в WebM/Opus — как дорожка записи. */
function toneWebm(seconds: number): string {
  const file = join(makeTempDir(), 'mic.webm');
  execFileSync(resolveFfmpegPath(), [
    '-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-ac', '2', '-c:a', 'libopus', '-f', 'webm', file,
  ]);
  return file;
}

describe('decodeToMono16k', () => {
  it('decodes a track into 16 kHz mono samples', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), toneWebm(2), 2);
    expect(samples.length / SAMPLE_RATE).toBeCloseTo(2, 1);
    expect(Math.max(...samples.subarray(8000, 9000))).toBeGreaterThan(0.05);
  });

  it('grows the buffer when the track is longer than expected', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), toneWebm(3), 0);
    expect(samples.length / SAMPLE_RATE).toBeCloseTo(3, 1);
  });

  it('explains a file ffmpeg cannot read', async () => {
    const file = join(makeTempDir(), 'broken.webm');
    await expect(decodeToMono16k(resolveFfmpegPath(), file, 1)).rejects.toThrow('ffmpeg не прочитал дорожку');
  });

  it('rejects when ffmpeg cannot be started', async () => {
    await expect(decodeToMono16k(join(makeTempDir(), 'no-ffmpeg'), 'x', 1)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/transcription/decode.test.ts
```

Expected: FAIL — нет `./decode`.

- [ ] **Step 3: Реализация**

**Создать `src/main/transcription/decode.ts`:**

```ts
import { spawn } from 'node:child_process';
import { constants as osConstants, setPriority } from 'node:os';

export const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 4;
/** Запас к ожидаемой длительности: дорожка бывает чуть длиннее, чем показал таймер. */
const HEADROOM = 1.05;
const TAIL_CHARS = 2048;

/**
 * Дорожка → 16 кГц моно float32 через ffmpeg (stdout). Буфер выделяется сразу по ожидаемой длительности
 * и при нехватке растёт удвоением: пик памяти ≈ 1× звука, а не 3×, как у склейки кусков (замечание спайка).
 */
export function decodeToMono16k(ffmpegPath: string, file: string, expectedSec: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', 'pipe:1'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (child.pid !== undefined) {
      try {
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Не удалось понизить приоритет — не страшно.
      }
    }
    const initialSamples = Math.max(SAMPLE_RATE, Math.ceil(Math.max(0, expectedSec) * HEADROOM * SAMPLE_RATE));
    // allocUnsafeSlow: свой ArrayBuffer с нулевым смещением — Float32Array ляжет на него без копии.
    let buffer = Buffer.allocUnsafeSlow(initialSamples * BYTES_PER_SAMPLE);
    let used = 0;
    let errors = '';
    child.stdout.on('data', (chunk: Buffer) => {
      if (used + chunk.length > buffer.length) {
        let size = buffer.length * 2;
        while (size < used + chunk.length) size *= 2;
        const bigger = Buffer.allocUnsafeSlow(size);
        buffer.copy(bigger, 0, 0, used);
        buffer = bigger;
      }
      chunk.copy(buffer, used);
      used += chunk.length;
    });
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      errors = (errors + text).slice(-TAIL_CHARS);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg не прочитал дорожку (код ${code}): ${errors.trim().split('\n').slice(-2).join(' | ')}`));
        return;
      }
      const samples = Math.floor(used / BYTES_PER_SAMPLE);
      resolve(new Float32Array(buffer.buffer, buffer.byteOffset, samples));
    });
  });
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/transcription/decode.ts src/main/transcription/decode.test.ts
git commit -m "feat: decode a track into 16 kHz mono samples without extra copies"
```

---

### Task 10: Конвейер расшифровки на интерфейсах движков

**Files:**
- Create: `src/main/transcription/engines.ts`, `src/main/transcription/fake-engines.ts`,
  `src/main/transcription/pipeline.ts`, `src/main/transcription/pipeline.test.ts`

Шаги §4.2 решений. Каждый кусок ≤ 20 с — отдельная реплика (удобно для перехода по щелчку в Плане 4). Между кусками
`setImmediate` даёт процессу принять сообщение о смене числа потоков; распознаватель пересоздаётся, если число потоков
изменилось. Реплики с пустым текстом не пишутся. Дорожка, которую ffmpeg не прочитал, пропускается (в результате —
`skippedTracks`, очередь пишет их в журнал), если прочиталась хоть одна другая (решения §7); не прочиталась ни одна —
ошибка расшифровки. Поддельные движки (`fake-engines.ts`) нужны сквозным тестам и здесь —
как детектор речи по громкости.

- [ ] **Step 1: Тест**

**Создать `src/main/transcription/pipeline.test.ts`:**

```ts
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_RATE } from './decode';
import type { Engines } from './engines';
import { fakeEngines, loudIntervals } from './fake-engines';
import { runPipeline, type PipelineDeps, type PipelineInput, type PipelineProgress } from './pipeline';
import type { TrackInput } from './routing';
import type { Interval, Turn } from './turns';

/** Сигнал длиной seconds: громкий (0,1) в заданных участках, тишина вокруг. */
function signal(seconds: number, loud: Interval[]): Float32Array {
  const samples = new Float32Array(seconds * SAMPLE_RATE);
  for (const i of loud) samples.fill(0.1, Math.round(i.start * SAMPLE_RATE), Math.round(i.end * SAMPLE_RATE));
  return samples;
}

const mic: TrackInput = { kind: 'mic', file: 'mic.webm', offsetSec: 0 };
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.5 };

interface Setup {
  audio: Partial<Record<'mic' | 'system', Float32Array>>;
  turns?: Turn[];
  prints?: (samples: Float32Array) => Float32Array | null;
  threads?: () => number;
}

function setup({ audio, turns = [], prints, threads = () => 4 }: Setup) {
  const base = fakeEngines();
  const diarize = vi.fn((_samples: Float32Array, _speakers: number) => turns);
  const recognizerThreads: number[] = [];
  const engines: Engines = {
    detector: base.detector,
    recognizer: (n) => {
      recognizerThreads.push(n);
      return { recognize: (s) => `кусок ${(s.length / SAMPLE_RATE).toFixed(1)}` };
    },
    diarizer: () => ({ diarize }),
    voiceprints: () => ({ extract: prints ?? (() => Float32Array.from([1, 0])) }),
  };
  const progress: PipelineProgress[] = [];
  const deps: PipelineDeps = {
    engines,
    decode: async (track) => audio[track.kind] ?? new Float32Array(0),
    threads,
    onProgress: (p) => progress.push(p),
  };
  return { deps, diarize, progress, recognizerThreads };
}

const input = (over: Partial<PipelineInput>): PipelineInput => ({
  tracks: [mic, system],
  recordedSystem: true,
  participantsHint: 2,
  durationSec: 30,
  ...over,
});

describe('runPipeline', () => {
  it('a call for two: «me» from the microphone and one other from the computer sound, by time', async () => {
    const { deps, diarize } = setup({
      audio: { mic: signal(30, [{ start: 1, end: 3 }, { start: 10, end: 12 }]), system: signal(30, [{ start: 5, end: 8 }]) },
    });
    const result = await runPipeline(input({}), deps);
    expect(diarize).not.toHaveBeenCalled();
    expect(result.segments.map((s) => [s.id, s.speakerId, s.start])).toEqual([
      ['seg-1', 'me', 1],
      ['seg-2', 's1', 5.5],
      ['seg-3', 'me', 10],
    ]);
    expect(result.segments[1]?.end).toBeCloseTo(8.5, 5);
    expect(result.speakers).toEqual([
      { id: 'me', kind: 'me' },
      { id: 's1', kind: 'other' },
    ]);
  });

  it('splits the others into the given number of voices and numbers them by first appearance', async () => {
    const loud = [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 12, end: 14 }];
    const { deps, diarize } = setup({
      audio: { mic: signal(20, []), system: signal(20, loud) },
      turns: [
        { start: 0, end: 4, speaker: 2 },
        { start: 3, end: 9, speaker: 0 }, // наложение 3–4 с
        { start: 12, end: 14, speaker: 2 },
      ],
    });
    const result = await runPipeline(input({ participantsHint: 3, durationSec: 20 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), 2);
    expect(result.segments.map((s) => [s.speakerId, s.start - 0.5, s.end - 0.5])).toEqual([
      ['s1', 0, 3.5],
      ['s2', 3.5, 9],
      ['s1', 12, 14],
    ]);
  });

  it('finds the number of others by voiceprints when it is not given', async () => {
    const loud = [{ start: 0, end: 5 }, { start: 6, end: 11 }, { start: 12, end: 17 }];
    const voiceAt = (s: Float32Array) => (s.length > 0 ? Float32Array.from([1, 0]) : null);
    const { deps, diarize } = setup({
      audio: { system: signal(20, loud) },
      // Библиотека раздробила одного человека на три «спикера» — отпечатки одинаковые.
      turns: loud.map((i, n) => ({ ...i, speaker: n })),
      prints: voiceAt,
    });
    const result = await runPipeline(input({ tracks: [system], participantsHint: null, durationSec: 20 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), -1);
    expect(new Set(result.segments.map((s) => s.speakerId))).toEqual(new Set(['s1']));
  });

  it('gives turns without a voiceprint to the nearest speaker in time', async () => {
    // Два голоса отличаются громкостью: отпечаток — по первому отсчёту куска.
    const audio = signal(80, [{ start: 0, end: 30 }, { start: 31, end: 31.3 }]);
    audio.fill(0.3, 40 * SAMPLE_RATE, 70 * SAMPLE_RATE);
    const { deps } = setup({
      audio: { system: audio },
      turns: [
        { start: 0, end: 30, speaker: 0 },
        { start: 31, end: 31.3, speaker: 1 },
        { start: 40, end: 70, speaker: 2 },
      ],
      prints: (s) => {
        if (s.length < SAMPLE_RATE) return null;
        return (s[0] ?? 0) > 0.2 ? Float32Array.from([0, 1]) : Float32Array.from([1, 0]);
      },
    });
    const result = await runPipeline(input({ tracks: [system], participantsHint: null, durationSec: 80 }), deps);
    const at = (sec: number) => result.segments.find((s) => s.start <= sec + 0.5 && sec + 0.5 < s.end)?.speakerId;
    // Короткий ход 31–31,3 с без отпечатка — к ближайшему по времени (первому) спикеру.
    expect(at(31.1)).toBe(at(1));
    expect(at(50)).not.toBe(at(1));
  });

  it('does not lose speech that diarization missed', async () => {
    const loud = [{ start: 0, end: 3 }, { start: 5, end: 7 }];
    const { deps } = setup({
      audio: { system: signal(10, loud) },
      turns: [{ start: 0, end: 3, speaker: 0 }],
    });
    const result = await runPipeline(input({ tracks: [system], participantsHint: 3, durationSec: 10 }), deps);
    expect(result.segments.map((s) => [s.speakerId, s.start - 0.5])).toEqual([
      ['s1', 0],
      ['s1', 5],
    ]);
  });

  it('cuts a long turn into pieces of at most 20 s', async () => {
    const { deps } = setup({ audio: { mic: signal(50, [{ start: 0, end: 45 }]) } });
    const result = await runPipeline(input({ tracks: [mic], durationSec: 50 }), deps);
    expect(result.segments.length).toBeGreaterThanOrEqual(3);
    for (const s of result.segments) expect(s.end - s.start).toBeLessThanOrEqual(20);
  });

  it('a live meeting: everyone on the microphone becomes «Спикер N»', async () => {
    const { deps, diarize } = setup({
      audio: { mic: signal(10, [{ start: 0, end: 2 }, { start: 4, end: 6 }]) },
      turns: [
        { start: 0, end: 2, speaker: 1 },
        { start: 4, end: 6, speaker: 0 },
      ],
    });
    const result = await runPipeline(input({ tracks: [mic], recordedSystem: false, participantsHint: 2, durationSec: 10 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), 2);
    expect(result.segments.map((s) => s.speakerId)).toEqual(['s1', 's2']);
    expect(result.speakers.map((s) => s.kind)).toEqual(['other', 'other']);
  });

  it('recreates the recognizer when the number of threads changes', async () => {
    let threads = 4;
    const { deps, recognizerThreads } = setup({
      audio: { mic: signal(30, [{ start: 0, end: 2 }, { start: 5, end: 7 }, { start: 10, end: 12 }]) },
      threads: () => threads,
    });
    const run = runPipeline(input({ tracks: [mic] }), deps);
    threads = 2;
    await run;
    expect(recognizerThreads).toEqual([2]);
    const { deps: deps2, recognizerThreads: seen } = setup({
      audio: { mic: signal(30, [{ start: 0, end: 2 }, { start: 5, end: 7 }]) },
      threads: () => (seen.length === 0 ? 4 : 2),
    });
    await runPipeline(input({ tracks: [mic] }), deps2);
    expect(seen).toEqual([4, 2]);
  });

  it('reports growing progress with a clock for diarization', async () => {
    const { deps, progress } = setup({
      audio: { mic: signal(10, [{ start: 0, end: 2 }]), system: signal(10, [{ start: 3, end: 5 }]) },
      turns: [{ start: 3, end: 5, speaker: 0 }],
    });
    await runPipeline(input({ participantsHint: 4, durationSec: 10 }), deps);
    const fractions = progress.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(fractions.at(-1)).toBeCloseTo(1, 5);
    expect(progress.map((p) => p.stage)).toEqual(expect.arrayContaining(['prepare', 'me', 'diarize', 'others']));
    const clock = progress.find((p) => p.diarize);
    expect(clock?.diarize?.expectedMs).toBeGreaterThan(0);
    expect(clock?.diarize?.to).toBeGreaterThan(clock?.fraction ?? 1);
  });

  it('returns nothing for silence and skips empty texts', async () => {
    const { deps } = setup({ audio: { mic: signal(10, []), system: signal(10, []) } });
    expect(await runPipeline(input({ durationSec: 10 }), deps)).toEqual({ segments: [], speakers: [], skippedTracks: [] });
  });

  it('transcribes the readable track when the other one cannot be read', async () => {
    const { deps, progress } = setup({ audio: { system: signal(10, [{ start: 1, end: 3 }]) } });
    const broken: PipelineDeps = {
      ...deps,
      decode: async (track) => {
        if (track.kind === 'mic') throw new Error('ffmpeg не прочитал дорожку');
        return signal(10, [{ start: 1, end: 3 }]);
      },
    };
    const result = await runPipeline(input({ durationSec: 10 }), broken);
    expect(result.segments.map((s) => s.speakerId)).toEqual(['s1']);
    expect(result.skippedTracks).toEqual([{ kind: 'mic', message: 'ffmpeg не прочитал дорожку' }]);
    expect(progress.at(-1)?.fraction).toBeCloseTo(1, 5);
  });

  it('fails when no track can be read', async () => {
    const { deps } = setup({ audio: {} });
    const broken: PipelineDeps = { ...deps, decode: () => Promise.reject(new Error('ffmpeg не прочитал дорожку')) };
    await expect(runPipeline(input({ durationSec: 10 }), broken)).rejects.toThrow('ffmpeg не прочитал дорожку');
  });
});

describe('loudIntervals', () => {
  it('finds loud parts and joins short pauses', () => {
    const parts = loudIntervals(signal(5, [{ start: 1, end: 2 }, { start: 2.2, end: 3 }, { start: 4, end: 4.5 }]));
    expect(parts).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 4.5 },
    ]);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/transcription/pipeline.test.ts
```

Expected: FAIL — нет `./engines`, `./fake-engines`, `./pipeline`.

- [ ] **Step 3: Интерфейсы, поддельные движки, конвейер**

**Создать `src/main/transcription/engines.ts`:**

```ts
// Тонкие интерфейсы над нативными движками: конвейер проверяется без sherpa-onnx (поддельные движки в тестах).
import type { Interval, Turn } from './turns';

/** Детектор речи: участки речи на дорожке. */
export interface SpeechDetector {
  detect(samples: Float32Array): Interval[];
}

/** Распознавание куска речи (≤ 20 с) в текст. */
export interface Recognizer {
  recognize(samples: Float32Array): string;
}

/** Разделение по голосам: ходы спикеров; speakers = −1 — число определяет сама библиотека. */
export interface Diarizer {
  diarize(samples: Float32Array, speakers: number): Turn[];
}

/** «Отпечаток голоса» куска; null — кусок слишком короткий. */
export interface VoiceprintExtractor {
  extract(samples: Float32Array): Float32Array | null;
}

/** Фабрика движков. Тяжёлые создаются с числом потоков — его меняют во время записи (§5.3). */
export interface Engines {
  detector(): SpeechDetector;
  recognizer(threads: number): Recognizer;
  diarizer(threads: number): Diarizer;
  voiceprints(threads: number): VoiceprintExtractor;
}
```

**Создать `src/main/transcription/fake-engines.ts`:**

```ts
// Поддельные движки — только для автотестов (TEXTMEET_TEST_ASR=fake): мгновенно и без моделей.
// Речь — всё, что громче порога; «текст» — длина куска. Сквозные тесты проверяют склейку программы, а не качество.
import { SAMPLE_RATE } from './decode';
import type { Engines } from './engines';
import type { Interval } from './turns';

const FRAME_SEC = 0.1;
const LOUD_RMS = 0.005;
const JOIN_GAP_SEC = 0.3;

/** Участки громче порога (кадры по 0,1 с), паузы короче 0,3 с не разрывают участок. */
export function loudIntervals(samples: Float32Array, sampleRate = SAMPLE_RATE): Interval[] {
  const frame = Math.round(FRAME_SEC * sampleRate);
  const result: Interval[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let energy = 0;
    for (let j = i; j < i + frame; j++) energy += (samples[j] ?? 0) ** 2;
    if (Math.sqrt(energy / frame) < LOUD_RMS) continue;
    const start = i / sampleRate;
    const end = (i + frame) / sampleRate;
    const last = result.at(-1);
    if (last && start - last.end <= JOIN_GAP_SEC) result[result.length - 1] = { start: last.start, end };
    else result.push({ start, end });
  }
  return result;
}

export function fakeEngines(): Engines {
  return {
    detector: () => ({ detect: (samples) => loudIntervals(samples) }),
    recognizer: () => ({
      recognize: (samples) => `Проверка расшифровки, ${(samples.length / SAMPLE_RATE).toFixed(1).replace('.', ',')} с.`,
    }),
    diarizer: () => ({ diarize: (samples) => loudIntervals(samples).map((i) => ({ ...i, speaker: 0 })) }),
    voiceprints: () => ({ extract: () => Float32Array.from([1, 0, 0]) }),
  };
}
```

**Создать `src/main/transcription/pipeline.ts`:**

```ts
// Конвейер расшифровки одной встречи (спецификация Плана 3, §4.2). Нативных вызовов здесь нет — только engines.
import type { TrackKind } from '../../shared/meeting';
import { ME, otherSpeakerId, type SpeakerId } from '../../shared/transcript';
import type { TranscriptionStage } from '../../shared/transcription';
import { AUTO_CLUSTERING, clusterVoiceprints } from './clustering';
import { SAMPLE_RATE } from './decode';
import type { Engines, Recognizer } from './engines';
import { DIARIZE_ESTIMATE_PER_SEC, overallFraction, planSteps, type Step } from './progress';
import { planTracks, type TrackInput, type TrackPlan } from './routing';
import { splitAtQuietPoints } from './split';
import { exclusiveTurns, fillGaps, mergeTurns, renumberByFirstAppearance, type Interval, type Turn } from './turns';

export interface PipelineInput {
  /** Дорожки, которые есть на диске и не пустые. */
  tracks: TrackInput[];
  /** Писался ли звук компьютера (есть ли дорожка system в meeting.json). */
  recordedSystem: boolean;
  participantsHint: number | null;
  /** Длительность встречи, с — для буфера звука и оценки времени. */
  durationSec: number;
}

export interface PipelineProgress {
  stage: Exclude<TranscriptionStage, 'queued' | 'download'>;
  fraction: number;
  /** Начался долгий шаг разделения по голосам: доля в его конце и сколько он примерно займёт. */
  diarize?: { to: number; expectedMs: number };
}

export interface DraftSegment {
  start: number;
  end: number;
  speakerId: SpeakerId;
  text: string;
}

export interface PipelineResult {
  segments: (DraftSegment & { id: string })[];
  speakers: { id: SpeakerId; kind: 'me' | 'other' }[];
  /** Дорожки, которые не удалось прочитать: встреча расшифрована по остальным (решения Плана 3, §7). */
  skippedTracks: { kind: TrackKind; message: string }[];
}

export interface PipelineDeps {
  engines: Engines;
  decode(track: TrackInput, expectedSec: number): Promise<Float32Array>;
  /** Сколько потоков можно занять сейчас (во время записи — меньше). */
  threads(): number;
  onProgress(progress: PipelineProgress): void;
}

/** Отпечаток голоса снимается с начала хода — этого хватает, а длинные ходы не тормозят. */
const VOICEPRINT_MAX_SEC = 15;
/** Кусок короче не распознаётся. */
const MIN_PIECE_SEC = 0.1;

const slice = (samples: Float32Array, i: Interval): Float32Array =>
  // slice, а не subarray: нативному коду — отдельный буфер без смещения.
  samples.slice(Math.max(0, Math.floor(i.start * SAMPLE_RATE)), Math.min(samples.length, Math.ceil(i.end * SAMPLE_RATE)));

/** Дать процессу разобрать входящие сообщения (смена числа потоков) между тяжёлыми вызовами. */
const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Ходы без отпечатка голоса (−1) получают спикера ближайшего по времени хода. */
function assignByTime(turns: readonly Turn[]): Turn[] {
  const known = turns.filter((t) => t.speaker >= 0);
  if (known.length === 0) return turns.map((t) => ({ ...t, speaker: 0 }));
  const gap = (a: Interval, b: Interval): number => Math.max(0, a.start - b.end, b.start - a.end);
  return turns.map((t) =>
    t.speaker >= 0 ? t : { ...t, speaker: known.reduce((best, k) => (gap(t, k) < gap(t, best) ? k : best)).speaker },
  );
}

/** Распознаватель пересоздаётся, если сменилось число потоков (идёт/закончилась запись). */
class RecognizerHolder {
  private current: { threads: number; recognizer: Recognizer } | null = null;

  constructor(
    private readonly engines: Engines,
    private readonly threads: () => number,
  ) {}

  get(): Recognizer {
    const threads = this.threads();
    if (this.current?.threads !== threads) this.current = { threads, recognizer: this.engines.recognizer(threads) };
    return this.current.recognizer;
  }
}

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
    const step = this.steps[this.stepIndex];
    if (!step) return;
    this.deps.onProgress({
      stage: step.stage,
      fraction: overallFraction(this.steps, this.stepIndex, fraction),
      ...(diarize && { diarize: { to: overallFraction(this.steps, this.stepIndex, 1), expectedMs: diarize.expectedMs } }),
    });
  }

  next(): void {
    this.stepIndex += 1;
    this.report(0);
  }

  /** Дорожка не прочиталась: её шаги пропускаются. */
  skipTrack(track: number): void {
    while (this.steps[this.stepIndex]?.track === track) this.stepIndex += 1;
    this.report(0);
  }

  /** Ходы спикеров на дорожке собеседников (§4.2 п. 3–5, §4.4–4.6). */
  async others(samples: Float32Array, plan: TrackPlan): Promise<Turn[]> {
    const detector = this.deps.engines.detector();
    if (plan.diarize.mode === 'none') {
      return mergeTurns(detector.detect(samples).map((i) => ({ ...i, speaker: 0 })));
    }
    this.report(0, { expectedMs: (samples.length / SAMPLE_RATE) * DIARIZE_ESTIMATE_PER_SEC * 1000 });
    await breathe();
    const threads = this.deps.threads();
    const speakers = plan.diarize.mode === 'fixed' ? plan.diarize.speakers : -1;
    let turns = this.deps.engines.diarizer(threads).diarize(samples, speakers);
    if (plan.diarize.mode === 'auto') {
      const extractor = this.deps.engines.voiceprints(threads);
      const prints = turns.map((t) => ({
        durationSec: t.end - t.start,
        embedding: extractor.extract(slice(samples, { start: t.start, end: Math.min(t.end, t.start + VOICEPRINT_MAX_SEC) })),
      }));
      const labels = clusterVoiceprints(prints, AUTO_CLUSTERING);
      turns = assignByTime(turns.map((t, i) => ({ ...t, speaker: labels[i] ?? -1 })));
    }
    this.next();
    const filled = fillGaps(exclusiveTurns(turns), detector.detect(samples));
    return renumberByFirstAppearance(mergeTurns(filled));
  }

  /** Распознаёт ходы кусками ≤ 20 с; каждый кусок — отдельная реплика. */
  async recognize(samples: Float32Array, turns: readonly Turn[], plan: TrackPlan): Promise<DraftSegment[]> {
    const pieces = turns.flatMap((turn) =>
      splitAtQuietPoints(samples, SAMPLE_RATE, turn).map((piece) => ({ ...piece, speaker: turn.speaker })),
    );
    const total = pieces.reduce((sum, p) => sum + (p.end - p.start), 0);
    const segments: DraftSegment[] = [];
    let done = 0;
    for (const piece of pieces) {
      await breathe();
      const text = piece.end - piece.start < MIN_PIECE_SEC ? '' : this.recognizer.get().recognize(slice(samples, piece)).trim();
      done += piece.end - piece.start;
      this.report(total > 0 ? done / total : 1);
      if (text === '') continue;
      segments.push({
        start: piece.start + plan.track.offsetSec,
        end: piece.end + plan.track.offsetSec,
        speakerId: plan.role === 'me' ? ME : otherSpeakerId(piece.speaker),
        text,
      });
    }
    return segments;
  }
}

/** Расшифровывает встречу: дорожки по плану §4.1, реплики обеих дорожек по времени. */
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const plans = planTracks(input.tracks, input.recordedSystem, input.participantsHint);
  const durations = plans.map(() => input.durationSec);
  const steps = planSteps(plans, durations);
  const run = new Run(deps, steps);
  run.report(0);

  const segments: DraftSegment[] = [];
  const skippedTracks: PipelineResult['skippedTracks'] = [];
  for (const [index, plan] of plans.entries()) {
    let samples: Float32Array;
    try {
      samples = await deps.decode(plan.track, input.durationSec);
    } catch (err) {
      // Не прочиталась ни одна дорожка — встреча не расшифровывается; иначе — по остальным дорожкам.
      if (index === plans.length - 1 && skippedTracks.length === index) throw err;
      skippedTracks.push({ kind: plan.track.kind, message: err instanceof Error ? err.message : String(err) });
      run.skipTrack(index);
      continue;
    }
    run.next();
    const turns =
      plan.role === 'me'
        ? mergeTurns(deps.engines.detector().detect(samples).map((i) => ({ ...i, speaker: 0 })))
        : await run.others(samples, plan);
    segments.push(...(await run.recognize(samples, turns, plan)));
    run.next();
  }

  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  const ids = [...new Set(sorted.map((s) => s.speakerId))].sort((a, b) =>
    a === ME ? -1 : b === ME ? 1 : Number(a.slice(1)) - Number(b.slice(1)),
  );
  return {
    segments: sorted.map((s, i) => ({ ...s, id: `seg-${i + 1}` })),
    speakers: ids.map((id) => ({ id, kind: id === ME ? 'me' : 'other' })),
    skippedTracks,
  };
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/transcription/engines.ts src/main/transcription/fake-engines.ts src/main/transcription/pipeline.ts src/main/transcription/pipeline.test.ts
git commit -m "feat: add the transcription pipeline over engine interfaces"
```

---

### Task 11: Движки sherpa-onnx и процесс расшифровки

**Files:**
- Create: `src/main/transcription/sherpa-onnx-node.d.ts`, `src/main/transcription/sherpa-engines.ts`,
  `src/main/transcription/protocol.ts`, `src/main/transcription/worker.ts`, `src/test-support/model-fixtures.ts`,
  `src/main/transcription/sherpa.int.test.ts`
- Modify: `electron.vite.config.ts`

sherpa-onnx-node — CommonJS без типов; `.d.ts` описывает только используемую часть. `OfflineSpeakerDiarization.process`
синхронный; `setConfig` меняет число кластеров без перезагрузки моделей. Процесс расшифровки загружает нативную
библиотеку при старте и сразу сообщает `ready` с её версией — если библиотека не открылась, main узнает об этом по
падению процесса. Интеграционный тест: запись четырёх человек — на китайском, русская GigaAM даёт по ней пустой текст,
поэтому разделение проверяется с настоящими моделями голосов и «текстом» вместо распознавания.

- [ ] **Step 1: Интеграционный тест и открытые записи для него**

**Создать `src/test-support/model-fixtures.ts`:**

```ts
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
```

**Создать `src/main/transcription/sherpa.int.test.ts`:**

```ts
// Интеграционные тесты на настоящих моделях: npm run test:models (первый прогон скачивает ~360 МБ).
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureModels, fixture, MODELS_ROOT } from '../../test-support/model-fixtures';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { modelPaths } from '../models/registry';
import { decodeToMono16k } from './decode';
import type { Engines } from './engines';
import { runPipeline, type PipelineInput } from './pipeline';
import { sherpaEngines } from './sherpa-engines';

const THREADS = 4;
let example = '';
let four = '';

beforeAll(async () => {
  await ensureModels();
  example = await fixture('gigaamExample');
  four = await fixture('fourSpeakers');
});

const engines = () => sherpaEngines(modelPaths(MODELS_ROOT));
/** Запись четырёх человек — на китайском: русская GigaAM даёт по ней пустой текст, а пустые реплики не пишутся.
 *  Поэтому разделение по голосам проверяется с настоящими моделями голосов, но с «текстом» вместо распознавания. */
const withoutAsr = (): Engines => ({ ...engines(), recognizer: () => ({ recognize: () => 'реплика' }) });
const run = (input: PipelineInput, useAsr = true) =>
  runPipeline(input, {
    engines: useAsr ? engines() : withoutAsr(),
    decode: (track, expectedSec) => decodeToMono16k(resolveFfmpegPath(), track.file, expectedSec),
    threads: () => THREADS,
    onProgress: () => undefined,
  });

describe('sherpa-onnx engines', () => {
  it('GigaAM recognizes the reference recording', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), example, 12);
    const text = engines().recognizer(THREADS).recognize(samples);
    expect(text).toContain('У лукоморья дуб зелёный');
  });

  it('the speech detector finds speech and nothing in silence', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), example, 12);
    const speech = engines().detector().detect(samples);
    expect(speech.length).toBeGreaterThan(0);
    expect(speech[0]!.start).toBeLessThan(1);
    expect(engines().detector().detect(new Float32Array(16_000 * 3))).toEqual([]);
  });

  it('finds four speakers of a four-person talk without a hint', async () => {
    const result = await run({
      tracks: [{ kind: 'system', file: four, offsetSec: 0 }],
      recordedSystem: true,
      participantsHint: null,
      durationSec: 57,
    }, false);
    expect(result.speakers.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('a two-track meeting: «me» and the others by time', async () => {
    const asr = await run({
      tracks: [{ kind: 'mic', file: example, offsetSec: 0 }],
      recordedSystem: true,
      participantsHint: 5,
      durationSec: 12,
    });
    expect(asr.segments.map((s) => s.text).join(' ').toLowerCase()).toContain('у лукоморья дуб зелёный');
    const result = await run({
      tracks: [
        { kind: 'mic', file: example, offsetSec: 0 },
        { kind: 'system', file: four, offsetSec: 20 },
      ],
      recordedSystem: true,
      participantsHint: 5,
      durationSec: 80,
    }, false);
    expect(result.speakers.map((s) => s.id)).toEqual(['me', 's1', 's2', 's3', 's4']);
    const firstOther = result.segments.find((s) => s.speakerId !== 'me');
    expect(firstOther!.start).toBeGreaterThanOrEqual(20);
    expect(result.segments.filter((s) => s.speakerId === 'me').at(-1)!.end).toBeLessThan(13);
  });
});
```

- [ ] **Step 2: Типы, движки, сообщения, процесс**

**Создать `src/main/transcription/sherpa-onnx-node.d.ts`:**

```ts
// Типы той части sherpa-onnx-node (CommonJS без собственных типов), которой пользуется TextMeet.
// Все вызовы, возвращающие массивы, — с enableExternalBuffer = false: иначе в Electron
// «External buffers are not allowed» (итоги спайка, §2).
declare module 'sherpa-onnx-node' {
  export interface Waveform {
    sampleRate: number;
    samples: Float32Array;
  }

  export interface OfflineStream {
    acceptWaveform(wave: Waveform): void;
  }

  export class OfflineRecognizer {
    constructor(config: object);
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    getResult(stream: OfflineStream): { text?: string };
  }

  export interface SpeechSegment {
    /** Номер первого отсчёта участка речи. */
    start: number;
    samples: Float32Array;
  }

  export class Vad {
    constructor(config: object, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    front(enableExternalBuffer?: boolean): SpeechSegment;
    pop(): void;
    flush(): void;
  }

  export interface DiarizationSegment {
    start: number;
    end: number;
    speaker: number;
  }

  export class OfflineSpeakerDiarization {
    constructor(config: object);
    readonly sampleRate: number;
    process(samples: Float32Array): DiarizationSegment[];
    setConfig(config: { clustering: { numClusters: number; threshold: number } }): void;
  }

  export interface EmbeddingStream {
    acceptWaveform(wave: Waveform): void;
    inputFinished(): void;
  }

  export class SpeakerEmbeddingExtractor {
    constructor(config: object);
    readonly dim: number;
    createStream(): EmbeddingStream;
    isReady(stream: EmbeddingStream): boolean;
    compute(stream: EmbeddingStream, enableExternalBuffer?: boolean): Float32Array;
  }

  export const version: string;
}
```

**Создать `src/main/transcription/sherpa-engines.ts`:**

```ts
// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import type { ModelPaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import type { Engines, SpeechDetector } from './engines';
import type { Interval } from './turns';

/** Порог кластеризации библиотеки в авто-режиме: намеренно дробит — группирует clustering.ts (§4.4). */
const AUTO_THRESHOLD = 0.5;
const VAD_WINDOW = 512;
/** Буфер детектора речи, с: больше самого длинного участка (maxSpeechDuration). */
const VAD_BUFFER_SEC = 60;

export const sherpaVersion = (): string => `sherpa-onnx ${sherpa.version}`;

function detector(paths: ModelPaths): SpeechDetector {
  return {
    detect(samples: Float32Array): Interval[] {
      const vad = new sherpa.Vad(
        {
          sileroVad: {
            model: paths.vad,
            threshold: 0.5,
            minSpeechDuration: 0.25,
            minSilenceDuration: 0.5,
            maxSpeechDuration: 20,
            windowSize: VAD_WINDOW,
          },
          sampleRate: SAMPLE_RATE,
          numThreads: 1,
          provider: 'cpu',
          debug: 0,
        },
        VAD_BUFFER_SEC,
      );
      const found: Interval[] = [];
      const drain = (): void => {
        while (!vad.isEmpty()) {
          const segment = vad.front(false);
          found.push({
            start: segment.start / SAMPLE_RATE,
            end: (segment.start + segment.samples.length) / SAMPLE_RATE,
          });
          vad.pop();
        }
      };
      for (let i = 0; i < samples.length; i += VAD_WINDOW) {
        vad.acceptWaveform(samples.slice(i, i + VAD_WINDOW));
        drain();
      }
      vad.flush();
      drain();
      return found;
    },
  };
}

/** Движки sherpa-onnx; разделение по голосам и отпечатки кешируются по числу потоков. */
export function sherpaEngines(paths: ModelPaths): Engines {
  const diarizers = new Map<number, sherpa.OfflineSpeakerDiarization>();
  const extractors = new Map<number, sherpa.SpeakerEmbeddingExtractor>();
  return {
    detector: () => detector(paths),
    recognizer: (threads) => {
      const recognizer = new sherpa.OfflineRecognizer({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
        modelConfig: {
          transducer: { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner },
          tokens: paths.tokens,
          modelType: 'nemo_transducer',
          numThreads: threads,
          provider: 'cpu',
          debug: 0,
        },
      });
      return {
        recognize(samples: Float32Array): string {
          const stream = recognizer.createStream();
          stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
          recognizer.decode(stream);
          return String(recognizer.getResult(stream).text ?? '');
        },
      };
    },
    diarizer: (threads) => ({
      diarize(samples: Float32Array, speakers: number) {
        let sd = diarizers.get(threads);
        if (!sd) {
          sd = new sherpa.OfflineSpeakerDiarization({
            segmentation: { pyannote: { model: paths.segmentation }, numThreads: threads, provider: 'cpu', debug: 0 },
            embedding: { model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 },
            clustering: { numClusters: speakers, threshold: AUTO_THRESHOLD },
            minDurationOn: 0.2,
            minDurationOff: 0.5,
          });
          diarizers.set(threads, sd);
        }
        sd.setConfig({ clustering: { numClusters: speakers, threshold: AUTO_THRESHOLD } });
        return sd.process(samples).map((s) => ({ start: s.start, end: s.end, speaker: s.speaker }));
      },
    }),
    voiceprints: (threads) => {
      let extractor = extractors.get(threads);
      if (!extractor) {
        extractor = new sherpa.SpeakerEmbeddingExtractor({ model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 });
        extractors.set(threads, extractor);
      }
      const ready = extractor;
      return {
        extract(samples: Float32Array): Float32Array | null {
          const stream = ready.createStream();
          stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
          stream.inputFinished();
          return ready.isReady(stream) ? ready.compute(stream, false) : null;
        },
      };
    },
  };
}
```

**Создать `src/main/transcription/protocol.ts`:**

```ts
// Сообщения между main и процессом расшифровки (utilityProcess). Проверяются zod с обеих сторон.
import { z } from 'zod';
import { TrackKindSchema } from '../../shared/meeting';
import { SpeakerIdSchema } from '../../shared/transcript';

const TrackInputSchema = z.object({ kind: TrackKindSchema, file: z.string().min(1), offsetSec: z.number().nonnegative() });

export const PipelineInputSchema = z.object({
  tracks: z.array(TrackInputSchema).max(2),
  recordedSystem: z.boolean(),
  participantsHint: z.number().int().min(1).max(50).nullable(),
  durationSec: z.number().nonnegative(),
});

export const MainToWorkerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('transcribe'),
    jobId: z.string().min(1),
    input: PipelineInputSchema,
    modelsDir: z.string().min(1),
    ffmpegPath: z.string().min(1),
    threads: z.number().int().min(1).max(64),
  }),
  z.object({ type: z.literal('threads'), threads: z.number().int().min(1).max(64) }),
]);

const StageSchema = z.enum(['prepare', 'me', 'diarize', 'others']);

export const WorkerToMainSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), engine: z.string() }),
  z.object({
    type: z.literal('progress'),
    jobId: z.string(),
    progress: z.object({
      stage: StageSchema,
      fraction: z.number().min(0).max(1),
      diarize: z.object({ to: z.number().min(0).max(1), expectedMs: z.number().nonnegative() }).optional(),
    }),
  }),
  z.object({
    type: z.literal('done'),
    jobId: z.string(),
    result: z.object({
      segments: z.array(
        z.object({
          id: z.string(),
          start: z.number(),
          end: z.number(),
          speakerId: SpeakerIdSchema,
          text: z.string(),
        }),
      ),
      speakers: z.array(z.object({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) })),
      skippedTracks: z.array(z.object({ kind: TrackKindSchema, message: z.string() })).default([]),
    }),
  }),
  z.object({ type: z.literal('failed'), jobId: z.string(), message: z.string() }),
]);

export type MainToWorker = z.infer<typeof MainToWorkerSchema>;
export type WorkerToMain = z.infer<typeof WorkerToMainSchema>;
export type TranscribeCommand = Extract<MainToWorker, { type: 'transcribe' }>;
```

**Создать `src/main/transcription/worker.ts`:**

```ts
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
```

- [ ] **Step 3: Второй вход сборки main**

**Заменить целиком `electron.vite.config.ts`:**

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Второй вход main — процесс расшифровки (utilityProcess): out/main/transcription-worker.js рядом с index.js.
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'transcription-worker': resolve(__dirname, 'src/main/transcription/worker.ts'),
        },
      },
    },
  },
  // Один preload (src/preload/index.ts) на оба окна — см. «Факты» в плане.
  // Preload в песочнице не может подключать пакеты: если туда случайно попадёт импорт пакета,
  // пусть он встроится в сам файл, а не превратится в require(), который окно не выполнит.
  preload: { build: { externalizeDeps: false } },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/main/index.html'),
          recorder: resolve(__dirname, 'src/renderer/recorder/index.html'),
        },
      },
    },
  },
});
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
npm run build
npm run test:models
```

Expected: проверка типов и модульные тесты проходят; в `out/main/` есть `index.js` и `transcription-worker.js`;
`test:models` при первом запуске скачивает ~360 МБ моделей и две открытые записи (минуты), затем 4 теста проходят
(на Ryzen 7 3700X — около 20 с).

- [ ] **Step 5: Коммит**

```bash
git add electron.vite.config.ts src/main/transcription/sherpa-onnx-node.d.ts src/main/transcription/sherpa-engines.ts src/main/transcription/protocol.ts src/main/transcription/worker.ts src/test-support/model-fixtures.ts src/main/transcription/sherpa.int.test.ts
git commit -m "feat: run sherpa-onnx engines in a transcription process"
```

---

### Task 12: Тексты уведомлений и ошибок расшифровки

**Files:**
- Modify: `src/main/texts.ts`, `src/main/texts.test.ts`

Место для моделей — в мегабайтах с округлением вверх: `formatBytes` показал бы «0,3 ГБ» и преуменьшил бы нужное.

- [ ] **Step 1: Тесты**

**В `src/main/texts.test.ts` заменить:**

```ts
  systemSettingsUrl,
} from './texts';
```

**на:**

```ts
  systemSettingsUrl,
  transcriptionTexts,
} from './texts';
```

**В `src/main/texts.test.ts` заменить:**

```ts
} from './texts';
```

**на:**

```ts
} from './texts';
import { DownloadError } from './models/download';
```

**В `src/main/texts.test.ts` заменить:**

```ts
    );
  });
});
```

**на:**

```ts
    );
  });
});

describe('transcription texts', () => {
  it('names the meeting in notifications', () => {
    expect(notificationTexts.transcribed('Созвон с Ириной')).toEqual({ title: 'Текст встречи готов', body: 'Созвон с Ириной' });
    expect(notificationTexts.transcribeFailed('Созвон').body).toContain('Повторить');
  });

  it('explains why models could not be prepared', () => {
    expect(transcriptionTexts.download(new DownloadError('network', 'x'))).toContain('нет связи');
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toMatch(/нужно \d+ МБ/);
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
    expect(transcriptionTexts.download(new Error('что-то'))).toBe('Не удалось подготовить модели расшифровки: что-то');
    expect(transcriptionTexts.download('строка')).toContain('строка');
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

```bash
npx vitest run src/main/texts.test.ts
```

Expected: FAIL — `transcriptionTexts` и новых уведомлений ещё нет.

- [ ] **Step 3: Тексты**

**В `src/main/texts.ts` заменить:**

```ts
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
```

**на:**

```ts
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { DownloadError } from './models/download';
import { TOTAL_MODELS_SIZE } from './models/registry';
```

**В `src/main/texts.ts` заменить:**

```ts
  recorderBroken: (): NotificationText => ({ title: 'Запись не работает', body: RECORDER_BROKEN_TEXT }),
};
```

**на:**

```ts
  recorderBroken: (): NotificationText => ({ title: 'Запись не работает', body: RECORDER_BROKEN_TEXT }),
  transcribed: (meetingTitle: string): NotificationText => ({ title: 'Текст встречи готов', body: meetingTitle }),
  transcribeFailed: (meetingTitle: string): NotificationText => ({
    title: 'Не удалось расшифровать встречу',
    body: `${meetingTitle}. Причина и кнопка «Повторить» — в окне встречи.`,
  }),
};

/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
  hung: 'Расшифровка зависла и была остановлена.',
  badMessage: 'Процесс расшифровки прислал неверные данные.',
  download(err: unknown): string {
    if (!(err instanceof DownloadError)) {
      return `Не удалось подготовить модели расшифровки: ${err instanceof Error ? err.message : String(err)}`;
    }
    switch (err.kind) {
      case 'network':
        return 'Не удалось скачать модель расшифровки: нет связи с сервером. Проверьте интернет.';
      case 'corrupt':
        return 'Скачанный файл модели повреждён — при повторе он скачается заново.';
      case 'space':
        // В мегабайтах с округлением вверх: «0,3 ГБ» преуменьшало бы нужное место.
        return `Не хватает места на диске для модели расшифровки (нужно ${Math.ceil(TOTAL_MODELS_SIZE / 1024 ** 2)} МБ).`;
      case 'disk':
        return 'Не удалось сохранить модель расшифровки на диск.';
    }
  },
};
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/texts.ts src/main/texts.test.ts
git commit -m "feat: add transcription notifications and error texts"
```

---

### Task 13: Очередь расшифровки в main

**Files:**
- Create: `src/main/transcription/job-input.ts`, `src/main/transcription/queue.ts`, `src/main/transcription/queue.test.ts`

Решения §5. Процесс внедряется (`WorkerHandle`), в тестах — подделка. Статусы: `queued` → `transcribing` → `done` | `error`.
Повторная постановка той же встречи во время расшифровки убивает процесс и начинает заново (надёжнее, чем прерывать
нативный вызов). Сторож: нет сообщений дольше max(10 мин, половины длительности встречи) — процесс убивается, встреча —
«зависла»; на время разделения по голосам срок — в 6 раз больше оценки этого шага (оценка — по длине звука, поэтому
сторож верен и для восстановленной записи без длительности). Процесс без задач закрывается через 5 минут.

Ревью прототипа нашло здесь две гонки — обе исправлены в коде ниже и закрыты тестами:
- выход процесса, убитого сторожем или простоем, приходит позже и мог «уронить» задачу следующей встречи, а
  следующая задача могла уйти в умирающий процесс — теперь у задачи свой процесс (`Current.worker`), чужие выходы и
  сообщения игнорируются, при каждом убийстве `this.worker` обнуляется;
- `dispose()` при выходе из программы помечал встречу ошибкой, и она не продолжалась при запуске — теперь выход
  отменяет задачу без записи ошибки (встреча остаётся «расшифровывается» и продолжится), очередь останавливается.
Ещё: результат, пришедший после повторной постановки той же встречи, отбрасывается; неверное сообщение процесса
завершает задачу сразу, а не через сторожа; `isBusy()` учитывает и встречу, которую только ставят в очередь.

- [ ] **Step 1: Тест**

**Создать `src/main/transcription/queue.test.ts`:**

```ts
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, readMeeting, updateMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import { DownloadError } from '../models/download';
import { transcriptionTexts } from '../texts';
import type { MainToWorker, TranscribeCommand, WorkerToMain } from './protocol';
import { IDLE_SHUTDOWN_MS, TranscriptionQueue, WATCHDOG_MIN_MS, type WorkerHandle } from './queue';

/** Поддельный процесс расшифровки: запоминает команды, тест присылает ответы и «роняет» его. */
class FakeWorker implements WorkerHandle {
  readonly sent: MainToWorker[] = [];
  killed = false;
  /** Настоящий процесс завершается не сразу после kill(): выход приходит позже (exit()). */
  deferExit = false;
  private messageListener: (message: unknown) => void = () => undefined;
  private exitListener: (code: number | null) => void = () => undefined;

  send(message: MainToWorker): void {
    this.sent.push(message);
  }
  kill(): void {
    if (this.killed) return;
    this.killed = true;
    if (!this.deferExit) this.exitListener(null);
  }
  exit(code: number | null = null): void {
    this.exitListener(code);
  }
  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }
  onExit(listener: (code: number | null) => void): void {
    this.exitListener = listener;
  }
  post(message: WorkerToMain | unknown): void {
    this.messageListener(message);
  }
  crash(code = 1): void {
    this.killed = true;
    this.exitListener(code);
  }
  transcribes(): TranscribeCommand[] {
    return this.sent.filter((m): m is TranscribeCommand => m.type === 'transcribe');
  }
}

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };

async function recordedMeeting(lib: string, patch: Partial<Meeting> = {}): Promise<Meeting> {
  const meeting = await createMeeting(lib, { source: 'recording', status: 'recording' });
  writeFileSync(join(audioDir(lib, meeting.id), 'mic.webm'), 'x');
  writeFileSync(join(audioDir(lib, meeting.id), 'system.webm'), 'x');
  return updateMeeting(lib, meeting.id, (m) => ({
    ...m,
    status: 'recorded',
    durationSec: 60,
    participantsHint: 2,
    tracks: [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 250 },
    ],
    ...patch,
  }));
}

function setup(
  overrides: { ensure?: (onProgress: (p: { done: number; total: number }) => void) => Promise<void>; deferExit?: boolean } = {},
) {
  const workers: FakeWorker[] = [];
  const finished: { meeting: Meeting; ok: boolean }[] = [];
  const progress: TranscriptionProgress[][] = [];
  let now = 1_000;
  let threads = 7;
  const queue = new TranscriptionQueue({
    spawn: () => {
      const worker = new FakeWorker();
      worker.deferExit = overrides.deferExit ?? false;
      workers.push(worker);
      return worker;
    },
    models: { root: 'M', ensure: overrides.ensure ?? (async () => undefined) },
    ffmpegPath: () => 'ffmpeg',
    threads: () => threads,
    now: () => now,
    logger,
    libraryChanged: vi.fn(),
    progressChanged: (p) => progress.push(p),
    finished: (event) => finished.push(event),
  });
  return {
    queue,
    workers,
    finished,
    progress,
    worker: () => workers.at(-1)!,
    setNow: (value: number) => {
      now = value;
    },
    setThreads: (value: number) => {
      threads = value;
    },
  };
}

const done = (jobId: string): WorkerToMain => ({
  type: 'done',
  jobId,
  result: {
    segments: [
      { id: 'seg-1', start: 0, end: 2, speakerId: 'me', text: 'Привет.' },
      { id: 'seg-2', start: 2.5, end: 4, speakerId: 's1', text: 'Здравствуйте.' },
    ],
    speakers: [
      { id: 'me', kind: 'me' },
      { id: 's1', kind: 'other' },
    ],
    skippedTracks: [],
  },
});

/** Ждёт, пока процесс получит n-ю команду «расшифровать». */
async function transcribeSent(get: () => FakeWorker | undefined, n = 1): Promise<TranscribeCommand> {
  await vi.waitFor(() => expect(get()?.transcribes().length ?? 0).toBeGreaterThanOrEqual(n));
  return get()!.transcribes()[n - 1]!;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TranscriptionQueue', () => {
  it('transcribes a meeting: queued → transcribing → transcript.json and «done»', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    expect(command).toMatchObject({ modelsDir: 'M', ffmpegPath: 'ffmpeg', threads: 7 });
    expect(command.input).toEqual({
      tracks: [
        { kind: 'mic', file: join(audioDir(lib, meeting.id), 'mic.webm'), offsetSec: 0 },
        { kind: 'system', file: join(audioDir(lib, meeting.id), 'system.webm'), offsetSec: 0.25 },
      ],
      recordedSystem: true,
      participantsHint: 2,
      durationSec: 60,
    });
    expect((await readMeeting(lib, meeting.id)).status).toBe('transcribing');

    t.worker().post({ type: 'progress', jobId: command.jobId, progress: { stage: 'me', fraction: 0.4 } });
    expect(t.queue.progress()).toEqual([{ meetingId: meeting.id, stage: 'me', fraction: 0.4, download: null }]);

    t.worker().post(done(command.jobId));
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
    const t = setup();
    await t.queue.enqueue(lib, meeting.id, 4);
    expect((await transcribeSent(t.worker)).input.participantsHint).toBe(4);
    expect((await readMeeting(lib, meeting.id)).participantsHint).toBe(4);
  });

  it('refuses a meeting that is still being recorded', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'recording' });
    await expect(setup().queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.stillRecording);
  });

  it('notes a track that could not be read and keeps the text of the other one', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    const { result } = done(command.jobId) as Extract<WorkerToMain, { type: 'done' }>;
    t.worker().post({ type: 'done', jobId: command.jobId, result: { ...result, skippedTracks: [{ kind: 'mic', message: 'битый файл' }] } });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('дорожка mic не прочитана — битый файл'));
  });

  it('marks the meeting with the reason when the process fails', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'failed', jobId: command.jobId, message: 'ffmpeg не прочитал дорожку' });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ status: 'error', errorMessage: 'ffmpeg не прочитал дорожку' });
    expect(t.finished[0]?.ok).toBe(false);
  });

  it('survives a crash of the process and starts a new one for the next meeting', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    await transcribeSent(t.worker);
    t.worker().crash();
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const next = await transcribeSent(t.worker);
    expect(await readMeeting(lib, first.id)).toMatchObject({ status: 'error', errorMessage: transcriptionTexts.crashed });
    t.worker().post(done(next.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
    expect((await readMeeting(lib, second.id)).status).toBe('done');
  });

  it('stops a process that stays silent too long', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.workers[0]?.killed).toBe(true);
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.hung);
  });

  it('restarts a meeting that is asked again while it is transcribed', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    await t.queue.enqueue(lib, meeting.id, 3);
    expect(t.workers[0]?.killed).toBe(true);
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const second = await transcribeSent(t.worker);
    expect(second.input.participantsHint).toBe(3);
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.ok).toBe(true);
    expect((await readMeeting(lib, meeting.id)).status).toBe('done');
  });

  it('does not queue the same meeting twice', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup({ ensure: () => new Promise(() => undefined) });
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    await t.queue.enqueue(lib, second.id);
    expect(t.queue.progress().filter((p) => p.stage === 'queued').map((p) => p.meetingId)).toEqual([second.id]);
    expect(t.queue.isBusy()).toBe(true);
  });

  it('shows the download of models and explains a failed download', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({
      ensure: async (onProgress) => {
        onProgress({ done: 100, total: 400 });
        throw new DownloadError('network', 'нет связи с сервером');
      },
    });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.progress.flat()).toContainEqual({
      meetingId: meeting.id,
      stage: 'download',
      fraction: 0,
      download: { done: 100, total: 400 },
    });
    expect((await readMeeting(lib, meeting.id)).errorMessage).toContain('нет связи');
    expect(t.workers).toHaveLength(0);
  });

  it('fails clearly when there are no recorded tracks', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { tracks: [] });
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.noTracks);
  });

  it('skips a meeting whose folder disappeared', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'queued' });
    rmSync(join(lib, meeting.id), { recursive: true });
    const t = setup();
    t.queue.resume(lib, [{ kind: 'ok', meeting, mixReady: false, mixFailed: false }]);
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.workers).toHaveLength(0);
    expect(t.finished).toHaveLength(0);
    expect(existsSync(join(lib, meeting.id))).toBe(false);
  });

  it('resumes queued and interrupted meetings after a restart, in order', async () => {
    const lib = makeTempDir();
    const a = await recordedMeeting(lib, { status: 'queued' });
    const b = await recordedMeeting(lib, { status: 'transcribing' });
    const c = await recordedMeeting(lib, { status: 'done' });
    const t = setup();
    t.queue.resume(
      lib,
      [a, b, c].map((meeting) => ({ kind: 'ok' as const, meeting, mixReady: true, mixFailed: false })),
    );
    const first = await transcribeSent(t.worker);
    expect(first.input.tracks[0]?.file).toContain(a.id);
    t.worker().post(done(first.jobId));
    const second = await transcribeSent(t.worker, 2);
    expect(second.input.tracks[0]?.file).toContain(b.id);
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
  });

  it('tells the process about fewer threads during a recording', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    t.setThreads(2);
    t.queue.threadsChanged();
    expect(t.worker().sent.at(-1)).toEqual({ type: 'threads', threads: 2 });
  });

  it('moves the bar by time during diarization and ignores foreign messages', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'ready', engine: 'sherpa-onnx 1.13.8' });
    t.worker().post({
      type: 'progress',
      jobId: command.jobId,
      progress: { stage: 'diarize', fraction: 0.4, diarize: { to: 0.6, expectedMs: 10_000 } },
    });
    t.setNow(1_000 + 5_000);
    expect(t.queue.progress()[0]?.fraction).toBeCloseTo(0.5, 10);
    t.worker().post({ type: 'progress', jobId: 'job-999', progress: { stage: 'others', fraction: 0.9 } });
    t.worker().post({ type: 'nonsense' });
    expect(t.queue.progress()[0]?.stage).toBe('diarize');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('неверное сообщение'));
  });

  it('closes an idle process after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.worker().killed).toBe(false);
    vi.advanceTimersByTime(IDLE_SHUTDOWN_MS + 1);
    expect(t.worker().killed).toBe(true);
  });

  it('kills the process on dispose', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    t.queue.dispose();
    expect(t.worker().killed).toBe(true);
  });

  it('keeps a late exit of a stopped process away from the next meeting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup({ deferExit: true });
    await t.queue.enqueue(lib, first.id);
    await transcribeSent(t.worker);
    await t.queue.enqueue(lib, second.id);
    // Сторож останавливает первый процесс, но тот завершается не сразу.
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const next = await transcribeSent(t.worker);
    t.workers[0]!.exit(1);
    t.worker().post(done(next.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
    expect(t.finished.map((f) => f.ok)).toEqual([false, true]);
    expect((await readMeeting(lib, second.id)).status).toBe('done');
  });

  it('on quit leaves the meeting to be resumed and starts nothing new', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    await transcribeSent(t.worker);
    t.queue.dispose();
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.workers).toHaveLength(1);
    expect(t.finished).toHaveLength(0);
    expect((await readMeeting(lib, first.id)).status).toBe('transcribing');
    expect((await readMeeting(lib, second.id)).status).toBe('queued');
    await t.queue.enqueue(lib, second.id);
    expect(t.workers).toHaveLength(1);
  });

  it('drops a result that arrives after the meeting was asked again', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({ deferExit: true });
    await t.queue.enqueue(lib, meeting.id);
    const first = await transcribeSent(t.worker);
    await t.queue.enqueue(lib, meeting.id, 3);
    t.workers[0]!.post(done(first.jobId));
    t.workers[0]!.exit();
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const second = await transcribeSent(t.worker);
    expect(second.input.participantsHint).toBe(3);
    expect(t.finished).toHaveLength(0);
    expect(await readTranscript(lib, meeting.id)).toBeNull();
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
  });

  it('does not start a meeting that was asked again while models were being prepared', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup({ ensure: () => ready });
    await t.queue.enqueue(lib, meeting.id);
    await t.queue.enqueue(lib, meeting.id, 3);
    release();
    const command = await transcribeSent(t.worker);
    expect(command.input.participantsHint).toBe(3);
    expect(t.worker().transcribes()).toHaveLength(1);
  });

  it('fails at once when the process sends broken data for the current meeting', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'done', jobId: command.jobId, result: { segments: [{ speakerId: '../x' }], speakers: [] } });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.badMessage);
    expect(t.workers[0]?.killed).toBe(true);
  });

  it('waits longer while diarization runs, in proportion to the length of the audio', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { durationSec: null });
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({
      type: 'progress',
      jobId: command.jobId,
      progress: { stage: 'diarize', fraction: 0.2, diarize: { to: 0.6, expectedMs: 5 * 60_000 } },
    });
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    expect(t.worker().killed).toBe(false);
    vi.advanceTimersByTime(30 * 60_000);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.hung);
  });

  it('counts a meeting being put in the queue as busy', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    const pending = t.queue.enqueue(lib, meeting.id);
    expect(t.queue.isBusy()).toBe(true);
    await pending;
  });

  it('shows a restarted meeting once in the progress', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({ ensure: () => new Promise(() => undefined) });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.queue.progress()[0]?.stage).toBe('prepare'));
    await t.queue.enqueue(lib, meeting.id);
    expect(t.queue.progress().map((p) => p.meetingId)).toEqual([meeting.id]);
  });

  it('closes an idle process before models are deleted, but not a busy one', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.queue.stopIdleWorker();
    expect(t.worker().killed).toBe(false);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    t.queue.stopIdleWorker();
    expect(t.worker().killed).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/transcription/queue.test.ts
```

Expected: FAIL — нет `./queue`.

- [ ] **Step 3: Вход конвейера и очередь**

**Создать `src/main/transcription/job-input.ts`:**

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../shared/meeting';
import { audioDir } from '../library/library';
import type { PipelineInput } from './pipeline';
import type { TrackInput } from './routing';

async function nonEmpty(file: string): Promise<boolean> {
  return fsp.stat(file).then(
    (stats) => stats.isFile() && stats.size > 0,
    () => false,
  );
}

/** Что расшифровывать: дорожки встречи, которые есть на диске и не пустые, со сдвигами в секундах. */
export async function buildPipelineInput(libraryDir: string, meeting: Meeting): Promise<PipelineInput> {
  const dir = audioDir(libraryDir, meeting.id);
  const tracks: TrackInput[] = [];
  for (const track of meeting.tracks) {
    const file = join(dir, track.file);
    if (await nonEmpty(file)) tracks.push({ kind: track.kind, file, offsetSec: track.startOffsetMs / 1000 });
  }
  return {
    tracks,
    recordedSystem: meeting.tracks.some((t) => t.kind === 'system'),
    participantsHint: meeting.participantsHint,
    durationSec: meeting.durationSec ?? 0,
  };
}
```

**Создать `src/main/transcription/queue.ts`:**

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
import { interpolateDiarize, type DiarizeClock } from './progress';
import { WorkerToMainSchema, type MainToWorker } from './protocol';

/** Процесс расшифровки глазами очереди (в программе — utilityProcess, в тестах — подделка). */
export interface WorkerHandle {
  send(message: MainToWorker): void;
  kill(): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number | null) => void): void;
}

export interface TranscriptionQueueDeps {
  spawn(): WorkerHandle;
  models: { root: string; ensure(onProgress: (progress: DownloadProgress) => void): Promise<void> };
  ffmpegPath(): string;
  /** Сколько потоков можно занять сейчас (во время записи — меньше, §5.3). */
  threads(): number;
  now(): number;
  logger: Logger;
  /** Статус встречи изменился — список встреч надо перечитать. */
  libraryChanged(): void;
  progressChanged(progress: TranscriptionProgress[]): void;
  /** Расшифровка встречи закончилась (для уведомления). */
  finished(event: { libraryDir: string; meeting: Meeting; ok: boolean }): void;
}

/** Процесс без сообщений дольше max(10 мин, половины длительности встречи) — завис (§5.2). */
export const WATCHDOG_MIN_MS = 10 * 60_000;
export const WATCHDOG_SHARE = 0.5;
/**
 * Разделение по голосам и группировка — долгие вызовы без сообщений. На время этого шага сторож ждёт в столько раз
 * дольше оценки его длительности: оценка — по длине звука, поэтому сторож работает и у восстановленной записи,
 * у которой длительность встречи ещё неизвестна.
 */
export const DIARIZE_WATCHDOG_FACTOR = 6;
/** Процесс без задач закрывается: модели занимают ~1 ГБ памяти. */
export const IDLE_SHUTDOWN_MS = 5 * 60_000;
/** Прогресс в окно — не чаще. */
export const PROGRESS_INTERVAL_MS = 500;

interface Job {
  /** Папка библиотеки на момент постановки: папку в настройках могут сменить, пока встреча ждёт. */
  libraryDir: string;
  meetingId: string;
}

type Outcome = { kind: 'done'; result: PipelineResult } | { kind: 'failed'; message: string } | { kind: 'cancelled' };

interface Current {
  job: Job;
  jobId: string | null;
  /** Процесс, на котором идёт эта задача: сообщения и выход других процессов её не касаются. */
  worker: WorkerHandle | null;
  progress: TranscriptionProgress;
  clock: (DiarizeClock & { startedAt: number }) | null;
  cancelled: boolean;
  /** Задача в процессе расшифровки: завершить её (один раз). */
  settle: ((outcome: Outcome) => void) | null;
  /** Сообщение от процесса — сторож зависания начинает отсчёт заново (с новым сроком). */
  rearm: ((limitMs: number) => void) | null;
  /** Обычный срок сторожа для этой встречи. */
  baseLimitMs: number;
}

const sameJob = (a: Job, b: Job): boolean => a.libraryDir === b.libraryDir && a.meetingId === b.meetingId;

export class TranscriptionQueue {
  private readonly queue: Job[] = [];
  private current: Current | null = null;
  /** Задача взята из очереди, но ещё готовится (запись статуса) — для isBusy. */
  private active: Job | null = null;
  private pendingEnqueues = 0;
  private worker: WorkerHandle | null = null;
  private running = false;
  private disposed = false;
  private jobCounter = 0;
  private lastEmit = 0;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: TranscriptionQueueDeps) {}

  /**
   * Поставить встречу в очередь («Расшифровать», «Расшифровать заново», «Повторить», после окна «Запись
   * остановлена»). participantsHint: undefined — оставить как в meeting.json. Если встреча уже расшифровывается —
   * работа прерывается и начинается заново.
   */
  async enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null): Promise<void> {
    this.pendingEnqueues += 1;
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
        if (m.status === 'recording') throw new Error(transcriptionTexts.stillRecording);
        return {
          ...m,
          status: 'queued',
          errorMessage: null,
          ...(participantsHint !== undefined && { participantsHint }),
        };
      });
      this.deps.libraryChanged();
      this.add({ libraryDir, meetingId });
    } finally {
      this.pendingEnqueues -= 1;
    }
  }

  /** При запуске программы: встречи, ждавшие очереди, и прерванные выходом на середине расшифровки. */
  resume(libraryDir: string, entries: readonly MeetingListEntry[]): void {
    for (const entry of entries) {
      if (entry.kind === 'ok' && (entry.meeting.status === 'queued' || entry.meeting.status === 'transcribing')) {
        this.add({ libraryDir, meetingId: entry.meeting.id });
      }
    }
  }

  /** Началась или закончилась запись: процессу — новое число потоков. */
  threadsChanged(): void {
    this.worker?.send({ type: 'threads', threads: this.deps.threads() });
  }

  progress(): TranscriptionProgress[] {
    const current = this.current;
    const queued = this.queue
      .filter((job) => !current || job.meetingId !== current.job.meetingId)
      .map((job) => ({ meetingId: job.meetingId, stage: 'queued' as const, fraction: 0, download: null }));
    if (!current) return queued;
    const { progress, clock } = current;
    const fraction = clock ? interpolateDiarize(clock, this.deps.now() - clock.startedAt) : progress.fraction;
    return [{ ...progress, fraction }, ...queued];
  }

  /** Идёт, готовится или ждёт расшифровка — модели удалять нельзя. */
  isBusy(): boolean {
    return this.current !== null || this.active !== null || this.queue.length > 0 || this.pendingEnqueues > 0;
  }

  /** Перед удалением моделей: закрыть простаивающий процесс — он держит файлы моделей открытыми. */
  stopIdleWorker(): void {
    if (!this.isBusy()) this.killWorker(this.worker);
  }

  /**
   * Выход из программы: процесс закрывается, очередь останавливается. Встречи остаются в статусах «в очереди» /
   * «расшифровывается» и продолжатся при следующем запуске (resume) — ошибкой они не помечаются.
   */
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    clearTimeout(this.watchdog);
    clearInterval(this.ticker);
    if (this.current) this.current.cancelled = true;
    this.killWorker(this.worker);
  }

  private killWorker(worker: WorkerHandle | null): void {
    if (!worker) return;
    if (this.worker === worker) this.worker = null;
    worker.kill();
  }

  private add(job: Job): void {
    if (this.disposed) return;
    const current = this.current;
    if (current && sameJob(current.job, job)) {
      current.cancelled = true;
      this.killWorker(current.worker);
    }
    if (!this.queue.some((queued) => sameJob(queued, job))) this.queue.push(job);
    this.emitProgress(true);
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    clearTimeout(this.idleTimer);
    for (let job = this.queue.shift(); job !== undefined && !this.disposed; job = this.queue.shift()) {
      this.active = job;
      try {
        await this.runJob(job);
      } catch (err) {
        this.deps.logger.error(`Очередь расшифровки: сбой задачи ${job.meetingId}`, err);
      } finally {
        this.active = null;
      }
    }
    this.running = false;
    if (this.disposed) return;
    this.emitProgress(true);
    this.idleTimer = setTimeout(() => this.killWorker(this.worker), IDLE_SHUTDOWN_MS);
  }

  private async runJob(job: Job): Promise<void> {
    const { libraryDir, meetingId } = job;
    let meeting: Meeting;
    try {
      meeting = await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, status: 'transcribing', errorMessage: null }));
    } catch (err) {
      this.deps.logger.warn(`Расшифровка: встреча ${meetingId} не найдена — задача снята (${(err as Error).message})`);
      return;
    }
    const current: Current = {
      job,
      jobId: null,
      worker: null,
      progress: { meetingId, stage: 'prepare', fraction: 0, download: null },
      clock: null,
      cancelled: this.disposed,
      settle: null,
      rearm: null,
      baseLimitMs: WATCHDOG_MIN_MS,
    };
    this.current = current;
    this.deps.libraryChanged();
    this.emitProgress(true);
    this.ticker = setInterval(() => this.emitProgress(true), 1000);
    this.deps.logger.info(`Расшифровка началась: ${meetingId}`);
    try {
      await this.deps.models
        .ensure((download) => this.setProgress(current, { stage: 'download', fraction: 0, download }))
        .catch((err: unknown) => {
          throw new Error(transcriptionTexts.download(err), { cause: err });
        });
      if (current.cancelled) return;
      const input = await buildPipelineInput(libraryDir, meeting);
      if (current.cancelled) return;
      if (input.tracks.length === 0) throw new Error(transcriptionTexts.noTracks);
      const outcome = await this.runInWorker(current, input);
      // Встречу поставили заново (или программа закрывается), пока шла работа: этот результат не нужен.
      if (current.cancelled || outcome.kind === 'cancelled') return;
      if (outcome.kind === 'failed') throw new Error(outcome.message);
      for (const skipped of outcome.result.skippedTracks) {
        this.deps.logger.warn(`Расшифровка ${meetingId}: дорожка ${skipped.kind} не прочитана — ${skipped.message}`);
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
      this.deps.logger.info(`Расшифровка готова: ${meetingId}, реплик ${outcome.result.segments.length}`);
      this.deps.finished({ libraryDir, meeting: done, ok: true });
    } catch (err) {
      if (current.cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      this.deps.logger.error(`Расшифровка не удалась: ${meetingId}`, err);
      const failed = await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, status: 'error', errorMessage: message })).catch(
        (writeErr: unknown) => {
          this.deps.logger.error(`Не удалось записать ошибку расшифровки: ${meetingId}`, writeErr);
          return null;
        },
      );
      if (failed) this.deps.finished({ libraryDir, meeting: failed, ok: false });
    } finally {
      clearInterval(this.ticker);
      this.current = null;
      if (!this.disposed) {
        this.deps.libraryChanged();
        this.emitProgress(true);
      }
    }
  }

  private runInWorker(current: Current, input: PipelineInput): Promise<Outcome> {
    return new Promise((resolve) => {
      const worker = this.ensureWorker();
      current.worker = worker;
      current.jobId = `job-${++this.jobCounter}`;
      current.baseLimitMs = Math.max(WATCHDOG_MIN_MS, input.durationSec * 1000 * WATCHDOG_SHARE);
      const arm = (limitMs: number): void => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
          this.deps.logger.error(`Процесс расшифровки молчит ${Math.round(limitMs / 1000)} с — останавливаем`);
          current.settle?.({ kind: 'failed', message: transcriptionTexts.hung });
          this.killWorker(worker);
        }, limitMs);
      };
      current.settle = (outcome) => {
        current.settle = null;
        current.rearm = null;
        clearTimeout(this.watchdog);
        resolve(outcome);
      };
      current.rearm = arm;
      arm(current.baseLimitMs);
      worker.send({
        type: 'transcribe',
        jobId: current.jobId,
        input,
        modelsDir: this.deps.models.root,
        ffmpegPath: this.deps.ffmpegPath(),
        threads: this.deps.threads(),
      });
    });
  }

  private ensureWorker(): WorkerHandle {
    if (this.worker) return this.worker;
    const worker = this.deps.spawn();
    this.worker = worker;
    worker.onMessage((raw) => this.onWorkerMessage(worker, raw));
    worker.onExit((code) => {
      if (this.worker === worker) this.worker = null;
      const current = this.current;
      // Выход прежнего процесса (закрыт простоем, сторожем или отменой) текущей задачи не касается.
      if (!current?.settle || current.worker !== worker) return;
      if (current.cancelled) {
        current.settle({ kind: 'cancelled' });
        return;
      }
      this.deps.logger.error(`Процесс расшифровки завершился с кодом ${code}`);
      current.settle({ kind: 'failed', message: transcriptionTexts.crashed });
    });
    return worker;
  }

  private onWorkerMessage(worker: WorkerHandle, raw: unknown): void {
    const current = this.current;
    const ours = current !== null && current.worker === worker;
    const parsed = WorkerToMainSchema.safeParse(raw);
    if (!parsed.success) {
      this.deps.logger.warn(`Процесс расшифровки: неверное сообщение: ${parsed.error.message}`);
      // Не ждать сторожа 10+ минут: задача, для которой пришли неверные данные, завершается сразу.
      if (ours && current.settle) {
        current.settle({ kind: 'failed', message: transcriptionTexts.badMessage });
        this.killWorker(worker);
      }
      return;
    }
    const message = parsed.data;
    if (message.type === 'ready') {
      this.deps.logger.info(`Процесс расшифровки запущен (${message.engine})`);
      return;
    }
    if (!ours || message.jobId !== current.jobId) return;
    if (message.type === 'progress') {
      const { stage, fraction, diarize } = message.progress;
      current.clock = diarize ? { from: fraction, to: diarize.to, expectedMs: diarize.expectedMs, startedAt: this.deps.now() } : null;
      current.rearm?.(diarize ? Math.max(current.baseLimitMs, diarize.expectedMs * DIARIZE_WATCHDOG_FACTOR) : current.baseLimitMs);
      this.setProgress(current, { stage, fraction, download: null });
      return;
    }
    current.settle?.(message.type === 'done' ? { kind: 'done', result: message.result } : { kind: 'failed', message: message.message });
  }

  private setProgress(current: Current, next: Omit<TranscriptionProgress, 'meetingId'>): void {
    const stageChanged = current.progress.stage !== next.stage;
    current.progress = { meetingId: current.job.meetingId, ...next };
    this.emitProgress(stageChanged);
  }

  private emitProgress(force: boolean): void {
    const now = this.deps.now();
    if (!force && now - this.lastEmit < PROGRESS_INTERVAL_MS) return;
    this.lastEmit = now;
    this.deps.progressChanged(this.progress());
  }
}
```

- [ ] **Step 4: Проверка**

```bash
npm run typecheck
npm test
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/main/transcription/job-input.ts src/main/transcription/queue.ts src/main/transcription/queue.test.ts
git commit -m "feat: queue transcriptions in main with progress, watchdog and resume"
```

---

### Task 14: Склейка с программой: окно «Запись остановлена», IPC, процесс, уведомления

**Files:**
- Create: `src/main/transcription/worker-host.ts`
- Modify: `src/main/recording/controller.ts`, `src/main/recording/controller.test.ts`, `src/shared/ipc.ts`,
  `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/notifications.ts`, `src/main/index.ts`

«Расшифровать» и «Пропустить» в окне «Запись остановлена» оба ставят встречу в очередь (не удалось сохранить ответ —
не ставят). Процесс расшифровки: `utilityProcess.fork(out/main/transcription-worker.js)`, сообщения до события `spawn`
копятся. Потоков — все ядра, кроме одного (не больше 8); во время записи — 2 (решение пользователя: замедлять, а не
останавливать). В тестовом режиме `TEXTMEET_TEST_ASR=fake` модели не проверяются и не скачиваются.

- [ ] **Step 1: Тест автомата записи**

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    enqueueMix: vi.fn(),
    timeouts: { startMs: 300, stopMs: 300 },
```

**на:**

```ts
    enqueueMix: vi.fn(),
    enqueueTranscription: vi.fn(),
    timeouts: { startMs: 300, stopMs: 300 },
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    expect(h.state().stopDialog).toBeNull();
    expect(h.deps.libraryChanged).toHaveBeenCalled();
  });
```

**на:**

```ts
    expect(h.state().stopDialog).toBeNull();
    expect(h.deps.libraryChanged).toHaveBeenCalled();
    expect(h.deps.enqueueTranscription).toHaveBeenCalledWith(h.lib, command.meetingId);
  });
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ title, participantsHint: null });
  });
```

**на:**

```ts
    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ title, participantsHint: null });
    // «Пропустить» тоже запускает расшифровку — число участников программа определит сама.
    expect(h.deps.enqueueTranscription).toHaveBeenCalledWith(h.lib, command.meetingId);
  });
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    ).rejects.toThrow(/^Не удалось сохранить ответ/);

    expect(h.state().stopDialog).toBeNull();
  });

  it('keeps the dialog open when the number of participants cannot be saved', async () => {
```

**на:**

```ts
    ).rejects.toThrow(/^Не удалось сохранить ответ/);

    expect(h.state().stopDialog).toBeNull();
    expect(h.deps.enqueueTranscription).not.toHaveBeenCalled();
  });

  it('keeps the dialog open when the number of participants cannot be saved', async () => {
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
npx vitest run src/main/recording/controller.test.ts
```

Expected: FAIL — `enqueueTranscription` не вызывается (и проверка типов ругается на лишнее поле).

- [ ] **Step 3: Автомат записи ставит встречу в очередь**

**В `src/main/recording/controller.ts` заменить:**

```ts
  enqueueMix(libraryDir: string, meetingId: string): void;
  openTracks?: typeof openTrackFiles;
```

**на:**

```ts
  enqueueMix(libraryDir: string, meetingId: string): void;
  /** Ответ в окне «Запись остановлена» сохранён — встреча уходит в очередь расшифровки (и при «Пропустить»). */
  enqueueTranscription(libraryDir: string, meetingId: string): void;
  openTracks?: typeof openTrackFiles;
```

**В `src/main/recording/controller.ts` заменить:**

```ts
    const skipped = answer.participantsHint === null;
    let saved = false;
```

**на:**

```ts
    const skipped = answer.participantsHint === null;
    const libraryDir = this.deps.libraryDir();
    let saved = false;
```

**В `src/main/recording/controller.ts` заменить:**

```ts
    try {
      await updateMeeting(this.deps.libraryDir(), answer.meetingId, (m) => ({
        ...m,
```

**на:**

```ts
    try {
      await updateMeeting(libraryDir, answer.meetingId, (m) => ({
        ...m,
```

**В `src/main/recording/controller.ts` заменить:**

```ts
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.update({ stopDialog: null });
    }
    this.deps.libraryChanged();
  }

  start(): Promise<void> {
```

**на:**

```ts
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.update({ stopDialog: null });
    }
    this.deps.libraryChanged();
    this.deps.enqueueTranscription(libraryDir, answer.meetingId);
  }

  start(): Promise<void> {
```

- [ ] **Step 4: Контракт IPC и preload**

**В `src/shared/ipc.ts` заменить:**

```ts
import type { Settings } from './settings';
```

**на:**

```ts
import type { Settings } from './settings';
import type { Transcript } from './transcript';
import type { ModelGroupId, ModelsState, TranscribeRequest, TranscriptionProgress } from './transcription';
```

**В `src/shared/ipc.ts` заменить:**

```ts
  openSystemSettings: 'system:open-settings',
  // main → главное окно (события).
```

**на:**

```ts
  openSystemSettings: 'system:open-settings',
  transcribe: 'transcription:start',
  getTranscript: 'transcription:get-transcript',
  getTranscriptionProgress: 'transcription:get-progress',
  getModels: 'models:get',
  deleteModels: 'models:delete',
  // main → главное окно (события).
```

**В `src/shared/ipc.ts` заменить:**

```ts
  libraryChanged: 'library:changed',
  // main → окно записи (команды).
```

**на:**

```ts
  libraryChanged: 'library:changed',
  transcriptionProgress: 'transcription:progress',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  // main → окно записи (команды).
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.openSystemSettings]: { arg: SystemSettingsKind; result: void };
}
```

**на:**

```ts
  [IPC.openSystemSettings]: { arg: SystemSettingsKind; result: void };
  [IPC.transcribe]: { arg: TranscribeRequest; result: void };
  [IPC.getTranscript]: { arg: string; result: Transcript | null };
  [IPC.getTranscriptionProgress]: { arg: void; result: TranscriptionProgress[] };
  [IPC.getModels]: { arg: void; result: ModelsState };
  [IPC.deleteModels]: { arg: ModelGroupId; result: ModelsState };
}
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.libraryChanged]: void;
}
```

**на:**

```ts
  [IPC.libraryChanged]: void;
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.showMeeting]: string;
}
```

**В `src/shared/ipc.ts` заменить:**

```ts
  openSystemSettings(kind: SystemSettingsKind): Promise<void>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
```

**на:**

```ts
  openSystemSettings(kind: SystemSettingsKind): Promise<void>;
  /** «Расшифровать», «Расшифровать заново», «Повторить». */
  transcribe(request: TranscribeRequest): Promise<void>;
  /** Текст встречи; null — ещё не расшифрована. */
  getTranscript(meetingId: string): Promise<Transcript | null>;
  getTranscriptionProgress(): Promise<TranscriptionProgress[]>;
  getModels(): Promise<ModelsState>;
  deleteModels(group: ModelGroupId): Promise<ModelsState>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
```

**В `src/shared/ipc.ts` заменить:**

```ts
  onLibraryChanged(listener: () => void): Unsubscribe;
}
```

**на:**

```ts
  onLibraryChanged(listener: () => void): Unsubscribe;
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
}
```

**В `src/preload/index.ts` заменить:**

```ts
  openSystemSettings: (kind) => invoke(IPC.openSystemSettings, kind),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
```

**на:**

```ts
  openSystemSettings: (kind) => invoke(IPC.openSystemSettings, kind),
  transcribe: (request) => invoke(IPC.transcribe, request),
  getTranscript: (meetingId) => invoke(IPC.getTranscript, meetingId),
  getTranscriptionProgress: () => invoke(IPC.getTranscriptionProgress),
  getModels: () => invoke(IPC.getModels),
  deleteModels: (group) => invoke(IPC.deleteModels, group),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
```

**В `src/preload/index.ts` заменить:**

```ts
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
};
```

**на:**

```ts
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onShowMeeting: (listener) => subscribe(IPC.showMeeting, listener),
};
```

- [ ] **Step 5: Обработчики main, уведомления, запуск процесса**

**В `src/main/ipc.ts` заменить:**

```ts
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { humanFsError } from './fs/fs-errors';
```

**на:**

```ts
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelGroupState, ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
```

**В `src/main/ipc.ts` заменить:**

```ts
import { listMeetings, meetingDir } from './library/library';
import type { Logger } from './logger';
```

**на:**

```ts
import { listMeetings, meetingDir } from './library/library';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
```

**В `src/main/ipc.ts` заменить:**

```ts
  hotkeyChanged(): void;
}
```

**на:**

```ts
  hotkeyChanged(): void;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null): Promise<void>;
    progress(): TranscriptionProgress[];
    isBusy(): boolean;
    stopIdleWorker(): void;
  };
  models: {
    state(): Promise<ModelGroupState[]>;
    remove(group: 'gigaam' | 'voices'): Promise<void>;
  };
}
```

**В `src/main/ipc.ts` заменить:**

```ts
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
```

**на:**

```ts
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';

const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
});
```

**В `src/main/ipc.ts` заменить:**

```ts

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
```

**на:**

```ts

  handle(IPC.transcribe, async (arg) => {
    const request = TranscribeRequestSchema.parse(arg);
    await deps.transcription.enqueue(deps.libraryDir(), request.meetingId, request.participantsHint);
  });

  handle(IPC.getTranscript, (arg) => readTranscript(deps.libraryDir(), MeetingIdSchema.parse(arg)));

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
      await deps.models.remove(group);
    } catch (err) {
      throw humanFsError('Не удалось удалить модели', err);
    }
    return modelsState();
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
```

**В `src/main/notifications.ts` заменить:**

```ts

export type Notify = (text: NotificationText, onlyWhenAway?: boolean) => void;
```

**на:**

```ts

/** onClick — что сделать после открытия окна (например, показать встречу). */
export type Notify = (text: NotificationText, onlyWhenAway?: boolean, onClick?: () => void) => void;
```

**В `src/main/notifications.ts` заменить:**

```ts
  const shown = new Set<Notification>();
  return (text, onlyWhenAway = false) => {
    if (onlyWhenAway && deps.isWindowActive()) return;
```

**на:**

```ts
  const shown = new Set<Notification>();
  return (text, onlyWhenAway = false, onClick) => {
    if (onlyWhenAway && deps.isWindowActive()) return;
```

**В `src/main/notifications.ts` заменить:**

```ts
    shown.add(notification);
    notification.on('click', () => deps.openWindow());
    notification.on('close', () => shown.delete(notification));
```

**на:**

```ts
    shown.add(notification);
    notification.on('click', () => {
      deps.openWindow();
      onClick?.();
    });
    notification.on('close', () => shown.delete(notification));
```

**Создать `src/main/transcription/worker-host.ts`:**

```ts
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
```

- [ ] **Step 6: Точка входа**

**В `src/main/index.ts` заменить:**

```ts
import { join } from 'node:path';
```

**на:**

```ts
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
```

**В `src/main/index.ts` заменить:**

```ts
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { createNotifier, type Notify } from './notifications';
```

**на:**

```ts
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { ModelManager } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
import { createNotifier, type Notify } from './notifications';
```

**В `src/main/index.ts` заменить:**

```ts
import { dialogTexts, notificationTexts } from './texts';
import { createTray, type AppTray } from './tray';
```

**на:**

```ts
import { dialogTexts, notificationTexts } from './texts';
import { TranscriptionQueue } from './transcription/queue';
import { spawnTranscriptionWorker } from './transcription/worker-host';
import { createTray, type AppTray } from './tray';
```

**В `src/main/index.ts` заменить:**

```ts
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
```

**на:**

```ts
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
// Только для автотестов: поддельные движки расшифровки (worker.ts) — без моделей и их скачивания.
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';

/** Потоков для расшифровки: все ядра, кроме одного (не больше 8); во время записи — 2 (§5.3 решений Плана 3). */
const FULL_THREADS = Math.max(1, Math.min(8, availableParallelism() - 1));
const RECORDING_THREADS = Math.min(2, FULL_THREADS);
```

**В `src/main/index.ts` заменить:**

```ts
let recorderReady = false;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
```

**на:**

```ts
let recorderReady = false;
let transcription: TranscriptionQueue | null = null;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
```

**В `src/main/index.ts` заменить:**

```ts
    await controller.stopForQuit();
  } catch (err) {
```

**на:**

```ts
    await controller.stopForQuit();
    transcription?.dispose();
  } catch (err) {
```

**В `src/main/index.ts` заменить:**

```ts

/** При запуске: закрыть прерванные сбоем записи и досвести то, что не успело свестись. */
async function recoverAndMix(
```

**на:**

```ts

/** При запуске: закрыть прерванные сбоем записи, досвести и продолжить расшифровку того, что не успело. */
async function recoverAndMix(
```

**В `src/main/index.ts` заменить:**

```ts
  controller: RecordingController,
): Promise<void> {
```

**на:**

```ts
  controller: RecordingController,
  queue: TranscriptionQueue,
): Promise<void> {
```

**В `src/main/index.ts` заменить:**

```ts
    }
    for (const id of meetingsNeedingMix(await listMeetings(libraryDir))) mixer.enqueue(libraryDir, id);
  } catch (err) {
```

**на:**

```ts
    }
    const entries = await listMeetings(libraryDir);
    for (const id of meetingsNeedingMix(entries)) mixer.enqueue(libraryDir, id);
    queue.resume(libraryDir, entries);
  } catch (err) {
```

**В `src/main/index.ts` заменить:**

```ts

  const controller = new RecordingController({
```

**на:**

```ts

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
    spawn: spawnTranscriptionWorker,
    models: fakeAsr ? { root: modelManager.root, ensure: async () => undefined } : modelManager,
    ffmpegPath: () => resolveFfmpegPath(),
    // Запись начинается и кончается по ходу расшифровки: число потоков спрашивается каждый раз.
    threads: () => (controller.getState().phase === 'idle' ? FULL_THREADS : RECORDING_THREADS),
    now: () => Date.now(),
    logger,
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    progressChanged: (progress) => sendToMain(IPC.transcriptionProgress, progress),
    finished: ({ meeting, ok }) =>
      notify(
        ok ? notificationTexts.transcribed(meeting.title) : notificationTexts.transcribeFailed(meeting.title),
        true,
        () => sendToMain(IPC.showMeeting, meeting.id),
      ),
  });
  transcription = queue;
  let lastPhase = 'idle';

  const controller = new RecordingController({
```

**В `src/main/index.ts` заменить:**

```ts
      tray?.update(state.phase, hotkeys?.accelerator ?? '');
    },
```

**на:**

```ts
      tray?.update(state.phase, hotkeys?.accelerator ?? '');
      if ((state.phase === 'idle') !== (lastPhase === 'idle')) queue.threadsChanged();
      lastPhase = state.phase;
    },
```

**В `src/main/index.ts` заменить:**

```ts
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
  });
```

**на:**

```ts
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
    enqueueTranscription: (dir, id) => {
      queue.enqueue(dir, id).catch((err: unknown) => logger.error(`Не удалось поставить встречу ${id} в очередь расшифровки`, err));
    },
  });
```

**В `src/main/index.ts` заменить:**

```ts
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
  });
```

**на:**

```ts
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    transcription: queue,
    models: modelManager,
  });
```

**В `src/main/index.ts` заменить:**

```ts
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller);
}
```

**на:**

```ts
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller, queue);
}
```

- [ ] **Step 7: Проверка**

```bash
npm run typecheck
npm test
npm run build
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 8: Коммит**

```bash
git add src/main/recording/controller.ts src/main/recording/controller.test.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc.ts src/main/notifications.ts src/main/transcription/worker-host.ts src/main/index.ts
git commit -m "feat: wire transcription into the app"
```

---

### Task 15: Интерфейс: текст встречи, ход расшифровки, «Расшифровать заново», настройки

**Files:**
- Create: `src/renderer/main/transcription-format.ts`, `src/renderer/main/transcription-format.test.ts`,
  `src/renderer/main/participants.ts`, `src/renderer/main/participants.test.ts`, `src/renderer/main/ParticipantsPicker.tsx`,
  `src/renderer/main/focus.ts`, `src/renderer/main/TranscribeDialog.tsx`, `src/renderer/main/TranscriptView.tsx`,
  `src/renderer/main/TranscriptionSettings.tsx`
- Modify: `src/renderer/main/format.ts`, `src/renderer/main/format.test.ts`, `src/renderer/main/StopDialog.tsx`,
  `src/renderer/main/hooks.ts`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/MeetingList.tsx`,
  `src/renderer/main/App.tsx`, `src/renderer/main/SettingsPane.tsx`, `src/renderer/main/styles.css`

Вид — по листам 1 и 6 макета (стили `.spk`, `.chip`, `.tx`, `.row`, `.who`, `.say`, `.opt`, `.mlist`, `.lnk` перенесены из
`tm.css` макета; добавлены цвета спикеров `--sp3`, `--sp4` для 4+ собеседников). Вопрос о числе участников вынесен в
общий `ParticipantsPicker` — им пользуются окно «Запись остановлена» и «Расшифровать заново». Состояние «Скачается при
первой расшифровке» — под описанием модели (сбоку длинная надпись сжимала описание в узкую колонку).

- [ ] **Step 1: Тесты чистых функций окна**

**Создать `src/renderer/main/transcription-format.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import type { TranscriptionProgress } from '../../shared/transcription';
import { barFraction, formatTimestamp, percent, speakerTone, stageText } from './transcription-format';

const progress = (patch: Partial<TranscriptionProgress>): TranscriptionProgress => ({
  meetingId: 'a',
  stage: 'me',
  fraction: 0.3,
  download: null,
  ...patch,
});

describe('formatTimestamp', () => {
  it('shows minutes and seconds, and hours when needed', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(65.9)).toBe('1:05');
    expect(formatTimestamp(724)).toBe('12:04');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(formatTimestamp(Number.NaN)).toBe('0:00');
  });
});

describe('stageText', () => {
  it('names every stage', () => {
    expect(stageText(progress({ stage: 'queued' }))).toBe('В очереди на расшифровку');
    expect(stageText(progress({ stage: 'prepare' }))).toBe('Готовим звук');
    expect(stageText(progress({ stage: 'me' }))).toBe('Расшифровываем вашу речь');
    expect(stageText(progress({ stage: 'diarize' }))).toBe('Разделяем собеседников по голосам');
    expect(stageText(progress({ stage: 'others' }))).toBe('Расшифровываем собеседников');
  });

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
    expect(percent(-1)).toBe(0);
  });
});

describe('speakerTone', () => {
  it('colours «me» and the others', () => {
    expect(speakerTone('me')).toBe('sp0');
    expect(speakerTone('s1')).toBe('sp1');
    expect(speakerTone('s4')).toBe('sp4');
    expect(speakerTone('s5')).toBe('sp1');
    expect(speakerTone('x')).toBe('sp1');
  });
});
```

**Создать `src/renderer/main/participants.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { choiceFor, EMPTY_CHOICE, readChoice } from './participants';

describe('participants choice', () => {
  it('reads a button, the «other» field or nothing', () => {
    expect(readChoice({ choice: 3, other: '' })).toBe(3);
    expect(readChoice({ choice: 3, other: ' 12 ' })).toBe(12);
    expect(readChoice({ choice: null, other: 'много' })).toBe('invalid');
    expect(readChoice({ choice: null, other: '51' })).toBe('invalid');
    expect(readChoice(EMPTY_CHOICE)).toBeNull();
  });

  it('shows an earlier answer as a button or in the «other» field', () => {
    expect(choiceFor(null)).toEqual(EMPTY_CHOICE);
    expect(choiceFor(4)).toEqual({ choice: 4, other: '' });
    expect(choiceFor(1)).toEqual({ choice: null, other: '1' });
    expect(choiceFor(9)).toEqual({ choice: null, other: '9' });
  });
});
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
    expect(meetingNote(meeting('a', at, { status: 'error' }))).toEqual({ text: 'ошибка', tone: 'error' });
  });
});
```

**на:**

```ts
    expect(meetingNote(meeting('a', at, { status: 'error' }))).toEqual({ text: 'ошибка', tone: 'error' });
  });

  it('shows the progress of transcription and its errors', () => {
    const tracks = [{ kind: 'mic' as const, file: 'mic.webm', startOffsetMs: 0 }];
    const progress = { meetingId: 'a', stage: 'others' as const, fraction: 0.624, download: null };
    expect(meetingNote(meeting('a', at, { status: 'transcribing' }), progress)?.text).toBe('расшифровка 62%');
    expect(
      meetingNote(meeting('a', at, { status: 'transcribing' }), { ...progress, stage: 'download', fraction: 0 })?.text,
    ).toBe('скачиваем модель…');
    expect(meetingNote(meeting('a', at, { status: 'error', tracks }))).toEqual({ text: 'ошибка расшифровки', tone: 'error' });
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

```bash
npx vitest run src/renderer
```

Expected: FAIL — нет `./transcription-format`, `./participants`; `meetingNote` не знает прогресса.

- [ ] **Step 3: Чистые функции**

**Создать `src/renderer/main/transcription-format.ts`:**

```ts
// Тексты и форматы расшифровки для окна (чистые функции — проверяются модульными тестами).
import { formatBytes } from '../../shared/format';
import type { TranscriptionProgress } from '../../shared/transcription';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Время реплики: «1:05», «12:04», «1:02:05». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const percent = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction)) * 100);

/** Этап расшифровки для блока во встрече. */
export function stageText(progress: TranscriptionProgress): string {
  switch (progress.stage) {
    case 'queued':
      return 'В очереди на расшифровку';
    case 'download':
      return progress.download
        ? `Скачиваем модель расшифровки — ${formatBytes(progress.download.done)} из ${formatBytes(progress.download.total)}`
        : 'Скачиваем модель расшифровки';
    case 'prepare':
      return 'Готовим звук';
    case 'me':
      return 'Расшифровываем вашу речь';
    case 'diarize':
      return 'Разделяем собеседников по голосам';
    case 'others':
      return 'Расшифровываем собеседников';
  }
}

/** Доля для полоски: у скачивания — байты, у остального — вся работа по встрече. */
export function barFraction(progress: TranscriptionProgress): number {
  if (progress.stage === 'download' && progress.download && progress.download.total > 0) {
    return progress.download.done / progress.download.total;
  }
  return progress.fraction;
}

/** Цвет спикера: «Я» — sp0, собеседники — sp1…sp4 по кругу. */
export function speakerTone(id: string): string {
  if (id === 'me') return 'sp0';
  const n = Number(/^s(\d+)$/.exec(id)?.[1] ?? 1);
  return `sp${((n - 1) % 4) + 1}`;
}
```

**Создать `src/renderer/main/participants.ts`:**

```ts
import { parseParticipants } from './format';

/** Кнопки быстрого выбора; остальное — в поле «другое». */
export const CHOICES = [2, 3, 4, 5, 6] as const;

/** Выбор в блоке «Сколько человек было…»: кнопка 2–6 или своё число в поле «другое». */
export interface ParticipantsChoice {
  choice: number | null;
  other: string;
}

export const EMPTY_CHOICE: ParticipantsChoice = { choice: null, other: '' };

/** Выбор из уже известного числа: 2–6 — кнопкой, остальное — в поле «другое». */
export function choiceFor(hint: number | null): ParticipantsChoice {
  if (hint === null) return EMPTY_CHOICE;
  return (CHOICES as readonly number[]).includes(hint) ? { choice: hint, other: '' } : { choice: null, other: String(hint) };
}

/** Что выбрано: число; null — ничего не выбрано; 'invalid' — в поле «другое» не число от 1 до 50. */
export function readChoice(value: ParticipantsChoice): number | null | 'invalid' {
  if (value.other.trim() !== '') return parseParticipants(value.other) ?? 'invalid';
  return value.choice;
}
```

**В `src/renderer/main/format.ts` заменить:**

```ts
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
```

**на:**

```ts
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
```

**В `src/renderer/main/format.ts` заменить:**

```ts

/** Пометка встречи в списке — только если есть о чём сказать. У готовой встречи пометки нет. */
export function meetingNote(meeting: Meeting): MeetingNote | null {
  switch (meeting.status) {
```

**на:**

```ts

/**
 * Пометка встречи в списке — только если есть о чём сказать. У готовой встречи пометки нет.
 * progress — ход расшифровки этой встречи (если она сейчас расшифровывается).
 */
export function meetingNote(meeting: Meeting, progress?: TranscriptionProgress): MeetingNote | null {
  switch (meeting.status) {
```

**В `src/renderer/main/format.ts` заменить:**

```ts
    case 'transcribing':
      return { text: 'расшифровка…', tone: 'accent' };
    case 'error':
```

**на:**

```ts
    case 'transcribing':
      if (progress?.stage === 'download') return { text: 'скачиваем модель…', tone: 'accent' };
      return progress
        ? { text: `расшифровка ${Math.round(progress.fraction * 100)}%`, tone: 'accent' }
        : { text: 'расшифровка…', tone: 'accent' };
    case 'error':
```

**В `src/renderer/main/format.ts` заменить:**

```ts
    case 'error':
      return { text: 'ошибка', tone: 'error' };
    case 'done':
```

**на:**

```ts
    case 'error':
      // С дорожками ошибка — у расшифровки (запись сохранилась); без них — у самой записи.
      return { text: meeting.tracks.length > 0 ? 'ошибка расшифровки' : 'ошибка', tone: 'error' };
    case 'done':
```

- [ ] **Step 4: Общий вопрос о числе участников и фокус в окнах**

**Создать `src/renderer/main/focus.ts`:**

```ts
import type { KeyboardEvent } from 'react';

/** Tab и Shift+Tab ходят по кругу внутри окна: кнопки за ним (например, «Начать запись») недоступны. */
export function keepFocusInside(dialog: HTMLElement, event: KeyboardEvent<HTMLElement>): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
```

**Создать `src/renderer/main/ParticipantsPicker.tsx`:**

```tsx
import { CHOICES, type ParticipantsChoice } from './participants';

interface Props {
  value: ParticipantsChoice;
  onChange(next: ParticipantsChoice): void;
}

/** Вопрос «Сколько человек было на встрече, включая вас?» — окно «Запись остановлена» и «Расшифровать заново». */
export function ParticipantsPicker({ value, onChange }: Props) {
  return (
    <>
      <div className="q" id="participants-question">
        Сколько человек было на встрече, включая вас?
      </div>
      <div className="nums" role="group" aria-labelledby="participants-question">
        {CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            className="num"
            aria-pressed={value.choice === n && value.other === ''}
            onClick={() => onChange({ choice: n, other: '' })}
          >
            {n}
          </button>
        ))}
        <input
          className="other"
          inputMode="numeric"
          placeholder="другое"
          aria-label="Другое число участников"
          value={value.other}
          onChange={(e) => onChange({ choice: value.choice, other: e.currentTarget.value })}
        />
      </div>
    </>
  );
}
```

**Заменить целиком `src/renderer/main/StopDialog.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { StopDialogData } from '../../shared/recording';
import { errorText } from './errors';
import { formatDurationWithSeconds } from './format';
import { keepFocusInside } from './focus';
import { EMPTY_CHOICE, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';

/** «Запись остановлена»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data, onError }: { data: StopDialogData; onError(message: string): void }) {
  const [title, setTitle] = useState(data.title);
  const [participants, setParticipants] = useState(EMPTY_CHOICE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(data.title);
    setParticipants(EMPTY_CHOICE);
    setError(null);
    dialog.current?.focus();
  }, [data.meetingId, data.title]);

  const finish = async (participantsHint: number | null) => {
    setSaving(true);
    try {
      await window.textmeet.finishStopDialog({ meetingId: data.meetingId, title, participantsHint });
    } catch (err) {
      // «Пропустить» и Esc закрывают окно и при ошибке (main уже убрал его) — ошибку показывает боковая панель.
      if (participantsHint === null) onError(errorText(err));
      else setError(errorText(err));
      setSaving(false);
    }
  };

  const confirm = () => {
    const n = readChoice(participants);
    if (n === 'invalid') {
      setError('Введите число от 1 до 50.');
      return;
    }
    if (n === null) {
      setError('Выберите, сколько было человек, или нажмите «Пропустить».');
      return;
    }
    void finish(n);
  };

  return (
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stop-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !saving) void finish(null);
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id="stop-title">Запись остановлена</h2>
        <div className="meta">{formatDurationWithSeconds(data.durationSec)} · уже сохранена в библиотеке</div>
        <label className="lab">
          Название
          <input className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
            setParticipants(next);
            setError(null);
          }}
        />
        <p className="note">
          Так расшифровка точнее разделит голоса. Если не знаете — пропустите, программа попробует определить сама.
        </p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={saving} onClick={() => void finish(null)}>
            Пропустить
          </button>
          <button type="button" className="btn pri" disabled={saving} onClick={confirm}>
            Расшифровать
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Создать `src/renderer/main/TranscribeDialog.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';

interface Props {
  meetingId: string;
  /** Уже расшифрована: текст заменится, когда новая расшифровка закончится. */
  again: boolean;
  /** Число участников, указанное раньше (выбрано заранее). */
  participantsHint: number | null;
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: число участников и запуск. */
export function TranscribeDialog({ meetingId, again, participantsHint, onClose }: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => dialog.current?.focus(), []);

  const confirm = async () => {
    const n = readChoice(participants);
    if (n === 'invalid') {
      setError('Введите число от 1 до 50.');
      return;
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  const title = again ? 'Расшифровать заново' : 'Расшифровать';
  return (
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcribe-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !saving) onClose();
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id="transcribe-title">{title}</h2>
        {again && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
            setParticipants(next);
            setError(null);
          }}
        />
        <p className="note">Если не выбрать, программа определит число собеседников сама.</p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn pri" disabled={saving} onClick={() => void confirm()}>
            Расшифровать
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Данные расшифровки в окне**

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingListEntry } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
```

**на:**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import type { Peaks, RecordingState } from '../../shared/recording';
import { errorText } from './errors';
```

**на:**

```ts
import type { Peaks, RecordingState } from '../../shared/recording';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
  return result;
}
```

**на:**

```ts
  return result;
}

/** Ход расшифровки по встречам: сначала запрос, дальше — события. */
export function useTranscriptionProgress(): ReadonlyMap<string, TranscriptionProgress> {
  const [list, setList] = useState<TranscriptionProgress[]>([]);
  useEffect(() => {
    let active = true;
    let gotEvent = false;
    const unsubscribe = window.textmeet.onTranscriptionProgress((next) => {
      gotEvent = true;
      setList(next);
    });
    window.textmeet
      .getTranscriptionProgress()
      .then((initial) => {
        if (active && !gotEvent) setList(initial);
      })
      .catch((err: unknown) => console.error('TextMeet: ход расшифровки не получен', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return new Map(list.map((p) => [p.meetingId, p]));
}

export type TranscriptLoad =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'ready'; transcript: Transcript }
  | { kind: 'error'; message: string };

/**
 * Текст встречи; перечитывается, когда меняется статус (например, расшифровка закончилась).
 * Пока грузится текст другой встречи, прежний не показывается.
 */
export function useTranscript(meetingId: string, status: MeetingStatus): TranscriptLoad {
  const [state, setState] = useState<{ meetingId: string; load: TranscriptLoad } | null>(null);
  useEffect(() => {
    let active = true;
    const done = (load: TranscriptLoad) => {
      if (active) setState({ meetingId, load });
    };
    window.textmeet
      .getTranscript(meetingId)
      .then((transcript) => done(transcript ? { kind: 'ready', transcript } : { kind: 'none' }))
      .catch((err: unknown) => done({ kind: 'error', message: errorText(err) }));
    return () => {
      active = false;
    };
  }, [meetingId, status]);
  return state?.meetingId === meetingId ? state.load : { kind: 'loading' };
}
```

- [ ] **Step 6: Текст встречи, панель встречи, список, приложение**

**Создать `src/renderer/main/TranscriptView.tsx`:**

```tsx
import { speakerLabel, type Transcript } from '../../shared/transcript';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
  /** Имена спикеров из meeting.json (переименование — План 4). */
  names: Readonly<Record<string, string>>;
}

/** Текст встречи, как на листе 1 макета: спикеры сверху, реплики «время · кто · что». Только чтение (План 3). */
export function TranscriptView({ transcript, names }: Props) {
  if (transcript.segments.length === 0) {
    return (
      <div className="empty-note">
        <b>В записи не найдено речи</b>
        <span>Если речь там есть, попробуйте «Расшифровать заново» и укажите число участников.</span>
      </div>
    );
  }
  return (
    <>
      <div className="spk" aria-label="Спикеры">
        <span>Спикеры</span>
        {transcript.speakers.map((s) => (
          <span key={s.id} className="chip">
            <span className={`pip ${speakerTone(s.id)}`} />
            {speakerLabel(s.id, names)}
          </span>
        ))}
      </div>
      <div className="tx" aria-label="Текст встречи">
        {transcript.segments.map((segment) => (
          <div key={segment.id} className="row">
            <span className="t">{formatTimestamp(segment.start)}</span>
            <div>
              <div className={`who ${speakerTone(segment.speakerId)}`}>{speakerLabel(segment.speakerId, names)}</div>
              <div className="say">{segment.text}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
```

**Заменить целиком `src/renderer/main/MeetingPane.tsx`:**

```tsx
import { useState } from 'react';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { useTranscript } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';
import { TranscribeDialog } from './TranscribeDialog';
import { barFraction, percent, stageText } from './transcription-format';
import { TranscriptView } from './TranscriptView';

interface Props {
  entry: MeetingListEntry;
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  onError(message: string): void;
}

function OpenFolder({ id, onError }: { id: string; onError(message: string): void }) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => window.textmeet.openMeetingDir(id).catch((err: unknown) => onError(errorText(err)))}
    >
      <FolderIcon />
      Открыть папку встречи
    </button>
  );
}

function ProgressBlock({ progress }: { progress: TranscriptionProgress }) {
  const value = percent(barFraction(progress));
  return (
    <div className="empty-note" role="status">
      <b>{stageText(progress)}</b>
      <div
        className="prog wide"
        role="progressbar"
        aria-label="Ход расшифровки"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <i style={{ width: `${value}%` }} />
      </div>
      <span>{progress.stage === 'queued' ? 'Начнётся, когда закончатся встречи перед ней.' : `${value}%`}</span>
    </div>
  );
}

/** Средняя часть встречи: текст, ход расшифровки или приглашение расшифровать. */
function Body({ meeting, progress, onTranscribe }: { meeting: Meeting; progress: TranscriptionProgress | null; onTranscribe(): void }) {
  const load = useTranscript(meeting.id, meeting.status);
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing';
  const hasAudio = meeting.tracks.length > 0;
  if (busy) {
    return <ProgressBlock progress={progress ?? { meetingId: meeting.id, stage: 'queued', fraction: 0, download: null }} />;
  }
  if (load.kind === 'ready') return <TranscriptView transcript={load.transcript} names={meeting.speakerNames} />;
  if (load.kind === 'error') {
    return (
      <div className="empty-note">
        <b>Не удалось прочитать текст встречи</b>
        <pre className="reason">{load.message}</pre>
      </div>
    );
  }
  if (load.kind === 'loading' || meeting.status === 'error') return <div className="empty-note" />;
  return (
    <div className="empty-note">
      <b>{hasAudio ? 'Запись сохранена' : 'Звука нет'}</b>
      {hasAudio && (
        <>
          <span>Текста пока нет.</span>
          <button type="button" className="btn pri" onClick={onTranscribe}>
            Расшифровать
          </button>
        </>
      )}
    </div>
  );
}

/** Выбранная встреча: заголовок, пометки, текст или ход расшифровки, плеер. */
export function MeetingPane({ entry, progress, onError }: Props) {
  const [dialog, setDialog] = useState(false);
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Встреча создаётся…</b>
          <span>Если это сообщение не исчезает, встреча не успела создаться — папку можно удалить.</span>
          <OpenFolder id={entry.id} onError={onError} />
        </div>
      </main>
    );
  }
  if (entry.kind === 'broken') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Не удалось прочитать встречу</b>
          <span>Папка: {entry.id}</span>
          <pre className="reason">{entry.reason}</pre>
          <OpenFolder id={entry.id} onError={onError} />
        </div>
      </main>
    );
  }

  const { meeting, mixReady, mixFailed } = entry;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  const hasAudio = meeting.tracks.length > 0;
  const transcribeError = meeting.status === 'error' && hasAudio;
  const canTranscribeAgain = hasAudio && ['done', 'queued', 'transcribing'].includes(meeting.status);
  const retry = () =>
    window.textmeet
      .transcribe({ meetingId: meeting.id, participantsHint: meeting.participantsHint })
      .catch((err: unknown) => onError(errorText(err)));

  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <h1>{meeting.title}</h1>
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          {canTranscribeAgain && (
            <button type="button" className="btn" onClick={() => setDialog(true)}>
              Расшифровать заново
            </button>
          )}
          <OpenFolder id={meeting.id} onError={onError} />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
        <div className="banner" role="status">
          <WarnIcon />
          <div>
            <b>Запись восстановлена после сбоя</b>
            <p>Запись прервалась из-за сбоя. Сохранено всё, что успело записаться.</p>
          </div>
        </div>
      )}
      {meeting.status === 'error' && (
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>{transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>{meeting.errorMessage ?? 'Что-то пошло не так.'}</p>
            {transcribeError && (
              <div className="acts">
                <button type="button" className="btn" onClick={() => void retry()}>
                  Повторить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <Body meeting={meeting} progress={progress} onTranscribe={() => setDialog(true)} />
      {mixReady ? (
        <Player meetingId={meeting.id} fallbackDuration={meeting.durationSec} />
      ) : (
        hasAudio && (
          <footer className="player pending">
            {mixFailed
              ? 'Не удалось подготовить запись для прослушивания — дорожки лежат в папке встречи.'
              : 'Готовим запись для прослушивания…'}
          </footer>
        )
      )}
      {dialog && (
        <TranscribeDialog
          meetingId={meeting.id}
          again={meeting.status !== 'recorded'}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
      )}
    </main>
  );
}
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
import type { RecordingState } from '../../shared/recording';
import { formatDurationShort } from '../../shared/format';
```

**на:**

```tsx
import type { RecordingState } from '../../shared/recording';
import type { TranscriptionProgress } from '../../shared/transcription';
import { formatDurationShort } from '../../shared/format';
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
  selectedId: string | null;
  onSelect(id: string): void;
```

**на:**

```tsx
  selectedId: string | null;
  /** Ход расшифровки по встречам. */
  progress: ReadonlyMap<string, TranscriptionProgress>;
  onSelect(id: string): void;
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
  selected,
  onSelect,
```

**на:**

```tsx
  selected,
  progress,
  onSelect,
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
  selected: boolean;
  onSelect(): void;
```

**на:**

```tsx
  selected: boolean;
  progress: TranscriptionProgress | undefined;
  onSelect(): void;
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
      : `${formatTimeOfDay(entry.meeting.createdAt)} · ${formatDurationShort(entry.meeting.durationSec)}`;
    note = live ? { text: `● идёт запись · ${formatClock(elapsed)}`, tone: 'live' } : meetingNote(entry.meeting);
  } else if (entry.kind === 'creating') {
```

**на:**

```tsx
      : `${formatTimeOfDay(entry.meeting.createdAt)} · ${formatDurationShort(entry.meeting.durationSec)}`;
    note = live ? { text: `● идёт запись · ${formatClock(elapsed)}`, tone: 'live' } : meetingNote(entry.meeting, progress);
  } else if (entry.kind === 'creating') {
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
/** Список встреч по дням, новые сверху. */
export function MeetingList({ entries, error, recording, selectedId, onSelect }: Props) {
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
```

**на:**

```tsx
/** Список встреч по дням, новые сверху. */
export function MeetingList({ entries, error, recording, selectedId, progress, onSelect }: Props) {
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
                selected={id === selectedId}
                onSelect={() => onSelect(id)}
```

**на:**

```tsx
                selected={id === selectedId}
                progress={progress.get(id)}
                onSelect={() => onSelect(id)}
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
import { errorText } from './errors';
import { useMeetings, useMicrophones, useRecordingState } from './hooks';
import { SettingsIcon } from './icons';
```

**на:**

```tsx
import { errorText } from './errors';
import { useMeetings, useMicrophones, useRecordingState, useTranscriptionProgress } from './hooks';
import { SettingsIcon } from './icons';
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  const microphones = useMicrophones();
  const [settings, setSettings] = useState<SettingsState | null>(null);
```

**на:**

```tsx
  const microphones = useMicrophones();
  const progress = useTranscriptionProgress();
  const [settings, setSettings] = useState<SettingsState | null>(null);
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  }, [liveId]);
  const dialogId = recording.stopDialog?.meetingId ?? null;
```

**на:**

```tsx
  }, [liveId]);
  // Щелчок по уведомлению «Текст встречи готов» — показать эту встречу.
  useEffect(() => window.textmeet.onShowMeeting((id) => setSelection({ kind: 'meeting', id })), []);
  const dialogId = recording.stopDialog?.meetingId ?? null;
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  } else if (selectedEntry) {
    pane = <MeetingPane entry={selectedEntry} onError={setError} />;
  } else {
```

**на:**

```tsx
  } else if (selectedEntry) {
    // key: у другой встречи — своё состояние (открытое окно «Расшифровать заново» к ней не переходит).
    pane = (
      <MeetingPane
        key={entryId(selectedEntry)}
        entry={selectedEntry}
        progress={progress.get(entryId(selectedEntry)) ?? null}
        onError={setError}
      />
    );
  } else {
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
          selectedId={selectedId}
          onSelect={(id) => setSelection({ kind: 'meeting', id })}
```

**на:**

```tsx
          selectedId={selectedId}
          progress={progress}
          onSelect={(id) => setSelection({ kind: 'meeting', id })}
```

- [ ] **Step 7: Настройки → «Расшифровка»**

**Создать `src/renderer/main/TranscriptionSettings.tsx`:**

```tsx
import { useEffect, useState } from 'react';
import { formatBytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';

/** Настройки → «Расшифровка» (лист 6 макета; Whisper появится в Плане 7). */
export function TranscriptionSettings() {
  const [models, setModels] = useState<ModelsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      window.textmeet
        .getModels()
        .then((state) => {
          if (active) setModels(state);
        })
        .catch((err: unknown) => {
          if (active) setError(errorText(err));
        });
    void load();
    // Расшифровка началась или закончилась (и модели могли скачаться) — перечитать.
    let busy: boolean | null = null;
    const unsubscribe = window.textmeet.onTranscriptionProgress((list) => {
      const nowBusy = list.length > 0;
      if (nowBusy !== busy) void load();
      busy = nowBusy;
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const remove = async (group: ModelGroupId) => {
    try {
      setModels(await window.textmeet.deleteModels(group));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const gigaam = models?.groups.find((g) => g.id === 'gigaam');
  const installed = models?.groups.filter((g) => g.installed) ?? [];
  return (
    <section className="sec">
      <h2>Расшифровка</h2>
      <div className="fld">
        <div className="lb">Модель</div>
        <div className="ctl">
          <div className="opts">
            <div className="opt on">
              <span className="radio">
                <i />
              </span>
              <span className="opt-text">
                <b>GigaAM v3</b>
                <small>Русский язык, с пунктуацией. Быстро работает на процессоре. Английские слова пишет русскими буквами.</small>
                {gigaam && !gigaam.installed && <small>Скачается при первой расшифровке.</small>}
              </span>
              {gigaam?.installed && <span className="side-note">скачана · {formatBytes(gigaam.sizeBytes)}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="fld">
        <div className="lb">Скачанные модели</div>
        <div className="ctl">
          {installed.length === 0 ? (
            <small>Пока ничего не скачано.</small>
          ) : (
            <div className="mlist" aria-label="Скачанные модели">
              {installed.map((group) => (
                <div key={group.id}>
                  {group.title}
                  <span>{formatBytes(group.sizeBytes)}</span>
                  <button
                    type="button"
                    className="lnk"
                    disabled={models?.busy}
                    aria-label={`Удалить: ${group.title}`}
                    onClick={() => void remove(group.id)}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
          <small>
            {models?.busy
              ? 'Пока идёт расшифровка, модели удалить нельзя.'
              : 'Удалённая модель скачается заново при следующей расшифровке.'}
          </small>
          {error && (
            <p role="alert" className="err">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
import { ChevronIcon } from './icons';
```

**на:**

```tsx
import { ChevronIcon } from './icons';
import { TranscriptionSettings } from './TranscriptionSettings';
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx

/** Настройки: запись и общие. Разделы расшифровки и ИИ появятся в своих планах. */
export function SettingsPane({ state, info, onChange }: Props) {
```

**на:**

```tsx

/** Настройки: запись, расшифровка и общие. Раздел ИИ появится в Плане 6. */
export function SettingsPane({ state, info, onChange }: Props) {
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
        </section>

        <section className="sec">
          <h2>Общие</h2>
```

**на:**

```tsx
        </section>

        <TranscriptionSettings />

        <section className="sec">
          <h2>Общие</h2>
```

- [ ] **Step 8: Стили**

**В `src/renderer/main/styles.css` заменить:**

```css
  --accent: #2e4f86;
  --warn: #855700;
```

**на:**

```css
  --accent: #2e4f86;
  --sp0: #2e4f86;
  --sp1: #9a4a24;
  --sp2: #3c6b4a;
  --sp3: #6a4c93;
  --sp4: #7a6420;
  --warn: #855700;
```

**В `src/renderer/main/styles.css` заменить:**

```css
    --accent: #9db6e6;
    --warn: #e8b04b;
```

**на:**

```css
    --accent: #9db6e6;
    --sp0: #9db6e6;
    --sp1: #e39a74;
    --sp2: #8cc49a;
    --sp3: #c2a8e8;
    --sp4: #e0c477;
    --warn: #e8b04b;
```

**В `src/renderer/main/styles.css` заменить:**

```css
.muted {
  color: var(--muted);
}
```

**на:**

```css
.muted {
  color: var(--muted);
}

/* ---- Текст встречи (лист 1 макета) ---- */
.spk {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 11px 36px;
  font-size: 12px;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 13px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
}

.pip {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.sp0 {
  color: var(--sp0);
}
.sp1 {
  color: var(--sp1);
}
.sp2 {
  color: var(--sp2);
}
.sp3 {
  color: var(--sp3);
}
.sp4 {
  color: var(--sp4);
}

.tx {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 36px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: grid;
  grid-template-columns: 54px 1fr;
  gap: 14px;
  padding: 9px 12px;
  margin: 0 -12px;
  border-radius: var(--r);
}

.t {
  font-family: var(--f-text);
  font-size: 12px;
  color: var(--muted);
  padding-top: 2px;
  font-variant-numeric: tabular-nums;
}

.who {
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 3px;
}

.say {
  font-family: var(--f-text);
  font-size: 16.5px;
  line-height: 1.55;
  user-select: text;
}

/* ---- Ход расшифровки ---- */
.prog {
  display: block;
  height: 3px;
  background: var(--meter-off);
  border-radius: 2px;
  overflow: hidden;
}

.prog i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.4s ease-out;
}

.prog.wide {
  width: 320px;
  height: 4px;
  margin: 6px 0 2px;
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
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
}

.mlist div {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
}

.mlist div + div {
  border-top: 1px solid var(--line);
}

.mlist span {
  margin-left: auto;
  color: var(--muted);
  font-size: 12.5px;
}

.lnk {
  color: var(--accent);
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.lnk:disabled {
  color: var(--muted);
  cursor: default;
}
```

- [ ] **Step 9: Проверка**

```bash
npm run typecheck
npm test
npm run build
```

Expected: проверка типов без ошибок, все модульные тесты проходят.

- [ ] **Step 10: Коммит**

```bash
git add src/renderer/main
git commit -m "feat: show transcripts, transcription progress and model settings"
```

---

### Task 16: Сквозные тесты

**Files:**
- Create: `e2e/transcription.spec.ts`
- Modify: `e2e/helpers.ts`, `e2e/recording.spec.ts`, `e2e/packaged.spec.ts`

Во всех сквозных тестах — поддельные движки (`TEXTMEET_TEST_ASR=fake`) и своя папка моделей (`TEXTMEET_MODELS_DIR`):
модели не качаются, настоящая папка моделей не трогается. Проверка собранной программы (`packaged.spec.ts`) теперь ещё
ждёт `transcript.json` и строку журнала «Процесс расшифровки запущен (поддельные движки, sherpa-onnx …)» — это
доказывает, что процесс расшифровки стартует из собранной программы и загружает нативную библиотеку из
`app.asar.unpacked`. Старый тест записи читал `meeting.json` сразу после закрытия окна «Запись остановлена»; теперь
встреча уходит в очередь мгновением позже, и тест изредка видел `recorded` — он ждёт статуса очереди (`expect.poll`).

- [ ] **Step 1: Помощники и старые тесты**

**В `e2e/helpers.ts` заменить:**

```ts
  executablePath?: string;
}
```

**на:**

```ts
  executablePath?: string;
  /** Уже расшифрованные встречи: id → transcript.json. */
  transcripts?: Record<string, unknown>;
}
```

**В `e2e/helpers.ts` заменить:**

```ts
    }
  }

  let app: ElectronApplication | undefined;
```

**на:**

```ts
    }
  }
  for (const [id, transcript] of Object.entries(options.transcripts ?? {})) {
    await writeFile(join(libraryDir, id, 'transcript.json'), serialize(transcript));
  }

  let app: ElectronApplication | undefined;
```

**В `e2e/helpers.ts` заменить:**

```ts
        TEXTMEET_TEST_MEDIA: options.media ?? 'tone',
      },
```

**на:**

```ts
        TEXTMEET_TEST_MEDIA: options.media ?? 'tone',
        // Расшифровка — поддельными движками, без моделей; папка моделей — своя (настройки её показывают).
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
      },
```

**В `e2e/recording.spec.ts` заменить:**

```ts

  const [id] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({
    title: 'Созвон с Ириной',
```

**на:**

```ts

  const [id] = await meetingIds(libraryDir);
  // Ответ в окне ставит встречу в очередь расшифровки — чуть позже, чем закрывается окно.
  await expect.poll(async () => (await readMeetingJson(libraryDir, id!)).status).toMatch(/^(queued|transcribing|done)$/);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({
    title: 'Созвон с Ириной',
```

**В `e2e/recording.spec.ts` заменить:**

```ts
    participantsHint: 3,
    status: 'recorded',
    tracks: [{ kind: 'mic' }, { kind: 'system' }].map((t) => expect.objectContaining(t)),
```

**на:**

```ts
    participantsHint: 3,
    tracks: [{ kind: 'mic' }, { kind: 'system' }].map((t) => expect.objectContaining(t)),
```

**В `e2e/packaged.spec.ts` заменить:**

```ts
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
```

**на:**

```ts
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
```

**В `e2e/packaged.spec.ts` заменить:**

```ts

test('the packaged app records and mixes the tracks with its bundled ffmpeg', async () => {
  test.skip(!executablePath, 'проверяется только собранная программа (TEXTMEET_PACKAGED_APP)');
```

**на:**

```ts

test('the packaged app records, mixes with its bundled ffmpeg and runs the transcription process', async () => {
  test.skip(!executablePath, 'проверяется только собранная программа (TEXTMEET_PACKAGED_APP)');
```

**В `e2e/packaged.spec.ts` заменить:**

```ts
  launched = await launchApp({ executablePath });
  const { page, libraryDir } = launched;
  await waitForRecorder(page);
```

**на:**

```ts
  launched = await launchApp({ executablePath });
  const { page, libraryDir, userDataDir } = launched;
  await waitForRecorder(page);
```

**В `e2e/packaged.spec.ts` заменить:**

```ts
  await expect.poll(() => existsSync(join(libraryDir, id!, 'audio', 'mix.opus')), { timeout: 30_000 }).toBe(true);
});
```

**на:**

```ts
  await expect.poll(() => existsSync(join(libraryDir, id!, 'audio', 'mix.opus')), { timeout: 30_000 }).toBe(true);
  // «Пропустить» тоже ставит встречу в очередь. Текст появляется, только если процесс расшифровки запустился
  // из собранной программы и загрузил sherpa-onnx из app.asar.unpacked (движки — поддельные, без моделей).
  await expect.poll(() => existsSync(join(libraryDir, id!, 'transcript.json')), { timeout: 30_000 }).toBe(true);
  const log = await readFile(join(userDataDir, 'logs', 'textmeet.log'), 'utf8');
  expect(log).toMatch(/Процесс расшифровки запущен \(поддельные движки, sherpa-onnx \d/);
});
```

- [ ] **Step 2: Тесты расшифровки**

**Создать `e2e/transcription.spec.ts`:**

```ts
// Расшифровка в программе: поддельные движки (TEXTMEET_TEST_ASR=fake) — проверяется склейка, а не качество.
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, readMeetingJson, toneWebm, waitForRecorder, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-25_1430_a1b2c3';
const TRACKS = [
  { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
  { kind: 'system', file: 'system.webm', startOffsetMs: 0 },
];
const recorded = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  json: meetingJson(ID, { title: 'Созвон с Ириной', durationSec: 3, tracks: TRACKS, ...overrides }),
  audio: { 'mic.webm': 2, 'system.webm': 2 },
});

test('a new recording is transcribed after the stop dialog', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;
  await waitForRecorder(page);
  await page.getByRole('button', { name: /Начать запись/ }).click();
  await expect(page.getByTestId('live-timer')).toHaveText(/00:00:0[3-9]/, { timeout: 15_000 });
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Запись остановлена' });
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  const text = page.getByLabel('Текст встречи');
  await expect(text).toBeVisible({ timeout: 20_000 });
  await expect(text).toContainText('Я');
  await expect(text).toContainText('Проверка расшифровки');
  const [id] = (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({ status: 'done', model: 'gigaam-v3-e2e-rnnt' });
});

test('«Расшифровать» on a saved recording asks for participants and shows the text of both tracks', async () => {
  launched = await launchApp({ meetings: [recorded()] });
  const { page, libraryDir } = launched;
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByText('Текста пока нет.')).toBeVisible();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Расшифровать' });
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByLabel('Спикеры')).toContainText('Я');
  await expect(page.getByLabel('Спикеры')).toContainText('Спикер 1');
  await expect(page.getByLabel('Текст встречи').locator('.row')).toHaveCount(2);
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', participantsHint: 3 });
  // В списке у готовой встречи пометки нет.
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).not.toContainText('расшифров');
});

test('a failed transcription shows the reason and «Повторить» tries again', async () => {
  launched = await launchApp({ meetings: [{ ...recorded(), audio: {} }] });
  const { page, libraryDir } = launched;
  // Обе дорожки испорчены — ffmpeg не прочитает ни одну (с одной целой встреча расшифровалась бы по ней).
  for (const file of ['mic.webm', 'system.webm']) await writeFile(join(libraryDir, ID, 'audio', file), 'это не звук');
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();
  await page.getByRole('dialog', { name: 'Расшифровать' }).getByRole('button', { name: 'Расшифровать' }).click();

  const banner = page.getByRole('alert').filter({ hasText: 'Ошибка расшифровки' });
  await expect(banner).toContainText('ffmpeg не прочитал дорожку', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText('ошибка расшифровки');

  for (const file of ['mic.webm', 'system.webm']) await toneWebm(join(libraryDir, ID, 'audio', file), 2);
  await banner.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByLabel('Текст встречи')).toBeVisible({ timeout: 20_000 });
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', errorMessage: null });
});

test('a meeting left in the queue is transcribed after a restart', async () => {
  launched = await launchApp({ meetings: [recorded({ status: 'transcribing', participantsHint: 2 })] });
  const { page, libraryDir } = launched;
  await expect.poll(async () => (await readMeetingJson(libraryDir, ID)).status, { timeout: 20_000 }).toBe('done');
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Спикер 1');
});

test('«Расшифровать заново» replaces the text and keeps the earlier answer preselected', async () => {
  const old = {
    schemaVersion: 1,
    model: 'gigaam-v3-e2e-rnnt',
    createdAt: '2026-09-25T12:00:00.000Z',
    speakers: [{ id: 's1', kind: 'other' }],
    segments: [{ id: 'seg-1', start: 0, end: 1, speakerId: 's1', text: 'Старый текст.', edited: false }],
  };
  launched = await launchApp({
    meetings: [recorded({ status: 'done', participantsHint: 4, model: 'gigaam-v3-e2e-rnnt' })],
    transcripts: { [ID]: old },
  });
  const { page } = launched;
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');

  await page.getByRole('button', { name: 'Расшифровать заново' }).click();
  const dialog = page.getByRole('dialog', { name: 'Расшифровать заново' });
  await expect(dialog.getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
  await expect(page.getByLabel('Текст встречи')).not.toContainText('Старый текст.');
  await expect(page.getByText('2 участника')).toBeVisible();
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

- [ ] **Step 3: Прогон**

```bash
npm run e2e
```

Expected: 25 passed, 1 skipped (`packaged.spec.ts` — только с `TEXTMEET_PACKAGED_APP`).

- [ ] **Step 4: Проверка собранной программы (Windows)**

```bash
npx electron-builder --win dir --publish never
```

```powershell
$env:TEXTMEET_PACKAGED_APP = "release/win-unpacked/TextMeet.exe"; npx playwright test e2e/packaged.spec.ts; Remove-Item Env:TEXTMEET_PACKAGED_APP
```

Expected: 1 passed.

- [ ] **Step 5: Коммит**

```bash
git add e2e
git commit -m "test: cover transcription end to end and in the packaged app"
```

---

### Task 17: Тесты на настоящих моделях в GitHub Actions

**Files:**
- Modify: `.github/workflows/ci.yml`

Модели (~360 МБ) и открытые записи кешируются между запусками (`actions/cache@v5`, ключ — хэш реестра и списка записей).
`build.yml` не меняется: там уже есть модульные и сквозные тесты и проверка собранной программы на Windows и Mac;
подпись Mac (`find … -name '*.node' -o -name '*.dylib'`) уже подписывает и файлы sherpa-onnx.

- [ ] **Step 1: Шаги**

**Заменить целиком `.github/workflows/ci.yml`:**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      # Модели расшифровки (~360 МБ) и открытые записи для тестов на настоящих моделях — в кеше между запусками.
      TEXTMEET_MODELS_DIR: ${{ github.workspace }}/../textmeet-models
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:coverage
      - uses: actions/cache@v5
        with:
          path: ${{ github.workspace }}/../textmeet-models
          key: textmeet-models-${{ hashFiles('src/main/models/registry.ts', 'src/test-support/model-fixtures.ts') }}
      - run: npm run test:models
```

- [ ] **Step 2: Коммит**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the tests on real models with cached models"
```

---

### Task 18: Сборка на GitHub (Windows и Mac)

Перед этой задачей спросить пользователя: ветка уходит на GitHub и запускается сборка (минуты macOS считаются с
множителем).

- [ ] **Step 1: Отправить ветку и запустить сборку**

```bash
git push -u origin plan-3-transcription
gh workflow run build.yml --ref plan-3-transcription
gh run list --workflow build.yml --branch plan-3-transcription --limit 1
```

Expected: запуск `build` на `windows-latest` и `macos-latest` — зелёный: модульные тесты, сквозные (25 passed,
1 skipped), проверка собранной программы (`packaged.spec.ts`: 1 passed), артефакты `TextMeet-windows`
(`TextMeet-Setup-0.2.0.exe`) и `TextMeet-mac` (`.dmg`).

`ci.yml` (с тестами на настоящих моделях под Linux) запускается на `main` — он проверится при слиянии в Task 20.
Его шаги уже прогонялись на черновом прототипе (см. «Факты»).

---

### Task 19: Ручная проверка на Windows и Mac (контрольная точка с пользователем)

Пользователь не программист: инструкции — по шагам, простыми словами, по-русски. Результаты — в
`docs/superpowers/plan-3-checks.md` (Task 20). Не работает — сначала разобраться и исправить (отдельным коммитом с
тестом), потом продолжать.

- [ ] **Step 1: Передать установщики**

Windows — `TextMeet-Setup-0.2.0.exe` из артефакта `TextMeet-windows`, Mac — `.dmg` из `TextMeet-mac`. Установка поверх
прежней версии (как в Плане 2). На Windows модели уже лежат со спайка — программа проверит их и скачивать не будет;
на Mac при первой расшифровке скачаются ~360 МБ.

- [ ] **Step 2: Windows — чек-лист**

| # | Что сделать | Что должно получиться |
|---|---|---|
| 1 | Созвон вдвоём (или видео с одним голосом) 2–3 минуты, «Остановить», выбрать **2**, «Расшифровать» | В списке «расшифровка N%», во встрече — этапы и полоска; через минуту-две — текст: ваши реплики «Я», собеседник «Спикер 1» |
| 2 | Прочитать текст | Текст разборчивый; фразы не повторяются дважды; ничего заметного не пропало |
| 3 | Записать ещё раз, в окне «Запись остановлена» нажать **«Пропустить»** | Расшифровка всё равно идёт; собеседник один — «Спикер 1» |
| 4 | Видео/созвон, где говорят 3+ человека, «Пропустить» | Найдено примерно столько собеседников, сколько было |
| 5 | Во встрече «Расшифровать заново», указать другое число участников | Старый текст виден до конца новой расшифровки, затем заменяется |
| 6 | Выключить «Звук компьютера», поговорить вдвоём у одного микрофона, указать 2 | Все реплики — «Спикер 1» / «Спикер 2», без «Я» |
| 7 | Начать расшифровку длинной записи и сразу начать новую запись | Запись идёт без заиканий, расшифровка продолжается медленнее |
| 8 | Во время расшифровки выйти из TextMeet (трей → «Выход») и запустить снова | Расшифровка продолжилась сама и закончилась |
| 9 | Свернуть окно до конца расшифровки | Уведомление «Текст встречи готов»; щелчок открывает эту встречу |
| 10 | Настройки → «Расшифровка» | GigaAM v3 «скачана · …», в «Скачанных моделях» — две строки с «Удалить» |
| 11 | Светлая и тёмная тема | Текст встречи читается, как лист 1 макета |

- [ ] **Step 3: Mac — чек-лист**

| # | Что сделать | Что должно получиться |
|---|---|---|
| 1 | Первая расшифровка (пункт 1 Windows) | «Скачиваем модель расшифровки — … из …», затем расшифровка; текст как на Windows |
| 2 | Пункты 3, 5, 8, 9, 10, 11 из списка Windows | То же |
| 3 | Настройки → «Удалить» у GigaAM, снова «Расшифровать заново» | Модель скачивается заново, расшифровка проходит |
| 4 | Отключить Wi-Fi, удалить модели, «Расшифровать заново»; затем включить Wi-Fi и «Повторить» | Сначала «Ошибка расшифровки: … нет связи с сервером» и «Повторить»; после «Повторить» — скачивание и текст |

- [ ] **Step 4: Итог от пользователя**

Записать ответы (что работает, что нет, как текст на слух) для Task 20. Непройденное исправить до слияния или, если
пользователь согласен, внести в «Отложено» с планом, где это будет исправлено.

---

### Task 20: Документы, память и слияние

**Files:**
- Create: `docs/superpowers/plan-3-checks.md`
- Modify: `docs/superpowers/plans/2026-09-25-textmeet-roadmap.md`, `docs/superpowers/specs/2026-09-25-textmeet-design.md`
  (§3.3, §5.4, §9 по разделу 9 решений Плана 3), `docs/superpowers/spike-results.md` (открытые вопросы про порог,
  перекрытия и звук вне ходов — закрыты)

- [ ] **Step 1: Итоги проверки**

`docs/superpowers/plan-3-checks.md` — по образцу `plan-2-checks.md`: сборки (номер запуска GitHub Actions), таблица
пунктов Task 19 с отметками Windows / Mac, что сделано сверх плана по ревью, раздел «Отложено на следующие планы».

- [ ] **Step 2: Спецификация, итоги спайка, дорожная карта**

Спецификация §3.3: авто-режим — собственная группировка голосов; «Пропустить» тоже запускает расшифровку; встреча без
ответа расшифровывается по кнопке. §5.4: шаги по решениям Плана 3 (§4.2–4.6), пропуск разделения для двух участников.
§9, риск 1: порог авто-режима закрыт. Итоги спайка §6: три открытых вопроса (порог, перекрытия, звук вне ходов) —
закрыты Планом 3 со ссылкой на `plan-3-checks.md`. Дорожная карта: План 3 → «выполнен ([решения](…), [план](…),
[проверки](../plan-3-checks.md))».

- [ ] **Step 3: Коммит документов**

```bash
git add docs
git commit -m "docs: record plan 3 checks and mark plan 3 done"
```

- [ ] **Step 4: Слияние в `main`**

```bash
git checkout main
git pull
git merge --no-ff plan-3-transcription -m "Merge plan 3: transcription"
npm ci
npm run typecheck && npm test
git push
```

Expected: проверки проходят; `ci` на `main` в GitHub Actions зелёный (вместе с `npm run test:models`).

- [ ] **Step 5: Память проекта**

Обновить `textmeet-project` в памяти Claude: План 3 выполнен (коммит слияния), что отложено, следующий шаг — подробный
План 4 (библиотека: переход по щелчку, правка, переименование спикеров, поиск, удаление) — сначала прочитать
«Отложено» в `plan-2-checks.md` и `plan-3-checks.md`.
