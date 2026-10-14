# TextMeet — План 9: «Локальная модель для итогов»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Во встрече — «Итоги встречи» и свои вопросы к ней, которые пишет модель на компьютере пользователя (без интернета, на видеокарте); модель выбирается и скачивается в каталоге на вкладке настроек «ИИ»; итоги сохраняются, ищутся поиском и попадают в начало выгрузки.

**Architecture:** Модели для итогов — ещё одна группа в существующем менеджере моделей (`llm/<модель>/<файл>.gguf`, тот же скачиватель, одно скачивание на всю программу). Движок — `llama-server` из llama.cpp b11588 в составе программы (`resources/llama`), дочерний процесс main на 127.0.0.1 со случайным ключом (`src/main/ai/llama-server.ts`); запросы — `/tokenize` и поток `/v1/chat/completions` (`llm-client.ts`). Очередь `AiRunner` — один запрос на всю программу, пишет `ai.json` в папку встречи. Окно — блок `AiBlock` над текстом встречи и каталог `AiModelSettings`.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0, React 19.3, TypeScript 7.0.2, zod 4.6.5, Vitest 5.0.2, Playwright 1.63.0; llama.cpp b11588 (Windows — Vulkan, Mac — Metal). Новых пакетов npm нет.

**Spec:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.5, §3.6. **Решения Плана 9:** [2026-10-13-textmeet-plan-9-design.md](../specs/2026-10-13-textmeet-plan-9-design.md). **Макет:** [Макет TextMeet](https://claude.ai/artifact/Urmc3atvSFifUpDyBzjeR6), листы 17–20 («План 9 · Локальная модель для итогов»).

## Global Constraints

- Все тексты интерфейса — по-русски, дословно как в решениях Плана 9 (§2, §6) и на листах 17–20: «Итоги встречи»,
  «Модель для итогов», «Выбрана», «Скачанные», «Можно скачать», «Рекомендуется», «оценка», «Готовим модель…», «Читаем
  встречу…», «Остановить», «Обновить», «Свернуть», «Заменить итоги?», «Текст встречи меняли после итогов», «Свой вопрос к
  встрече — например, что решили по срокам?», «Спросить», «Отвечает модель на вашем компьютере — важное проверяйте по
  тексту встречи.», «Открыть настройки ИИ», «Перейти», «· остановлено».
- Скрытые правила модели — дословно §4.2 решений. Окно модели — 65 536 «кусочков» (T-lite — 40 960), под ответ —
  2048; ответ — до 2048 (итоги) / 1024 (вопрос); температура 0,3; «размышления» выключены.
- llama.cpp — ровно b11588, архивы сверяются по SHA-256 (Windows `696f75ee…9944`, Mac `95039180…b9d`); модели — адреса
  Hugging Face, закреплённые на коммитах, с размером и SHA-256 (полные значения — в `registry.ts`).
- `llama-server` слушает только `127.0.0.1`, со случайным ключом (`LLAMA_API_KEY`); 5 минут без запросов — завершается;
  выход из программы и завершение сеанса Windows — завершается.
- Один запрос к модели на всю программу; одно скачивание модели на всю программу (расшифровки или ИИ).
- Текст встреч, итогов и вопросов в журнал не пишется — только ошибки движка (последние 50 строк его вывода).
- `settings.json`: новое поле `aiModel` (испорченное — `null`), `schemaVersion` не меняется; `ai.json` — `version: 1`.
- Новых зависимостей npm нет; облачный ИИ не подключается.

## Review Focus

- **Встреча длиннее окна модели** (у T-lite — больше ~2,5 часа) — не отправляется, блок объясняет и советует другую
  модель или «Скопировать для ИИ». Тесты: Task 3 (`ai-runner.test.ts`, «does not send a meeting longer…»), Task 4
  (`e2e/ai-summary.spec.ts`, «a meeting too long…»).
- **«Остановить», выход из программы или удаление встречи посреди ответа** — написанное сохраняется как
  «остановлено» (выход ждёт до 2 с), удалённая встреча — ничего; движок после выхода не остаётся работать. Тесты: Task 3
  (`ai-runner.test.ts`, `e2e/ai-engine.spec.ts`), Task 6 (запуск, отменённый выходом; удаление встречи во время подготовки).
- **Удаление модели, пока работает движок** (Windows не даёт удалить открытый файл) и запрос во время удаления —
  движок завершается до удаления, запрос получает «занято»; пока модель отвечает, «Удалить» недоступна. Тесты: Task 1
  (`e2e/ai-models.spec.ts` — каталог), Task 6 (`ai-runner.test.ts`, «deleting a model stops the engine first…»).
- **Испорченный `ai.json` или файл более новой версии** — блок пуст, файл не трогается до новых итогов или вопроса,
  выгрузка и поиск — без итогов. Тесты: Task 3 (`ai-store.test.ts`), Task 5 (`export-meeting.test.ts`,
  `search-index.test.ts`).
- **Ответ модели с HTML, ссылками, недописанной разметкой** (ответ ещё пишется) — показывается текстом, без оживших
  ссылок и HTML. Тесты: Task 4 (`ai-markdown.test.ts`).

---

## Факты, на которые опирается план (проверены 2026-10-14 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии (`D:\TextMeet-p9\proto`, ветка от `91059e1`) на Windows 11:
1088 модульных тестов (покрытие 97 %), 87 сквозных (+2 пропущенных — проверки собранной программы). После каждой задачи
проверка типов и модульные тесты проходят. Ревью кода (typescript-reviewer) — без критичного; исправления — Task 6.
Внешний вид блока итогов и каталога проверен снимками в светлой и тёмной теме — совпадает с листами 17–20.

- **Настоящий движок через программу** (собранная программа, `llama-server` из `vendor/llama`, Qwen3.5 9B, подкаст
  пользователя 95 мин): кнопка «Скачать» при уже лежащем файле сверяет SHA-256 за 14 с; «Готовим модель…» — 5 с, первое
  слово итогов — 18 с, итоги готовы — 31 с; свой вопрос после итогов — первое слово через 0,8 с, ответ — 13 с. Путь к
  модели с кириллицей и пробелом работает.
- **Для `npm run test:llm` на этом компьютере** модель уже есть: `D:\TextMeet-p9\llm-root\llm\qwen3.5-9b\
  Qwen3.5-9B-Q4_K_M.gguf` (жёсткая ссылка на файл прототипа решений, 5,3 ГБ) — `TEXTMEET_LLM_MODELS_DIR` указывает на
  `D:\TextMeet-p9\llm-root`. Ничего не скачивать заново.
- **Выпуск llama.cpp на Windows** — 30 файлов (инструменты и их `*-impl.dll`); программе нужны только `llama-server.exe`,
  `llama-server-impl.dll`, `llama.dll`, `llama-common.dll`, `mtmd.dll`, `ggml*.dll`, `libomp.dll` — 83 МБ. На Mac архив
  лежит в папке `llama-b11588/`, библиотеки — со ссылками (`libggml.0.dylib → libggml.0.26.0.dylib`): скрипт
  сохраняет их ссылками. Ключ сервер берёт из переменной `LLAMA_API_KEY` (проверено по `--help`).
- **`tar` на Windows** — системный `C:\Windows\System32\tar.exe` (bsdtar, понимает zip): GNU tar из Git Bash принимает
  `D:` за адрес другого компьютера.
- **Размеры моделей в карточках — в двоичных гигабайтах**, как всё остальное в программе (`formatBytes`): Qwen3.5 9B —
  «5,3 ГБ» (на листе 17 было нарисовано «5,7 ГБ» — десятичные).
- **Поддельный `llama-server`** (`src/test-support/fake-llama-server.mjs`) запускается тем же Electron в режиме Node
  (`ELECTRON_RUN_AS_NODE=1`); вопрос от итогов он отличает по пределу ответа (≤ 1024); слово «УПАДИ» в тексте встречи
  роняет его посреди ответа, «ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА» — даёт миллион «кусочков».
- **Модульные тесты под нагрузкой:** при полном прогоне один раз упали два старых теста с таймингами
  (`controller.test.ts`, `queue.test.ts`); повторный прогон — зелёный. Если повторится — прогнать эти файлы отдельно.
- **На этом компьютере установлен TextMeet**, он держит `Ctrl+Space`: проверка «Сбросить» в `e2e/hotkey.spec.ts`
  локально падает, пока установленная программа запущена (не закрывать её по имени процесса — это программа
  пользователя).
- **Файлы в рабочей копии — с окончаниями CRLF** (`core.autocrlf=true`), в блоках плана — LF: заменяйте блоки
  инструментом правки (он сопоставляет строки без учёта окончаний), а не побайтовыми скриптами.
- **Отправка на GitHub** — только с согласия пользователя (см. Task 9): `main` и ветки Планов 5, 6, 9 ещё не отправлены.

## Известные ограничения (в «Отложено» проверок Плана 9)

- Если сама программа упадёт (не выход), `llama-server` может остаться работать до перезагрузки или до «Диспетчера
  задач»: у Windows нет «умри вместе с родителем». Следующий запуск запустит второй сервер.
- Итоги, упёршиеся в предел длины ответа (2048 «кусочков»), сохраняются как дописанные, без пометки.
- Неудача запроса по встрече, с которой ушли до конца ответа, видна при следующем открытии этой встречи (до ухода с неё).
- «Остановить» в первые доли секунды (пока запрос готовится) не срабатывает — запрос начнётся; его можно остановить
  следом.
- Испорченный, но правильного размера файл модели даёт общее «Модель не смогла ответить…», а не «файл повреждён».
- Вложенное оформление (`**жирный *курсив* жирный**`) показывается со звёздочками; вложенные списки — одним списком.
- В архиве llama.cpp для Windows нет файла лицензии самой llama.cpp (MIT) — только OpenMP.
- Скорость на Mac (M4, 16 ГБ) не замерена — проверка после публикации.

## Что сознательно не входит в План 9

- Облачные Claude и ChatGPT; свои файлы моделей; итоги сами после расшифровки (только по кнопке); история диалога в
  вопросах; CUDA; ускорение расшифровки на видеокарте (решения Плана 9, §1).

## Карта файлов

```
src/shared/llm-models.ts                 # каталог моделей для итогов, effectiveAiModel, AiModelsState
src/shared/ai.ts                         # ai.json (схема), AiState / AiJob / AiFailure / AiFinished, aiCaption
src/shared/ai-markdown.ts                # оформление ответа: заголовки, списки, жирный, курсив; aiPlainText
src/shared/settings.ts, transcription.ts, format.ts, export-doc.ts, search.ts, ipc.ts
src/main/models/registry.ts              # LLM_FILES (llm/<модель>/<файл>.gguf), TRANSCRIPTION_GROUP_IDS
src/main/models/catalog-downloads.ts     # одно скачивание на всю программу, «осталось около …»
src/main/models/models-state.ts          # buildAiModelsState
src/main/ai/ai-models.ts                 # currentAiModel: выбранная или первая скачанная
src/main/ai/llama-server.ts              # процесс llama-server
src/main/ai/llm-client.ts, sse.ts        # /tokenize и поток ответа
src/main/ai/ai-store.ts                  # ai.json
src/main/ai/ai-messages.ts               # правила, текст встречи, задание, отпечаток, проверка длины
src/main/ai/ai-runner.ts                 # очередь AiRunner, llamaEngine
src/main/ai/ai-meeting.ts                # итоги для окна, удаление вопроса
src/main/library/search-index.ts         # итоги и ответы в поиске
src/main/export/export-meeting.ts, docx.ts  # итоги в выгрузке
src/main/ipc.ts, index.ts, texts.ts, preload/index.ts
src/renderer/main/CatalogCard.tsx        # общая карточка каталога (ModelCard — на ней)
src/renderer/main/AiModelSettings.tsx, ai-catalog.ts    # «Модель для итогов»
src/renderer/main/AiBlock.tsx, AiMarkdown.tsx, ai-block.ts  # блок «Итоги встречи»
src/renderer/main/hooks.ts               # useModelCatalog, useAiState, useAiMeeting
src/renderer/main/MeetingPane.tsx, App.tsx, SearchResults.tsx, SettingsPane.tsx, TranscriptionSettings.tsx, styles.css
src/test-support/fake-llama-server.mjs   # поддельный llama-server для автотестов
scripts/fetch-llama.mjs                  # движок в vendor/llama
e2e/ai-models.spec.ts, ai-engine.spec.ts, ai-summary.spec.ts, ai-search.spec.ts
```

## Задачи

Ветка — `plan-9-local-ai` (на ней уже документ решений). Проверка после каждой задачи: `npm run typecheck`, затем
`npx vitest run`; где указано — сквозные тесты (`npm run build`, затем `npx playwright test`).

### Task 1: Каталог «Модель для итогов» на вкладке «ИИ»

**Files:**
- Create: `e2e/ai-models.spec.ts`, `src/main/ai/ai-models.test.ts`, `src/main/ai/ai-models.ts`, `src/renderer/main/AiModelSettings.tsx`, `src/renderer/main/CatalogCard.tsx`, `src/renderer/main/ai-catalog.test.ts`, `src/renderer/main/ai-catalog.ts`, `src/shared/llm-models.test.ts`, `src/shared/llm-models.ts`
- Modify: `src/main/ipc.ts`, `src/main/models/catalog-downloads.test.ts`, `src/main/models/catalog-downloads.ts`, `src/main/models/models-state.test.ts`, `src/main/models/models-state.ts`, `src/main/models/registry.test.ts`, `src/main/models/registry.ts`, `src/main/texts.test.ts`, `src/main/texts.ts`, `src/preload/index.ts`, `src/renderer/main/ModelCard.tsx`, `src/renderer/main/SettingsPane.tsx`, `src/renderer/main/TranscriptionSettings.tsx`, `src/renderer/main/hooks.ts`, `src/renderer/main/styles.css`, `src/shared/format.test.ts`, `src/shared/format.ts`, `src/shared/ipc.ts`, `src/shared/settings.test.ts`, `src/shared/settings.ts`, `src/shared/transcription.ts`

**Interfaces:**
- Consumes: `ModelManager` / `FakeModelStore`, `CatalogDownloads`, `buildModelsState`, `SettingsSchema`, `downloadButton`
  и `catalogErrorsAfter` (`model-catalog.ts`).
- Produces: `LLM_MODEL_IDS`, `LlmModelId`, `LlmModelInfo`, `LLM_MODELS`, `llmModel(id)`, `isLlmModelId`, `RECOMMENDED_LLM_MODEL`,
  `effectiveAiModel(selected, installed)`, `AiModelsState` (`shared/llm-models.ts`; в Task 3 к нему добавится `busy`);
  `ModelGroupId` = `AsrModelId | 'voices' | LlmModelId`, `CatalogModelId`, `CatalogDownload.remainingSec` (`shared/transcription.ts`);
  `Settings.aiModel: LlmModelId | null`; `LLM_FILES`, `MODEL_FILES` (все), `TRANSCRIPTION_GROUP_IDS`, `llmFilePath(root, id)`
  (`registry.ts`); `buildAiModelsState(groups, selected, downloads)` (в Task 3 — ещё `busy`); `currentAiModel(deps):
  Promise<{ groups, selected }>`; `aiTexts.download(err)`; `formatDownloadedGb`, `formatRemaining` (`shared/format.ts`);
  `CatalogCard`, `useModelCatalog(load, watch)`; `window.textmeet.getAiModels / downloadAiModel / cancelAiModelDownload /
  selectAiModel / deleteAiModel`.

`shared/llm-models.ts` — каталог из четырёх моделей (решения Плана 9, §3): название, автор, описание, предупреждение
(T-lite), языки, полоски «качество» / «скорость», замерена ли (иначе пометка «оценка»), окно модели в программе
(65 536, у T-lite — 40 960); `effectiveAiModel` — выбранная, если скачана, иначе первая скачанная по каталогу.
Файлы моделей — в реестре (`models/registry.ts`, `LLM_FILES`: один GGUF на модель в `llm/<модель>/`, адреса Hugging
Face закреплены на коммитах). В настройках — `aiModel` (испорченное забывается). Скачивание из каталогов — одно на всю
программу: `CatalogDownloads` качает и модели для итогов (без моделей голосов) и считает «осталось около …»; причины
неудач — словами «модель для итогов» (`aiTexts.download`). `ai/ai-models.ts` (`currentAiModel`) запоминает выбор,
который программа сделала сама. Каналы `ai:get-models`, `ai:download-model`, `ai:cancel-download`, `ai:select-model`,
`ai:delete-model`. В окне — общая карточка каталога `CatalogCard` (карточка модели расшифровки переходит на неё),
общий хук `useModelCatalog` (вкладка «Расшифровка» — тоже на нём) и раздел `AiModelSettings` под «Запросом для ИИ»:
группы «Выбрана», «Скачанные», «Можно скачать», размер в гигабайтах, ход «2,7 из 6,0 ГБ · осталось около 4 мин».

- [ ] **Step 1: Тесты**

**Создать `e2e/ai-models.spec.ts`:**

```ts
// Каталог «Модель для итогов» (План 9): поддельное хранилище моделей (TEXTMEET_TEST_ASR=fake) — проверяются окно и
// склейка с main, а не скачивание.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, openSettings, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const aiModelSetting = async (userDataDir: string) =>
  (JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')) as Record<string, unknown>).aiModel;

test('the AI catalog downloads, selects the first model by itself and deletes models', async () => {
  // Шаг «скачивания» долгий: проверки «ждут» и «Отменить» успевают и на медленной машине.
  launched = await launchApp({ downloadStepMs: 1500 });
  const { page, userDataDir } = launched;
  await openSettings(page, 'ИИ');

  const available = page.getByRole('group', { name: 'Можно скачать' });
  await expect(available.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('group', { name: 'Выбрана' })).toHaveCount(0);
  const qwen9 = page.getByRole('article', { name: 'Qwen3.5 9B' });
  await expect(qwen9).toContainText('Рекомендуется');
  await expect(qwen9).toContainText('5,3 ГБ');
  await expect(page.getByRole('article', { name: 'GigaChat 3.1 Lightning' })).toContainText('оценка');
  await expect(page.getByRole('article', { name: 'T-lite-it 2.1' })).toContainText('Встречи до ~2,5 часа');

  // Скачивание идёт: прогресс в карточке, остальные «Скачать» ждут — и модели расшифровки тоже.
  const small = page.getByRole('article', { name: 'Qwen3.5 4B' });
  await small.getByRole('button', { name: 'Скачать: Qwen3.5 4B' }).click();
  await expect(small.getByRole('progressbar', { name: 'Скачивание: Qwen3.5 4B' })).toBeVisible();
  await expect(small).toContainText(/из 2,6 ГБ/);
  await expect(page.getByRole('button', { name: 'Скачать: Qwen3.5 9B' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Расшифровка' }).click();
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeDisabled();
  await page.getByRole('tab', { name: 'ИИ' }).click();
  await small.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByRole('button', { name: 'Скачать: Qwen3.5 9B' })).toBeEnabled();

  // Первая скачанная модель выбирается сама.
  await small.getByRole('button', { name: 'Скачать: Qwen3.5 4B' }).click();
  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'Qwen3.5 4B' })).toBeVisible({ timeout: 20_000 });
  await expect(selected).toContainText('скачана · 2,6 ГБ');
  await expect.poll(() => aiModelSetting(userDataDir)).toBe('qwen3.5-4b');

  // Вторая — в «Скачанные», её можно выбрать.
  await page.getByRole('button', { name: 'Скачать: Qwen3.5 9B' }).click();
  const downloaded = page.getByRole('group', { name: 'Скачанные' });
  await expect(downloaded.getByRole('article', { name: 'Qwen3.5 9B' })).toBeVisible({ timeout: 20_000 });
  await downloaded.getByRole('button', { name: 'Выбрать: Qwen3.5 9B' }).click();
  await expect(selected.getByRole('article', { name: 'Qwen3.5 9B' })).toBeVisible();
  await expect.poll(() => aiModelSetting(userDataDir)).toBe('qwen3.5-9b');

  // Удалили выбранную — выбирается другая скачанная; удалили и её — ничего не выбрано.
  await selected.getByRole('button', { name: 'Удалить: Qwen3.5 9B' }).click();
  await expect(selected.getByRole('article', { name: 'Qwen3.5 4B' })).toBeVisible();
  await expect.poll(() => aiModelSetting(userDataDir)).toBe('qwen3.5-4b');
  await selected.getByRole('button', { name: 'Удалить: Qwen3.5 4B' }).click();
  await expect(page.getByRole('group', { name: 'Выбрана' })).toHaveCount(0);
  await expect(available.getByRole('article')).toHaveCount(4);
  await expect.poll(() => aiModelSetting(userDataDir)).toBeNull();
});
```

**Создать `src/main/ai/ai-models.test.ts`:**

```ts
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings';
import type { ModelGroupState } from '../../shared/transcription';
import type { ModelGroupId } from '../models/registry';
import { currentAiModel } from './ai-models';

function setup(installed: ModelGroupId[], aiModel: Settings['aiModel'], failSave = false) {
  let settings: Settings = { ...DEFAULT_SETTINGS, aiModel };
  const groups: (ModelGroupState & { id: ModelGroupId })[] = installed.map((id) => ({ id, sizeBytes: 1, installed: true }));
  const deps = {
    models: { state: async () => groups },
    settings: {
      get: () => settings,
      update: vi.fn(async (patch: Partial<Settings>) => {
        if (failSave) throw new Error('EBUSY');
        settings = { ...settings, ...patch };
        return settings;
      }),
    },
    logger: { warn: vi.fn() },
  };
  return { deps, settings: () => settings };
}

describe('currentAiModel', () => {
  it('selects the first downloaded model by itself and remembers it', async () => {
    const t = setup(['gigaam-v3-e2e-rnnt', 'qwen3.5-4b'], null);
    expect((await currentAiModel(t.deps)).selected).toBe('qwen3.5-4b');
    expect(t.settings().aiModel).toBe('qwen3.5-4b');
  });

  it('keeps the chosen model without writing the settings again', async () => {
    const t = setup(['qwen3.5-9b', 'qwen3.5-4b'], 'qwen3.5-4b');
    expect((await currentAiModel(t.deps)).selected).toBe('qwen3.5-4b');
    expect(t.deps.settings.update).not.toHaveBeenCalled();
  });

  it('forgets a deleted model: another downloaded one, or none', async () => {
    const other = setup(['t-lite-it-2.1'], 'qwen3.5-9b');
    expect((await currentAiModel(other.deps)).selected).toBe('t-lite-it-2.1');
    const none = setup([], 'qwen3.5-9b');
    expect((await currentAiModel(none.deps)).selected).toBeNull();
    expect(none.settings().aiModel).toBeNull();
  });

  it('still answers when the settings cannot be saved', async () => {
    const t = setup(['qwen3.5-9b'], null, true);
    const choice = await currentAiModel(t.deps);
    expect(choice.selected).toBe('qwen3.5-9b');
    expect(choice.groups).toHaveLength(1);
    expect(t.deps.logger.warn).toHaveBeenCalled();
  });
});
```

**В `src/main/models/catalog-downloads.test.ts` заменить:**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { transcriptionTexts } from '../texts';
import { CatalogDownloads, DOWNLOAD_REPORT_MS, DOWNLOAD_RUNNING } from './catalog-downloads';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { ModelGroupId } from './registry';
```

**на:**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { aiTexts, transcriptionTexts } from '../texts';
import { CatalogDownloads, DOWNLOAD_REPORT_MS, DOWNLOAD_RUNNING, REMAINING_AFTER_MS } from './catalog-downloads';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { ModelGroupId } from './registry';
```

**В `src/main/models/catalog-downloads.test.ts` заменить:**

```ts
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
```

**на:**

```ts
    const t = setup();
    t.downloads.start('t-one');
    expect(t.calls[0]?.groups).toEqual(['t-one', 'voices']);
    expect(t.downloads.snapshot()).toEqual({
      download: { id: 't-one', done: 0, total: 0, remainingSec: null },
      downloadError: null,
    });
    expect(t.downloads.isBusy()).toBe(true);
    t.tick(DOWNLOAD_REPORT_MS);
    t.calls[0]!.options.onProgress?.({ done: 50, total: 200 });
    expect(t.downloads.snapshot().download).toEqual({ id: 't-one', done: 50, total: 200, remainingSec: null });
    t.calls[0]!.resolve();
    await vi.waitFor(() => expect(t.downloads.isBusy()).toBe(false));
    expect(t.downloads.snapshot()).toEqual({ download: null, downloadError: null });
```

**В `src/main/models/catalog-downloads.test.ts` заменить:**

```ts
    expect(logger.warn).toHaveBeenCalled();
    expect(t.downloads.isBusy()).toBe(false);
  });
});
```

**на:**

```ts
    expect(logger.warn).toHaveBeenCalled();
    expect(t.downloads.isBusy()).toBe(false);
  });

  it('downloads a model for summaries alone and names it in the reason of a failure', async () => {
    const t = setup();
    t.downloads.start('qwen3.5-4b');
    expect(t.calls[0]?.groups).toEqual(['qwen3.5-4b']);
    // Одно скачивание на всю программу: модель расшифровки ждёт модель для итогов.
    expect(() => t.downloads.start('t-one')).toThrow(DOWNLOAD_RUNNING);
    t.calls[0]!.reject(new DownloadError('network', 'нет связи с сервером'));
    await vi.waitFor(() => expect(t.downloads.isBusy()).toBe(false));
    expect(t.downloads.snapshot().downloadError).toEqual({
      id: 'qwen3.5-4b',
      message: aiTexts.download(new DownloadError('network', 'x')),
    });
  });

  it('tells how long is left once the speed is known', () => {
    const t = setup();
    t.downloads.start('qwen3.5-9b');
    const progress = (done: number) => t.calls[0]!.options.onProgress?.({ done, total: 1000 });
    // Первый ответ — точка отсчёта: докачанные куски скорость не завышают.
    progress(400);
    t.tick(REMAINING_AFTER_MS - 1);
    progress(450);
    expect(t.downloads.snapshot().download?.remainingSec).toBeNull();
    t.tick(1);
    progress(500);
    // 100 байт за 3 с → 500 оставшихся байт — за 15 с.
    expect(t.downloads.snapshot().download?.remainingSec).toBeCloseTo(15);
  });
});
```

**Заменить всё содержимое `src/main/models/models-state.test.ts` на:**

```ts
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { LLM_MODEL_IDS } from '../../shared/llm-models';
import { buildAiModelsState, buildModelsState } from './models-state';
import { groupSize } from './registry';

describe('buildModelsState', () => {
  it('lists every catalog model in order, the shared voice models apart, and what is going on', () => {
    const state = buildModelsState(
      [
        { id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true },
        { id: 'voices', sizeBytes: 3, installed: true },
      ],
      't-one',
      { download: { id: 't-one', done: 1, total: 2, remainingSec: null }, downloadError: null },
      true,
    );
    expect(state.models.map((m) => m.id)).toEqual([...ASR_MODEL_IDS]);
    expect(state.models[0]).toEqual({ id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true });
    expect(state.models.find((m) => m.id === 't-one')).toEqual({ id: 't-one', sizeBytes: groupSize('t-one'), installed: false });
    expect(state.voices).toEqual({ sizeBytes: 3, installed: true });
    expect(state).toMatchObject({
      selected: 't-one',
      download: { id: 't-one', done: 1, total: 2, remainingSec: null },
      downloadError: null,
      busy: true,
    });
  });

  it('shows a failed download only while the model is still missing', () => {
    const failed = (id: 't-one' | 'gigaam-v3-e2e-rnnt') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    const groups = [{ id: 'gigaam-v3-e2e-rnnt' as const, sizeBytes: 10, installed: true }];
    expect(buildModelsState(groups, 't-one', failed('t-one'), false).downloadError).toEqual({ id: 't-one', message: 'нет связи' });
    expect(buildModelsState(groups, 't-one', failed('gigaam-v3-e2e-rnnt'), false).downloadError).toBeNull();
  });

  it('leaves a failed download of a model for summaries to the AI catalog', () => {
    const failed = { download: null, downloadError: { id: 'qwen3.5-9b' as const, message: 'нет связи' } };
    expect(buildModelsState([], 't-one', failed, false).downloadError).toBeNull();
  });
});

describe('buildAiModelsState', () => {
  it('lists the models for summaries in catalog order with the download of any catalog', () => {
    const download = { id: 't-one' as const, done: 1, total: 2, remainingSec: 40 };
    const state = buildAiModelsState([{ id: 'qwen3.5-4b', sizeBytes: 7, installed: true }], 'qwen3.5-4b', {
      download,
      downloadError: null,
    });
    expect(state.models.map((m) => m.id)).toEqual([...LLM_MODEL_IDS]);
    expect(state.models.find((m) => m.id === 'qwen3.5-4b')).toEqual({ id: 'qwen3.5-4b', sizeBytes: 7, installed: true });
    expect(state.models[0]).toEqual({ id: 'qwen3.5-9b', sizeBytes: groupSize('qwen3.5-9b'), installed: false });
    expect(state).toMatchObject({ selected: 'qwen3.5-4b', download, downloadError: null });
  });

  it('shows only its own failed download, and only while the model is missing', () => {
    const failed = (id: 't-one' | 'qwen3.5-9b') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    expect(buildAiModelsState([], null, failed('qwen3.5-9b')).downloadError).toEqual({ id: 'qwen3.5-9b', message: 'нет связи' });
    expect(buildAiModelsState([], null, failed('t-one')).downloadError).toBeNull();
    const installed = [{ id: 'qwen3.5-9b' as const, sizeBytes: 1, installed: true }];
    expect(buildAiModelsState(installed, 'qwen3.5-9b', failed('qwen3.5-9b')).downloadError).toBeNull();
  });
});
```

**В `src/main/models/registry.test.ts` заменить:**

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { modelsRoot } from './models-dir';
import { ASR_FOLDERS, asrFilePath, groupFiles, groupSize, MODEL_FILES, MODEL_GROUP_IDS, modelFilePath, voicePaths } from './registry';

describe('model registry', () => {
  it('describes every file with a url, a size and a SHA-256', () => {
```

**на:**

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { LLM_MODEL_IDS } from '../../shared/llm-models';
import { modelsRoot } from './models-dir';
import {
  ASR_FOLDERS,
  asrFilePath,
  groupFiles,
  groupSize,
  llmFilePath,
  MODEL_FILES,
  MODEL_GROUP_IDS,
  modelFilePath,
  TRANSCRIPTION_GROUP_IDS,
  voicePaths,
} from './registry';

describe('model registry', () => {
  it('describes every file with a url, a size and a SHA-256', () => {
```

**В `src/main/models/registry.test.ts` заменить:**

```ts
    expect(new Set(Object.values(ASR_FOLDERS)).size).toBe(ASR_MODEL_IDS.length);
  });

  it('pins every Hugging Face file to a commit', () => {
    const fromHuggingFace = MODEL_FILES.filter((f) => f.url.startsWith('https://huggingface.co/'));
    expect(fromHuggingFace.length).toBeGreaterThan(30);
```

**на:**

```ts
    expect(new Set(Object.values(ASR_FOLDERS)).size).toBe(ASR_MODEL_IDS.length);
  });

  it('has one GGUF file for every model for summaries, in llm/<model>/', () => {
    for (const id of LLM_MODEL_IDS) {
      const files = groupFiles(id);
      expect(files).toHaveLength(1);
      expect(files[0]?.path.startsWith(`llm/${id}/`)).toBe(true);
      expect(files[0]?.path.endsWith('.gguf')).toBe(true);
    }
    expect(llmFilePath('M', 'qwen3.5-9b')).toBe(join('M', 'llm', 'qwen3.5-9b', 'Qwen3.5-9B-Q4_K_M.gguf'));
    expect(groupSize('qwen3.5-9b')).toBe(5_680_522_464);
  });

  it('keeps the transcription groups apart from the models for summaries', () => {
    expect(MODEL_GROUP_IDS).toEqual([...TRANSCRIPTION_GROUP_IDS, ...LLM_MODEL_IDS]);
    expect(TRANSCRIPTION_GROUP_IDS).toEqual([...ASR_MODEL_IDS, 'voices']);
  });

  it('pins every Hugging Face file to a commit', () => {
    const fromHuggingFace = MODEL_FILES.filter((f) => f.url.startsWith('https://huggingface.co/'));
    expect(fromHuggingFace.length).toBeGreaterThan(30);
```

**В `src/main/texts.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import {
  dialogTexts,
  MIC_ACCESS_DENIED,
  micProblem,
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import {
  aiTexts,
  dialogTexts,
  MIC_ACCESS_DENIED,
  micProblem,
```

**В `src/main/texts.test.ts` заменить:**

```ts
    expect(transcriptionTexts.download(new DownloadError('cancelled', 'x'))).toBe('Скачивание модели отменено.');
  });

  it('names the model that could not be loaded', () => {
    expect(transcriptionTexts.modelLoad('Parakeet v3')).toMatch(/^Не удалось загрузить модель «Parakeet v3»\. /);
  });
```

**на:**

```ts
    expect(transcriptionTexts.download(new DownloadError('cancelled', 'x'))).toBe('Скачивание модели отменено.');
  });

  it('names the model for summaries when it could not be downloaded', () => {
    expect(aiTexts.download(new DownloadError('network', 'x'))).toBe(
      'Не удалось скачать модель для итогов: нет связи с сервером. Проверьте интернет.',
    );
    expect(aiTexts.download(new DownloadError('space', 'x', { neededBytes: 5.5 * 1024 ** 3 }))).toBe(
      'Не хватает места на диске для модели для итогов: нужно 5632 МБ свободного места.',
    );
    expect(aiTexts.download(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }))).toBe(
      'Не удалось сохранить модель для итогов на диск.',
    );
    expect(aiTexts.download(new Error('что-то'))).toMatch(/^Не удалось подготовить модель для итогов\. /);
  });

  it('names the model that could not be loaded', () => {
    expect(transcriptionTexts.modelLoad('Parakeet v3')).toMatch(/^Не удалось загрузить модель «Parakeet v3»\. /);
  });
```

**Создать `src/renderer/main/ai-catalog.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { LLM_MODEL_IDS, type AiModelsState, type LlmModelId } from '../../shared/llm-models';
import { aiCatalogSections, aiDownloadText, aiModelState, aiModelTag, aiSizeText } from './ai-catalog';

const GB = 1024 ** 3;

function state(selected: LlmModelId | null, installed: LlmModelId[]): AiModelsState {
  return {
    selected,
    models: LLM_MODEL_IDS.map((id) => ({ id, sizeBytes: 5 * GB, installed: installed.includes(id) })),
    download: null,
    downloadError: null,
  };
}

describe('aiCatalogSections', () => {
  it('puts the chosen model first, then the downloaded ones, then the ones to download', () => {
    expect(aiCatalogSections(state('qwen3.5-4b', ['qwen3.5-4b', 't-lite-it-2.1']))).toEqual({
      selected: 'qwen3.5-4b',
      downloaded: ['t-lite-it-2.1'],
      available: ['qwen3.5-9b', 'gigachat-3.1-lightning'],
    });
  });

  it('has no chosen model while nothing is downloaded', () => {
    expect(aiCatalogSections(state(null, []))).toEqual({ selected: null, downloaded: [], available: [...LLM_MODEL_IDS] });
  });
});

describe('AI catalog labels', () => {
  it('tags the recommended model and the models nobody measured', () => {
    expect(aiModelTag('qwen3.5-9b')).toEqual({ text: 'Рекомендуется', estimate: false });
    expect(aiModelTag('gigachat-3.1-lightning')).toEqual({ text: 'оценка', estimate: true });
  });

  it('shows the size in gigabytes, and that the model is downloaded', () => {
    expect(aiSizeText({ sizeBytes: 5_680_522_464, installed: false })).toBe('5,3 ГБ');
    expect(aiSizeText({ sizeBytes: 5_680_522_464, installed: true })).toBe('скачана · 5,3 ГБ');
    expect(aiModelState(state(null, ['qwen3.5-4b']), 'qwen3.5-4b')).toMatchObject({ sizeBytes: 5 * GB, installed: true });
  });

  it('tells the bytes and, once known, how long is left', () => {
    const download = { id: 'qwen3.5-9b' as const, done: 2.7 * GB, total: 6 * GB, remainingSec: null };
    expect(aiDownloadText({ ...download, total: 0 })).toBe('Скачиваем…');
    expect(aiDownloadText(download)).toBe('2,7 из 6,0 ГБ');
    expect(aiDownloadText({ ...download, remainingSec: 230 })).toBe('2,7 из 6,0 ГБ · осталось около 4 мин');
  });
});
```

**В `src/shared/format.test.ts` заменить:**

```ts
import {
  formatBytes,
  formatDownloaded,
  formatDurationShort,
  formatLongDate,
  formatMegabytes,
  formatTimestamp,
} from './format';
```

**на:**

```ts
import {
  formatBytes,
  formatDownloaded,
  formatDownloadedGb,
  formatDurationShort,
  formatLongDate,
  formatMegabytes,
  formatRemaining,
  formatTimestamp,
} from './format';
```

**В `src/shared/format.test.ts` заменить:**

```ts
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
```

**на:**

```ts
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDownloadedGb', () => {
  it('shows the bytes of a big model in gigabytes with one decimal', () => {
    expect(formatDownloadedGb(2.74 * 1024 ** 3, 6_474_702_976)).toBe('2,7 из 6,0 ГБ');
    expect(formatDownloadedGb(0, 5_680_522_464)).toBe('0,0 из 5,3 ГБ');
  });
});

describe('formatRemaining', () => {
  it.each([
    [0, 'осталось меньше минуты'],
    [59, 'осталось меньше минуты'],
    [60, 'осталось около 1 мин'],
    [200, 'осталось около 4 мин'],
    [3900, 'осталось около 1 ч 05 мин'],
  ])('%s с → %s', (seconds, text) => {
    expect(formatRemaining(seconds)).toBe(text);
  });
});
```

**Создать `src/shared/llm-models.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { effectiveAiModel, isLlmModelId, LLM_MODEL_IDS, LLM_MODELS, llmModel, RECOMMENDED_LLM_MODEL } from './llm-models';

describe('LLM catalog', () => {
  it('describes every model once, in the order of the ids', () => {
    expect(LLM_MODELS.map((m) => m.id)).toEqual([...LLM_MODEL_IDS]);
    expect(LLM_MODEL_IDS[0]).toBe(RECOMMENDED_LLM_MODEL);
  });

  it('gives every model bars from 1 to 5 and a window big enough for a meeting', () => {
    for (const model of LLM_MODELS) {
      for (const bar of [model.quality, model.speed]) {
        expect(bar).toBeGreaterThanOrEqual(1);
        expect(bar).toBeLessThanOrEqual(5);
      }
      // Час разговора ≈ 14 000 «кусочков» (решения Плана 9, §3): в окно помещается больше двух часов.
      expect(model.contextTokens).toBeGreaterThanOrEqual(40_960);
    }
  });

  it('warns about the shorter window of T-lite only, and marks only the measured model as measured', () => {
    expect(LLM_MODELS.filter((m) => m.warning).map((m) => m.id)).toEqual(['t-lite-it-2.1']);
    expect(llmModel('t-lite-it-2.1').contextTokens).toBe(40_960);
    expect(LLM_MODELS.filter((m) => m.measured).map((m) => m.id)).toEqual(['qwen3.5-9b']);
  });

  it('recognizes catalog ids only', () => {
    expect(isLlmModelId('qwen3.5-4b')).toBe(true);
    expect(isLlmModelId('gigaam-v3-e2e-rnnt')).toBe(false);
    expect(isLlmModelId(null)).toBe(false);
  });
});

describe('effectiveAiModel', () => {
  it('keeps the chosen model while it is downloaded', () => {
    expect(effectiveAiModel('qwen3.5-4b', ['qwen3.5-9b', 'qwen3.5-4b'])).toBe('qwen3.5-4b');
  });

  it('picks the first downloaded model in catalog order when none is chosen or the chosen one is gone', () => {
    expect(effectiveAiModel(null, ['qwen3.5-4b', 't-lite-it-2.1'])).toBe('t-lite-it-2.1');
    expect(effectiveAiModel('qwen3.5-9b', ['qwen3.5-4b'])).toBe('qwen3.5-4b');
  });

  it('has nothing to pick when nothing is downloaded', () => {
    expect(effectiveAiModel('qwen3.5-9b', [])).toBeNull();
    expect(effectiveAiModel(null, [])).toBeNull();
  });
});
```

**В `src/shared/settings.test.ts` заменить:**

```ts
      asrModel: 'gigaam-v3-e2e-rnnt',
      exportDir: null,
      aiPrompt: null,
    });
  });
```

**на:**

```ts
      asrModel: 'gigaam-v3-e2e-rnnt',
      exportDir: null,
      aiPrompt: null,
      aiModel: null,
    });
  });
```

**В `src/shared/settings.test.ts` заменить:**

```ts
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
  });
});
```

**на:**

```ts
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
  });

  it('keeps the model for summaries and forgets an unknown or broken one', () => {
    expect(SettingsSchema.parse({ aiModel: 'qwen3.5-4b' }).aiModel).toBe('qwen3.5-4b');
    expect(SettingsSchema.parse({ aiModel: 'llama-70b', recordSounds: false })).toMatchObject({ aiModel: null, recordSounds: false });
    expect(SettingsSchema.parse({ aiModel: 7 }).aiModel).toBeNull();
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/ai/ai-models.test.ts src/main/models/catalog-downloads.test.ts src/main/models/models-state.test.ts src/main/models/registry.test.ts src/main/texts.test.ts src/renderer/main/ai-catalog.test.ts src/shared/format.test.ts src/shared/llm-models.test.ts src/shared/settings.test.ts`
Ожидается: FAIL — нет модулей `./llm-models`, `./ai-models`, `./ai-catalog`; у настроек нет поля `aiModel`.

- [ ] **Step 3: Код**

**Создать `src/main/ai/ai-models.ts`:**

```ts
// Модель для итогов: какая выбрана и скачана (решения Плана 9, §2.1). Выбор, который сделала сама программа (первая
// скачанная модель, замена удалённой), запоминается в настройках.
import { effectiveAiModel, isLlmModelId, type LlmModelId } from '../../shared/llm-models';
import type { ModelGroupState } from '../../shared/transcription';
import type { Logger } from '../logger';
import type { ModelStore } from '../models/model-manager';
import type { ModelGroupId } from '../models/registry';
import type { SettingsStore } from '../settings/settings-store';

export interface AiModelDeps {
  models: Pick<ModelStore, 'state'>;
  settings: Pick<SettingsStore, 'get' | 'update'>;
  logger: Pick<Logger, 'warn'>;
}

export interface AiModelChoice {
  /** Все группы моделей с диска — для каталога. */
  groups: (ModelGroupState & { id: ModelGroupId })[];
  /** Модель для итогов; null — ни одной не скачано. */
  selected: LlmModelId | null;
}

/** Скачанные модели и модель для итогов; новый выбор программы — в настройки (не записался — только в журнал). */
export async function currentAiModel(deps: AiModelDeps): Promise<AiModelChoice> {
  const groups = await deps.models.state();
  const installed = groups.flatMap((g) => (g.installed && isLlmModelId(g.id) ? [g.id] : []));
  const stored = deps.settings.get().aiModel;
  const selected = effectiveAiModel(stored, installed);
  if (selected !== stored) {
    await deps.settings
      .update({ aiModel: selected })
      .catch((err: unknown) => deps.logger.warn('Модель для итогов не запомнилась в настройках', err));
  }
  return { groups, selected };
}
```

**В `src/main/ipc.ts` заменить:**

```ts
} from '../shared/ipc';
import { AiPromptSchema, storedAiPrompt } from '../shared/ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { IMPORT_EXTENSIONS } from '../shared/import';
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { copyForAi, copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
```

**на:**

```ts
} from '../shared/ipc';
import { AiPromptSchema, storedAiPrompt } from '../shared/ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { LLM_MODEL_IDS, type AiModelsState } from '../shared/llm-models';
import { IMPORT_EXTENSIONS } from '../shared/import';
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { CatalogModelId, ModelsState, TranscriptionProgress } from '../shared/transcription';
import { currentAiModel } from './ai/ai-models';
import { copyForAi, copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
```

**В `src/main/ipc.ts` заменить:**

```ts
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildModelsState, type CatalogDownloadsSnapshot } from './models/models-state';
import { MODEL_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { systemSettingsUrl, transcriptionTexts } from './texts';
```

**на:**

```ts
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildAiModelsState, buildModelsState, type CatalogDownloadsSnapshot } from './models/models-state';
import { TRANSCRIPTION_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { systemSettingsUrl, transcriptionTexts } from './texts';
```

**В `src/main/ipc.ts` заменить:**

```ts
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  downloads: {
    start(id: AsrModelId): void;
    cancel(id: AsrModelId): Promise<void>;
    snapshot(): CatalogDownloadsSnapshot;
    isBusy(): boolean;
  };
```

**на:**

```ts
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  downloads: {
    start(id: CatalogModelId): void;
    cancel(id: CatalogModelId): Promise<void>;
    snapshot(): CatalogDownloadsSnapshot;
    isBusy(): boolean;
  };
```

**В `src/main/ipc.ts` заменить:**

```ts
  .max(1000);

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
```

**на:**

```ts
  .max(1000);

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const LlmModelIdSchema = z.enum(LLM_MODEL_IDS);
/** «Выбрать» есть только у скачанной модели: не скачанную окно выбрать не просит. */
const AI_MODEL_NOT_DOWNLOADED = 'Эта модель не скачана — сначала скачайте её.';
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
```

**В `src/main/ipc.ts` заменить:**

```ts
  handle(IPC.getModels, () => modelsState());

  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(MODEL_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    deps.transcription.stopIdleWorker();
```

**на:**

```ts
  handle(IPC.getModels, () => modelsState());

  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(TRANSCRIPTION_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    deps.transcription.stopIdleWorker();
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

  const aiModelsState = async (): Promise<AiModelsState> => {
    const { groups, selected } = await currentAiModel(deps);
    return buildAiModelsState(groups, selected, deps.downloads.snapshot());
  };

  handle(IPC.getAiModels, () => aiModelsState());

  handle(IPC.downloadAiModel, async (arg) => {
    deps.downloads.start(LlmModelIdSchema.parse(arg));
    return aiModelsState();
  });

  handle(IPC.cancelAiModelDownload, async (arg) => {
    await deps.downloads.cancel(LlmModelIdSchema.parse(arg));
    return aiModelsState();
  });

  handle(IPC.selectAiModel, async (arg) => {
    const id = LlmModelIdSchema.parse(arg);
    const installed = (await deps.models.state()).some((g) => g.id === id && g.installed);
    if (!installed) throw new Error(AI_MODEL_NOT_DOWNLOADED);
    await deps.settings.update({ aiModel: id });
    return aiModelsState();
  });

  handle(IPC.deleteAiModel, async (arg) => {
    const id = LlmModelIdSchema.parse(arg);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    try {
      await deps.models.remove(id);
    } catch (err) {
      throw new Error(transcriptionTexts.deleteModels(err), { cause: err });
    }
    // Удалили выбранную — выбирается другая скачанная (или никакая).
    return aiModelsState();
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
  onRecorder(IPC.recorderStarted, (message) => deps.controller.onStarted(message));
  onRecorder(IPC.recorderStartFailed, (message) => deps.controller.onStartFailed(message));
```

**Заменить всё содержимое `src/main/models/catalog-downloads.ts` на:**

```ts
// Скачивание из каталогов моделей (кнопки «Скачать» / «Отменить» в карточке, решения Плана 7, §2, и Плана 9, §2.1):
// одна модель за раз на всю программу — расшифровки или для итогов; прогресс в окно не чаще двух раз в секунду, отмена
// стирает недокачанное. Electron сюда не подключается.
import { isLlmModelId } from '../../shared/llm-models';
import type { CatalogModelId } from '../../shared/transcription';
import type { Logger } from '../logger';
import { aiTexts, transcriptionTexts } from '../texts';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { CatalogDownloadsSnapshot } from './models-state';
import type { ModelGroupId } from './registry';

/** Прогресс в окно — не чаще. */
export const DOWNLOAD_REPORT_MS = 500;
export const DOWNLOAD_RUNNING = 'Сейчас скачивается другая модель — дождитесь конца или отмените её скачивание.';
/** «Осталось около …» — когда скачивание идёт хотя бы столько: по первым секундам скорость не понять. */
export const REMAINING_AFTER_MS = 3000;

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
  id: CatalogModelId;
  done: number;
  total: number;
  /** Первый ответ о ходе скачивания: от него считается скорость (докачанные куски в неё не входят). */
  first: { at: number; done: number } | null;
  remainingSec: number | null;
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
      download: running && { id: running.id, done: running.done, total: running.total, remainingSec: running.remainingSec },
      downloadError: this.error,
    };
  }

  isBusy(): boolean {
    return this.running !== null;
  }

  /**
   * Начать скачивание модели (модели расшифровки — вместе с общими моделями голосов, если их нет). Та же модель уже
   * качается — ничего не делает; другая — отказ: две загрузки разом делили бы канал и место на диске.
   */
  start(id: CatalogModelId): void {
    if (this.running?.id === id) return;
    if (this.running) throw new Error(DOWNLOAD_RUNNING);
    const controller = new AbortController();
    const running: Running = {
      id,
      done: 0,
      total: 0,
      first: null,
      remainingSec: null,
      controller,
      finished: Promise.resolve(false),
    };
    this.running = running;
    if (this.error?.id === id) this.error = null;
    const isLlm = isLlmModelId(id);
    running.finished = this.deps.models
      .ensure(isLlm ? [id] : [id, 'voices'], {
        signal: controller.signal,
        onProgress: ({ done, total }) => {
          running.done = done;
          running.total = total;
          running.remainingSec = this.remaining(running);
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
          this.error = { id, message: isLlm ? aiTexts.download(err) : transcriptionTexts.download(err) };
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
  async cancel(id: CatalogModelId): Promise<void> {
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

  /** Сколько секунд осталось при скорости с первого ответа; первые секунды — null. */
  private remaining(running: Running): number | null {
    const now = this.deps.now();
    running.first ??= { at: now, done: running.done };
    const elapsed = now - running.first.at;
    const bytes = running.done - running.first.done;
    if (elapsed < REMAINING_AFTER_MS || bytes <= 0) return null;
    return ((running.total - running.done) * elapsed) / bytes / 1000;
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

**Заменить всё содержимое `src/main/models/models-state.ts` на:**

```ts
// Что окно видит в каталогах моделей: расшифровки (модели по порядку, общие модели голосов, выбор, скачивание) и
// для итогов (вкладка «ИИ»).
import { ASR_MODEL_IDS, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import { isLlmModelId, LLM_MODEL_IDS, type AiModelsState, type LlmModelId } from '../../shared/llm-models';
import type { CatalogDownload, CatalogModelId, ModelGroupState, ModelsState } from '../../shared/transcription';
import { groupSize, type ModelGroupId } from './registry';

/** Скачивание из каталогов глазами окна: что качается и чем кончилась последняя неудача. */
export interface CatalogDownloadsSnapshot {
  download: CatalogDownload | null;
  downloadError: { id: CatalogModelId; message: string } | null;
}

type Groups = readonly (ModelGroupState & { id: ModelGroupId })[];

/** Группы, которых нет в ответе хранилища, — не скачаны (размер — из реестра). */
const stateOf = (groups: Groups, id: ModelGroupId): ModelGroupState => {
  const found = groups.find((g) => g.id === id);
  return found ? { sizeBytes: found.sizeBytes, installed: found.installed } : { sizeBytes: groupSize(id), installed: false };
};

/** Неудача скачивания — для карточки своего каталога, пока модель так и не скачана. */
function failureOf<T extends CatalogModelId>(
  groups: Groups,
  downloads: CatalogDownloadsSnapshot,
  ofCatalog: (id: CatalogModelId) => id is T,
): { id: T; message: string } | null {
  const error = downloads.downloadError;
  if (!error || !ofCatalog(error.id) || stateOf(groups, error.id).installed) return null;
  return { id: error.id, message: error.message };
}

export function buildModelsState(
  groups: Groups,
  selected: AsrModelId,
  downloads: CatalogDownloadsSnapshot,
  busy: boolean,
): ModelsState {
  return {
    selected,
    models: ASR_MODEL_IDS.map((id) => ({ id, ...stateOf(groups, id) })),
    voices: stateOf(groups, 'voices'),
    download: downloads.download,
    // Модель всё же скачалась (например, расшифровкой) — прежняя неудача её карточке больше не нужна.
    downloadError: failureOf(groups, downloads, isAsrModelId),
    busy,
  };
}

/** Каталог «Модель для итогов»; selected — уже с учётом скачанных (effectiveAiModel). */
export function buildAiModelsState(
  groups: Groups,
  selected: LlmModelId | null,
  downloads: CatalogDownloadsSnapshot,
): AiModelsState {
  return {
    selected,
    models: LLM_MODEL_IDS.map((id) => ({ id, ...stateOf(groups, id) })),
    download: downloads.download,
    downloadError: failureOf(groups, downloads, isLlmModelId),
  };
}
```

**В `src/main/models/registry.ts` заменить:**

```ts
import { join } from 'node:path';
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelGroupId } from '../../shared/transcription';

// Группа моделей — то, что пользователь скачивает и удаляет одной кнопкой: модель расшифровки или «voices».
export type { ModelGroupId };

export interface ModelFile {
```

**на:**

```ts
import { join } from 'node:path';
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import { LLM_MODEL_IDS, type LlmModelId } from '../../shared/llm-models';
import type { ModelGroupId } from '../../shared/transcription';

// Группа моделей — то, что пользователь скачивает и удаляет одной кнопкой: модель расшифровки, «voices» или модель для
// итогов.
export type { ModelGroupId };

export interface ModelFile {
```

**В `src/main/models/registry.ts` заменить:**

```ts
const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/6888903da215c7735f51101d939f3bfa679fb2b8';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/** Все группы: модели расшифровки в порядке каталога, затем общая группа. */
export const MODEL_GROUP_IDS = [...ASR_MODEL_IDS, 'voices'] as const satisfies readonly ModelGroupId[];

/** Папка модели расшифровки внутри папки моделей. */
export const ASR_FOLDERS: Record<AsrModelId, string> = {
```

**на:**

```ts
const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/6888903da215c7735f51101d939f3bfa679fb2b8';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/** Группы расшифровки: модели в порядке каталога, затем общая группа. */
export const TRANSCRIPTION_GROUP_IDS = [...ASR_MODEL_IDS, 'voices'] as const satisfies readonly ModelGroupId[];

/** Все группы: расшифровка, затем модели для итогов в порядке каталога. */
export const MODEL_GROUP_IDS = [...TRANSCRIPTION_GROUP_IDS, ...LLM_MODEL_IDS] as const satisfies readonly ModelGroupId[];

/** Папка модели расшифровки внутри папки моделей. */
export const ASR_FOLDERS: Record<AsrModelId, string> = {
```

**В `src/main/models/registry.ts` заменить:**

```ts
// Размеры и SHA-256 сверены 2026-09-29 (GigaAM, голоса) и 2026-10-02 (остальные модели) с Hugging Face (LFS oid;
// у небольших файлов в git — сумма скачанного файла) и релизами sherpa-onnx на GitHub. Адреса Hugging Face закреплены
// на коммитах (2026-10-02): файл по адресу не подменится, а сумма не разойдётся с реестром.
export const MODEL_FILES: readonly ModelFile[] = [
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_encoder_int8.onnx',
```

**на:**

```ts
// Размеры и SHA-256 сверены 2026-09-29 (GigaAM, голоса) и 2026-10-02 (остальные модели) с Hugging Face (LFS oid;
// у небольших файлов в git — сумма скачанного файла) и релизами sherpa-onnx на GitHub. Адреса Hugging Face закреплены
// на коммитах (2026-10-02): файл по адресу не подменится, а сумма не разойдётся с реестром.
const TRANSCRIPTION_FILES: readonly ModelFile[] = [
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_encoder_int8.onnx',
```

**В `src/main/models/registry.ts` заменить:**

```ts
  },
];

/** Пути к общим моделям (разделение по голосам, поиск речи) для процесса расшифровки. */
export interface VoicePaths {
  segmentation: string;
```

**на:**

```ts
  },
];

/**
 * Модель для итогов — один файл GGUF (сжатие Q4_K_M) из репозитория Hugging Face, закреплённого на коммите; в папке
 * моделей — llm/<модель>/<файл>.
 */
function llmFile(group: LlmModelId, repo: string, commit: string, name: string, size: number, sha256: string): ModelFile {
  return { group, path: `llm/${group}/${name}`, url: `https://huggingface.co/${repo}/resolve/${commit}/${name}`, size, sha256 };
}

// Размеры и SHA-256 сверены 2026-10-13 с Hugging Face (LFS oid), у Qwen3.5 9B — ещё и по скачанному файлу.
export const LLM_FILES: readonly ModelFile[] = [
  llmFile(
    'qwen3.5-9b',
    'unsloth/Qwen3.5-9B-GGUF',
    '3885219b6810b007914f3a7950a8d1b469d598a5',
    'Qwen3.5-9B-Q4_K_M.gguf',
    5_680_522_464,
    '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
  ),
  llmFile(
    'gigachat-3.1-lightning',
    'ai-sage/GigaChat3.1-10B-A1.8B-GGUF',
    '97045b260251cfa86f5ad25638fa2dd074153446',
    'GigaChat3.1-10B-A1.8B-q4_K_M.gguf',
    6_474_702_976,
    '68a8732fb5cee04f83ebffd7924e15c534d4442c5a43d2ba9e2041fe310b8deb',
  ),
  llmFile(
    't-lite-it-2.1',
    't-tech/T-lite-it-2.1-GGUF',
    'fc10186e59064c2e74f59c3d5dbce233931b3b81',
    'T-lite-it-2.1-Q4_K_M.gguf',
    5_027_750_240,
    '68c75f5940c36baca18113058ad3d55f6d1d3e1123a8053bb4bba8481805c960',
  ),
  llmFile(
    'qwen3.5-4b',
    'unsloth/Qwen3.5-4B-GGUF',
    'e87f176479d0855a907a41277aca2f8ee7a09523',
    'Qwen3.5-4B-Q4_K_M.gguf',
    2_740_937_888,
    '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
  ),
];

/** Все файлы моделей: расшифровка и итоги. */
export const MODEL_FILES: readonly ModelFile[] = [...TRANSCRIPTION_FILES, ...LLM_FILES];

/** Пути к общим моделям (разделение по голосам, поиск речи) для процесса расшифровки. */
export interface VoicePaths {
  segmentation: string;
```

**В `src/main/models/registry.ts` заменить:**

```ts
export const asrFilePath = (root: string, model: AsrModelId, name: string): string =>
  pathOf(root, `${ASR_FOLDERS[model]}/${name}`);

export const groupFiles = (group: ModelGroupId): ModelFile[] => MODEL_FILES.filter((f) => f.group === group);
export const groupSize = (group: ModelGroupId): number => groupFiles(group).reduce((sum, f) => sum + f.size, 0);
```

**на:**

```ts
export const asrFilePath = (root: string, model: AsrModelId, name: string): string =>
  pathOf(root, `${ASR_FOLDERS[model]}/${name}`);

/** Файл модели для итогов (у каждой — один). */
export function llmFilePath(root: string, model: LlmModelId): string {
  const file = LLM_FILES.find((f) => f.group === model);
  if (!file) throw new Error(`В реестре нет модели ${model}`);
  return modelFilePath(root, file);
}

export const groupFiles = (group: ModelGroupId): ModelFile[] => MODEL_FILES.filter((f) => f.group === group);
export const groupSize = (group: ModelGroupId): number => groupFiles(group).reduce((sum, f) => sum + f.size, 0);
```

**В `src/main/texts.ts` заменить:**

```ts
/** Системные ошибки, при которых модель не записать на диск. */
const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS', 'EBUSY']);
const SEE_LOG = 'Попробуйте ещё раз; подробности — в журнале ошибок (он указан в настройках).';
const MODELS_DISK_TEXT = 'Не удалось сохранить модель расшифровки на диск.';
const INTERNAL_TEXT = `Расшифровка не удалась из-за внутренней ошибки. ${SEE_LOG}`;
/** Сбои ffmpeg (чтения дорожек) — в тексте для человека; пути и вывод ffmpeg остаются в журнале. */
const UNREADABLE_AUDIO = /ffmpeg|не прочиталась ни одна дорожка/;
/** ffmpeg не запустился («spawn …ffmpeg.exe ENOENT» — например, его убрал антивирус): дорожки тут ни при чём. */
const SPAWN_FAILED = /\bspawn\b.*\b(E[A-Z]+|UNKNOWN)\b/;

/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
```

**на:**

```ts
/** Системные ошибки, при которых модель не записать на диск. */
const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS', 'EBUSY']);
const SEE_LOG = 'Попробуйте ещё раз; подробности — в журнале ошибок (он указан в настройках).';
const INTERNAL_TEXT = `Расшифровка не удалась из-за внутренней ошибки. ${SEE_LOG}`;
/** Сбои ffmpeg (чтения дорожек) — в тексте для человека; пути и вывод ffmpeg остаются в журнале. */
const UNREADABLE_AUDIO = /ffmpeg|не прочиталась ни одна дорожка/;
/** ffmpeg не запустился («spawn …ffmpeg.exe ENOENT» — например, его убрал антивирус): дорожки тут ни при чём. */
const SPAWN_FAILED = /\bspawn\b.*\b(E[A-Z]+|UNKNOWN)\b/;

/** Как назвать модель в причине неудачного скачивания: модель расшифровки или модель для итогов. */
interface ModelWords {
  /** «Не удалось скачать …», «Не удалось сохранить … на диск». */
  model: string;
  /** «Не хватает места на диске для …». */
  ofModel: string;
  /** «Не удалось подготовить …». */
  prepare: string;
}

const ASR_WORDS: ModelWords = { model: 'модель расшифровки', ofModel: 'модели расшифровки', prepare: 'модели расшифровки' };
const AI_WORDS: ModelWords = { model: 'модель для итогов', ofModel: 'модели для итогов', prepare: 'модель для итогов' };

/** Причина для человека; исходная ошибка (с путями и кодами) пишется в журнал отдельно. */
function downloadText(err: unknown, words: ModelWords): string {
  const diskText = `Не удалось сохранить ${words.model} на диск.`;
  if (!(err instanceof DownloadError)) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    return code && DISK_CODES.has(code) ? diskText : `Не удалось подготовить ${words.prepare}. ${SEE_LOG}`;
  }
  switch (err.kind) {
    case 'network':
      return `Не удалось скачать ${words.model}: нет связи с сервером. Проверьте интернет.`;
    case 'server':
      return `Не удалось скачать ${words.model}: сервер не отдал файл модели. Попробуйте позже или обновите TextMeet.`;
    case 'corrupt':
      return 'Скачанный файл модели повреждён — при повторе он скачается заново.';
    case 'space':
      if (err.neededBytes === undefined) return `Не хватает места на диске для ${words.ofModel}.`;
      // В мегабайтах с округлением вверх: «0,3 ГБ» преуменьшало бы нужное место.
      return `Не хватает места на диске для ${words.ofModel}: нужно ${Math.ceil(err.neededBytes / 1024 ** 2)} МБ свободного места.`;
    case 'disk':
      return diskText;
    case 'cancelled':
      return 'Скачивание модели отменено.';
  }
}

/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
```

**В `src/main/texts.ts` заменить:**

```ts
  badMessage: 'Процесс расшифровки прислал неверные данные.',
  unreadableAudio: 'Не удалось прочитать звук встречи: ffmpeg не прочитал дорожку. Файлы записи остались в папке встречи.',
  /** Причина для человека; исходная ошибка (с путями и кодами) пишется в журнал отдельно. */
  download(err: unknown): string {
    if (!(err instanceof DownloadError)) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      return code && DISK_CODES.has(code) ? MODELS_DISK_TEXT : `Не удалось подготовить модели расшифровки. ${SEE_LOG}`;
    }
    switch (err.kind) {
      case 'network':
        return 'Не удалось скачать модель расшифровки: нет связи с сервером. Проверьте интернет.';
      case 'server':
        return 'Не удалось скачать модель расшифровки: сервер не отдал файл модели. Попробуйте позже или обновите TextMeet.';
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
```

**на:**

```ts
  badMessage: 'Процесс расшифровки прислал неверные данные.',
  unreadableAudio: 'Не удалось прочитать звук встречи: ffmpeg не прочитал дорожку. Файлы записи остались в папке встречи.',
  /** Причина для человека; исходная ошибка (с путями и кодами) пишется в журнал отдельно. */
  download: (err: unknown): string => downloadText(err, ASR_WORDS),
  /** Файлы модели целы (суммы сошлись), но движок их не принял — подробности в журнале. */
  modelLoad: (title: string): string => `Не удалось загрузить модель «${title}». ${SEE_LOG}`,
  /** Сбой процесса расшифровки (его текст — для журнала: вывод sherpa-onnx и ffmpeg, пути к файлам) → текст для человека. */
```

**В `src/main/texts.ts` заменить:**

```ts
  }
  return kind === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:sound';
}
```

**на:**

```ts
  }
  return kind === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:sound';
}

/** Модели для итогов и сами итоги (решения Плана 9, §6). */
export const aiTexts = {
  /** Модель для итогов не скачалась — причина для карточки каталога. */
  download: (err: unknown): string => downloadText(err, AI_WORDS),
};
```

**В `src/preload/index.ts` заменить:**

```ts
  downloadModel: (id) => invoke(IPC.downloadModel, id),
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  copyForAi: (meetingId) => invoke(IPC.copyForAi, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
```

**на:**

```ts
  downloadModel: (id) => invoke(IPC.downloadModel, id),
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  getAiModels: () => invoke(IPC.getAiModels),
  downloadAiModel: (id) => invoke(IPC.downloadAiModel, id),
  cancelAiModelDownload: (id) => invoke(IPC.cancelAiModelDownload, id),
  selectAiModel: (id) => invoke(IPC.selectAiModel, id),
  deleteAiModel: (id) => invoke(IPC.deleteAiModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  copyForAi: (meetingId) => invoke(IPC.copyForAi, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
```

**Создать `src/renderer/main/AiModelSettings.tsx`:**

```tsx
import { llmModel, type AiModelsState, type LlmModelId } from '../../shared/llm-models';
import { aiCatalogSections, aiDownloadText, aiModelState, aiModelTag, aiSizeText } from './ai-catalog';
import { CatalogCard } from './CatalogCard';
import { useModelCatalog } from './hooks';
import { downloadButton } from './model-catalog';

interface CardProps {
  id: LlmModelId;
  state: AiModelsState;
  run(action: () => Promise<AiModelsState>): void;
}

/** Карточка модели для итогов (решения Плана 9, §2.1). */
function AiModelCard({ id, state, run }: CardProps) {
  const info = llmModel(id);
  const groupState = aiModelState(state, id);
  const download = state.download?.id === id ? state.download : null;
  const failed = state.downloadError?.id === id;
  return (
    <CatalogCard
      title={info.title}
      author={info.author}
      tag={aiModelTag(id)}
      bars={[
        { label: 'качество', value: info.quality },
        { label: 'скорость', value: info.speed },
      ]}
      description={info.description}
      warning={info.warning}
      languages={info.languages}
      sizeText={aiSizeText(groupState)}
      installed={groupState.installed}
      selected={state.selected === id}
      download={download && { text: aiDownloadText(download), fraction: download.total > 0 ? download.done / download.total : 0 }}
      error={failed ? (state.downloadError?.message ?? null) : null}
      downloadButton={downloadButton(info.title, failed)}
      otherDownload={state.download !== null && !download}
      deleteDisabled={state.download !== null}
      note={null}
      onSelect={() => run(() => window.textmeet.selectAiModel(id))}
      onDownload={() => run(() => window.textmeet.downloadAiModel(id))}
      onCancel={() => run(() => window.textmeet.cancelAiModelDownload(id))}
      onDelete={() => run(() => window.textmeet.deleteAiModel(id))}
    />
  );
}

/** Вкладка «ИИ» → «Модель для итогов»: каталог, как во вкладке «Расшифровка». */
export function AiModelSettings() {
  const { state, error, run } = useModelCatalog<AiModelsState>(
    () => window.textmeet.getAiModels(),
    (reload) => window.textmeet.onModelsChanged(reload),
  );
  const sections = state && aiCatalogSections(state);
  const group = (title: string, ids: LlmModelId[]) =>
    state &&
    ids.length > 0 && (
      <div className="mgroup" role="group" aria-label={title}>
        <h3>{title}</h3>
        {ids.map((id) => (
          <AiModelCard key={id} id={id} state={state} run={run} />
        ))}
      </div>
    );

  return (
    <div className="fld">
      <div className="lb">Модель для итогов</div>
      <div className="ctl">
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
        {sections && (
          <div className="catalog">
            {group('Выбрана', sections.selected ? [sections.selected] : [])}
            {group('Скачанные', sections.downloaded)}
            {group('Можно скачать', sections.available)}
          </div>
        )}
        <small>
          Модели работают без интернета, на видеокарте. «Оценка» — эти модели мы не замеряли: полоски примерные. Пока
          скачивается одна модель, другие ждут.
        </small>
      </div>
    </div>
  );
}
```

**Создать `src/renderer/main/CatalogCard.tsx`:**

```tsx
import { percent } from './transcription-format';

/** Пять делений: «точность», «качество» или «скорость». */
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

export interface CatalogCardProps {
  title: string;
  author: string;
  /** Пометка у названия: «Рекомендуется» или «оценка» (полоски примерные — пунктирная рамка). */
  tag: { text: string; estimate: boolean } | null;
  bars: { label: string; value: number }[];
  description: string;
  /** Предупреждение цветом под описанием. */
  warning: string | null;
  languages: string;
  /** Размер: «671 МБ», «скачана · 5,3 ГБ». */
  sizeText: string;
  installed: boolean;
  selected: boolean;
  /** Скачивается эта модель: подпись и доля 0…1. */
  download: { text: string; fraction: number } | null;
  /** Последнее скачивание не удалось — причина. */
  error: string | null;
  /** «Скачать» — после сбоя «Повторить»; имя для экранного диктора. */
  downloadButton: { text: string; label: string };
  /** Скачивается другая модель — «Скачать» ждёт. */
  otherDownload: boolean;
  /** «Удалить» недоступна: модели заняты (расшифровка, ответ модели, скачивание). */
  deleteDisabled: boolean;
  /** Мелкая строка под карточкой. */
  note: string | null;
  onSelect(): void;
  onDownload(): void;
  onCancel(): void;
  onDelete(): void;
}

/**
 * Карточка модели в каталоге (расшифровки или для итогов): название, автор, полоски, описание, языки, размер и
 * действия по состоянию.
 */
export function CatalogCard(props: CatalogCardProps) {
  const { title, download, error, installed, selected } = props;
  const value = download ? percent(download.fraction) : 0;
  return (
    <article className={selected ? 'mcard on' : 'mcard'} aria-label={title}>
      <div className="mcard-top">
        <div className="mcard-name">
          <b>{title}</b>
          <span className="by">{props.author}</span>
          {props.tag && <span className={props.tag.estimate ? 'tag est' : 'tag'}>{props.tag.text}</span>}
        </div>
        <div className="mcard-bars">
          {props.bars.map((bar) => (
            <Pips key={bar.label} label={bar.label} value={bar.value} />
          ))}
        </div>
      </div>
      <p className="mcard-desc">{props.description}</p>
      {props.warning && <p className="mcard-warn">{props.warning}</p>}
      {download && (
        <div className="mcard-progress">
          {/* Без role="status": счётчик меняется дважды в секунду, диктору хватает полоски ниже. */}
          <span>{download.text}</span>
          <span
            className="prog"
            role="progressbar"
            aria-label={`Скачивание: ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <i style={{ width: `${value}%` }} />
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <div className="mcard-foot">
        <span>{props.languages}</span>
        <span>{props.sizeText}</span>
        <div className="mcard-acts">
          {download ? (
            <button type="button" className="btn" onClick={props.onCancel}>
              Отменить
            </button>
          ) : (
            <>
              {!installed && (
                <button
                  type="button"
                  className="btn"
                  disabled={props.otherDownload}
                  aria-label={props.downloadButton.label}
                  onClick={props.onDownload}
                >
                  {props.downloadButton.text}
                </button>
              )}
              {installed && !selected && (
                <button type="button" className="btn" aria-label={`Выбрать: ${title}`} onClick={props.onSelect}>
                  Выбрать
                </button>
              )}
              {installed && (
                <button
                  type="button"
                  className="lnk"
                  disabled={props.deleteDisabled}
                  aria-label={`Удалить: ${title}`}
                  onClick={props.onDelete}
                >
                  Удалить
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {props.note && <small className="mcard-note">{props.note}</small>}
    </article>
  );
}
```

**Заменить всё содержимое `src/renderer/main/ModelCard.tsx` на:**

```tsx
import { asrModel, DEFAULT_ASR_MODEL, type AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { CatalogCard } from './CatalogCard';
import { downloadButton, downloadText, modelBars, modelState } from './model-catalog';

export interface ModelCardActions {
  onSelect(id: AsrModelId): void;
  onDownload(id: AsrModelId): void;
  onCancel(id: AsrModelId): void;
  onDelete(id: ModelGroupId): void;
}

/** Карточка модели расшифровки (решения Плана 7, §2). */
export function ModelCard({ id, state, actions }: { id: AsrModelId; state: ModelsState; actions: ModelCardActions }) {
  const info = asrModel(id);
  const { installed, sizeBytes } = modelState(state, id);
  const selected = state.selected === id;
  const download = state.download?.id === id ? state.download : null;
  const bars = modelBars(id);
  return (
    <CatalogCard
      title={info.title}
      author={info.author}
      tag={id === DEFAULT_ASR_MODEL ? { text: 'Рекомендуется', estimate: false } : null}
      bars={[
        { label: 'точность', value: bars.accuracy },
        { label: 'скорость', value: bars.speed },
      ]}
      description={info.description}
      warning={info.group === 'en' ? 'Только английский — русская речь распознаётся неверно.' : null}
      languages={info.languages}
      sizeText={installed ? `скачана · ${formatMegabytes(sizeBytes)}` : formatMegabytes(sizeBytes)}
      installed={installed}
      selected={selected}
      download={
        download && {
          text: downloadText(download.done, download.total),
          fraction: download.total > 0 ? download.done / download.total : 0,
        }
      }
      error={state.downloadError?.id === id ? state.downloadError.message : null}
      downloadButton={downloadButton(info.title, state.downloadError?.id === id)}
      otherDownload={state.download !== null && !download}
      deleteDisabled={state.busy || state.download !== null}
      note={selected && !installed && !download ? 'Скачается при первой расшифровке.' : null}
      onSelect={() => actions.onSelect(id)}
      onDownload={() => actions.onDownload(id)}
      onCancel={() => actions.onCancel(id)}
      onDelete={() => actions.onDelete(id)}
    />
  );
}
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { AiSettings } from './AiSettings';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
```

**на:**

```tsx
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { AiModelSettings } from './AiModelSettings';
import { AiSettings } from './AiSettings';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
            onError={setError}
            onErrorAfterLeave={onError}
          />
        </Panel>

        <Panel id="general" current={tab}>
```

**на:**

```tsx
            onError={setError}
            onErrorAfterLeave={onError}
          />
          <AiModelSettings />
        </Panel>

        <Panel id="general" current={tab}>
```

**В `src/renderer/main/TranscriptionSettings.tsx` заменить:**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { catalogErrorsAfter, catalogErrorText, catalogSections, NO_CATALOG_ERRORS } from './model-catalog';
import { ModelCard, type ModelCardActions } from './ModelCard';

/** Вкладка настроек «Расшифровка»: каталог моделей (решения Плана 7, §2) и общие модели голосов. */
export function TranscriptionSettings() {
  const [models, setModels] = useState<ModelsState | null>(null);
  const [errors, setErrors] = useState(NO_CATALOG_ERRORS);
  // Запросы могут наложиться и ответить не по порядку — показываем только ответ на последний.
  const latestRequest = useRef(0);

  useEffect(() => {
    const load = () => {
      const request = ++latestRequest.current;
      return window.textmeet
        .getModels()
        .then((state) => {
          if (request !== latestRequest.current) return;
          setModels(state);
          setErrors((prev) => catalogErrorsAfter(prev, 'load', null));
        })
        .catch((err: unknown) => {
          if (request === latestRequest.current) setErrors((prev) => catalogErrorsAfter(prev, 'load', errorText(err)));
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
      setErrors((prev) => catalogErrorsAfter(prev, 'action', null));
      if (request === latestRequest.current) setModels(state);
    } catch (err) {
      setErrors((prev) => catalogErrorsAfter(prev, 'action', errorText(err)));
    }
  };

  const actions: ModelCardActions = {
    onSelect: (id: AsrModelId) => void run(() => window.textmeet.selectModel(id)),
    onDownload: (id: AsrModelId) => void run(() => window.textmeet.downloadModel(id)),
    onCancel: (id: AsrModelId) => void run(() => window.textmeet.cancelModelDownload(id)),
    onDelete: (id: ModelGroupId) => void run(() => window.textmeet.deleteModels(id)),
  };

  const sections = models && catalogSections(models);
  const error = catalogErrorText(errors);
  const group = (title: string, ids: AsrModelId[]) =>
    models &&
    ids.length > 0 && (
```

**на:**

```tsx
import type { AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { useModelCatalog } from './hooks';
import { catalogSections } from './model-catalog';
import { ModelCard, type ModelCardActions } from './ModelCard';

/** Перечитывать каталог: скачивание продвинулось или закончилось, расшифровка началась или закончилась. */
function watchModels(reload: () => void): () => void {
  const unsubscribeModels = window.textmeet.onModelsChanged(reload);
  // Расшифровка началась или закончилась (и модели могли скачаться) — перечитать.
  let busy: boolean | null = null;
  const unsubscribeProgress = window.textmeet.onTranscriptionProgress((list) => {
    const nowBusy = list.length > 0;
    if (nowBusy !== busy) reload();
    busy = nowBusy;
  });
  return () => {
    unsubscribeModels();
    unsubscribeProgress();
  };
}

/** Вкладка настроек «Расшифровка»: каталог моделей (решения Плана 7, §2) и общие модели голосов. */
export function TranscriptionSettings() {
  const { state: models, error, run } = useModelCatalog<ModelsState>(() => window.textmeet.getModels(), watchModels);

  const actions: ModelCardActions = {
    onSelect: (id: AsrModelId) => run(() => window.textmeet.selectModel(id)),
    onDownload: (id: AsrModelId) => run(() => window.textmeet.downloadModel(id)),
    onCancel: (id: AsrModelId) => run(() => window.textmeet.cancelModelDownload(id)),
    onDelete: (id: ModelGroupId) => run(() => window.textmeet.deleteModels(id)),
  };

  const sections = models && catalogSections(models);
  const group = (title: string, ids: AsrModelId[]) =>
    models &&
    ids.length > 0 && (
```

**Создать `src/renderer/main/ai-catalog.ts`:**

```ts
// Каталог «Модель для итогов» на вкладке настроек «ИИ» (решения Плана 9, §2.1): разделы карточек и подписи. Чистые
// функции — проверяются модульными тестами.
import { formatBytes, formatDownloadedGb, formatRemaining } from '../../shared/format';
import {
  LLM_MODEL_IDS,
  llmModel,
  RECOMMENDED_LLM_MODEL,
  type AiModelsState,
  type LlmModelId,
} from '../../shared/llm-models';
import type { CatalogDownload, ModelGroupState } from '../../shared/transcription';

export interface AiCatalogSections {
  selected: LlmModelId | null;
  /** Скачанные, кроме выбранной. */
  downloaded: LlmModelId[];
  /** Ещё не скачанные. */
  available: LlmModelId[];
}

/** Раскладка карточек: выбранная сверху, затем скачанные, затем те, что можно скачать, — по порядку каталога. */
export function aiCatalogSections(state: AiModelsState): AiCatalogSections {
  const installed = new Set(state.models.filter((m) => m.installed).map((m) => m.id));
  const rest = LLM_MODEL_IDS.filter((id) => id !== state.selected);
  return {
    selected: state.selected,
    downloaded: rest.filter((id) => installed.has(id)),
    available: rest.filter((id) => !installed.has(id)),
  };
}

export const aiModelState = (state: AiModelsState, id: LlmModelId): ModelGroupState =>
  state.models.find((m) => m.id === id) ?? { sizeBytes: 0, installed: false };

/** Пометка у названия: «Рекомендуется» или «оценка» — модель не замеряли, полоски примерные. */
export function aiModelTag(id: LlmModelId): { text: string; estimate: boolean } | null {
  if (id === RECOMMENDED_LLM_MODEL) return { text: 'Рекомендуется', estimate: false };
  return llmModel(id).measured ? null : { text: 'оценка', estimate: true };
}

/** Подпись скачивания: «2,7 из 6,0 ГБ · осталось около 4 мин». */
export function aiDownloadText(download: CatalogDownload): string {
  if (download.total <= 0) return 'Скачиваем…';
  const bytes = formatDownloadedGb(download.done, download.total);
  return download.remainingSec === null ? bytes : `${bytes} · ${formatRemaining(download.remainingSec)}`;
}

/** Размер на карточке: «5,3 ГБ», у скачанной — «скачана · 5,3 ГБ». */
export const aiSizeText = (state: ModelGroupState): string =>
  state.installed ? `скачана · ${formatBytes(state.sizeBytes)}` : formatBytes(state.sizeBytes);
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';
import { nextSpeed } from './playback';

/** Сколько кнопка показывает «Скопировано». */
```

**на:**

```ts
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';
import { catalogErrorsAfter, catalogErrorText, NO_CATALOG_ERRORS } from './model-catalog';
import { nextSpeed } from './playback';

/** Сколько кнопка показывает «Скопировано». */
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
}

export const SearchViewContext = createContext<SearchView>({ words: [], focus: null, refresh: () => undefined });
```

**на:**

```ts
}

export const SearchViewContext = createContext<SearchView>({ words: [], focus: null, refresh: () => undefined });

export interface ModelCatalog<S> {
  state: S | null;
  /** Ошибка чтения или ответа на нажатие (ответ на нажатие важнее). */
  error: string | null;
  /** Действие с ответом-состоянием («Скачать», «Удалить»…); его ошибку показываем всегда — это ответ на нажатие. */
  run(action: () => Promise<S>): void;
}

/**
 * Каталог моделей в настройках (расшифровки или для итогов): состояние из main, перечитывается по событиям watch
 * (скачивание продвинулось, расшифровка началась…). Запросы могут наложиться и ответить не по порядку — показываем
 * только ответ на последний. load и watch берутся при первом показе.
 */
export function useModelCatalog<S>(load: () => Promise<S>, watch: (reload: () => void) => () => void): ModelCatalog<S> {
  const [state, setState] = useState<S | null>(null);
  const [errors, setErrors] = useState(NO_CATALOG_ERRORS);
  const latestRequest = useRef(0);
  const source = useRef({ load, watch });

  useEffect(() => {
    const reload = () => {
      const request = ++latestRequest.current;
      source.current
        .load()
        .then((next) => {
          if (request !== latestRequest.current) return;
          setState(next);
          setErrors((prev) => catalogErrorsAfter(prev, 'load', null));
        })
        .catch((err: unknown) => {
          if (request === latestRequest.current) setErrors((prev) => catalogErrorsAfter(prev, 'load', errorText(err)));
        });
    };
    reload();
    const unwatch = source.current.watch(reload);
    return () => {
      // Ответы после закрытия настроек не нужны.
      latestRequest.current += 1;
      unwatch();
    };
  }, []);

  const run = useCallback((action: () => Promise<S>) => {
    const request = ++latestRequest.current;
    action().then(
      (next) => {
        setErrors((prev) => catalogErrorsAfter(prev, 'action', null));
        if (request === latestRequest.current) setState(next);
      },
      (err: unknown) => setErrors((prev) => catalogErrorsAfter(prev, 'action', errorText(err))),
    );
  }, []);

  return { state, error: catalogErrorText(errors), run };
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
  font-weight: 600;
}

.mcard-bars {
  display: grid;
  gap: 4px;
```

**на:**

```css
  font-weight: 600;
}

/* «оценка» — полоски примерные: пунктирная рамка вместо заливки. */
.tag.est {
  background: transparent;
  border: 1px dashed var(--line);
  color: var(--muted);
  font-weight: 500;
}

.mcard-bars {
  display: grid;
  gap: 4px;
```

**В `src/shared/format.ts` заменить:**

```ts
/** Ход скачивания: «120 из 464 МБ» — мегабайты, чтобы число росло заметно и у больших моделей. */
export const formatDownloaded = (done: number, total: number): string => `${megabytes(done)} из ${megabytes(total)} МБ`;

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
```

**на:**

```ts
/** Ход скачивания: «120 из 464 МБ» — мегабайты, чтобы число росло заметно и у больших моделей. */
export const formatDownloaded = (done: number, total: number): string => `${megabytes(done)} из ${megabytes(total)} МБ`;

const gigabytes = (bytes: number): string => (Math.max(0, bytes) / GB).toFixed(1).replace('.', ',');

/** Ход скачивания больших моделей (для итогов): «2,7 из 6,0 ГБ». */
export const formatDownloadedGb = (done: number, total: number): string => `${gigabytes(done)} из ${gigabytes(total)} ГБ`;

/** Сколько осталось скачивать: «осталось меньше минуты», «осталось около 4 мин», «осталось около 1 ч 05 мин». */
export function formatRemaining(seconds: number): string {
  if (seconds < 60) return 'осталось меньше минуты';
  return `осталось около ${formatDurationShort(Math.ceil(seconds / 60) * 60)}`;
}

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
```

**В `src/shared/ipc.ts` заменить:**

```ts
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { ImportFailedEvent, ImportProgress, ImportResult } from './import';
import type { Meeting, MeetingListEntry } from './meeting';
import type {
  Peaks,
```

**на:**

```ts
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { ImportFailedEvent, ImportProgress, ImportResult } from './import';
import type { AiModelsState, LlmModelId } from './llm-models';
import type { Meeting, MeetingListEntry } from './meeting';
import type {
  Peaks,
```

**В `src/shared/ipc.ts` заменить:**

```ts
  downloadModel: 'models:download',
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  copyMeeting: 'export:copy',
  copyForAi: 'export:copy-for-ai',
  saveMeeting: 'export:save',
```

**на:**

```ts
  downloadModel: 'models:download',
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  getAiModels: 'ai:get-models',
  downloadAiModel: 'ai:download-model',
  cancelAiModelDownload: 'ai:cancel-download',
  selectAiModel: 'ai:select-model',
  deleteAiModel: 'ai:delete-model',
  copyMeeting: 'export:copy',
  copyForAi: 'export:copy-for-ai',
  saveMeeting: 'export:save',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  recordingPeaks: 'recording:peaks',
  libraryChanged: 'library:changed',
  transcriptionProgress: 'transcription:progress',
  /** Скачивание из каталога продвинулось, началось или закончилось — перечитать модели. */
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
```

**на:**

```ts
  recordingPeaks: 'recording:peaks',
  libraryChanged: 'library:changed',
  transcriptionProgress: 'transcription:progress',
  /** Скачивание из каталога (любого) продвинулось, началось или закончилось — перечитать модели. */
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.downloadModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.copyForAi]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
```

**на:**

```ts
  [IPC.downloadModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.getAiModels]: { arg: void; result: AiModelsState };
  [IPC.downloadAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.cancelAiModelDownload]: { arg: LlmModelId; result: AiModelsState };
  [IPC.selectAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.deleteAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.copyForAi]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  cancelModelDownload(id: AsrModelId): Promise<ModelsState>;
  /** «Выбрать»: модель для новых встреч. */
  selectModel(id: AsrModelId): Promise<ModelsState>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Скопировать для ИИ»: запрос из настроек и текст встречи — в буфер обмена простым текстом. */
```

**на:**

```ts
  cancelModelDownload(id: AsrModelId): Promise<ModelsState>;
  /** «Выбрать»: модель для новых встреч. */
  selectModel(id: AsrModelId): Promise<ModelsState>;
  /** Каталог «Модель для итогов» (вкладка «ИИ»). */
  getAiModels(): Promise<AiModelsState>;
  downloadAiModel(id: LlmModelId): Promise<AiModelsState>;
  /** «Отменить» скачивание: недокачанное стирается. */
  cancelAiModelDownload(id: LlmModelId): Promise<AiModelsState>;
  /** «Выбрать»: модель для итогов (только скачанная). */
  selectAiModel(id: LlmModelId): Promise<AiModelsState>;
  deleteAiModel(id: LlmModelId): Promise<AiModelsState>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Скопировать для ИИ»: запрос из настроек и текст встречи — в буфер обмена простым текстом. */
```

**Создать `src/shared/llm-models.ts`:**

```ts
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
```

**В `src/shared/settings.ts` заменить:**

```ts
import { z } from 'zod';
import { AiPromptSchema } from './ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL } from './asr-models';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
export const SettingsSchema = z.object({
```

**на:**

```ts
import { z } from 'zod';
import { AiPromptSchema } from './ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL } from './asr-models';
import { LLM_MODEL_IDS } from './llm-models';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
export const SettingsSchema = z.object({
```

**В `src/shared/settings.ts` заменить:**

```ts
   * (не строка, длиннее 4000 символов) — забывается.
   */
  aiPrompt: AiPromptSchema.default(null).catch(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

**на:**

```ts
   * (не строка, длиннее 4000 символов) — забывается.
   */
  aiPrompt: AiPromptSchema.default(null).catch(null),
  /**
   * Модель для итогов (каталог на вкладке «ИИ»); null — не выбрана. Неизвестная или испорченная — забывается: тогда
   * берётся первая скачанная (shared/llm-models.ts, effectiveAiModel).
   */
  aiModel: z.enum(LLM_MODEL_IDS).nullable().default(null).catch(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

**Заменить всё содержимое `src/shared/transcription.ts` на:**

```ts
// Расшифровка: что main сообщает окну. Только типы и константы — файл подключает и preload.
import type { AsrModelId } from './asr-models';
import type { LlmModelId } from './llm-models';

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

/**
 * Группа файлов моделей: модель расшифровки, общая — «разделение по голосам и поиск речи» — или модель для итогов.
 */
export type ModelGroupId = AsrModelId | 'voices' | LlmModelId;

/** Модель, которую скачивают из каталога: расшифровки (вкладка «Расшифровка») или для итогов (вкладка «ИИ»). */
export type CatalogModelId = AsrModelId | LlmModelId;

export interface ModelGroupState {
  sizeBytes: number;
  /** Все файлы группы на месте и проверены. */
  installed: boolean;
}

/** Скачивание из каталога (кнопка «Скачать» в карточке модели). */
export interface CatalogDownload {
  id: CatalogModelId;
  done: number;
  total: number;
  /** Сколько секунд осталось, примерно; null — пока не понятно (скачивание только началось). */
  remainingSec: number | null;
}

export interface ModelsState {
  /** Модель из настроек — для новых встреч. */
  selected: AsrModelId;
  /** Модели расшифровки в порядке каталога. */
  models: (ModelGroupState & { id: AsrModelId })[];
  /** Разделение по голосам и поиск речи — общие для всех моделей. */
  voices: ModelGroupState;
  /** Идёт скачивание из каталога — этого или каталога ИИ: одно на всю программу. */
  download: CatalogDownload | null;
  /** Последнее скачивание модели расшифровки не удалось — причина для человека. */
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

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  1007 passed (1007)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `73 passed`, `1 skipped` (проверки собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: catalog of local models for summaries on the AI settings tab"
```

### Task 2: Движок llama.cpp в составе программы

**Files:**
- Create: `scripts/fetch-llama.mjs`, `src/main/ai/llama-server.test.ts`, `src/main/ai/llama-server.ts`, `src/main/ai/llama.llm.test.ts`, `src/main/ai/llm-client.test.ts`, `src/main/ai/llm-client.ts`, `src/main/ai/sse.test.ts`, `src/main/ai/sse.ts`, `src/test-support/fake-llama-server.mjs`, `vitest.llm.config.ts`
- Modify: `.github/workflows/build.yml`, `.gitignore`, `e2e/packaged.spec.ts`, `electron-builder.yml`, `package.json`, `tsconfig.node.json`, `vitest.config.ts`

**Interfaces:**
- Consumes: `llmFilePath` (Task 1), `Logger`.
- Produces: `LlamaServer({ command(): LlamaCommand, logger, startTimeoutMs?, idleMs? })` с `ready(model: LlamaModel, signal?):
  Promise<LlmEndpoint>`, `idle()`, `stop()`, `isRunning()`; `LlamaModel = { path, contextTokens }`, `LlamaCommand = { file,
  args, env? }`, `llamaDir({ packaged, resourcesPath, appPath })`, `llamaServerFile(platform)`, `llamaArgs(model, port,
  apiKey)` (в Task 6 ключ уходит из строки запуска); `LlmEndpoint = { baseUrl, apiKey }`, `LlmError(kind: 'engine' |
  'too-long')`, `ChatMessage`, `ChatRequest = { messages, maxTokens }`, `StreamOptions = { signal?, onText }`,
  `countTokens(endpoint, content, signal?)`, `streamChat(endpoint, request, options): Promise<{ finishReason }>`;
  `parseSse(buffer): { chunks, rest }`.

`scripts/fetch-llama.mjs` скачивает выпуск llama.cpp b11588 для этой системы (Windows — Vulkan, Mac — Metal), сверяет
размер и SHA-256 и кладёт в `vendor/llama/` только сервер и его библиотеки (`npm run fetch:llama`; сам — перед
`dist:win`, `dist:mac`, `dev`, `start` и `test:llm`); electron-builder кладёт их в `resources/llama`, `build.yml` —
скачивает и подписывает на Mac. `ai/llama-server.ts` — процесс `llama-server`: свободный порт на 127.0.0.1, случайный
ключ, ожидание `/health` (до 2 минут), 5 минут без запросов — завершение, другая модель или падение — перезапуск,
последние 50 строк вывода — в журнал при сбое. `ai/llm-client.ts` — `/tokenize` и ответ потоком
(`/v1/chat/completions`: температура 0,3, `cache_prompt`, «размышления» выключены), `ai/sse.ts` — разбор потока.
Поддельный сервер для автотестов — `src/test-support/fake-llama-server.mjs` (Node-скрипт). Тест на настоящей модели —
`npm run test:llm` (в `ci` не входит). Проверка собранной программы запускает её `llama-server --version`.

- [ ] **Step 1: Тесты**

**В `e2e/packaged.spec.ts` заменить:**

```ts
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, waitForRecorder, type LaunchedApp } from './helpers';
```

**на:**

```ts
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { launchApp, waitForRecorder, type LaunchedApp } from './helpers';
```

**В `e2e/packaged.spec.ts` заменить:**

```ts
  const log = await readFile(join(userDataDir, 'logs', 'textmeet.log'), 'utf8');
  expect(log).toMatch(/Процесс расшифровки запущен \(поддельные движки, sherpa-onnx \d/);
});
```

**на:**

```ts
  const log = await readFile(join(userDataDir, 'logs', 'textmeet.log'), 'utf8');
  expect(log).toMatch(/Процесс расшифровки запущен \(поддельные движки, sherpa-onnx \d/);
});

test('the packaged app carries the engine for summaries, and it starts', async () => {
  test.skip(!executablePath, 'проверяется только собранная программа (TEXTMEET_PACKAGED_APP)');
  test.setTimeout(90_000);
  launched = await launchApp({ executablePath });
  const resources = await launched.app.evaluate(() => process.resourcesPath);
  const server = join(resources, 'llama', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  // Сервер запускается из собранной программы со всеми своими библиотеками (на Mac — подписанными).
  const { stdout, stderr } = await promisify(execFile)(server, ['--version']);
  expect(`${stdout}${stderr}`).toContain('build 11588');
});
```

**Создать `src/main/ai/llama-server.test.ts`:**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { countTokens } from './llm-client';
import { llamaArgs, llamaDir, LlamaServer, llamaServerFile, type LlamaServerDeps } from './llama-server';

const FAKE_SERVER = join(__dirname, '..', '..', 'test-support', 'fake-llama-server.mjs');

const servers: LlamaServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.stop()));
});

/** Сервер, который запускает поддельный llama-server (node + скрипт) и пишет его запуски в журнал. */
async function setup(env: Record<string, string> = {}, options: Partial<LlamaServerDeps> = {}) {
  const dir = makeTempDir();
  const log = join(dir, 'fake.log');
  const logger = { info: vi.fn(), error: vi.fn() };
  const server = new LlamaServer({
    command: () => ({
      file: process.execPath,
      args: [FAKE_SERVER],
      env: { ...process.env, TEXTMEET_FAKE_LLM_LOG: log, ...env },
    }),
    logger,
    ...options,
  });
  servers.push(server);
  const starts = async () =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => line.includes('"start"'))
      .map((line) => (JSON.parse(line) as { args: string[] }).args);
  return { server, logger, starts };
}

const model = { path: 'M/qwen.gguf', contextTokens: 65_536 };

describe('llama-server paths and arguments', () => {
  it('finds the engine next to the packaged program or in vendor/ while developing', () => {
    expect(llamaDir({ packaged: true, resourcesPath: 'R', appPath: 'A' })).toBe(join('R', 'llama'));
    expect(llamaDir({ packaged: false, resourcesPath: 'R', appPath: 'A' })).toBe(join('A', 'vendor', 'llama'));
    expect(llamaServerFile('win32')).toBe('llama-server.exe');
    expect(llamaServerFile('darwin')).toBe('llama-server');
  });

  it('starts the engine with the settings of the plan, on 127.0.0.1 with a key', () => {
    expect(llamaArgs({ path: 'M/q.gguf', contextTokens: 40_960 }, 5000, 'key')).toEqual([
      '-m', 'M/q.gguf', '-c', '40960', '-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0', '-np', '1', '--jinja', '--fit', 'on',
      '--no-webui', '--log-colors', 'off', '--host', '127.0.0.1', '--port', '5000', '--api-key', 'key',
    ]);
  });
});

describe('LlamaServer', () => {
  it('starts once, waits for the model and answers with the key', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '300' });
    const endpoint = await server.ready(model);
    expect(server.isRunning()).toBe(true);
    expect(await countTokens(endpoint, 'двенадцать букв!')).toBe(4);
    await expect(countTokens({ ...endpoint, apiKey: 'чужой' }, 'x')).rejects.toMatchObject({ kind: 'engine' });
    expect(await server.ready(model)).toEqual(endpoint);
    expect(await starts()).toHaveLength(1);
  });

  it('restarts for another model or another window', async () => {
    const { server, starts } = await setup();
    const first = await server.ready(model);
    const second = await server.ready({ path: 'M/t-lite.gguf', contextTokens: 40_960 });
    expect(second.baseUrl).not.toBe(first.baseUrl);
    const args = await starts();
    expect(args).toHaveLength(2);
    expect(args[1]).toEqual(expect.arrayContaining(['M/t-lite.gguf', '40960']));
  });

  it('stops after a quiet while and starts again on the next request', async () => {
    const { server, starts } = await setup({}, { idleMs: 50 });
    await server.ready(model);
    server.idle();
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    await server.ready(model);
    expect(await starts()).toHaveLength(2);
  });

  it('a new request cancels the stop after a quiet while', async () => {
    const { server } = await setup({}, { idleMs: 100 });
    await server.ready(model);
    server.idle();
    await server.ready(model);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(server.isRunning()).toBe(true);
  });

  it('starts again after the engine crashed', async () => {
    const { server, starts, logger } = await setup();
    const endpoint = await server.ready(model);
    // «УПАДИ» в запросе — поддельный сервер падает посреди ответа.
    await fetch(`${endpoint.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'УПАДИ' }], max_tokens: 2048 }),
    })
      .then((response) => response.text())
      .catch(() => undefined);
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('движок итогов завершился'), expect.any(Error));
    await server.ready(model);
    expect(await starts()).toHaveLength(2);
  });

  it('gives up on a model that does not load in time and leaves no process behind', async () => {
    const { server, logger } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '60000' }, { startTimeoutMs: 300 });
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine' });
    expect(server.isRunning()).toBe(false);
    // В журнал — вывод сервера, чтобы было понятно, на чём он застрял.
    const logged = logger.error.mock.calls.find((call) => call[0] === 'Движок итогов не загрузил модель');
    expect(String((logged?.[1] as Error | undefined)?.message)).toContain('fake llama-server: loading model');
  });

  it('reports an engine that cannot be started at all', async () => {
    const server = new LlamaServer({
      command: () => ({ file: join(__dirname, 'нет-такой-программы.exe'), args: [] }),
      logger: { info: vi.fn(), error: vi.fn() },
    });
    servers.push(server);
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine', message: 'движок итогов не запустился' });
  });

  it('stops waiting when asked, but keeps loading the model for the next request', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '300' });
    const controller = new AbortController();
    const waiting = server.ready(model, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    expect(server.isRunning()).toBe(true);
    await server.ready(model);
    expect(await starts()).toHaveLength(1);
  });
});
```

**Создать `src/main/ai/llama.llm.test.ts`:**

```ts
// Настоящий движок и настоящая модель (npm run test:llm, только на своём компьютере): llama-server из vendor/llama
// (npm run fetch:llama) и Qwen3.5 9B из папки моделей TEXTMEET_LLM_MODELS_DIR (там лежит
// llm/qwen3.5-9b/Qwen3.5-9B-Q4_K_M.gguf) — без скачивания: модель весит 5,3 ГБ, в ci этот тест не входит.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { llmFilePath } from '../models/registry';
import { countTokens, streamChat } from './llm-client';
import { llamaDir, LlamaServer, llamaServerFile } from './llama-server';

const quiet = { info: () => undefined, error: () => undefined };

const MEETING = [
  'Ирина [0:05]',
  'Давай перенесём запуск на пятницу: дизайн ещё не готов.',
  '',
  'Я [0:12]',
  'Согласен, переносим на пятницу. Я предупрежу Олега.',
].join('\n');

describe('the real engine with Qwen3.5 9B', () => {
  it('counts the tokens of a meeting and answers a question about it in Russian', async () => {
    const root = process.env.TEXTMEET_LLM_MODELS_DIR;
    if (!root) {
      throw new Error('Укажите TEXTMEET_LLM_MODELS_DIR — папку моделей, где лежит llm/qwen3.5-9b/Qwen3.5-9B-Q4_K_M.gguf');
    }
    const dir = llamaDir({ packaged: false, resourcesPath: '', appPath: process.cwd() });
    const server = new LlamaServer({ command: () => ({ file: join(dir, llamaServerFile(process.platform)), args: [] }), logger: quiet });
    try {
      // Окно поменьше — модель загружается быстрее; встрече хватает.
      const endpoint = await server.ready({ path: llmFilePath(root, 'qwen3.5-9b'), contextTokens: 8192 });
      expect(await countTokens(endpoint, MEETING)).toBeGreaterThan(20);
      let answer = '';
      const result = await streamChat(
        endpoint,
        {
          messages: [
            { role: 'system', content: 'Отвечай по-русски, только по тексту встречи.' },
            { role: 'user', content: `Текст встречи:\n\n${MEETING}\n---\nНа какой день перенесли запуск? Ответь одним словом.` },
          ],
          maxTokens: 64,
        },
        { onText: (text) => (answer += text) },
      );
      expect(answer.toLowerCase()).toContain('пятниц');
      expect(result.finishReason).toBe('stop');
    } finally {
      await server.stop();
    }
  });
});
```

**Создать `src/main/ai/llm-client.test.ts`:**

```ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { countTokens, LlmError, streamChat, type LlmEndpoint } from './llm-client';

type Handler = (req: IncomingMessage, body: Record<string, unknown>, res: ServerResponse) => void;

let server: Server | null = null;

afterEach(async () => {
  const running = server;
  server = null;
  if (running) await new Promise((resolve) => running.close(resolve));
});

/** Сервер на случайном порту; handler получает разобранное тело запроса. */
async function serve(handler: Handler): Promise<LlmEndpoint> {
  const created = createServer((req, res) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => handler(req, data ? (JSON.parse(data) as Record<string, unknown>) : {}, res));
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${(created.address() as AddressInfo).port}`, apiKey: 'k' };
}

const sse = (content: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`;

const noText = { onText: () => undefined };

describe('countTokens', () => {
  it('asks the engine with the key and counts its tokens', async () => {
    let auth: string | undefined;
    const endpoint = await serve((req, body, res) => {
      auth = req.headers.authorization;
      res.end(JSON.stringify({ tokens: String(body.content).split(' ') }));
    });
    expect(await countTokens(endpoint, 'раз два три')).toBe(3);
    expect(auth).toBe('Bearer k');
  });

  it('fails clearly on a wrong answer', async () => {
    const endpoint = await serve((_req, _body, res) => res.end('{"nope":1}'));
    await expect(countTokens(endpoint, 'x')).rejects.toMatchObject({ kind: 'engine' });
  });

  it('reports an engine that is not there', async () => {
    await expect(countTokens({ baseUrl: 'http://127.0.0.1:9', apiKey: 'k' }, 'x')).rejects.toMatchObject({ kind: 'engine' });
  });
});

describe('streamChat', () => {
  it('sends the settings of the plan and passes the answer on piece by piece', async () => {
    let sent: Record<string, unknown> = {};
    const endpoint = await serve((_req, body, res) => {
      sent = body;
      res.write(sse('Ито'));
      res.write(sse('ги', 'stop'));
      res.end('data: [DONE]\n\n');
    });
    const pieces: string[] = [];
    const result = await streamChat(
      endpoint,
      { messages: [{ role: 'user', content: 'текст' }], maxTokens: 2048 },
      { onText: (text) => pieces.push(text) },
    );
    expect(pieces).toEqual(['Ито', 'ги']);
    expect(result.finishReason).toBe('stop');
    expect(sent).toMatchObject({
      messages: [{ role: 'user', content: 'текст' }],
      stream: true,
      max_tokens: 2048,
      temperature: 0.3,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('tells a meeting too long for the window apart from other refusals', async () => {
    const endpoint = await serve((_req, _body, res) => {
      res.statusCode = 400;
      res.end('{"error":{"message":"the request exceeds the available context size"}}');
    });
    await expect(streamChat(endpoint, { messages: [], maxTokens: 1 }, noText)).rejects.toMatchObject({ kind: 'too-long' });
  });

  it('reports an engine that answers with an error', async () => {
    const endpoint = await serve((_req, _body, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    const error = await streamChat(endpoint, { messages: [], maxTokens: 1 }, noText).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind: 'engine', message: 'движок итогов ответил 500: boom' });
  });

  it('reports an answer that breaks off', async () => {
    const endpoint = await serve((_req, _body, res) => {
      res.write(sse('на'));
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await expect(streamChat(endpoint, { messages: [], maxTokens: 1 }, noText)).rejects.toMatchObject({ kind: 'engine' });
  });

  it('stops when the request is cancelled, without calling it a failure', async () => {
    const endpoint = await serve((_req, _body, res) => res.write(sse('пишу')));
    const controller = new AbortController();
    const done = streamChat(endpoint, { messages: [], maxTokens: 1 }, { signal: controller.signal, onText: () => controller.abort() });
    const error = await done.catch((err: unknown) => err);
    expect(error).not.toBeInstanceOf(LlmError);
    expect(controller.signal.aborted).toBe(true);
  });
});
```

**Создать `src/main/ai/sse.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { parseSse } from './sse';

const event = (content: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;

describe('parseSse', () => {
  it('reads the pieces of the answer and keeps an unfinished line for later', () => {
    const whole = event('При') + event('вет');
    const cut = whole.length - 10;
    const first = parseSse(whole.slice(0, cut));
    expect(first.chunks.map((c) => c.text)).toEqual(['При']);
    const second = parseSse(first.rest + whole.slice(cut));
    expect(second.chunks.map((c) => c.text)).toEqual(['вет']);
    expect(second.rest).toBe('');
  });

  it('notices why the answer ended and the end of the stream', () => {
    const { chunks } = parseSse(`${event('', 'length')}data: [DONE]\n\n`);
    expect(chunks).toEqual([
      { text: '', finishReason: 'length', done: false },
      { text: '', finishReason: null, done: true },
    ]);
  });

  it('skips other lines and Windows line ends', () => {
    const { chunks } = parseSse(`: ping\r\n${event('а').replace('\n\n', '\r\n\r\n')}`);
    expect(chunks.map((c) => c.text)).toEqual(['а']);
  });

  it('turns an error event of the engine into an error', () => {
    expect(() => parseSse('data: {"error":{"message":"out of memory"}}\n')).toThrow('out of memory');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/ai/llama-server.test.ts src/main/ai/llm-client.test.ts src/main/ai/sse.test.ts`
Ожидается: FAIL — нет модулей `./sse`, `./llm-client`, `./llama-server`.

- [ ] **Step 3: Код**

**В `.github/workflows/build.yml` заменить:**

```yaml
      - run: npm run build
      - run: npx playwright test

      - name: Package (Windows)
        if: runner.os == 'Windows'
        run: npx electron-builder --win --publish never

      # Собранная программа пишет и сводит дорожки своим ffmpeg (из app.asar.unpacked).
      - name: Check the packaged app (Windows)
        if: runner.os == 'Windows'
        run: npx playwright test e2e/packaged.spec.ts
```

**на:**

```yaml
      - run: npm run build
      - run: npx playwright test

      # Движок итогов (llama.cpp) — в resources/llama собранной программы.
      - run: npm run fetch:llama

      - name: Package (Windows)
        if: runner.os == 'Windows'
        run: npx electron-builder --win --publish never

      # Собранная программа пишет и сводит дорожки своим ffmpeg (из app.asar.unpacked) и запускает свой движок итогов.
      - name: Check the packaged app (Windows)
        if: runner.os == 'Windows'
        run: npx playwright test e2e/packaged.spec.ts
```

**В `.github/workflows/build.yml` заменить:**

```yaml
          APP="$(find release -maxdepth 2 -name 'TextMeet.app' -type d | head -n 1)"
          echo "App: $APP"
          # Неподписанное arm64-приложение macOS не запускает — подписываем ad-hoc, как в спайке.
          # ffmpeg (сведение дорожек) лежит в app.asar.unpacked и тоже должен быть подписан.
          find "$APP" \( -name '*.node' -o -name '*.dylib' -o -name 'ffmpeg' \) -type f -exec codesign --force --sign - {} \;
          codesign --force --deep --sign - "$APP"
          codesign --verify --deep --verbose=2 "$APP"
          # Собранная программа пишет и сводит дорожки своим подписанным ffmpeg.
```

**на:**

```yaml
          APP="$(find release -maxdepth 2 -name 'TextMeet.app' -type d | head -n 1)"
          echo "App: $APP"
          # Неподписанное arm64-приложение macOS не запускает — подписываем ad-hoc, как в спайке.
          # ffmpeg (сведение дорожек) лежит в app.asar.unpacked, движок итогов — в Resources/llama: их тоже подписываем.
          find "$APP" \( -name '*.node' -o -name '*.dylib' -o -name 'ffmpeg' -o -name 'llama-server' \) -type f -exec codesign --force --sign - {} \;
          codesign --force --deep --sign - "$APP"
          codesign --verify --deep --verbose=2 "$APP"
          # Собранная программа пишет и сводит дорожки своим подписанным ffmpeg.
```

**В `.gitignore` заменить:**

```
.env
.env.*

# Модели и записи никогда не попадают в репозиторий
/models/
/samples/
```

**на:**

```
.env
.env.*

# Движок итогов скачивается скриптом (npm run fetch:llama)
/vendor/

# Модели и записи никогда не попадают в репозиторий
/models/
/samples/
```

**В `electron-builder.yml` заменить:**

```yaml
  extendInfo:
    NSMicrophoneUsageDescription: TextMeet записывает ваш микрофон во время встречи.
    NSAudioCaptureUsageDescription: TextMeet записывает звук компьютера во время встречи.
# ffmpeg — отдельная программа, sherpa-onnx — нативная библиотека (.node и .dll/.dylib рядом):
# запускать и загружать их можно только из распакованной копии, не из app.asar.
asarUnpack:
```

**на:**

```yaml
  extendInfo:
    NSMicrophoneUsageDescription: TextMeet записывает ваш микрофон во время встречи.
    NSAudioCaptureUsageDescription: TextMeet записывает звук компьютера во время встречи.
# Движок итогов (llama-server и его библиотеки) кладёт в vendor/llama скрипт scripts/fetch-llama.mjs (npm run
# fetch:llama); в программе он лежит рядом с app.asar — в resources/llama.
extraResources:
  - from: vendor/llama
    to: llama
    filter: ['**/*', '!.build']
# ffmpeg — отдельная программа, sherpa-onnx — нативная библиотека (.node и .dll/.dylib рядом):
# запускать и загружать их можно только из распакованной копии, не из app.asar.
asarUnpack:
```

**В `package.json` заменить:**

```json
    "test:coverage": "vitest run --coverage",
    "test:models": "vitest run --config vitest.models.config.ts",
    "test:catalog": "vitest run --config vitest.catalog.config.ts",
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && electron-builder --win --publish never",
    "dist:mac": "npm run build && electron-builder --mac dir --arm64 --publish never",
    "predev": "node node_modules/electron/install.js",
    "prestart": "node node_modules/electron/install.js"
  },
  "dependencies": {
    "docx": "9.8.1",
```

**на:**

```json
    "test:coverage": "vitest run --coverage",
    "test:models": "vitest run --config vitest.models.config.ts",
    "test:catalog": "vitest run --config vitest.catalog.config.ts",
    "test:llm": "npm run fetch:llama && vitest run --config vitest.llm.config.ts",
    "fetch:llama": "node scripts/fetch-llama.mjs",
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && npm run fetch:llama && electron-builder --win --publish never",
    "dist:mac": "npm run build && npm run fetch:llama && electron-builder --mac dir --arm64 --publish never",
    "predev": "node node_modules/electron/install.js && node scripts/fetch-llama.mjs",
    "prestart": "node node_modules/electron/install.js && node scripts/fetch-llama.mjs"
  },
  "dependencies": {
    "docx": "9.8.1",
```

**Создать `scripts/fetch-llama.mjs`:**

```js
// Движок итогов — llama.cpp (llama-server, решения Плана 9, §4.1). Скрипт скачивает выпуск ggml-org для этой системы,
// сверяет SHA-256 и кладёт нужные файлы в vendor/llama/: оттуда их берёт electron-builder (extraResources →
// resources/llama) и версия для разработки. Уже на месте (vendor/llama/.build совпадает) — ничего не делает.
// Запуск: npm run fetch:llama (сам — перед dist:win, dist:mac и dev).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const RELEASE = 'https://github.com/ggml-org/llama.cpp/releases/download/b11588';
/** Сборки движка: Windows — Vulkan (видеокарты NVIDIA, AMD, Intel), Mac — Metal. SHA-256 — из выпуска на GitHub. */
const BUILDS = {
  'win32-x64': {
    file: 'llama-b11588-bin-win-vulkan-x64.zip',
    size: 32_112_046,
    sha256: '696f75ee2aa8047cd6a7c67e37f4c251d609ef3450a9cdab298e7429adf19944',
    folder: '.',
  },
  'darwin-arm64': {
    file: 'llama-b11588-bin-macos-arm64.tar.gz',
    size: 12_112_245,
    sha256: '95039180209cb8b9a2fadedd03e061c5131fed17e1eb423b3dcf8c7848d12b9d',
    folder: 'llama-b11588',
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'vendor', 'llama');
const stamp = join(target, '.build');

/**
 * Из выпуска нужен только сервер и его библиотеки: остальные программы llama.cpp и их «-impl»-библиотеки программе
 * ни к чему. Ссылки на библиотеки (на Mac) сохраняются как ссылки.
 */
function keep(name) {
  if (name === 'llama-server' || name === 'llama-server.exe' || name.startsWith('LICENSE')) return true;
  if (/-impl\.(dll|dylib)$/.test(name)) return name.startsWith('llama-server-impl.') || name.startsWith('libllama-server-impl.');
  return /\.(dll|dylib)$/.test(name);
}

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function main() {
  const build = BUILDS[`${process.platform}-${process.arch}`];
  if (!build) {
    console.log(`fetch-llama: для ${process.platform}-${process.arch} сборки движка нет — пропускаем`);
    return;
  }
  const done = await fsp.readFile(stamp, 'utf8').catch(() => '');
  if (done.trim() === build.sha256) return;

  const work = join(root, 'vendor', `llama-download-${process.pid}`);
  await fsp.rm(work, { recursive: true, force: true });
  await fsp.mkdir(work, { recursive: true });
  try {
    const archive = join(work, build.file);
    console.log(`fetch-llama: скачиваем ${build.file}`);
    const response = await fetch(`${RELEASE}/${build.file}`);
    if (!response.ok || !response.body) throw new Error(`сервер ответил ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    const { size } = await fsp.stat(archive);
    const sum = await sha256(archive);
    if (size !== build.size || sum !== build.sha256) throw new Error(`архив не совпал: ${size} байт, SHA-256 ${sum}`);

    // tar (bsdtar) есть и на Windows 10+, и на Mac; zip он тоже распаковывает. На Windows — системный: GNU tar из
    // Git Bash принял бы «D:» за адрес другого компьютера.
    const unpacked = join(work, 'unpacked');
    await fsp.mkdir(unpacked);
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-xf', archive, '-C', unpacked], { stdio: 'inherit' });

    const from = join(unpacked, build.folder);
    await fsp.rm(target, { recursive: true, force: true });
    await fsp.mkdir(target, { recursive: true });
    for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
      if (!keep(entry.name)) continue;
      const source = join(from, entry.name);
      const dest = join(target, entry.name);
      if (entry.isSymbolicLink()) await fsp.symlink(await fsp.readlink(source), dest);
      else await fsp.copyFile(source, dest);
    }
    await fsp.writeFile(stamp, `${build.sha256}\n`);
    console.log(`fetch-llama: движок в ${target}`);
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`fetch-llama: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

**Создать `src/main/ai/llama-server.ts`:**

```ts
// Движок итогов — llama-server из llama.cpp (решения Плана 9, §4.1): отдельный процесс, запускается по первому запросу
// и держит модель в памяти видеокарты. 5 минут без запросов — завершается (видеопамять свободна); другая модель —
// перезапускается. Слушает только 127.0.0.1 со случайным ключом. Electron сюда не подключается.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { Logger } from '../logger';
import { LlmError, type LlmEndpoint } from './llm-client';

/** Сколько ждать загрузки модели в память (на медленном диске 6 ГБ читаются долго). */
export const START_TIMEOUT_MS = 2 * 60_000;
/** Сколько сервер живёт без запросов. */
export const IDLE_MS = 5 * 60_000;
/** Сколько строк вывода сервера попадает в журнал при сбое (текст встреч сервер не выводит). */
export const OUTPUT_LINES = 50;
const POLL_MS = 250;
/** Сколько ждать выхода процесса после просьбы завершиться. */
const EXIT_WAIT_MS = 2000;

/** Чем запускать сервер: llama-server программы или (в автотестах) поддельный сервер. */
export interface LlamaCommand {
  file: string;
  /** Параметры перед параметрами сервера (путь к скрипту поддельного сервера). */
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
}

export interface LlamaModel {
  /** Файл GGUF. */
  path: string;
  /** Окно модели в программе, «кусочков». */
  contextTokens: number;
}

export interface LlamaServerDeps {
  command(): LlamaCommand;
  logger: Pick<Logger, 'info' | 'error'>;
  startTimeoutMs?: number;
  idleMs?: number;
}

/** Папка движка: в собранной программе — resources/llama, в разработке — vendor/llama (scripts/fetch-llama.mjs). */
export function llamaDir(env: { packaged: boolean; resourcesPath: string; appPath: string }): string {
  return env.packaged ? join(env.resourcesPath, 'llama') : join(env.appPath, 'vendor', 'llama');
}

export const llamaServerFile = (platform: string): string => (platform === 'win32' ? 'llama-server.exe' : 'llama-server');

/**
 * Параметры сервера: окно модели, внимание flash и сжатый кэш (память видеокарты), один запрос за раз, шаблон
 * модели (jinja), --fit — сам решает, сколько слоёв отдать видеокарте; не хватает памяти — часть остаётся на
 * процессоре.
 */
export function llamaArgs(model: LlamaModel, port: number, apiKey: string): string[] {
  return [
    '-m',
    model.path,
    '-c',
    String(model.contextTokens),
    '-fa',
    'on',
    '-ctk',
    'q8_0',
    '-ctv',
    'q8_0',
    '-np',
    '1',
    '--jinja',
    '--fit',
    'on',
    '--no-webui',
    '--log-colors',
    'off',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--api-key',
    apiKey,
  ];
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Дождаться обещания или отмены (сам запуск сервера при этом не прерывается — он пригодится следующему запросу). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Один запуск сервера: процесс, его последние строки вывода и готовность. */
class LlamaProcess {
  child: ChildProcess | null = null;
  /** Последние строки вывода сервера — в журнал при сбое. */
  readonly output: string[] = [];
  exited = false;
  /** Завершаем сами — выход процесса не сбой. */
  stopping = false;
  readonly ready: Promise<LlmEndpoint>;

  constructor(
    readonly model: LlamaModel,
    private readonly deps: LlamaServerDeps,
  ) {
    this.ready = this.start();
    // Ошибку запуска получает тот, кто ждёт ready(); здесь — чтобы не было «необработанного отказа».
    this.ready.catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || this.exited) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await Promise.race([exited, sleep(EXIT_WAIT_MS)]);
  }

  private keep(data: Buffer): void {
    for (const line of data.toString('utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue;
      this.output.push(line);
      if (this.output.length > OUTPUT_LINES) this.output.shift();
    }
  }

  private async start(): Promise<LlmEndpoint> {
    const port = await freePort();
    const apiKey = randomBytes(16).toString('hex');
    const command = this.deps.command();
    this.deps.logger.info('Движок итогов запускается');
    const child = spawn(command.file, [...command.args, ...llamaArgs(this.model, port, apiKey)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(command.env && { env: command.env }),
    });
    this.child = child;
    // Вывод читается всегда: непрочитанный заполнил бы канал, и сервер встал бы.
    child.stdout?.on('data', (data: Buffer) => this.keep(data));
    child.stderr?.on('data', (data: Buffer) => this.keep(data));
    const failed = new Promise<never>((_resolve, reject) => {
      child.once('error', (err) => {
        this.exited = true;
        reject(new LlmError('engine', 'движок итогов не запустился', { cause: err }));
      });
      child.once('exit', (code, signal) => {
        this.exited = true;
        if (this.stopping) return;
        const reason = `движок итогов завершился (код ${code ?? signal ?? '?'})`;
        this.deps.logger.error(reason, new Error(this.output.join('\n')));
        reject(new LlmError('engine', reason));
      });
    });
    // Процесс может упасть и после загрузки — это увидит запрос, который шёл к нему.
    failed.catch(() => undefined);
    const endpoint = { baseUrl: `http://127.0.0.1:${port}`, apiKey };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new LlmError('engine', 'движок итогов не загрузил модель за отведённое время')),
        this.deps.startTimeoutMs ?? START_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([failed, timeout, this.waitHealthy(endpoint)]);
    } catch (err) {
      if (!this.exited) this.deps.logger.error('Движок итогов не загрузил модель', new Error(this.output.join('\n')));
      throw err;
    } finally {
      clearTimeout(timer);
    }
    this.deps.logger.info('Движок итогов готов');
    return endpoint;
  }

  /** /health отвечает 200, когда модель загружена (до того — 503). */
  private async waitHealthy(endpoint: LlmEndpoint): Promise<void> {
    while (!this.exited && !this.stopping) {
      const ok = await fetch(`${endpoint.baseUrl}/health`).then(
        (response) => response.ok,
        () => false,
      );
      if (ok) return;
      await sleep(POLL_MS);
    }
    throw new LlmError('engine', 'движок итогов завершился, не загрузив модель');
  }
}

export class LlamaServer {
  private running: LlamaProcess | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: LlamaServerDeps) {}

  /** Сервер запущен (модель в памяти или загружается). */
  isRunning(): boolean {
    return this.running !== null && !this.running.exited;
  }

  /**
   * Сервер с этой моделью готов отвечать: запускает его (была другая модель или процесс упал — перезапускает) и ждёт,
   * пока модель загрузится. Отмена (signal) прекращает ожидание, но не запуск.
   */
  async ready(model: LlamaModel, signal?: AbortSignal): Promise<LlmEndpoint> {
    this.cancelIdle();
    const current = this.running;
    if (current && (current.exited || current.model.path !== model.path || current.model.contextTokens !== model.contextTokens)) {
      await this.stop();
    }
    this.running ??= new LlamaProcess(model, this.deps);
    const running = this.running;
    try {
      return await untilAborted(running.ready, signal);
    } catch (err) {
      // Не загрузился — процесс не оставляем: следующий запрос запустит его заново.
      if (!signal?.aborted && this.running === running) await this.stop();
      throw err;
    }
  }

  /** Запрос закончился: через 5 минут без новых сервер завершится. */
  idle(): void {
    this.cancelIdle();
    if (!this.running) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.deps.logger.info('Движок итогов завершается: 5 минут без запросов');
      void this.stop();
    }, this.deps.idleMs ?? IDLE_MS);
  }

  /** Завершить сервер (выход из программы, удаление модели, простой) и дождаться выхода процесса. */
  async stop(): Promise<void> {
    this.cancelIdle();
    const running = this.running;
    this.running = null;
    await running?.stop();
  }

  private cancelIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
```

**Создать `src/main/ai/llm-client.ts`:**

```ts
// Запросы к llama-server (решения Плана 9, §4.1): сколько «кусочков» в тексте (/tokenize) и ответ потоком
// (/v1/chat/completions). Сервер слушает только 127.0.0.1 и пускает только со своим случайным ключом.
import { z } from 'zod';
import { parseSse } from './sse';

export interface LlmEndpoint {
  baseUrl: string;
  apiKey: string;
}

/** engine — движок не ответил или ответил ошибкой; too-long — встреча не поместилась в окно модели. */
export type LlmErrorKind = 'engine' | 'too-long';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LlmError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Предел длины ответа, «кусочков». */
  maxTokens: number;
}

/** «Температура» ответа: ниже — суше и ближе к тексту встречи (решения Плана 9, §4.1). */
const TEMPERATURE = 0.3;
const TokenizeSchema = z.object({ tokens: z.array(z.unknown()) });

async function post(endpoint: LlmEndpoint, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${endpoint.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify(body),
      ...(signal && { signal }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new LlmError('engine', 'движок итогов не ответил', { cause: err });
  }
  if (response.ok) return response;
  const text = await response.text().catch(() => '');
  // Встреча оказалась длиннее окна, хоть и прошла проверку длины (шаблон модели добавил своё).
  if (response.status === 400 && /context/i.test(text)) {
    throw new LlmError('too-long', 'встреча не поместилась в окно модели');
  }
  throw new LlmError('engine', `движок итогов ответил ${response.status}: ${text.slice(0, 500)}`);
}

/** Сколько «кусочков» (токенов) в тексте — считает сам движок, словарём модели. */
export async function countTokens(endpoint: LlmEndpoint, content: string, signal?: AbortSignal): Promise<number> {
  const response = await post(endpoint, '/tokenize', { content }, signal);
  const parsed = TokenizeSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new LlmError('engine', 'движок итогов прислал неверный ответ на /tokenize');
  return parsed.data.tokens.length;
}

export interface StreamOptions {
  signal?: AbortSignal;
  /** Новый кусок текста ответа. */
  onText(text: string): void;
}

/**
 * Ответ потоком: куски — в onText по мере написания; в конце — почему ответ закончился («stop», «length»). Отмена
 * (signal) обрывает соединение — сервер перестаёт писать.
 */
export async function streamChat(
  endpoint: LlmEndpoint,
  request: ChatRequest,
  options: StreamOptions,
): Promise<{ finishReason: string | null }> {
  const response = await post(
    endpoint,
    '/v1/chat/completions',
    {
      messages: request.messages,
      stream: true,
      max_tokens: request.maxTokens,
      temperature: TEMPERATURE,
      // Встреча — в начале запроса: у вопроса после итогов та же начальная часть, и движок не перечитывает встречу.
      cache_prompt: true,
      // «Размышления» вслух (Qwen3.5, T-lite) выключены: итоги нужны сразу.
      chat_template_kwargs: { enable_thinking: false },
    },
    options.signal,
  );
  if (!response.body) throw new LlmError('engine', 'движок итогов прислал пустой ответ');
  const decoder = new TextDecoder();
  let rest = '';
  let finishReason: string | null = null;
  try {
    for await (const piece of response.body) {
      rest += decoder.decode(piece, { stream: true });
      const parsed = parseSse(rest);
      rest = parsed.rest;
      for (const chunk of parsed.chunks) {
        if (chunk.text) options.onText(chunk.text);
        if (chunk.finishReason) finishReason = chunk.finishReason;
      }
    }
  } catch (err) {
    if (options.signal?.aborted || err instanceof LlmError) throw err;
    throw new LlmError('engine', 'ответ движка итогов оборвался', { cause: err });
  }
  return { finishReason };
}
```

**Создать `src/main/ai/sse.ts`:**

```ts
// Поток ответа llama-server (Server-Sent Events): строки «data: {…}», между событиями — пустая строка, в конце —
// «data: [DONE]». Чистая функция: разбирает накопленный текст, незаконченную строку оставляет до следующего куска.
export interface SseChunk {
  /** Новый кусок текста ответа (может быть пустым). */
  text: string;
  /** Почему ответ закончился («stop», «length»); null — ещё пишется. */
  finishReason: string | null;
  /** «data: [DONE]» — поток окончен. */
  done: boolean;
}

interface StreamEvent {
  choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
  error?: { message?: unknown };
}

export function parseSse(buffer: string): { chunks: SseChunk[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const chunks: SseChunk[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice('data:'.length).trim();
    if (payload === '[DONE]') {
      chunks.push({ text: '', finishReason: null, done: true });
      continue;
    }
    const event = JSON.parse(payload) as StreamEvent;
    if (event.error) throw new Error(`движок сообщил об ошибке: ${String(event.error.message ?? 'без описания')}`);
    const choice = event.choices?.[0];
    const content = choice?.delta?.content;
    const finish = choice?.finish_reason;
    chunks.push({
      text: typeof content === 'string' ? content : '',
      finishReason: typeof finish === 'string' ? finish : null,
      done: false,
    });
  }
  return { chunks, rest };
}
```

**Создать `src/test-support/fake-llama-server.mjs`:**

```js
// Поддельный llama-server — только для автотестов: модульных (src/main/ai) и сквозных (TEXTMEET_TEST_LLM). Понимает
// те же параметры запуска (--port, --api-key, -c) и отвечает так же: /health, /tokenize, поток /v1/chat/completions.
// Ответ — по заданию в конце сообщения (после «---»): на вопрос (ответ до 1024 «кусочков») — «Ответ: <вопрос>»,
// иначе — итоги в разметке.
// Особые слова в задании или тексте: «УПАДИ» — процесс падает посреди ответа; «ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА» — /tokenize
// насчитывает миллион «кусочков». Переменные: TEXTMEET_FAKE_LLM_LOAD_MS — сколько «грузится модель» (по умолчанию 50),
// TEXTMEET_FAKE_LLM_TOKEN_MS — пауза между кусками ответа (по умолчанию 20), TEXTMEET_FAKE_LLM_LOG — файл, куда
// дописываются параметры запуска и запросы (по строке JSON).
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const arg = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const port = Number(arg('--port'));
const apiKey = arg('--api-key');
const loadMs = Number(process.env.TEXTMEET_FAKE_LLM_LOAD_MS ?? 50);
const tokenMs = Number(process.env.TEXTMEET_FAKE_LLM_TOKEN_MS ?? 20);
const logFile = process.env.TEXTMEET_FAKE_LLM_LOG;

const log = (entry) => {
  if (logFile) appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
};
log({ kind: 'start', args });
process.stderr.write('fake llama-server: loading model\n');

let loaded = false;
setTimeout(() => {
  loaded = true;
  process.stderr.write('fake llama-server: model loaded\n');
}, loadMs);

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

function answerFor(content, question) {
  const at = content.lastIndexOf('\n---\n');
  const task = at === -1 ? content : content.slice(at + 5);
  const text = at === -1 ? '' : content.slice(0, at);
  if (question) return `Ответ: ${task.trim()}`;
  const lines = text.split('\n').filter((line) => line.trim() !== '').length;
  return `### Главное\n- Встреча прочитана: ${lines} строк.\n- **Задание:** ${task.split('\n')[0].slice(0, 60)}\n\n### Задачи\n1. Проверить *итоги*.`;
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    json(res, loaded ? 200 : 503, loaded ? { status: 'ok' } : { error: { message: 'Loading model' } });
    return;
  }
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    json(res, 401, { error: { message: 'Invalid API Key' } });
    return;
  }
  const body = await readBody(req);
  if (req.url === '/tokenize') {
    const content = String(body.content ?? '');
    const count = content.includes('ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА') ? 1_000_000 : Math.ceil(content.length / 4);
    json(res, 200, { tokens: Array.from({ length: Math.min(count, 1_000_000) }, () => 1) });
    return;
  }
  if (req.url === '/v1/chat/completions') {
    log({ kind: 'chat', body });
    const content = String(body.messages?.at(-1)?.content ?? '');
    const answer = answerFor(content, Number(body.max_tokens) <= 1024);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let closed = false;
    res.on('close', () => (closed = true));
    const pieces = answer.match(/\S+\s*|\s+/g) ?? [];
    for (const [i, piece] of pieces.entries()) {
      if (closed) return;
      if (i === 3 && content.includes('УПАДИ')) process.exit(3);
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, tokenMs));
    }
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
    return;
  }
  json(res, 404, { error: { message: 'Not found' } });
});

server.listen(port, '127.0.0.1');
```

**В `tsconfig.node.json` заменить:**

```json
    "electron.vite.config.ts",
    "vitest.config.ts",
    "vitest.models.config.ts",
    "playwright.config.ts"
  ]
}
```

**на:**

```json
    "electron.vite.config.ts",
    "vitest.config.ts",
    "vitest.models.config.ts",
    "vitest.llm.config.ts",
    "playwright.config.ts"
  ]
}
```

**В `vitest.config.ts` заменить:**

```ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Тесты на настоящих моделях — отдельно: npm run test:models (vitest.models.config.ts).
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
```

**на:**

```ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Тесты на настоящих моделях — отдельно: npm run test:models (vitest.models.config.ts) и npm run test:llm
    // (vitest.llm.config.ts).
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts', 'src/**/*.llm.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
```

**Создать `vitest.llm.config.ts`:**

```ts
import { defineConfig } from 'vitest/config';

// Настоящий движок итогов и настоящая модель (npm run test:llm): только на своём компьютере — модель весит 5,3 ГБ и
// берётся из TEXTMEET_LLM_MODELS_DIR без скачивания (src/main/ai/llama.llm.test.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.llm.test.ts'],
    environment: 'node',
    testTimeout: 5 * 60_000,
  },
});
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  1029 passed (1029)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `73 passed`, `2 skipped` (проверки собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).
- [ ] **Движок и настоящая модель:** `npm run fetch:llama` — в `vendor/llama` появляются `llama-server.exe` и его
  библиотеки (на Windows — около 83 МБ), `vendor/llama/llama-server.exe --version` пишет `build 11588`. Затем (нужна
  скачанная Qwen3.5 9B — см. «Факты») PowerShell: `$env:TEXTMEET_LLM_MODELS_DIR = 'D:\TextMeet-p9\llm-root'; npm run test:llm`.
  Ожидается: `Tests  1 passed (1)` (около 20 с).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: bundled llama.cpp engine for summaries and a client for it"
```

### Task 3: Итоги и вопросы в main: ai.json, очередь, остановка и выход

**Files:**
- Create: `e2e/ai-engine.spec.ts`, `src/main/ai/ai-meeting.ts`, `src/main/ai/ai-messages.test.ts`, `src/main/ai/ai-messages.ts`, `src/main/ai/ai-runner.test.ts`, `src/main/ai/ai-runner.ts`, `src/main/ai/ai-store.test.ts`, `src/main/ai/ai-store.ts`, `src/shared/ai.ts`
- Modify: `e2e/helpers.ts`, `src/main/export/export-meeting.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/models/fake-model-store.test.ts`, `src/main/models/fake-model-store.ts`, `src/main/models/models-state.test.ts`, `src/main/models/models-state.ts`, `src/main/models/registry.test.ts`, `src/main/models/registry.ts`, `src/main/texts.ts`, `src/preload/index.ts`, `src/renderer/main/AiModelSettings.tsx`, `src/renderer/main/ai-catalog.test.ts`, `src/shared/ipc.ts`, `src/shared/llm-models.ts`

**Interfaces:**
- Consumes: `LlamaServer`, `countTokens`, `streamChat`, `LlmError` (Task 2); `currentAiModel`, `llmModel`, `llmFilePath`
  (Task 1); `loadExportDoc` (теперь экспортируется из `export-meeting.ts`), `withFileLock`, `writeJsonAtomic`, `readJsonFile`.
- Produces: `AiDocSchema`, `AiDoc`, `AiSummary`, `AiQuestion`, `EMPTY_AI_DOC`, `AI_QUESTION_MAX`, `AiMeetingView = { doc, broken,
  stale }`, `AiJob`, `AiFailure`, `AiState = { job, failures }` (в Task 6 — ещё `finished`), `AiStartResult = 'started' |
  'no-model' | 'busy'`, `AskRequest`, `DeleteQuestionRequest` (`shared/ai.ts`); `readAi`, `updateAi`, `aiPath`, `AI_FILE`;
  `AI_RULES`, `aiMessages`, `summaryTask`, `meetingText`, `sourceHash`, `fitsWindow`; `AiRunner` (`state`, `isBusy`,
  `summarize`, `ask`, `stop`, `dismiss`, `forget`, `stopEngine`, `disposeForQuit`), `AiEngine`, `llamaEngine(server)`;
  `aiView(libraryDir, id)`, `deleteQuestion(...)`; `aiTexts.engine / tooLong / notSaved / modelBusy`; `isModelGroupId`;
  `FakeModelStore(root, stepMs, installed?)`; в e2e — `launchApp({ installedModels, llmTokenMs })`, `launched.llmLog`,
  `llmRequests(llmLog)`.

`shared/ai.ts` — схема `ai.json` (итоги и свои вопросы: текст, модель, время, `done` / `stopped`, отпечаток текста
встречи), что main сообщает окну (`AiState`: запрос, который модель выполняет сейчас, и неудачи по встречам).
`ai/ai-store.ts` — чтение и запись `ai.json` с блокировкой и атомарной записью (испорченный файл не трогается, пока
не сделают новые итоги или не спросят). `ai/ai-messages.ts` — скрытые правила, «Текст встречи:» + текст встречи
(`toPlainText`) + «---» + задание, отпечаток текста, проверка длины (2048 «кусочков» — под ответ). `ai/ai-runner.ts`
(`AiRunner`) — один запрос на всю программу: этапы «Готовим модель…» / «Читаем встречу…» / пишет, ход в окно не
чаще 10 раз в секунду, «Остановить» и выход из программы сохраняют написанное как «остановлено», удаление встречи —
ничего; неудачи — понятными словами (`aiTexts`). `ai/ai-meeting.ts` — итоги встречи для окна с пометкой «текст
меняли» и удаление вопроса. Каналы `ai:get`, `ai:get-state`, `ai:summarize`, `ai:ask`, `ai:stop`,
`ai:delete-question`, `ai:dismiss-failure`, события `ai:state` и `ai:changed`. В автотестах — поддельный
`llama-server` (`TEXTMEET_TEST_LLM`) и «уже скачанные» модели (`TEXTMEET_TEST_INSTALLED`). Каталог ИИ: «Удалить»
недоступна, пока модель отвечает.

- [ ] **Step 1: Тесты**

**Создать `e2e/ai-engine.spec.ts`:**

```ts
// Итоги в main (План 9): очередь, ai.json, выход и удаление встречи посреди ответа — через API окна, с поддельным
// llama-server (TEXTMEET_TEST_LLM) и поддельным хранилищем моделей. Блок итогов в окне — e2e/ai-summary.spec.ts.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, llmRequests, meetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';

const transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T13:52:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'a', start: 5, end: 9, speakerId: 's1', text: 'Переносим запуск на пятницу.', edited: false },
    { id: 'b', start: 10, end: 12, speakerId: 'me', text: 'Согласен.', edited: false },
  ],
};

const fixture = { meetings: [{ id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной' }) }], transcripts: { [ID]: transcript } };

test('a summary is written by the engine and saved in ai.json of the meeting', async () => {
  launched = await launchApp({ ...fixture, installedModels: ['qwen3.5-9b'] });
  const { page, libraryDir, llmLog } = launched;
  expect(await page.evaluate((id) => window.textmeet.summarize(id), ID)).toBe('started');
  await expect
    .poll(() => page.evaluate((id) => window.textmeet.getAi(id).then((v) => v.doc.summary?.status ?? null), ID))
    .toBe('done');
  const saved = JSON.parse(await readFile(join(libraryDir, ID, 'ai.json'), 'utf8')) as { summary: { text: string; modelTitle: string } };
  expect(saved.summary.text).toContain('### Главное');
  expect(saved.summary.modelTitle).toBe('Qwen3.5 9B');
  // Модель видит скрытые правила и текст встречи с именами спикеров.
  const [request] = await llmRequests(llmLog);
  expect(request?.max_tokens).toBe(2048);
  expect(request?.messages[0]?.content).toContain('не придумывай');
  expect(request?.messages[1]?.content).toContain('Спикер 1 [0:05]\nПереносим запуск на пятницу.');
  expect(await page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, failures: [] });
});

test('without a downloaded model nothing starts', async () => {
  launched = await launchApp(fixture);
  expect(await launched.page.evaluate((id) => window.textmeet.summarize(id), ID)).toBe('no-model');
  expect(await llmRequests(launched.llmLog)).toEqual([]);
});

test('quitting while the model writes keeps what was written, marked as stopped', async () => {
  launched = await launchApp({ ...fixture, installedModels: ['qwen3.5-9b'], llmTokenMs: 400 });
  const { app, page, libraryDir } = launched;
  await page.evaluate((id) => window.textmeet.askAi({ meetingId: id, question: 'Что решили по срокам?' }), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState().then((s) => s.job?.text ?? ''))).not.toBe('');
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await closed;
  const saved = JSON.parse(await readFile(join(libraryDir, ID, 'ai.json'), 'utf8')) as {
    questions: { question: string; answer: string; status: string }[];
  };
  expect(saved.questions).toHaveLength(1);
  expect(saved.questions[0]).toMatchObject({ question: 'Что решили по срокам?', status: 'stopped' });
  expect(saved.questions[0]?.answer.startsWith('Ответ:')).toBe(true);
});

test('deleting the meeting while the model writes stops it and saves nothing', async () => {
  launched = await launchApp({ ...fixture, installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page, trashDir } = launched;
  await page.evaluate((id) => window.textmeet.summarize(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState().then((s) => s.job?.stage ?? null))).toBe('writing');
  await page.evaluate((id) => window.textmeet.deleteMeeting(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, failures: [] });
  const [trashed] = await readdir(trashDir);
  expect(existsSync(join(trashDir, trashed!, 'ai.json'))).toBe(false);
});
```

**В `e2e/helpers.ts` заменить:**

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';

export interface MeetingFixture {
```

**на:**

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';

export interface MeetingFixture {
```

**В `e2e/helpers.ts` заменить:**

```ts
  executablePath?: string;
  /** Уже расшифрованные встречи: id → transcript.json. */
  transcripts?: Record<string, unknown>;
  /** Сколько длится каждый из пяти шагов поддельного скачивания модели, мс (по умолчанию — мгновенно). */
  downloadStepMs?: number;
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
```

**на:**

```ts
  executablePath?: string;
  /** Уже расшифрованные встречи: id → transcript.json. */
  transcripts?: Record<string, unknown>;
  /** Сколько длится каждый из пяти шагов поддельного скачивания модели, мс (по умолчанию — мгновенно). */
  downloadStepMs?: number;
  /** Модели, уже «скачанные» в поддельном хранилище: например, ['qwen3.5-9b'] — модель для итогов. */
  installedModels?: string[];
  /** Пауза поддельного движка итогов между кусками ответа, мс (по умолчанию 20). */
  llmTokenMs?: number;
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
```

**В `e2e/helpers.ts` заменить:**

```ts
  userDataDir: string;
  homeDir: string;
  libraryDir: string;
  /** «Корзина» программы в тестах (TEXTMEET_TEST_TRASH): удалённое переносится сюда. */
  trashDir: string;
  close(): Promise<void>;
}

// Меньше тайм-аута теста: если окно не появилось, уборка в launchApp ещё успеет выполниться.
const WINDOW_TIMEOUT_MS = 15_000;
```

**на:**

```ts
  userDataDir: string;
  homeDir: string;
  libraryDir: string;
  /** «Корзина» программы в тестах (TEXTMEET_TEST_TRASH): удалённое переносится сюда. */
  trashDir: string;
  /** Журнал поддельного движка итогов: параметры запусков и запросы, по строке JSON. */
  llmLog: string;
  close(): Promise<void>;
}

// Меньше тайм-аута теста: если окно не появилось, уборка в launchApp ещё успеет выполниться.
const WINDOW_TIMEOUT_MS = 15_000;
```

**В `e2e/helpers.ts` заменить:**

```ts
  const root = await mkdtemp(join(tmpdir(), 'textmeet-e2e-'));
  const userDataDir = join(root, 'userData');
  const homeDir = join(root, 'home');
  const libraryDir = join(root, 'library');
  const trashDir = join(root, 'trash');

  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    await writeFixtures({ userDataDir, homeDir, libraryDir }, options);
```

**на:**

```ts
  const root = await mkdtemp(join(tmpdir(), 'textmeet-e2e-'));
  const userDataDir = join(root, 'userData');
  const homeDir = join(root, 'home');
  const libraryDir = join(root, 'library');
  const trashDir = join(root, 'trash');
  const llmLog = join(root, 'llm.log');

  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    await writeFixtures({ userDataDir, homeDir, libraryDir }, options);
```

**В `e2e/helpers.ts` заменить:**

```ts
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
        TEXTMEET_TEST_DOWNLOAD_MS: String(options.downloadStepMs ?? 0),
        // Удалённое — в папку теста, а не в Корзину системы (на машинах CI её может не быть).
        TEXTMEET_TEST_TRASH: trashDir,
      },
    });
    page = await mainWindow(app);
  } catch (err) {
    // Подготовка или запуск не удались — не оставляем за собой ни процесс, ни временные папки.
```

**на:**

```ts
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
        TEXTMEET_TEST_DOWNLOAD_MS: String(options.downloadStepMs ?? 0),
        // Удалённое — в папку теста, а не в Корзину системы (на машинах CI её может не быть).
        TEXTMEET_TEST_TRASH: trashDir,
        TEXTMEET_TEST_INSTALLED: (options.installedModels ?? []).join(','),
        // Итоги — поддельным llama-server (Node-скрипт), без модели и видеокарты.
        TEXTMEET_TEST_LLM: resolve('src/test-support/fake-llama-server.mjs'),
        TEXTMEET_FAKE_LLM_TOKEN_MS: String(options.llmTokenMs ?? 20),
        TEXTMEET_FAKE_LLM_LOG: llmLog,
      },
    });
    page = await mainWindow(app);
  } catch (err) {
    // Подготовка или запуск не удались — не оставляем за собой ни процесс, ни временные папки.
```

**В `e2e/helpers.ts` заменить:**

```ts
    root,
    userDataDir,
    homeDir,
    libraryDir,
    trashDir,
    close: async () => {
      // Если запись ещё идёт, при выходе программа спросит системным окном — отвечаем «Остановить и выйти».
      // Тест мог уже закрыть программу сам (выход из меню) — тогда закрывать нечего.
      await app
        .evaluate(({ dialog }) => {
```

**на:**

```ts
    root,
    userDataDir,
    homeDir,
    libraryDir,
    trashDir,
    llmLog,
    close: async () => {
      // Если запись ещё идёт, при выходе программа спросит системным окном — отвечаем «Остановить и выйти».
      // Тест мог уже закрыть программу сам (выход из меню) — тогда закрывать нечего.
      await app
        .evaluate(({ dialog }) => {
```

**В `e2e/helpers.ts` заменить:**

```ts
      await app.close().catch(() => undefined);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
```

**на:**

```ts
      await app.close().catch(() => undefined);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

/** Запросы, которые получил поддельный движок итогов (тело /v1/chat/completions). */
export interface LlmRequest {
  messages: { role: string; content: string }[];
  max_tokens: number;
}

export async function llmRequests(llmLog: string): Promise<LlmRequest[]> {
  const text = await readFile(llmLog, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line.includes('"chat"'))
    .map((line) => (JSON.parse(line) as { body: LlmRequest }).body);
}
```

**Создать `src/main/ai/ai-messages.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { ExportDoc } from '../../shared/export-doc';
import { AI_RULES, aiMessages, fitsWindow, meetingText, sourceHash, summaryTask } from './ai-messages';

const doc: ExportDoc = {
  title: 'Созвон',
  metaLine: '27 сентября 2026, 16:20 · 32 мин',
  participantsLine: 'Участники: Я, Ирина',
  paragraphs: [{ speaker: 'Ирина', time: '0:05', text: 'Переносим на пятницу.' }],
};

describe('aiMessages', () => {
  it('puts the hidden rules first, then the meeting, then the task', () => {
    const messages = aiMessages(meetingText(doc), 'Что решили?');
    expect(messages).toEqual([
      { role: 'system', content: AI_RULES },
      {
        role: 'user',
        content:
          'Текст встречи:\n\nСозвон\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Я, Ирина\n\nИрина [0:05]\nПереносим на пятницу.\n---\nЧто решили?',
      },
    ]);
    expect(AI_RULES).toContain('не придумывай');
    expect(AI_RULES).toContain('Рекламные вставки не учитывай');
  });

  it('keeps the same beginning for a summary and a question: the engine does not read the meeting again', () => {
    const summary = aiMessages(meetingText(doc), summaryTask(null))[1]?.content ?? '';
    const question = aiMessages(meetingText(doc), 'Кто такой Олег?')[1]?.content ?? '';
    const common = 'Текст встречи:\n\n' + meetingText(doc) + '---\n';
    expect(summary.startsWith(common) && question.startsWith(common)).toBe(true);
  });
});

describe('summaryTask', () => {
  it('takes the prompt from the settings, and the standard one when the prompt is empty', () => {
    expect(summaryTask('Перечисли задачи')).toBe('Перечисли задачи');
    expect(summaryTask(null)).toBe(DEFAULT_AI_PROMPT);
    expect(summaryTask('')).toBe(DEFAULT_AI_PROMPT);
  });
});

describe('sourceHash', () => {
  it('changes with the text and the speaker names, but not with the title', () => {
    const base = sourceHash(doc);
    expect(sourceHash({ ...doc, title: 'Новое название' })).toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ирина', time: '0:05', text: 'Переносим на четверг.' }] })).not.toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ира', time: '0:05', text: 'Переносим на пятницу.' }] })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('fitsWindow', () => {
  it('leaves 2048 tokens for the answer', () => {
    expect(fitsWindow(65_536 - 2048, 65_536)).toBe(true);
    expect(fitsWindow(65_536 - 2047, 65_536)).toBe(false);
  });
});
```

**Создать `src/main/ai/ai-runner.test.ts`:**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { AiState } from '../../shared/ai';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { aiTexts } from '../texts';
import { aiView, deleteQuestion } from './ai-meeting';
import { AI_RULES } from './ai-messages';
import { aiPath, readAi } from './ai-store';
import { AiRunner, type AiEngine, type AiModelRef } from './ai-runner';
import { LlmError, type ChatRequest, type StreamOptions } from './llm-client';

const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-05T10:00:00.000Z',
  speakers: [{ id: 's1', kind: 'other' }],
  segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text: 'Переносим запуск на пятницу.', edited: false }],
};

async function meeting(lib: string, title = 'Созвон с Ириной'): Promise<string> {
  const created = await createMeeting(lib, { source: 'recording', status: 'done', title, now: new Date(2026, 8, 27, 16, 20) });
  await updateMeeting(lib, created.id, (m) => ({ ...m, speakerNames: { s1: 'Ирина' } }));
  await writeTranscript(lib, created.id, transcript);
  return created.id;
}

/** Движок, которым управляет тест: загрузка, счёт «кусочков», поток ответа. */
function controllableEngine() {
  const requests: { request: ChatRequest; options: StreamOptions; finish(): void; fail(err: unknown): void }[] = [];
  let tokens = 100;
  let failReady: unknown = null;
  const engine = {
    ready: vi.fn<AiEngine['ready']>(async () => {
      if (failReady) throw failReady;
      return {
        countTokens: async () => tokens,
        streamChat: (request: ChatRequest, options: StreamOptions) =>
          new Promise<{ finishReason: string | null }>((resolve, reject) => {
            requests.push({ request, options, finish: () => resolve({ finishReason: 'stop' }), fail: reject });
            options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      };
    }),
    idle: vi.fn<AiEngine['idle']>(),
    stop: vi.fn<AiEngine['stop']>(async () => undefined),
  } satisfies AiEngine;
  return {
    engine,
    requests,
    setTokens: (n: number) => (tokens = n),
    failReady: (err: unknown) => (failReady = err),
    /** Дождаться запроса и написать в ответ кусками. */
    write: async (...pieces: string[]) => {
      await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
      const last = requests.at(-1)!;
      for (const piece of pieces) last.options.onText(piece);
      return last;
    },
  };
}

function setup(options: { model?: AiModelRef | null; prompt?: string | null } = {}) {
  const lib = makeTempDir('textmeet-ai-runner-');
  const control = controllableEngine();
  const states: AiState[] = [];
  const saved = vi.fn();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runner = new AiRunner({
    libraryDir: () => lib,
    model: async () => (options.model === undefined ? { id: 'qwen3.5-9b', path: 'M/qwen.gguf' } : options.model),
    engine: control.engine,
    aiPrompt: async () => options.prompt ?? null,
    now: () => new Date('2026-10-14T10:00:00.000Z'),
    logger,
    changed: (state) => states.push(state),
    saved,
    emitMs: 0,
  });
  return { lib, runner, ...control, states, saved, logger };
}

const idle = (runner: AiRunner) => vi.waitFor(() => expect(runner.isBusy()).toBe(false));

describe('AiRunner', () => {
  it('writes a summary: loading, reading, writing — and saves it with the hash of the text it read', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    expect(await t.runner.summarize(id)).toBe('started');
    expect(t.runner.state().job).toMatchObject({ meetingId: id, meetingTitle: 'Созвон с Ириной', kind: 'summary', modelTitle: 'Qwen3.5 9B' });
    const request = await t.write('- Главное', ': пятница');
    expect(t.states.map((s) => s.job?.stage)).toEqual(expect.arrayContaining(['loading', 'reading', 'writing']));
    expect(t.runner.state().job?.text).toBe('- Главное: пятница');
    // Модель видит правила, встречу (с именами спикеров) и стандартный запрос; итоги — до 2048 «кусочков».
    expect(request.request.maxTokens).toBe(2048);
    expect(request.request.messages[0]?.content).toBe(AI_RULES);
    expect(request.request.messages[1]?.content).toContain('Ирина [0:05]\nПереносим запуск на пятницу.');
    expect(request.request.messages[1]?.content.endsWith(`---\n${DEFAULT_AI_PROMPT}`)).toBe(true);
    expect(t.engine.ready).toHaveBeenCalledWith({ path: 'M/qwen.gguf', contextTokens: 65_536 }, expect.any(AbortSignal));
    request.finish();
    await idle(t.runner);
    const view = await aiView(t.lib, id);
    expect(view.doc.summary).toMatchObject({
      text: '- Главное: пятница',
      model: 'qwen3.5-9b',
      modelTitle: 'Qwen3.5 9B',
      createdAt: '2026-10-14T10:00:00.000Z',
      status: 'done',
    });
    expect(view.stale).toBe(false);
    expect(t.saved).toHaveBeenCalledWith(id);
    expect(t.engine.idle).toHaveBeenCalled();
    expect(t.runner.state()).toEqual({ job: null, failures: [] });
  });

  it('asks a question with the question alone as the task, and keeps the questions in order', async () => {
    const t = setup({ prompt: 'Свой запрос' });
    const id = await meeting(t.lib);
    for (const question of ['  Что решили?  ', 'Кто такой Олег?']) {
      await t.runner.ask(id, question);
      const request = await t.write('Ответ.');
      expect(request.request.maxTokens).toBe(1024);
      expect(request.request.messages[1]?.content.endsWith(`---\n${question.trim()}`)).toBe(true);
      request.finish();
      await idle(t.runner);
    }
    const { doc } = await readAi(t.lib, id);
    expect(doc.questions.map((q) => [q.question, q.answer, q.status])).toEqual([
      ['Что решили?', 'Ответ.', 'done'],
      ['Кто такой Олег?', 'Ответ.', 'done'],
    ]);
    expect(doc.summary).toBeNull();
  });

  it('runs one request for the whole program', async () => {
    const t = setup();
    const first = await meeting(t.lib, 'Первая');
    const second = await meeting(t.lib, 'Вторая');
    await t.runner.summarize(first);
    expect(await t.runner.summarize(second)).toBe('busy');
    expect(await t.runner.ask(first, 'Что?')).toBe('busy');
  });

  it('says when no model is downloaded, without starting anything', async () => {
    const t = setup({ model: null });
    const id = await meeting(t.lib);
    expect(await t.runner.summarize(id)).toBe('no-model');
    expect(t.engine.ready).not.toHaveBeenCalled();
    expect(t.runner.isBusy()).toBe(false);
  });

  it('refuses a meeting without text, like the export', async () => {
    const t = setup();
    const created = await createMeeting(t.lib, { source: 'recording', status: 'recorded', title: 'Пусто', now: new Date() });
    await expect(t.runner.summarize(created.id)).rejects.toThrow('У встречи пока нет текста');
    expect(t.runner.isBusy()).toBe(false);
  });

  it('«Остановить» keeps what was written, marked as stopped; a stop before any text saves nothing', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    await t.write('- Бюджет');
    t.runner.stop();
    await idle(t.runner);
    expect((await readAi(t.lib, id)).doc.summary).toMatchObject({ text: '- Бюджет', status: 'stopped' });

    await t.runner.ask(id, 'Что?');
    await vi.waitFor(() => expect(t.requests).toHaveLength(2));
    t.runner.stop();
    await idle(t.runner);
    expect((await readAi(t.lib, id)).doc.questions).toEqual([]);
  });

  it('does not send a meeting longer than the window of the model', async () => {
    const t = setup({ model: { id: 't-lite-it-2.1', path: 'M/t-lite.gguf' } });
    const id = await meeting(t.lib);
    t.setTokens(40_960 - 2048 + 1);
    await t.runner.summarize(id);
    await idle(t.runner);
    expect(t.requests).toHaveLength(0);
    expect(t.runner.state().failures).toEqual([
      { meetingId: id, kind: 'summary', question: null, failure: 'too-long', message: aiTexts.tooLong('T-lite-it 2.1'), text: null },
    ]);
  });

  it('reports an engine that did not start or broke off, and forgets the failure on the next request', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    t.failReady(new LlmError('engine', 'движок итогов не запустился'));
    await t.runner.summarize(id);
    await idle(t.runner);
    expect(t.runner.state().failures[0]).toMatchObject({ failure: 'engine', message: aiTexts.engine });
    expect(t.logger.error).toHaveBeenCalled();

    t.failReady(null);
    await t.runner.summarize(id);
    expect(t.runner.state().failures).toEqual([]);
    const request = await t.write('кус');
    request.fail(new LlmError('engine', 'ответ движка итогов оборвался'));
    await idle(t.runner);
    expect(t.runner.state().failures[0]?.failure).toBe('engine');
    expect((await readAi(t.lib, id)).doc.summary).toBeNull();
  });

  it('keeps an answer that could not be saved in the failure, until the person leaves the meeting', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    // На месте ai.json — папка: записать файл не выйдет.
    mkdirSync(aiPath(t.lib, id));
    await t.runner.ask(id, 'Сроки?');
    (await t.write('Пятница.')).finish();
    await idle(t.runner);
    const failure = t.runner.state().failures[0];
    expect(failure).toMatchObject({ failure: 'save', kind: 'question', question: 'Сроки?', text: 'Пятница.' });
    expect(failure?.message).toMatch(/^Не удалось сохранить ответ: /);
    t.runner.dismiss(id);
    expect(t.runner.state().failures).toEqual([]);
  });

  it('a deleted meeting stops its request and saves nothing', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    await t.write('- Бюджет');
    t.runner.forget(id);
    await idle(t.runner);
    expect(await readAi(t.lib, id)).toMatchObject({ doc: { summary: null }, broken: false });
    expect(t.runner.state().failures).toEqual([]);
  });

  it('on quit saves the answer as stopped and stops the engine', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    await t.write('- Половина');
    await t.runner.disposeForQuit();
    expect((await readAi(t.lib, id)).doc.summary).toMatchObject({ text: '- Половина', status: 'stopped' });
    expect(t.engine.stop).toHaveBeenCalled();
  });

  it('treats an empty answer as a failure of the model', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    (await t.write('  ')).finish();
    await idle(t.runner);
    expect(t.runner.state().failures[0]?.failure).toBe('engine');
  });
});

describe('aiView and deleteQuestion', () => {
  it('marks the summary when the text of the meeting changed after it, but not after a new title', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    (await t.write('- Итоги')).finish();
    await idle(t.runner);
    await updateMeeting(t.lib, id, (m) => ({ ...m, title: 'Новое название' }));
    expect((await aiView(t.lib, id)).stale).toBe(false);
    await updateMeeting(t.lib, id, (m) => ({ ...m, speakerNames: { s1: 'Ира' } }));
    expect((await aiView(t.lib, id)).stale).toBe(true);
  });

  it('shows a broken file as empty and broken', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    writeFileSync(aiPath(t.lib, id), 'не json');
    expect(await aiView(t.lib, id)).toMatchObject({ broken: true, stale: false, doc: { summary: null, questions: [] } });
  });

  it('deletes one question and leaves the rest', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    for (const q of ['Раз?', 'Два?']) {
      await t.runner.ask(id, q);
      (await t.write('Да.')).finish();
      await idle(t.runner);
    }
    const [first] = (await readAi(t.lib, id)).doc.questions;
    const view = await deleteQuestion(t.lib, id, first!.id, t.logger);
    expect(view.doc.questions.map((q) => q.question)).toEqual(['Два?']);
    // Чужой id — ничего не меняется.
    expect((await deleteQuestion(t.lib, id, 'нет-такого', t.logger)).doc.questions).toHaveLength(1);
  });
});
```

**Создать `src/main/ai/ai-store.test.ts`:**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_AI_DOC, type AiDoc } from '../../shared/ai';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting } from '../library/library';
import { aiPath, readAi, updateAi } from './ai-store';

const summary = {
  text: '- Главное',
  model: 'qwen3.5-9b',
  modelTitle: 'Qwen3.5 9B',
  createdAt: '2026-10-14T10:00:00.000Z',
  status: 'done' as const,
  sourceHash: 'abc',
};

async function meeting(): Promise<{ lib: string; id: string }> {
  const lib = makeTempDir('textmeet-ai-');
  const created = await createMeeting(lib, { source: 'recording', status: 'done', title: 'Встреча', now: new Date(2026, 9, 14) });
  return { lib, id: created.id };
}

describe('ai.json', () => {
  it('is empty while there is no file', async () => {
    const { lib, id } = await meeting();
    expect(await readAi(lib, id)).toEqual({ doc: EMPTY_AI_DOC, broken: false });
  });

  it('writes and reads summaries and questions', async () => {
    const { lib, id } = await meeting();
    const logger = { warn: vi.fn() };
    await updateAi(lib, id, (doc) => ({ ...doc, summary }), logger);
    const question = { id: 'q1', question: 'Сроки?', answer: 'Пятница.', model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: summary.createdAt, status: 'stopped' as const };
    await updateAi(lib, id, (doc) => ({ ...doc, questions: [...doc.questions, question] }), logger);
    expect(await readAi(lib, id)).toEqual({ doc: { version: 1, summary, questions: [question] }, broken: false });
  });

  it('reads an older file without the status as a finished answer', async () => {
    const { lib, id } = await meeting();
    const { status: _status, ...old } = summary;
    writeFileSync(aiPath(lib, id), JSON.stringify({ version: 1, summary: old }));
    const { doc } = await readAi(lib, id);
    expect(doc.summary?.status).toBe('done');
    expect(doc.questions).toEqual([]);
  });

  it('shows nothing for a broken file and keeps it until something new is saved', async () => {
    const { lib, id } = await meeting();
    writeFileSync(aiPath(lib, id), '{ сломано');
    expect(await readAi(lib, id)).toEqual({ doc: EMPTY_AI_DOC, broken: true });
    // Ничего не изменилось — файл не перезаписан.
    const logger = { warn: vi.fn() };
    await updateAi(lib, id, (doc) => doc, logger);
    expect(readFileSync(aiPath(lib, id), 'utf8')).toBe('{ сломано');
    await updateAi(lib, id, (doc): AiDoc => ({ ...doc, summary }), logger);
    expect((await readAi(lib, id)).doc.summary).toEqual(summary);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('файл заменяется новыми'));
  });

  it('treats a file of a newer version as broken', async () => {
    const { lib, id } = await meeting();
    writeFileSync(aiPath(lib, id), JSON.stringify({ version: 2, summary: null, questions: [] }));
    expect((await readAi(lib, id)).broken).toBe(true);
  });

  it('applies changes one after another', async () => {
    const { lib, id } = await meeting();
    const logger = { warn: vi.fn() };
    const add = (n: number) =>
      updateAi(lib, id, (doc) => ({ ...doc, questions: [...doc.questions, { ...summary, id: `q${n}`, question: `${n}`, answer: '' }] }), logger);
    await Promise.all([add(1), add(2), add(3)]);
    expect((await readAi(lib, id)).doc.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});
```

**В `src/main/models/fake-model-store.test.ts` заменить:**

```ts
    // Уже скачанное — без «скачивания».
    await store.ensure([]);
  });
});
```

**на:**

```ts
    // Уже скачанное — без «скачивания».
    await store.ensure([]);
  });

  it('can start with models already «downloaded»', async () => {
    const store = new FakeModelStore('M', 0, ['qwen3.5-9b']);
    expect((await store.state()).filter((g) => g.installed).map((g) => g.id)).toEqual(['qwen3.5-9b']);
  });
});
```

**В `src/main/models/models-state.test.ts` заменить:**

```ts
describe('buildAiModelsState', () => {
  it('lists the models for summaries in catalog order with the download of any catalog', () => {
    const download = { id: 't-one' as const, done: 1, total: 2, remainingSec: 40 };
    const state = buildAiModelsState([{ id: 'qwen3.5-4b', sizeBytes: 7, installed: true }], 'qwen3.5-4b', {
      download,
      downloadError: null,
    });
    expect(state.models.map((m) => m.id)).toEqual([...LLM_MODEL_IDS]);
    expect(state.models.find((m) => m.id === 'qwen3.5-4b')).toEqual({ id: 'qwen3.5-4b', sizeBytes: 7, installed: true });
    expect(state.models[0]).toEqual({ id: 'qwen3.5-9b', sizeBytes: groupSize('qwen3.5-9b'), installed: false });
    expect(state).toMatchObject({ selected: 'qwen3.5-4b', download, downloadError: null });
  });

  it('shows only its own failed download, and only while the model is missing', () => {
    const failed = (id: 't-one' | 'qwen3.5-9b') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    expect(buildAiModelsState([], null, failed('qwen3.5-9b')).downloadError).toEqual({ id: 'qwen3.5-9b', message: 'нет связи' });
    expect(buildAiModelsState([], null, failed('t-one')).downloadError).toBeNull();
    const installed = [{ id: 'qwen3.5-9b' as const, sizeBytes: 1, installed: true }];
    expect(buildAiModelsState(installed, 'qwen3.5-9b', failed('qwen3.5-9b')).downloadError).toBeNull();
  });
});
```

**на:**

```ts
describe('buildAiModelsState', () => {
  it('lists the models for summaries in catalog order with the download of any catalog', () => {
    const download = { id: 't-one' as const, done: 1, total: 2, remainingSec: 40 };
    const state = buildAiModelsState(
      [{ id: 'qwen3.5-4b', sizeBytes: 7, installed: true }],
      'qwen3.5-4b',
      { download, downloadError: null },
      true,
    );
    expect(state.models.map((m) => m.id)).toEqual([...LLM_MODEL_IDS]);
    expect(state.models.find((m) => m.id === 'qwen3.5-4b')).toEqual({ id: 'qwen3.5-4b', sizeBytes: 7, installed: true });
    expect(state.models[0]).toEqual({ id: 'qwen3.5-9b', sizeBytes: groupSize('qwen3.5-9b'), installed: false });
    expect(state).toMatchObject({ selected: 'qwen3.5-4b', download, downloadError: null, busy: true });
  });

  it('shows only its own failed download, and only while the model is missing', () => {
    const failed = (id: 't-one' | 'qwen3.5-9b') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    expect(buildAiModelsState([], null, failed('qwen3.5-9b'), false).downloadError).toEqual({ id: 'qwen3.5-9b', message: 'нет связи' });
    expect(buildAiModelsState([], null, failed('t-one'), false).downloadError).toBeNull();
    const installed = [{ id: 'qwen3.5-9b' as const, sizeBytes: 1, installed: true }];
    expect(buildAiModelsState(installed, 'qwen3.5-9b', failed('qwen3.5-9b'), false).downloadError).toBeNull();
  });
});
```

**В `src/main/models/registry.test.ts` заменить:**

```ts
  asrFilePath,
  groupFiles,
  groupSize,
  llmFilePath,
  MODEL_FILES,
  MODEL_GROUP_IDS,
```

**на:**

```ts
  asrFilePath,
  groupFiles,
  groupSize,
  isModelGroupId,
  llmFilePath,
  MODEL_FILES,
  MODEL_GROUP_IDS,
```

**В `src/main/models/registry.test.ts` заменить:**

```ts
    expect(groupSize('qwen3.5-9b')).toBe(5_680_522_464);
  });

  it('keeps the transcription groups apart from the models for summaries', () => {
    expect(MODEL_GROUP_IDS).toEqual([...TRANSCRIPTION_GROUP_IDS, ...LLM_MODEL_IDS]);
    expect(TRANSCRIPTION_GROUP_IDS).toEqual([...ASR_MODEL_IDS, 'voices']);
```

**на:**

```ts
    expect(groupSize('qwen3.5-9b')).toBe(5_680_522_464);
  });

  it('recognizes the groups of the registry only', () => {
    expect(isModelGroupId('voices')).toBe(true);
    expect(isModelGroupId('qwen3.5-4b')).toBe(true);
    expect(isModelGroupId('llama-70b')).toBe(false);
  });

  it('keeps the transcription groups apart from the models for summaries', () => {
    expect(MODEL_GROUP_IDS).toEqual([...TRANSCRIPTION_GROUP_IDS, ...LLM_MODEL_IDS]);
    expect(TRANSCRIPTION_GROUP_IDS).toEqual([...ASR_MODEL_IDS, 'voices']);
```

**В `src/renderer/main/ai-catalog.test.ts` заменить:**

```ts
    models: LLM_MODEL_IDS.map((id) => ({ id, sizeBytes: 5 * GB, installed: installed.includes(id) })),
    download: null,
    downloadError: null,
  };
}
```

**на:**

```ts
    models: LLM_MODEL_IDS.map((id) => ({ id, sizeBytes: 5 * GB, installed: installed.includes(id) })),
    download: null,
    downloadError: null,
    busy: false,
  };
}
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/ai/ai-messages.test.ts src/main/ai/ai-runner.test.ts src/main/ai/ai-store.test.ts src/main/models/fake-model-store.test.ts src/main/models/models-state.test.ts src/main/models/registry.test.ts src/renderer/main/ai-catalog.test.ts`
Ожидается: FAIL — нет модулей `./ai-store`, `./ai-messages`, `./ai-runner`, `./ai-meeting`.

- [ ] **Step 3: Код**

**Создать `src/main/ai/ai-meeting.ts`:**

```ts
// Итоги и вопросы встречи для окна (решения Плана 9, §2.2): ai.json и пометка «Текст встречи меняли после итогов».
import type { AiMeetingView } from '../../shared/ai';
import { loadExportDoc } from '../export/export-meeting';
import type { Logger } from '../logger';
import { sourceHash } from './ai-messages';
import { readAi, updateAi } from './ai-store';

export async function aiView(libraryDir: string, meetingId: string): Promise<AiMeetingView> {
  const { doc, broken } = await readAi(libraryDir, meetingId);
  let stale = false;
  if (doc.summary) {
    // Текста нет или он не читается — сравнивать не с чем: пометку не показываем.
    const current = await loadExportDoc(libraryDir, meetingId).catch(() => null);
    stale = current !== null && sourceHash(current) !== doc.summary.sourceHash;
  }
  return { doc, broken, stale };
}

/** «Удалить» у своего вопроса — без подтверждения. */
export async function deleteQuestion(
  libraryDir: string,
  meetingId: string,
  questionId: string,
  logger: Pick<Logger, 'warn'>,
): Promise<AiMeetingView> {
  await updateAi(
    libraryDir,
    meetingId,
    (doc) =>
      doc.questions.some((q) => q.id === questionId)
        ? { ...doc, questions: doc.questions.filter((q) => q.id !== questionId) }
        : doc,
    logger,
  );
  return aiView(libraryDir, meetingId);
}
```

**Создать `src/main/ai/ai-messages.ts`:**

```ts
// Что видит модель (решения Плана 9, §4.2): скрытые правила, текст встречи, затем задание — запрос для ИИ (итоги) или
// вопрос. Текст встречи — в начале: у вопроса после итогов та же начальная часть, и движок не перечитывает встречу.
import { createHash } from 'node:crypto';
import { DEFAULT_AI_PROMPT, resolveAiPrompt } from '../../shared/ai-prompt';
import { toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ChatMessage } from './llm-client';

/** Скрытые правила: без них модель натягивала «решения» и «задачи» на интервью (решения Плана 9, §9). */
export const AI_RULES =
  'Ты помогаешь разобраться во встрече по её автоматической расшифровке (в ней бывают ошибки распознавания). ' +
  'Отвечай по-русски, только по тексту встречи. Если в разговоре чего-то нет, так и напиши — не придумывай. ' +
  'Рекламные вставки не учитывай.';

/** Предел ответа, «кусочков»: итоги и ответ на вопрос. */
export const SUMMARY_MAX_TOKENS = 2048;
export const QUESTION_MAX_TOKENS = 1024;
/** Сколько окна модели оставлено под ответ: встреча длиннее окна без него не отправляется. */
export const ANSWER_RESERVE_TOKENS = 2048;

/** Сообщения для модели: правила; «Текст встречи:», пустая строка, текст встречи, «---», задание. */
export function aiMessages(meetingText: string, task: string): ChatMessage[] {
  return [
    { role: 'system', content: AI_RULES },
    { role: 'user', content: `Текст встречи:\n\n${meetingText}---\n${task}` },
  ];
}

/** Задание для итогов: запрос для ИИ из настроек; пустой — стандартный: без задания модели нечего делать. */
export function summaryTask(stored: string | null): string {
  const prompt = resolveAiPrompt(stored);
  return prompt.trim() === '' ? DEFAULT_AI_PROMPT : prompt;
}

/** Текст встречи для модели — как у «Скопировать всё» (с правками и именами спикеров). */
export const meetingText = (doc: ExportDoc): string => toPlainText(doc);

/**
 * Отпечаток текста встречи, который видела модель. Название не входит: переименование встречи — не правка текста, и
 * пометка «текст меняли» из-за него не появляется.
 */
export const sourceHash = (doc: ExportDoc): string =>
  createHash('sha256').update(toPlainText({ ...doc, title: '' })).digest('hex');

/** Встреча с запросом помещается в окно модели, и ещё остаётся место под ответ. */
export const fitsWindow = (tokens: number, contextTokens: number): boolean =>
  tokens + ANSWER_RESERVE_TOKENS <= contextTokens;
```

**Создать `src/main/ai/ai-runner.ts`:**

```ts
// Итоги встречи и свои вопросы (решения Плана 9, §4.3): один запрос на всю программу. Окно получает состояние —
// начало, ход (не чаще 10 раз в секунду) и конец; написанное сохраняется в ai.json встречи. «Остановить» и выход из
// программы сохраняют написанное с пометкой «остановлено»; удаление встречи — ничего не сохраняет.
import { randomUUID } from 'node:crypto';
import type { AiFailure, AiJob, AiJobKind, AiStartResult, AiState } from '../../shared/ai';
import type { ExportDoc } from '../../shared/export-doc';
import { llmModel, type LlmModelId, type LlmModelInfo } from '../../shared/llm-models';
import { loadExportDoc } from '../export/export-meeting';
import type { Logger } from '../logger';
import { aiTexts } from '../texts';
import { aiMessages, fitsWindow, meetingText, QUESTION_MAX_TOKENS, sourceHash, SUMMARY_MAX_TOKENS, summaryTask } from './ai-messages';
import { updateAi } from './ai-store';
import { countTokens, LlmError, streamChat, type ChatRequest, type StreamOptions } from './llm-client';
import type { LlamaModel, LlamaServer } from './llama-server';

/** Ход ответа — в окно не чаще. */
export const AI_EMIT_MS = 100;
/** Сколько выход из программы ждёт сохранения остановленного ответа. */
export const QUIT_SAVE_MS = 2000;

/** Готовый к запросам движок с моделью. */
export interface AiSession {
  countTokens(content: string, signal: AbortSignal): Promise<number>;
  streamChat(request: ChatRequest, options: StreamOptions): Promise<{ finishReason: string | null }>;
}

/** Движок итогов глазами очереди: llama-server (llamaEngine) или подделка в модульных тестах. */
export interface AiEngine {
  /** Загрузить модель (этап «Готовим модель…»); отмена прекращает ожидание. */
  ready(model: LlamaModel, signal: AbortSignal): Promise<AiSession>;
  /** Запрос закончился — движок может завершиться после простоя. */
  idle(): void;
  stop(): Promise<void>;
}

export function llamaEngine(server: LlamaServer): AiEngine {
  return {
    ready: async (model, signal) => {
      const endpoint = await server.ready(model, signal);
      return {
        countTokens: (content, abort) => countTokens(endpoint, content, abort),
        streamChat: (request, options) => streamChat(endpoint, request, options),
      };
    },
    idle: () => server.idle(),
    stop: () => server.stop(),
  };
}

export interface AiModelRef {
  id: LlmModelId;
  /** Файл GGUF на диске. */
  path: string;
}

export interface AiRunnerDeps {
  libraryDir(): string;
  /** Модель для итогов, если скачана (выбранная или первая скачанная). */
  model(): Promise<AiModelRef | null>;
  engine: AiEngine;
  /** «Запрос для ИИ» из настроек — после уже начатых сохранений настроек. */
  aiPrompt(): Promise<string | null>;
  now(): Date;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Состояние для окна. */
  changed(state: AiState): void;
  /** ai.json встречи записан — окно перечитает итоги, поиск — встречу. */
  saved(meetingId: string): void;
  /** Пауза между сообщениями о ходе ответа (в тестах — короче). */
  emitMs?: number;
}

interface Running {
  job: AiJob;
  controller: AbortController;
  /** Встречу удалили — написанное не сохраняется. */
  discard: boolean;
  done: Promise<void>;
}

interface JobInput {
  model: AiModelRef;
  info: LlmModelInfo;
  doc: ExportDoc;
  task: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AiRunner {
  private running: Running | null = null;
  /** Запрос готовится (модель, текст встречи): второй в это время — «занято». */
  private starting = false;
  private readonly failures = new Map<string, AiFailure>();
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: AiRunnerDeps) {}

  state(): AiState {
    return { job: this.running?.job ?? null, failures: [...this.failures.values()] };
  }

  isBusy(): boolean {
    return this.running !== null || this.starting;
  }

  /** «Итоги встречи» и «Обновить»: итоги по запросу для ИИ из настроек. */
  summarize(meetingId: string): Promise<AiStartResult> {
    return this.start(meetingId, 'summary', null);
  }

  /** «Спросить»: ответ видит только встречу и этот вопрос (без прошлых вопросов и итогов). */
  ask(meetingId: string, question: string): Promise<AiStartResult> {
    return this.start(meetingId, 'question', question.trim());
  }

  /** «Остановить»: написанное сохраняется с пометкой «остановлено». */
  stop(): void {
    this.running?.controller.abort();
  }

  /** Человек ушёл со встречи — её прошлая неудача больше не показывается. */
  dismiss(meetingId: string): void {
    if (this.failures.delete(meetingId)) this.emit(true);
  }

  /** Встречу удаляют: её запрос останавливается без сохранения, неудача забывается. */
  forget(meetingId: string): void {
    const running = this.running;
    if (running?.job.meetingId === meetingId) {
      running.discard = true;
      running.controller.abort();
    }
    this.dismiss(meetingId);
  }

  /** Завершить движок (перед удалением модели: файл модели открыт, пока он работает). */
  stopEngine(): Promise<void> {
    return this.deps.engine.stop();
  }

  /** Выход из программы: идущий ответ сохраняется как остановленный (ждём до 2 с), движок завершается. */
  async disposeForQuit(): Promise<void> {
    const running = this.running;
    if (running) {
      running.controller.abort();
      await Promise.race([running.done, sleep(QUIT_SAVE_MS)]);
    }
    await this.deps.engine.stop();
  }

  private async start(meetingId: string, kind: AiJobKind, question: string | null): Promise<AiStartResult> {
    if (this.isBusy()) return 'busy';
    this.starting = true;
    try {
      const model = await this.deps.model();
      if (!model) return 'no-model';
      // Нет текста или он не читается — ошибка уходит в окно (как у «Скопировать всё»).
      const doc = await loadExportDoc(this.deps.libraryDir(), meetingId);
      const task = question ?? summaryTask(await this.deps.aiPrompt());
      const info = llmModel(model.id);
      const running: Running = {
        job: { meetingId, meetingTitle: doc.title, kind, question, modelTitle: info.title, stage: 'loading', text: '' },
        controller: new AbortController(),
        discard: false,
        done: Promise.resolve(),
      };
      this.failures.delete(meetingId);
      this.running = running;
      running.done = this.run(running, { model, info, doc, task });
      return 'started';
    } finally {
      this.starting = false;
      this.emit(true);
    }
  }

  private async run(running: Running, input: JobInput): Promise<void> {
    const signal = running.controller.signal;
    const kind = running.job.kind;
    try {
      const session = await this.deps.engine.ready({ path: input.model.path, contextTokens: input.info.contextTokens }, signal);
      this.update(running, { stage: 'reading' }, true);
      const messages = aiMessages(meetingText(input.doc), input.task);
      const tokens = await session.countTokens(messages.map((m) => m.content).join('\n'), signal);
      if (!fitsWindow(tokens, input.info.contextTokens)) throw new LlmError('too-long', `${tokens} «кусочков»`);
      await session.streamChat(
        { messages, maxTokens: kind === 'summary' ? SUMMARY_MAX_TOKENS : QUESTION_MAX_TOKENS },
        {
          signal,
          onText: (text) => this.update(running, { stage: 'writing', text: running.job.text + text }, running.job.stage !== 'writing'),
        },
      );
      if (running.job.text.trim() === '') throw new LlmError('engine', 'модель ответила пустым текстом');
      await this.save(running, input, 'done');
    } catch (err) {
      if (signal.aborted) {
        // Остановили: написанное сохраняется; встречу удаляют — нет.
        if (!running.discard && running.job.text.trim() !== '') await this.save(running, input, 'stopped');
      } else if (!running.discard) {
        this.fail(running, err, input.info.title);
      }
    } finally {
      this.deps.engine.idle();
      this.running = null;
      this.emit(true);
    }
  }

  private fail(running: Running, err: unknown, modelTitle: string): void {
    const tooLong = err instanceof LlmError && err.kind === 'too-long';
    if (tooLong) this.deps.logger.warn(`Встреча не поместилась в модель ${modelTitle}`, err);
    else this.deps.logger.error('Модель для итогов не ответила', err);
    const { meetingId, kind, question } = running.job;
    this.failures.set(meetingId, {
      meetingId,
      kind,
      question,
      failure: tooLong ? 'too-long' : 'engine',
      message: tooLong ? aiTexts.tooLong(modelTitle) : aiTexts.engine,
      text: null,
    });
  }

  private async save(running: Running, input: JobInput, status: 'done' | 'stopped'): Promise<void> {
    const { meetingId, kind, question, text } = running.job;
    const common = { model: input.model.id, modelTitle: input.info.title, createdAt: this.deps.now().toISOString(), status };
    try {
      await updateAi(
        this.deps.libraryDir(),
        meetingId,
        (doc) =>
          kind === 'summary'
            ? { ...doc, summary: { text, ...common, sourceHash: sourceHash(input.doc) } }
            : { ...doc, questions: [...doc.questions, { id: randomUUID(), question: question ?? '', answer: text, ...common }] },
        this.deps.logger,
      );
    } catch (err) {
      if (running.discard) return;
      this.deps.logger.warn('Итоги не сохранились', err);
      this.failures.set(meetingId, { meetingId, kind, question, failure: 'save', message: aiTexts.notSaved(kind, err), text });
      return;
    }
    this.deps.saved(meetingId);
  }

  private update(running: Running, patch: Partial<AiJob>, force: boolean): void {
    running.job = { ...running.job, ...patch };
    if (this.running === running) this.emit(force);
  }

  /** Ход ответа — не чаще AI_EMIT_MS; последний кусок всё равно дойдёт (отложенной отправкой). */
  private emit(force: boolean): void {
    const now = Date.now();
    const pause = this.deps.emitMs ?? AI_EMIT_MS;
    if (!force && now - this.lastEmit < pause) {
      this.emitTimer ??= setTimeout(() => {
        this.emitTimer = null;
        this.emit(true);
      }, pause - (now - this.lastEmit));
      return;
    }
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.lastEmit = now;
    try {
      this.deps.changed(this.state());
    } catch (err) {
      this.deps.logger.error('Итоги: сбой обработчика состояния', err);
    }
  }
}
```

**Создать `src/main/ai/ai-store.ts`:**

```ts
// Файл итогов встречи ai.json (решения Плана 9, §5): чтение, изменение по очереди с блокировкой и атомарная запись —
// как у transcript.json. Испорченный файл не перезаписывается, пока человек сам не сделает новые итоги или не спросит.
import { join } from 'node:path';
import { AiDocSchema, EMPTY_AI_DOC, type AiDoc } from '../../shared/ai';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { withFileLock } from '../library/file-lock';
import { meetingDir } from '../library/library';
import type { Logger } from '../logger';

export const AI_FILE = 'ai.json';

export const aiPath = (libraryDir: string, id: string): string => join(meetingDir(libraryDir, id), AI_FILE);

export interface AiRead {
  doc: AiDoc;
  /** Файл есть, но не прочитался (испорчен) — doc пустой. */
  broken: boolean;
}

/** Итоги встречи; нет файла — пусто. Ошибка системы (файл занят, нет прав) — исключение. */
export async function readAi(libraryDir: string, id: string): Promise<AiRead> {
  const result = await readJsonFile(aiPath(libraryDir, id), AiDocSchema);
  if (result.ok) return { doc: result.value, broken: false };
  return { doc: EMPTY_AI_DOC, broken: result.reason !== 'missing' };
}

/**
 * Прочитать → изменить → записать, по очереди с другими изменениями этого файла. Испорченный файл заменяется (в
 * журнал — только причина: в файле текст встречи). change вернул тот же объект — файл не перезаписывается.
 */
export function updateAi(
  libraryDir: string,
  id: string,
  change: (doc: AiDoc) => AiDoc,
  logger: Pick<Logger, 'warn'>,
): Promise<AiDoc> {
  const file = aiPath(libraryDir, id);
  return withFileLock(file, async () => {
    const current = await readJsonFile(file, AiDocSchema);
    if (!current.ok && current.reason !== 'missing') {
      logger.warn(`Итоги встречи ${id} не прочитались (${current.reason}) — файл заменяется новыми`);
    }
    const doc = current.ok ? current.value : EMPTY_AI_DOC;
    const next = change(doc);
    if (next === doc) return doc;
    const parsed = AiDocSchema.parse(next);
    await writeJsonAtomic(file, parsed);
    return parsed;
  });
}
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

async function loadDoc(libraryDir: string, meetingId: string): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
```

**на:**

```ts
/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

/** Встреча для выгрузки и для модели итогов: текст с правками и именами спикеров; нет текста — понятная ошибка. */
export async function loadExportDoc(libraryDir: string, meetingId: string): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

/** «Скопировать для ИИ»: запрос и текст встречи — только простым текстом (чаты вставляют его без лишнего оформления). */
export async function copyForAi(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  const prompt = resolveAiPrompt(await deps.aiPrompt());
  await deps.writeClipboard({ text: withAiPrompt(prompt, toPlainText(doc)) });
}
```

**на:**

```ts
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

/** «Скопировать для ИИ»: запрос и текст встречи — только простым текстом (чаты вставляют его без лишнего оформления). */
export async function copyForAi(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId);
  const prompt = resolveAiPrompt(await deps.aiPrompt());
  await deps.writeClipboard({ text: withAiPrompt(prompt, toPlainText(doc)) });
}
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts

/** Окно сохранения → файл. Не атомарно: файл, открытый в Word, даёт понятное «файл занят другой программой». */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  const dir = await startDir(deps);
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
```

**на:**

```ts

/** Окно сохранения → файл. Не атомарно: файл, открытый в Word, даёт понятное «файл занят другой программой». */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId);
  const dir = await startDir(deps);
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
```

**В `src/main/index.ts` заменить:**

```ts
  type RecorderCommandChannel,
  type RecorderCommandContract,
} from '../shared/ipc';
import { macMenuTemplate } from './app-menu';
import { resolveFfmpegPath } from './audio/ffmpeg';
import { meetingsNeedingMix, Mixer } from './audio/mixer';
```

**на:**

```ts
  type RecorderCommandChannel,
  type RecorderCommandContract,
} from '../shared/ipc';
import { currentAiModel } from './ai/ai-models';
import { AiRunner, llamaEngine } from './ai/ai-runner';
import { llamaDir, LlamaServer, llamaServerFile, type LlamaCommand } from './ai/llama-server';
import { macMenuTemplate } from './app-menu';
import { resolveFfmpegPath } from './audio/ffmpeg';
import { meetingsNeedingMix, Mixer } from './audio/mixer';
```

**В `src/main/index.ts` заменить:**

```ts
import { FakeModelStore } from './models/fake-model-store';
import { ModelManager, type ModelStore } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
import { applyPermissionPolicy } from './permissions';
```

**на:**

```ts
import { FakeModelStore } from './models/fake-model-store';
import { ModelManager, type ModelStore } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
import { isModelGroupId, llmFilePath } from './models/registry';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
import { applyPermissionPolicy } from './permissions';
```

**В `src/main/index.ts` заменить:**

```ts
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
/** Только для автотестов: «Корзина» — обычная папка (на машинах CI настоящей Корзины может не быть). */
```

**на:**

```ts
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Только для автотестов: модели, уже «скачанные» в поддельном хранилище (через запятую). */
const fakeInstalled = (process.env.TEXTMEET_TEST_INSTALLED ?? '').split(',').filter(isModelGroupId);
/** Только для автотестов: поддельный llama-server (скрипт src/test-support/fake-llama-server.mjs) вместо настоящего. */
const fakeLlm = process.env.TEXTMEET_TEST_LLM;
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
/** Только для автотестов: «Корзина» — обычная папка (на машинах CI настоящей Корзины может не быть). */
```

**В `src/main/index.ts` заменить:**

```ts
let recorderReady = false;
let transcription: TranscriptionQueue | null = null;
let importer: Importer | null = null;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
let recorderBroken = false;
const recorderCrashes: number[] = [];
```

**на:**

```ts
let recorderReady = false;
let transcription: TranscriptionQueue | null = null;
let importer: Importer | null = null;
let aiRunner: AiRunner | null = null;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
let recorderBroken = false;
const recorderCrashes: number[] = [];
```

**В `src/main/index.ts` заменить:**

```ts
  logger.info('TextMeet завершает работу');
  // Недоделанные встречи из файлов убираются: исходные файлы на месте, добавить их можно снова.
  await importer?.disposeForQuit().catch((err: unknown) => logger.error('Импорт не остановился перед выходом', err));
  await logger.flush();
  // Только когда выход точно состоится: остановленная очередь молча пропускала бы новые встречи.
  // Встречи остаются «в очереди» / «расшифровывается» и продолжатся при следующем запуске.
```

**на:**

```ts
  logger.info('TextMeet завершает работу');
  // Недоделанные встречи из файлов убираются: исходные файлы на месте, добавить их можно снова.
  await importer?.disposeForQuit().catch((err: unknown) => logger.error('Импорт не остановился перед выходом', err));
  // Идущий ответ модели сохраняется как остановленный, движок итогов завершается.
  await aiRunner?.disposeForQuit().catch((err: unknown) => logger.error('Итоги не остановились перед выходом', err));
  await logger.flush();
  // Только когда выход точно состоится: остановленная очередь молча пропускала бы новые встречи.
  // Встречи остаются «в очереди» / «расшифровывается» и продолжатся при следующем запуске.
```

**В `src/main/index.ts` заменить:**

```ts
    override: process.env.TEXTMEET_MODELS_DIR,
  });
  const models: ModelStore = fakeAsr
    ? new FakeModelStore(modelsDir, fakeDownloadStepMs)
    : new ModelManager({ root: modelsDir, logger, freeBytes: freeDiskBytes });
  const catalogDownloads = new CatalogDownloads({
    models,
```

**на:**

```ts
    override: process.env.TEXTMEET_MODELS_DIR,
  });
  const models: ModelStore = fakeAsr
    ? new FakeModelStore(modelsDir, fakeDownloadStepMs, fakeInstalled)
    : new ModelManager({ root: modelsDir, logger, freeBytes: freeDiskBytes });
  const catalogDownloads = new CatalogDownloads({
    models,
```

**В `src/main/index.ts` заменить:**

```ts
    changed: () => sendToMain(IPC.modelsChanged),
    now: () => Date.now(),
  });
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger),
    models,
```

**на:**

```ts
    changed: () => sendToMain(IPC.modelsChanged),
    now: () => Date.now(),
  });
  const llamaCommand = (): LlamaCommand =>
    fakeLlm
      ? { file: process.execPath, args: [fakeLlm], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
      : {
          file: join(
            llamaDir({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }),
            llamaServerFile(process.platform),
          ),
          args: [],
        };
  const ai = new AiRunner({
    libraryDir,
    model: async () => {
      const { selected } = await currentAiModel({ models, settings, logger });
      return selected && { id: selected, path: llmFilePath(models.root, selected) };
    },
    engine: llamaEngine(new LlamaServer({ command: llamaCommand, logger })),
    aiPrompt: () => settings.settled().then(() => settings.get().aiPrompt),
    now: () => new Date(),
    logger,
    changed: (state) => sendToMain(IPC.aiState, state),
    saved: (id) => sendToMain(IPC.aiChanged, id),
  });
  aiRunner = ai;
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger),
    models,
```

**В `src/main/index.ts` заменить:**

```ts
    },
    transcription: queue,
    models,
    downloads: catalogDownloads,
  });
```

**на:**

```ts
    },
    transcription: queue,
    models,
    ai,
    downloads: catalogDownloads,
  });
```

**В `src/main/index.ts` заменить:**

```ts
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    void importer?.stop();
    onSystemEnding();
  });
  windowsCreated = true;
```

**на:**

```ts
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    void importer?.stop();
    void aiRunner?.disposeForQuit();
    onSystemEnding();
  });
  windowsCreated = true;
```

**В `src/main/ipc.ts` заменить:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { AiPromptSchema, storedAiPrompt } from '../shared/ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { LLM_MODEL_IDS, type AiModelsState } from '../shared/llm-models';
```

**на:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { AI_QUESTION_MAX } from '../shared/ai';
import { AiPromptSchema, storedAiPrompt } from '../shared/ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { LLM_MODEL_IDS, type AiModelsState } from '../shared/llm-models';
```

**В `src/main/ipc.ts` заменить:**

```ts
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { CatalogModelId, ModelsState, TranscriptionProgress } from '../shared/transcription';
import { currentAiModel } from './ai/ai-models';
import { copyForAi, copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
```

**на:**

```ts
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { CatalogModelId, ModelsState, TranscriptionProgress } from '../shared/transcription';
import { aiView, deleteQuestion } from './ai/ai-meeting';
import { currentAiModel } from './ai/ai-models';
import type { AiRunner } from './ai/ai-runner';
import { copyForAi, copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
```

**В `src/main/ipc.ts` заменить:**

```ts
import { TRANSCRIPTION_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { systemSettingsUrl, transcriptionTexts } from './texts';

export interface IpcDeps {
  settings: SettingsStore;
```

**на:**

```ts
import { TRANSCRIPTION_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { aiTexts, systemSettingsUrl, transcriptionTexts } from './texts';

export interface IpcDeps {
  settings: SettingsStore;
```

**В `src/main/ipc.ts` заменить:**

```ts
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  downloads: {
    start(id: CatalogModelId): void;
    cancel(id: CatalogModelId): Promise<void>;
```

**на:**

```ts
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  ai: Pick<AiRunner, 'state' | 'isBusy' | 'summarize' | 'ask' | 'stop' | 'dismiss' | 'forget' | 'stopEngine'>;
  downloads: {
    start(id: CatalogModelId): void;
    cancel(id: CatalogModelId): Promise<void>;
```

**В `src/main/ipc.ts` заменить:**

```ts
  transcriptVersion: z.iso.datetime(),
});

const SaveMeetingSchema = z.object({ meetingId: MeetingIdSchema, format: z.enum(['docx', 'txt']) });
/** Пути файлов для импорта: полные, не больше 1000 (больше 100 программа отклонит с понятной причиной). */
const ImportPathsSchema = z
```

**на:**

```ts
  transcriptVersion: z.iso.datetime(),
});

const AskSchema = z.object({ meetingId: MeetingIdSchema, question: z.string().trim().min(1).max(AI_QUESTION_MAX) });
const DeleteQuestionSchema = z.object({ meetingId: MeetingIdSchema, questionId: z.string().min(1).max(100) });

const SaveMeetingSchema = z.object({ meetingId: MeetingIdSchema, format: z.enum(['docx', 'txt']) });
/** Пути файлов для импорта: полные, не больше 1000 (больше 100 программа отклонит с понятной причиной). */
const ImportPathsSchema = z
```

**В `src/main/ipc.ts` заменить:**

```ts
  // Имя папки, а не только прочитанная встреча: удалить можно и папку, которую не удалось прочитать.
  handle(IPC.deleteMeeting, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    try {
      await shown('Не удалось удалить встречу', () => deleteMeeting(deps.deletion, id))();
    } catch (err) {
```

**на:**

```ts
  // Имя папки, а не только прочитанная встреча: удалить можно и папку, которую не удалось прочитать.
  handle(IPC.deleteMeeting, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    // Ответ модели по этой встрече останавливается без сохранения: папка уходит в Корзину.
    deps.ai.forget(id);
    try {
      await shown('Не удалось удалить встречу', () => deleteMeeting(deps.deletion, id))();
    } catch (err) {
```

**В `src/main/ipc.ts` заменить:**

```ts

  const aiModelsState = async (): Promise<AiModelsState> => {
    const { groups, selected } = await currentAiModel(deps);
    return buildAiModelsState(groups, selected, deps.downloads.snapshot());
  };

  handle(IPC.getAiModels, () => aiModelsState());
```

**на:**

```ts

  const aiModelsState = async (): Promise<AiModelsState> => {
    const { groups, selected } = await currentAiModel(deps);
    return buildAiModelsState(groups, selected, deps.downloads.snapshot(), deps.ai.isBusy());
  };

  handle(IPC.getAiModels, () => aiModelsState());
```

**В `src/main/ipc.ts` заменить:**

```ts
  handle(IPC.deleteAiModel, async (arg) => {
    const id = LlmModelIdSchema.parse(arg);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    try {
      await deps.models.remove(id);
    } catch (err) {
```

**на:**

```ts
  handle(IPC.deleteAiModel, async (arg) => {
    const id = LlmModelIdSchema.parse(arg);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    if (deps.ai.isBusy()) throw new Error(aiTexts.modelBusy);
    // Пока движок работает, файл модели открыт — Windows не даст его удалить.
    await deps.ai.stopEngine();
    try {
      await deps.models.remove(id);
    } catch (err) {
```

**В `src/main/ipc.ts` заменить:**

```ts
    return aiModelsState();
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
  onRecorder(IPC.recorderStarted, (message) => deps.controller.onStarted(message));
  onRecorder(IPC.recorderStartFailed, (message) => deps.controller.onStartFailed(message));
```

**на:**

```ts
    return aiModelsState();
  });

  handle(IPC.getAi, (arg) => {
    const id = MeetingIdSchema.parse(arg);
    return shown('Не удалось прочитать итоги встречи', () => aiView(deps.libraryDir(), id))();
  });

  handle(IPC.getAiState, () => deps.ai.state());

  handle(IPC.summarize, (arg) => {
    const id = MeetingIdSchema.parse(arg);
    return shown('Не удалось прочитать встречу', () => deps.ai.summarize(id))();
  });

  handle(IPC.askAi, (arg) => {
    const request = AskSchema.parse(arg);
    return shown('Не удалось прочитать встречу', () => deps.ai.ask(request.meetingId, request.question))();
  });

  handle(IPC.stopAi, () => deps.ai.stop());

  handle(IPC.dismissAiFailure, (arg) => deps.ai.dismiss(MeetingIdSchema.parse(arg)));

  handle(IPC.deleteAiQuestion, (arg) => {
    const request = DeleteQuestionSchema.parse(arg);
    return shown('Не удалось удалить вопрос', () =>
      deleteQuestion(deps.libraryDir(), request.meetingId, request.questionId, deps.logger),
    )();
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
  onRecorder(IPC.recorderStarted, (message) => deps.controller.onStarted(message));
  onRecorder(IPC.recorderStartFailed, (message) => deps.controller.onStartFailed(message));
```

**В `src/main/models/fake-model-store.ts` заменить:**

```ts
const STEPS = 5;

export class FakeModelStore implements ModelStore {
  private readonly installed = new Set<ModelGroupId>();

  constructor(
    readonly root: string,
    private readonly stepMs: number,
  ) {}

  async ensure(groups: readonly ModelGroupId[], options: EnsureOptions = {}): Promise<void> {
    const missing = groups.filter((g) => !this.installed.has(g));
```

**на:**

```ts
const STEPS = 5;

export class FakeModelStore implements ModelStore {
  private readonly installed: Set<ModelGroupId>;

  /** installed — модели, «скачанные» с самого начала (TEXTMEET_TEST_INSTALLED). */
  constructor(
    readonly root: string,
    private readonly stepMs: number,
    installed: readonly ModelGroupId[] = [],
  ) {
    this.installed = new Set(installed);
  }

  async ensure(groups: readonly ModelGroupId[], options: EnsureOptions = {}): Promise<void> {
    const missing = groups.filter((g) => !this.installed.has(g));
```

**В `src/main/models/models-state.ts` заменить:**

```ts
  groups: Groups,
  selected: LlmModelId | null,
  downloads: CatalogDownloadsSnapshot,
): AiModelsState {
  return {
    selected,
    models: LLM_MODEL_IDS.map((id) => ({ id, ...stateOf(groups, id) })),
    download: downloads.download,
    downloadError: failureOf(groups, downloads, isLlmModelId),
  };
}
```

**на:**

```ts
  groups: Groups,
  selected: LlmModelId | null,
  downloads: CatalogDownloadsSnapshot,
  busy: boolean,
): AiModelsState {
  return {
    selected,
    models: LLM_MODEL_IDS.map((id) => ({ id, ...stateOf(groups, id) })),
    download: downloads.download,
    downloadError: failureOf(groups, downloads, isLlmModelId),
    busy,
  };
}
```

**В `src/main/models/registry.ts` заменить:**

```ts
const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/6888903da215c7735f51101d939f3bfa679fb2b8';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/** Группы расшифровки: модели в порядке каталога, затем общая группа. */
export const TRANSCRIPTION_GROUP_IDS = [...ASR_MODEL_IDS, 'voices'] as const satisfies readonly ModelGroupId[];
```

**на:**

```ts
const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/6888903da215c7735f51101d939f3bfa679fb2b8';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

export const isModelGroupId = (value: unknown): value is ModelGroupId =>
  typeof value === 'string' && (MODEL_GROUP_IDS as readonly string[]).includes(value);

/** Группы расшифровки: модели в порядке каталога, затем общая группа. */
export const TRANSCRIPTION_GROUP_IDS = [...ASR_MODEL_IDS, 'voices'] as const satisfies readonly ModelGroupId[];
```

**В `src/main/texts.ts` заменить:**

```ts
// Тексты для человека, которые показывает main: уведомления, системные окна, причины ошибок записи.
import { formatBytes, formatDurationShort } from '../shared/format';
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { knownFsReason } from './fs/fs-errors';
import { DownloadError } from './models/download';
import { MODELS_ENSURING } from './models/model-manager';
import { WORKER_REFUSALS } from './transcription/protocol';
```

**на:**

```ts
// Тексты для человека, которые показывает main: уведомления, системные окна, причины ошибок записи.
import { formatBytes, formatDurationShort } from '../shared/format';
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { humanFsReason, knownFsReason } from './fs/fs-errors';
import { DownloadError } from './models/download';
import { MODELS_ENSURING } from './models/model-manager';
import { WORKER_REFUSALS } from './transcription/protocol';
```

**В `src/main/texts.ts` заменить:**

```ts
export const aiTexts = {
  /** Модель для итогов не скачалась — причина для карточки каталога. */
  download: (err: unknown): string => downloadText(err, AI_WORDS),
};
```

**на:**

```ts
export const aiTexts = {
  /** Модель для итогов не скачалась — причина для карточки каталога. */
  download: (err: unknown): string => downloadText(err, AI_WORDS),
  /** Движок не запустился, упал или не ответил (подробности — в журнале). */
  engine:
    'Модель не смогла ответить — подробности в журнале. Возможно, не хватило памяти: закройте тяжёлые программы и попробуйте снова.',
  tooLong: (modelTitle: string): string =>
    `Встреча слишком длинная для ${modelTitle}. Выберите другую модель в настройках ИИ или воспользуйтесь «Скопировать для ИИ».`,
  /** Ответ готов, но ai.json не записался — текст остаётся в блоке до ухода со встречи. */
  notSaved: (kind: 'summary' | 'question', err: unknown): string =>
    `Не удалось сохранить ${kind === 'summary' ? 'итоги' : 'ответ'}: ${humanFsReason(err)}`,
  modelBusy: 'Модель нельзя удалить, пока она отвечает.',
};
```

**В `src/preload/index.ts` заменить:**

```ts
  cancelAiModelDownload: (id) => invoke(IPC.cancelAiModelDownload, id),
  selectAiModel: (id) => invoke(IPC.selectAiModel, id),
  deleteAiModel: (id) => invoke(IPC.deleteAiModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  copyForAi: (meetingId) => invoke(IPC.copyForAi, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
```

**на:**

```ts
  cancelAiModelDownload: (id) => invoke(IPC.cancelAiModelDownload, id),
  selectAiModel: (id) => invoke(IPC.selectAiModel, id),
  deleteAiModel: (id) => invoke(IPC.deleteAiModel, id),
  getAi: (meetingId) => invoke(IPC.getAi, meetingId),
  getAiState: () => invoke(IPC.getAiState),
  summarize: (meetingId) => invoke(IPC.summarize, meetingId),
  askAi: (request) => invoke(IPC.askAi, request),
  stopAi: () => invoke(IPC.stopAi),
  deleteAiQuestion: (request) => invoke(IPC.deleteAiQuestion, request),
  dismissAiFailure: (meetingId) => invoke(IPC.dismissAiFailure, meetingId),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  copyForAi: (meetingId) => invoke(IPC.copyForAi, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
```

**В `src/preload/index.ts` заменить:**

```ts
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onModelsChanged: (listener) => subscribe(IPC.modelsChanged, () => listener()),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
  onImportProgress: (listener) => subscribe(IPC.importProgress, listener),
  onImportFailed: (listener) => subscribe(IPC.importFailed, listener),
};
```

**на:**

```ts
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onModelsChanged: (listener) => subscribe(IPC.modelsChanged, () => listener()),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
  onAiState: (listener) => subscribe(IPC.aiState, listener),
  onAiChanged: (listener) => subscribe(IPC.aiChanged, listener),
  onImportProgress: (listener) => subscribe(IPC.importProgress, listener),
  onImportFailed: (listener) => subscribe(IPC.importFailed, listener),
};
```

**В `src/renderer/main/AiModelSettings.tsx` заменить:**

```tsx
      error={failed ? (state.downloadError?.message ?? null) : null}
      downloadButton={downloadButton(info.title, failed)}
      otherDownload={state.download !== null && !download}
      deleteDisabled={state.download !== null}
      note={null}
      onSelect={() => run(() => window.textmeet.selectAiModel(id))}
      onDownload={() => run(() => window.textmeet.downloadAiModel(id))}
```

**на:**

```tsx
      error={failed ? (state.downloadError?.message ?? null) : null}
      downloadButton={downloadButton(info.title, failed)}
      otherDownload={state.download !== null && !download}
      deleteDisabled={state.busy || state.download !== null}
      note={null}
      onSelect={() => run(() => window.textmeet.selectAiModel(id))}
      onDownload={() => run(() => window.textmeet.downloadAiModel(id))}
```

**В `src/renderer/main/AiModelSettings.tsx` заменить:**

```tsx
  );
}

/** Вкладка «ИИ» → «Модель для итогов»: каталог, как во вкладке «Расшифровка». */
export function AiModelSettings() {
  const { state, error, run } = useModelCatalog<AiModelsState>(
    () => window.textmeet.getAiModels(),
    (reload) => window.textmeet.onModelsChanged(reload),
  );
  const sections = state && aiCatalogSections(state);
  const group = (title: string, ids: LlmModelId[]) =>
    state &&
```

**на:**

```tsx
  );
}

/** Перечитывать каталог: скачивание продвинулось, модель начала или закончила отвечать (удалять её нельзя). */
function watchAiModels(reload: () => void): () => void {
  const unsubscribeModels = window.textmeet.onModelsChanged(reload);
  let busy: boolean | null = null;
  const unsubscribeAi = window.textmeet.onAiState((state) => {
    const nowBusy = state.job !== null;
    if (nowBusy !== busy) reload();
    busy = nowBusy;
  });
  return () => {
    unsubscribeModels();
    unsubscribeAi();
  };
}

/** Вкладка «ИИ» → «Модель для итогов»: каталог, как во вкладке «Расшифровка». */
export function AiModelSettings() {
  const { state, error, run } = useModelCatalog<AiModelsState>(() => window.textmeet.getAiModels(), watchAiModels);
  const sections = state && aiCatalogSections(state);
  const group = (title: string, ids: LlmModelId[]) =>
    state &&
```

**Создать `src/shared/ai.ts`:**

```ts
// Итоги встречи и свои вопросы (решения Плана 9, §2.2, §5): файл ai.json в папке встречи и что main сообщает окну о
// работе модели. Схемы (zod) нужны только main; окно и preload берут отсюда типы.
import { z } from 'zod';

/** Свой вопрос к встрече — не длиннее. */
export const AI_QUESTION_MAX = 1000;

/** done — ответ дописан; stopped — человек нажал «Остановить» (или вышел из программы), написанное сохранено. */
export const AiAnswerStatusSchema = z.enum(['done', 'stopped']);
export type AiAnswerStatus = z.infer<typeof AiAnswerStatusSchema>;

const answerFields = {
  /** Модель из каталога (id) и её название — название показывается, даже если модель потом убрали из каталога. */
  model: z.string().max(100),
  modelTitle: z.string().max(200),
  createdAt: z.iso.datetime(),
  status: AiAnswerStatusSchema.default('done'),
};

export const AiSummarySchema = z.object({
  text: z.string(),
  ...answerFields,
  /** SHA-256 текста встречи, который видела модель: не совпал с нынешним — «Текст встречи меняли после итогов». */
  sourceHash: z.string().max(100),
});

export const AiQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().max(AI_QUESTION_MAX),
  answer: z.string(),
  ...answerFields,
});

export const AiDocSchema = z.object({
  version: z.literal(1).default(1),
  summary: AiSummarySchema.nullable().default(null),
  /** От старых к новым. */
  questions: z.array(AiQuestionSchema).default([]),
});

export type AiSummary = z.infer<typeof AiSummarySchema>;
export type AiQuestion = z.infer<typeof AiQuestionSchema>;
export type AiDoc = z.infer<typeof AiDocSchema>;

export const EMPTY_AI_DOC: AiDoc = { version: 1, summary: null, questions: [] };

/** Итоги и вопросы встречи глазами окна. */
export interface AiMeetingView {
  doc: AiDoc;
  /** ai.json не прочитался (испорчен): блок пуст, файл не трогаем, пока не сделают новые итоги или не спросят. */
  broken: boolean;
  /** Текст встречи меняли после итогов (правки, имена спикеров, «Расшифровать заново»). */
  stale: boolean;
}

export type AiJobKind = 'summary' | 'question';
/** loading — модель загружается в память («Готовим модель…»), reading — читает встречу, writing — пишет. */
export type AiJobStage = 'loading' | 'reading' | 'writing';

/** Запрос, который модель выполняет сейчас (один на всю программу). */
export interface AiJob {
  meetingId: string;
  meetingTitle: string;
  kind: AiJobKind;
  /** Вопрос; у итогов — null. */
  question: string | null;
  modelTitle: string;
  stage: AiJobStage;
  /** Написанное к этому моменту. */
  text: string;
}

/** Почему запрос не удался: встреча не поместилась, модель не ответила, ответ не сохранился. */
export type AiFailureKind = 'too-long' | 'engine' | 'save';

export interface AiFailure {
  meetingId: string;
  kind: AiJobKind;
  question: string | null;
  failure: AiFailureKind;
  /** Причина для человека. */
  message: string;
  /** Ответ, который не сохранился, — виден в блоке до ухода со встречи; в остальных случаях null. */
  text: string | null;
}

export interface AiState {
  job: AiJob | null;
  /** Последняя неудача по встрече — до следующего запроса по ней или до ухода со встречи. */
  failures: AiFailure[];
}

/** Ответ на «Итоги встречи» и «Спросить»: started — запрос пошёл; no-model — модель не скачана; busy — модель занята. */
export type AiStartResult = 'started' | 'no-model' | 'busy';

export interface AskRequest {
  meetingId: string;
  question: string;
}

export interface DeleteQuestionRequest {
  meetingId: string;
  questionId: string;
}
```

**В `src/shared/ipc.ts` заменить:**

```ts
// preload и main пользуются типизированными обёртками над этими таблицами, поэтому расхождение ловит
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { ImportFailedEvent, ImportProgress, ImportResult } from './import';
import type { AiModelsState, LlmModelId } from './llm-models';
```

**на:**

```ts
// preload и main пользуются типизированными обёртками над этими таблицами, поэтому расхождение ловит
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AiMeetingView, AiStartResult, AiState, AskRequest, DeleteQuestionRequest } from './ai';
import type { AsrModelId } from './asr-models';
import type { ImportFailedEvent, ImportProgress, ImportResult } from './import';
import type { AiModelsState, LlmModelId } from './llm-models';
```

**В `src/shared/ipc.ts` заменить:**

```ts
  cancelAiModelDownload: 'ai:cancel-download',
  selectAiModel: 'ai:select-model',
  deleteAiModel: 'ai:delete-model',
  copyMeeting: 'export:copy',
  copyForAi: 'export:copy-for-ai',
  saveMeeting: 'export:save',
```

**на:**

```ts
  cancelAiModelDownload: 'ai:cancel-download',
  selectAiModel: 'ai:select-model',
  deleteAiModel: 'ai:delete-model',
  getAi: 'ai:get',
  getAiState: 'ai:get-state',
  summarize: 'ai:summarize',
  askAi: 'ai:ask',
  stopAi: 'ai:stop',
  deleteAiQuestion: 'ai:delete-question',
  dismissAiFailure: 'ai:dismiss-failure',
  copyMeeting: 'export:copy',
  copyForAi: 'export:copy-for-ai',
  saveMeeting: 'export:save',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  importProgress: 'import:progress',
  /** Звук файла не скопировался: недоделанная встреча убрана. */
  importFailed: 'import:failed',
```

**на:**

```ts
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  /** Модель начала, продолжила или закончила отвечать (не чаще 10 раз в секунду). */
  aiState: 'ai:state',
  /** ai.json встречи записан — перечитать итоги. */
  aiChanged: 'ai:changed',
  importProgress: 'import:progress',
  /** Звук файла не скопировался: недоделанная встреча убрана. */
  importFailed: 'import:failed',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.cancelAiModelDownload]: { arg: LlmModelId; result: AiModelsState };
  [IPC.selectAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.deleteAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.copyForAi]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
```

**на:**

```ts
  [IPC.cancelAiModelDownload]: { arg: LlmModelId; result: AiModelsState };
  [IPC.selectAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.deleteAiModel]: { arg: LlmModelId; result: AiModelsState };
  [IPC.getAi]: { arg: string; result: AiMeetingView };
  [IPC.getAiState]: { arg: void; result: AiState };
  [IPC.summarize]: { arg: string; result: AiStartResult };
  [IPC.askAi]: { arg: AskRequest; result: AiStartResult };
  [IPC.stopAi]: { arg: void; result: void };
  [IPC.deleteAiQuestion]: { arg: DeleteQuestionRequest; result: AiMeetingView };
  [IPC.dismissAiFailure]: { arg: string; result: void };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.copyForAi]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.modelsChanged]: void;
  [IPC.showMeeting]: string;
  [IPC.importProgress]: ImportProgress[];
  [IPC.importFailed]: ImportFailedEvent;
}
```

**на:**

```ts
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.modelsChanged]: void;
  [IPC.showMeeting]: string;
  [IPC.aiState]: AiState;
  [IPC.aiChanged]: string;
  [IPC.importProgress]: ImportProgress[];
  [IPC.importFailed]: ImportFailedEvent;
}
```

**В `src/shared/ipc.ts` заменить:**

```ts
  /** «Выбрать»: модель для итогов (только скачанная). */
  selectAiModel(id: LlmModelId): Promise<AiModelsState>;
  deleteAiModel(id: LlmModelId): Promise<AiModelsState>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Скопировать для ИИ»: запрос из настроек и текст встречи — в буфер обмена простым текстом. */
```

**на:**

```ts
  /** «Выбрать»: модель для итогов (только скачанная). */
  selectAiModel(id: LlmModelId): Promise<AiModelsState>;
  deleteAiModel(id: LlmModelId): Promise<AiModelsState>;
  /** Итоги и вопросы встречи (ai.json). */
  getAi(meetingId: string): Promise<AiMeetingView>;
  getAiState(): Promise<AiState>;
  /** «Итоги встречи», «Обновить». */
  summarize(meetingId: string): Promise<AiStartResult>;
  /** «Спросить». */
  askAi(request: AskRequest): Promise<AiStartResult>;
  /** «Остановить»: написанное сохраняется с пометкой «остановлено». */
  stopAi(): Promise<void>;
  /** «Удалить» у своего вопроса. */
  deleteAiQuestion(request: DeleteQuestionRequest): Promise<AiMeetingView>;
  /** Ушли со встречи — её прошлая неудача больше не нужна. */
  dismissAiFailure(meetingId: string): Promise<void>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Скопировать для ИИ»: запрос из настроек и текст встречи — в буфер обмена простым текстом. */
```

**В `src/shared/ipc.ts` заменить:**

```ts
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onModelsChanged(listener: () => void): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
  onImportProgress(listener: Listener<ImportProgress[]>): Unsubscribe;
  onImportFailed(listener: Listener<ImportFailedEvent>): Unsubscribe;
}
```

**на:**

```ts
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onModelsChanged(listener: () => void): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
  onAiState(listener: Listener<AiState>): Unsubscribe;
  onAiChanged(listener: Listener<string>): Unsubscribe;
  onImportProgress(listener: Listener<ImportProgress[]>): Unsubscribe;
  onImportFailed(listener: Listener<ImportFailedEvent>): Unsubscribe;
}
```

**В `src/shared/llm-models.ts` заменить:**

```ts
  download: CatalogDownload | null;
  /** Последнее скачивание модели для итогов не удалось — причина для человека. */
  downloadError: { id: LlmModelId; message: string } | null;
}
```

**на:**

```ts
  download: CatalogDownload | null;
  /** Последнее скачивание модели для итогов не удалось — причина для человека. */
  downloadError: { id: LlmModelId; message: string } | null;
  /** Модель отвечает — удалять модели нельзя. */
  busy: boolean;
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  1057 passed (1057)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `77 passed`, `2 skipped` (проверки собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: summaries and questions by the local model in main: queue, ai.json, stop and quit"
```

### Task 4: Блок «Итоги встречи» во встрече

**Files:**
- Create: `e2e/ai-summary.spec.ts`, `src/renderer/main/AiBlock.tsx`, `src/renderer/main/AiMarkdown.tsx`, `src/renderer/main/ai-block.test.ts`, `src/renderer/main/ai-block.ts`, `src/shared/ai-markdown.test.ts`, `src/shared/ai-markdown.ts`
- Modify: `src/renderer/main/AiSettings.tsx`, `src/renderer/main/App.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/hooks.ts`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`, `src/shared/format.test.ts`, `src/shared/format.ts`

**Interfaces:**
- Consumes: каналы и типы Task 3 (`AiState`, `AiMeetingView`, `AiStartResult`), `ConfirmDialog`, `useCopiedFlag`.
- Produces: `parseAiMarkdown(text): AiMdBlock[]`, `parseInline`, `inlineText`, `aiPlainText(text)`, `AiInline`, `AiMdBlock`
  (`shared/ai-markdown.ts`); `formatStamp(iso, withYear?)`; `aiStageText`, `aiCaption` (в Task 5 переезжает в
  `shared/ai.ts`), `aiBusyText`, `aiBlockVisible`, `aiFinishedText` (`ai-block.ts`); `useAiState()`, `useAiMeeting(meetingId,
  textKey, onError)`; `useAiPanel(meetingId, textKey, onError): AiPanel`, `AiSummaryButton`, `AiBlock`; `SparkIcon`; у
  `MeetingPane` — свойства `onOpenAiSettings()` и `onOpenMeeting(id)`.

По листам 18–20 макета: кнопка «Итоги встречи» в шапке (слева от «Скопировать для ИИ»; недоступна, пока эта встреча
ждёт ответа), блок над текстом встречи (`AiBlock.tsx`): ход работы и текст с курсором, «Остановить»; готовые итоги
с подписью «Qwen3.5 9B · 27.09, 16:55», «Скопировать», «Обновить» (с окном «Заменить итоги?»), «Свернуть» (встреча
помнит это, пока программа запущена); пометка «Текст встречи меняли после итогов»; свои вопросы — список,
«Скопировать», «Удалить», поле и «Спросить» (Enter тоже); «Модель не скачана» — «Открыть настройки ИИ» и «Закрыть»;
модель занята другой встречей — её название и «Перейти»; неудачи — «слишком длинная», «Модель не смогла ответить» с
«Повторить». Оформление ответа — `shared/ai-markdown.ts` (заголовки, списки, жирный, курсив; ссылки и HTML — текстом)
и `AiMarkdown.tsx`. Экранному диктору — «Итоги готовы» / «Ответ готов». Подсказка под «Запросом для ИИ» говорит, что
он используется и для итогов.

- [ ] **Step 1: Тесты**

**Создать `e2e/ai-summary.spec.ts`:**

```ts
// Блок «Итоги встречи» (План 9, листы 18–20 макета): поддельный llama-server (TEXTMEET_TEST_LLM) отвечает
// разметкой — «### Главное», список, жирный; на вопрос — «Ответ: <вопрос>».
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, llmRequests, meetingJson, type LaunchedApp, type LaunchOptions } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';
const OTHER = '2026-09-28_1100_d4e5f6';

const transcript = (text: string) => ({
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T13:52:00.000Z',
  speakers: [{ id: 's1', kind: 'other' }],
  segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text, edited: false }],
});

function launch(options: LaunchOptions & { text?: string } = {}): Promise<LaunchedApp> {
  return launchApp({
    meetings: [
      { id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной', speakerNames: { s1: 'Ирина' } }) },
      { id: OTHER, json: meetingJson(OTHER, { status: 'done', title: 'Планёрка с дизайнерами', createdAt: '2026-09-28T08:00:00.000Z' }) },
    ],
    transcripts: { [ID]: transcript(options.text ?? 'Переносим запуск на пятницу.'), [OTHER]: transcript('Макеты к среде.') },
    ...options,
  });
}

const open = (page: Page, title: RegExp) =>
  page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: title }).click();
const block = (page: Page) => page.getByRole('region', { name: 'Итоги встречи' });
const summaryButton = (page: Page) => page.getByRole('button', { name: 'Итоги встречи' });

test('without a model the block offers the AI settings', async () => {
  launched = await launch();
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Скачайте её один раз (около 6 ГБ)');
  await block(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(block(page)).toHaveCount(0);
  await summaryButton(page).click();
  await block(page).getByRole('button', { name: 'Открыть настройки ИИ' }).click();
  await expect(page.getByRole('tab', { name: 'ИИ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Можно скачать' })).toBeVisible();
});

test('the summary is written with a cursor, formatted, saved and announced', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 60 });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(summaryButton(page)).toBeDisabled();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await expect(block(page).getByRole('button', { name: 'Остановить' })).toBeVisible();
  await expect(block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' })).toBeDisabled();
  await expect(block(page).getByRole('status')).toHaveText('Итоги готовы', { timeout: 15_000 });
  await expect(summaryButton(page)).toBeEnabled();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect(block(page).locator('b', { hasText: 'Задание:' })).toBeVisible();
  await expect(block(page).locator('ol li')).toHaveText('Проверить итоги.');
  await expect(block(page)).toContainText(/Qwen3\.5 9B · \d\d\.\d\d, \d\d:\d\d/);
  await expect(block(page)).toContainText('Отвечает модель на вашем компьютере — важное проверяйте по тексту встречи.');

  // Свернуть — блок прячется; «Итоги встречи» разворачивает его, не делая итоги заново.
  await block(page).getByRole('button', { name: 'Свернуть' }).click();
  await expect(block(page)).toHaveCount(0);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  expect(await llmRequests(launched.llmLog)).toHaveLength(1);
});

test('«Остановить» keeps what was written; «Обновить» asks before replacing', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible({ timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Остановить' }).click();
  await expect(block(page)).toContainText('· остановлено');

  await block(page).getByRole('button', { name: 'Обновить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Заменить итоги?' });
  await expect(dialog).toContainText('Ваши вопросы и ответы останутся.');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  expect(await llmRequests(llmLog)).toHaveLength(1);
  await block(page).getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('dialog', { name: 'Заменить итоги?' }).getByRole('button', { name: 'Заменить' }).click();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await expect.poll(async () => (await llmRequests(llmLog)).length).toBe(2);
});

test('own questions are answered, kept in order and deleted', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  const field = block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' });
  await expect(field).toBeEnabled({ timeout: 15_000 });
  await field.fill('Что решили по срокам?');
  await field.press('Enter');
  await expect(block(page)).toContainText('Ответ: Что решили по срокам?', { timeout: 15_000 });
  await expect(field).toHaveValue('');
  await field.fill('Кто такой Олег?');
  await block(page).getByRole('button', { name: 'Спросить' }).click();
  await expect(block(page)).toContainText('Ответ: Кто такой Олег?', { timeout: 15_000 });
  await expect(block(page).locator('.qa-q')).toHaveText([/^Что решили по срокам\?/, /^Кто такой Олег\?/]);

  await block(page).getByRole('button', { name: 'Удалить вопрос: Что решили по срокам?' }).click();
  await expect(block(page).locator('.qa-q')).toHaveCount(1);
  // Вопросы и итоги — на диске: после перезапуска они на месте.
  await page.reload();
  await open(page, /Созвон с Ириной/);
  await expect(block(page)).toContainText('Ответ: Кто такой Олег?');
});

test('the summary is marked when the text of the meeting changed after it', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { page, libraryDir } = launched;
  const summary = { text: '- Старые итоги', model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-09-27T13:55:00.000Z', status: 'done', sourceHash: 'другой текст' };
  await writeFile(join(libraryDir, ID, 'ai.json'), JSON.stringify({ version: 1, summary, questions: [] }));
  await open(page, /Созвон с Ириной/);
  await expect(block(page)).toContainText('Текст встречи меняли после итогов.');
  await block(page).getByRole('button', { name: 'Обновить итоги' }).click();
  await page.getByRole('dialog', { name: 'Заменить итоги?' }).getByRole('button', { name: 'Заменить' }).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible({ timeout: 15_000 });
  await expect(block(page)).not.toContainText('Текст встречи меняли после итогов.');
});

test('while the model writes for one meeting, another meeting names it and offers to go there', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page } = launched;
  await open(page, /Планёрка с дизайнерами/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('пишет…');
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Модель сейчас пишет итоги встречи «Планёрка с дизайнерами».');
  await expect(block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' })).toBeDisabled();
  await block(page).getByRole('button', { name: 'Перейти' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Планёрка с дизайнерами/);
  await expect(block(page).getByRole('button', { name: 'Остановить' })).toBeVisible();
});

test('a meeting too long for the model is not sent', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], text: 'ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА' });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText(
    'Встреча слишком длинная для Qwen3.5 9B. Выберите другую модель в настройках ИИ или воспользуйтесь «Скопировать для ИИ».',
  );
  expect(await llmRequests(llmLog)).toEqual([]);
});

test('a crashed engine shows the reason and «Повторить» starts it again', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], text: 'УПАДИ, пожалуйста.' });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page).getByRole('alert')).toHaveText(/^Модель не смогла ответить — подробности в журнале\./, { timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Повторить' }).click();
  await expect.poll(async () => (await llmRequests(llmLog)).length).toBe(2);
});
```

**Создать `src/renderer/main/ai-block.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_AI_DOC, type AiFailure, type AiJob, type AiMeetingView } from '../../shared/ai';
import { aiBlockVisible, aiBusyText, aiCaption, aiFinishedText, aiStageText } from './ai-block';

const job = (over: Partial<AiJob> = {}): AiJob => ({
  meetingId: 'm',
  meetingTitle: 'Планёрка с дизайнерами',
  kind: 'summary',
  question: null,
  modelTitle: 'Qwen3.5 9B',
  stage: 'writing',
  text: '',
  ...over,
});

const failure: AiFailure = { meetingId: 'm', kind: 'summary', question: null, failure: 'engine', message: 'x', text: null };
const empty: AiMeetingView = { doc: EMPTY_AI_DOC, broken: false, stale: false };

describe('AI block texts', () => {
  it('shows how the model is doing before the first word', () => {
    expect(aiStageText('loading')).toBe('Готовим модель…');
    expect(aiStageText('reading')).toBe('Читаем встречу…');
    expect(aiStageText('writing')).toBeNull();
  });

  it('signs the summary with the model and the time, and marks a stopped one', () => {
    const createdAt = new Date(2026, 8, 27, 16, 55).toISOString();
    expect(aiCaption({ modelTitle: 'Qwen3.5 9B', createdAt, status: 'done' })).toBe('Qwen3.5 9B · 27.09, 16:55');
    expect(aiCaption({ modelTitle: 'Qwen3.5 9B', createdAt, status: 'stopped' }, true)).toBe(
      'Qwen3.5 9B · 27.09.2026, 16:55 · остановлено',
    );
  });

  it('names the meeting the model is busy with', () => {
    expect(aiBusyText(job())).toBe('Модель сейчас пишет итоги встречи «Планёрка с дизайнерами».');
    expect(aiBusyText(job({ kind: 'question' }))).toBe('Модель сейчас отвечает на вопрос по встрече «Планёрка с дизайнерами».');
  });
});

describe('aiBlockVisible', () => {
  const shown = { view: empty, job: null, failure: null, opened: false, collapsed: false };

  it('hides an empty block until it is opened', () => {
    expect(aiBlockVisible(shown)).toBe(false);
    expect(aiBlockVisible({ ...shown, opened: true })).toBe(true);
  });

  it('shows the block with a summary, questions, a request or a failure — unless it is collapsed', () => {
    const summary = { text: '-', model: 'q', modelTitle: 'Q', createdAt: '2026-10-14T10:00:00.000Z', status: 'done' as const, sourceHash: 'h' };
    expect(aiBlockVisible({ ...shown, view: { ...empty, doc: { ...EMPTY_AI_DOC, summary } } })).toBe(true);
    expect(aiBlockVisible({ ...shown, job: job() })).toBe(true);
    expect(aiBlockVisible({ ...shown, failure })).toBe(true);
    expect(aiBlockVisible({ ...shown, job: job(), collapsed: true })).toBe(false);
  });
});

describe('aiFinishedText', () => {
  it('announces a finished summary or answer, but not a failure or a request still going', () => {
    expect(aiFinishedText(job(), null, null)).toBe('Итоги готовы');
    expect(aiFinishedText(job({ kind: 'question' }), null, null)).toBe('Ответ готов');
    expect(aiFinishedText(job(), null, failure)).toBeNull();
    expect(aiFinishedText(job(), job(), null)).toBeNull();
    expect(aiFinishedText(null, null, null)).toBeNull();
  });
});
```

**Создать `src/shared/ai-markdown.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { aiPlainText, inlineText, parseAiMarkdown, parseInline } from './ai-markdown';

const plain = (text: string) => ({ text, bold: false, italic: false });

describe('parseInline', () => {
  it('finds bold and italic, with stars and underscores', () => {
    expect(parseInline('**Я** — написать *сегодня*, __потом__ _отчёт_ и ***срочно***')).toEqual([
      { text: 'Я', bold: true, italic: false },
      plain(' — написать '),
      { text: 'сегодня', bold: false, italic: true },
      plain(', '),
      { text: 'потом', bold: true, italic: false },
      plain(' '),
      { text: 'отчёт', bold: false, italic: true },
      plain(' и '),
      { text: 'срочно', bold: true, italic: true },
    ]);
  });

  it('leaves unfinished marks, names with underscores and arithmetic as they are', () => {
    expect(parseInline('Итоги **пишутся')).toEqual([plain('Итоги **пишутся')]);
    expect(parseInline('файл my_report_final.docx')).toEqual([plain('файл my_report_final.docx')]);
    expect(parseInline('2 * 3 = 6')).toEqual([plain('2 * 3 = 6')]);
  });

  it('keeps links and HTML as plain text', () => {
    expect(parseInline('[сайт](https://example.com) <b>x</b>')).toEqual([plain('[сайт](https://example.com) <b>x</b>')]);
  });
});

describe('parseAiMarkdown', () => {
  it('reads headings, lists and paragraphs the model writes', () => {
    const text = '### Главное\n- Бюджет — **половина**.\n* Дизайн до пятницы.\n\nВ целом спокойно.\nБез споров.\n\n## Задачи\n1. Написать Олегу.\n2) Сравнить сроки.';
    expect(parseAiMarkdown(text)).toEqual([
      { kind: 'heading', inline: [plain('Главное')] },
      {
        kind: 'list',
        ordered: false,
        items: [[plain('Бюджет — '), { text: 'половина', bold: true, italic: false }, plain('.')], [plain('Дизайн до пятницы.')]],
      },
      { kind: 'paragraph', inline: [plain('В целом спокойно.\nБез споров.')] },
      { kind: 'heading', inline: [plain('Задачи')] },
      { kind: 'list', ordered: true, items: [[plain('Написать Олегу.')], [plain('Сравнить сроки.')]] },
    ]);
  });

  it('drops horizontal rules and Windows line ends, and splits lists of different kinds', () => {
    const blocks = parseAiMarkdown('- раз\r\n---\r\n1. два');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'list']);
    expect(blocks[1]).toMatchObject({ ordered: true });
  });

  it('shows text that is still being written', () => {
    expect(parseAiMarkdown('### Гла')).toEqual([{ kind: 'heading', inline: [plain('Гла')] }]);
    expect(parseAiMarkdown('')).toEqual([]);
  });
});

describe('aiPlainText', () => {
  it('turns the markup into plain text with bullets and numbers', () => {
    expect(aiPlainText('### Главное\n- **Бюджет**: половина\n- Дизайн\n\n## Задачи\n1. Написать')).toBe(
      'Главное\n\n• Бюджет: половина\n• Дизайн\n\nЗадачи\n\n1. Написать',
    );
    expect(inlineText(parseInline('*а* **б**'))).toBe('а б');
  });
});
```

**В `src/shared/format.test.ts` заменить:**

```ts
  formatLongDate,
  formatMegabytes,
  formatRemaining,
  formatTimestamp,
} from './format';
```

**на:**

```ts
  formatLongDate,
  formatMegabytes,
  formatRemaining,
  formatStamp,
  formatTimestamp,
} from './format';
```

**В `src/shared/format.test.ts` заменить:**

```ts
    expect(formatRemaining(seconds)).toBe(text);
  });
});
```

**на:**

```ts
    expect(formatRemaining(seconds)).toBe(text);
  });
});

describe('formatStamp', () => {
  it('shows the day, the month and the time, with the year for the export', () => {
    const iso = new Date(2026, 8, 27, 16, 5).toISOString();
    expect(formatStamp(iso)).toBe('27.09, 16:05');
    expect(formatStamp(iso, true)).toBe('27.09.2026, 16:05');
    expect(formatStamp('не дата')).toBe('—');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/ai-block.test.ts src/shared/ai-markdown.test.ts src/shared/format.test.ts`
Ожидается: FAIL — нет модулей `./ai-markdown` и `./ai-block`, нет `formatStamp`.

- [ ] **Step 3: Код**

**Создать `src/renderer/main/AiBlock.tsx`:**

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AiFailure, AiJob, AiMeetingView, AiQuestion, AiStartResult } from '../../shared/ai';
import { AI_QUESTION_MAX } from '../../shared/ai';
import { aiPlainText } from '../../shared/ai-markdown';
import {
  AI_FOOT,
  aiBlockVisible,
  aiBusyText,
  aiCaption,
  aiFinishedText,
  aiStageText,
  ASK_PLACEHOLDER,
  ASK_PLACEHOLDER_WAIT,
  NO_MODEL_TEXT,
} from './ai-block';
import { AiMarkdown } from './AiMarkdown';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { useAiMeeting, useAiState, useCopiedFlag } from './hooks';
import { SparkIcon } from './icons';

/** Свёрнутые блоки итогов: встреча помнит «Свернуть», пока программа запущена. */
const collapsedMeetings = new Set<string>();

export interface AiPanel {
  meetingId: string;
  view: AiMeetingView | null;
  /** Запрос по этой встрече. */
  job: AiJob | null;
  /** Модель занята другой встречей. */
  other: AiJob | null;
  failure: AiFailure | null;
  visible: boolean;
  /** «Модель не скачана» — после нажатия «Итоги встречи» или «Спросить». */
  noModel: boolean;
  /** «Итоги встречи» в шапке: итоги есть — развернуть блок; нет — начать. */
  openSummary(): void;
  /** «Обновить» (после «Заменить») и «Повторить». */
  summarize(): void;
  ask(question: string): Promise<boolean>;
  stop(): void;
  collapse(): void;
  /** «Закрыть» у «Модель не скачана». */
  close(): void;
  deleteQuestion(questionId: string): void;
}

/**
 * Состояние блока итогов встречи: ai.json, работа модели, открыт ли блок. textKey — текст встречи (меняется — пометка
 * «текст меняли» пересчитывается).
 */
export function useAiPanel(meetingId: string, textKey: unknown, onError: (message: string) => void): AiPanel {
  const [view, setView] = useAiMeeting(meetingId, textKey, onError);
  const state = useAiState();
  const [opened, setOpened] = useState(false);
  const [noModel, setNoModel] = useState(false);
  const [collapsed, setCollapsed] = useState(() => collapsedMeetings.has(meetingId));
  const job = state.job?.meetingId === meetingId ? state.job : null;
  const other = state.job && state.job.meetingId !== meetingId ? state.job : null;
  const failure = state.failures.find((f) => f.meetingId === meetingId) ?? null;

  // Ушли со встречи — её прошлая неудача (и несохранённый ответ) больше не показывается.
  useEffect(
    () => () => {
      window.textmeet.dismissAiFailure(meetingId).catch(() => undefined);
    },
    [meetingId],
  );

  const expand = () => {
    collapsedMeetings.delete(meetingId);
    setCollapsed(false);
    setOpened(true);
  };

  const start = async (run: () => Promise<AiStartResult>): Promise<boolean> => {
    expand();
    try {
      const result = await run();
      setNoModel(result === 'no-model');
      return result === 'started';
    } catch (err) {
      onError(errorText(err));
      return false;
    }
  };

  const summarize = () => void start(() => window.textmeet.summarize(meetingId));

  return {
    meetingId,
    view,
    job,
    other,
    failure,
    noModel,
    visible: aiBlockVisible({ view, job, failure, opened: opened || noModel, collapsed }),
    openSummary: () => {
      if (view?.doc.summary || other) expand();
      else summarize();
    },
    summarize,
    ask: (question) => start(() => window.textmeet.askAi({ meetingId, question })),
    stop: () => void window.textmeet.stopAi().catch((err: unknown) => onError(errorText(err))),
    collapse: () => {
      collapsedMeetings.add(meetingId);
      setCollapsed(true);
    },
    close: () => {
      setNoModel(false);
      setOpened(false);
    },
    deleteQuestion: (questionId) => {
      window.textmeet
        .deleteAiQuestion({ meetingId, questionId })
        .then(setView)
        .catch((err: unknown) => onError(errorText(err)));
    },
  };
}

/** «Итоги встречи» в шапке встречи — слева от «Скопировать для ИИ». */
export function AiSummaryButton({ panel }: { panel: AiPanel }) {
  return (
    <button type="button" className="btn pri" disabled={panel.job !== null} onClick={panel.openSummary}>
      <SparkIcon />
      Итоги встречи
    </button>
  );
}

function CopyLink({ text, label, onError }: { text: string; label: string; onError(message: string): void }) {
  const [copied, markCopied] = useCopiedFlag();
  return (
    <button
      type="button"
      className="lnk"
      aria-label={label}
      onClick={() =>
        navigator.clipboard
          .writeText(aiPlainText(text))
          .then(markCopied)
          .catch((err: unknown) => onError(errorText(err)))
      }
    >
      {copied ? 'Скопировано' : 'Скопировать'}
    </button>
  );
}

/** Ход работы до первого слова — с вращающимся значком. */
function Waiting({ text }: { text: string }) {
  return (
    <div className="ai-wait">
      <span className="spin" aria-hidden="true" />
      {text}
    </div>
  );
}

/** Пишется сейчас: ход работы или текст с курсором. */
function Writing({ job }: { job: AiJob }) {
  const stage = aiStageText(job.stage);
  return stage ? <Waiting text={stage} /> : <AiMarkdown text={job.text} caret />;
}

function FailureView({ failure, onRetry }: { failure: AiFailure; onRetry(): void }) {
  if (failure.failure === 'too-long') return <div className="ai-warn">{failure.message}</div>;
  return (
    <>
      <p className="err" role="alert">
        {failure.message}
      </p>
      {failure.failure === 'engine' && (
        <div className="ai-row">
          <button type="button" className="btn" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
      {failure.text !== null && failure.kind === 'summary' && <AiMarkdown text={failure.text} />}
    </>
  );
}

function QuestionItem({
  item,
  onDelete,
  onError,
}: {
  item: AiQuestion;
  onDelete(): void;
  onError(message: string): void;
}) {
  return (
    <div className="qa-i">
      <div className="qa-q">
        {item.question}
        {item.status === 'stopped' && <span className="qa-note">остановлено</span>}
        <span className="lnks">
          <CopyLink text={item.answer} label={`Скопировать ответ: ${item.question}`} onError={onError} />
          <button type="button" className="lnk" aria-label={`Удалить вопрос: ${item.question}`} onClick={onDelete}>
            Удалить
          </button>
        </span>
      </div>
      <div className="qa-a">
        <AiMarkdown text={item.answer} />
      </div>
    </div>
  );
}

interface BlockProps {
  panel: AiPanel;
  /** «Открыть настройки ИИ». */
  onOpenSettings(): void;
  /** «Перейти» к встрече, которой занята модель. */
  onOpenMeeting(meetingId: string): void;
  onError(message: string): void;
}

/** Блок «Итоги встречи» над текстом встречи (решения Плана 9, §2.2). */
export function AiBlock({ panel, onOpenSettings, onOpenMeeting, onError }: BlockProps) {
  const [question, setQuestion] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousJob = useRef<AiJob | null>(null);
  const { view, job, other, failure } = panel;

  // По окончании ответа — «Итоги готовы» / «Ответ готов» экранному диктору (поток текста ему не читается).
  useEffect(() => {
    const text = aiFinishedText(previousJob.current, job, failure);
    previousJob.current = job;
    if (text) setAnnouncement(text);
  }, [job, failure]);

  if (!panel.visible) return null;
  const summary = view?.doc.summary ?? null;
  const questions = view?.doc.questions ?? [];
  const summaryJob = job?.kind === 'summary' ? job : null;
  const questionJob = job?.kind === 'question' ? job : null;
  const busy = job !== null || other !== null;
  const summaryFailure = failure?.kind === 'summary' ? failure : null;
  const questionFailure = failure?.kind === 'question' ? failure : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    void panel.ask(text).then((started) => {
      if (started) setQuestion('');
    });
  };

  let caption: string | null = null;
  if (summaryJob) caption = `${summaryJob.modelTitle} · пишет…`;
  else if (summary) caption = aiCaption(summary);

  return (
    <section className="ai" aria-label="Итоги встречи" aria-busy={job ? true : undefined}>
      <div className="ai-h">
        <b>Итоги встречи</b>
        {caption && <span>{caption}</span>}
        <span className="lnks">
          {summaryJob ? (
            <button type="button" className="btn" onClick={panel.stop}>
              Остановить
            </button>
          ) : panel.noModel && !summary ? (
            <button type="button" className="lnk" onClick={panel.close}>
              Закрыть
            </button>
          ) : (
            <>
              {summary && <CopyLink text={summary.text} label="Скопировать итоги" onError={onError} />}
              {summary && (
                <button type="button" className="lnk" disabled={busy} onClick={() => setConfirm(true)}>
                  Обновить
                </button>
              )}
              <button type="button" className="lnk" onClick={panel.collapse}>
                Свернуть
              </button>
            </>
          )}
        </span>
      </div>

      {other && (
        <p>
          {aiBusyText(other)}{' '}
          <button type="button" className="lnk" onClick={() => onOpenMeeting(other.meetingId)}>
            Перейти
          </button>
        </p>
      )}

      {panel.noModel && (
        <>
          <p>{NO_MODEL_TEXT}</p>
          <div className="ai-row">
            <button type="button" className="btn pri" onClick={onOpenSettings}>
              Открыть настройки ИИ
            </button>
          </div>
        </>
      )}

      {summaryJob && <Writing job={summaryJob} />}
      {!summaryJob && summary && (
        <>
          {view?.stale && (
            <div className="ai-warn">
              Текст встречи меняли после итогов.{' '}
              <button type="button" className="lnk" disabled={busy} onClick={() => setConfirm(true)}>
                Обновить итоги
              </button>
            </div>
          )}
          <AiMarkdown text={summary.text} />
        </>
      )}
      {summaryFailure && <FailureView failure={summaryFailure} onRetry={panel.summarize} />}

      {(questions.length > 0 || questionJob || questionFailure) && (
        <div className="qa">
          {questions.map((item) => (
            <QuestionItem key={item.id} item={item} onDelete={() => panel.deleteQuestion(item.id)} onError={onError} />
          ))}
          {questionJob && (
            <div className="qa-i" aria-busy="true">
              <div className="qa-q">
                {questionJob.question}
                <span className="lnks">
                  <button type="button" className="lnk" onClick={panel.stop}>
                    Остановить
                  </button>
                </span>
              </div>
              <div className="qa-a">
                <Writing job={questionJob} />
              </div>
            </div>
          )}
          {questionFailure && (
            <div className="qa-i">
              <div className="qa-q">{questionFailure.question}</div>
              <FailureView failure={questionFailure} onRetry={() => void panel.ask(questionFailure.question ?? '')} />
              {questionFailure.text !== null && (
                <div className="qa-a">
                  <AiMarkdown text={questionFailure.text} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!panel.noModel && (
        <form className={busy ? 'ask off' : 'ask'} onSubmit={submit}>
          <input
            type="text"
            aria-label="Свой вопрос к встрече"
            placeholder={summaryJob ? ASK_PLACEHOLDER_WAIT : ASK_PLACEHOLDER}
            maxLength={AI_QUESTION_MAX}
            value={question}
            disabled={busy}
            onChange={(e) => setQuestion(e.currentTarget.value)}
          />
          <button type="submit" className="btn" disabled={busy || question.trim() === ''}>
            Спросить
          </button>
        </form>
      )}
      {(summary || questions.length > 0 || job) && <p className="ai-foot">{AI_FOOT}</p>}
      <span className="sr-only" role="status">
        {announcement}
      </span>

      {confirm && (
        <ConfirmDialog
          title="Заменить итоги?"
          confirmLabel="Заменить"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            panel.summarize();
          }}
        >
          Модель напишет итоги заново, нынешние пропадут. Ваши вопросы и ответы останутся.
        </ConfirmDialog>
      )}
    </section>
  );
}
```

**Создать `src/renderer/main/AiMarkdown.tsx`:**

```tsx
import { useMemo, type ReactNode } from 'react';
import { parseAiMarkdown, type AiInline } from '../../shared/ai-markdown';

function Inline({ inline }: { inline: readonly AiInline[] }) {
  return (
    <>
      {inline.map((piece, i) => {
        let node: ReactNode = piece.text;
        if (piece.italic) node = <i>{node}</i>;
        if (piece.bold) node = <b>{node}</b>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/**
 * Ответ модели с оформлением: заголовки разделов, списки, жирный, курсив (shared/ai-markdown.ts). Ссылки и HTML —
 * простым текстом: React выводит их как текст. caret — курсор в конце, пока модель пишет.
 */
export function AiMarkdown({ text, caret = false }: { text: string; caret?: boolean }) {
  const blocks = useMemo(() => parseAiMarkdown(text), [text]);
  const cursor = caret ? <span className="caret" aria-hidden="true" /> : null;
  if (blocks.length === 0) return cursor && <p>{cursor}</p>;
  return (
    <div className="ai-md">
      {blocks.map((block, i) => {
        const end = i === blocks.length - 1 ? cursor : null;
        if (block.kind === 'heading') {
          return (
            <h4 key={i}>
              <Inline inline={block.inline} />
              {end}
            </h4>
          );
        }
        if (block.kind === 'paragraph') {
          return (
            <p key={i}>
              <Inline inline={block.inline} />
              {end}
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline inline={item} />
                {j === block.items.length - 1 ? end : null}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
```

**В `src/renderer/main/AiSettings.tsx` заменить:**

```tsx
          onBlur={flush}
        />
        <small id={hintId}>
          Добавляется перед текстом встречи, когда вы нажимаете «Скопировать для ИИ». Вставьте скопированное в
          Claude, ChatGPT или другой чат.
        </small>
        {text !== DEFAULT_AI_PROMPT && (
          <button type="button" className="lnk" onClick={reset}>
```

**на:**

```tsx
          onBlur={flush}
        />
        <small id={hintId}>
          Используется для «Итогов встречи» и добавляется перед текстом, когда вы нажимаете «Скопировать для ИИ».
        </small>
        {text !== DEFAULT_AI_PROMPT && (
          <button type="button" className="lnk" onClick={reset}>
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
        importing={imports.get(entryId(selectedEntry)) ?? null}
        onError={setError}
        onDeleted={() => selectNeighbor(entryId(selectedEntry))}
      />
    );
  } else {
```

**на:**

```tsx
        importing={imports.get(entryId(selectedEntry)) ?? null}
        onError={setError}
        onDeleted={() => selectNeighbor(entryId(selectedEntry))}
        onOpenAiSettings={() => {
          setSettingsTab('ai');
          setSelection({ kind: 'settings' });
        }}
        onOpenMeeting={(id) => setSelection({ kind: 'meeting', id })}
      />
    );
  } else {
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { CopyForAiButton } from './CopyForAiButton';
import { ExportMenu } from './ExportMenu';
import { importView } from './import-format';
```

**на:**

```tsx
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { AiBlock, AiSummaryButton, useAiPanel } from './AiBlock';
import { CopyForAiButton } from './CopyForAiButton';
import { ExportMenu } from './ExportMenu';
import { importView } from './import-format';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  onError(message: string): void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
}

const AUDIO_BUSY = 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.';
```

**на:**

```tsx
  onError(message: string): void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
  /** «Открыть настройки ИИ» из блока итогов. */
  onOpenAiSettings(): void;
  /** «Перейти» к встрече, которой занята модель. */
  onOpenMeeting(meetingId: string): void;
}

const AUDIO_BUSY = 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  importing,
  onError,
  onDeleted,
}: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
```

**на:**

```tsx
  importing,
  onError,
  onDeleted,
  onOpenAiSettings,
  onOpenMeeting,
}: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // Выгружать есть что, только если в тексте есть хоть одна реплика (прежний текст — и во время расшифровки заново).
  const canExport = load.kind === 'ready' && load.transcript.segments.some((s) => s.text.trim() !== '');
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
```

**на:**

```tsx
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // Выгружать есть что, только если в тексте есть хоть одна реплика (прежний текст — и во время расшифровки заново).
  const canExport = load.kind === 'ready' && load.transcript.segments.some((s) => s.text.trim() !== '');
  // Текст встречи, который видела бы модель: правки и имена спикеров меняют пометку «текст меняли после итогов».
  const shownTranscript = load.kind === 'ready' ? load.transcript : null;
  const speakerNames = JSON.stringify(meeting.speakerNames);
  const textKey = useMemo(() => [shownTranscript, speakerNames], [shownTranscript, speakerNames]);
  const ai = useAiPanel(meeting.id, textKey, onError);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
              {actions.header}
            </button>
          )}
          {canExport && <CopyForAiButton meetingId={meeting.id} onError={onError} />}
          {canExport && <ExportMenu meetingId={meeting.id} onError={onError} />}
          <MeetingMenu
```

**на:**

```tsx
              {actions.header}
            </button>
          )}
          {canExport && <AiSummaryButton panel={ai} />}
          {canExport && <CopyForAiButton meetingId={meeting.id} onError={onError} />}
          {canExport && <ExportMenu meetingId={meeting.id} onError={onError} />}
          <MeetingMenu
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
          </div>
        </div>
      )}
      {meeting.status === 'importing' ? (
        <ImportBlock fileName={meeting.sourceFileName} progress={importing} />
      ) : (
```

**на:**

```tsx
          </div>
        </div>
      )}
      <AiBlock panel={ai} onOpenSettings={onOpenAiSettings} onOpenMeeting={onOpenMeeting} onError={onError} />
      {meeting.status === 'importing' ? (
        <ImportBlock fileName={meeting.sourceFileName} progress={importing} />
      ) : (
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, importing, onError, onDeleted }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
```

**на:**

```tsx
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, importing, onError, onDeleted, onOpenAiSettings, onOpenMeeting }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
    );
  }
  return (
    <MeetingView entry={entry} progress={progress} importing={importing} onError={onError} onDeleted={onDeleted} />
  );
}
```

**на:**

```tsx
    );
  }
  return (
    <MeetingView
      entry={entry}
      progress={progress}
      importing={importing}
      onError={onError}
      onDeleted={onDeleted}
      onOpenAiSettings={onOpenAiSettings}
      onOpenMeeting={onOpenMeeting}
    />
  );
}
```

**Создать `src/renderer/main/ai-block.ts`:**

```ts
// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiAnswerStatus, AiFailure, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';
import { formatStamp } from '../../shared/format';

export const ASK_PLACEHOLDER = 'Свой вопрос к встрече — например, что решили по срокам?';
/** Пока пишутся итоги этой встречи, спросить нельзя. */
export const ASK_PLACEHOLDER_WAIT = 'Свой вопрос к встрече — можно задать, когда итоги допишутся';
export const AI_FOOT = 'Отвечает модель на вашем компьютере — важное проверяйте по тексту встречи.';
export const NO_MODEL_TEXT =
  'Итоги делает модель на вашем компьютере. Скачайте её один раз (около 6 ГБ) — дальше всё работает без интернета.';

/** Ход работы до первого слова: «Готовим модель…» (загрузка в память), «Читаем встречу…»; пишет — null. */
export function aiStageText(stage: AiJobStage): string | null {
  if (stage === 'loading') return 'Готовим модель…';
  if (stage === 'reading') return 'Читаем встречу…';
  return null;
}

/** Подпись итогов или ответа: «Qwen3.5 9B · 27.09, 16:55»; остановленный — с «· остановлено». */
export function aiCaption(record: { modelTitle: string; createdAt: string; status: AiAnswerStatus }, withYear = false): string {
  const parts = [record.modelTitle, formatStamp(record.createdAt, withYear)];
  if (record.status === 'stopped') parts.push('остановлено');
  return parts.join(' · ');
}

/** Модель занята другой встречей: блок называет её. */
export function aiBusyText(job: AiJob): string {
  return job.kind === 'summary'
    ? `Модель сейчас пишет итоги встречи «${job.meetingTitle}».`
    : `Модель сейчас отвечает на вопрос по встрече «${job.meetingTitle}».`;
}

export interface AiBlockShown {
  view: AiMeetingView | null;
  /** Запрос по этой встрече. */
  job: AiJob | null;
  failure: AiFailure | null;
  /** Человек открыл блок кнопкой «Итоги встречи». */
  opened: boolean;
  /** «Свернуть». */
  collapsed: boolean;
}

/** Блок виден, если не свёрнут и в нём есть что показать (или его открыли кнопкой). */
export function aiBlockVisible(input: AiBlockShown): boolean {
  if (input.collapsed) return false;
  const doc = input.view?.doc;
  return input.opened || input.job !== null || input.failure !== null || !!doc?.summary || (doc?.questions.length ?? 0) > 0;
}

/** Ответ по встрече закончился (не сбой) — что сказать экранному диктору: «Итоги готовы» / «Ответ готов». */
export function aiFinishedText(previous: AiJob | null, current: AiJob | null, failure: AiFailure | null): string | null {
  if (!previous || current || failure) return null;
  return previous.kind === 'summary' ? 'Итоги готовы' : 'Ответ готов';
}
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import { createContext, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ImportProgress } from '../../shared/import';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
```

**на:**

```ts
import { createContext, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { AiMeetingView, AiState } from '../../shared/ai';
import type { ImportProgress } from '../../shared/import';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts

  return { state, error: catalogErrorText(errors), run };
}
```

**на:**

```ts

  return { state, error: catalogErrorText(errors), run };
}

const NO_AI: AiState = { job: null, failures: [] };

/** Работа модели для итогов: что она пишет сейчас (один запрос на всю программу) и последние неудачи по встречам. */
export function useAiState(): AiState {
  const [state, setState] = useState<AiState | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.textmeet.onAiState(setState);
    window.textmeet
      .getAiState()
      .then((initial) => {
        // Событие могло прийти раньше ответа — оно новее.
        if (active) setState((current) => current ?? initial);
      })
      .catch((err: unknown) => console.error('TextMeet: состояние итогов не получено', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state ?? NO_AI;
}

/**
 * Итоги и вопросы встречи (ai.json): при открытии встречи, после записи файла (ai:changed), при возврате в окно и когда
 * меняется текст встречи (textKey) — от него зависит пометка «Текст встречи меняли после итогов». Ошибка чтения — в
 * onError; показанное остаётся.
 */
export function useAiMeeting(
  meetingId: string,
  textKey: unknown,
  onError: (message: string) => void,
): [AiMeetingView | null, (view: AiMeetingView) => void] {
  const [state, setState] = useState<{ meetingId: string; view: AiMeetingView } | null>(null);
  const [again, setAgain] = useState(0);
  const latest = useRef(0);
  const report = useRef(onError);
  report.current = onError;
  useEffect(() => {
    const bump = () => setAgain((n) => n + 1);
    window.addEventListener('focus', bump);
    const unsubscribe = window.textmeet.onAiChanged((id) => {
      if (id === meetingId) bump();
    });
    return () => {
      window.removeEventListener('focus', bump);
      unsubscribe();
    };
  }, [meetingId]);
  useEffect(() => {
    const request = ++latest.current;
    window.textmeet
      .getAi(meetingId)
      .then((view) => {
        if (request === latest.current) setState({ meetingId, view });
      })
      .catch((err: unknown) => {
        if (request === latest.current) report.current(errorText(err));
      });
  }, [meetingId, textKey, again]);
  const set = useCallback(
    (view: AiMeetingView) => {
      latest.current += 1;
      setState({ meetingId, view });
    },
    [meetingId],
  );
  return [state?.meetingId === meetingId ? state.view : null, set];
}
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12l5 5 9-10" />
```

**на:**

```tsx
  </Icon>
);

/** Итоги встречи: искра. */
export const SparkIcon = () => (
  <Icon>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12l5 5 9-10" />
```

**В `src/renderer/main/styles.css` заменить:**

```css
  box-shadow: inset 0 0 0 1.5px var(--accent);
  content-visibility: visible;
}
```

**на:**

```css
  box-shadow: inset 0 0 0 1.5px var(--accent);
  content-visibility: visible;
}

/* ---- Встреча: блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета) ---- */
.ai {
  flex: none;
  max-height: 48vh;
  overflow-y: auto;
  margin: 14px 36px 2px;
  padding: 14px 18px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-h {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-h b {
  font-family: var(--f-text);
  font-size: 16px;
  font-weight: 600;
}

.ai-h > span {
  color: var(--muted);
  font-size: 12px;
}

.ai-h .lnks,
.qa-q .lnks {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.ai-h .btn {
  height: 26px;
  padding: 0 10px;
  font-size: 12.5px;
}

.ai p,
.ai ul,
.ai ol {
  margin: 0;
  font-family: var(--f-text);
  font-size: 14.5px;
  line-height: 1.5;
}

.ai p {
  white-space: pre-wrap;
}

.ai ul,
.ai ol {
  padding-left: 20px;
}

.ai-md {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai h4 {
  margin: 4px 0 0;
  font-family: var(--f-ui);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.ai-row {
  display: flex;
  gap: 8px;
}

.ai-warn {
  padding: 7px 10px;
  border-radius: var(--r);
  background: var(--warn-soft);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.45;
}

.ai-wait {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}

.spin {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--meter-off);
  border-top-color: var(--accent);
  flex: none;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Курсор в конце текста, пока модель пишет. */
.caret {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--accent);
  border-radius: 1px;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin,
  .caret {
    animation: none;
  }
}

.qa {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}

.qa-i {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.qa-q {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-weight: 600;
  font-size: 13.5px;
}

.qa-q .lnks {
  font-weight: 400;
}

.qa-note {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}

.ask {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 6px 0 12px;
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--bg);
  margin-top: 2px;
  flex: none;
}

.ask:focus-within {
  border-color: var(--accent);
}

.ask input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
  outline: none;
}

.ask input::placeholder {
  color: var(--muted);
}

.ask .btn {
  height: 26px;
  padding: 0 10px;
}

.ask.off {
  opacity: 0.55;
}

.ai-foot {
  color: var(--muted);
  font-family: var(--f-ui) !important;
  font-size: 11.5px !important;
}
```

**Создать `src/shared/ai-markdown.ts`:**

```ts
// Оформление ответа модели (решения Плана 9, §2.2): из разметки Markdown, которую пишет модель, берутся только
// заголовки разделов, списки, жирный и курсив; остальное — простым текстом (ссылки и HTML не оживают). Одна раскладка
// для блока итогов в окне и для выгрузки (Word, .txt, «Скопировать всё»). Чистые функции.

export interface AiInline {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type AiMdBlock =
  | { kind: 'heading'; inline: AiInline[] }
  | { kind: 'list'; ordered: boolean; items: AiInline[][] }
  /** Строки абзаца — через перевод строки внутри текста. */
  | { kind: 'paragraph'; inline: AiInline[] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
/** Черта «---», «***» — разделитель разделов, в тексте не нужна. */
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
/**
 * Жирный и курсив: ***оба***, **жирный**, __жирный__, *курсив*, _курсив_ (подчёркивания — только на границе слова:
 * имена_файлов остаются как есть). Незакрытая пометка (ответ ещё пишется) — простой текст.
 */
const EMPHASIS =
  /\*\*\*([^*\n]+?)\*\*\*|\*\*([^*\n]+?)\*\*|(?<![\p{L}\p{N}])__([^_\n]+?)__(?![\p{L}\p{N}])|\*([^*\s][^*\n]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}])/gu;

export function parseInline(text: string): AiInline[] {
  const out: AiInline[] = [];
  const push = (piece: string, bold: boolean, italic: boolean) => {
    if (piece === '') return;
    const last = out.at(-1);
    if (last && last.bold === bold && last.italic === italic) last.text += piece;
    else out.push({ text: piece, bold, italic });
  };
  let at = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    push(text.slice(at, match.index), false, false);
    const [, both, bold, boldUnderscore, italic, italicUnderscore] = match;
    if (both !== undefined) push(both, true, true);
    else if (bold !== undefined || boldUnderscore !== undefined) push(bold ?? boldUnderscore ?? '', true, false);
    else push(italic ?? italicUnderscore ?? '', false, true);
    at = match.index + match[0].length;
  }
  push(text.slice(at), false, false);
  return out;
}

export function parseAiMarkdown(text: string): AiMdBlock[] {
  const blocks: AiMdBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '' || RULE.test(line)) {
      flushParagraph();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = heading ? null : BULLET.exec(line);
    const ordered = heading || bullet ? null : ORDERED.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', inline: parseInline(heading[1] ?? '') });
    } else if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      const item = parseInline((bullet ?? ordered)?.[1] ?? '');
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered === isOrdered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered: isOrdered, items: [item] });
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}

export const inlineText = (inline: readonly AiInline[]): string => inline.map((piece) => piece.text).join('');

/** Простым текстом (выгрузка в .txt, буфер обмена): маркеры «•» и номера вместо разметки, блоки — через пустую строку. */
export function aiPlainText(text: string): string {
  return parseAiMarkdown(text)
    .map((block) => {
      if (block.kind === 'list') {
        return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '•'} ${inlineText(item)}`).join('\n');
      }
      return inlineText(block.inline);
    })
    .join('\n\n');
}
```

**В `src/shared/format.ts` заменить:**

```ts
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Время реплики: «1:05», «12:04», «1:02:05». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
```

**на:**

```ts
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Когда сделаны итоги: «27.09, 16:55» (местное время); withYear — «27.09.2026, 16:55» (для выгрузки). */
export function formatStamp(iso: string, withYear = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${withYear ? `.${d.getFullYear()}` : ''}`;
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Время реплики: «1:05», «12:04», «1:02:05». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  1071 passed (1071)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `85 passed`, `2 skipped` (проверки собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: «Итоги встречи» block in the meeting: summary, own questions, stop and update"
```

### Task 5: Итоги в поиске и в выгрузке

**Files:**
- Create: `e2e/ai-search.spec.ts`
- Modify: `src/main/ai/ai-messages.ts`, `src/main/export/docx.test.ts`, `src/main/export/docx.ts`, `src/main/export/export-meeting.test.ts`, `src/main/export/export-meeting.ts`, `src/main/index.ts`, `src/main/library/search-index.test.ts`, `src/main/library/search-index.ts`, `src/renderer/main/AiBlock.tsx`, `src/renderer/main/App.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/SearchResults.tsx`, `src/renderer/main/ai-block.test.ts`, `src/renderer/main/ai-block.ts`, `src/renderer/main/hooks.ts`, `src/renderer/main/styles.css`, `src/shared/ai.ts`, `src/shared/export-doc.test.ts`, `src/shared/export-doc.ts`, `src/shared/search.ts`

**Interfaces:**
- Consumes: `readAi`, `AI_FILE` (Task 3), `aiPlainText`, `parseAiMarkdown` (Task 4).
- Produces: `aiCaption(record, withYear?)` в `shared/ai.ts`; `ExportSummary`, `ExportDoc.summary?`, `SUMMARY_HEADING`,
  `TEXT_HEADING`, `buildExportDoc(meeting, transcript, summary?)`; `loadExportDoc(libraryDir, id, withSummary?, logger?)`;
  `SearchAiHit`, `SearchMeeting.aiHits`; `SearchView.focus.aiKey`; `AiPanel.reveal()` / `revealed`.

Поиск по всем встречам читает и `ai.json` (отпечаток — время изменения и размер, как у `transcript.json`): совпадения в
итогах и ответах — строкой «Итоги» или «Ответ на «…»» вместо времени реплики (`SearchMeeting.aiHits`), нажатие
открывает встречу с развёрнутым и показанным блоком итогов. Сохранённые итоги сразу попадают в поиск. Выгрузка (Word,
.txt, «Скопировать всё»): после шапки — раздел «Итоги встречи» (подпись «модель · дата», текст с «•» и номерами вместо
разметки), затем «Текст встречи»; испорченный `ai.json` — выгрузка без итогов. «Скопировать для ИИ» и то, что видит
модель, — без итогов.

- [ ] **Step 1: Тесты**

**Создать `e2e/ai-search.spec.ts`:**

```ts
// Итоги в поиске и в выгрузке (План 9, решения §2.3): готовые итоги лежат в ai.json встречи.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';

async function launchWithSummary(): Promise<LaunchedApp> {
  const app = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной', speakerNames: { s1: 'Ирина' } }) }],
    transcripts: {
      [ID]: {
        schemaVersion: 1,
        model: 'gigaam-v3-e2e-rnnt',
        createdAt: '2026-09-27T13:52:00.000Z',
        speakers: [{ id: 's1', kind: 'other' }],
        segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false }],
      },
    },
  });
  const answer = { model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-09-27T13:55:00.000Z', status: 'done' };
  await writeFile(
    join(app.libraryDir, ID, 'ai.json'),
    JSON.stringify({
      version: 1,
      summary: { ...answer, text: '### Главное\n- Подрядчики — **отдельной строкой**.', sourceHash: 'h' },
      questions: [{ ...answer, id: 'q1', question: 'Кто такой Олег?', answer: 'Олег считает смету.' }],
    }),
  );
  return app;
}

test('the search finds words of the summary and of the answers and opens the summary', async () => {
  launched = await launchWithSummary();
  const { page } = launched;
  // Свёрнутый блок разворачивается, когда переходят из найденного.
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('region', { name: 'Итоги встречи' }).getByRole('button', { name: 'Свернуть' }).click();
  await expect(page.getByRole('region', { name: 'Итоги встречи' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('подрядчики');
  const found = page.getByRole('navigation', { name: 'Найдено' });
  await expect(found.getByRole('button', { name: /^Итоги/ })).toContainText('Подрядчики — отдельной строкой.');
  await found.getByRole('button', { name: /^Итоги/ }).click();
  await expect(page.getByRole('region', { name: 'Итоги встречи' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('смету');
  await expect(found.getByRole('button', { name: /^Ответ на «Кто такой Олег\?»/ })).toBeVisible();
});

test('«Скопировать всё» and the saved text start with the summary, «Скопировать для ИИ» does not', async () => {
  launched = await launchWithSummary();
  const { app, page, root } = launched;
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Скопировать всё' }).click();
  const copied = () => app.evaluate(({ clipboard }) => clipboard.readText());
  await expect.poll(copied).toContain('Итоги встречи\nQwen3.5 9B · 27.09.2026, ');
  const text = await copied();
  expect(text).toContain('• Подрядчики — отдельной строкой.');
  expect(text.indexOf('Итоги встречи')).toBeLessThan(text.indexOf('Текст встречи'));
  expect(text).not.toContain('Олег');

  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect.poll(copied).not.toContain('Итоги встречи');

  const file = join(root, 'итоги.txt');
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog;
  }, file);
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: /Сохранить как текст/ }).click();
  await expect.poll(() => readFile(file, 'utf8').catch(() => '')).toContain('Итоги встречи');
});
```

**В `src/main/export/docx.test.ts` заменить:**

```ts
    expect(document).not.toContain('Участники');
  });
});
```

**на:**

```ts
    expect(document).not.toContain('Участники');
  });
});

describe('toDocx with a summary', () => {
  it('puts the summary with its heading and bullets before the text of the meeting', async () => {
    const withSummary: ExportDoc = {
      ...doc,
      summary: {
        caption: 'Qwen3.5 9B · 27.09.2026, 16:55',
        blocks: [
          { kind: 'heading', inline: [{ text: 'Главное', bold: false, italic: false }] },
          { kind: 'list', ordered: false, items: [[{ text: 'Бюджет', bold: true, italic: false }]] },
        ],
      },
    };
    const { document } = await unpack(await toDocx(withSummary));
    for (const text of ['Итоги встречи', 'Qwen3.5 9B · 27.09.2026, 16:55', 'Главное', '• ', 'Бюджет', 'Текст встречи']) {
      expect(document).toContain(text);
    }
    expect(document.indexOf('Итоги встречи')).toBeLessThan(document.indexOf('Текст встречи'));
    expect(document.indexOf('Текст встречи')).toBeLessThan(document.indexOf('Смотри, по бюджету.'));
  });
});
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { copyForAi, copyMeeting, exportTexts, saveMeeting, type ExportDeps } from './export-meeting';
```

**на:**

```ts
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { aiPath } from '../ai/ai-store';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { copyForAi, copyMeeting, exportTexts, saveMeeting, type ExportDeps } from './export-meeting';
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
    expect(d.logger.warn).toHaveBeenCalled();
  });
});
```

**на:**

```ts
    expect(d.logger.warn).toHaveBeenCalled();
  });
});

describe('the summary in the export', () => {
  const summary = {
    text: '- Бюджет — **половина**.',
    model: 'qwen3.5-9b',
    modelTitle: 'Qwen3.5 9B',
    createdAt: '2026-09-27T13:55:00.000Z',
    status: 'done',
    sourceHash: 'h',
  };

  it('copies and saves the summary first, but «Скопировать для ИИ» stays without it', async () => {
    const { lib, id } = await meetingWithText();
    writeFileSync(aiPath(lib, id), JSON.stringify({ version: 1, summary, questions: [] }));
    const d = deps(lib);
    await copyMeeting(d, id);
    expect(d.clipboard[0]?.text).toContain('Итоги встречи');
    expect(d.clipboard[0]?.text).toContain('• Бюджет — половина.');
    expect(d.clipboard[0]?.html).toContain('<b>половина</b>');
    await copyForAi(d, id);
    expect(d.clipboard[1]?.text).not.toContain('Итоги встречи');
    expect(d.clipboard[1]?.text).not.toContain('Бюджет');
  });

  it('exports without the summary when ai.json is broken', async () => {
    const { lib, id } = await meetingWithText();
    writeFileSync(aiPath(lib, id), '{ сломано');
    const d = deps(lib);
    await copyMeeting(d, id);
    expect(d.clipboard[0]?.text).not.toContain('Итоги встречи');
    expect(d.clipboard[0]?.text).toContain('Смотри, по бюджету.');
  });
});
```

**В `src/main/library/search-index.test.ts` заменить:**

```ts
      titleRanges: [],
      createdAt: '2026-09-03T10:00:00.000Z',
      total: 1,
      hits: [
        {
          segmentId: 'seg-1',
```

**на:**

```ts
      titleRanges: [],
      createdAt: '2026-09-03T10:00:00.000Z',
      total: 1,
      aiHits: [],
      hits: [
        {
          segmentId: 'seg-1',
```

**В `src/main/library/search-index.test.ts` заменить:**

```ts
    for (let i = 0; i <= SEARCH_MAX_MEETINGS; i++) {
      index.entries.set(`m${i}`, {
        stamp: 'x',
        meeting: { id: `m${i}`, title: 'Бюджет', titleNorm: 'бюджет', createdAt: '2026-09-01', speakerNames: {}, segments: [] },
      });
    }
    // Папка совпадает — обновлять индекс поиску незачем.
```

**на:**

```ts
    for (let i = 0; i <= SEARCH_MAX_MEETINGS; i++) {
      index.entries.set(`m${i}`, {
        stamp: 'x',
        meeting: { id: `m${i}`, title: 'Бюджет', titleNorm: 'бюджет', createdAt: '2026-09-01', speakerNames: {}, segments: [], ai: [] },
      });
    }
    // Папка совпадает — обновлять индекс поиску незачем.
```

**В `src/main/library/search-index.test.ts` заменить:**

```ts
    await expect(t.index.refresh()).rejects.toThrow('Не удалось прочитать библиотеку');
  });
});
```

**на:**

```ts
    await expect(t.index.refresh()).rejects.toThrow('Не удалось прочитать библиотеку');
  });
});

describe('SearchIndex — summaries and answers', () => {
  const writeAi = (lib: string, n: number, ai: unknown) => writeFileSync(join(lib, idOf(n), 'ai.json'), JSON.stringify(ai));
  const answer = { model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-10-14T10:00:00.000Z', status: 'done' };

  it('finds words in the summary and in the answers, signed instead of the time', async () => {
    const lib = makeTempDir();
    writeMeeting(lib, 1, 'Созвон', [{ text: 'Про бюджет.' }]);
    writeAi(lib, 1, {
      version: 1,
      summary: { ...answer, text: '### Главное\n- **Бюджет** — половина плана.', sourceHash: 'h' },
      questions: [{ ...answer, id: 'q1', question: 'Что решили по бюджету на октябрь и подрядчикам вообще?', answer: 'Бюджет урезан.' }],
    });
    const index = new SearchIndex({ libraryDir: () => lib, logger });
    const [found] = (await index.search('бюджет')).meetings;
    expect(found?.total).toBe(3);
    expect(found?.aiHits.map((h) => [h.key, h.label, h.text])).toEqual([
      ['summary', 'Итоги', 'Главное\n\n• Бюджет — половина плана.'],
      ['q:q1', 'Ответ на «Что решили по бюджету на октябрь и подр…»', 'Бюджет урезан.'],
    ]);
    // Вместе с итогами и ответами — не больше трёх строк.
    expect(found?.hits).toHaveLength(1);
  });

  it('reads the summary again when ai.json changes, and ignores a broken one', async () => {
    const lib = makeTempDir();
    writeMeeting(lib, 1, 'Созвон', [{ text: 'Текст.' }]);
    const index = new SearchIndex({ libraryDir: () => lib, logger });
    expect((await index.search('перенос')).meetings).toEqual([]);
    writeAi(lib, 1, { version: 1, summary: { ...answer, text: 'Перенос на пятницу.', sourceHash: 'h' }, questions: [] });
    await index.refresh();
    expect((await index.search('перенос')).meetings).toHaveLength(1);
    writeFileSync(join(lib, idOf(1), 'ai.json'), '{ сломано');
    await index.refresh();
    expect((await index.search('перенос')).meetings).toEqual([]);
    expect((await index.search('текст')).meetings).toHaveLength(1);
  });
});
```

**В `src/renderer/main/ai-block.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_AI_DOC, type AiFailure, type AiJob, type AiMeetingView } from '../../shared/ai';
import { aiBlockVisible, aiBusyText, aiCaption, aiFinishedText, aiStageText } from './ai-block';

const job = (over: Partial<AiJob> = {}): AiJob => ({
  meetingId: 'm',
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import { aiCaption, EMPTY_AI_DOC, type AiFailure, type AiJob, type AiMeetingView } from '../../shared/ai';
import { aiBlockVisible, aiBusyText, aiFinishedText, aiStageText } from './ai-block';

const job = (over: Partial<AiJob> = {}): AiJob => ({
  meetingId: 'm',
```

**В `src/shared/export-doc.test.ts` заменить:**

```ts
    expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2');
  });
});
```

**на:**

```ts
    expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2');
  });
});

describe('the summary in the export', () => {
  const summary = {
    text: '### Главное\n- Бюджет — **половина**.\n1. Написать Олегу.',
    model: 'qwen3.5-9b',
    modelTitle: 'Qwen3.5 9B',
    createdAt: new Date(2026, 8, 27, 16, 55).toISOString(),
    status: 'stopped' as const,
    sourceHash: 'h',
  };
  const doc = buildExportDoc(meeting, { segments: [seg(708, 's1', 'Смотри.')] }, summary);

  it('goes first, signed with the model and the date, then comes the text of the meeting', () => {
    expect(toPlainText(doc)).toBe(
      [
        'Созвон с Ириной',
        '27 сентября 2026, 16:20 · 32 мин',
        'Участники: Ирина',
        '',
        'Итоги встречи',
        'Qwen3.5 9B · 27.09.2026, 16:55 · остановлено',
        '',
        'Главное',
        '',
        '• Бюджет — половина.',
        '',
        '1. Написать Олегу.',
        '',
        'Текст встречи',
        '',
        'Ирина [11:48]',
        'Смотри.',
        '',
      ].join('\n'),
    );
  });

  it('keeps bold and lists in the formatted text', () => {
    const html = toHtml(doc);
    expect(html).toContain('<h2 style="font-size:13pt">Итоги встречи</h2>');
    expect(html).toContain('<ul><li>Бюджет — <b>половина</b>.</li></ul>');
    expect(html).toContain('<ol><li>Написать Олегу.</li></ol>');
    expect(html.indexOf('Итоги встречи')).toBeLessThan(html.indexOf('Текст встречи'));
  });

  it('is left out without a summary', () => {
    const plain = buildExportDoc(meeting, { segments: [seg(708, 's1', 'Смотри.')] });
    expect(plain.summary).toBeUndefined();
    expect(toPlainText(plain)).not.toContain('Итоги встречи');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/export/docx.test.ts src/main/export/export-meeting.test.ts src/main/library/search-index.test.ts src/renderer/main/ai-block.test.ts src/shared/export-doc.test.ts`
Ожидается: FAIL — у `buildExportDoc` нет раздела итогов, в найденном нет `aiHits`.

- [ ] **Step 3: Код**

**В `src/main/ai/ai-messages.ts` заменить:**

```ts
 * Отпечаток текста встречи, который видела модель. Название не входит: переименование встречи — не правка текста, и
 * пометка «текст меняли» из-за него не появляется.
 */
export const sourceHash = (doc: ExportDoc): string =>
  createHash('sha256').update(toPlainText({ ...doc, title: '' })).digest('hex');

/** Встреча с запросом помещается в окно модели, и ещё остаётся место под ответ. */
export const fitsWindow = (tokens: number, contextTokens: number): boolean =>
```

**на:**

```ts
 * Отпечаток текста встречи, который видела модель. Название не входит: переименование встречи — не правка текста, и
 * пометка «текст меняли» из-за него не появляется.
 */
export function sourceHash(doc: ExportDoc): string {
  const text = toPlainText({ title: '', metaLine: doc.metaLine, participantsLine: doc.participantsLine, paragraphs: doc.paragraphs });
  return createHash('sha256').update(text).digest('hex');
}

/** Встреча с запросом помещается в окно модели, и ещё остаётся место под ответ. */
export const fitsWindow = (tokens: number, contextTokens: number): boolean =>
```

**Заменить всё содержимое `src/main/export/docx.ts` на:**

```ts
// «Сохранить в Word (.docx)»: та же раскладка, что у .txt и буфера обмена (shared/export-doc.ts), с оформлением.
import { Document, Packer, Paragraph, TextRun, type IRunOptions } from 'docx';
import type { AiInline, AiMdBlock } from '../../shared/ai-markdown';
import { SUMMARY_HEADING, TEXT_HEADING, type ExportDoc, type ExportSummary } from '../../shared/export-doc';

/** Шрифт, который есть в Word и на Windows, и на Mac. */
const FONT = 'Calibri';
/** Размеры в Word — в половинах пункта. */
const BODY_SIZE = 22;
const TITLE_SIZE = 32;
/** Заголовки разделов «Итоги встречи» и «Текст встречи». */
const SECTION_SIZE = 26;
const META_GREY = '7A7A7A';
const TIME_GREY = '8A8A8A';
/** Отступ перед абзацем говорящего — в двадцатых долях пункта (10 пт). */
const PARAGRAPH_GAP = 200;

/** Перевод строки внутри текста — разрыв строки в Word (как Shift+Enter). */
const lines = (text: string, options: Omit<IRunOptions, 'text' | 'break'> = {}): TextRun[] =>
  text.split(/\r\n?|\n/).map((line, i) => new TextRun({ ...options, text: line, ...(i > 0 && { break: 1 }) }));

/** Кусок итогов с жирным и курсивом (allBold — весь кусок жирным: заголовок); переводы строк — разрывы строк. */
const inlineRuns = (inline: readonly AiInline[], allBold = false): TextRun[] =>
  inline.flatMap((piece) =>
    lines(piece.text, { ...((piece.bold || allBold) && { bold: true }), ...(piece.italic && { italics: true }) }),
  );

/** Блок итогов: заголовок раздела — жирным, пункты списка — с «•» или номером и отступом. */
function blockParagraphs(block: AiMdBlock): Paragraph[] {
  if (block.kind === 'heading') {
    return [new Paragraph({ spacing: { before: 120 }, keepNext: true, children: inlineRuns(block.inline, true) })];
  }
  if (block.kind === 'paragraph') return [new Paragraph({ children: inlineRuns(block.inline) })];
  return block.items.map(
    (item, i) =>
      new Paragraph({
        indent: { left: 360, hanging: 360 },
        children: [new TextRun({ text: `${block.ordered ? `${i + 1}.` : '•'} ` }), ...inlineRuns(item)],
      }),
  );
}

/** Заголовок раздела: «Итоги встречи», «Текст встречи». */
function section(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 60 },
    keepNext: true,
    children: [new TextRun({ text: title, bold: true, size: SECTION_SIZE })],
  });
}

function summaryParagraphs(summary: ExportSummary): Paragraph[] {
  return [
    section(SUMMARY_HEADING),
    new Paragraph({ children: lines(summary.caption, { color: META_GREY }) }),
    ...summary.blocks.flatMap(blockParagraphs),
    section(TEXT_HEADING),
  ];
}

export async function toDocx(doc: ExportDoc): Promise<Buffer> {
  const children = [
    new Paragraph({ children: lines(doc.title, { bold: true, size: TITLE_SIZE }), spacing: { after: 60 } }),
    new Paragraph({ children: lines(doc.metaLine, { color: META_GREY }) }),
  ];
  if (doc.participantsLine) children.push(new Paragraph({ children: lines(doc.participantsLine) }));
  if (doc.summary) children.push(...summaryParagraphs(doc.summary));
  for (const p of doc.paragraphs) {
    children.push(
      new Paragraph({
        spacing: { before: PARAGRAPH_GAP },
        // Имя не отрывается от своего текста на другую страницу.
        keepNext: true,
        children: [new TextRun({ text: p.speaker, bold: true }), new TextRun({ text: ` [${p.time}]`, color: TIME_GREY })],
      }),
      new Paragraph({ children: lines(p.text) }),
    );
  }
  const file = new Document({
    creator: 'TextMeet',
    title: doc.title,
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE, language: { value: 'ru-RU' } } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(file);
}
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
// берётся из файлов встречи на диске — с правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { resolveAiPrompt, withAiPrompt } from '../../shared/ai-prompt';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { humanFsError } from '../fs/fs-errors';
import { readMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
```

**на:**

```ts
// берётся из файлов встречи на диске — с правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import type { AiSummary } from '../../shared/ai';
import { resolveAiPrompt, withAiPrompt } from '../../shared/ai-prompt';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { readAi } from '../ai/ai-store';
import { humanFsError } from '../fs/fs-errors';
import { readMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

/** Встреча для выгрузки и для модели итогов: текст с правками и именами спикеров; нет текста — понятная ошибка. */
export async function loadExportDoc(libraryDir: string, meetingId: string): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
    const transcript = await readTranscript(libraryDir, meetingId);
    doc = transcript ? buildExportDoc(meeting, transcript) : null;
  } catch (err) {
    throw new Error(exportTexts.unreadable, { cause: err });
  }
```

**на:**

```ts
/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

/** Итоги для выгрузки; файла нет или он не читается — выгрузка без итогов (текст встречи важнее). */
async function summaryOf(libraryDir: string, meetingId: string, logger?: Pick<Logger, 'warn'>): Promise<AiSummary | null> {
  try {
    return (await readAi(libraryDir, meetingId)).doc.summary;
  } catch (err) {
    logger?.warn('Итоги встречи не прочитались — выгрузка без них', err);
    return null;
  }
}

/**
 * Встреча для выгрузки и для модели итогов: текст с правками и именами спикеров; нет текста — понятная ошибка.
 * withSummary — с итогами в начале (Word, .txt, «Скопировать всё»); модели и «Скопировать для ИИ» — без них.
 */
export async function loadExportDoc(
  libraryDir: string,
  meetingId: string,
  withSummary = false,
  logger?: Pick<Logger, 'warn'>,
): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
    const transcript = await readTranscript(libraryDir, meetingId);
    const summary = withSummary ? await summaryOf(libraryDir, meetingId, logger) : null;
    doc = transcript ? buildExportDoc(meeting, transcript, summary) : null;
  } catch (err) {
    throw new Error(exportTexts.unreadable, { cause: err });
  }
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}
```

**на:**

```ts
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId, true, deps.logger);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts

/** Окно сохранения → файл. Не атомарно: файл, открытый в Word, даёт понятное «файл занят другой программой». */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId);
  const dir = await startDir(deps);
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
```

**на:**

```ts

/** Окно сохранения → файл. Не атомарно: файл, открытый в Word, даёт понятное «файл занят другой программой». */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId, true, deps.logger);
  const dir = await startDir(deps);
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
```

**В `src/main/index.ts` заменить:**

```ts
    now: () => new Date(),
    logger,
    changed: (state) => sendToMain(IPC.aiState, state),
    saved: (id) => sendToMain(IPC.aiChanged, id),
  });
  aiRunner = ai;
  const queue = new TranscriptionQueue({
```

**на:**

```ts
    now: () => new Date(),
    logger,
    changed: (state) => sendToMain(IPC.aiState, state),
    saved: (id) => {
      // Слова итогов и ответов сразу ищутся.
      searchIndex.invalidate(id);
      searchIndex.refresh().catch((err: unknown) => logger.warn('Поиск не обновился', err));
      sendToMain(IPC.aiChanged, id);
    },
  });
  aiRunner = ai;
  const queue = new TranscriptionQueue({
```

**В `src/main/library/search-index.ts` заменить:**

```ts
import { join } from 'node:path';
import { MEETING_ID_PATTERN, MeetingSchema } from '../../shared/meeting';
import { SEARCH_HITS_PER_MEETING, SEARCH_MAX_MEETINGS, type SearchMeeting, type SearchResult } from '../../shared/search';
import { findRanges, isSearchable, matchesAll, normalize, queryWords, snippet } from '../../shared/search-text';
import { speakerLabel, type SpeakerId } from '../../shared/transcript';
import { humanFsError } from '../fs/fs-errors';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { MEETING_FILE } from './library';
import { readTranscript, TRANSCRIPT_FILE } from './transcript-store';

/** Сколько встреч поиск читает одновременно: тысячи открытых файлов разом упёрлись бы в предел системы. */
```

**на:**

```ts
import { join } from 'node:path';
import { MEETING_ID_PATTERN, MeetingSchema } from '../../shared/meeting';
import { SEARCH_HITS_PER_MEETING, SEARCH_MAX_MEETINGS, type SearchMeeting, type SearchResult } from '../../shared/search';
import { aiPlainText } from '../../shared/ai-markdown';
import { findRanges, isSearchable, matchesAll, normalize, queryWords, snippet } from '../../shared/search-text';
import { speakerLabel, type SpeakerId } from '../../shared/transcript';
import { humanFsError } from '../fs/fs-errors';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { MEETING_FILE } from './library';
import { AI_FILE, readAi } from '../ai/ai-store';
import { readTranscript, TRANSCRIPT_FILE } from './transcript-store';

/** Сколько встреч поиск читает одновременно: тысячи открытых файлов разом упёрлись бы в предел системы. */
```

**В `src/main/library/search-index.ts` заменить:**

```ts
  norm: string;
}

interface IndexedMeeting {
  id: string;
  title: string;
```

**на:**

```ts
  norm: string;
}

/** Итоги или ответ на свой вопрос — простым текстом, без разметки. */
interface IndexedAi {
  key: string;
  label: string;
  text: string;
  norm: string;
}

/** Вопрос в подписи найденного ответа — не длиннее. */
const QUESTION_LABEL_CHARS = 40;

function questionLabel(question: string): string {
  const short = question.length > QUESTION_LABEL_CHARS ? `${question.slice(0, QUESTION_LABEL_CHARS - 1).trimEnd()}…` : question;
  return `Ответ на «${short}»`;
}

interface IndexedMeeting {
  id: string;
  title: string;
```

**В `src/main/library/search-index.ts` заменить:**

```ts
  createdAt: string;
  speakerNames: Readonly<Record<string, string>>;
  segments: IndexedSegment[];
}

interface Entry {
  /** Время изменения и размер meeting.json и transcript.json: изменились — встречу перечитать. */
  stamp: string;
  /** null — встречу не удалось прочитать (в поиске её нет). */
  meeting: IndexedMeeting | null;
```

**на:**

```ts
  createdAt: string;
  speakerNames: Readonly<Record<string, string>>;
  segments: IndexedSegment[];
  ai: IndexedAi[];
}

interface Entry {
  /** Время изменения и размер meeting.json, transcript.json и ai.json: изменились — встречу перечитать. */
  stamp: string;
  /** null — встречу не удалось прочитать (в поиске её нет). */
  meeting: IndexedMeeting | null;
```

**В `src/main/library/search-index.ts` заменить:**

```ts

  private async update(dir: string, id: string): Promise<void> {
    const folder = join(dir, id);
    const stamp = `${await fileStamp(join(folder, MEETING_FILE))}|${await fileStamp(join(folder, TRANSCRIPT_FILE))}`;
    if (this.entries.get(id)?.stamp === stamp) return;
    const { meeting, retry } = await this.read(dir, id);
    // Пока читали, папку библиотеки сменили — эта встреча уже не наша.
    // Сбой чтения (файл занят) — отпечаток не запоминаем: следующее обновление прочитает встречу снова.
    if (this.dir === dir) this.entries.set(id, { stamp: retry ? '' : stamp, meeting });
  }

  private async read(dir: string, id: string): Promise<{ meeting: IndexedMeeting | null; retry: boolean }> {
```

**на:**

```ts

  private async update(dir: string, id: string): Promise<void> {
    const folder = join(dir, id);
    const stamp = [MEETING_FILE, TRANSCRIPT_FILE, AI_FILE].map((file) => fileStamp(join(folder, file)));
    const joined = (await Promise.all(stamp)).join('|');
    if (this.entries.get(id)?.stamp === joined) return;
    const { meeting, retry } = await this.read(dir, id);
    // Пока читали, папку библиотеки сменили — эта встреча уже не наша.
    // Сбой чтения (файл занят) — отпечаток не запоминаем: следующее обновление прочитает встречу снова.
    if (this.dir === dir) this.entries.set(id, { stamp: retry ? '' : joined, meeting });
  }

  private async read(dir: string, id: string): Promise<{ meeting: IndexedMeeting | null; retry: boolean }> {
```

**В `src/main/library/search-index.ts` заменить:**

```ts
        retry = typeof (err as NodeJS.ErrnoException).code === 'string';
        this.deps.logger.warn(`Поиск: текст встречи ${id} не прочитан`, err);
      }
      return {
        meeting: {
          id,
```

**на:**

```ts
        retry = typeof (err as NodeJS.ErrnoException).code === 'string';
        this.deps.logger.warn(`Поиск: текст встречи ${id} не прочитан`, err);
      }
      let ai: IndexedAi[] = [];
      try {
        // Испорченный ai.json — итогов в поиске нет; файл занят — перечитаем.
        const { doc } = await readAi(dir, id);
        const items = [
          ...(doc.summary ? [{ key: 'summary', label: 'Итоги', text: aiPlainText(doc.summary.text) }] : []),
          ...doc.questions.map((q) => ({ key: `q:${q.id}`, label: questionLabel(q.question), text: aiPlainText(q.answer) })),
        ];
        ai = items.map((item) => ({ ...item, norm: normalize(item.text) }));
      } catch (err) {
        retry = true;
        this.deps.logger.warn(`Поиск: итоги встречи ${id} не прочитаны`, err);
      }
      return {
        meeting: {
          id,
```

**В `src/main/library/search-index.ts` заменить:**

```ts
          createdAt: meeting.createdAt,
          speakerNames: meeting.speakerNames,
          segments,
        },
        retry,
      };
```

**на:**

```ts
          createdAt: meeting.createdAt,
          speakerNames: meeting.speakerNames,
          segments,
          ai,
        },
        retry,
      };
```

**В `src/main/library/search-index.ts` заменить:**

```ts
function searchMeeting(meeting: IndexedMeeting, words: readonly string[]): SearchMeeting | null {
  const titleMatch = matchesAll(meeting.titleNorm, words);
  const matched = meeting.segments.filter((s) => matchesAll(s.norm, words));
  if (!titleMatch && matched.length === 0) return null;
  return {
    meetingId: meeting.id,
    title: meeting.title,
    titleRanges: titleMatch ? findRanges(meeting.titleNorm, words) : [],
    createdAt: meeting.createdAt,
    total: matched.length,
    hits: matched.slice(0, SEARCH_HITS_PER_MEETING).map((s) => {
      const cut = snippet(s.text, findRanges(s.norm, words), SNIPPET_CHARS);
      return {
        segmentId: s.id,
```

**на:**

```ts
function searchMeeting(meeting: IndexedMeeting, words: readonly string[]): SearchMeeting | null {
  const titleMatch = matchesAll(meeting.titleNorm, words);
  const matched = meeting.segments.filter((s) => matchesAll(s.norm, words));
  const matchedAi = meeting.ai.filter((a) => matchesAll(a.norm, words));
  if (!titleMatch && matched.length === 0 && matchedAi.length === 0) return null;
  const aiHits = matchedAi.slice(0, SEARCH_HITS_PER_MEETING).map((a) => {
    const cut = snippet(a.text, findRanges(a.norm, words), SNIPPET_CHARS);
    return { key: a.key, label: a.label, text: cut.text, ranges: cut.ranges };
  });
  return {
    meetingId: meeting.id,
    title: meeting.title,
    titleRanges: titleMatch ? findRanges(meeting.titleNorm, words) : [],
    createdAt: meeting.createdAt,
    total: matched.length + matchedAi.length,
    aiHits,
    hits: matched.slice(0, SEARCH_HITS_PER_MEETING - aiHits.length).map((s) => {
      const cut = snippet(s.text, findRanges(s.norm, words), SNIPPET_CHARS);
      return {
        segmentId: s.id,
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AiFailure, AiJob, AiMeetingView, AiQuestion, AiStartResult } from '../../shared/ai';
import { AI_QUESTION_MAX } from '../../shared/ai';
import { aiPlainText } from '../../shared/ai-markdown';
import {
  AI_FOOT,
  aiBlockVisible,
  aiBusyText,
  aiCaption,
  aiFinishedText,
  aiStageText,
  ASK_PLACEHOLDER,
```

**на:**

```tsx
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AI_QUESTION_MAX, aiCaption, type AiFailure, type AiJob, type AiMeetingView, type AiQuestion, type AiStartResult } from '../../shared/ai';
import { aiPlainText } from '../../shared/ai-markdown';
import {
  AI_FOOT,
  aiBlockVisible,
  aiBusyText,
  aiFinishedText,
  aiStageText,
  ASK_PLACEHOLDER,
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
  collapse(): void;
  /** «Закрыть» у «Модель не скачана». */
  close(): void;
  deleteQuestion(questionId: string): void;
}
```

**на:**

```tsx
  collapse(): void;
  /** «Закрыть» у «Модель не скачана». */
  close(): void;
  /** Развернуть блок и показать его (переход из найденного). */
  reveal(): void;
  /** Растёт с каждым reveal(): блок прокручивается в поле зрения. */
  revealed: number;
  deleteQuestion(questionId: string): void;
}
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
  const [opened, setOpened] = useState(false);
  const [noModel, setNoModel] = useState(false);
  const [collapsed, setCollapsed] = useState(() => collapsedMeetings.has(meetingId));
  const job = state.job?.meetingId === meetingId ? state.job : null;
  const other = state.job && state.job.meetingId !== meetingId ? state.job : null;
  const failure = state.failures.find((f) => f.meetingId === meetingId) ?? null;
```

**на:**

```tsx
  const [opened, setOpened] = useState(false);
  const [noModel, setNoModel] = useState(false);
  const [collapsed, setCollapsed] = useState(() => collapsedMeetings.has(meetingId));
  const [revealed, setRevealed] = useState(0);
  const job = state.job?.meetingId === meetingId ? state.job : null;
  const other = state.job && state.job.meetingId !== meetingId ? state.job : null;
  const failure = state.failures.find((f) => f.meetingId === meetingId) ?? null;
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
    [meetingId],
  );

  const expand = () => {
    collapsedMeetings.delete(meetingId);
    setCollapsed(false);
    setOpened(true);
  };

  const start = async (run: () => Promise<AiStartResult>): Promise<boolean> => {
    expand();
```

**на:**

```tsx
    [meetingId],
  );

  const expand = useCallback(() => {
    collapsedMeetings.delete(meetingId);
    setCollapsed(false);
    setOpened(true);
  }, [meetingId]);
  const reveal = useCallback(() => {
    expand();
    setRevealed((n) => n + 1);
  }, [expand]);

  const start = async (run: () => Promise<AiStartResult>): Promise<boolean> => {
    expand();
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
      setNoModel(false);
      setOpened(false);
    },
    deleteQuestion: (questionId) => {
      window.textmeet
        .deleteAiQuestion({ meetingId, questionId })
```

**на:**

```tsx
      setNoModel(false);
      setOpened(false);
    },
    reveal,
    revealed,
    deleteQuestion: (questionId) => {
      window.textmeet
        .deleteAiQuestion({ meetingId, questionId })
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousJob = useRef<AiJob | null>(null);
  const { view, job, other, failure } = panel;

  // По окончании ответа — «Итоги готовы» / «Ответ готов» экранному диктору (поток текста ему не читается).
```

**на:**

```tsx
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousJob = useRef<AiJob | null>(null);
  const section = useRef<HTMLElement>(null);
  const { view, job, other, failure } = panel;

  // По окончании ответа — «Итоги готовы» / «Ответ готов» экранному диктору (поток текста ему не читается).
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
    if (text) setAnnouncement(text);
  }, [job, failure]);

  if (!panel.visible) return null;
  const summary = view?.doc.summary ?? null;
  const questions = view?.doc.questions ?? [];
```

**на:**

```tsx
    if (text) setAnnouncement(text);
  }, [job, failure]);

  // Перешли из найденного — блок прокручивается в поле зрения.
  useEffect(() => {
    if (panel.revealed > 0) section.current?.scrollIntoView({ block: 'nearest' });
  }, [panel.revealed]);

  if (!panel.visible) return null;
  const summary = view?.doc.summary ?? null;
  const questions = view?.doc.questions ?? [];
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
  else if (summary) caption = aiCaption(summary);

  return (
    <section className="ai" aria-label="Итоги встречи" aria-busy={job ? true : undefined}>
      <div className="ai-h">
        <b>Итоги встречи</b>
        {caption && <span>{caption}</span>}
```

**на:**

```tsx
  else if (summary) caption = aiCaption(summary);

  return (
    <section ref={section} className="ai" aria-label="Итоги встречи" aria-busy={job ? true : undefined}>
      <div className="ai-h">
        <b>Итоги встречи</b>
        {caption && <span>{caption}</span>}
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
          {searching ? (
            <SearchResults
              state={search}
              selected={focus ? { meetingId: focus.meetingId, segmentId: focus.segmentId } : null}
              onOpen={(id, segmentId) => {
                setSelection({ kind: 'meeting', id });
                setFocus((prev) => ({ meetingId: id, segmentId, nonce: (prev?.nonce ?? 0) + 1 }));
              }}
            />
          ) : (
```

**на:**

```tsx
          {searching ? (
            <SearchResults
              state={search}
              selected={focus ? { meetingId: focus.meetingId, segmentId: focus.segmentId, aiKey: focus.aiKey } : null}
              onOpen={(id, segmentId, aiKey) => {
                setSelection({ kind: 'meeting', id });
                setFocus((prev) => ({ meetingId: id, segmentId, aiKey: aiKey ?? null, nonce: (prev?.nonce ?? 0) + 1 }));
              }}
            />
          ) : (
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort, formatLongDate } from '../../shared/format';
import type { ImportProgress } from '../../shared/import';
```

**на:**

```tsx
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort, formatLongDate } from '../../shared/format';
import type { ImportProgress } from '../../shared/import';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const speakerNames = JSON.stringify(meeting.speakerNames);
  const textKey = useMemo(() => [shownTranscript, speakerNames], [shownTranscript, speakerNames]);
  const ai = useAiPanel(meeting.id, textKey, onError);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
```

**на:**

```tsx
  const speakerNames = JSON.stringify(meeting.speakerNames);
  const textKey = useMemo(() => [shownTranscript, speakerNames], [shownTranscript, speakerNames]);
  const ai = useAiPanel(meeting.id, textKey, onError);
  // Перешли из найденного в итогах или ответах — блок итогов разворачивается и показывается.
  const searchFocus = useContext(SearchViewContext).focus;
  const aiFocus = searchFocus?.meetingId === meeting.id && searchFocus.aiKey !== null ? searchFocus.nonce : null;
  const { reveal } = ai;
  useEffect(() => {
    if (aiFocus !== null) reveal();
  }, [aiFocus, reveal]);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
```

**В `src/renderer/main/SearchResults.tsx` заменить:**

```tsx

interface Props {
  state: SearchState;
  /** Открытая из найденного реплика — выделена. */
  selected: { meetingId: string; segmentId: string | null } | null;
  /** Открыть встречу; segmentId — прокрутить к этой реплике. */
  onOpen(meetingId: string, segmentId: string | null): void;
}

function MeetingHits({ meeting, selected, onOpen }: { meeting: SearchMeeting } & Omit<Props, 'state'>) {
  const more = meeting.total - meeting.hits.length;
  return (
    <div className="rg" role="group" aria-label={meeting.title}>
      <button type="button" className="rg-h" onClick={() => onOpen(meeting.meetingId, null)}>
```

**на:**

```tsx

interface Props {
  state: SearchState;
  /** Открытое из найденного — выделено: реплика или (aiKey) итоги и ответы. */
  selected: { meetingId: string; segmentId: string | null; aiKey: string | null } | null;
  /** Открыть встречу; segmentId — прокрутить к этой реплике; aiKey — показать блок итогов. */
  onOpen(meetingId: string, segmentId: string | null, aiKey?: string): void;
}

function MeetingHits({ meeting, selected, onOpen }: { meeting: SearchMeeting } & Omit<Props, 'state'>) {
  const more = meeting.total - meeting.hits.length - meeting.aiHits.length;
  return (
    <div className="rg" role="group" aria-label={meeting.title}>
      <button type="button" className="rg-h" onClick={() => onOpen(meeting.meetingId, null)}>
```

**В `src/renderer/main/SearchResults.tsx` заменить:**

```tsx
        </b>
        <span>{searchMeetingMeta(meeting.createdAt, meeting.total, new Date())}</span>
      </button>
      {meeting.hits.map((hit) => (
        <button
          key={hit.segmentId}
```

**на:**

```tsx
        </b>
        <span>{searchMeetingMeta(meeting.createdAt, meeting.total, new Date())}</span>
      </button>
      {meeting.aiHits.map((hit) => (
        <button
          key={hit.key}
          type="button"
          className="hit ai-hit"
          aria-current={selected?.meetingId === meeting.meetingId && selected.aiKey === hit.key ? 'true' : undefined}
          onClick={() => onOpen(meeting.meetingId, null, hit.key)}
        >
          <span>
            <span className="hw">{hit.label}</span>
            <Marked text={hit.text} ranges={hit.ranges} />
          </span>
        </button>
      ))}
      {meeting.hits.map((hit) => (
        <button
          key={hit.segmentId}
```

**В `src/renderer/main/ai-block.ts` заменить:**

```ts
// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiAnswerStatus, AiFailure, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';
import { formatStamp } from '../../shared/format';

export const ASK_PLACEHOLDER = 'Свой вопрос к встрече — например, что решили по срокам?';
/** Пока пишутся итоги этой встречи, спросить нельзя. */
```

**на:**

```ts
// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiFailure, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';

export const ASK_PLACEHOLDER = 'Свой вопрос к встрече — например, что решили по срокам?';
/** Пока пишутся итоги этой встречи, спросить нельзя. */
```

**В `src/renderer/main/ai-block.ts` заменить:**

```ts
  return null;
}

/** Подпись итогов или ответа: «Qwen3.5 9B · 27.09, 16:55»; остановленный — с «· остановлено». */
export function aiCaption(record: { modelTitle: string; createdAt: string; status: AiAnswerStatus }, withYear = false): string {
  const parts = [record.modelTitle, formatStamp(record.createdAt, withYear)];
  if (record.status === 'stopped') parts.push('остановлено');
  return parts.join(' · ');
}

/** Модель занята другой встречей: блок называет её. */
export function aiBusyText(job: AiJob): string {
  return job.kind === 'summary'
```

**на:**

```ts
  return null;
}

/** Модель занята другой встречей: блок называет её. */
export function aiBusyText(job: AiJob): string {
  return job.kind === 'summary'
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
    const bump = () => setAgain((n) => n + 1);
    window.addEventListener('focus', bump);
    const unsubscribe = window.textmeet.onLibraryChanged(bump);
    return () => {
      window.removeEventListener('focus', bump);
      unsubscribe();
    };
  }, [active]);
```

**на:**

```ts
    const bump = () => setAgain((n) => n + 1);
    window.addEventListener('focus', bump);
    const unsubscribe = window.textmeet.onLibraryChanged(bump);
    // Итоги или ответ сохранились — их слова тоже ищутся.
    const unsubscribeAi = window.textmeet.onAiChanged(bump);
    return () => {
      window.removeEventListener('focus', bump);
      unsubscribe();
      unsubscribeAi();
    };
  }, [active]);
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
   * nonce — каждый переход новый: повторный щелчок по той же реплике снова к ней прокручивает. segmentId null — перешли
   * по названию встречи: она открывается сверху (в том числе уже открытая).
   */
  focus: { meetingId: string; segmentId: string | null; nonce: number } | null;
  /** Текст встречи правили — повторить поиск. */
  refresh(): void;
}
```

**на:**

```ts
   * nonce — каждый переход новый: повторный щелчок по той же реплике снова к ней прокручивает. segmentId null — перешли
   * по названию встречи: она открывается сверху (в том числе уже открытая).
   */
  focus: { meetingId: string; segmentId: string | null; aiKey: string | null; nonce: number } | null;
  /** Текст встречи правили — повторить поиск. */
  refresh(): void;
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
  background: var(--sel);
}

.hit .ht {
  font-family: var(--f-text);
  font-size: 11.5px;
```

**на:**

```css
  background: var(--sel);
}

/* Совпадение в итогах или ответе: подпись вместо времени реплики. */
.hit.ai-hit {
  grid-template-columns: 1fr;
}

.hit .ht {
  font-family: var(--f-text);
  font-size: 11.5px;
```

**В `src/shared/ai.ts` заменить:**

```ts
// Итоги встречи и свои вопросы (решения Плана 9, §2.2, §5): файл ai.json в папке встречи и что main сообщает окну о
// работе модели. Схемы (zod) нужны только main; окно и preload берут отсюда типы.
import { z } from 'zod';

/** Свой вопрос к встрече — не длиннее. */
export const AI_QUESTION_MAX = 1000;
```

**на:**

```ts
// Итоги встречи и свои вопросы (решения Плана 9, §2.2, §5): файл ai.json в папке встречи и что main сообщает окну о
// работе модели. Схемы (zod) нужны только main; окно и preload берут отсюда типы.
import { z } from 'zod';
import { formatStamp } from './format';

/** Свой вопрос к встрече — не длиннее. */
export const AI_QUESTION_MAX = 1000;
```

**В `src/shared/ai.ts` заменить:**

```ts

export const EMPTY_AI_DOC: AiDoc = { version: 1, summary: null, questions: [] };

/** Итоги и вопросы встречи глазами окна. */
export interface AiMeetingView {
  doc: AiDoc;
```

**на:**

```ts

export const EMPTY_AI_DOC: AiDoc = { version: 1, summary: null, questions: [] };

/** Подпись итогов или ответа: «Qwen3.5 9B · 27.09, 16:55»; остановленный — с «· остановлено»; withYear — для выгрузки. */
export function aiCaption(record: { modelTitle: string; createdAt: string; status: AiAnswerStatus }, withYear = false): string {
  const parts = [record.modelTitle, formatStamp(record.createdAt, withYear)];
  if (record.status === 'stopped') parts.push('остановлено');
  return parts.join(' · ');
}

/** Итоги и вопросы встречи глазами окна. */
export interface AiMeetingView {
  doc: AiDoc;
```

**Заменить всё содержимое `src/shared/export-doc.ts` на:**

```ts
// Выгрузка встречи: одна раскладка текста для «Скопировать всё», .txt и .docx (решения Плана 5, §2.3).
// Чистые функции без зависимостей: тексту в буфере обмена, в .txt и в Word не разойтись.
import { aiCaption, type AiSummary } from './ai';
import { inlineText, parseAiMarkdown, type AiInline, type AiMdBlock } from './ai-markdown';
import { formatDurationShort, formatLongDate, formatTimestamp } from './format';
import type { Meeting } from './meeting';
import { speakerLabel, type Transcript } from './transcript';

export interface ExportParagraph {
  /** Подпись спикера: имя из встречи, иначе «Я» / «Спикер N». */
  speaker: string;
  /** Начало первой реплики абзаца: «0:05», «11:48», «1:02:05». */
  time: string;
  /** Реплики подряд через пробел; перевод строки внутри реплики сохраняется. */
  text: string;
}

/** Итоги встречи в выгрузке (решения Плана 9, §2.3): в начале, перед текстом встречи. */
export interface ExportSummary {
  /** «Qwen3.5 9B · 27.09.2026, 16:55» (у остановленных — «· остановлено»). */
  caption: string;
  blocks: AiMdBlock[];
}

export interface ExportDoc {
  title: string;
  /** «27 сентября 2026, 16:20 · 32 мин»; длительность неизвестна — только дата. */
  metaLine: string;
  /** «Участники: Я, Ирина, Спикер 2» — в порядке первого появления; реплик нет — null. */
  participantsLine: string | null;
  paragraphs: ExportParagraph[];
  /** Итоги встречи; нет — раздела нет (и в «Скопировать для ИИ», и в том, что видит модель). */
  summary?: ExportSummary;
}

export const SUMMARY_HEADING = 'Итоги встречи';
export const TEXT_HEADING = 'Текст встречи';

/**
 * Управляющие символы недопустимы в XML — Word счёл бы файл повреждённым. Вертикальная табуляция (её даёт вставка из
 * Word) и одинокий \r — перевод строки, остальное убирается; табуляция и переводы строк остаются.
 */
function cleanText(text: string): string {
  return text.replace(/\r\n?|\u000b/g, '\n').replace(/[\u0000-\u0008\u000c\u000e-\u001f\u007f]/g, '');
}

/** Пустые строки внутри реплики (правка «Раз.⏎⏎Два.») — один перевод строки: в .txt они выглядели бы новым абзацем. */
const BLANK_LINES = /\n(?:[^\S\n]*\n)+/g;

/** Подряд идущие реплики одного спикера — один абзац; пустые реплики пропускаются. */
export function buildExportDoc(
  meeting: Pick<Meeting, 'title' | 'createdAt' | 'durationSec' | 'speakerNames'>,
  transcript: Pick<Transcript, 'segments'>,
  summary: AiSummary | null = null,
): ExportDoc {
  const paragraphs: (ExportParagraph & { speakerId: string })[] = [];
  for (const segment of transcript.segments) {
    const text = cleanText(segment.text).trim().replace(BLANK_LINES, '\n');
    if (text === '') continue;
    const last = paragraphs.at(-1);
    if (last && last.speakerId === segment.speakerId) {
      last.text = `${last.text} ${text}`;
      continue;
    }
    paragraphs.push({
      speakerId: segment.speakerId,
      speaker: cleanText(speakerLabel(segment.speakerId, meeting.speakerNames)),
      time: formatTimestamp(segment.start),
      text,
    });
  }
  const participants = [...new Set(paragraphs.map((p) => p.speaker))];
  const meta = [formatLongDate(meeting.createdAt)];
  if (meeting.durationSec !== null) meta.push(formatDurationShort(meeting.durationSec));
  return {
    title: cleanText(meeting.title),
    metaLine: meta.join(' · '),
    participantsLine: participants.length > 0 ? `Участники: ${participants.join(', ')}` : null,
    paragraphs: paragraphs.map(({ speaker, time, text }) => ({ speaker, time, text })),
    ...(summary && { summary: { caption: aiCaption(summary, true), blocks: parseAiMarkdown(cleanText(summary.text)) } }),
  };
}

/** Итоги простым текстом: заголовки и абзацы — строками, пункты — с «•» или номером. */
function summaryLines(summary: ExportSummary): string[] {
  const lines: string[] = [];
  for (const block of summary.blocks) {
    lines.push('');
    if (block.kind === 'list') {
      block.items.forEach((item, i) => lines.push(`${block.ordered ? `${i + 1}.` : '•'} ${inlineText(item)}`));
    } else {
      lines.push(inlineText(block.inline));
    }
  }
  return lines;
}

/** Обычный текст: шапка, пустая строка, абзацы «Имя [время]» + текст через пустую строку. */
export function toPlainText(doc: ExportDoc, eol = '\n'): string {
  const lines = [doc.title, doc.metaLine];
  if (doc.participantsLine) lines.push(doc.participantsLine);
  if (doc.summary) lines.push('', SUMMARY_HEADING, doc.summary.caption, ...summaryLines(doc.summary), '', TEXT_HEADING);
  for (const p of doc.paragraphs) lines.push('', `${p.speaker} [${p.time}]`, p.text);
  return lines.join('\n').replace(/\r\n?|\n/g, eol) + eol;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlLines = (text: string): string => escapeHtml(text).replace(/\r\n?|\n/g, '<br>');

const inlineHtml = (inline: readonly AiInline[]): string =>
  inline
    .map((piece) => {
      let html = htmlLines(piece.text);
      if (piece.italic) html = `<i>${html}</i>`;
      if (piece.bold) html = `<b>${html}</b>`;
      return html;
    })
    .join('');

function blockHtml(block: AiMdBlock): string {
  if (block.kind === 'heading') return `<p><b>${inlineHtml(block.inline)}</b></p>`;
  if (block.kind === 'paragraph') return `<p>${inlineHtml(block.inline)}</p>`;
  const tag = block.ordered ? 'ol' : 'ul';
  return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`;
}

/** Оформленный текст для буфера обмена (вставка в Word, Google Docs): имена жирным, время серым. */
export function toHtml(doc: ExportDoc): string {
  const parts = [
    `<h1 style="font-size:16pt">${htmlLines(doc.title)}</h1>`,
    `<p style="color:#7a7a7a">${htmlLines(doc.metaLine)}</p>`,
  ];
  if (doc.participantsLine) parts.push(`<p>${htmlLines(doc.participantsLine)}</p>`);
  if (doc.summary) {
    parts.push(
      `<h2 style="font-size:13pt">${SUMMARY_HEADING}</h2>`,
      `<p style="color:#7a7a7a">${htmlLines(doc.summary.caption)}</p>`,
      ...doc.summary.blocks.map(blockHtml),
      `<h2 style="font-size:13pt">${TEXT_HEADING}</h2>`,
    );
  }
  for (const p of doc.paragraphs) {
    parts.push(
      `<p><b>${htmlLines(p.speaker)}</b> <span style="color:#8a8a8a">[${escapeHtml(p.time)}]</span><br>${htmlLines(p.text)}</p>`,
    );
  }
  return parts.join('\n');
}
```

**В `src/shared/search.ts` заменить:**

```ts
  ranges: TextRange[];
}

export interface SearchMeeting {
  meetingId: string;
  title: string;
  /** Совпадения в названии; пусто — название не совпало. */
  titleRanges: TextRange[];
  createdAt: string;
  /** Сколько реплик встречи найдено всего. */
  total: number;
  /** Первые найденные реплики (не больше SEARCH_HITS_PER_MEETING). */
  hits: SearchHit[];
}
```

**на:**

```ts
  ranges: TextRange[];
}

/** Совпадение в итогах встречи или в ответе на свой вопрос (решения Плана 9, §2.3). */
export interface SearchAiHit {
  /** «summary» — итоги; «q:<id>» — ответ на вопрос с этим id. */
  key: string;
  /** Подпись вместо времени реплики: «Итоги», «Ответ на «…»». */
  label: string;
  /** Отрывок вокруг совпадения. */
  text: string;
  ranges: TextRange[];
}

export interface SearchMeeting {
  meetingId: string;
  title: string;
  /** Совпадения в названии; пусто — название не совпало. */
  titleRanges: TextRange[];
  createdAt: string;
  /** Сколько совпадений во встрече всего: реплики, итоги, ответы. */
  total: number;
  /** Совпадения в итогах и ответах — первыми (не больше SEARCH_HITS_PER_MEETING). */
  aiHits: SearchAiHit[];
  /** Первые найденные реплики (вместе с aiHits — не больше SEARCH_HITS_PER_MEETING). */
  hits: SearchHit[];
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  1079 passed (1079)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `87 passed`, `2 skipped` (проверки собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: summaries and answers in the search, the summary at the top of the export"
```

### Task 6: Доработки по ревью: движок не остаётся висеть, удаление модели, честное «Итоги готовы»

**Files:**
- Modify: `e2e/ai-engine.spec.ts`, `package.json`, `scripts/fetch-llama.mjs`, `src/main/ai/ai-messages.test.ts`, `src/main/ai/ai-messages.ts`, `src/main/ai/ai-runner.test.ts`, `src/main/ai/ai-runner.ts`, `src/main/ai/llama-server.test.ts`, `src/main/ai/llama-server.ts`, `src/main/ai/sse.test.ts`, `src/main/ai/sse.ts`, `src/main/ipc.ts`, `src/renderer/main/AiBlock.tsx`, `src/renderer/main/ai-block.test.ts`, `src/renderer/main/ai-block.ts`, `src/renderer/main/hooks.ts`, `src/shared/ai.ts`, `src/test-support/fake-llama-server.mjs`

**Interfaces:**
- Consumes: всё из Task 1–5.
- Produces: `AiFinished`, `AiState.finished`; `AiRunner.withEngineStopped(work)` (вместо `stopEngine` в `IpcDeps`);
  `llamaArgs(model, port)` без ключа; `aiFinishedText(previous, current, finished)`; `AiPanel.finished`.

Ревью кода (typescript-reviewer) не нашло критичного; исправлено:
- запуск движка, отменённый выходом из программы или удалением модели, больше не оставляет `llama-server` работать
  после выхода (проверка отмены после поиска порта, процесс не загрузивший модель — завершается сам); нажатие «Итоги
  встречи» во время выхода ничего не запускает;
- «Удалить» модель и новый запрос не мешают друг другу: `withEngineStopped` — движок завершается, и до конца удаления
  новые запросы получают «занято»;
- удаление встречи в момент, когда запрос по ней только готовится, — запрос не начинается;
- после «Остановить» во время «Готовим модель…» и истёкшего времени загрузки следующий запрос запускает движок заново, а
  не получает старую ошибку;
- «Итоги готовы» / «Ответ готов» — только для дописанного и сохранённого ответа (`AiState.finished`); окно узнаёт о
  записи `ai.json` уже после последнего состояния — без мелькания прежних итогов;
- ключ движка — в переменной `LLAMA_API_KEY`, а не в строке запуска; разбор потока не цитирует ответ модели в журнал;
- отпечаток текста встречи — только участники и реплики (часовой пояс и длительность пометку «текст меняли» не дают);
- `npm run dev` / `start` без интернета не падают из-за движка (`fetch-llama.mjs --optional`).
Отложено — в «Известных ограничениях» в начале плана.

- [ ] **Step 1: Тесты**

**В `e2e/ai-engine.spec.ts` заменить:**

```ts
  expect(request?.max_tokens).toBe(2048);
  expect(request?.messages[0]?.content).toContain('не придумывай');
  expect(request?.messages[1]?.content).toContain('Спикер 1 [0:05]\nПереносим запуск на пятницу.');
  expect(await page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, failures: [] });
});

test('without a downloaded model nothing starts', async () => {
```

**на:**

```ts
  expect(request?.max_tokens).toBe(2048);
  expect(request?.messages[0]?.content).toContain('не придумывай');
  expect(request?.messages[1]?.content).toContain('Спикер 1 [0:05]\nПереносим запуск на пятницу.');
  expect(await page.evaluate(() => window.textmeet.getAiState())).toMatchObject({ job: null, failures: [] });
});

test('without a downloaded model nothing starts', async () => {
```

**В `e2e/ai-engine.spec.ts` заменить:**

```ts
  await page.evaluate((id) => window.textmeet.summarize(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState().then((s) => s.job?.stage ?? null))).toBe('writing');
  await page.evaluate((id) => window.textmeet.deleteMeeting(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, failures: [] });
  const [trashed] = await readdir(trashDir);
  expect(existsSync(join(trashDir, trashed!, 'ai.json'))).toBe(false);
});
```

**на:**

```ts
  await page.evaluate((id) => window.textmeet.summarize(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState().then((s) => s.job?.stage ?? null))).toBe('writing');
  await page.evaluate((id) => window.textmeet.deleteMeeting(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, finished: null, failures: [] });
  const [trashed] = await readdir(trashDir);
  expect(existsSync(join(trashDir, trashed!, 'ai.json'))).toBe(false);
});
```

**В `src/main/ai/ai-messages.test.ts` заменить:**

```ts
});

describe('sourceHash', () => {
  it('changes with the text and the speaker names, but not with the title', () => {
    const base = sourceHash(doc);
    expect(sourceHash({ ...doc, title: 'Новое название' })).toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ирина', time: '0:05', text: 'Переносим на четверг.' }] })).not.toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ира', time: '0:05', text: 'Переносим на пятницу.' }] })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
```

**на:**

```ts
});

describe('sourceHash', () => {
  it('changes with the text and the speaker names, but not with the title, the date or the duration', () => {
    const base = sourceHash(doc);
    expect(sourceHash({ ...doc, title: 'Новое название', metaLine: '27 сентября 2026, 17:20 · 33 мин' })).toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ирина', time: '0:05', text: 'Переносим на четверг.' }] })).not.toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ира', time: '0:05', text: 'Переносим на пятницу.' }] })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
```

**В `src/main/ai/ai-runner.test.ts` заменить:**

```ts
    expect(view.stale).toBe(false);
    expect(t.saved).toHaveBeenCalledWith(id);
    expect(t.engine.idle).toHaveBeenCalled();
    expect(t.runner.state()).toEqual({ job: null, failures: [] });
  });

  it('asks a question with the question alone as the task, and keeps the questions in order', async () => {
```

**на:**

```ts
    expect(view.stale).toBe(false);
    expect(t.saved).toHaveBeenCalledWith(id);
    expect(t.engine.idle).toHaveBeenCalled();
    expect(t.runner.state()).toEqual({ job: null, finished: { meetingId: id, kind: 'summary', status: 'done' }, failures: [] });
  });

  it('asks a question with the question alone as the task, and keeps the questions in order', async () => {
```

**В `src/main/ai/ai-runner.test.ts` заменить:**

```ts
    expect(await t.runner.ask(first, 'Что?')).toBe('busy');
  });

  it('says when no model is downloaded, without starting anything', async () => {
    const t = setup({ model: null });
    const id = await meeting(t.lib);
```

**на:**

```ts
    expect(await t.runner.ask(first, 'Что?')).toBe('busy');
  });

  it('two presses at once start one request', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    const results = await Promise.all([t.runner.summarize(id), t.runner.ask(id, 'Что?')]);
    expect(results.sort()).toEqual(['busy', 'started']);
  });

  it('a meeting deleted while its request is being prepared does not start', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    const started = t.runner.summarize(id);
    t.runner.forget(id);
    expect(await started).toBe('busy');
    expect(t.engine.ready).not.toHaveBeenCalled();
    expect(t.runner.isBusy()).toBe(false);
  });

  it('after quitting began, no new request starts and the engine is not started again', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    const preparing = t.runner.summarize(id);
    const quit = t.runner.disposeForQuit();
    expect(await preparing).toBe('busy');
    await quit;
    expect(await t.runner.summarize(id)).toBe('busy');
    expect(t.engine.ready).not.toHaveBeenCalled();
  });

  it('deleting a model stops the engine first and holds new requests until it is done', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    let during: string | null = null;
    await t.runner.withEngineStopped(async () => {
      during = await t.runner.summarize(id);
    });
    expect(during).toBe('busy');
    expect(t.engine.stop).toHaveBeenCalled();
    expect(await t.runner.summarize(id)).toBe('started');
    // Пока модель отвечает, удалить её нельзя.
    await expect(t.runner.withEngineStopped(async () => undefined)).rejects.toThrow(aiTexts.modelBusy);
  });

  it('tells the window about the saved answer only after the last state, and how it ended', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    // Что окно знало в момент «ai.json записан»: модель уже свободна, и понятно, чем кончился запрос.
    const seen: unknown[] = [];
    t.saved.mockImplementation(() => seen.push(t.states.at(-1)));
    (await t.write('- Итоги')).finish();
    await idle(t.runner);
    await vi.waitFor(() => expect(t.saved).toHaveBeenCalledWith(id));
    expect(seen[0]).toMatchObject({ job: null, finished: { meetingId: id, kind: 'summary', status: 'done' } });

    await t.runner.summarize(id);
    expect(t.runner.state().finished).toBeNull();
    await t.write('- Ещё');
    t.runner.stop();
    await idle(t.runner);
    expect(t.runner.state().finished).toEqual({ meetingId: id, kind: 'summary', status: 'stopped' });
  });

  it('says when no model is downloaded, without starting anything', async () => {
    const t = setup({ model: null });
    const id = await meeting(t.lib);
```

**В `src/main/ai/llama-server.test.ts` заменить:**

```ts
    ...options,
  });
  servers.push(server);
  const starts = async () =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => line.includes('"start"'))
      .map((line) => (JSON.parse(line) as { args: string[] }).args);
  return { server, logger, starts };
}

const model = { path: 'M/qwen.gguf', contextTokens: 65_536 };
```

**на:**

```ts
    ...options,
  });
  servers.push(server);
  const launches = async () =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => line.includes('"start"'))
      .map((line) => JSON.parse(line) as { args: string[]; pid: number });
  const starts = async () => (await launches()).map((l) => l.args);
  /** Процесс последнего запуска жив. */
  const lastAlive = async () => {
    const pid = (await launches()).at(-1)?.pid;
    if (pid === undefined) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  return { server, logger, starts, lastAlive };
}

const model = { path: 'M/qwen.gguf', contextTokens: 65_536 };
```

**В `src/main/ai/llama-server.test.ts` заменить:**

```ts
    expect(llamaServerFile('darwin')).toBe('llama-server');
  });

  it('starts the engine with the settings of the plan, on 127.0.0.1 with a key', () => {
    expect(llamaArgs({ path: 'M/q.gguf', contextTokens: 40_960 }, 5000, 'key')).toEqual([
      '-m', 'M/q.gguf', '-c', '40960', '-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0', '-np', '1', '--jinja', '--fit', 'on',
      '--no-webui', '--log-colors', 'off', '--host', '127.0.0.1', '--port', '5000', '--api-key', 'key',
    ]);
  });
});
```

**на:**

```ts
    expect(llamaServerFile('darwin')).toBe('llama-server');
  });

  it('starts the engine with the settings of the plan, on 127.0.0.1, without the key on the command line', () => {
    expect(llamaArgs({ path: 'M/q.gguf', contextTokens: 40_960 }, 5000)).toEqual([
      '-m', 'M/q.gguf', '-c', '40960', '-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0', '-np', '1', '--jinja', '--fit', 'on',
      '--no-webui', '--log-colors', 'off', '--host', '127.0.0.1', '--port', '5000',
    ]);
  });
});
```

**В `src/main/ai/llama-server.test.ts` заменить:**

```ts
  });

  it('stops after a quiet while and starts again on the next request', async () => {
    const { server, starts } = await setup({}, { idleMs: 50 });
    await server.ready(model);
    server.idle();
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    await server.ready(model);
    expect(await starts()).toHaveLength(2);
  });
```

**на:**

```ts
  });

  it('stops after a quiet while and starts again on the next request', async () => {
    const { server, starts, lastAlive } = await setup({}, { idleMs: 50 });
    await server.ready(model);
    server.idle();
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    await vi.waitFor(async () => expect(await lastAlive()).toBe(false));
    await server.ready(model);
    expect(await starts()).toHaveLength(2);
  });
```

**В `src/main/ai/llama-server.test.ts` заменить:**

```ts
  });

  it('gives up on a model that does not load in time and leaves no process behind', async () => {
    const { server, logger } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '60000' }, { startTimeoutMs: 300 });
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine' });
    expect(server.isRunning()).toBe(false);
    // В журнал — вывод сервера, чтобы было понятно, на чём он застрял.
    const logged = logger.error.mock.calls.find((call) => call[0] === 'Движок итогов не загрузил модель');
    expect(String((logged?.[1] as Error | undefined)?.message)).toContain('fake llama-server: loading model');
```

**на:**

```ts
  });

  it('gives up on a model that does not load in time and leaves no process behind', async () => {
    const { server, logger, lastAlive } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '60000' }, { startTimeoutMs: 300 });
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine' });
    expect(server.isRunning()).toBe(false);
    await vi.waitFor(async () => expect(await lastAlive()).toBe(false));
    // В журнал — вывод сервера, чтобы было понятно, на чём он застрял.
    const logged = logger.error.mock.calls.find((call) => call[0] === 'Движок итогов не загрузил модель');
    expect(String((logged?.[1] as Error | undefined)?.message)).toContain('fake llama-server: loading model');
```

**В `src/main/ai/llama-server.test.ts` заменить:**

```ts
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine', message: 'движок итогов не запустился' });
  });

  it('stops waiting when asked, but keeps loading the model for the next request', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '300' });
    const controller = new AbortController();
```

**на:**

```ts
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine', message: 'движок итогов не запустился' });
  });

  it('a stop right after the start leaves no process behind', async () => {
    const { server, lastAlive } = await setup();
    const starting = server.ready(model).catch(() => undefined);
    await server.stop();
    await starting;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await lastAlive()).toBe(false);
    expect(server.isRunning()).toBe(false);
  });

  it('a model that did not load in time after «Остановить» is started anew by the next request', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '60000' }, { startTimeoutMs: 300 });
    const controller = new AbortController();
    const waiting = server.ready(model, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    // Время загрузки вышло — процесс завершается сам; следующий запрос запускает новый, а не получает старую ошибку.
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    const next = server.ready(model).catch(() => undefined);
    await vi.waitFor(async () => expect(await starts()).toHaveLength(2));
    await next;
  });

  it('stops waiting when asked, but keeps loading the model for the next request', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '300' });
    const controller = new AbortController();
```

**В `src/main/ai/sse.test.ts` заменить:**

```ts
    expect(chunks.map((c) => c.text)).toEqual(['а']);
  });

  it('turns an error event of the engine into an error', () => {
    expect(() => parseSse('data: {"error":{"message":"out of memory"}}\n')).toThrow('out of memory');
  });
```

**на:**

```ts
    expect(chunks.map((c) => c.text)).toEqual(['а']);
  });

  it('reports a broken piece without quoting it (the answer is meeting text)', () => {
    const error = (() => {
      try {
        parseSse('data: {"choices": [{"delta": {"content": "секрет\n');
        return null;
      } catch (err) {
        return err as Error;
      }
    })();
    expect(error?.message).toBe('движок прислал неверный кусок ответа');
    expect(error?.cause).toBeUndefined();
  });

  it('turns an error event of the engine into an error', () => {
    expect(() => parseSse('data: {"error":{"message":"out of memory"}}\n')).toThrow('out of memory');
  });
```

**В `src/renderer/main/ai-block.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { aiCaption, EMPTY_AI_DOC, type AiFailure, type AiJob, type AiMeetingView } from '../../shared/ai';
import { aiBlockVisible, aiBusyText, aiFinishedText, aiStageText } from './ai-block';

const job = (over: Partial<AiJob> = {}): AiJob => ({
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import { aiCaption, EMPTY_AI_DOC, type AiFailure, type AiFinished, type AiJob, type AiMeetingView } from '../../shared/ai';
import { aiBlockVisible, aiBusyText, aiFinishedText, aiStageText } from './ai-block';

const job = (over: Partial<AiJob> = {}): AiJob => ({
```

**В `src/renderer/main/ai-block.test.ts` заменить:**

```ts
});

describe('aiFinishedText', () => {
  it('announces a finished summary or answer, but not a failure or a request still going', () => {
    expect(aiFinishedText(job(), null, null)).toBe('Итоги готовы');
    expect(aiFinishedText(job({ kind: 'question' }), null, null)).toBe('Ответ готов');
    expect(aiFinishedText(job(), null, failure)).toBeNull();
    expect(aiFinishedText(job(), job(), null)).toBeNull();
    expect(aiFinishedText(null, null, null)).toBeNull();
  });
});
```

**на:**

```ts
});

describe('aiFinishedText', () => {
  const done = (over: Partial<AiFinished> = {}): AiFinished => ({ meetingId: 'm', kind: 'summary', status: 'done', ...over });

  it('announces a summary or an answer that was finished and saved', () => {
    expect(aiFinishedText(job(), null, done())).toBe('Итоги готовы');
    expect(aiFinishedText(job({ kind: 'question' }), null, done({ kind: 'question' }))).toBe('Ответ готов');
  });

  it('says nothing for a stopped, unsaved or failed request, or one still going', () => {
    expect(aiFinishedText(job(), null, done({ status: 'stopped' }))).toBeNull();
    expect(aiFinishedText(job(), null, null)).toBeNull();
    expect(aiFinishedText(job(), null, done({ meetingId: 'другая' }))).toBeNull();
    expect(aiFinishedText(job(), job(), done())).toBeNull();
    expect(aiFinishedText(null, null, done())).toBeNull();
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/ai/ai-messages.test.ts src/main/ai/ai-runner.test.ts src/main/ai/llama-server.test.ts src/main/ai/sse.test.ts src/renderer/main/ai-block.test.ts`
Ожидается: FAIL — в состоянии итогов нет `finished`, у `AiRunner` нет `withEngineStopped`, ключ движка ещё в строке запуска.

- [ ] **Step 3: Код**

**В `package.json` заменить:**

```json
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && npm run fetch:llama && electron-builder --win --publish never",
    "dist:mac": "npm run build && npm run fetch:llama && electron-builder --mac dir --arm64 --publish never",
    "predev": "node node_modules/electron/install.js && node scripts/fetch-llama.mjs",
    "prestart": "node node_modules/electron/install.js && node scripts/fetch-llama.mjs"
  },
  "dependencies": {
    "docx": "9.8.1",
```

**на:**

```json
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && npm run fetch:llama && electron-builder --win --publish never",
    "dist:mac": "npm run build && npm run fetch:llama && electron-builder --mac dir --arm64 --publish never",
    "predev": "node node_modules/electron/install.js && node scripts/fetch-llama.mjs --optional",
    "prestart": "node node_modules/electron/install.js && node scripts/fetch-llama.mjs --optional"
  },
  "dependencies": {
    "docx": "9.8.1",
```

**В `scripts/fetch-llama.mjs` заменить:**

```js
// Движок итогов — llama.cpp (llama-server, решения Плана 9, §4.1). Скрипт скачивает выпуск ggml-org для этой системы,
// сверяет SHA-256 и кладёт нужные файлы в vendor/llama/: оттуда их берёт electron-builder (extraResources →
// resources/llama) и версия для разработки. Уже на месте (vendor/llama/.build совпадает) — ничего не делает.
// Запуск: npm run fetch:llama (сам — перед dist:win, dist:mac и dev).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
```

**на:**

```js
// Движок итогов — llama.cpp (llama-server, решения Плана 9, §4.1). Скрипт скачивает выпуск ggml-org для этой системы,
// сверяет SHA-256 и кладёт нужные файлы в vendor/llama/: оттуда их берёт electron-builder (extraResources →
// resources/llama) и версия для разработки. Уже на месте (vendor/llama/.build совпадает) — ничего не делает.
// Запуск: npm run fetch:llama (сам — перед dist:win, dist:mac и test:llm). С --optional (перед dev и start) неудача —
// только предупреждение: без движка программа работает, нет лишь итогов.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
```

**В `scripts/fetch-llama.mjs` заменить:**

```js
}

main().catch((err) => {
  console.error(`fetch-llama: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

**на:**

```js
}

main().catch((err) => {
  const optional = process.argv.includes('--optional');
  console.error(`fetch-llama: ${err instanceof Error ? err.message : String(err)}${optional ? ' — без движка итогов' : ''}`);
  process.exit(optional ? 0 : 1);
});
```

**В `src/main/ai/ai-messages.ts` заменить:**

```ts
export const meetingText = (doc: ExportDoc): string => toPlainText(doc);

/**
 * Отпечаток текста встречи, который видела модель. Название не входит: переименование встречи — не правка текста, и
 * пометка «текст меняли» из-за него не появляется.
 */
export function sourceHash(doc: ExportDoc): string {
  const text = toPlainText({ title: '', metaLine: doc.metaLine, participantsLine: doc.participantsLine, paragraphs: doc.paragraphs });
  return createHash('sha256').update(text).digest('hex');
}
```

**на:**

```ts
export const meetingText = (doc: ExportDoc): string => toPlainText(doc);

/**
 * Отпечаток текста встречи, который видела модель: участники и реплики. Название, дата и длительность не входят:
 * переименование встречи или другой часовой пояс — не правка текста, и пометка «текст меняли» из-за них не появляется.
 */
export function sourceHash(doc: ExportDoc): string {
  const text = toPlainText({ title: '', metaLine: '', participantsLine: doc.participantsLine, paragraphs: doc.paragraphs });
  return createHash('sha256').update(text).digest('hex');
}
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
// начало, ход (не чаще 10 раз в секунду) и конец; написанное сохраняется в ai.json встречи. «Остановить» и выход из
// программы сохраняют написанное с пометкой «остановлено»; удаление встречи — ничего не сохраняет.
import { randomUUID } from 'node:crypto';
import type { AiFailure, AiJob, AiJobKind, AiStartResult, AiState } from '../../shared/ai';
import type { ExportDoc } from '../../shared/export-doc';
import { llmModel, type LlmModelId, type LlmModelInfo } from '../../shared/llm-models';
import { loadExportDoc } from '../export/export-meeting';
```

**на:**

```ts
// начало, ход (не чаще 10 раз в секунду) и конец; написанное сохраняется в ai.json встречи. «Остановить» и выход из
// программы сохраняют написанное с пометкой «остановлено»; удаление встречи — ничего не сохраняет.
import { randomUUID } from 'node:crypto';
import type { AiFailure, AiFinished, AiJob, AiJobKind, AiStartResult, AiState } from '../../shared/ai';
import type { ExportDoc } from '../../shared/export-doc';
import { llmModel, type LlmModelId, type LlmModelInfo } from '../../shared/llm-models';
import { loadExportDoc } from '../export/export-meeting';
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
  controller: AbortController;
  /** Встречу удалили — написанное не сохраняется. */
  discard: boolean;
  done: Promise<void>;
}
```

**на:**

```ts
  controller: AbortController;
  /** Встречу удалили — написанное не сохраняется. */
  discard: boolean;
  /** Ответ записан в ai.json — окну сказать после последнего состояния. */
  saved: boolean;
  done: Promise<void>;
}
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
export class AiRunner {
  private running: Running | null = null;
  /** Запрос готовится (модель, текст встречи): второй в это время — «занято». */
  private starting = false;
  private readonly failures = new Map<string, AiFailure>();
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
```

**на:**

```ts
export class AiRunner {
  private running: Running | null = null;
  /** Запрос готовится (модель, текст встречи): второй в это время — «занято». */
  private starting: { meetingId: string; forgotten: boolean } | null = null;
  /** Движок остановлен на время удаления модели или навсегда (выход): новые запросы — «занято». */
  private engineHeld = false;
  private disposed = false;
  private finished: AiFinished | null = null;
  private readonly failures = new Map<string, AiFailure>();
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
  constructor(private readonly deps: AiRunnerDeps) {}

  state(): AiState {
    return { job: this.running?.job ?? null, failures: [...this.failures.values()] };
  }

  isBusy(): boolean {
    return this.running !== null || this.starting;
  }

  /** «Итоги встречи» и «Обновить»: итоги по запросу для ИИ из настроек. */
```

**на:**

```ts
  constructor(private readonly deps: AiRunnerDeps) {}

  state(): AiState {
    return { job: this.running?.job ?? null, finished: this.finished, failures: [...this.failures.values()] };
  }

  isBusy(): boolean {
    return this.running !== null || this.starting !== null;
  }

  /** «Итоги встречи» и «Обновить»: итоги по запросу для ИИ из настроек. */
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
    if (this.failures.delete(meetingId)) this.emit(true);
  }

  /** Встречу удаляют: её запрос останавливается без сохранения, неудача забывается. */
  forget(meetingId: string): void {
    const running = this.running;
    if (running?.job.meetingId === meetingId) {
      running.discard = true;
```

**на:**

```ts
    if (this.failures.delete(meetingId)) this.emit(true);
  }

  /** Встречу удаляют: её запрос останавливается без сохранения (и готовящийся не начнётся), неудача забывается. */
  forget(meetingId: string): void {
    if (this.starting?.meetingId === meetingId) this.starting.forgotten = true;
    const running = this.running;
    if (running?.job.meetingId === meetingId) {
      running.discard = true;
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
    this.dismiss(meetingId);
  }

  /** Завершить движок (перед удалением модели: файл модели открыт, пока он работает). */
  stopEngine(): Promise<void> {
    return this.deps.engine.stop();
  }

  /** Выход из программы: идущий ответ сохраняется как остановленный (ждём до 2 с), движок завершается. */
  async disposeForQuit(): Promise<void> {
    const running = this.running;
    if (running) {
      running.controller.abort();
```

**на:**

```ts
    this.dismiss(meetingId);
  }

  /**
   * Удалить модель: пока работает движок, её файл открыт (Windows его не удалит) — движок завершается, и до конца
   * удаления новые запросы получают «занято». Модель отвечает — отказ.
   */
  async withEngineStopped<T>(work: () => Promise<T>): Promise<T> {
    if (this.isBusy() || this.engineHeld) throw new Error(aiTexts.modelBusy);
    this.engineHeld = true;
    try {
      await this.deps.engine.stop();
      return await work();
    } finally {
      this.engineHeld = this.disposed;
    }
  }

  /** Выход из программы: идущий ответ сохраняется как остановленный (ждём до 2 с), движок завершается. */
  async disposeForQuit(): Promise<void> {
    // Новые запросы (нажатие во время выхода) уже не начнутся.
    this.disposed = true;
    this.engineHeld = true;
    if (this.starting) this.starting.forgotten = true;
    const running = this.running;
    if (running) {
      running.controller.abort();
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
  }

  private async start(meetingId: string, kind: AiJobKind, question: string | null): Promise<AiStartResult> {
    if (this.isBusy()) return 'busy';
    this.starting = true;
    try {
      const model = await this.deps.model();
      if (!model) return 'no-model';
      // Нет текста или он не читается — ошибка уходит в окно (как у «Скопировать всё»).
      const doc = await loadExportDoc(this.deps.libraryDir(), meetingId);
      const task = question ?? summaryTask(await this.deps.aiPrompt());
      const info = llmModel(model.id);
      const running: Running = {
        job: { meetingId, meetingTitle: doc.title, kind, question, modelTitle: info.title, stage: 'loading', text: '' },
        controller: new AbortController(),
        discard: false,
        done: Promise.resolve(),
      };
      this.failures.delete(meetingId);
      this.running = running;
      running.done = this.run(running, { model, info, doc, task });
      return 'started';
    } finally {
      this.starting = false;
      this.emit(true);
    }
  }
```

**на:**

```ts
  }

  private async start(meetingId: string, kind: AiJobKind, question: string | null): Promise<AiStartResult> {
    if (this.isBusy() || this.engineHeld) return 'busy';
    const starting = { meetingId, forgotten: false };
    this.starting = starting;
    try {
      const model = await this.deps.model();
      if (!model) return 'no-model';
      // Нет текста или он не читается — ошибка уходит в окно (как у «Скопировать всё»).
      const doc = await loadExportDoc(this.deps.libraryDir(), meetingId);
      const task = question ?? summaryTask(await this.deps.aiPrompt());
      // Пока готовились, встречу удалили или программа выходит — запрос не начинается.
      if (starting.forgotten) return 'busy';
      const info = llmModel(model.id);
      const running: Running = {
        job: { meetingId, meetingTitle: doc.title, kind, question, modelTitle: info.title, stage: 'loading', text: '' },
        controller: new AbortController(),
        discard: false,
        saved: false,
        done: Promise.resolve(),
      };
      this.failures.delete(meetingId);
      this.finished = null;
      this.running = running;
      running.done = this.run(running, { model, info, doc, task });
      return 'started';
    } finally {
      this.starting = null;
      this.emit(true);
    }
  }
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
      this.deps.engine.idle();
      this.running = null;
      this.emit(true);
    }
  }
```

**на:**

```ts
      this.deps.engine.idle();
      this.running = null;
      this.emit(true);
      // После последнего состояния: окно сразу перечитывает итоги, без мелькания прежних.
      if (running.saved) {
        try {
          this.deps.saved(running.job.meetingId);
        } catch (err) {
          this.deps.logger.error('Итоги: сбой обработчика записи', err);
        }
      }
    }
  }
```

**В `src/main/ai/ai-runner.ts` заменить:**

```ts
      this.failures.set(meetingId, { meetingId, kind, question, failure: 'save', message: aiTexts.notSaved(kind, err), text });
      return;
    }
    this.deps.saved(meetingId);
  }

  private update(running: Running, patch: Partial<AiJob>, force: boolean): void {
```

**на:**

```ts
      this.failures.set(meetingId, { meetingId, kind, question, failure: 'save', message: aiTexts.notSaved(kind, err), text });
      return;
    }
    running.saved = true;
    this.finished = { meetingId, kind, status };
  }

  private update(running: Running, patch: Partial<AiJob>, force: boolean): void {
```

**В `src/main/ai/llama-server.ts` заменить:**

```ts
/**
 * Параметры сервера: окно модели, внимание flash и сжатый кэш (память видеокарты), один запрос за раз, шаблон
 * модели (jinja), --fit — сам решает, сколько слоёв отдать видеокарте; не хватает памяти — часть остаётся на
 * процессоре.
 */
export function llamaArgs(model: LlamaModel, port: number, apiKey: string): string[] {
  return [
    '-m',
    model.path,
```

**на:**

```ts
/**
 * Параметры сервера: окно модели, внимание flash и сжатый кэш (память видеокарты), один запрос за раз, шаблон
 * модели (jinja), --fit — сам решает, сколько слоёв отдать видеокарте; не хватает памяти — часть остаётся на
 * процессоре. Ключ — не здесь, а в переменной LLAMA_API_KEY: строку запуска видят другие программы.
 */
export function llamaArgs(model: LlamaModel, port: number): string[] {
  return [
    '-m',
    model.path,
```

**В `src/main/ai/llama-server.ts` заменить:**

```ts
    '127.0.0.1',
    '--port',
    String(port),
    '--api-key',
    apiKey,
  ];
}
```

**на:**

```ts
    '127.0.0.1',
    '--port',
    String(port),
  ];
}
```

**В `src/main/ai/llama-server.ts` заменить:**

```ts

  private async start(): Promise<LlmEndpoint> {
    const port = await freePort();
    const apiKey = randomBytes(16).toString('hex');
    const command = this.deps.command();
    this.deps.logger.info('Движок итогов запускается');
    const child = spawn(command.file, [...command.args, ...llamaArgs(this.model, port, apiKey)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(command.env && { env: command.env }),
    });
    this.child = child;
    // Вывод читается всегда: непрочитанный заполнил бы канал, и сервер встал бы.
```

**на:**

```ts

  private async start(): Promise<LlmEndpoint> {
    const port = await freePort();
    // Пока искали порт, запуск отменили (выход из программы, удаление модели) — процесс не запускаем.
    if (this.stopping) throw new LlmError('engine', 'запуск движка итогов отменён');
    const apiKey = randomBytes(16).toString('hex');
    const command = this.deps.command();
    this.deps.logger.info('Движок итогов запускается');
    const child = spawn(command.file, [...command.args, ...llamaArgs(this.model, port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...(command.env ?? process.env), LLAMA_API_KEY: apiKey },
    });
    this.child = child;
    // Вывод читается всегда: непрочитанный заполнил бы канал, и сервер встал бы.
```

**В `src/main/ai/llama-server.ts` заменить:**

```ts
    try {
      await Promise.race([failed, timeout, this.waitHealthy(endpoint)]);
    } catch (err) {
      if (!this.exited) this.deps.logger.error('Движок итогов не загрузил модель', new Error(this.output.join('\n')));
      throw err;
    } finally {
      clearTimeout(timer);
```

**на:**

```ts
    try {
      await Promise.race([failed, timeout, this.waitHealthy(endpoint)]);
    } catch (err) {
      if (!this.exited && !this.stopping) {
        this.deps.logger.error('Движок итогов не загрузил модель', new Error(this.output.join('\n')));
      }
      // Не загрузился (или запуск отменили) — процесс не оставляем: следующий запрос запустит его заново.
      void this.stop();
      throw err;
    } finally {
      clearTimeout(timer);
```

**В `src/main/ai/llama-server.ts` заменить:**

```ts
    try {
      return await untilAborted(running.ready, signal);
    } catch (err) {
      // Не загрузился — процесс не оставляем: следующий запрос запустит его заново.
      if (!signal?.aborted && this.running === running) await this.stop();
      throw err;
    }
```

**на:**

```ts
    try {
      return await untilAborted(running.ready, signal);
    } catch (err) {
      // Не загрузился — процесс уже завершается сам; забываем его, следующий запрос запустит новый.
      if (!signal?.aborted && this.running === running) await this.stop();
      throw err;
    }
```

**В `src/main/ai/sse.ts` заменить:**

```ts
      chunks.push({ text: '', finishReason: null, done: true });
      continue;
    }
    const event = JSON.parse(payload) as StreamEvent;
    if (event.error) throw new Error(`движок сообщил об ошибке: ${String(event.error.message ?? 'без описания')}`);
    const choice = event.choices?.[0];
    const content = choice?.delta?.content;
```

**на:**

```ts
      chunks.push({ text: '', finishReason: null, done: true });
      continue;
    }
    let event: StreamEvent;
    try {
      event = JSON.parse(payload) as StreamEvent;
    } catch {
      // Без исходной ошибки: в её тексте — кусок ответа модели (текст встречи в журнал не пишем).
      throw new Error('движок прислал неверный кусок ответа');
    }
    if (event.error) throw new Error(`движок сообщил об ошибке: ${String(event.error.message ?? 'без описания')}`);
    const choice = event.choices?.[0];
    const content = choice?.delta?.content;
```

**В `src/main/ipc.ts` заменить:**

```ts
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  ai: Pick<AiRunner, 'state' | 'isBusy' | 'summarize' | 'ask' | 'stop' | 'dismiss' | 'forget' | 'stopEngine'>;
  downloads: {
    start(id: CatalogModelId): void;
    cancel(id: CatalogModelId): Promise<void>;
```

**на:**

```ts
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  ai: Pick<AiRunner, 'state' | 'isBusy' | 'summarize' | 'ask' | 'stop' | 'dismiss' | 'forget' | 'withEngineStopped'>;
  downloads: {
    start(id: CatalogModelId): void;
    cancel(id: CatalogModelId): Promise<void>;
```

**В `src/main/ipc.ts` заменить:**

```ts
  handle(IPC.deleteAiModel, async (arg) => {
    const id = LlmModelIdSchema.parse(arg);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    if (deps.ai.isBusy()) throw new Error(aiTexts.modelBusy);
    // Пока движок работает, файл модели открыт — Windows не даст его удалить.
    await deps.ai.stopEngine();
    try {
      await deps.models.remove(id);
    } catch (err) {
      throw new Error(transcriptionTexts.deleteModels(err), { cause: err });
    }
    // Удалили выбранную — выбирается другая скачанная (или никакая).
    return aiModelsState();
  });
```

**на:**

```ts
  handle(IPC.deleteAiModel, async (arg) => {
    const id = LlmModelIdSchema.parse(arg);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    // Пока движок работает, файл модели открыт — Windows не даст его удалить. Модель отвечает — отказ.
    await deps.ai.withEngineStopped(async () => {
      try {
        await deps.models.remove(id);
      } catch (err) {
        throw new Error(transcriptionTexts.deleteModels(err), { cause: err });
      }
    });
    // Удалили выбранную — выбирается другая скачанная (или никакая).
    return aiModelsState();
  });
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AI_QUESTION_MAX, aiCaption, type AiFailure, type AiJob, type AiMeetingView, type AiQuestion, type AiStartResult } from '../../shared/ai';
import { aiPlainText } from '../../shared/ai-markdown';
import {
  AI_FOOT,
```

**на:**

```tsx
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AI_QUESTION_MAX,
  aiCaption,
  type AiFailure,
  type AiFinished,
  type AiJob,
  type AiMeetingView,
  type AiQuestion,
  type AiStartResult,
} from '../../shared/ai';
import { aiPlainText } from '../../shared/ai-markdown';
import {
  AI_FOOT,
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
  /** Модель занята другой встречей. */
  other: AiJob | null;
  failure: AiFailure | null;
  visible: boolean;
  /** «Модель не скачана» — после нажатия «Итоги встречи» или «Спросить». */
  noModel: boolean;
```

**на:**

```tsx
  /** Модель занята другой встречей. */
  other: AiJob | null;
  failure: AiFailure | null;
  /** Последний сохранённый ответ (для экранного диктора). */
  finished: AiFinished | null;
  visible: boolean;
  /** «Модель не скачана» — после нажатия «Итоги встречи» или «Спросить». */
  noModel: boolean;
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
    job,
    other,
    failure,
    noModel,
    visible: aiBlockVisible({ view, job, failure, opened: opened || noModel, collapsed }),
    openSummary: () => {
```

**на:**

```tsx
    job,
    other,
    failure,
    finished: state.finished,
    noModel,
    visible: aiBlockVisible({ view, job, failure, opened: opened || noModel, collapsed }),
    openSummary: () => {
```

**В `src/renderer/main/AiBlock.tsx` заменить:**

```tsx
  const [announcement, setAnnouncement] = useState('');
  const previousJob = useRef<AiJob | null>(null);
  const section = useRef<HTMLElement>(null);
  const { view, job, other, failure } = panel;

  // По окончании ответа — «Итоги готовы» / «Ответ готов» экранному диктору (поток текста ему не читается).
  useEffect(() => {
    const text = aiFinishedText(previousJob.current, job, failure);
    previousJob.current = job;
    if (text) setAnnouncement(text);
  }, [job, failure]);

  // Перешли из найденного — блок прокручивается в поле зрения.
  useEffect(() => {
```

**на:**

```tsx
  const [announcement, setAnnouncement] = useState('');
  const previousJob = useRef<AiJob | null>(null);
  const section = useRef<HTMLElement>(null);
  const { view, job, other, failure, finished } = panel;

  // Ответ дописан и сохранён — «Итоги готовы» / «Ответ готов» экранному диктору (поток текста ему не читается).
  useEffect(() => {
    const text = aiFinishedText(previousJob.current, job, finished);
    previousJob.current = job;
    if (text) setAnnouncement(text);
  }, [job, finished]);

  // Перешли из найденного — блок прокручивается в поле зрения.
  useEffect(() => {
```

**В `src/renderer/main/ai-block.ts` заменить:**

```ts
// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiFailure, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';

export const ASK_PLACEHOLDER = 'Свой вопрос к встрече — например, что решили по срокам?';
/** Пока пишутся итоги этой встречи, спросить нельзя. */
```

**на:**

```ts
// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiFailure, AiFinished, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';

export const ASK_PLACEHOLDER = 'Свой вопрос к встрече — например, что решили по срокам?';
/** Пока пишутся итоги этой встречи, спросить нельзя. */
```

**В `src/renderer/main/ai-block.ts` заменить:**

```ts
  return input.opened || input.job !== null || input.failure !== null || !!doc?.summary || (doc?.questions.length ?? 0) > 0;
}

/** Ответ по встрече закончился (не сбой) — что сказать экранному диктору: «Итоги готовы» / «Ответ готов». */
export function aiFinishedText(previous: AiJob | null, current: AiJob | null, failure: AiFailure | null): string | null {
  if (!previous || current || failure) return null;
  return previous.kind === 'summary' ? 'Итоги готовы' : 'Ответ готов';
}
```

**на:**

```ts
  return input.opened || input.job !== null || input.failure !== null || !!doc?.summary || (doc?.questions.length ?? 0) > 0;
}

/**
 * Ответ по встрече дописан и сохранён — что сказать экранному диктору: «Итоги готовы» / «Ответ готов». Остановленный,
 * несохранённый и неудачный — ничего.
 */
export function aiFinishedText(previous: AiJob | null, current: AiJob | null, finished: AiFinished | null): string | null {
  if (!previous || current || !finished) return null;
  if (finished.meetingId !== previous.meetingId || finished.kind !== previous.kind || finished.status !== 'done') return null;
  return previous.kind === 'summary' ? 'Итоги готовы' : 'Ответ готов';
}
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
  return { state, error: catalogErrorText(errors), run };
}

const NO_AI: AiState = { job: null, failures: [] };

/** Работа модели для итогов: что она пишет сейчас (один запрос на всю программу) и последние неудачи по встречам. */
export function useAiState(): AiState {
```

**на:**

```ts
  return { state, error: catalogErrorText(errors), run };
}

const NO_AI: AiState = { job: null, finished: null, failures: [] };

/** Работа модели для итогов: что она пишет сейчас (один запрос на всю программу) и последние неудачи по встречам. */
export function useAiState(): AiState {
```

**В `src/shared/ai.ts` заменить:**

```ts
  text: string | null;
}

export interface AiState {
  job: AiJob | null;
  /** Последняя неудача по встрече — до следующего запроса по ней или до ухода со встречи. */
  failures: AiFailure[];
}
```

**на:**

```ts
  text: string | null;
}

/** Чем кончился последний запрос: done — дописан и сохранён, stopped — остановлен (написанное сохранено). */
export interface AiFinished {
  meetingId: string;
  kind: AiJobKind;
  status: AiAnswerStatus;
}

export interface AiState {
  job: AiJob | null;
  /** Последний сохранённый ответ — для экранного диктора («Итоги готовы»); null — с начала запроса. */
  finished: AiFinished | null;
  /** Последняя неудача по встрече — до следующего запроса по ней или до ухода со встречи. */
  failures: AiFailure[];
}
```

**В `src/test-support/fake-llama-server.mjs` заменить:**

```js
// Поддельный llama-server — только для автотестов: модульных (src/main/ai) и сквозных (TEXTMEET_TEST_LLM). Понимает
// те же параметры запуска (--port, --api-key, -c) и отвечает так же: /health, /tokenize, поток /v1/chat/completions.
// Ответ — по заданию в конце сообщения (после «---»): на вопрос (ответ до 1024 «кусочков») — «Ответ: <вопрос>»,
// иначе — итоги в разметке.
// Особые слова в задании или тексте: «УПАДИ» — процесс падает посреди ответа; «ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА» — /tokenize
```

**на:**

```js
// Поддельный llama-server — только для автотестов: модульных (src/main/ai) и сквозных (TEXTMEET_TEST_LLM). Понимает
// те же параметры запуска (--port, -c, ключ в LLAMA_API_KEY) и отвечает так же: /health, /tokenize, поток /v1/chat/completions.
// Ответ — по заданию в конце сообщения (после «---»): на вопрос (ответ до 1024 «кусочков») — «Ответ: <вопрос>»,
// иначе — итоги в разметке.
// Особые слова в задании или тексте: «УПАДИ» — процесс падает посреди ответа; «ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА» — /tokenize
```

**В `src/test-support/fake-llama-server.mjs` заменить:**

```js
  return at === -1 ? undefined : args[at + 1];
};
const port = Number(arg('--port'));
const apiKey = arg('--api-key');
const loadMs = Number(process.env.TEXTMEET_FAKE_LLM_LOAD_MS ?? 50);
const tokenMs = Number(process.env.TEXTMEET_FAKE_LLM_TOKEN_MS ?? 20);
const logFile = process.env.TEXTMEET_FAKE_LLM_LOG;
```

**на:**

```js
  return at === -1 ? undefined : args[at + 1];
};
const port = Number(arg('--port'));
// Ключ, как у настоящего сервера, — в переменной LLAMA_API_KEY.
const apiKey = process.env.LLAMA_API_KEY;
const loadMs = Number(process.env.TEXTMEET_FAKE_LLM_LOAD_MS ?? 50);
const tokenMs = Number(process.env.TEXTMEET_FAKE_LLM_TOKEN_MS ?? 20);
const logFile = process.env.TEXTMEET_FAKE_LLM_LOG;
```

**В `src/test-support/fake-llama-server.mjs` заменить:**

```js
const log = (entry) => {
  if (logFile) appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
};
log({ kind: 'start', args });
process.stderr.write('fake llama-server: loading model\n');

let loaded = false;
```

**на:**

```js
const log = (entry) => {
  if (logFile) appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
};
log({ kind: 'start', args, pid: process.pid });
process.stderr.write('fake llama-server: loading model\n');

let loaded = false;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  1088 passed (1088)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `87 passed`, `2 skipped` (проверки собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: no orphan engine on quit or delete, no request during model deletion, honest «Итоги готовы», key not on the command line"
```

### Task 7: Полная проверка, движок и установщик на этом компьютере

Как в Планах 5 и 6 — локально: сборка на GitHub — только после отправки с согласия пользователя (Task 9).

- [ ] **Step 1: Чистая установка зависимостей и все проверки**

```bash
npm ci
npm run typecheck
npm run test:coverage
npm run build
npx playwright test
```

Ожидается: `Tests  1088 passed (1088)`, покрытие не ниже 80 % по всем четырём меркам (в прототипе — 97 %); сквозные —
`87 passed`, `2 skipped` (про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 2: Настоящий движок и настоящая модель** (PowerShell)

```powershell
$env:TEXTMEET_LLM_MODELS_DIR = 'D:\TextMeet-p9\llm-root'; npm run test:llm; Remove-Item Env:TEXTMEET_LLM_MODELS_DIR
```

Ожидается: `Tests  1 passed (1)`.

- [ ] **Step 3: Установщик и проверка собранной программы**

```bash
npm run dist:win
```

Затем проверка собранной программы — путь к `TextMeet.exe` из `release/win-unpacked` (PowerShell):

```powershell
$env:TEXTMEET_PACKAGED_APP = (Resolve-Path release\win-unpacked\TextMeet.exe).Path; npx playwright test e2e/packaged.spec.ts; Remove-Item Env:TEXTMEET_PACKAGED_APP
```

Ожидается: `2 passed` (запись и расшифровка; движок итогов в `resources\llama` запускается — `build 11588`); в
`release/` — `TextMeet-Setup-0.2.0.exe` (больше прежнего примерно на 30 МБ — движок). Установленную программу
пользователя не закрывать по имени процесса.

### Task 8: Ручная проверка на Windows (контрольная точка с пользователем)

Пользователь ставит `release/TextMeet-Setup-0.2.0.exe` поверх прежней версии. Чтобы не качать 5,3 ГБ заново, перед
проверкой можно положить уже скачанную Qwen3.5 9B туда, где её ищет программа (жёсткая ссылка, место не занимает):
`%LOCALAPPDATA%\TextMeet\models\llm\qwen3.5-9b\Qwen3.5-9B-Q4_K_M.gguf` ← `D:\TextMeet-p9\models\Qwen3.5-9B-Q4_K_M.gguf`
(спросить пользователя; тогда «Скачать» только сверит файл, ~15 с). Дать простой список и дождаться ответа:

1. Настройки → «ИИ»: под «Запросом для ИИ» — «Модель для итогов», четыре модели. У Qwen3.5 9B «Скачать» → полоса и
   «… из 5,3 ГБ · осталось около …» → модель сама переходит в «Выбрана». Пока она качается, «Скачать» у других моделей
   (и во вкладке «Расшифровка») недоступна.
2. Встреча «подкаст» → «Итоги встречи»: «Готовим модель…», «Читаем встречу…», затем текст появляется по мере
   написания; через ~30–40 с — готовые итоги с подписью «Qwen3.5 9B · дата, время». Сравнить с итогами Claude.
3. Свой вопрос внизу блока (например, «О чём говорили в начале?») → ответ начинается почти сразу. «Удалить» у вопроса
   убирает его.
4. «Обновить» → «Заменить итоги?» → «Заменить» → во время написания «Остановить»: написанное остаётся с пометкой
   «остановлено».
5. Переименовать спикера в этой встрече → над итогами «Текст встречи меняли после итогов. Обновить итоги».
6. Поиск по всем встречам — слово из итогов → строка «Итоги» → открывается встреча с итогами. «Экспорт» →
   «Сохранить в Word» → в начале документа раздел «Итоги встречи», затем «Текст встречи».
7. Своя встреча (не подкаст) — итоги и вопрос; «Свернуть» прячет блок, «Итоги встречи» показывает снова.
8. Закрыть TextMeet (из трея «Выйти») → в «Диспетчере задач» нет `llama-server.exe`.

Проверка на Mac — после публикации на GitHub, вместе с Планами 5 и 6. Записать ответы — они нужны в Task 9.

### Task 9: Документы, память и слияние

- [ ] **Step 1: `docs/superpowers/plan-9-checks.md`** — как `plan-6-checks.md`: что проверено (Task 7 — числа тестов,
  `test:llm`, проверка собранной программы; Task 8 по пунктам на Windows; Mac — после публикации), что исправлено по
  ревью (Task 6), «Отложено»: пункты из раздела «Известные ограничения» в начале плана и всё, что найдёт Task 8.
- [ ] **Step 2: Спецификация и дорожная карта** — по списку §8 решений Плана 9: §3.5 (итоги и вопросы — локальная модель
  из каталога на вкладке «ИИ»; «кандидаты» убрать), §3.6 («ИИ — запрос для ИИ · каталог моделей для итогов»), §5
  (`ai.json`, `settings.aiModel`, `llama-server` в составе программы, модели — `llm/` в папке моделей), §6 (строка
  «Ошибка локальной модели» — по §6 решений). Дорожная карта: строка Плана 9 — «выполнен (Windows); проверка на Mac — после
  публикации» со ссылками на решения, план и проверки; следующий — План 8.
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: record plan 9 checks and mark plan 9 done"
```

- [ ] **Step 4: Слияние в `main` локально**

```bash
git checkout main
git merge --no-ff plan-9-local-ai -m "Merge plan 9: local model for summaries"
npm ci
npm run typecheck
npx vitest run
```

Ожидается: `Tests  1088 passed (1088)`. **`git push` — только с согласия пользователя** (и если у GitHub Actions есть
минуты); тогда же отправляются `main` и ветки Планов 5, 6 и 9, запускается `build.yml` на `main`, и пользователь проверяет
Планы 5, 6 и 9 на Mac (артефакт `TextMeet-mac`): там же — скорость итогов на M4.

- [ ] **Step 5: Память** — в `textmeet-project.md`: План 9 выполнен на Windows и слит локально; дальше — План 8.
