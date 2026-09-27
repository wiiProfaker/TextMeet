# TextMeet — План 1: каркас приложения

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Настоящее приложение TextMeet (без записи и расшифровки): главное окно со списком встреч и настройками, скрытое окно записи, значок в трее, автозапуск при входе в систему, хранилище библиотеки (папки встреч, zod-схемы, атомарная запись), журнал ошибок, тесты (Vitest + Playwright) и сборка установщиков `.exe` / `.dmg` в GitHub Actions по кнопке.

**Architecture:** Electron-приложение в корне репозитория (папка `spike/` не трогается). Сборка — electron-vite: `src/main` (главный процесс), `src/preload` (один preload на оба окна), `src/renderer/main` (React-интерфейс) и `src/renderer/recorder` (скрытое окно записи, пока только сообщает «готово»). Вся логика без Electron (файлы, схемы, библиотека, настройки, значки, форматирование) лежит в отдельных модулях и покрыта Vitest; склейка с Electron проверяется сквозными тестами Playwright на собранном приложении.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0 + Vite 7.3.6, React 19.3, TypeScript 7.0.2 (только проверка типов), zod 4.6.5, Vitest 5.0.2 (+ coverage-v8), Playwright 1.63.0 (`_electron`), electron-builder 26.15.3, GitHub Actions.

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.1 (трей, автозапуск, закрытие окна), §3.6, §3.7, §5.1, §5.2, §5.6, §6 (журнал, повреждённые файлы), §7, §8. Итоги спайка: [spike-results.md](../spike-results.md).

---

## Факты, на которые опирается план (проверены 2026-09-27 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии на Windows 11: 94 модульных теста (покрытие 99 %), 7 сквозных
тестов (3 прогона подряд без сбоев), сборка установщика NSIS, запуск упакованной версии.

- **Версии совместимы так:** electron-vite 5.0.0 требует Vite ≤ 7, поэтому Vite **7.3.6** и `@vitejs/plugin-react` **5.2.0**
  (плагин 6.x требует Vite 8). TypeScript 7 — новый нативный компилятор, используется только для `tsc --noEmit`;
  код собирают Vite/esbuild.
- **`package.json` без `"type": "module"`**: тогда electron-vite собирает main и preload в CommonJS. Preload в песочнице
  (`sandbox: true`) обязан быть CommonJS.
- **Один preload на оба окна.** Если сделать два preload-скрипта с общим модулем, сборщик выносит общий код в файл
  `out/preload/chunks/*.js`, а preload в песочнице не может подключать соседние файлы — окно остаётся без API.
  Опция electron-vite `isolatedEntries` решает это, но в 5.0.0 падает, когда вывод идёт не в терминал
  (`process.stdout.clearLine is not a function`) — то есть в GitHub Actions. Поэтому один `src/preload/index.ts`,
  а какое окно каким каналом может пользоваться, проверяет main по `event.sender`.
- **Preload не импортирует пакеты** (zod и т. п.): в песочнице доступен только `electron`. Из `src/shared/ipc.ts`
  preload берёт только константы каналов и типы; сам `ipc.ts` импортирует из других файлов только типы (`import type`).
- **Playwright + Electron:** `_electron.launch({ args: ['.'] })` запускает `out/main/index.js` (поле `main`).
  `app.firstWindow()` иногда возвращает скрытое окно записи — главное окно ищем по адресу `.../main/index.html`.
  Главное окно становится видимым чуть позже, чем появляется содержимое страницы, — видимость проверяем через `expect.poll`.
  Системный диалог выбора папки подменяется из теста через `app.evaluate(({ dialog }) => …)`.
- **Изоляция тестов:** `TEXTMEET_USER_DATA` (папка данных приложения) и `TEXTMEET_HOME` (замена домашней папки для
  библиотеки по умолчанию) задаются только тестами. `app.setPath('userData', …)` вызывается до `requestSingleInstanceLock()`,
  поэтому тестовые запуски не конфликтуют с установленным TextMeet.
- **Автозапуск** (`app.setLoginItemSettings`): прописывается **только в установленной программе** (`app.isPackaged`),
  иначе версия для разработки записала бы в автозагрузку `electron.exe`. На Windows — с аргументом `--hidden`
  (`getLoginItemSettings` нужно вызывать с теми же `args`, иначе `openAtLogin` будет неверным); признак «запущено при входе» —
  этот аргумент. На macOS — `wasOpenedAtLogin`, статус `requires-approval` означает, что пользователь должен разрешить
  программу в «Объектах входа». Документация Electron предупреждает: у неподписанной программы на macOS автозапуск может
  молча не сработать — проверяется вручную в Task 13.
- **Значок трея рисуется кодом**: PNG кодируется своим маленьким кодировщиком (`zlib.deflateSync` + `zlib.crc32`, есть в
  Node ≥ 22.2) и загружается `nativeImage.createFromBuffer` с представлениями 1× и 2×. `createFromBitmap` не подходит —
  он ждёт BGRA, а не RGBA. На macOS значок — шаблон (`setTemplateImage(true)`).
- **Упаковка:** electron-builder с `files: [out/**, package.json]`; React и прочее для интерфейса — в `devDependencies`
  (Vite встраивает их в сборку), в `dependencies` только то, что main подключает во время работы (`zod`).
  Для Mac: `--mac dir --arm64`, ad-hoc подпись `codesign --sign -` и `.dmg` через `hdiutil` — тот же путь, что сработал
  в спайке (неподписанное arm64-приложение macOS вообще не запускает).
- **Сборка в CI по кнопке** (`workflow_dispatch`) и по тегу `v*`: у закрытого репозитория минуты ограничены, macOS
  считается с множителем. Проверка типов и модульные тесты — на каждый push в `main` на `ubuntu-latest`
  (без скачивания Electron: `ELECTRON_SKIP_BINARY_DOWNLOAD=1`).

## Что сознательно не входит в План 1

- Запись звука, горячая клавиша, пункты «Начать/Остановить запись» в трее, уведомления — План 2.
- Модели, расшифровка, `transcript.json` — План 3. Плеер, правка, поиск — План 4. `ai.json` — План 6.
- Настоящий визуальный дизайн: сейчас аккуратный, но простой каркас интерфейса. Макет интерфейса показывается
  пользователю перед Планом 2 (спецификация §3.7) — это вписывается в дорожную карту в Task 14.
- Свой значок приложения (сейчас стандартный значок Electron) — План 8.

## Карта файлов

```
package.json                    # зависимости, скрипты
tsconfig.json                   # проверка типов для src/, e2e/ и конфигов
electron.vite.config.ts         # main, preload, renderer (две страницы)
electron-builder.yml            # упаковка .exe (NSIS) и .app для Mac
vitest.config.ts                # модульные тесты + порог покрытия 80 %
playwright.config.ts            # сквозные тесты Electron
.gitignore                      # + test-results/, playwright-report/
.github/workflows/ci.yml        # push в main: типы + модульные тесты (ubuntu)
.github/workflows/build.yml     # по кнопке / тегу: тесты + установщики Windows и Mac
src/
  shared/                       # общее для main и окон
    settings.ts (+ .test.ts)    # SettingsSchema, DEFAULT_SETTINGS
    meeting.ts (+ .test.ts)     # MeetingSchema, MEETING_ID_PATTERN, MeetingListEntry
    ipc.ts                      # имена каналов IPC и типы API окон (без zod!)
  main/
    index.ts                    # запуск: один экземпляр, окна, трей, закрытие = скрыть
    windows.ts                  # главное окно и скрытое окно записи
    tray.ts                     # значок и меню трея
    autostart.ts                # автозапуск при входе в систему (Electron)
    ipc.ts                      # обработчики IPC с проверкой отправителя и входных данных
    logger.ts (+ .test.ts)      # журнал ошибок с ротацией
    paths.ts (+ .test.ts)       # папка библиотеки по умолчанию
    startup.ts (+ .test.ts)     # чистая логика: скрытый старт, подсказка автозапуска
    tray-menu.ts (+ .test.ts)   # пункты меню трея
    fs/atomic-write.ts (+ .test.ts)   # атомарная запись файлов
    fs/read-json.ts (+ .test.ts)      # чтение JSON со схемой zod
    settings/settings-store.ts (+ .test.ts)  # settings.json: чтение, запись, повреждённый файл
    library/naming.ts (+ .test.ts)    # id папки встречи, название по умолчанию
    library/library.ts (+ .test.ts)   # создать / прочитать / сохранить / перечислить встречи
    icons/png.ts (+ .test.ts)         # кодировщик PNG
    icons/circle-icon.ts (+ .test.ts) # рисование значка-кольца
  preload/
    index.ts                    # window.textmeet и window.recorder
  renderer/
    env.d.ts                    # типы window.textmeet / window.recorder, vite/client
    main/
      index.html, main.tsx, App.tsx, styles.css
      LibraryScreen.tsx         # список встреч + подробности выбранной
      SettingsScreen.tsx        # папка библиотеки, автозапуск, версия
      format.ts (+ .test.ts)    # статусы, длительность, дата, тексты подсказок
      errors.ts (+ .test.ts)    # текст ошибки без обёртки Electron
    recorder/
      index.html, recorder.ts   # скрытое окно записи (пока только «готово»)
e2e/
  helpers.ts                    # запуск приложения во временных папках
  shell.spec.ts                 # окна: закрытие прячет в трей, окно записи готово
  screens.spec.ts               # библиотека и настройки
```

Где что хранится:
- настройки — `<userData>/settings.json` (`%APPDATA%\TextMeet` на Windows, `~/Library/Application Support/TextMeet` на Mac);
- журнал — `<userData>/logs/textmeet.log` (+ `textmeet.log.1` после 5 МБ); **без текста встреч и ключей**;
- библиотека — из настроек или `~/TextMeet` (Windows: `C:\Users\<user>\TextMeet`).

---

### Task 1: Ветка и инструменты проекта

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `electron-builder.yml`, `vitest.config.ts`, `playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Создать ветку**

```bash
git checkout main
git pull
git checkout -b plan-1-skeleton
```

- [ ] **Step 2: Создать `package.json`**

```json
{
  "name": "textmeet",
  "productName": "TextMeet",
  "version": "0.1.0",
  "description": "Запись и расшифровка встреч",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && electron-builder --win --publish never",
    "dist:mac": "npm run build && electron-builder --mac dir --arm64 --publish never"
  },
  "dependencies": {
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@types/node": "24.19.0",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "5.2.0",
    "@vitest/coverage-v8": "5.0.2",
    "electron": "44.4.5",
    "electron-builder": "26.15.3",
    "electron-vite": "5.0.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "typescript": "7.0.2",
    "vite": "7.3.6",
    "vitest": "5.0.2"
  }
}
```

Важно: **не** добавлять `"type": "module"` (см. «Факты»). `react`/`react-dom` — в `devDependencies` намеренно.

- [ ] **Step 3: Создать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "e2e", "electron.vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Создать `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  // Один preload (src/preload/index.ts) на оба окна — см. «Факты» в плане.
  preload: {},
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

- [ ] **Step 5: Создать `electron-builder.yml`**

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
```

- [ ] **Step 6: Создать `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Только модули без Electron; склейку с Electron проверяют сквозные тесты (e2e/).
      include: [
        'src/shared/**/*.ts',
        'src/main/fs/**/*.ts',
        'src/main/library/**/*.ts',
        'src/main/settings/**/*.ts',
        'src/main/icons/**/*.ts',
        'src/main/logger.ts',
        'src/main/paths.ts',
        'src/main/startup.ts',
        'src/main/tray-menu.ts',
        'src/renderer/main/format.ts',
        'src/renderer/main/errors.ts',
      ],
      exclude: ['**/*.test.ts', 'src/shared/ipc.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 7: Создать `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // Один экземпляр Electron за раз: так проще и стабильнее.
  workers: 1,
  reporter: 'list',
});
```

- [ ] **Step 8: Дополнить `.gitignore`** — добавить в конец:

```
# Результаты Playwright
test-results/
playwright-report/
```

- [ ] **Step 9: Установить зависимости**

Run: `npm install`
Expected: без ошибок, создан `package-lock.json`, Electron скачан (при первом запуске — ~100 МБ).

Run: `npx electron --version`
Expected: `v44.4.5`

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json electron.vite.config.ts electron-builder.yml vitest.config.ts playwright.config.ts .gitignore
git commit -m "chore: add Electron app tooling (electron-vite, React, Vitest, Playwright)"
```

---

### Task 2: Атомарная запись и чтение JSON со схемой

Все файлы библиотеки и настроек пишутся атомарно (спецификация §5.6): временный файл рядом → сброс на диск → переименование.
OneDrive и антивирус иногда ненадолго держат файл — переименование повторяется при `EPERM`/`EACCES`/`EBUSY`.

**Files:**
- Create: `src/main/fs/atomic-write.ts`, `src/main/fs/atomic-write.test.ts`
- Create: `src/main/fs/read-json.ts`, `src/main/fs/read-json.test.ts`

- [ ] **Step 1: Написать тест `src/main/fs/atomic-write.test.ts`**

```ts
import { mkdtempSync, promises as fsp, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic, writeJsonAtomic, type RenameFn } from './atomic-write';

const tempDir = () => mkdtempSync(join(tmpdir(), 'textmeet-atomic-'));

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('writeFileAtomic', () => {
  it('creates the file with the given content', async () => {
    const dir = tempDir();
    await writeFileAtomic(join(dir, 'a.txt'), 'привет');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('привет');
  });

  it('replaces an existing file and leaves no temp files', async () => {
    const dir = tempDir();
    const file = join(dir, 'a.txt');
    await writeFileAtomic(file, 'old');
    await writeFileAtomic(file, 'new');
    expect(readFileSync(file, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });

  it('retries rename on EPERM and succeeds', async () => {
    const dir = tempDir();
    let calls = 0;
    const flakyRename: RenameFn = async (from, to) => {
      calls += 1;
      if (calls <= 2) throw errnoError('EPERM');
      await fsp.rename(from, to);
    };
    await writeFileAtomic(join(dir, 'a.txt'), 'x', flakyRename);
    expect(calls).toBe(3);
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });

  it('gives up after the retries and removes the temp file', async () => {
    const dir = tempDir();
    const alwaysBusy: RenameFn = async () => {
      throw errnoError('EBUSY');
    };
    await expect(writeFileAtomic(join(dir, 'a.txt'), 'x', alwaysBusy)).rejects.toThrow('EBUSY');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('does not retry non-retryable errors', async () => {
    const dir = tempDir();
    let calls = 0;
    const broken: RenameFn = async () => {
      calls += 1;
      throw errnoError('EXDEV');
    };
    await expect(writeFileAtomic(join(dir, 'a.txt'), 'x', broken)).rejects.toThrow('EXDEV');
    expect(calls).toBe(1);
  });

  it('rejects when the folder does not exist', async () => {
    const dir = tempDir();
    await expect(writeFileAtomic(join(dir, 'missing', 'a.txt'), 'x')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('writeJsonAtomic', () => {
  it('writes pretty JSON with a trailing newline', async () => {
    const dir = tempDir();
    await writeJsonAtomic(join(dir, 'a.json'), { a: 1 });
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/main/fs/atomic-write.test.ts`
Expected: FAIL — `Failed to resolve import "./atomic-write"`.

- [ ] **Step 3: Написать `src/main/fs/atomic-write.ts`**

```ts
import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';

// OneDrive и антивирус иногда ненадолго держат файл — переименование повторяем.
const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = [50, 100, 200, 400];

export type RenameFn = (from: string, to: string) => Promise<void>;

/** Пишет во временный файл рядом, сбрасывает на диск и переименовывает поверх целевого. */
export async function writeFileAtomic(
  file: string,
  data: string | Uint8Array,
  rename: RenameFn = fsp.rename,
): Promise<void> {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tmp, file, rename);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

export function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function renameWithRetry(from: string, to: string, rename: RenameFn): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const delay = RETRY_DELAYS_MS[attempt];
      if (code === undefined || !RETRYABLE_CODES.has(code) || delay === undefined) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/main/fs/atomic-write.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Написать тест `src/main/fs/read-json.test.ts`**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readJsonFile } from './read-json';

const Schema = z.object({ n: z.number() });
const tempDir = () => mkdtempSync(join(tmpdir(), 'textmeet-readjson-'));

describe('readJsonFile', () => {
  it('returns the parsed value', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{"n": 5}');
    expect(await readJsonFile(file, Schema)).toEqual({ ok: true, value: { n: 5 } });
  });

  it('accepts a UTF-8 BOM', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '\uFEFF{"n": 1}');
    expect(await readJsonFile(file, Schema)).toEqual({ ok: true, value: { n: 1 } });
  });

  it('reports a missing file', async () => {
    const result = await readJsonFile(join(tempDir(), 'none.json'), Schema);
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('reports broken JSON', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{oops');
    expect(await readJsonFile(file, Schema)).toMatchObject({ ok: false, reason: 'invalid-json' });
  });

  it('reports data that does not match the schema, naming the field', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{"n": "five"}');
    const result = await readJsonFile(file, Schema);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-data' });
    expect(result.ok ? '' : result.message).toContain('n');
  });

  it('rethrows other file errors', async () => {
    // Чтение папки как файла — ошибка EISDIR, а не «файла нет».
    await expect(readJsonFile(tempDir(), Schema)).rejects.toMatchObject({ code: expect.any(String) });
  });
});
```

- [ ] **Step 6: Запустить — должен упасть**

Run: `npx vitest run src/main/fs/read-json.test.ts`
Expected: FAIL — `Failed to resolve import "./read-json"`.

- [ ] **Step 7: Написать `src/main/fs/read-json.ts`**

```ts
import { promises as fsp } from 'node:fs';
import { z } from 'zod';

export type ReadJsonFailure = { ok: false; reason: 'missing' | 'invalid-json' | 'invalid-data'; message: string };
export type ReadJsonResult<T> = { ok: true; value: T } | ReadJsonFailure;

/** Читает JSON и проверяет его схемой. Отсутствие файла и мусор внутри — не исключения, а результат. */
export async function readJsonFile<S extends z.ZodType>(file: string, schema: S): Promise<ReadJsonResult<z.output<S>>> {
  let text: string;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, reason: 'missing', message: 'файл не найден' };
    }
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    return { ok: false, reason: 'invalid-json', message: (err as Error).message };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid-data', message: z.prettifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}
```

- [ ] **Step 8: Запустить все тесты папки**

Run: `npx vitest run src/main/fs`
Expected: PASS, 13 тестов.

- [ ] **Step 9: Commit**

```bash
git add src/main/fs
git commit -m "feat: add atomic file writes and schema-checked JSON reads"
```

---

### Task 3: Журнал ошибок

Спецификация §6: ошибки пишутся в лог-файл в папке данных приложения, **без текста встреч и без ключей**. Журнал
не должен ронять программу, даже если писать некуда. Ротация: больше 5 МБ → файл переименовывается в `.1`.

**Files:**
- Create: `src/main/logger.ts`, `src/main/logger.test.ts`

- [ ] **Step 1: Написать тест `src/main/logger.test.ts`**

```ts
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger, describeError, formatLogLine } from './logger';

const fixedNow = () => new Date('2026-09-27T10:00:00.000Z');
const logFile = () => join(mkdtempSync(join(tmpdir(), 'textmeet-log-')), 'logs', 'textmeet.log');

describe('formatLogLine', () => {
  it('formats time, level and message', () => {
    expect(formatLogLine('INFO', 'запуск', undefined, fixedNow())).toBe('2026-09-27T10:00:00.000Z INFO запуск\n');
  });

  it('appends error details', () => {
    const line = formatLogLine('ERROR', 'сбой', 'plain text', fixedNow());
    expect(line).toBe('2026-09-27T10:00:00.000Z ERROR сбой | plain text\n');
  });
});

describe('describeError', () => {
  it('uses the stack for Error objects', () => {
    const err = new Error('boom');
    expect(describeError(err)).toContain('boom');
  });

  it('falls back to name and message when there is no stack', () => {
    const err = new Error('boom');
    err.stack = undefined;
    expect(describeError(err)).toBe('Error: boom');
  });
});

describe('createLogger', () => {
  it('creates the folder and appends lines in order', async () => {
    const file = logFile();
    const logger = createLogger(file, { now: fixedNow });
    logger.info('один');
    logger.warn('два');
    logger.error('три', new Error('x'));
    await logger.flush();
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines[0]).toBe('2026-09-27T10:00:00.000Z INFO один');
    expect(lines[1]).toBe('2026-09-27T10:00:00.000Z WARN два');
    expect(lines[2]).toMatch(/^2026-09-27T10:00:00.000Z ERROR три \| Error: x/);
  });

  it('rotates the file when it grows past the limit', async () => {
    const file = logFile();
    const logger = createLogger(file, { now: fixedNow, maxBytes: 80 });
    logger.info('первая строка журнала');
    logger.info('вторая строка журнала');
    await logger.flush();
    expect(readFileSync(`${file}.1`, 'utf8')).toContain('первая');
    expect(readFileSync(file, 'utf8')).toContain('вторая');
    expect(readFileSync(file, 'utf8')).not.toContain('первая');
  });

  it('keeps working when the log cannot be written', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'textmeet-log-'));
    // Путь проходит «через» файл — mkdir упадёт, логгер должен проглотить ошибку.
    const blocker = join(dir, 'blocker');
    const logger = createLogger(blocker, { now: fixedNow });
    logger.info('создаёт файл blocker');
    await logger.flush();
    const broken = createLogger(join(blocker, 'nested', 'x.log'), { now: fixedNow });
    broken.info('не запишется');
    await expect(broken.flush()).resolves.toBeUndefined();
    expect(existsSync(join(blocker, 'nested'))).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/main/logger.test.ts`
Expected: FAIL — `Failed to resolve import "./logger"`.

- [ ] **Step 3: Написать `src/main/logger.ts`**

```ts
import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';

// Правило: в журнал не пишем текст встреч и ключи API — только события и ошибки.
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string): void;
  warn(message: string, err?: unknown): void;
  error(message: string, err?: unknown): void;
  /** Дожидается записи всех строк (для тестов и перед выходом). */
  flush(): Promise<void>;
}

export const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return String(err);
}

export function formatLogLine(level: LogLevel, message: string, err: unknown, now: Date): string {
  const detail = err === undefined ? '' : ` | ${describeError(err)}`;
  return `${now.toISOString()} ${level} ${message}${detail}\n`;
}

export interface LoggerOptions {
  maxBytes?: number;
  now?: () => Date;
}

export function createLogger(file: string, options: LoggerOptions = {}): Logger {
  const maxBytes = options.maxBytes ?? MAX_LOG_BYTES;
  const now = options.now ?? (() => new Date());
  let queue: Promise<void> = Promise.resolve();

  const write = (level: LogLevel, message: string, err?: unknown): void => {
    const line = formatLogLine(level, message, err, now());
    queue = queue
      .then(() => appendWithRotation(file, line, maxBytes))
      .catch((writeErr: unknown) => {
        // Журнал не должен ронять программу; сообщить об ошибке журнала больше некуда.
        console.error('TextMeet: не удалось записать журнал', writeErr);
      });
  };

  return {
    info: (message) => write('INFO', message),
    warn: (message, err) => write('WARN', message, err),
    error: (message, err) => write('ERROR', message, err),
    flush: () => queue,
  };
}

async function appendWithRotation(file: string, line: string, maxBytes: number): Promise<void> {
  await fsp.mkdir(dirname(file), { recursive: true });
  const size = await fsp.stat(file).then(
    (stat) => stat.size,
    () => 0,
  );
  if (size > 0 && size + Buffer.byteLength(line) > maxBytes) {
    await fsp.rm(`${file}.1`, { force: true });
    await fsp.rename(file, `${file}.1`);
  }
  await fsp.appendFile(file, line, 'utf8');
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/main/logger.test.ts`
Expected: PASS, 7 тестов (в выводе будет строка `TextMeet: не удалось записать журнал` — это ожидаемо, тест проверяет именно этот случай).

- [ ] **Step 5: Commit**

```bash
git add src/main/logger.ts src/main/logger.test.ts
git commit -m "feat: add rotating error log that never crashes the app"
```

---

### Task 4: Настройки — схема и хранилище

Спецификация §3.6, §5.6. В Плане 1 настроек две: папка библиотеки и автозапуск. Новые поля в следующих планах
добавляются с `.default(...)` — старый `settings.json` читается без миграции. Повреждённый файл не роняет программу:
он откладывается как `settings.json.broken-<время>`, берутся значения по умолчанию, в журнал пишется предупреждение.

**Files:**
- Create: `src/shared/settings.ts`, `src/shared/settings.test.ts`
- Create: `src/main/settings/settings-store.ts`, `src/main/settings/settings-store.test.ts`

- [ ] **Step 1: Написать тест `src/shared/settings.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsSchema } from './settings';

describe('SettingsSchema', () => {
  it('fills defaults for an empty object', () => {
    expect(DEFAULT_SETTINGS).toEqual({ schemaVersion: 1, libraryDir: null, launchAtLogin: true });
  });

  it('keeps provided values', () => {
    const parsed = SettingsSchema.parse({ libraryDir: 'D:\\Встречи', launchAtLogin: false });
    expect(parsed).toEqual({ schemaVersion: 1, libraryDir: 'D:\\Встречи', launchAtLogin: false });
  });

  it('rejects wrong types and empty paths', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/shared/settings.test.ts`
Expected: FAIL — `Failed to resolve import "./settings"`.

- [ ] **Step 3: Написать `src/shared/settings.ts`**

```ts
import { z } from 'zod';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
export const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  /** null — папка по умолчанию: ~/TextMeet */
  libraryDir: z.string().min(1).nullable().default(null),
  launchAtLogin: z.boolean().default(true),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/shared/settings.test.ts`
Expected: PASS, 3 теста.

- [ ] **Step 5: Написать тест `src/main/settings/settings-store.test.ts`**

```ts
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import type { Logger } from '../logger';
import { createSettingsStore, loadSettings } from './settings-store';

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) };
}
const tempDir = () => mkdtempSync(join(tmpdir(), 'textmeet-settings-'));

describe('loadSettings', () => {
  it('returns defaults when the file is missing', async () => {
    expect(await loadSettings(join(tempDir(), 'settings.json'), fakeLogger())).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a valid file and fills new fields with defaults', async () => {
    const file = join(tempDir(), 'settings.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, libraryDir: 'D:\\Lib' }));
    expect(await loadSettings(file, fakeLogger())).toEqual({ schemaVersion: 1, libraryDir: 'D:\\Lib', launchAtLogin: true });
  });

  it('moves a broken file aside, warns and returns defaults', async () => {
    const dir = tempDir();
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{oops');
    const logger = fakeLogger();
    const settings = await loadSettings(file, logger, () => new Date(1000));
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(readdirSync(dir)).toEqual(['settings.json.broken-1000']);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('logs an error when the broken file cannot be moved', async () => {
    const dir = tempDir();
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{oops');
    // Имя копии занято непустой папкой — переименование файла поверх неё упадёт.
    const backup = `${file}.broken-1000`;
    mkdirSync(backup);
    writeFileSync(join(backup, 'keep'), 'x');
    const logger = fakeLogger();
    expect(await loadSettings(file, logger, () => new Date(1000))).toEqual(DEFAULT_SETTINGS);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('createSettingsStore', () => {
  it('updates, persists and returns the new settings', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    const next = await store.update({ launchAtLogin: false });
    expect(next.launchAtLogin).toBe(false);
    expect(store.get()).toEqual(next);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(next);
  });

  it('applies concurrent updates in order without losing any', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    await Promise.all([store.update({ launchAtLogin: false }), store.update({ libraryDir: 'D:\\A' })]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ schemaVersion: 1, libraryDir: 'D:\\A', launchAtLogin: false });
  });

  it('rejects invalid values and keeps the old ones', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    await expect(store.update({ libraryDir: '' })).rejects.toThrow();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    await expect(store.update({ launchAtLogin: false })).resolves.toMatchObject({ launchAtLogin: false });
  });
});
```

- [ ] **Step 6: Запустить — должен упасть**

Run: `npx vitest run src/main/settings`
Expected: FAIL — `Failed to resolve import "./settings-store"`.

- [ ] **Step 7: Написать `src/main/settings/settings-store.ts`**

```ts
import { promises as fsp } from 'node:fs';
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '../../shared/settings';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';

export type SettingsUpdate = Partial<Omit<Settings, 'schemaVersion'>>;

export interface SettingsStore {
  get(): Settings;
  /** Проверяет, сохраняет на диск и только потом меняет значение в памяти. */
  update(patch: SettingsUpdate): Promise<Settings>;
}

/** Нет файла — настройки по умолчанию. Файл повреждён — откладываем его в сторону и тоже берём умолчания. */
export async function loadSettings(file: string, logger: Logger, now: () => Date = () => new Date()): Promise<Settings> {
  const result = await readJsonFile(file, SettingsSchema);
  if (result.ok) return result.value;
  if (result.reason === 'missing') return DEFAULT_SETTINGS;
  const backup = `${file}.broken-${now().getTime()}`;
  try {
    await fsp.rename(file, backup);
    logger.warn(`Настройки повреждены (${result.reason}), копия: ${backup}. Используются значения по умолчанию.`);
  } catch (err) {
    logger.error('Настройки повреждены, и не удалось отложить файл в сторону', err);
  }
  return DEFAULT_SETTINGS;
}

export async function createSettingsStore(file: string, logger: Logger): Promise<SettingsStore> {
  let current = await loadSettings(file, logger);
  let queue: Promise<unknown> = Promise.resolve();

  return {
    get: () => current,
    update: (patch) => {
      const run = queue.then(async () => {
        const next = SettingsSchema.parse({ ...current, ...patch });
        await writeJsonAtomic(file, next);
        current = next;
        return next;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
```

- [ ] **Step 8: Запустить — должен пройти**

Run: `npx vitest run src/shared/settings.test.ts src/main/settings`
Expected: PASS, 10 тестов.

- [ ] **Step 9: Commit**

```bash
git add src/shared/settings.ts src/shared/settings.test.ts src/main/settings
git commit -m "feat: add settings schema and store with broken-file recovery"
```

---

### Task 5: Встреча — схема `meeting.json`, id папки, название по умолчанию

Спецификация §3.1 (название «Встреча 25.09.2026 14:30»), §5.6 (папка `2026-09-25_1430_a1b2c3`, `meeting.json`).
id встречи = имя её папки: местные дата и время + 6 случайных hex-символов. Строгий шаблон id ещё и защищает от
выхода за пределы библиотеки (`..`, `/`), когда id приходит из окна по IPC.

**Files:**
- Create: `src/shared/meeting.ts`, `src/shared/meeting.test.ts`
- Create: `src/main/library/naming.ts`, `src/main/library/naming.test.ts`

- [ ] **Step 1: Написать тест `src/shared/meeting.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { MEETING_ID_PATTERN, MeetingSchema, type Meeting } from './meeting';

const valid: Meeting = {
  schemaVersion: 1,
  id: '2026-09-25_1430_a1b2c3',
  title: 'Встреча 25.09.2026 14:30',
  createdAt: '2026-09-25T11:30:00.000Z',
  durationSec: null,
  source: 'recording',
  participantsHint: null,
  model: null,
  status: 'recording',
  errorMessage: null,
  speakerNames: {},
};

describe('MEETING_ID_PATTERN', () => {
  it('accepts well-formed ids', () => {
    expect(MEETING_ID_PATTERN.test('2026-09-25_1430_a1b2c3')).toBe(true);
  });

  it.each(['2026-09-25_1430_A1B2C3', '2026-09-25_1430', '../2026-09-25_1430_a1b2c3', '2026-09-25_1430_a1b2c3/x'])(
    'rejects %s',
    (id) => {
      expect(MEETING_ID_PATTERN.test(id)).toBe(false);
    },
  );
});

describe('MeetingSchema', () => {
  it('accepts a valid meeting', () => {
    expect(MeetingSchema.parse(valid)).toEqual(valid);
  });

  it('trims the title and speaker names', () => {
    const parsed = MeetingSchema.parse({ ...valid, title: '  План  ', speakerNames: { S1: ' Иван ' } });
    expect(parsed.title).toBe('План');
    expect(parsed.speakerNames).toEqual({ S1: 'Иван' });
  });

  it.each([
    ['empty title', { title: '   ' }],
    ['bad date', { createdAt: 'вчера' }],
    ['negative duration', { durationSec: -1 }],
    ['unknown status', { status: 'paused' }],
    ['zero participants', { participantsHint: 0 }],
    ['fractional participants', { participantsHint: 2.5 }],
    ['future schema version', { schemaVersion: 2 }],
  ])('rejects %s', (_name, patch) => {
    expect(MeetingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/shared/meeting.test.ts`
Expected: FAIL — `Failed to resolve import "./meeting"`.

- [ ] **Step 3: Написать `src/shared/meeting.ts`**

```ts
import { z } from 'zod';

/** Имя папки встречи = её id: дата и время создания (местные) + 6 случайных hex-символов. */
export const MEETING_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}_[0-9a-f]{6}$/;

export const MeetingIdSchema = z.string().regex(MEETING_ID_PATTERN);
export const MeetingSourceSchema = z.enum(['recording', 'import']);
export const MeetingStatusSchema = z.enum(['recording', 'recorded', 'queued', 'transcribing', 'done', 'error']);

export const MeetingSchema = z.object({
  schemaVersion: z.literal(1),
  id: MeetingIdSchema,
  title: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(),
  durationSec: z.number().nonnegative().nullable(),
  source: MeetingSourceSchema,
  /** Сколько человек было на встрече, включая владельца; null — не указано. */
  participantsHint: z.number().int().min(1).max(50).nullable(),
  /** Модель расшифровки; null — ещё не расшифровывалась. */
  model: z.string().min(1).nullable(),
  status: MeetingStatusSchema,
  errorMessage: z.string().nullable(),
  /** Переименованные спикеры: id спикера → имя. */
  speakerNames: z.record(z.string(), z.string().trim().min(1).max(100)),
});

export type Meeting = z.infer<typeof MeetingSchema>;
export type MeetingSource = z.infer<typeof MeetingSourceSchema>;
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export type MeetingListEntry = { kind: 'ok'; meeting: Meeting } | { kind: 'broken'; id: string; reason: string };
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/shared/meeting.test.ts`
Expected: PASS, 14 тестов.

- [ ] **Step 5: Написать тест `src/main/library/naming.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { MEETING_ID_PATTERN } from '../../shared/meeting';
import { defaultMeetingTitle, makeMeetingId, randomMeetingSuffix } from './naming';

// Даты строятся из местных компонентов, поэтому тесты не зависят от часового пояса машины.
const date = new Date(2026, 8, 5, 9, 7);

describe('makeMeetingId', () => {
  it('builds the id from local date and time', () => {
    expect(makeMeetingId(date, 'a1b2c3')).toBe('2026-09-05_0907_a1b2c3');
  });

  it('rejects a bad suffix', () => {
    expect(() => makeMeetingId(date, 'XYZ')).toThrow(RangeError);
  });
});

describe('randomMeetingSuffix', () => {
  it('produces ids that match the folder pattern', () => {
    for (let i = 0; i < 20; i++) {
      expect(MEETING_ID_PATTERN.test(makeMeetingId(date, randomMeetingSuffix()))).toBe(true);
    }
  });
});

describe('defaultMeetingTitle', () => {
  it('formats the title in Russian style', () => {
    expect(defaultMeetingTitle(date)).toBe('Встреча 05.09.2026 09:07');
  });
});
```

- [ ] **Step 6: Запустить — должен упасть**

Run: `npx vitest run src/main/library/naming.test.ts`
Expected: FAIL — `Failed to resolve import "./naming"`.

- [ ] **Step 7: Написать `src/main/library/naming.ts`**

```ts
import { randomBytes } from 'node:crypto';

const pad = (n: number): string => String(n).padStart(2, '0');

/** id и имя папки встречи: `2026-09-25_1430_a1b2c3` (местное время). */
export function makeMeetingId(date: Date, suffix: string): string {
  if (!/^[0-9a-f]{6}$/.test(suffix)) throw new RangeError(`Неверный суффикс id встречи: ${suffix}`);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}_${pad(date.getHours())}${pad(date.getMinutes())}_${suffix}`;
}

export function randomMeetingSuffix(): string {
  return randomBytes(3).toString('hex');
}

/** «Встреча 25.09.2026 14:30» */
export function defaultMeetingTitle(date: Date): string {
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  return `Встреча ${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

- [ ] **Step 8: Запустить — должен пройти**

Run: `npx vitest run src/shared/meeting.test.ts src/main/library/naming.test.ts`
Expected: PASS, 18 тестов.

- [ ] **Step 9: Commit**

```bash
git add src/shared/meeting.ts src/shared/meeting.test.ts src/main/library/naming.ts src/main/library/naming.test.ts
git commit -m "feat: add meeting.json schema, folder ids and default titles"
```

---

### Task 6: Библиотека встреч

Спецификация §5.6: у каждой встречи своя папка, общего файла-базы нет. Функции: создать встречу (папка + `audio/` +
`meeting.json`), прочитать, сохранить, перечислить. Список: новые сверху (по id — он начинается с даты), папки с
неподходящим именем и файлы в корне библиотеки пропускаются, повреждённая встреча попадает в список с пометкой и
причиной, а не роняет его. Если id внутри `meeting.json` не совпадает с именем папки (например, папку скопировали
вручную) — тоже пометка: иначе сохранение записало бы данные в чужую папку.

**Files:**
- Create: `src/main/library/library.ts`, `src/main/library/library.test.ts`

- [ ] **Step 1: Написать тест `src/main/library/library.test.ts`**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import { createMeeting, listMeetings, meetingDir, readMeeting, saveMeeting } from './library';

const tempLibrary = () => join(mkdtempSync(join(tmpdir(), 'textmeet-lib-')), 'library');
const at = new Date(2026, 8, 25, 14, 30);
const suffixes = (...values: string[]) => {
  const queue = [...values];
  return () => queue.shift() ?? 'ffffff';
};

describe('meetingDir', () => {
  it('joins a valid id', () => {
    expect(meetingDir('/lib', '2026-09-25_1430_a1b2c3')).toBe(join('/lib', '2026-09-25_1430_a1b2c3'));
  });

  it('refuses ids that could escape the library', () => {
    expect(() => meetingDir('/lib', '..')).toThrow(RangeError);
    expect(() => meetingDir('/lib', '../2026-09-25_1430_a1b2c3')).toThrow(RangeError);
  });
});

describe('createMeeting', () => {
  it('creates the folder, the audio subfolder and meeting.json', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, {
      source: 'recording',
      status: 'recording',
      now: at,
      randomSuffix: suffixes('a1b2c3'),
    });
    expect(meeting).toMatchObject({
      id: '2026-09-25_1430_a1b2c3',
      title: 'Встреча 25.09.2026 14:30',
      createdAt: at.toISOString(),
      source: 'recording',
      status: 'recording',
      speakerNames: {},
    });
    const dir = join(lib, meeting.id);
    expect(existsSync(join(dir, 'audio'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'meeting.json'), 'utf8'))).toEqual(meeting);
  });

  it('uses a custom title', async () => {
    const meeting = await createMeeting(tempLibrary(), { source: 'import', status: 'queued', title: 'Созвон', now: at });
    expect(meeting.title).toBe('Созвон');
  });

  it('picks another suffix when the folder already exists', async () => {
    const lib = tempLibrary();
    mkdirSync(join(lib, '2026-09-25_1430_aaaaaa'), { recursive: true });
    const meeting = await createMeeting(lib, {
      source: 'recording',
      status: 'recording',
      now: at,
      randomSuffix: suffixes('aaaaaa', 'bbbbbb'),
    });
    expect(meeting.id).toBe('2026-09-25_1430_bbbbbb');
  });

  it('gives up after repeated collisions', async () => {
    const lib = tempLibrary();
    mkdirSync(join(lib, '2026-09-25_1430_aaaaaa'), { recursive: true });
    const always = () => 'aaaaaa';
    await expect(
      createMeeting(lib, { source: 'recording', status: 'recording', now: at, randomSuffix: always }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });
});

describe('readMeeting / saveMeeting', () => {
  it('round-trips a meeting', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    const renamed: Meeting = { ...meeting, title: 'Планёрка', status: 'recorded', durationSec: 61.5 };
    await saveMeeting(lib, renamed);
    expect(await readMeeting(lib, meeting.id)).toEqual(renamed);
  });

  it('refuses to save invalid data', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await expect(saveMeeting(lib, { ...meeting, title: '' })).rejects.toThrow();
  });

  it('explains why a meeting cannot be read', async () => {
    const lib = tempLibrary();
    await expect(readMeeting(lib, '2026-09-25_1430_a1b2c3')).rejects.toThrow('не прочитана');
  });
});

describe('listMeetings', () => {
  it('creates a missing library folder and returns an empty list', async () => {
    const lib = tempLibrary();
    expect(await listMeetings(lib)).toEqual([]);
    expect(existsSync(lib)).toBe(true);
  });

  it('lists meetings newest first and marks broken ones', async () => {
    const lib = tempLibrary();
    const older = await createMeeting(lib, {
      source: 'recording',
      status: 'done',
      now: new Date(2026, 8, 20, 10, 0),
    });
    const newer = await createMeeting(lib, { source: 'import', status: 'queued', now: new Date(2026, 8, 25, 9, 0) });
    mkdirSync(join(lib, '2026-09-22_1200_cccccc'));
    writeFileSync(join(lib, '2026-09-22_1200_cccccc', 'meeting.json'), '{oops');
    mkdirSync(join(lib, '2026-09-23_1200_dddddd'));
    mkdirSync(join(lib, 'Разное'));
    writeFileSync(join(lib, 'notes.txt'), 'x');

    const list = await listMeetings(lib);

    expect(list.map((e) => (e.kind === 'ok' ? e.meeting.id : e.id))).toEqual([
      newer.id,
      '2026-09-23_1200_dddddd',
      '2026-09-22_1200_cccccc',
      older.id,
    ]);
    expect(list[1]).toEqual({ kind: 'broken', id: '2026-09-23_1200_dddddd', reason: 'нет файла meeting.json' });
    expect(list[2]).toMatchObject({ kind: 'broken', id: '2026-09-22_1200_cccccc' });
  });

  it('marks a meeting whose id does not match its folder', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'done', now: at });
    const copy = join(lib, '2026-09-26_1000_eeeeee');
    mkdirSync(copy);
    writeFileSync(join(copy, 'meeting.json'), JSON.stringify(meeting));
    const list = await listMeetings(lib);
    expect(list[0]).toMatchObject({ kind: 'broken', id: '2026-09-26_1000_eeeeee' });
    expect(list[0]?.kind === 'broken' && list[0].reason).toContain('не совпадает');
  });

  it('marks a meeting whose meeting.json cannot be read at all', async () => {
    const lib = tempLibrary();
    // meeting.json — папка: чтение падает с EISDIR, а не «нет файла».
    mkdirSync(join(lib, '2026-09-26_1000_ffffff', 'meeting.json'), { recursive: true });
    const list = await listMeetings(lib);
    expect(list[0]).toMatchObject({ kind: 'broken', id: '2026-09-26_1000_ffffff' });
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/main/library/library.test.ts`
Expected: FAIL — `Failed to resolve import "./library"`.

- [ ] **Step 3: Написать `src/main/library/library.ts`**

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import {
  MEETING_ID_PATTERN,
  MeetingSchema,
  type Meeting,
  type MeetingListEntry,
  type MeetingSource,
  type MeetingStatus,
} from '../../shared/meeting';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { defaultMeetingTitle, makeMeetingId, randomMeetingSuffix } from './naming';

export const MEETING_FILE = 'meeting.json';
export const AUDIO_DIR = 'audio';
const MAX_ID_ATTEMPTS = 3;

/** Путь к папке встречи. id проверяется, чтобы из IPC нельзя было выйти за пределы библиотеки. */
export function meetingDir(libraryDir: string, id: string): string {
  if (!MEETING_ID_PATTERN.test(id)) throw new RangeError(`Неверный id встречи: ${id}`);
  return join(libraryDir, id);
}

export interface NewMeeting {
  source: MeetingSource;
  status: MeetingStatus;
  title?: string;
  now?: Date;
  randomSuffix?: () => string;
}

export async function createMeeting(libraryDir: string, input: NewMeeting): Promise<Meeting> {
  const now = input.now ?? new Date();
  const nextSuffix = input.randomSuffix ?? randomMeetingSuffix;
  await fsp.mkdir(libraryDir, { recursive: true });

  for (let attempt = 1; ; attempt++) {
    const id = makeMeetingId(now, nextSuffix());
    const dir = meetingDir(libraryDir, id);
    try {
      await fsp.mkdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST' && attempt < MAX_ID_ATTEMPTS) continue;
      throw err;
    }
    await fsp.mkdir(join(dir, AUDIO_DIR));
    const meeting = MeetingSchema.parse({
      schemaVersion: 1,
      id,
      title: input.title ?? defaultMeetingTitle(now),
      createdAt: now.toISOString(),
      durationSec: null,
      source: input.source,
      participantsHint: null,
      model: null,
      status: input.status,
      errorMessage: null,
      speakerNames: {},
    });
    await writeJsonAtomic(join(dir, MEETING_FILE), meeting);
    return meeting;
  }
}

export async function readMeeting(libraryDir: string, id: string): Promise<Meeting> {
  const result = await readJsonFile(join(meetingDir(libraryDir, id), MEETING_FILE), MeetingSchema);
  if (!result.ok) throw new Error(`Встреча ${id} не прочитана: ${result.message}`);
  return result.value;
}

export async function saveMeeting(libraryDir: string, meeting: Meeting): Promise<void> {
  const valid = MeetingSchema.parse(meeting);
  await writeJsonAtomic(join(meetingDir(libraryDir, valid.id), MEETING_FILE), valid);
}

/** Все встречи библиотеки, новые сверху. Повреждённые не роняют список, а помечаются. */
export async function listMeetings(libraryDir: string): Promise<MeetingListEntry[]> {
  await fsp.mkdir(libraryDir, { recursive: true });
  const dirents = await fsp.readdir(libraryDir, { withFileTypes: true });
  const ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
  const entries = await Promise.all(ids.map((id) => readEntry(libraryDir, id)));
  return entries.sort((a, b) => entryId(b).localeCompare(entryId(a)));
}

function entryId(entry: MeetingListEntry): string {
  return entry.kind === 'ok' ? entry.meeting.id : entry.id;
}

async function readEntry(libraryDir: string, id: string): Promise<MeetingListEntry> {
  try {
    const result = await readJsonFile(join(libraryDir, id, MEETING_FILE), MeetingSchema);
    if (!result.ok) {
      return { kind: 'broken', id, reason: result.reason === 'missing' ? 'нет файла meeting.json' : result.message };
    }
    if (result.value.id !== id) {
      return { kind: 'broken', id, reason: `id в meeting.json (${result.value.id}) не совпадает с именем папки` };
    }
    return { kind: 'ok', meeting: result.value };
  } catch (err) {
    return { kind: 'broken', id, reason: (err as Error).message };
  }
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/main/library`
Expected: PASS, 17 тестов (13 в `library.test.ts` + 4 в `naming.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/main/library/library.ts src/main/library/library.test.ts
git commit -m "feat: add meeting library storage (create, read, save, list)"
```

---

### Task 7: Значок для трея, нарисованный кодом

Файлов-картинок в репозитории нет: значок-кольцо рисуется кодом и кодируется в PNG (1× — 16 px, 2× — 32 px).
Закрашенный круг (`'dot'`) понадобится в Плане 2 для «идёт запись».

**Files:**
- Create: `src/main/icons/png.ts`, `src/main/icons/png.test.ts`
- Create: `src/main/icons/circle-icon.ts`, `src/main/icons/circle-icon.test.ts`

- [ ] **Step 1: Написать тест `src/main/icons/png.test.ts`**

```ts
import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from './png';

function readChunks(png: Buffer): { type: string; data: Buffer; crcOk: boolean }[] {
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    chunks.push({ type, data, crcOk: crc === crc32(png.subarray(offset + 4, offset + 8 + length)) });
    offset += 12 + length;
  }
  return chunks;
}

describe('encodePng', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 1, 2, 3, 4]);

  it('writes the signature and IHDR/IDAT/IEND chunks with valid CRCs', () => {
    const png = encodePng(2, 2, rgba);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const ihdr = chunks[0]!.data;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]]).toEqual([2, 2, 8, 6]);
  });

  it('stores every row with filter byte 0 followed by the pixels', () => {
    const idat = readChunks(encodePng(2, 2, rgba))[1]!.data;
    const raw = inflateSync(idat);
    expect([...raw]).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8, 16)]);
  });

  it('rejects a pixel buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(RangeError);
  });

  it('rejects zero or fractional sizes', () => {
    expect(() => encodePng(0, 1, new Uint8Array(0))).toThrow(RangeError);
    expect(() => encodePng(1.5, 1, new Uint8Array(6))).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run src/main/icons/png.test.ts`
Expected: FAIL — `Failed to resolve import "./png"`.

- [ ] **Step 3: Написать `src/main/icons/png.ts`**

```ts
import { crc32, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BIT_DEPTH = 8;
const COLOR_TYPE_RGBA = 6;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Кодирует RGBA-пиксели (8 бит на канал, построчно) в PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Неверный размер PNG: ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`Ожидалось ${width * height * 4} байт RGBA, получено ${rgba.length}`);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = BIT_DEPTH;
  header[9] = COLOR_TYPE_RGBA;
  // байты 10–12: сжатие, фильтр, чересстрочность — все 0

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // первый байт каждой строки — фильтр 0
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run src/main/icons/png.test.ts`
Expected: PASS, 4 теста.

- [ ] **Step 5: Написать тест `src/main/icons/circle-icon.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { drawCircleIcon } from './circle-icon';

const alphaAt = (pixels: Uint8Array, size: number, x: number, y: number): number => pixels[(y * size + x) * 4 + 3]!;

describe('drawCircleIcon', () => {
  const red = { r: 230, g: 40, b: 40 };

  it('returns size*size RGBA pixels in the given color', () => {
    const pixels = drawCircleIcon(16, red, 'dot');
    expect(pixels.length).toBe(16 * 16 * 4);
    expect([...pixels.subarray(0, 3)]).toEqual([230, 40, 40]);
  });

  it('fills the center of a dot and keeps corners transparent', () => {
    const pixels = drawCircleIcon(16, red, 'dot');
    expect(alphaAt(pixels, 16, 8, 8)).toBe(255);
    expect(alphaAt(pixels, 16, 0, 0)).toBe(0);
  });

  it('keeps the center of a ring transparent and its edge opaque', () => {
    const pixels = drawCircleIcon(32, red, 'ring');
    expect(alphaAt(pixels, 32, 16, 16)).toBe(0);
    expect(alphaAt(pixels, 32, 3, 16)).toBe(255);
    expect(alphaAt(pixels, 32, 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 6: Запустить — должен упасть**

Run: `npx vitest run src/main/icons/circle-icon.test.ts`
Expected: FAIL — `Failed to resolve import "./circle-icon"`.

- [ ] **Step 7: Написать `src/main/icons/circle-icon.ts`**

```ts
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** ring — кольцо (ожидание), dot — закрашенный круг (идёт запись, План 2). */
export type CircleStyle = 'ring' | 'dot';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Рисует сглаженный круг или кольцо на прозрачном квадрате size×size, возвращает RGBA. */
export function drawCircleIcon(size: number, color: Rgb, style: CircleStyle): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const center = size / 2;
  const outer = size / 2 - size / 16;
  const inner = outer - size / 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      let coverage = clamp01(outer + 0.5 - distance);
      if (style === 'ring') coverage = Math.min(coverage, clamp01(distance - inner + 0.5));
      const i = (y * size + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = Math.round(coverage * 255);
    }
  }
  return pixels;
}
```

- [ ] **Step 8: Запустить — должен пройти**

Run: `npx vitest run src/main/icons`
Expected: PASS, 7 тестов.

- [ ] **Step 9: Commit**

```bash
git add src/main/icons
git commit -m "feat: draw the tray icon in code and encode it as PNG"
```

---

### Task 8: Контракт IPC и чистая логика запуска

Здесь всё, что главному процессу нужно решать без Electron: папка библиотеки по умолчанию, запускаться ли скрытым
(автозапуск), какую подсказку показать под переключателем автозапуска, пункты меню трея. И общий контракт между
окнами и main — `src/shared/ipc.ts` (только имена каналов и типы).

**Files:**
- Create: `src/shared/ipc.ts`
- Create: `src/main/paths.ts`, `src/main/paths.test.ts`
- Create: `src/main/startup.ts`, `src/main/startup.test.ts`
- Create: `src/main/tray-menu.ts`, `src/main/tray-menu.test.ts`

- [ ] **Step 1: Создать `src/shared/ipc.ts`** (типы и константы — отдельного теста не нужно, их проверяют компилятор и сквозные тесты)

```ts
// Контракт между окнами и main. Здесь только типы и имена каналов:
// preload работает в песочнице и не может подключать zod и другие пакеты.
import type { MeetingListEntry } from './meeting';
import type { Settings } from './settings';

export const IPC = {
  getSettings: 'settings:get',
  setLaunchAtLogin: 'settings:set-launch-at-login',
  chooseLibraryDir: 'settings:choose-library-dir',
  openLibraryDir: 'library:open-dir',
  listMeetings: 'library:list',
  getAppInfo: 'app:info',
  recorderReady: 'recorder:ready',
} as const;

/** Что показать под переключателем «Запускать при входе в систему». */
export type LaunchAtLoginNotice = 'none' | 'dev-build' | 'needs-approval' | 'blocked-by-system' | 'unsupported';

export interface SettingsState {
  settings: Settings;
  /** Итоговая папка библиотеки (с учётом значения по умолчанию). */
  libraryDir: string;
  launchAtLoginNotice: LaunchAtLoginNotice;
}

export interface AppInfo {
  version: string;
  platform: string;
  logFile: string;
  recorderReady: boolean;
}

/** API главного окна: window.textmeet */
export interface TextMeetApi {
  getSettings(): Promise<SettingsState>;
  setLaunchAtLogin(enabled: boolean): Promise<SettingsState>;
  chooseLibraryDir(): Promise<SettingsState>;
  openLibraryDir(): Promise<void>;
  listMeetings(): Promise<MeetingListEntry[]>;
  getAppInfo(): Promise<AppInfo>;
}

/** API скрытого окна записи: window.recorder */
export interface RecorderBridge {
  ready(): void;
}
```

- [ ] **Step 2: Написать тесты**

`src/main/paths.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLibraryDir } from './paths';

describe('resolveLibraryDir', () => {
  it('uses the folder from settings', () => {
    expect(resolveLibraryDir('D:\\Встречи', 'C:\\Users\\me')).toBe('D:\\Встречи');
  });

  it('falls back to TextMeet in the home folder', () => {
    expect(resolveLibraryDir(null, join('home', 'me'))).toBe(join('home', 'me', 'TextMeet'));
  });
});
```

`src/main/startup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HIDDEN_ARG, launchAtLoginNotice, shouldStartHidden } from './startup';

describe('shouldStartHidden', () => {
  it('uses the --hidden argument on Windows', () => {
    expect(shouldStartHidden({ platform: 'win32', argv: ['TextMeet.exe', HIDDEN_ARG], wasOpenedAtLogin: false })).toBe(
      true,
    );
    expect(shouldStartHidden({ platform: 'win32', argv: ['TextMeet.exe'], wasOpenedAtLogin: true })).toBe(false);
  });

  it('uses wasOpenedAtLogin on macOS', () => {
    expect(shouldStartHidden({ platform: 'darwin', argv: [], wasOpenedAtLogin: true })).toBe(true);
    expect(shouldStartHidden({ platform: 'darwin', argv: [HIDDEN_ARG], wasOpenedAtLogin: false })).toBe(false);
  });
});

describe('launchAtLoginNotice', () => {
  const on = { openAtLogin: true, executableWillLaunchAtLogin: true, status: 'enabled' };

  it('is unsupported on other systems', () => {
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'linux', state: on })).toBe('unsupported');
  });

  it('warns that a development build does not register itself', () => {
    expect(launchAtLoginNotice({ enabled: true, isPackaged: false, platform: 'win32', state: null })).toBe('dev-build');
  });

  it('says nothing when the setting is off or everything works', () => {
    expect(launchAtLoginNotice({ enabled: false, isPackaged: true, platform: 'win32', state: on })).toBe('none');
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'win32', state: on })).toBe('none');
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'darwin', state: on })).toBe('none');
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'win32', state: null })).toBe('none');
  });

  it('detects autostart disabled in Task Manager', () => {
    const state = { openAtLogin: true, executableWillLaunchAtLogin: false };
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'win32', state })).toBe(
      'blocked-by-system',
    );
  });

  it('detects macOS asking for approval or a missing login item', () => {
    const pending = { openAtLogin: false, status: 'requires-approval' };
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'darwin', state: pending })).toBe(
      'needs-approval',
    );
    const off = { openAtLogin: false, status: 'not-registered' };
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'darwin', state: off })).toBe(
      'blocked-by-system',
    );
  });
});
```

`src/main/tray-menu.test.ts`:

```ts
import type { KeyboardEvent, MenuItem } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenu } from './tray-menu';

describe('buildTrayMenu', () => {
  it('has open and quit items that call the actions', () => {
    const actions = { openWindow: vi.fn(), quit: vi.fn() };
    const items = buildTrayMenu(actions);
    expect(items.map((i) => i.label ?? i.type)).toEqual(['Открыть TextMeet', 'separator', 'Выход']);

    const click = (label: string) =>
      items.find((i) => i.label === label)?.click?.({} as MenuItem, undefined, {} as KeyboardEvent);
    click('Открыть TextMeet');
    click('Выход');
    expect(actions.openWindow).toHaveBeenCalledOnce();
    expect(actions.quit).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run src/main/paths.test.ts src/main/startup.test.ts src/main/tray-menu.test.ts`
Expected: FAIL — `Failed to resolve import "./paths"` (и `./startup`, `./tray-menu`).

- [ ] **Step 4: Написать `src/main/paths.ts`**

```ts
import { join } from 'node:path';

export const LIBRARY_FOLDER_NAME = 'TextMeet';

/** Папка библиотеки: из настроек или ~/TextMeet (вне облачных папок). */
export function resolveLibraryDir(fromSettings: string | null, homeDir: string): string {
  return fromSettings ?? join(homeDir, LIBRARY_FOLDER_NAME);
}
```

- [ ] **Step 5: Написать `src/main/startup.ts`**

```ts
import type { LaunchAtLoginNotice } from '../shared/ipc';

/** Аргумент, с которым Windows запускает TextMeet при входе в систему. */
export const HIDDEN_ARG = '--hidden';

export interface StartContext {
  platform: NodeJS.Platform;
  argv: readonly string[];
  /** macOS: app.getLoginItemSettings().wasOpenedAtLogin */
  wasOpenedAtLogin: boolean;
}

/** При автозапуске окно не показываем — программа сидит в трее. */
export function shouldStartHidden(ctx: StartContext): boolean {
  if (ctx.platform === 'darwin') return ctx.wasOpenedAtLogin;
  return ctx.argv.includes(HIDDEN_ARG);
}

export interface LoginItemState {
  openAtLogin: boolean;
  /** Windows: false, если автозапуск отключён в Диспетчере задач. */
  executableWillLaunchAtLogin?: boolean;
  /** macOS: 'enabled' | 'requires-approval' | 'not-registered' | 'not-found' */
  status?: string;
}

export interface NoticeInput {
  enabled: boolean;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  state: LoginItemState | null;
}

export function launchAtLoginNotice(input: NoticeInput): LaunchAtLoginNotice {
  if (input.platform !== 'win32' && input.platform !== 'darwin') return 'unsupported';
  if (!input.isPackaged) return 'dev-build';
  if (!input.enabled || input.state === null) return 'none';
  if (input.platform === 'darwin') {
    if (input.state.status === 'requires-approval') return 'needs-approval';
    return input.state.openAtLogin ? 'none' : 'blocked-by-system';
  }
  return input.state.openAtLogin && input.state.executableWillLaunchAtLogin !== false ? 'none' : 'blocked-by-system';
}
```

- [ ] **Step 6: Написать `src/main/tray-menu.ts`**

```ts
import type { MenuItemConstructorOptions } from 'electron';

export interface TrayActions {
  openWindow(): void;
  quit(): void;
}

// Пункты «Начать/Остановить запись» добавит План 2.
export function buildTrayMenu(actions: TrayActions): MenuItemConstructorOptions[] {
  return [
    { label: 'Открыть TextMeet', click: () => actions.openWindow() },
    { type: 'separator' },
    { label: 'Выход', click: () => actions.quit() },
  ];
}
```

- [ ] **Step 7: Запустить — должны пройти**

Run: `npx vitest run src/main/paths.test.ts src/main/startup.test.ts src/main/tray-menu.test.ts`
Expected: PASS, 10 тестов.

- [ ] **Step 8: Commit**

```bash
git add src/shared/ipc.ts src/main/paths.ts src/main/paths.test.ts src/main/startup.ts src/main/startup.test.ts src/main/tray-menu.ts src/main/tray-menu.test.ts
git commit -m "feat: add IPC contract and startup, autostart-notice and tray-menu logic"
```

---

### Task 9: Форматирование для интерфейса

Чистые функции для окна: подписи статусов, длительность, дата, тексты подсказок про автозапуск, текст ошибки без
технической обёртки Electron (`Error invoking remote method '…': Error: …`).

**Files:**
- Create: `src/renderer/main/format.ts`, `src/renderer/main/format.test.ts`
- Create: `src/renderer/main/errors.ts`, `src/renderer/main/errors.test.ts`

- [ ] **Step 1: Написать тест `src/renderer/main/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, formatMeetingDate, launchAtLoginNoticeText, statusLabel } from './format';

describe('statusLabel', () => {
  it('translates every status', () => {
    expect(statusLabel('recording')).toBe('Идёт запись');
    expect(statusLabel('done')).toBe('Готово');
    expect(statusLabel('error')).toBe('Ошибка');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [75, '1:15'],
    [59.6, '1:00'],
    [3725, '1:02:05'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])('shows a dash for %s', (value) => {
    expect(formatDuration(value)).toBe('—');
  });
});

describe('formatMeetingDate', () => {
  it('formats local date and time', () => {
    expect(formatMeetingDate(new Date(2026, 8, 5, 9, 7).toISOString())).toBe('05.09.2026 09:07');
  });

  it('shows a dash for garbage', () => {
    expect(formatMeetingDate('вчера')).toBe('—');
  });
});

describe('launchAtLoginNoticeText', () => {
  it('has no text when everything is fine', () => {
    expect(launchAtLoginNoticeText('none')).toBeNull();
  });

  it('explains the other cases', () => {
    expect(launchAtLoginNoticeText('dev-build')).toContain('установленной');
    expect(launchAtLoginNoticeText('needs-approval')).toContain('Объекты входа');
    expect(launchAtLoginNoticeText('blocked-by-system')).toContain('Диспетчер задач');
    expect(launchAtLoginNoticeText('unsupported')).toContain('не поддерживается');
  });
});
```

- [ ] **Step 2: Написать тест `src/renderer/main/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { errorText } from './errors';

describe('errorText', () => {
  it('strips the Electron IPC wrapper', () => {
    const err = new Error("Error invoking remote method 'library:list': Error: Нет доступа к папке");
    expect(errorText(err)).toBe('Нет доступа к папке');
  });

  it('strips typed error names too', () => {
    const err = new Error("Error invoking remote method 'x': RangeError: Неверный id");
    expect(errorText(err)).toBe('Неверный id');
  });

  it('keeps ordinary messages and handles non-errors', () => {
    expect(errorText(new Error('Сбой'))).toBe('Сбой');
    expect(errorText('строка')).toBe('строка');
    expect(errorText(new Error(''))).toBe('Неизвестная ошибка');
  });
});
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run src/renderer`
Expected: FAIL — `Failed to resolve import "./format"` и `"./errors"`.

- [ ] **Step 4: Написать `src/renderer/main/format.ts`**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import type { MeetingStatus } from '../../shared/meeting';

const pad = (n: number): string => String(n).padStart(2, '0');

const STATUS_LABELS: Record<MeetingStatus, string> = {
  recording: 'Идёт запись',
  recorded: 'Записано',
  queued: 'В очереди',
  transcribing: 'Расшифровка…',
  done: 'Готово',
  error: 'Ошибка',
};

export function statusLabel(status: MeetingStatus): string {
  return STATUS_LABELS[status];
}

/** 75 → «1:15», 3725 → «1:02:05», неизвестно → «—». */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** ISO-дата → «25.09.2026 14:30» в местном времени. */
export function formatMeetingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const NOTICE_TEXT: Record<LaunchAtLoginNotice, string | null> = {
  none: null,
  'dev-build': 'Автозапуск работает только в установленной программе — сейчас открыта версия для разработки.',
  'needs-approval': 'macOS ждёт разрешения: Системные настройки → Основные → Объекты входа → включите TextMeet.',
  'blocked-by-system':
    'Автозапуск выключен в системе. Windows: Диспетчер задач → Автозагрузка. macOS: Системные настройки → Основные → Объекты входа.',
  unsupported: 'На этой системе автозапуск не поддерживается.',
};

export function launchAtLoginNoticeText(notice: LaunchAtLoginNotice): string | null {
  return NOTICE_TEXT[notice];
}
```

- [ ] **Step 5: Написать `src/renderer/main/errors.ts`**

```ts
// Electron оборачивает ошибки из main: "Error invoking remote method 'x': Error: текст".
const REMOTE_PREFIX = /^Error invoking remote method '[^']*': (?:\w*Error: )?/;

/** Текст ошибки для показа человеку, без технической обёртки Electron. */
export function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const clean = message.replace(REMOTE_PREFIX, '').trim();
  return clean || 'Неизвестная ошибка';
}
```

- [ ] **Step 6: Запустить все модульные тесты с покрытием**

Run: `npm run test:coverage`
Expected: PASS, 15 файлов, **94 теста**; итоговое покрытие выше 80 % по всем четырём показателям (на прототипе — 99 %).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/main/format.ts src/renderer/main/format.test.ts src/renderer/main/errors.ts src/renderer/main/errors.test.ts
git commit -m "feat: add UI formatting helpers for statuses, durations, dates and errors"
```

---

### Task 10: Оболочка Electron — окна, трей, автозапуск, IPC

Собираем приложение: один экземпляр, главное окно + скрытое окно записи, трей, закрытие окна прячет его в трей
(спецификация §3.1), автозапуск, обработчики IPC с проверкой отправителя, журнал необработанных ошибок. Интерфейс
пока — заглушка «TextMeet»; экраны добавит Task 11. Сначала пишем сквозной тест на поведение окон.

**Files:**
- Create: `e2e/helpers.ts`, `e2e/shell.spec.ts`
- Create: `src/main/autostart.ts`, `src/main/windows.ts`, `src/main/tray.ts`, `src/main/ipc.ts`, `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/env.d.ts`, `src/renderer/main/index.html`, `src/renderer/main/main.tsx`, `src/renderer/main/App.tsx`, `src/renderer/main/styles.css`
- Create: `src/renderer/recorder/index.html`, `src/renderer/recorder/recorder.ts`

- [ ] **Step 1: Написать `e2e/helpers.ts`**

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface MeetingFixture {
  id: string;
  /** Объект пишется как JSON, строка — как есть (для повреждённых файлов). */
  json: unknown;
}

export interface LaunchOptions {
  /** Объект пишется как JSON, строка — как есть. По умолчанию библиотека — во временной папке. */
  settings?: unknown;
  meetings?: MeetingFixture[];
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  root: string;
  userDataDir: string;
  homeDir: string;
  libraryDir: string;
  close(): Promise<void>;
}

const serialize = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));

export function meetingJson(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    title: `Встреча ${id}`,
    createdAt: '2026-09-25T11:30:00.000Z',
    durationSec: 125,
    source: 'recording',
    participantsHint: null,
    model: null,
    status: 'recorded',
    errorMessage: null,
    speakerNames: {},
    ...overrides,
  };
}

/** Главное окно ищем по адресу: скрытое окно записи может открыться раньше. */
export async function mainWindow(app: ElectronApplication): Promise<Page> {
  const isMain = (page: Page) => page.url().includes('/main/index.html');
  return app.windows().find(isMain) ?? (await app.waitForEvent('window', { predicate: isMain }));
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const root = await mkdtemp(join(tmpdir(), 'textmeet-e2e-'));
  const userDataDir = join(root, 'userData');
  const homeDir = join(root, 'home');
  const libraryDir = join(root, 'library');
  await mkdir(userDataDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(libraryDir, { recursive: true });

  const settings = options.settings ?? { schemaVersion: 1, libraryDir, launchAtLogin: true };
  await writeFile(join(userDataDir, 'settings.json'), serialize(settings));

  for (const meeting of options.meetings ?? []) {
    await mkdir(join(libraryDir, meeting.id, 'audio'), { recursive: true });
    await writeFile(join(libraryDir, meeting.id, 'meeting.json'), serialize(meeting.json));
  }

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TEXTMEET_USER_DATA: userDataDir, TEXTMEET_HOME: homeDir },
  });
  const page = await mainWindow(app);
  return {
    app,
    page,
    root,
    userDataDir,
    homeDir,
    libraryDir,
    close: async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 2: Написать `e2e/shell.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('closing the window hides it to the tray; the recorder window stays hidden and ready', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  const windowStates = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .map((w) => `${w.getTitle()}: ${w.isVisible() ? 'видно' : 'скрыто'}`)
        .sort(),
    );

  await expect.poll(() => page.evaluate(() => window.textmeet.getAppInfo().then((i) => i.recorderReady))).toBe(true);
  await expect.poll(windowStates).toEqual(['TextMeet — запись: скрыто', 'TextMeet: видно']);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === 'TextMeet')
      ?.close();
  });

  await expect.poll(windowStates).toEqual(['TextMeet — запись: скрыто', 'TextMeet: скрыто']);
});
```

- [ ] **Step 3: Запустить — должен упасть**

Run: `npm run e2e`
Expected: FAIL — сборка не находит точку входа (`src/main/index.ts` ещё нет); сквозной тест не запускается.

- [ ] **Step 4: Написать `src/main/autostart.ts`**

```ts
import { app } from 'electron';
import type { LaunchAtLoginNotice } from '../shared/ipc';
import { HIDDEN_ARG, launchAtLoginNotice, shouldStartHidden, type LoginItemState } from './startup';

const WINDOWS_LOGIN_OPTIONS = { args: [HIDDEN_ARG] };

const isSupported = (): boolean => process.platform === 'win32' || process.platform === 'darwin';

function readLoginItem(): LoginItemState {
  return process.platform === 'win32' ? app.getLoginItemSettings(WINDOWS_LOGIN_OPTIONS) : app.getLoginItemSettings();
}

/**
 * Приводит автозапуск в системе к значению из настроек. Только для установленной программы:
 * версия для разработки не должна прописывать в автозагрузку electron.exe.
 * Если значение уже совпадает — ничего не трогаем, чтобы не отменять выбор пользователя в Диспетчере задач.
 */
export function syncLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged || !isSupported()) return;
  if (readLoginItem().openAtLogin === enabled) return;
  const settings = process.platform === 'win32' ? { openAtLogin: enabled, ...WINDOWS_LOGIN_OPTIONS } : { openAtLogin: enabled };
  app.setLoginItemSettings(settings);
}

export function currentLaunchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice {
  const state = app.isPackaged && isSupported() ? readLoginItem() : null;
  return launchAtLoginNotice({ enabled, isPackaged: app.isPackaged, platform: process.platform, state });
}

export function startedAtLogin(): boolean {
  return shouldStartHidden({
    platform: process.platform,
    argv: process.argv,
    wasOpenedAtLogin: process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin,
  });
}
```

- [ ] **Step 5: Написать `src/main/windows.ts`**

```ts
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { Logger } from './logger';

type Page = 'main' | 'recorder';

// Один preload на оба окна; какое окно что может — проверяет main (ipc.ts).
const PRELOAD = join(__dirname, '../preload/index.js');

function loadPage(win: BrowserWindow, page: Page, logger: Logger): void {
  // В режиме разработки (npm run dev) страницы отдаёт dev-сервер electron-vite.
  const devUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const loading = devUrl
    ? win.loadURL(`${devUrl}/${page}/index.html`)
    : win.loadFile(join(__dirname, `../renderer/${page}/index.html`));
  loading.catch((err: unknown) => logger.error(`Не удалось загрузить окно ${page}`, err));
}

/** Окна показывают только свои страницы: никаких новых окон и переходов по ссылкам. */
function lockDown(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

export function createMainWindow(logger: Logger, options: { show: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'TextMeet',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  lockDown(win);
  if (options.show) win.once('ready-to-show', () => win.show());
  loadPage(win, 'main', logger);
  return win;
}

/** Скрытое окно записи: живёт всё время работы программы, не зависит от главного окна. */
export function createRecorderWindow(logger: Logger): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    skipTaskbar: true,
    title: 'TextMeet — запись',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Скрытое окно не должно «засыпать»: иначе запись будет рваться.
      backgroundThrottling: false,
    },
  });
  lockDown(win);
  loadPage(win, 'recorder', logger);
  return win;
}
```

- [ ] **Step 6: Написать `src/main/tray.ts`**

```ts
import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import { drawCircleIcon, type Rgb } from './icons/circle-icon';
import { encodePng } from './icons/png';
import { buildTrayMenu, type TrayActions } from './tray-menu';

// macOS: чёрный шаблон — система сама перекрашивает его под светлую/тёмную строку меню.
const MAC_TEMPLATE_COLOR: Rgb = { r: 0, g: 0, b: 0 };
// Windows: синий заметен и на светлой, и на тёмной панели задач.
const WINDOWS_COLOR: Rgb = { r: 59, g: 130, b: 246 };

function idleIcon(): NativeImage {
  const isMac = process.platform === 'darwin';
  const color = isMac ? MAC_TEMPLATE_COLOR : WINDOWS_COLOR;
  const image = nativeImage.createFromBuffer(encodePng(16, 16, drawCircleIcon(16, color, 'ring')), { scaleFactor: 1 });
  image.addRepresentation({ scaleFactor: 2, buffer: encodePng(32, 32, drawCircleIcon(32, color, 'ring')) });
  if (isMac) image.setTemplateImage(true);
  return image;
}

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(idleIcon());
  tray.setToolTip('TextMeet');
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu(actions)));
  // На Windows привычно открывать окно щелчком по значку; на macOS щелчок открывает меню.
  if (process.platform === 'win32') tray.on('click', () => actions.openWindow());
  return tray;
}
```

- [ ] **Step 7: Написать `src/main/ipc.ts`**

```ts
import { promises as fsp } from 'node:fs';
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { z } from 'zod';
import { IPC, type AppInfo, type LaunchAtLoginNotice, type SettingsState } from '../shared/ipc';
import { listMeetings } from './library/library';
import type { Logger } from './logger';
import type { SettingsStore } from './settings/settings-store';

export interface IpcDeps {
  settings: SettingsStore;
  logger: Logger;
  libraryDir(): string;
  launchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice;
  applyLaunchAtLogin(enabled: boolean): void;
  mainContents(): WebContents | null;
  recorderContents(): WebContents | null;
  appInfo(): AppInfo;
  onRecorderReady(): void;
}

export function registerIpc(deps: IpcDeps): void {
  /** Каналы главного окна отвечают только главному окну; ошибки пишутся в журнал и уходят в окно. */
  const handleFromMain = <T>(channel: string, handler: (event: IpcMainInvokeEvent, arg: unknown) => Promise<T> | T) => {
    ipcMain.handle(channel, async (event, arg: unknown) => {
      if (event.sender !== deps.mainContents()) throw new Error(`IPC ${channel}: запрос не из главного окна`);
      try {
        return await handler(event, arg);
      } catch (err) {
        deps.logger.error(`IPC ${channel} завершился ошибкой`, err);
        throw err;
      }
    });
  };

  const settingsState = (): SettingsState => {
    const settings = deps.settings.get();
    return {
      settings,
      libraryDir: deps.libraryDir(),
      launchAtLoginNotice: deps.launchAtLoginNotice(settings.launchAtLogin),
    };
  };

  handleFromMain(IPC.getSettings, () => settingsState());

  handleFromMain(IPC.setLaunchAtLogin, async (_event, arg) => {
    const enabled = z.boolean().parse(arg);
    await deps.settings.update({ launchAtLogin: enabled });
    deps.applyLaunchAtLogin(enabled);
    return settingsState();
  });

  handleFromMain(IPC.chooseLibraryDir, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Папка библиотеки TextMeet',
      defaultPath: deps.libraryDir(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (!result.canceled && picked) await deps.settings.update({ libraryDir: picked });
    return settingsState();
  });

  handleFromMain(IPC.openLibraryDir, async () => {
    const dir = deps.libraryDir();
    await fsp.mkdir(dir, { recursive: true });
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(`Не удалось открыть папку: ${failure}`);
  });

  handleFromMain(IPC.listMeetings, () => listMeetings(deps.libraryDir()));

  handleFromMain(IPC.getAppInfo, () => deps.appInfo());

  ipcMain.on(IPC.recorderReady, (event) => {
    if (event.sender === deps.recorderContents()) deps.onRecorderReady();
  });
}
```

- [ ] **Step 8: Написать `src/main/index.ts`**

```ts
import { join } from 'node:path';
import { app, Menu, type BrowserWindow, type Tray } from 'electron';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { registerIpc } from './ipc';
import { createLogger, type Logger } from './logger';
import { resolveLibraryDir } from './paths';
import { createSettingsStore } from './settings/settings-store';
import { createTray } from './tray';
import { createMainWindow, createRecorderWindow } from './windows';

// Только для автотестов: отдельные папки данных и «домашняя» папка, чтобы не трогать настоящие.
if (process.env.TEXTMEET_USER_DATA) app.setPath('userData', process.env.TEXTMEET_USER_DATA);
const homeDir = (): string => process.env.TEXTMEET_HOME ?? app.getPath('home');

let quitting = false;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
// Ссылку на трей держим всё время работы, иначе сборщик мусора уберёт значок.
let tray: Tray | null = null;
let recorderReady = false;

function openMainWindow(logger: Logger): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow(logger, { show: true });
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Закрытие окна прячет его в трей; по-настоящему окна закрываются только при выходе. */
function hideInsteadOfClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
}

async function start(): Promise<void> {
  const logger = createLogger(join(app.getPath('userData'), 'logs', 'textmeet.log'));
  process.on('uncaughtException', (err) => logger.error('Необработанная ошибка', err));
  process.on('unhandledRejection', (reason) => logger.error('Необработанный отказ промиса', reason));

  app.on('second-instance', () => openMainWindow(logger));
  app.on('activate', () => openMainWindow(logger));
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('window-all-closed', () => {
    // Остаёмся в трее.
  });
  app.on('render-process-gone', (_event, _contents, details) =>
    logger.error(`Процесс окна завершился: ${details.reason} (код ${details.exitCode})`),
  );
  if (process.platform === 'win32') app.setAppUserModelId('dev.textmeet.app');

  await app.whenReady();
  const settings = await createSettingsStore(join(app.getPath('userData'), 'settings.json'), logger);
  syncLaunchAtLogin(settings.get().launchAtLogin);
  // На Windows меню «Файл / Правка» не нужно; на macOS оставляем стандартное (⌘Q, копирование).
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  registerIpc({
    settings,
    logger,
    libraryDir: () => resolveLibraryDir(settings.get().libraryDir, homeDir()),
    launchAtLoginNotice: currentLaunchAtLoginNotice,
    applyLaunchAtLogin: syncLaunchAtLogin,
    mainContents: () => mainWindow?.webContents ?? null,
    recorderContents: () => recorderWindow?.webContents ?? null,
    appInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      logFile: join(app.getPath('userData'), 'logs', 'textmeet.log'),
      recorderReady,
    }),
    onRecorderReady: () => {
      recorderReady = true;
      logger.info('Окно записи готово');
    },
  });

  recorderWindow = createRecorderWindow(logger);
  hideInsteadOfClose(recorderWindow);
  mainWindow = createMainWindow(logger, { show: !startedAtLogin() });
  hideInsteadOfClose(mainWindow);
  tray = createTray({ openWindow: () => openMainWindow(logger), quit: () => app.quit() });
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
}

if (app.requestSingleInstanceLock()) {
  start().catch((err: unknown) => {
    console.error('TextMeet: не удалось запуститься', err);
    app.exit(1);
  });
} else {
  // Программа уже запущена — она сама покажет окно по событию second-instance.
  app.exit(0);
}
```

- [ ] **Step 9: Написать `src/preload/index.ts`**

```ts
// Один preload на оба окна. Preload работает в песочнице: подключать можно только 'electron'
// и собственный код без пакетов (zod сюда не тянуть). Кому что разрешено, проверяет main (ipc.ts).
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type RecorderBridge, type TextMeetApi } from '../shared/ipc';

const api: TextMeetApi = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  chooseLibraryDir: () => ipcRenderer.invoke(IPC.chooseLibraryDir),
  openLibraryDir: () => ipcRenderer.invoke(IPC.openLibraryDir),
  listMeetings: () => ipcRenderer.invoke(IPC.listMeetings),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
};

const recorder: RecorderBridge = {
  ready: () => ipcRenderer.send(IPC.recorderReady),
};

contextBridge.exposeInMainWorld('textmeet', api);
contextBridge.exposeInMainWorld('recorder', recorder);
```

- [ ] **Step 10: Написать `src/renderer/env.d.ts`**

```ts
/// <reference types="vite/client" />
import type { RecorderBridge, TextMeetApi } from '../shared/ipc';

declare global {
  interface Window {
    /** API главного окна (preload/index.ts). */
    textmeet: TextMeetApi;
    /** API окна записи (preload/index.ts). */
    recorder: RecorderBridge;
  }
}

export {};
```

- [ ] **Step 11: Страница окна записи**

`src/renderer/recorder/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
    <title>TextMeet — запись</title>
  </head>
  <body>
    <script type="module" src="./recorder.ts"></script>
  </body>
</html>
```

`src/renderer/recorder/recorder.ts`:

```ts
// Скрытое окно записи. Захват микрофона и звука компьютера появится в Плане 2;
// сейчас окно только сообщает main, что загрузилось.
window.recorder.ready();
```

- [ ] **Step 12: Страница главного окна (пока с заглушкой вместо экранов)**

`src/renderer/main/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
    <title>TextMeet</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/main/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Нет элемента #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/renderer/main/App.tsx` (заглушка, Task 11 заменит её целиком):

```tsx
export function App() {
  return <p className="pad">TextMeet</p>;
}
```

`src/renderer/main/styles.css`:

```css
/* Каркас. Настоящий визуальный дизайн — по макету перед Планом 2. */
:root {
  color-scheme: light dark;
  --bg: #f6f6f4;
  --surface: #ffffff;
  --text: #1c1c1a;
  --muted: #6b6b66;
  --border: #e2e2dc;
  --accent: #2f6fe4;
  --accent-soft: #e6eefc;
  --danger: #c0352b;
  --radius: 8px;
  --space: 16px;
  font-family: 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615;
    --surface: #20201f;
    --text: #ecece8;
    --muted: #9a9a94;
    --border: #33332f;
    --accent: #6d9bff;
    --accent-soft: #1f2a44;
    --danger: #ff6b5e;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

button {
  font: inherit;
  color: inherit;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 12px;
  cursor: pointer;
}

button:hover {
  border-color: var(--accent);
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 10px var(--space);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.brand {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  border-color: transparent;
  background: transparent;
}

.tab[aria-current='page'] {
  background: var(--accent-soft);
  color: var(--accent);
}

.content {
  min-height: 0;
  overflow: auto;
}

.pad {
  padding: var(--space);
}

.muted {
  color: var(--muted);
}

.error {
  color: var(--danger);
}

.library {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  height: 100%;
}

.meeting-list {
  border-right: 1px solid var(--border);
  overflow: auto;
  padding: 8px;
}

.meeting-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.meeting-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  border-color: transparent;
  background: transparent;
  margin-bottom: 2px;
}

.meeting-item[aria-current='true'] {
  background: var(--accent-soft);
}

.meeting-item.broken .meeting-title {
  color: var(--danger);
}

.meeting-title {
  font-weight: 600;
}

.meeting-meta {
  color: var(--muted);
  font-size: 12px;
}

.empty {
  padding: 8px;
}

.meeting-detail {
  padding: 24px;
  overflow: auto;
}

.meeting-detail h1,
.settings h1 {
  margin: 0 0 8px;
  font-size: 22px;
}

.reason {
  white-space: pre-wrap;
  color: var(--muted);
}

.settings {
  max-width: 640px;
  padding: 24px;
}

.setting {
  padding: var(--space) 0;
  border-bottom: 1px solid var(--border);
}

.setting h2 {
  margin: 0 0 6px;
  font-size: 15px;
}

.path {
  font-family: ui-monospace, Consolas, monospace;
  word-break: break-all;
}

.row {
  display: flex;
  gap: 8px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.notice {
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--accent-soft);
}

.about {
  margin-top: 24px;
  font-size: 12px;
  word-break: break-all;
}
```

- [ ] **Step 13: Проверить типы и сборку**

Run: `npm run typecheck`
Expected: без ошибок, без вывода.

Run: `npm run build`
Expected: собраны `out/main/index.js`, `out/preload/index.js` (**один файл**, без папки `out/preload/chunks`),
`out/renderer/main/index.html`, `out/renderer/recorder/index.html`.

- [ ] **Step 14: Запустить сквозной тест — должен пройти**

Run: `npx playwright test e2e/shell.spec.ts`
Expected: PASS, 1 тест.

- [ ] **Step 15: Commit**

```bash
git add e2e src/main/autostart.ts src/main/windows.ts src/main/tray.ts src/main/ipc.ts src/main/index.ts src/preload src/renderer
git commit -m "feat: add Electron shell with tray, hidden recorder window and autostart"
```

---

### Task 11: Экраны «Встречи» и «Настройки»

Каркас интерфейса по спецификации §3.4 (слева список, справа выбранная встреча) и §3.6 (папка библиотеки,
автозапуск). Встречи перечитываются при возврате фокуса в окно (§5.6 — подхватывает встречи, пришедшие через
OneDrive). Галочка автозапуска переключается сразу, а если main откажет — возвращается обратно с сообщением.

**Files:**
- Create: `e2e/screens.spec.ts`
- Create: `src/renderer/main/LibraryScreen.tsx`, `src/renderer/main/SettingsScreen.tsx`
- Modify: `src/renderer/main/App.tsx` (заменить заглушку целиком)

- [ ] **Step 1: Написать `e2e/screens.spec.ts`**

```ts
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

async function addMeeting(libraryDir: string, id: string, title: string): Promise<void> {
  await mkdir(join(libraryDir, id), { recursive: true });
  await writeFile(join(libraryDir, id, 'meeting.json'), JSON.stringify(meetingJson(id, { title })));
}

test('shows the empty library', async () => {
  launched = await launchApp();
  await expect(launched.page.getByText('Пока нет встреч.')).toBeVisible();
});

test('lists meetings newest first and flags a broken one', async () => {
  launched = await launchApp({
    meetings: [
      { id: '2026-09-20_1000_aaaaaa', json: meetingJson('2026-09-20_1000_aaaaaa', { title: 'Старая встреча' }) },
      { id: '2026-09-25_1430_bbbbbb', json: meetingJson('2026-09-25_1430_bbbbbb', { title: 'Новая встреча' }) },
      { id: '2026-09-22_1200_cccccc', json: '{oops' },
    ],
  });
  const { page } = launched;
  await expect(page.locator('.meeting-item .meeting-title')).toHaveText([
    'Новая встреча',
    'Не удалось прочитать встречу',
    'Старая встреча',
  ]);

  await page.getByRole('button', { name: /Новая встреча/ }).click();
  await expect(page.getByRole('heading', { name: 'Новая встреча' })).toBeVisible();

  await page.getByRole('button', { name: /Не удалось прочитать/ }).click();
  await expect(page.getByText('Папка: 2026-09-22_1200_cccccc')).toBeVisible();
});

test('re-reads the library when the window gets focus', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();

  await addMeeting(libraryDir, '2026-09-26_0900_dddddd', 'Из OneDrive');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Из OneDrive')).toBeVisible();
});

test('settings show the library folder and save the autostart switch', async () => {
  launched = await launchApp();
  const { page, libraryDir, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();

  await expect(page.getByTestId('library-dir')).toHaveText(libraryDir);
  // Тесты запускают версию для разработки — автозапуск в системе не прописывается.
  await expect(page.getByTestId('launch-notice')).toContainText('установленной программе');

  const toggle = page.getByLabel('Запускать TextMeet при входе в систему');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect
    .poll(async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).launchAtLogin)
    .toBe(false);
});

test('changing the library folder switches the meeting list', async () => {
  launched = await launchApp();
  const { page, app, root } = launched;
  const otherDir = join(root, 'other-library');
  await addMeeting(otherDir, '2026-09-27_1000_eeeeee', 'Во второй папке');

  // Системный диалог выбора папки в тесте не нажать — подменяем его ответ.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, otherDir);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Изменить…' }).click();
  await expect(page.getByTestId('library-dir')).toHaveText(otherDir);

  await page.getByRole('button', { name: 'Встречи' }).click();
  await expect(page.getByText('Во второй папке')).toBeVisible();
});

test('broken settings fall back to defaults and are kept aside', async () => {
  launched = await launchApp({ settings: '{oops' });
  const { page, userDataDir, homeDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByTestId('library-dir')).toHaveText(join(homeDir, 'TextMeet'));
  const files = await readdir(userDataDir);
  expect(files.some((f) => f.startsWith('settings.json.broken-'))).toBe(true);
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npm run e2e`
Expected: `shell.spec.ts` проходит; все 6 тестов `screens.spec.ts` падают — в окне пока только заглушка «TextMeet»
(например, `getByText('Пока нет встреч.')` — element(s) not found).

- [ ] **Step 3: Заменить `src/renderer/main/App.tsx` целиком**

```tsx
import { useState } from 'react';
import { LibraryScreen } from './LibraryScreen';
import { SettingsScreen } from './SettingsScreen';

type Screen = 'library' | 'settings';

const TABS: { id: Screen; label: string }[] = [
  { id: 'library', label: 'Встречи' },
  { id: 'settings', label: 'Настройки' },
];

export function App() {
  const [screen, setScreen] = useState<Screen>('library');

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">TextMeet</span>
        <nav className="tabs" aria-label="Разделы">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="tab"
              aria-current={screen === tab.id ? 'page' : undefined}
              onClick={() => setScreen(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">{screen === 'library' ? <LibraryScreen /> : <SettingsScreen />}</main>
    </div>
  );
}
```

- [ ] **Step 4: Написать `src/renderer/main/LibraryScreen.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { MeetingListEntry } from '../../shared/meeting';
import { errorText } from './errors';
import { formatDuration, formatMeetingDate, statusLabel } from './format';

const entryId = (entry: MeetingListEntry): string => (entry.kind === 'ok' ? entry.meeting.id : entry.id);

export function LibraryScreen() {
  const [entries, setEntries] = useState<MeetingListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntries(await window.textmeet.listMeetings());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    // Встречи могли прийти через OneDrive, пока окно было в фоне.
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const openFolder = () => {
    window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)));
  };

  if (entries === null && error === null) return <p className="muted pad">Загрузка…</p>;

  const selected = entries?.find((e) => entryId(e) === selectedId) ?? null;

  return (
    <div className="library">
      <aside className="meeting-list" aria-label="Список встреч">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {entries?.length === 0 && (
          <div className="empty">
            <p>Пока нет встреч.</p>
            <p className="muted">Записи и импортированные файлы появятся здесь.</p>
            <button type="button" onClick={openFolder}>
              Открыть папку библиотеки
            </button>
          </div>
        )}
        <ul>
          {entries?.map((entry) => {
            const id = entryId(entry);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`meeting-item${entry.kind === 'broken' ? ' broken' : ''}`}
                  aria-current={id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(id)}
                >
                  {entry.kind === 'ok' ? (
                    <>
                      <span className="meeting-title">{entry.meeting.title}</span>
                      <span className="meeting-meta">
                        {formatMeetingDate(entry.meeting.createdAt)} · {formatDuration(entry.meeting.durationSec)} ·{' '}
                        {statusLabel(entry.meeting.status)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="meeting-title">Не удалось прочитать встречу</span>
                      <span className="meeting-meta">Папка {entry.id}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="meeting-detail" aria-label="Встреча">
        {selected === null && <p className="muted">Выберите встречу слева.</p>}
        {selected?.kind === 'ok' && (
          <>
            <h1>{selected.meeting.title}</h1>
            <p className="muted">
              {formatMeetingDate(selected.meeting.createdAt)} · {formatDuration(selected.meeting.durationSec)} ·{' '}
              {statusLabel(selected.meeting.status)}
            </p>
            <p className="muted">Расшифровка появится здесь.</p>
          </>
        )}
        {selected?.kind === 'broken' && (
          <>
            <h1>Не удалось прочитать встречу</h1>
            <p>Папка: {selected.id}</p>
            <pre className="reason">{selected.reason}</pre>
          </>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Написать `src/renderer/main/SettingsScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';

export function SettingsScreen() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
      .then(([settings, appInfo]) => {
        setState(settings);
        setInfo(appInfo);
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  /** rollback — что вернуть на экран, если main откажет (для мгновенно показанных изменений). */
  const run = async (action: () => Promise<SettingsState>, rollback?: SettingsState) => {
    try {
      setState(await action());
      setError(null);
    } catch (err) {
      if (rollback) setState(rollback);
      setError(errorText(err));
    }
  };

  const openFolder = () => {
    window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)));
  };

  if (state === null) {
    return error ? (
      <p role="alert" className="error pad">
        {error}
      </p>
    ) : (
      <p className="muted pad">Загрузка…</p>
    );
  }

  const notice = launchAtLoginNoticeText(state.launchAtLoginNotice);

  return (
    <section className="settings">
      <h1>Настройки</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="setting">
        <h2>Папка библиотеки</h2>
        <p className="path" data-testid="library-dir">
          {state.libraryDir}
        </p>
        <div className="row">
          <button type="button" onClick={() => void run(() => window.textmeet.chooseLibraryDir())}>
            Изменить…
          </button>
          <button type="button" onClick={openFolder}>
            Открыть папку
          </button>
        </div>
      </div>

      <div className="setting">
        <label className="toggle">
          <input
            type="checkbox"
            checked={state.settings.launchAtLogin}
            onChange={(e) => {
              const enabled = e.target.checked;
              // Галочку показываем сразу, не дожидаясь записи на диск.
              setState({ ...state, settings: { ...state.settings, launchAtLogin: enabled } });
              void run(() => window.textmeet.setLaunchAtLogin(enabled), state);
            }}
          />
          Запускать TextMeet при входе в систему
        </label>
        <p className="muted">Программа стартует свёрнутой в трей, чтобы запись можно было начать сразу.</p>
        {notice && (
          <p className="notice" data-testid="launch-notice">
            {notice}
          </p>
        )}
      </div>

      {info && (
        <footer className="muted about">
          Версия {info.version} · журнал ошибок: {info.logFile}
        </footer>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Проверить типы и прогнать все сквозные тесты**

Run: `npm run typecheck`
Expected: без ошибок.

Run: `npm run e2e`
Expected: PASS, 7 тестов (1 в `shell.spec.ts` + 6 в `screens.spec.ts`).

- [ ] **Step 7: Убедиться, что тесты стабильны**

Run: `npx playwright test --repeat-each 3`
Expected: PASS, 21 тест. Если хоть один нестабилен — разобраться (не увеличивать тайм-ауты вслепую): причина обычно
в том, что проверка не ждёт состояния (`expect.poll` / авто-ожидание локаторов вместо мгновенного чтения).

- [ ] **Step 8: Посмотреть глазами в режиме разработки** (необязательно, но полезно)

Run: `npm run dev`
Expected: открывается окно TextMeet с вкладками «Встречи» / «Настройки», в трее появляется синее кольцо; закрытие окна
крестиком прячет его, щелчок по значку в трее возвращает, «Выход» в меню трея закрывает программу.
Библиотека по умолчанию — `C:\Users\<user>\TextMeet` (папка создастся). В «Настройках» — подсказка
«Автозапуск работает только в установленной программе…». Остановить: «Выход» в трее.

- [ ] **Step 9: Commit**

```bash
git add e2e/screens.spec.ts src/renderer/main/App.tsx src/renderer/main/LibraryScreen.tsx src/renderer/main/SettingsScreen.tsx
git commit -m "feat: add library and settings screens"
```

---

### Task 12: Сборка в GitHub Actions

Два workflow: `ci.yml` — на каждый push в `main` и в pull request (типы + модульные тесты с порогом покрытия на
`ubuntu-latest`, дёшево по минутам); `build.yml` — по кнопке и по тегу `v*` (полные тесты + установщики на Windows
и macOS). Старый `spike-mac.yml` не трогаем.

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/build.yml`

- [ ] **Step 1: Создать `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      # Модульным тестам Electron не нужен — не скачиваем ~100 МБ.
      ELECTRON_SKIP_BINARY_DOWNLOAD: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:coverage
```

- [ ] **Step 2: Создать `.github/workflows/build.yml`**

```yaml
name: build

on:
  workflow_dispatch:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            artifact: TextMeet-windows
          - os: macos-latest
            artifact: TextMeet-mac
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npx playwright test

      - name: Package (Windows)
        if: runner.os == 'Windows'
        run: npx electron-builder --win --publish never

      - name: Package (macOS, ad-hoc signed .dmg)
        if: runner.os == 'macOS'
        run: |
          npx electron-builder --mac dir --arm64 --publish never
          APP="$(find release -maxdepth 2 -name 'TextMeet.app' -type d | head -n 1)"
          echo "App: $APP"
          # Неподписанное arm64-приложение macOS не запускает — подписываем ad-hoc, как в спайке.
          find "$APP" \( -name '*.node' -o -name '*.dylib' \) -type f -exec codesign --force --sign - {} \;
          codesign --force --deep --sign - "$APP"
          codesign --verify --deep --verbose=2 "$APP"
          mkdir -p dmg
          ditto "$APP" dmg/TextMeet.app
          ln -s /Applications dmg/Applications
          VERSION="$(node -p "require('./package.json').version")"
          hdiutil create -volname TextMeet -srcfolder dmg -ov -format UDZO "release/TextMeet-$VERSION-arm64.dmg"

      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: |
            release/*.exe
            release/*.dmg
          if-no-files-found: error
```

- [ ] **Step 3: Проверить локально, что установщик Windows собирается**

Run: `npm run dist:win`
Expected: `release/TextMeet-Setup-0.1.0.exe` создан (предупреждение `default Electron icon is used` — ожидаемо).

- [ ] **Step 4: Commit и отправить ветку**

```bash
git add .github/workflows/ci.yml .github/workflows/build.yml
git commit -m "ci: add test workflow and on-demand installer builds for Windows and macOS"
git push -u origin plan-1-skeleton
```

- [ ] **Step 5: Запустить сборку установщиков на ветке и дождаться результата**

`gh` установлен в `C:\Program Files\GitHub CLI\gh.exe` (если его нет в PATH — вызывать по полному пути).

```bash
gh workflow run build.yml --ref plan-1-skeleton
gh run list --workflow build.yml --limit 1
gh run watch <id-из-списка> --exit-status
```

Expected: оба задания (`windows-latest`, `macos-latest`) зелёные; в разделе Artifacts запуска — `TextMeet-windows`
(`.exe`) и `TextMeet-mac` (`.dmg`). Если что-то упало — `gh run view <id> --log-failed`, исправить, закоммитить,
запустить снова. Номер успешного запуска записать — он нужен в Task 13 и Task 14.

---

### Task 13: Ручная проверка на Windows и Mac (контрольная точка с пользователем)

Автотесты не видят трей, автозапуск после перезагрузки и поведение неподписанной сборки на Mac. Эти пункты
проверяет пользователь. Инструкции давать по-русски, по шагам, без жаргона.

- [ ] **Step 1: Windows** — установить `release\TextMeet-Setup-0.1.0.exe` (из Task 12 Step 3 или из артефакта
`TextMeet-windows`). Windows может показать «Система Windows защитила ваш компьютер» → «Подробнее» → «Выполнить в любом
случае». Проверить и записать результат по каждому пункту:
  1. Программа открылась, видны вкладки «Встречи» и «Настройки», в трее (возле часов, возможно под стрелкой «^») — синее кольцо.
  2. Крестик окна → окно исчезло, значок в трее остался. Щелчок по значку → окно вернулось.
  3. Правый щелчок по значку → «Выход» → программа закрылась (значок пропал).
  4. «Настройки» → подсказки про автозапуск нет; галочка «Запускать TextMeet при входе в систему» включена.
     Диспетчер задач (Ctrl+Shift+Esc) → «Автозагрузка приложений» → TextMeet есть и «Включено».
  5. Выйти из учётной записи Windows и войти снова (или перезагрузить) → TextMeet запустился сам, **окно не открылось**,
     значок в трее есть.
  6. Выключить галочку автозапуска → в Диспетчере задач TextMeet пропал из автозагрузки (или «Отключено»).
     Включить обратно.
  7. «Настройки» → «Изменить…» → выбрать любую папку → путь поменялся; «Открыть папку» открывает Проводник.

- [ ] **Step 2: Mac** — скачать артефакт `TextMeet-mac` из запуска Task 12 (как в спайке: страница запуска на GitHub →
Artifacts → TextMeet-mac → распаковать zip → открыть `.dmg` → перетащить TextMeet в «Программы»). Первый запуск:
macOS заблокирует → Системные настройки → Конфиденциальность и безопасность → «Всё равно открыть». Проверить:
  1. Окно открылось, в строке меню вверху справа — кольцо (чёрное/белое под тему).
  2. Щелчок по значку → меню «Открыть TextMeet» / «Выход» работает. Красная кнопка окна → окно скрыто, программа работает;
     щелчок по значку в Dock снова показывает окно. ⌘Q закрывает программу.
  3. «Настройки» → что написано под галочкой автозапуска (дословно). Системные настройки → Основные → Объекты входа:
     есть ли TextMeet.
  4. Перезагрузить Mac (или выйти и войти) → запустился ли TextMeet сам и открылось ли окно.
  5. Светлая и тёмная тема системы — интерфейс читается в обеих.

- [ ] **Step 3: Записать результаты** в `docs/superpowers/plan-1-checks.md` (таблица: пункт / Windows / Mac /
заметка). Если что-то не работает — **остановиться** и разобраться (superpowers:systematic-debugging) до Task 14.
Особенно вероятно: автозапуск на Mac у неподписанной программы (документация Electron это прямо допускает). Если он не
работает — записать как известное ограничение, в интерфейсе оставить подсказку, решение перенести в План 8
(постоянная ad-hoc подпись, риск 4 спецификации).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plan-1-checks.md
git commit -m "docs: record manual checks of the app skeleton on Windows and macOS"
```

---

### Task 14: Документы и слияние в main

**Files:**
- Modify: `docs/superpowers/plans/2026-09-25-textmeet-roadmap.md`
- Modify: `docs/superpowers/specs/2026-09-25-textmeet-design.md`

- [ ] **Step 1: Дорожная карта** — в строке плана 1 заменить `| 0 | ждёт |` на
`| 0 | выполнен ([план](2026-09-27-textmeet-plan-1-skeleton.md), [проверки](../plan-1-checks.md)) |`.
В строке плана 2 в начало описания добавить: «**Перед началом — макет интерфейса (запись, список встреч, встреча,
настройки), согласовать с пользователем (спецификация §3.7).**»

- [ ] **Step 2: Спецификация** — в §5.2 после абзаца про Recorder window добавить:

```markdown
- **Preload** — один скрипт на оба окна (`src/preload/index.ts`): preload в песочнице не может подключать другие
  файлы, а общий код двух preload-скриптов сборщик выносит в отдельный файл. Какое окно каким каналом IPC может
  пользоваться, проверяет main по отправителю (`event.sender`); входные данные из окон проверяются zod.
```

И в §9 добавить строку в таблицу рисков:

```markdown
| 6 | Автозапуск при входе в систему у неподписанной программы на macOS | Ручная проверка в Плане 1 | Подсказка в настройках; постоянная ad-hoc подпись в Плане 8 | <результат из plan-1-checks.md> |
```

- [ ] **Step 3: Полная проверка перед слиянием**

Run: `npm run typecheck && npm run test:coverage && npm run e2e`
Expected: без ошибок; 94 модульных теста, покрытие ≥ 80 %; 7 сквозных тестов.

- [ ] **Step 4: Commit документов**

```bash
git add docs/superpowers/plans/2026-09-25-textmeet-roadmap.md docs/superpowers/specs/2026-09-25-textmeet-design.md
git commit -m "docs: mark plan 1 done and note preload and autostart decisions"
```

- [ ] **Step 5: Слить в main и отправить**

```bash
git checkout main
git merge --no-ff plan-1-skeleton -m "Merge plan 1: app skeleton"
git push origin main
```

Expected: на GitHub запускается `ci` на `main` и проходит (`gh run list --workflow ci.yml --limit 1`).
