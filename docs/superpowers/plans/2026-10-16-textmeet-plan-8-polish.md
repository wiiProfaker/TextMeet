# TextMeet — План 8 (доводка): план выполнения

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** довести TextMeet до версии 1.0.0, которую можно отдать другим людям: итоги колонкой справа от текста, свой
значок, итоги без вступлений, защищённая сборка без тестовых подмен, лицензии, README, подсказка о новой версии,
закрытые хвосты прошлых планов, выпуск на GitHub и проверка на обеих ОС.

**Architecture:** изменения точечные, в существующих модулях; новые модули — маленькие и с одной задачей:
`src/main/test-hooks.ts` (тестовые подмены только в разработке и в тестовой копии сборки), `src/main/ai/engine-pid.ts`
(осиротевший `llama-server`), `src/main/updates/update-check.ts` (новая версия на GitHub),
`src/main/recording/recorder-watchdog.ts` (зависшее окно записи), `src/renderer/main/ai-column.ts` +
`ColumnSplitter.tsx` (колонка итогов), `licenses/third-party.json` + `scripts/build-notices.mjs` (лицензии),
`scripts/make-test-copy.mjs` (тестовая копия сборки с включёнными для Playwright fuses), `build/` (значок).

**Tech Stack:** Electron 44, electron-vite 5, React 19, TypeScript 7, zod 4, Vitest 5, Playwright 1.63,
electron-builder 26 (`electronFuses`), `@electron/fuses` 1.8 (уже в `node_modules` как зависимость electron-builder).

**Spec:** [решения Плана 8](../specs/2026-10-16-textmeet-plan-8-design.md) (утверждены 2026-10-16). Читать вместе с
планом; ссылки вида «§2.1» — на этот документ.

## Global Constraints

- Ветка `plan-8-polish` (уже создана от `main` dce2c87, в ней коммит с решениями). Ничего не отправлять на GitHub без
  явного разрешения пользователя (Task 14).
- Версия программы — **1.0.0**.
- Интерфейс по-русски, кавычки «ёлочки», как во всей программе. Тексты на экране, заданные в плане, — дословно.
- Новых зависимостей в `dependencies` не добавлять. `@electron/fuses` брать из уже установленных (в `devDependencies`
  его можно вписать той же версией 1.8.0, чтобы `npm ci` гарантировал наличие).
- Платной подписи нет: Windows — без подписи, Mac — ad-hoc (`codesign --sign -`), как сейчас в `build.yml`.
- Тестовые подмены (`TEXTMEET_*`) в выпуске, который получают люди, не включаются переменными окружения (§5.1).
- Комментарии и сообщения в журнал — по-русски, как в окружающем коде; сообщения коммитов — `тип: описание` по-английски,
  с последней строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Записи пользователя (`D:\TextMeet-samples`) никогда не попадают в репозиторий.
- После каждой задачи: `npm run typecheck`, `npm test` — зелёные; задачи с окном — ещё `npm run e2e` (полный прогон — в
  Task 12). Порог покрытия (`npm run test:coverage`) — не ниже нынешнего (~97 %).
- Код окна (`*.tsx`, `hooks.ts`) не покрывается модульными тестами (так настроено в `vitest.config.ts`) — логику
  выносить в `.ts`-модули с тестами, поведение окна проверять сквозными тестами в `e2e/`.

## Review Focus

Случаи, которые решения подразумевают, а явные пункты задач не проверяют; тест к каждому добавлен в задачу-владельца:

1. **Окно меняет размер при открытых итогах** (сузили до ~760 px, расширили обратно): итоги переезжают наверх и обратно
   без потери прокрутки текста; ширина колонки после возврата — прежняя. → Task 4, тест
   `summary moves above the transcript in a narrow window and back to the right when widened`.
2. **В выпуске у человека случайно задана переменная `TEXTMEET_TEST_ASR` / `TEXTMEET_USER_DATA`** (например, осталась
   от другой программы) — программа работает как обычно. → Task 1, тест
   `testEnv returns no test variables in a packaged app without the marker`.
3. **Файл с PID движка указывает на чужой процесс** (номер процесса заняли после перезагрузки) — чужой процесс не
   трогаем. → Task 2, тест `killOrphanEngine leaves a process with another image alone`.
4. **GitHub ответил чем-то неожиданным** (HTML вместо JSON, `tag_name: "v1.1.0-beta"`, ссылка на чужой сайт, 403
   ограничения частоты) — плашки нет, программа не падает, в журнале строка. → Task 10, тесты
   `updateFromRelease ignores prereleases, bad tags and foreign links` и `checker stays silent on fetch errors`.
5. **Окно сохранения вернуло имя без расширения, а файл с расширением уже есть** — спросить; «Отмена» — файл не тронут.
   → Task 6, тест `asks before replacing an existing file when the extension was appended`.

---

### Task 1: Тестовые подмены только в разработке и в тестовой копии; Electron fuses

**Files:**
- Create: `src/main/test-hooks.ts`, `src/main/test-hooks.test.ts`, `scripts/make-test-copy.mjs`,
  `scripts/check-fuses.mjs`
- Modify: `src/main/index.ts:57-86` (все чтения `process.env.TEXTMEET_*`), `src/main/windows.ts:45-51`
  (`testMediaMode`), `src/main/transcription/worker-host.ts` (окружение процесса расшифровки),
  `src/main/transcription/worker.ts:15`, `electron-builder.yml`, `.github/workflows/build.yml`, `package.json`
  (`devDependencies`: `@electron/fuses: 1.8.0`)

**Interfaces:**
- Produces:
  ```ts
  // src/main/test-hooks.ts
  /** Файл-признак тестовой копии сборки (кладёт scripts/make-test-copy.mjs в resources/). */
  export const TEST_BUILD_MARKER = 'textmeet-test-build';
  export interface TestHooksContext {
    packaged: boolean;
    resourcesPath: string;
    env: NodeJS.ProcessEnv;
    exists(path: string): boolean;
  }
  /** Подмены разрешены: разработка (не собранная программа) или тестовая копия сборки (есть признак). */
  export function testHooksAllowed(ctx: TestHooksContext): boolean;
  /** Только переменные TEXTMEET_* и только если подмены разрешены; иначе — пустой объект. */
  export function testEnv(ctx: TestHooksContext): Readonly<Record<string, string>>;
  ```
- `testMediaMode(env: Readonly<Record<string, string>>): 'tone' | 'fail' | null` (windows.ts) — берёт значение из
  переданного `testEnv`, а не из `process.env`.
- Все дальнейшие задачи, которым нужна подмена (Task 10 — `TEXTMEET_TEST_UPDATE_URL`), читают её из того же `testEnv`.

- [ ] **Step 1: Write the failing tests** — `src/main/test-hooks.test.ts`:

```ts
const ctx = (over: Partial<TestHooksContext>): TestHooksContext => ({
  packaged: true, resourcesPath: '/app/resources', env: {}, exists: () => false, ...over,
});

it('testEnv returns no test variables in a packaged app without the marker', () => {
  const env = { TEXTMEET_TEST_ASR: 'fake', TEXTMEET_USER_DATA: '/tmp/x', PATH: '/bin' };
  expect(testHooksAllowed(ctx({ env }))).toBe(false);
  expect(testEnv(ctx({ env }))).toEqual({});
});

it('allows test variables in a dev run', () => {
  const env = { TEXTMEET_TEST_ASR: 'fake', PATH: '/bin' };
  expect(testEnv(ctx({ packaged: false, env }))).toEqual({ TEXTMEET_TEST_ASR: 'fake' });
});

it('allows test variables in the test copy of a build (marker in resources)', () => {
  const marker = join('/app/resources', TEST_BUILD_MARKER);
  const env = { TEXTMEET_TEST_MEDIA: 'tone' };
  expect(testEnv(ctx({ env, exists: (p) => p === marker }))).toEqual({ TEXTMEET_TEST_MEDIA: 'tone' });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/main/test-hooks.test.ts` → FAIL (модуля нет).
- [ ] **Step 3: Implement `test-hooks.ts`** и перевести на него `index.ts`: в начале модуля одна константа
  `const testVars = testEnv({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, env: process.env,
  exists: existsSync })`; все `process.env.TEXTMEET_…` в `index.ts` и `windows.ts` заменить на `testVars.TEXTMEET_…`
  (включая `TEXTMEET_USER_DATA`, `TEXTMEET_HOME`, `TEXTMEET_MODELS_DIR`, `TEXTMEET_TEST_*`). Процесс расшифровки:
  `worker-host.ts` передаёт ему окружение без `TEXTMEET_*` из `process.env` и с `TEXTMEET_TEST_ASR` только из
  `testVars` (параметром при запуске); `worker.ts` читает только то, что ему передали.
- [ ] **Step 4: Run** `npx vitest run src/main/test-hooks.test.ts && npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Fuses в сборке.** `electron-builder.yml`:
  ```yaml
  electronFuses:
    runAsNode: false
    enableNodeOptionsEnvironmentVariable: false
    enableNodeCliInspectArguments: false
    enableEmbeddedAsarIntegrityValidation: true
    onlyLoadAppFromAsar: true
    resetAdHocDarwinSignature: true
  ```
  Проверить локально `npm run dist:win`, затем запустить `release/win-unpacked/TextMeet.exe` руками: окно открылось,
  запись → «Пропустить» → `mix.opus` в папке встречи. Если с проверкой целостности asar программа не стартует на
  Windows или Mac (распакованные ffmpeg/sherpa/llama) — убрать только `enableEmbeddedAsarIntegrityValidation` и
  `onlyLoadAppFromAsar`, записать причину в `plan-8-checks.md` → «Решения при выполнении».
- [ ] **Step 6: `scripts/make-test-copy.mjs <app> <out>`** — копирует собранную программу (`release/win-unpacked` или
  `TextMeet.app`) в `<out>`, на копии включает обратно `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`,
  `EnableNodeCliInspectArguments` (`flipFuses` из `@electron/fuses`, на Mac с `resetAdHocDarwinSignature: true`) — без них
  Playwright не может управлять программой (он запускает её с `--inspect=0` и `-r loader.js`), — и кладёт пустой файл
  `TEST_BUILD_MARKER` в её `resources/` (на Mac `Contents/Resources/`). Проверка целостности asar на копии остаётся.
  `scripts/check-fuses.mjs <exe>` — читает fuses (`getCurrentFuseWire`) и падает с понятным сообщением, если хоть один из
  трёх Node-fuses включён.
- [ ] **Step 7: `build.yml`.** Windows: `npx electron-builder --win --publish never` → `node scripts/check-fuses.mjs
  release/win-unpacked/TextMeet.exe` → `node scripts/make-test-copy.mjs release/win-unpacked release/test-unpacked` →
  `TEXTMEET_PACKAGED_APP=release/test-unpacked/TextMeet.exe npx playwright test e2e/packaged.spec.ts`. Mac: после
  `electron-builder --mac dir` — проверка fuses на `TextMeet.app`, тестовая копия `release/test/TextMeet.app` (признак
  кладётся **до** подписи), ad-hoc подпись обеих (как сейчас), сквозной тест — на копии, `.dmg` — из оригинала. В
  загружаемые артефакты копия не попадает (они берут только `release/*.exe`, `release/*.dmg`).
- [ ] **Step 8: Локально** повторить Windows-цепочку из Step 7 → `e2e/packaged.spec.ts` PASS на копии; запуск
  `release/win-unpacked/TextMeet.exe` с `TEXTMEET_TEST_ASR=fake` в окружении — в журнале нет «поддельные движки».
- [ ] **Step 9: Commit** — `feat: test hooks only in dev and in the test copy of a build, electron fuses in release`.

---

### Task 2: Движок итогов — без осиротевших и двойных процессов

**Files:**
- Create: `src/main/ai/engine-pid.ts`, `src/main/ai/engine-pid.test.ts`
- Modify: `src/main/ai/llama-server.ts` (класс `LlamaProcess.stop`, класс `LlamaServer`), `src/main/ai/llama-server.test.ts`,
  `src/main/index.ts` (запуск: уборка до первого запроса; `LlamaServerDeps`)

**Interfaces:**
- Produces:
  ```ts
  // src/main/ai/engine-pid.ts — файл userData/llama-server.pid: {"pid":123,"file":"C:\\…\\llama-server.exe"}
  export interface EnginePidDeps {
    pidFile: string;
    platform: NodeJS.Platform;
    /** Имя (Windows: «llama-server.exe») или полный путь (Mac: `ps -p N -o comm=`) исполняемого файла процесса; нет такого — null. */
    processImage(pid: number): Promise<string | null>;
    kill(pid: number): void;
    logger: Pick<Logger, 'info' | 'warn'>;
  }
  export function parseTasklistImage(csvLine: string): string | null;
  /** Windows — имя файла без учёта регистра; Mac и прочие — полный путь. */
  export function sameEngine(image: string, file: string, platform: NodeJS.Platform): boolean;
  export function recordEnginePid(deps: EnginePidDeps, pid: number, file: string): Promise<void>;
  export function clearEnginePid(deps: EnginePidDeps): Promise<void>;
  /** Завершает свой оставшийся сервер из прошлого запуска; true — завершил. Файл PID удаляется в любом случае. */
  export function killOrphanEngine(deps: EnginePidDeps): Promise<boolean>;
  ```
- `LlamaServerDeps` получает необязательные `onSpawn?(pid: number, file: string): void` и `onExit?(): void` (вызов —
  при запуске процесса и при его выходе); `index.ts` подключает к ним `recordEnginePid` / `clearEnginePid`.
- `processImage` в `index.ts`: Windows — `tasklist /FI "PID eq N" /FO CSV /NH` (через `execFile`, `windowsHide`) →
  `parseTasklistImage`; Mac — `ps -p N -o comm=`.

- [ ] **Step 1: Write the failing tests** — `engine-pid.test.ts` (временная папка — `makeTempDir`; `pidDeps(over)` —
  помощник теста: `pidFile` во временной папке, `platform: 'win32'`, `processImage: async () => null`, `kill: () => {}`,
  тихий `logger`, поверх — `over`):

```ts
it('parseTasklistImage reads the image name and ignores "no tasks" lines', () => {
  expect(parseTasklistImage('"llama-server.exe","4242","Console","1","812 345 K"')).toBe('llama-server.exe');
  expect(parseTasklistImage('INFO: No tasks are running which match the specified criteria.')).toBeNull();
});

it('killOrphanEngine kills our engine left from the previous run and removes the pid file', async () => {
  const killed: number[] = [];
  const deps = pidDeps({ processImage: async () => 'LLAMA-SERVER.EXE', kill: (pid) => killed.push(pid), platform: 'win32' });
  await recordEnginePid(deps, 4242, 'C:\\Program Files\\TextMeet\\resources\\llama\\llama-server.exe');
  expect(await killOrphanEngine(deps)).toBe(true);
  expect(killed).toEqual([4242]);
  expect(existsSync(deps.pidFile)).toBe(false);
});

it('killOrphanEngine leaves a process with another image alone', async () => {
  const killed: number[] = [];
  const deps = pidDeps({ processImage: async () => 'chrome.exe', kill: (pid) => killed.push(pid), platform: 'win32' });
  await recordEnginePid(deps, 4242, 'C:\\x\\llama-server.exe');
  expect(await killOrphanEngine(deps)).toBe(false);
  expect(killed).toEqual([]);
});

it('killOrphanEngine on mac compares the full path', async () => {
  const deps = pidDeps({ processImage: async () => '/Applications/Other.app/llama-server', platform: 'darwin' });
  await recordEnginePid(deps, 7, '/Applications/TextMeet.app/Contents/Resources/llama/llama-server');
  expect(await killOrphanEngine(deps)).toBe(false);
});

it('killOrphanEngine does nothing without a pid file or with a broken one', async () => { /* нет файла → false; «{» в файле → false, файл удалён */ });
```

  В `llama-server.test.ts` (по образцу его тестов с поддельным сервером):

```ts
it('a request during the idle shutdown waits for the old process before starting a new one', async () => {
  // idleMs: 10; поддельный сервер, выход которого задерживается на 300 мс после SIGTERM;
  // после idle → ready(): в момент запуска второго процесса первый уже вышел (по журналу/счётчику живых процессов: максимум 1).
});

it.skipIf(process.platform === 'win32')('stop kills the engine that ignores the polite request', async () => {
  // поддельный сервер игнорирует SIGTERM; stop() завершается не дольше чем за 2 × EXIT_WAIT_MS, процесс вышел.
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/main/ai/engine-pid.test.ts src/main/ai/llama-server.test.ts`.
- [ ] **Step 3: Implement.** `engine-pid.ts` по интерфейсу (запись — `writeFileAtomic`). `LlamaProcess.stop`: если за
  `EXIT_WAIT_MS` процесс не вышел — `child.kill('SIGKILL')` и ещё до `EXIT_WAIT_MS` ожидания. `LlamaServer`: поле
  `private stopping: Promise<void> | null`; `stop()` сохраняет туда своё ожидание; `ready()` сначала ждёт
  `this.stopping`. Поддельному серверу (`src/test-support/fake-llama-server.mjs`) — переменные окружения для задержки
  выхода и игнорирования SIGTERM (только для тестов).
- [ ] **Step 4: `index.ts`** — при запуске, до создания `AiRunner`, `await killOrphanEngine(...)` (ошибки — в журнал, не
  мешают запуску); `onSpawn`/`onExit` → `recordEnginePid`/`clearEnginePid`.
- [ ] **Step 5: Run** `npm run typecheck && npm test` → PASS; `npm run e2e -- e2e/ai-engine.spec.ts e2e/ai.spec.ts` →
  PASS.
- [ ] **Step 6: Commit** — `fix: the summary engine never runs twice and is cleaned up after a crash`.

---

### Task 3: Блок итогов — без вступлений, «занято», «обрезано», объявление в свёрнутом виде

**Files:**
- Modify: `src/main/ai/ai-messages.ts` (`AI_RULES`, новая `stripPreamble`), `src/main/ai/ai-messages.test.ts`,
  `src/main/ai/ai-runner.ts` (сохранение: `stripPreamble`, `truncated`), `src/main/ai/ai-runner.test.ts`,
  `src/shared/ai.ts` (`answerFields.truncated`, `aiCaption`), `src/shared/ai.test.ts` (или где проверяется `aiCaption`),
  `src/renderer/main/AiBlock.tsx` (`useAiPanel`: `busy`; живая область вне `if (!panel.visible)`),
  `src/renderer/main/ai-block.ts` (`aiBlockVisible`), `src/renderer/main/ai-block.test.ts`, `e2e/ai-summary.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/main/ai/ai-messages.ts
  /** Убирает первую строку ответа, если это вступление вида «На основе …:» / «Исходя из …:» / «Вот итоги …:». */
  export function stripPreamble(text: string): string;
  // src/shared/ai.ts — answerFields: truncated: z.boolean().default(false)
  // aiCaption(record: {modelTitle; createdAt; status; truncated?: boolean}, withYear?): обрезанный — «· не поместилось целиком»
  // src/renderer/main/ai-block.ts — aiBlockVisible({..., opened}) без изменений сигнатуры; в useAiPanel opened = opened || noModel || busyNotice
  ```
- `AiPanel` получает `busyNotice: boolean` и `closeBusy(): void`.

- [ ] **Step 1: Write the failing tests:**

```ts
// ai-messages.test.ts
it('stripPreamble drops an introduction line and keeps the rest', () => {
  expect(stripPreamble('На основе предоставленного текста встречи, вот итоги:\n\n**Главное**\n1. …')).toBe('**Главное**\n1. …');
  expect(stripPreamble('Вот итоги встречи:\n- пункт')).toBe('- пункт');
  expect(stripPreamble('Исходя из расшифровки:\nТекст')).toBe('Текст');
});
it('stripPreamble keeps answers that start with the content', () => {
  expect(stripPreamble('**Главное**\nНа основе опроса решили…')).toBe('**Главное**\nНа основе опроса решили…');
  expect(stripPreamble('Вот так: да.')).toBe('Вот так: да.'); // одна строка — не трогаем
});
it('AI_RULES ask to start with the content and keep headings short', () => {
  expect(AI_RULES).toContain('без вступлений');
});

// ai-runner.test.ts
it('saves a summary cut by the length limit as truncated', async () => { /* поддельный клиент кончает с finish_reason 'length' → ai.json summary.truncated === true */ });
it('saves the summary without the introduction line', async () => { /* поток «Вот итоги:\nТекст» → summary.text === 'Текст' */ });

// shared/ai.test.ts
it('aiCaption marks a truncated answer', () => {
  expect(aiCaption({ modelTitle: 'Qwen3.5 9B', createdAt: '2026-10-16T17:57:00.000Z', status: 'done', truncated: true }))
    .toMatch(/· не поместилось целиком$/);
});
```

  `e2e/ai-summary.spec.ts`:
  - `a busy engine explains itself instead of an empty block` — поддельный движок занят (удаление модели во время
    запуска, как в существующих тестах «busy»), «Итоги встречи» → в блоке текст «Модель сейчас занята — попробуйте ещё
    раз через несколько секунд.» и «Закрыть».
  - `"Итоги готовы" is announced while the block is collapsed` — запустить итоги, «Свернуть», дождаться конца →
    `getByRole('status')` содержит «Итоги готовы».

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** `AI_RULES` дополнить предложением (дословно): «Начинай ответ сразу с сути — без вступлений
  вроде «На основе текста встречи…» и без пересказа задания; заголовки разделов делай короткими: «Главное»,
  «Решения», «Задачи», «Открытые вопросы».» `stripPreamble` — только первая строка, только если за ней есть ещё текст и
  она подходит под `/^\s*(?:на основе|исходя из|вот)\b[^\n]{0,160}:\s*$/i`. Раннер применяет `stripPreamble` к
  сохраняемому тексту и к тексту в `job.text` (на экране вступление может мелькнуть до перевода строки — допустимо).
  `finish_reason === 'length'` → `truncated: true`.
- [ ] **Step 4: Проверка на настоящей модели** (Global: модель уже лежит в `%LOCALAPPDATA%\TextMeet\models\llm\qwen3.5-9b`):
  `npm run dev`, встреча «подкаст» → «Обновить» итоги → нет вступления, заголовки короткие; то же на одной записи
  созвона. Если модель всё ещё повторяет строки запроса как заголовки — подправить формулировку правила (не запрос
  пользователя) и повторить. Результат одной строкой — в `plan-8-checks.md` (Task 14).
- [ ] **Step 5: Run** `npm test && npm run e2e -- e2e/ai-summary.spec.ts e2e/ai.spec.ts` → PASS.
- [ ] **Step 6: Commit** — `feat: summaries start with the content; busy and truncated states are explained`.

Решение: «неудача запроса по встрече, с которой ушли» (§5.2) не меняется — её текст уже объясняет причину; остаётся в
известных ограничениях.

---

### Task 4: Окно встречи — итоги колонкой справа, спикеры в строке под названием

**Files:**
- Create: `src/renderer/main/ai-column.ts`, `src/renderer/main/ai-column.test.ts`, `src/renderer/main/ColumnSplitter.tsx`
- Modify: `src/renderer/main/MeetingPane.tsx` (`MeetingView`: раскладка, слот спикеров),
  `src/renderer/main/TranscriptView.tsx` (`SpeakerChips` — порталом в слот), `src/renderer/main/SpeakerChips.tsx`
  (вид «в строке»), `src/renderer/main/styles.css` (`.ai`, `.spk`, новые `.mwrap`, `.mbody`, `.mmain`, `.mside`,
  `.splitter`), `e2e/ai-summary.spec.ts`, `e2e/library.spec.ts` (спикеры)

**Interfaces:**
- Produces:
  ```ts
  // src/renderer/main/ai-column.ts — доля ширины области встречи под колонку итогов
  export const AI_SHARE_DEFAULT = 0.38;
  export const AI_SHARE_MIN = 0.2;
  export const AI_SHARE_MAX = 0.6;
  export const AI_SHARE_STEP = 0.02;           // стрелки ←/→ на ручке
  export const AI_SHARE_KEY = 'textmeet.aiColumnShare';
  export function clampShare(share: number): number;                       // NaN → AI_SHARE_DEFAULT
  /** Доля по положению указателя: правая граница области минус X, делённое на ширину. */
  export function shareFromPointer(clientX: number, rect: { left: number; width: number }): number;
  export function loadShare(storage: Pick<Storage, 'getItem'> | null): number;   // ошибки и мусор → по умолчанию
  export function saveShare(storage: Pick<Storage, 'setItem'> | null, share: number): void; // ошибки глушатся
  // src/renderer/main/ColumnSplitter.tsx
  export function ColumnSplitter(props: { share: number; onChange(share: number): void; areaRef: RefObject<HTMLElement | null> }): JSX.Element;
  // MeetingPane.tsx
  export const SpeakerSlotContext: React.Context<HTMLElement | null>;
  ```
- Ширина хранится в `localStorage` окна (настройка окна, не библиотеки) — §2.1 оставил место хранения исполнителю.

- [ ] **Step 1: Write the failing unit tests** — `ai-column.test.ts`:

```ts
it('clampShare keeps the share between 20 % and 60 %', () => {
  expect(clampShare(0.1)).toBe(0.2);
  expect(clampShare(0.9)).toBe(0.6);
  expect(clampShare(Number.NaN)).toBe(0.38);
});
it('shareFromPointer measures from the right edge of the meeting area', () => {
  expect(shareFromPointer(600, { left: 200, width: 1000 })).toBeCloseTo(0.6);
  expect(shareFromPointer(1100, { left: 200, width: 1000 })).toBe(0.2);
});
it('loadShare falls back to the default on garbage or a failing storage', () => {
  expect(loadShare({ getItem: () => 'abc' })).toBe(0.38);
  expect(loadShare({ getItem: () => { throw new Error('denied'); } })).toBe(0.38);
  expect(loadShare({ getItem: () => '0.5' })).toBe(0.5);
});
```

- [ ] **Step 2: Run, verify FAIL**, затем реализовать `ai-column.ts`, PASS.
- [ ] **Step 3: Write the failing e2e tests** (`e2e/ai-summary.spec.ts`, встреча с готовыми итогами — как в его тестах;
  размер окна — `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isVisible())?.setSize(w, h))`):

```ts
test('summary sits to the right of the transcript in a wide window', async () => {
  // 1300×800: box(итоги).x >= box(текст).x + box(текст).width - 1; box(итоги).height > 400
});
test('summary moves above the transcript in a narrow window and back to the right when widened', async () => {
  // 760×700: box(итоги).y + box(итоги).height <= box(текст).y + 1; снова 1300×800 → справа, ширина как до сужения (±2 px)
});
test('dragging the splitter changes the summary width and it is remembered after a restart', async () => {
  // ручка role=separator name «Ширина итогов»: тянем влево на 150 px → итоги шире; перезапуск с той же папкой данных → та же ширина (±2 px);
  // фокус на ручке + ArrowRight → уже
});
test('collapse gives the transcript the full width and "Итоги встречи" brings the column back', async () => {});
```

  `e2e/library.spec.ts`: `speaker chips are in the line under the title and rename still works` — фишка «Спикер 1»
  внутри `header` встречи; переименование через неё (как в существующем тесте переименования) работает; отдельной
  полосы спикеров под шапкой нет.
- [ ] **Step 4: Run, verify FAIL.**
- [ ] **Step 5: Implement раскладку.** `MeetingView`: под шапкой и баннерами `div.mwrap` (`container-type: inline-size`)
  с `div.mbody` внутри; в `mbody` — `div.mmain` (тело встречи: импорт / `Body`) и, когда `ai.visible`, `ColumnSplitter`
  + `aside.mside` с `AiBlock`. CSS: `.mside { width: clamp(260px, calc(var(--ai-share) * 100%), 60%); flex: none }`,
  `--ai-share` — из состояния; `.ai` в колонке растягивается на высоту (`max-height: none`, своя прокрутка);
  `@container (max-width: 640px)`: `.mbody` в столбик, `.mside` наверху (`order: -1`, `width: auto`), ручка скрыта, `.ai` —
  с нынешним пределом высоты `48vh`. Ручка: `role="separator"`, `aria-orientation="vertical"`, `aria-label="Ширина
  итогов"`, `aria-valuemin=20`, `aria-valuemax=60`, `aria-valuenow` (проценты), `tabIndex=0`, курсор `col-resize`;
  перетаскивание — pointer capture; сохранение — по отпусканию и после клавиш. Прокрутка текста (`.tx`) и слежение за
  звуком не меняются; переход из поиска к итогам (`reveal` → `scrollIntoView`) работает в обеих раскладках.
- [ ] **Step 6: Спикеры в шапке.** `MeetingView` даёт в строке `.meta` слот (`span` с `ref` → состояние) и
  `SpeakerSlotContext.Provider`; `TranscriptView` рендерит `SpeakerChips` порталом (`createPortal`) в слот, если он
  есть, иначе на прежнем месте. Вид «в строке»: подпись «Спикеры:» после « · », фишки тех же цветов, перенос строки при
  нехватке места, без своей рамки и отступов полосы. Отступы шапки можно чуть уменьшить (§2.2).
- [ ] **Step 7: Run** `npm run typecheck && npm test && npm run e2e -- e2e/ai-summary.spec.ts e2e/library.spec.ts
  e2e/ai-search.spec.ts e2e/screens.spec.ts` → PASS (поправить ожидания существующих тестов, которые искали полосу
  спикеров под шапкой, — только расположение, не поведение).
- [ ] **Step 8: Глазами.** `npm run dev`, окно ~1100×720 и ~820×600, светлая и тёмная тема (системная): итоги справа,
  текст на всю высоту, ручка видна при наведении; ~760 px — итоги сверху.
- [ ] **Step 9: Commit** — `feat: summary as a resizable column next to the transcript, speakers in the title line`.

---

### Task 5: Значок программы

**Files:**
- Create: `build/icon.svg` (Windows, во весь квадрат), `build/icon-mac.svg` (сетка значков macOS: скруглённый
  квадрат 824×824 в поле 1024×1024 с отступом 100), `scripts/render-icons.cjs` (запуск: `npx electron
  scripts/render-icons.cjs`), получившиеся `build/icon.png` (1024×1024), `build/icon-mac.png` (1024×1024)
- Modify: `electron-builder.yml` (`win.icon: build/icon.png`, `mac.icon: build/icon-mac.png`; `build/` — стандартная
  папка ресурсов сборки), `src/main/windows.ts` (значок окна в разработке: `icon` из `build/icon.png`, только когда
  `!app.isPackaged`), `package.json` (`"icons": "electron scripts/render-icons.cjs"`)

**Interfaces:** нет (ресурсы сборки).

- [ ] **Step 1: SVG.** Рисунок — символ `i1` из [`plan-8-mockups/icon.html`](../specs/plan-8-mockups/icon.html):
  фон `#f7f3ea`, рамка `#dcd3c2`, строки `#26221b` (короткая, длинная, средняя), точка `#b8352a` справа от первой
  строки. Линии чуть толще для чёткости на 16–32 px.
- [ ] **Step 2: `scripts/render-icons.cjs`** — Electron без окна на экране (`show: false`, `offscreen: true`) загружает
  каждый SVG в `data:`-URL размером 1024×1024 с прозрачным фоном и сохраняет `capturePage()` в PNG; затем
  `app.quit()`. Запустить `npm run icons` → два PNG 1024×1024 с прозрачными углами.
- [ ] **Step 3: Сборка** `npm run dist:win` → у `release/win-unpacked/TextMeet.exe` и у установщика новый значок
  (electron-builder сам делает `.ico` 16–256 из PNG); на Mac `.icns` из `icon-mac.png` — проверяется в Task 14.
- [ ] **Step 4: Глазами** — Проводник (крупные и мелкие значки), панель задач после установки, `npm run dev` — окно со
  значком. На 16 px строки должны различаться; если сливаются — сделать строки толще в `build/icon.svg` и
  перерисовать (отдельный значок для 16 px не делаем).
- [ ] **Step 5: Commit** — `feat: TextMeet icon (paper sheet with lines and a record dot)`.

---

### Task 6: Выгрузка и названия из имени файла

**Files:**
- Modify: `src/main/export/export-meeting.ts` (`saveMeeting`, `ExportDeps`), `src/main/export/export-meeting.test.ts`,
  `src/main/ipc.ts` (зависимость `confirmReplace`), `src/main/texts.ts` (текст вопроса),
  `src/main/import/naming.ts` (`titleFromFileName`), `src/main/import/naming.test.ts`

**Interfaces:**
- Produces: `ExportDeps.confirmReplace(path: string): Promise<boolean>` — `dialog.showMessageBox` с текстами
  `dialogTexts.replaceExport(name)`: заголовок «Заменить файл?», сообщение «Файл «{имя}» уже есть.», кнопки
  «Отмена» / «Заменить» (по умолчанию и по Esc — «Отмена»).

- [ ] **Step 1: Write the failing tests:**

```ts
// export-meeting.test.ts
it('asks before replacing an existing file when the extension was appended', async () => {
  // окно сохранения вернуло '<dir>/Итоги' для docx; '<dir>/Итоги.docx' уже есть (байты 'old')
  // confirmReplace → false: { saved: false }, файл не изменился, папка не запомнилась
  // confirmReplace → true: { saved: true }, файл новый
});
it('does not ask when the dialog returned the name with the extension', async () => { /* confirmReplace не вызывался */ });
it('writes the export atomically: a failed write leaves no half file', async () => {
  // fileData собирается, запись падает (папка только для чтения или подмена writeFileAtomic) → под выбранным именем нет файла, ошибка понятная
});

// naming.test.ts
it('keeps dots that are not an extension', () => {
  expect(titleFromFileName('Встреча 2026.10.05', at)).toBe('Встреча 2026.10.05');
  expect(titleFromFileName('Встреча 2026.10.05.m4a', at)).toBe('Встреча 2026.10.05');
  expect(titleFromFileName('Созвон с Ириной.mp4', at)).toBe('Созвон с Ириной');
});
it('a name of invisible characters becomes the default title', () => {
  expect(titleFromFileName('\u200b\u200d .mp3', at)).toBe(defaultMeetingTitle(at));
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** `saveMeeting`: расширение дописано и такой файл есть → `confirmReplace`; запись —
  `writeFileAtomic` (`src/main/fs/atomic-write.ts`), ошибка по-прежнему через `humanFsError('Не удалось сохранить файл',
  …)` (файл, открытый в Word, — «занят другой программой»); убрать комментарий «Не атомарно». `titleFromFileName`:
  отрезать хвост `.xxx`, только если он 1–5 знаков и в нём есть буква (`/\.(?=[\p{L}\d]{1,5}$)[\p{L}\d]*\p{L}[\p{L}\d]*$/u`
  или равносильно); после обрезки убрать невидимые знаки (`\p{Cf}`) и пробелы по краям — пусто → название по умолчанию.
- [ ] **Step 4: Run** `npm test && npm run e2e -- e2e/export.spec.ts e2e/import.spec.ts` → PASS.
- [ ] **Step 5: Commit** — `fix: export asks before replacing, saves atomically; titles keep dotted names`.

---

### Task 7: Мелочи окна (Планы 4, 6, 7)

**Files:**
- Modify: `src/renderer/main/TranscriptView.tsx` (полоса «Вернуть»; клавиши на кнопке времени),
  `src/shared/transcript-edit.ts` (`TranscriptEdit` 'speaker' + `reserved`; `nextSpeakerId`),
  `src/shared/transcript-edit.test.ts`, `src/renderer/main/settings-tabs.ts`, `src/renderer/main/settings-tabs.test.ts`,
  `src/renderer/main/SettingsPane.tsx` (`tabIndex`, уровни заголовков), `src/renderer/main/AiSettings.tsx` (вставка
  длиннее 4000), `src/renderer/main/TranscribeDialog.tsx` (список моделей не загрузился),
  `src/renderer/main/hooks.ts` (`useTranscript`: «Экспорт» не мигает), `src/main/models/models-state.ts`,
  `src/main/models/catalog-downloads.ts` или новый `src/main/models/queue-downloads.ts`, `src/main/index.ts`,
  `src/shared/transcription.ts` (`CatalogDownload.queued`), `src/renderer/main/CatalogCard.tsx`, тесты рядом,
  `e2e/library.spec.ts`, `e2e/models.spec.ts`

**Interfaces:**
- `TranscriptEdit` → `{ kind: 'speaker'; segmentId: string; speakerId: SpeakerId | 'new'; reserved?: readonly SpeakerId[] }`;
  `nextSpeakerId(transcript, reserved?: readonly SpeakerId[]): SpeakerId` — номера из `reserved` тоже заняты. Окно
  передаёт в `reserved` спикеров удалённых реплик, которые ещё можно «Вернуть».
- `settingsTabKey(key: string, at: number, mods: { alt: boolean; ctrl: boolean; meta: boolean }): number | null` — с
  зажатым модификатором — `null` (имя функции — нынешнее в `settings-tabs.ts`; добавить параметр).
- `CatalogDownload` получает `queued?: true` — скачивание начала очередь расшифровки; карточка показывает ход и текст
  «Скачивается для расшифровки встречи», без «Отменить».
- `trackQueueDownloads(store: ModelStore, changed: () => void): ModelStore & { active(): { group: ModelGroupId; done: number; total: number } | null }`
  — обёртка для хранилища, которое получает очередь расшифровки: перехватывает `onProgress` в `ensure`.

- [ ] **Step 1: Write the failing tests:**

```ts
// transcript-edit.test.ts
it('a new speaker does not take the number of a removed speaker that can still be restored', () => {
  // реплики только у s1; удалённая реплика была у s2 → applyEdit({kind:'speaker', segmentId, speakerId:'new', reserved:['s2']}) даёт s3
});
// settings-tabs.test.ts
it('arrows with Alt, Ctrl or Cmd do not switch tabs', () => {
  expect(settingsTabKey('ArrowRight', 0, { alt: true, ctrl: false, meta: false })).toBeNull();
});
// models-state.test.ts / queue-downloads.test.ts
it('a download started by the transcription queue shows on the catalog card as queued', () => {
  // нет скачивания из каталога, очередь качает gigaam-v3 (done 10, total 100) → download = { id: 'gigaam-v3', done: 10, total: 100, remainingSec: null, queued: true }
});
it('a catalog download wins over the queue in the snapshot', () => {});
```

  `e2e/library.spec.ts`: `the undo error bar can be closed` (неудачное «Вернуть» — подмена ответа main, как в
  существующих тестах ошибок правки → у полосы кнопка «Закрыть» с `aria-label`, после щелчка полосы нет) и
  `arrow keys on the time button keep following the sound` (идёт воспроизведение, фокус на кнопке времени, ↓ — подсветка
  продолжает двигаться за звуком).
  `e2e/models.spec.ts`: `the transcribe dialog says when the model list did not load` (подмена `models:get` с ошибкой →
  в окне «Расшифровать» строка «Список моделей не загрузился — расшифруем моделью из настроек.»).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** по интерфейсам. Дополнительно без отдельных тестов (проверка глазами в Task 13):
  у активной вкладки `tabIndex={0}`, у прочих `-1`; группы каталога моделей — `h2` под `h1` настроек (без пропуска
  уровня); вставка, которую обрезало поле запроса, — под полем «Обрезано до 4000 знаков.» до следующей правки; «Экспорт»
  не пропадает, пока текст той же встречи перечитывается (`useTranscript` держит прежний `ready`, пока не пришёл новый).
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run e2e -- e2e/library.spec.ts e2e/models.spec.ts
  e2e/ai.spec.ts e2e/shell.spec.ts` → PASS.
- [ ] **Step 5: Commit** — `fix: small window fixes from earlier plans (undo bar, time keys, tabs, model list, queued download)`.

Проверено при составлении плана, менять не нужно: временные папки модульных тестов уже убираются
(`src/test-support/temp-dir.ts`); `actions/*` уже `@v5`.

---

### Task 8: Сторож зависшего окна записи

**Files:**
- Create: `src/main/recording/recorder-watchdog.ts`, `src/main/recording/recorder-watchdog.test.ts`
- Modify: `src/shared/ipc.ts` (`recorderAlive: 'recorder:alive'` в «Окно записи → main»), `src/preload/index.ts`,
  `src/renderer/recorder/recorder.ts` (каждые 2 с — `recorderAlive`), `src/main/index.ts` (`startRecorderWindow`:
  сторож; при зависании — `win.webContents.forcefullyCrashRenderer()` → нынешний путь «окно записи завершилось»),
  `e2e/recording.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const RECORDER_BEAT_MS = 2000;
  export const RECORDER_HUNG_MS = 15_000;
  export class RecorderWatchdog {
    constructor(deps: { onHung(): void; now?(): number; hungMs?: number; checkMs?: number });
    /** Сердцебиение от окна записи. */
    beat(): void;
    /** Следить с этого момента (окно готово); stop() — перестать (выход, окно пересоздаётся). */
    start(): void;
    stop(): void;
  }
  ```
  Зависание объявляется один раз на запуск окна; первое сердцебиение ждём `hungMs` от `start()`.

- [ ] **Step 1: Write the failing tests** (поддельные часы Vitest):

```ts
it('reports a hung recorder once when beats stop for 15 s', () => { /* beat… 16 с тишины → onHung вызван 1 раз; ещё 30 с → всё ещё 1 */ });
it('regular beats keep it quiet', () => { /* beat каждые 2 с в течение минуты → onHung не вызван */ });
it('stop() silences it', () => {});
```

  `e2e/recording.spec.ts`: `a hung recorder window is restarted and recording works again` — тестовая подмена
  `TEXTMEET_TEST_RECORDER_HANG_MS` (через `testEnv`, Task 1) уменьшает порог до 1,5 с; окно записи «вешаем» из теста:
  `app.evaluate` находит его `webContents` (заголовок «TextMeet — запись») и выполняет
  `executeJavaScript('setTimeout(() => { for (;;) {} }, 0)')` → в журнале «Окно записи не отвечает — перезапускаем»,
  затем запись начинается и останавливается как обычно.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Во время записи зависание тоже перезапускает окно: уже записанные куски на диске,
  `controller.onRecorderGone()` ведёт себя как при падении (встреча сохраняется восстановленной). Предел «3 перезапуска в
  минуту» общий с падениями.
- [ ] **Step 4: Run** `npm test && npm run e2e -- e2e/recording.spec.ts e2e/hotkey.spec.ts` → PASS.
- [ ] **Step 5: Commit** — `feat: restart a hung (not crashed) recorder window`.

---

### Task 9: Версия 1.0.0 и лицензии

**Files:**
- Create: `licenses/third-party.json`, `licenses/texts/` (тексты лицензий, которых нет в `node_modules`: шрифты OFL,
  модели), `scripts/build-notices.mjs`, `THIRD-PARTY-NOTICES.txt` (результат скрипта, в репозитории),
  `src/main/licenses/third-party.test.ts`
- Modify: `package.json` (`version: 1.0.0`; `"notices": "node scripts/build-notices.mjs"`),
  `scripts/fetch-llama.mjs` (скачать `LICENSE` llama.cpp того же выпуска b11588 в `vendor/llama/LICENSE-llama.cpp.txt`,
  с проверкой SHA-256), `electron-builder.yml` (`extraResources`: `THIRD-PARTY-NOTICES.txt` → `THIRD-PARTY-NOTICES.txt`),
  `src/shared/ipc.ts` (`openLicenses: 'app:open-licenses'`), `src/preload/index.ts`, `src/main/ipc.ts`
  (`shell.openPath` файла: собранная — `process.resourcesPath`, разработка — корень приложения),
  `src/renderer/main/SettingsPane.tsx` (подвал «Общие»), `.github/workflows/ci.yml` (`npm run notices -- --check`)

**Interfaces:**
- `licenses/third-party.json`: массив
  `{ "name": string, "author": string, "license": string, "url": string, "kind": "bundled" | "downloaded",
  "models"?: string[] /* ModelGroupId / LlmModelId */, "licenseFile"?: string /* путь от корня репозитория */ }`.
- `scripts/build-notices.mjs` — собирает `THIRD-PARTY-NOTICES.txt`: заголовок по-русски («TextMeet 1.0.0 — чужие
  программы, шрифты и модели и их лицензии»), раздел «В составе программы», раздел «Скачивается по вашей просьбе
  (модели)», затем полные тексты лицензий (по `licenseFile`, без повторов одинаковых текстов). `--check` — не пишет
  файл, падает, если файл устарел.
- Подвал вкладки «Общие»: «TextMeet 1.0.0 · [Лицензии] · журнал ошибок: …» — «Лицензии» — кнопка-ссылка (`.lnk`),
  открывает файл программой по умолчанию.

- [ ] **Step 1: Write the failing test** — `third-party.test.ts`:

```ts
it('every model a person can download has a license entry', () => {
  for (const id of MODEL_GROUP_IDS) expect(entries.some((e) => e.kind === 'downloaded' && e.models?.includes(id)), id).toBe(true);
});
it('every runtime part of the app has a license entry', () => {
  const required = [...Object.keys(pkg.dependencies), 'electron', 'react', 'react-dom', '@fontsource/golos-text', '@fontsource/literata', 'llama.cpp', 'ffmpeg'];
  for (const name of required) expect(entries.some((e) => e.kind === 'bundled' && e.name === name), name).toBe(true);
});
it('license files named in the list exist', () => { /* existsSync(licenseFile) для всех с licenseFile, кроме vendor/ (скачивается) */ });
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Заполнить `third-party.json`.** Лицензию **каждой** модели — по её карточке-первоисточнику (страница на
  Hugging Face / GitHub, откуда `registry.ts` берёт файлы; для `voices` — pyannote segmentation 3.0, 3D-Speaker
  ERes2Net, Silero VAD), не по памяти. ffmpeg: узнать по `node_modules/ffmpeg-static` (README, файлы `*.LICENSE` рядом с
  бинарником), под какой лицензией собраны бинарники для Windows и macOS, и записать в уведомлении лицензию, автора сборки
  и ссылку на исходники ffmpeg той версии. **Если лицензия какой-то модели запрещает такое использование или
  распространение — остановиться и спросить пользователя** (убрать ли модель из каталога).
- [ ] **Step 4: Implement** скрипт, загрузку лицензии llama.cpp, IPC и подвал. `npm run notices` → файл; `npm run notices
  -- --check` → 0.
- [ ] **Step 5: Run** `npm run typecheck && npm test && npm run e2e -- e2e/shell.spec.ts` (добавить проверку: в «Общие»
  есть «TextMeet 1.0.0» и кнопка «Лицензии»; щелчок вызывает `shell.openPath` с путём к `THIRD-PARTY-NOTICES.txt` —
  перехватом в `app.evaluate`, как другие тесты открытия папок) → PASS. `npm run dist:win` →
  `release/win-unpacked/resources/THIRD-PARTY-NOTICES.txt` и `resources/llama/LICENSE-llama.cpp.txt` на месте.
- [ ] **Step 6: Commit** — `feat: version 1.0.0, third-party licenses in the app and the repository`.

---

### Task 10: «Вышла новая версия»

**Files:**
- Create: `src/main/updates/update-check.ts`, `src/main/updates/update-check.test.ts`,
  `src/renderer/main/UpdateBanner.tsx`
- Modify: `src/shared/settings.ts` (`checkUpdates`, `dismissedUpdate`), `src/shared/settings.test.ts`,
  `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/renderer/main/App.tsx`
  (плашка внизу левой колонки над «Импорт файла»), `src/renderer/main/SettingsPane.tsx` (переключатель в «Общие»),
  `src/renderer/main/styles.css`, `e2e/shell.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/main/updates/update-check.ts
  export const RELEASES_REPO = 'wiiProfaker/TextMeet';
  export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
  export const RELEASES_PAGE_PREFIX = `https://github.com/${RELEASES_REPO}/releases/`;
  export const FIRST_CHECK_MS = 60_000;
  export const CHECK_EVERY_MS = 24 * 60 * 60_000;
  export interface AvailableUpdate { version: string; url: string }
  /** «v1.2.3» или «1.2.3» → [1, 2, 3]; с хвостом («-beta») или иное → null. */
  export function parseVersion(text: string): readonly [number, number, number] | null;
  export function isNewer(candidate: string, current: string): boolean;
  /** Ответ GitHub → новая версия или null (не новее, черновик, предварительная, ссылка не на страницу выпусков). */
  export function updateFromRelease(body: unknown, current: string): AvailableUpdate | null;
  export class UpdateChecker {
    constructor(deps: {
      current: string;
      url: string;                          // LATEST_RELEASE_URL; в тестах — TEXTMEET_TEST_UPDATE_URL из testEnv
      fetchJson(url: string): Promise<unknown>;
      enabled(): boolean;                   // settings.checkUpdates
      onFound(update: AvailableUpdate | null): void;
      logger: Pick<Logger, 'info' | 'warn'>;
      firstDelayMs?: number;
      everyMs?: number;
    });
    start(): void;
    stop(): void;
    found(): AvailableUpdate | null;
  }
  // src/shared/settings.ts
  checkUpdates: z.boolean().default(true),
  /** Версия, про которую нажали «Скрыть». */
  dismissedUpdate: z.string().max(50).nullable().default(null).catch(null),
  // src/shared/ipc.ts
  getUpdate: 'update:get'            // → AvailableUpdate | null (null — нет, скрыта или проверка выключена)
  dismissUpdate: 'update:dismiss'    // (version: string) → void
  openUpdate: 'update:open'          // () → void: shell.openExternal(found().url)
  setCheckUpdates: 'settings:set-check-updates' // (boolean) → SettingsState
  updateChanged: 'update:changed'    // main → окно: AvailableUpdate | null
  ```
- `fetchJson` в `index.ts` — `net.fetch` Electron с заголовками `Accept: application/vnd.github+json`,
  `User-Agent: TextMeet/<версия>`, тайм-аут 15 с; не-200 → ошибка. Никаких данных пользователя в запросе.
- Плашка: «Вышла версия {version}» + «Скачать» (→ `openUpdate`) + «Скрыть» (→ `dismissUpdate`). Не показывается, пока
  идёт запись (состояние записи не `idle`). Переключатель в «Общие»: «Проверять, не вышла ли новая версия» с подсказкой
  «Раз в день программа спрашивает GitHub о новой версии. Ничего о вас не отправляется.»

- [ ] **Step 1: Write the failing tests** — `update-check.test.ts`:

```ts
const release = (over = {}) => ({ tag_name: 'v1.1.0', html_url: 'https://github.com/wiiProfaker/TextMeet/releases/tag/v1.1.0', draft: false, prerelease: false, ...over });

it('parseVersion and isNewer compare versions as numbers', () => {
  expect(parseVersion('v1.10.0')).toEqual([1, 10, 0]);
  expect(parseVersion('1.1.0-beta')).toBeNull();
  expect(isNewer('1.10.0', '1.9.3')).toBe(true);
  expect(isNewer('1.0.0', '1.0.0')).toBe(false);
});
it('updateFromRelease returns a newer release', () => {
  expect(updateFromRelease(release(), '1.0.0')).toEqual({ version: '1.1.0', url: release().html_url });
});
it('updateFromRelease ignores prereleases, bad tags and foreign links', () => {
  expect(updateFromRelease(release({ prerelease: true }), '1.0.0')).toBeNull();
  expect(updateFromRelease(release({ draft: true }), '1.0.0')).toBeNull();
  expect(updateFromRelease(release({ tag_name: 'v1.1.0-beta' }), '1.0.0')).toBeNull();
  expect(updateFromRelease(release({ html_url: 'https://evil.example/x' }), '1.0.0')).toBeNull();
  expect(updateFromRelease('<html>', '1.0.0')).toBeNull();
  expect(updateFromRelease(release({ tag_name: 'v0.9.0' }), '1.0.0')).toBeNull();
});
it('checker stays silent on fetch errors', async () => { /* fetchJson отказывает (404 закрытого репозитория, 403) → onFound не вызван, logger.warn 1 раз, программа не падает */ });
it('checker asks after the first delay and then once a day, and not at all when disabled', async () => { /* поддельные часы */ });
```

  `settings.test.ts`: старый `settings.json` без новых полей → `checkUpdates: true`, `dismissedUpdate: null`.
  `e2e/shell.spec.ts`: `shows the new version banner and hides it for that version` — `TEXTMEET_TEST_UPDATE_URL` на
  локальный HTTP-сервер теста с ответом `release({ tag_name: 'v9.0.0' })`, `TEXTMEET_TEST_UPDATE_DELAY_MS=0` → плашка
  «Вышла версия 9.0.0»; «Скрыть» → плашки нет и после перезапуска; переключатель выключен → запроса к серверу нет.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** по интерфейсам; `openUpdate` открывает только ссылку, прошедшую `updateFromRelease`
  (префикс `RELEASES_PAGE_PREFIX`). Пока репозиторий закрыт, проверка получает 404 и молчит — так и задумано (§4.4).
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run e2e -- e2e/shell.spec.ts e2e/recording.spec.ts` → PASS.
- [ ] **Step 5: Commit** — `feat: tell when a newer version is published on GitHub`.

---

### Task 11: README, выпуск на GitHub, чистота репозитория

**Files:**
- Create: `README.md`, `docs/images/meeting.png`, `docs/images/windows-smartscreen.png` (если удастся снять;
  иначе — точный текст шагов), `docs/release-notes/v1.0.0.md`, `e2e/readme-shots.spec.ts`
- Modify: `.github/workflows/build.yml` (задание `release`), `playwright.config.ts` (снимки README — только при
  `TEXTMEET_README_SHOTS=1`)

**Interfaces:** нет.

- [ ] **Step 1: Снимок для README.** `e2e/readme-shots.spec.ts` (пропускается без `TEXTMEET_README_SHOTS=1`): встреча с
  текстом из нескольких реплик, двумя спикерами и готовыми итогами (как в `e2e/ai-summary.spec.ts`), окно 1100×720,
  светлая тема → `docs/images/meeting.png`. Тексты на снимке — придуманные, не из записей пользователя.
- [ ] **Step 2: README.md** — по §4.2, по-русски, в таком порядке: что это (2–3 строки) и снимок; «Скачать» (страница
  выпусков); системные требования (Windows 10/11 x64; Mac на Apple Silicon — минимальная версия macOS по
  `LSMinimumSystemVersion` собранного `Info.plist`; место под модели — по каталогу: расшифровка ~0,3–1,5 ГБ, итоги ~3–6,5
  ГБ); установка на Windows (синее окно «Система Windows защитила ваш компьютер» → «Подробнее» → «Выполнить в любом
  случае»); установка на Mac (перетащить в «Программы» → первый запуск → «Системные настройки» →
  «Конфиденциальность и безопасность» → «Всё равно открыть»; разрешения: микрофон, запись звука компьютера; запасной
  шаг для «Программа повреждена» — строка для «Терминала» `xattr -dr com.apple.quarantine /Applications/TextMeet.app` с
  пояснением, что она снимает пометку «скачано из интернета», — оставить, если проверка Mac в Task 14 его потребует,
  иначе убрать); первые шаги (по строке); где лежат записи и как удалить программу; обновления (новая версия ставится
  поверх; подсказка «Вышла версия…» — когда страница выпусков открыта для всех, без безусловного обещания); лицензии
  (ссылка на `THIRD-PARTY-NOTICES.txt`); в конце — «Для разработчиков» (`npm ci`, `npm run dev`, `npm test`, `npm run
  e2e`, сборка). Лицензию на код TextMeet не выбирать (решит пользователь).
- [ ] **Step 3: Выпуск в `build.yml`.** Новое задание `release`: `needs: build`, `if: startsWith(github.ref,
  'refs/tags/v')`, `permissions: contents: write` (только у него), скачивает оба артефакта и делает
  `gh release create "$GITHUB_REF_NAME" --draft --title "TextMeet ${GITHUB_REF_NAME#v}" --notes-file
  docs/release-notes/${GITHUB_REF_NAME}.md <exe> <dmg>` (`GH_TOKEN: ${{ github.token }}`). `docs/release-notes/v1.0.0.md` —
  5–8 строк по-русски: что умеет, ссылка на README (установка).
- [ ] **Step 4: Чистота репозитория.** Проверить всю историю, не только текущие файлы:
  `git log --all --name-only --format= | sort -u` — нет звуковых и видеофайлов, `samples`, `D:\TextMeet-samples`,
  моделей (`.onnx`, `.gguf`, `.bin`); `git log --all -p` по образцам ключей и токенов (`sk-`, `ghp_`, `github_pat_`,
  `AKIA`, `-----BEGIN`, `api[_-]?key\s*[:=]`), личных путей (`C:\\Users\\`, `/Users/`) вне документации и примеров.
  **Нашлось что-то личное или секретное — остановиться и спросить пользователя** (переписывать историю — только с его
  согласия). Итог одной строкой — в `plan-8-checks.md`.
- [ ] **Step 5: Run** `TEXTMEET_README_SHOTS=1 npx playwright test e2e/readme-shots.spec.ts` → снимок есть;
  `npx playwright test` без переменной — тест пропущен; README открывается в просмотре Markdown без битых ссылок.
- [ ] **Step 6: Commit** — `docs: README for people who install TextMeet, draft release on tags`.

---

### Task 12: Полная проверка и установщик

**Files:** нет новых (только исправления найденного).

- [ ] **Step 1:** `npm ci && npm run typecheck && npm run test:coverage` → зелёные, покрытие не ниже прежнего.
- [ ] **Step 2:** `npm run e2e` → все зелёные (пропущенные — только «собранная программа» и снимки README).
- [ ] **Step 3:** `npm run test:llm` (настоящая Qwen) → PASS; `npm run notices -- --check` → 0.
- [ ] **Step 4:** Windows-цепочка из Task 1 Step 7: `npm run dist:win` → `check-fuses` → тестовая копия → 
  `e2e/packaged.spec.ts` на копии → PASS. Установщик `release/TextMeet-Setup-1.0.0.exe` (новый значок).
- [ ] **Step 5: Итоговое ревью** всей ветки (`git diff main...plan-8-polish`) свежим проверяющим (агент
  `typescript-reviewer` или `code-reviewer`), с решениями Плана 8 и этим планом; исправить CRITICAL и HIGH, MEDIUM — по
  возможности; что не исправлено — в «Отложено» `plan-8-checks.md`. После исправлений — снова Step 1–4.
- [ ] **Step 6: Commit** исправлений — `fix: review fixes for plan 8`.

---

### Task 13: Ручная проверка на Windows (пользователь)

**Files:** `docs/superpowers/plan-8-checks.md` (создать: таблица «Пункт | Windows | Mac»).

- [ ] **Step 1:** Выйти из установленной TextMeet через трей; пользователь ставит `TextMeet-Setup-1.0.0.exe` поверх
  старой версии. Исполнитель даёт пользователю список (по-русски, по одному действию в пункте):
  1. Установка: предупреждение Windows (если есть) проходится по README; значок нового вида — на ярлыке, в панели
     задач, в установщике, в «Установка и удаление программ».
  2. Встреча с итогами в окне не на весь экран: итоги справа, текст на всю высоту.
  3. Тянуть границу между текстом и итогами — ширина меняется; закрыть и открыть программу — ширина та же.
  4. Сузить окно — итоги встают сверху; расширить — снова справа.
  5. «Свернуть» — текст на всю ширину; «Итоги встречи» — колонка вернулась.
  6. Спикеры — в строке под названием; переименование по щелчку работает.
  7. «Обновить» итоги — без «На основе предоставленного текста…» в начале.
  8. Настройки → «Общие»: «TextMeet 1.0.0», «Лицензии» открывает список.
  9. Плашка «Вышла версия…» — исполнитель показывает её запуском `npm run dev` с `TEXTMEET_TEST_UPDATE_URL` на
     локальный ответ (в выпуске подмена не работает — так и задумано); «Скачать» открывает браузер, «Скрыть» убирает.
  10. Выгрузка: «Сохранить в Word…» с именем без расширения поверх существующего файла → вопрос «Заменить файл?».
  11. Импорт файла с точками в имени без расширения (исполнитель готовит копию записи, например «Встреча 2026.10.05»)
      → название с точками целиком.
  12. Запись 1 минута, остановка, расшифровка, итоги — всё как раньше.
- [ ] **Step 2:** Результаты — в столбец «Windows»; найденное — исправить (с тестом), повторить затронутые пункты.
- [ ] **Step 3: Commit** — `docs: plan 8 checks on Windows`.

---

### Task 14: Публикация, выпуск, проверка на Mac, документы

**Files:** `docs/superpowers/plan-8-checks.md`, `docs/superpowers/plan-5-checks.md`, `plan-6-checks.md`,
`plan-9-checks.md` (столбцы «Mac»), `docs/superpowers/specs/2026-09-25-textmeet-design.md`,
`docs/superpowers/plans/2026-09-25-textmeet-roadmap.md`, `README.md` (шаг Mac).

- [ ] **Step 1: Спросить пользователя** разрешения отправить на GitHub. Только после «да»: `git push -u origin
  plan-8-polish`, `git push origin main plan-5-import-export plan-6-copy-ai plan-9-local-ai` (ветки, которые ещё не
  отправлены — проверить `git branch -vv`).
- [ ] **Step 2:** Слить `plan-8-polish` в `main` (`git merge --no-ff`), отправить `main` — **тем же разрешением**, если
  пользователь разрешил отправку «всего Плана 8»; иначе спросить отдельно. `ci` на `main` — зелёный.
- [ ] **Step 3:** Метка `v1.0.0` на `main` → `git push origin v1.0.0` (спросить, если разрешение не покрывало метку) →
  `build.yml` зелёный на обеих ОС → черновик выпуска с `TextMeet-Setup-1.0.0.exe` и `TextMeet-1.0.0-arm64.dmg`.
- [ ] **Step 4: Проверка на Mac (пользователь)** — `.dmg`, скачанный со страницы выпуска (не перенесённый флешкой):
  установка по README («Всё равно открыть»; если «Программа повреждена» — сначала попробовать исправить сборку без
  платной подписи, иначе оставить в README строку для «Терминала» — пользователь согласен, §4.1); значок в Dock и
  Finder; пункты 2–8, 10–12 Task 13; пункты Планов 5, 6, 9 (столбцы «Mac» их проверок); спрашивает ли macOS «Запись
  экрана» при первой записи (открытый вопрос Плана 2 — записать ответ); скорость итогов на M4 16 ГБ (время итогов
  подкаста или часовой встречи — записать). Найденное — исправить, `v1.0.1`.
- [ ] **Step 5: Документы.** `plan-8-checks.md`: таблица проверок, «Решения при выполнении», «Отложено» (что не
  исправлено из ревью), **сводный список «Известные ограничения»** — все оставшиеся пункты «Отложено» Планов 1–9 одним
  списком (§5.3). Спецификация — разделы, которые изменились (раскладка встречи, значок, установка, обновления,
  лицензии, fuses и тестовые подмены). Дорожная карта: План 8 — «выполнен». Проверки Планов 5, 6, 9 — столбец «Mac».
  Сказать пользователю: при открытии репозитория будет видна почта в коммитах, лицензия на код не выбрана; черновик
  выпуска публикуется кнопкой «Publish release» (или исполнителем — с разрешения).
- [ ] **Step 6: Commit и отправка** (тем же разрешением) — `docs: plan 8 done`.
