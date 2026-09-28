# TextMeet — План 2: запись

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запись встреч в TextMeet: две дорожки (микрофон + звук компьютера) кусками на диск с индикаторами уровня; старт и стоп кнопкой, из трея и глобальной горячей клавишей (переназначается в настройках); звук и уведомление; окно «Запись остановлена» с числом участников; сведение `mix.opus` через ffmpeg и плеер; восстановление после сбоя; напоминание о тишине и проверка места; новый вид всего приложения по утверждённому макету «Бумага».

**Architecture:** Скрытое окно записи (`src/renderer/recorder`) по командам main включает микрофон (`getUserMedia`) и звук компьютера (`getDisplayMedia`, рецепт спайка «вариант Г»), пишет каждую дорожку `MediaRecorder` кусками раз в секунду и шлёт куски и пики уровня в main. В main автомат записи (`src/main/recording/controller.ts`, без Electron — зависимости внедряются) ведёт старт/стоп, дописывает куски в файлы, следит за тишиной и местом, после стопа ставит встречу в очередь сведения (ffmpeg из `ffmpeg-static`). Главное окно (React) — только отображение: состояние записи приходит событиями, действия — запросами по типизированному контракту IPC (`src/shared/ipc.ts`). Вся логика без Electron покрыта Vitest; склейка с Electron — сквозными тестами Playwright в тестовом режиме (поддельный микрофон Chromium, тон вместо звука компьютера).

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0 + Vite 7.3.6, React 19.3, TypeScript 7.0.2 (только проверка типов, три tsconfig), zod 4.6.5, ffmpeg-static 5.3.0 (ffmpeg 6.1.1), @fontsource/golos-text 5.3.0 и @fontsource/literata 5.3.0, Vitest 5.0.2 (+ coverage-v8), Playwright 1.63.0 (`_electron`), electron-builder 26.15.3, GitHub Actions.

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.1, §3.6, §3.7, §5.2, §5.3, §5.6, §6, §7. **Решения Плана 2:** [2026-09-28-textmeet-plan-2-design.md](../specs/2026-09-28-textmeet-plan-2-design.md). **Макет:** [Макет TextMeet](https://claude.ai/artifact/Urmc3atvSFifUpDyBzjeR6) (стиль «Бумага», утверждён 2026-09-28). Итоги спайка: [spike-results.md](../spike-results.md); отложенное из Плана 1: [plan-1-checks.md](../plan-1-checks.md).

---

## Факты, на которые опирается план (проверены 2026-09-28 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии на Windows 11: 379 модульных тестов (покрытие 98,9 % строк),
19 сквозных тестов (3 прогона подряд без сбоев), запись настоящего звука компьютера на этом ПК, сборка `win-unpacked`
и запись через собранную программу (ffmpeg из `app.asar.unpacked` сводит дорожки). Затем план проигран по задачам на
чистой копии ветки: после каждой из Task 1–15 проверка типов без ошибок и все модульные тесты проходят, с Task 11
собирается `npm run build`, в Task 14 проходят сквозные тесты; итог совпал с черновой копией файл в файл.
Ревью кода черновой копии нашло два недочёта средней важности — оба исправлены в коде этого плана.

- **ffmpeg-static 5.3.0** при `npm install` скачивает ffmpeg 6.1.1 под ОС и процессор установки (Windows x64 — сборка
  gyan.dev «essentials», 83 МБ; в ней есть `libopus`, фильтры `adelay`, `amix` с `normalize=0`). Пакет отдаёт путь к
  бинарнику; в установленной программе пакет лежит в `app.asar`, поэтому в `electron-builder.yml` нужен `asarUnpack`,
  а путь переписывается `app.asar/` → `app.asar.unpacked/`. Размер распакованной программы: 455 МБ (было 374).
  На Mac бинарник нужно подписать ad-hoc вместе с остальным (`build.yml`).
- **Длительность из ffmpeg:** `-progress pipe:1 -nostats` пишет в stdout строки `out_time_us=…`; последняя — длина результата.
- **WebM от MediaRecorder не годится для плеера:** в нём нет длительности и индекса, `<audio>` не умеет перематывать.
  Поэтому плеер играет `mix.opus` (Ogg Opus: длительность и перемотка работают), а сами дорожки ffmpeg читает без проблем.
- **Протокол плеера:** `protocol.registerSchemesAsPrivileged` — до `app.whenReady()`; `protocol.handle` возвращает
  `Response`, для перемотки нужен ответ 206 на заголовок `Range` (сделано вручную, `node:stream` `Readable.toWeb`).
  `<audio>` получает длительность (проверено сквозным тестом).
- **Звук компьютера в приложении работает на этом ПК** тем же рецептом, что в спайке:
  `setDisplayMediaRequestHandler` → `callback({ video: request.frame, audio: 'loopback' })`, в окне —
  `getDisplayMedia({ video: {320×240, 1 к/с}, audio: { restrictOwnAudio: true, … } })`, видео сразу останавливается.
  Сравнение `request.frame === recorderWindow.webContents.mainFrame` работает (Electron отдаёт один и тот же объект —
  так же сделано в примере документации). Отказ — `callback({})`.
- **Тестовый режим** `TEXTMEET_TEST_MEDIA=tone|fail` (только для автотестов, как `TEXTMEET_USER_DATA`): main включает
  `app.commandLine.appendSwitch('use-fake-device-for-media-stream')` (поддельный микрофон Chromium «Fake Default Audio
  Input»), окно записи вместо `getDisplayMedia` берёт тон 330 Гц (`tone`) или получает `NotReadableError` (`fail`),
  а запрос доступа к микрофону macOS (`askForMediaAccess`) пропускается. Настоящий захват звука компьютера в тестах не
  трогаем: на машине GitHub Actions с macOS запрос разрешения повесил бы тест.
- **`use-fake-ui-for-media-stream` не использовать:** с ним Chromium не спрашивает обработчик разрешений Electron, и тест
  «нет доступа к микрофону» (обработчик подменяется на отказ через `app.evaluate`) перестаёт работать.
- **Окно записи:** `backgroundThrottling: false` держит `setInterval` 66 мс в скрытом окне (≈15 пиков в секунду —
  проверено), `autoplayPolicy: 'no-user-gesture-required'` — чтобы `AudioContext` (сигналы, анализ уровня) не стоял
  «на паузе» без нажатий. Куски `ArrayBuffer` проходят `contextBridge` и `ipcRenderer.send`; main принимает и
  `ArrayBuffer`, и `Uint8Array`.
- **Сквозные тесты:** `page.emulateMedia({ colorScheme: 'dark' })` работает для окна Electron; системные окна
  подменяются через `app.evaluate(({ dialog }) => { dialog.showMessageBox = … })`; падение окна записи вызывается
  `webContents.forcefullyCrashRenderer()`; разрешение на микрофон отнимается
  `session.defaultSession.setPermissionRequestHandler((_c, _p, cb) => cb(false))`.
- **zod 4 `z.looseObject`** сохраняет незнакомые поля при разборе — ими не теряются поля от будущих версий в `meeting.json`.
- **TypeScript 7:** три конфигурации (`tsconfig.node.json` без DOM, `tsconfig.web.json` без Node, `tsconfig.e2e.json`)
  проходят; типы Electron в конфигурации без DOM работают (`skipLibCheck`).
- **Переиспользуемые находки Плана 1** остаются в силе: один preload на оба окна, без `"type": "module"`, изоляция тестов
  через `TEXTMEET_USER_DATA` / `TEXTMEET_HOME`, главное окно ищется по адресу `…/main/index.html`.

## Что сознательно не входит в План 2

- Поиск, «Импорт файла», текст встречи, спикеры, переход к месту по щелчку (Планы 3–5), ИИ (План 6), разделы настроек
  «Расшифровка» и «ИИ». В окне этих элементов **нет** — никаких неработающих кнопок. Вместо «Импорт файла» внизу
  боковой панели — «Открыть папку библиотеки».
- Кнопка «Расшифровать» в окне «Запись остановлена» пока только сохраняет ответ (расшифровка — План 3).
- Electron fuses — План 8 (после проверки разрешений macOS).
- Проверка звука компьютера на Mac, разрешения macOS и уведомления — только вручную (Task 16).

## Карта файлов

```
package.json                      # + ffmpeg-static, шрифты; typecheck по трём tsconfig; predev/prestart
tsconfig.node.json                # main, preload, shared, модульные тесты — без DOM
tsconfig.web.json                 # окна (renderer) и shared — без Node
tsconfig.e2e.json                 # сквозные тесты
vitest.config.ts                  # покрытие по всем модулям src/, исключения — склейка с Electron и React
electron-builder.yml              # + asarUnpack для ffmpeg
.github/workflows/ci.yml          # actions/*@v5
.github/workflows/build.yml       # actions/*@v5, подпись ffmpeg на Mac
src/
  test-support/temp-dir.ts        # временные папки модульных тестов с уборкой
  shared/
    settings.ts                   # + microphoneId, recordHotkey, recordSounds
    meeting.ts                    # + tracks, recovered; looseObject; запись «создаётся»; mixReady
    recording.ts                  # состояние записи, пики, команды и сообщения окна записи, шкала уровня
    hotkey.ts                     # горячая клавиша: разбор нажатия, правила, показ
    format.ts                     # «42 мин», «0,8 ГБ» — для main и окон
    ipc.ts                        # таблица контракта: канал → аргумент → ответ; события; окно записи
  main/
    index.ts                      # запуск: окна, трей, клавиша, разрешения, протокол, выход во время записи
    ipc.ts                        # типизированные обработчики, проверка отправителя и zod
    windows.ts                    # окна; тестовый режим TEXTMEET_TEST_MEDIA
    tray.ts, tray-menu.ts         # значок с красной точкой, «Начать/Остановить запись»
    notifications.ts              # системные уведомления, щелчок открывает окно
    texts.ts                      # тексты уведомлений, системных окон, причин ошибок записи
    hotkey-manager.ts             # globalShortcut: регистрация, замена с откатом, пауза
    permissions.ts                # захват звука — только окну записи
    app-menu.ts                   # урезанное меню macOS
    media-protocol.ts             # tm-media:// для плеера (Range)
    fs/fs-errors.ts               # EACCES/ENOSPC… → понятная причина
    library/library.ts            # + updateMeeting (очередь), removeMeetingDir, «создаётся», mixReady
    icons/circle-icon.ts          # + кольцо с красной точкой
    audio/ffmpeg.ts               # путь к ffmpeg, запуск, длительность
    audio/mixer.ts                # сведение mix.opus, очередь
    recording/controller.ts       # автомат записи
    recording/track-files.ts      # дописывание кусков в файлы дорожек
    recording/monitors.ts         # тишина, «звук компьютера не слышен», место на диске
    recording/recovery.ts         # прерванные записи
  preload/index.ts                # window.textmeet и window.recorder по контракту
  renderer/
    recorder/
      recorder.ts                 # команды main → захват → куски, пики, «остановлено»
      capture.ts                  # getUserMedia / getDisplayMedia / MediaRecorder
      levels.ts, sounds.ts        # уровни (AnalyserNode), сигналы (WebAudio)
      media.ts                    # чистые помощники окна записи
    main/
      App.tsx                     # боковая панель + правая часть + «Запись остановлена»
      RecordPanel.tsx, MeetingList.tsx, Meter.tsx
      LivePane.tsx, MeetingPane.tsx, Player.tsx
      SettingsPane.tsx, HotkeyField.tsx, StopDialog.tsx
      hooks.ts, icons.tsx, format.ts, styles.css, main.tsx, index.html
      (LibraryScreen.tsx, SettingsScreen.tsx — удаляются)
e2e/
  helpers.ts                      # тестовый режим записи, тон в WebM для заготовок, закрытие во время записи
  shell.spec.ts, screens.spec.ts  # обновлены под новый вид
  recording.spec.ts               # запись, отказы, восстановление, сбой окна записи, выход
  hotkey.spec.ts                  # горячая клавиша в настройках
```

Файлы встречи: `<библиотека>/<id>/meeting.json`, `audio/mic.webm`, `audio/system.webm` (если писался звук компьютера),
`audio/mix.opus` (после сведения). Настройки и журнал — как в Плане 1.

**Порядок задач выбран так, чтобы после каждой проходили `npm run typecheck` и `npm test`.** Сквозные тесты (`e2e/`)
обновляются в Task 14; до неё их не запускать — старые проверяют прежний вид окна.

---

### Task 1: Пакеты и инструменты

Добавляет ffmpeg и шрифты, делит проверку типов на три конфигурации (main/preload — без DOM, окна — без Node),
делает временные папки модульных тестов самоубирающимися и считает покрытие по всем модулям `src/`
(из отложенного в Плане 1: раздельные tsconfig, покрытие по всем модулям, уборка временных папок, `predev`/`prestart`).

**Files:**
- Modify: `package.json`, `package-lock.json` (через `npm install`), `vitest.config.ts`
- Create: `tsconfig.node.json`, `tsconfig.web.json`, `tsconfig.e2e.json`, `src/test-support/temp-dir.ts`
- Modify: `src/main/fs/atomic-write.test.ts`, `src/main/fs/read-json.test.ts`, `src/main/logger.test.ts`,
  `src/main/settings/settings-store.test.ts`

- [ ] **Step 1: Перейти на ветку Плана 2**

Ветка `plan-2-recording` уже есть: на ней лежат решения Плана 2 и этот план.

```bash
git checkout plan-2-recording
git status --short
```

Expected: рабочая копия чистая.

- [ ] **Step 2: Поставить пакеты**

```bash
npm install -E ffmpeg-static@5.3.0
npm install -D -E @fontsource/golos-text@5.3.0 @fontsource/literata@5.3.0
```

Expected: `node_modules/ffmpeg-static/ffmpeg.exe` (на Mac — `ffmpeg`) скачан, размер около 80 МБ.

- [ ] **Step 3: Скрипты в `package.json`**

`typecheck` проверяет три конфигурации; `predev` и `prestart` докачивают Electron в свежей копии репозитория
(бинарник Electron скачивается лениво — см. итоги спайка). Итоговый `package.json`:

`package.json`:

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
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.e2e.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "e2e": "npm run build && playwright test",
    "dist:win": "npm run build && electron-builder --win --publish never",
    "dist:mac": "npm run build && electron-builder --mac dir --arm64 --publish never",
    "predev": "node node_modules/electron/install.js",
    "prestart": "node node_modules/electron/install.js"
  },
  "dependencies": {
    "ffmpeg-static": "5.3.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@fontsource/golos-text": "5.3.0",
    "@fontsource/literata": "5.3.0",
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

- [ ] **Step 4: Три конфигурации TypeScript**

`tsconfig.json` остаётся общей конфигурацией для редактора; проверка идёт по трём:

`tsconfig.node.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": ["node"]
  },
  "include": [
    "src/main",
    "src/preload",
    "src/shared",
    "src/test-support",
    "src/renderer/**/*.test.ts",
    "electron.vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts"
  ]
}
```

`tsconfig.web.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src/renderer", "src/shared"],
  "exclude": ["**/*.test.ts"]
}
```

`tsconfig.e2e.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["e2e", "src/renderer/env.d.ts"]
}
```

- [ ] **Step 5: Проверить типы**

Run: `npm run typecheck`
Expected: три запуска `tsc` без ошибок.

- [ ] **Step 6: Временные папки тестов с уборкой**

`src/test-support/temp-dir.ts`:

```ts
// Временные папки модульных тестов: создаются в %TEMP% и удаляются после каждого теста.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export function makeTempDir(prefix = 'textmeet-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}
```

Тесты, которые создавали временные папки через `mkdtempSync`, переходят на `makeTempDir` (содержимое тестов не меняется,
кроме ожиданий настроек в `settings-store.test.ts`: они сравниваются через `DEFAULT_SETTINGS`, чтобы новые поля
настроек в Task 2 их не ломали):

`src/main/fs/atomic-write.test.ts`:

```ts
import { promises as fsp, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic, writeJsonAtomic, type RenameFn } from './atomic-write';
import { makeTempDir } from '../../test-support/temp-dir';

const tempDir = () => makeTempDir('textmeet-atomic-');

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

`src/main/fs/read-json.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readJsonFile } from './read-json';
import { makeTempDir } from '../../test-support/temp-dir';

const Schema = z.object({ n: z.number() });
const tempDir = () => makeTempDir('textmeet-readjson-');

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

`src/main/logger.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger, describeError, formatLogLine } from './logger';
import { makeTempDir } from '../test-support/temp-dir';

const fixedNow = () => new Date('2026-09-27T10:00:00.000Z');
const logFile = () => join(makeTempDir('textmeet-log-'), 'logs', 'textmeet.log');

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

  it('keeps writing to the same file when rotation fails', async () => {
    const file = logFile();
    const logger = createLogger(file, { now: fixedNow, maxBytes: 80 });
    logger.info('первая строка журнала');
    await logger.flush();
    // Место для копии занято непустой папкой — как будто файл держит антивирус.
    mkdirSync(`${file}.1`);
    writeFileSync(join(`${file}.1`, 'keep'), 'x');
    logger.info('вторая строка журнала');
    await logger.flush();
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('первая');
    expect(text).toContain('вторая');
  });

  it('keeps working when the log cannot be written', async () => {
    const dir = makeTempDir('textmeet-log-');
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

`src/main/settings/settings-store.test.ts`:

```ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import type { Logger } from '../logger';
import { createSettingsStore, loadSettings } from './settings-store';
import { makeTempDir } from '../../test-support/temp-dir';

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) };
}
const tempDir = () => makeTempDir('textmeet-settings-');

describe('loadSettings', () => {
  it('returns defaults when the file is missing', async () => {
    expect(await loadSettings(join(tempDir(), 'settings.json'), fakeLogger())).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a valid file and fills new fields with defaults', async () => {
    const file = join(tempDir(), 'settings.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, libraryDir: 'D:\\Lib' }));
    expect(await loadSettings(file, fakeLogger())).toEqual({ ...DEFAULT_SETTINGS, libraryDir: 'D:\\Lib' });
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
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      ...DEFAULT_SETTINGS,
      libraryDir: 'D:\\A',
      launchAtLogin: false,
    });
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

- [ ] **Step 7: Покрытие по всем модулям `src/`**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
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
        'src/main/autostart.ts',
        'src/renderer/env.d.ts',
        'src/renderer/**/*.tsx',
        'src/renderer/main/hooks.ts',
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

- [ ] **Step 8: Прогнать тесты с покрытием**

Run: `npm run test:coverage`
Expected: все тесты проходят (те же 96, что в конце Плана 1), покрытие выше порога 80 %.
Временные папки `textmeet-*` в `%TEMP%` после прогона не остаются:

```bash
ls "$TEMP" | grep -c '^textmeet-' || true
```

Expected: `0`.

- [ ] **Step 9: Коммит**

```bash
git add package.json package-lock.json tsconfig.node.json tsconfig.web.json tsconfig.e2e.json vitest.config.ts src/test-support src/main/fs/atomic-write.test.ts src/main/fs/read-json.test.ts src/main/logger.test.ts src/main/settings/settings-store.test.ts
git commit -m "chore: add ffmpeg and fonts, split type checks, clean up test temp folders"
```

---

### Task 2: Данные — настройки, встреча, библиотека

Новые поля настроек и встречи, общие типы записи, форматирование для людей, понятные причины ошибок файлов,
безопасное обновление `meeting.json` (очередь на встречу, незнакомые поля сохраняются), удаление несостоявшейся
встречи, состояния «создаётся» и «сведение готово» в списке.

**Files:**
- Modify: `src/shared/settings.ts`, `src/shared/settings.test.ts`, `src/shared/meeting.ts`, `src/shared/meeting.test.ts`,
  `src/main/library/library.ts`, `src/main/library/library.test.ts`
- Create: `src/shared/recording.ts`, `src/shared/recording.test.ts`, `src/shared/format.ts`, `src/shared/format.test.ts`,
  `src/main/fs/fs-errors.ts`, `src/main/fs/fs-errors.test.ts`

- [ ] **Step 1: Тесты схем**

`src/shared/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsSchema } from './settings';

describe('SettingsSchema', () => {
  it('fills defaults for an empty object', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      schemaVersion: 1,
      libraryDir: null,
      launchAtLogin: true,
      microphoneId: null,
      recordHotkey: null,
      recordSounds: true,
    });
  });

  it('reads a settings file written by the previous version', () => {
    const parsed = SettingsSchema.parse({ schemaVersion: 1, libraryDir: 'D:\\Встречи', launchAtLogin: false });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, libraryDir: 'D:\\Встречи', launchAtLogin: false });
  });

  it('keeps recording settings', () => {
    const parsed = SettingsSchema.parse({ microphoneId: 'abc', recordHotkey: 'Control+Alt+R', recordSounds: false });
    expect(parsed).toMatchObject({ microphoneId: 'abc', recordHotkey: 'Control+Alt+R', recordSounds: false });
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ microphoneId: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
  });
});
```

`src/shared/meeting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { entryId, MEETING_ID_PATTERN, MeetingSchema, type Meeting } from './meeting';

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
  tracks: [],
  recovered: false,
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

  it('reads a meeting written by the previous version (no tracks, no recovered flag)', () => {
    const { tracks: _tracks, recovered: _recovered, ...old } = valid;
    expect(MeetingSchema.parse(old)).toEqual(valid);
  });

  it('keeps fields it does not know (written by a newer version)', () => {
    const parsed = MeetingSchema.parse({ ...valid, summaryLanguage: 'ru', extra: { a: 1 } });
    expect(parsed).toMatchObject({ summaryLanguage: 'ru', extra: { a: 1 } });
  });

  it('accepts tracks with offsets', () => {
    const tracks = [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 35 },
    ];
    expect(MeetingSchema.parse({ ...valid, tracks }).tracks).toEqual(tracks);
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
    ['unknown track kind', { tracks: [{ kind: 'video', file: 'v.webm', startOffsetMs: 0 }] }],
    ['track file with a path', { tracks: [{ kind: 'mic', file: '../mic.webm', startOffsetMs: 0 }] }],
    ['negative track offset', { tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: -5 }] }],
    ['recovered not a boolean', { recovered: 'yes' }],
  ])('rejects %s', (_name, patch) => {
    expect(MeetingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe('entryId', () => {
  it('returns the id of every kind of entry', () => {
    expect(entryId({ kind: 'ok', meeting: valid, mixReady: false })).toBe(valid.id);
    expect(entryId({ kind: 'creating', id: 'x' })).toBe('x');
    expect(entryId({ kind: 'broken', id: 'y', reason: 'r' })).toBe('y');
  });
});
```

- [ ] **Step 2: Запустить — падают**

Run: `npx vitest run src/shared/settings.test.ts src/shared/meeting.test.ts`
Expected: FAIL — нет полей `microphoneId`/`recordHotkey`/`recordSounds`, `tracks`/`recovered`, функции `entryId`.

- [ ] **Step 3: Схемы**

`src/shared/settings.ts`:

```ts
import { z } from 'zod';

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
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
```

`src/shared/meeting.ts`:

```ts
import { z } from 'zod';

/** Имя папки встречи = её id: дата и время создания (местные) + 6 случайных hex-символов. */
export const MEETING_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}_[0-9a-f]{6}$/;

export const MeetingIdSchema = z.string().regex(MEETING_ID_PATTERN);
export const MeetingSourceSchema = z.enum(['recording', 'import']);
export const MeetingStatusSchema = z.enum(['recording', 'recorded', 'queued', 'transcribing', 'done', 'error']);
export const TrackKindSchema = z.enum(['mic', 'system']);

/** Дорожка записи: файл в папке audio/ и сдвиг её начала от начала самой ранней дорожки. */
export const TrackSchema = z.object({
  kind: TrackKindSchema,
  file: z.string().regex(/^[a-z0-9-]+\.[a-z0-9]+$/),
  startOffsetMs: z.number().int().nonnegative(),
});

// Новые поля добавляются с .default(...) — иначе все уже записанные встречи станут «повреждёнными».
// looseObject: незнакомые поля (их может записать более новая версия программы — библиотека бывает общей
// через OneDrive) не отбрасываются, а сохраняются при перезаписи файла.
export const MeetingSchema = z.looseObject({
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
  tracks: z.array(TrackSchema).default([]),
  /** Запись прервалась (сбой программы или окна записи) и была восстановлена. */
  recovered: z.boolean().default(false),
});

export type Meeting = z.infer<typeof MeetingSchema>;
export type MeetingSource = z.infer<typeof MeetingSourceSchema>;
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;
export type TrackKind = z.infer<typeof TrackKindSchema>;
export type Track = z.infer<typeof TrackSchema>;

export type MeetingListEntry =
  | { kind: 'ok'; meeting: Meeting; /** Готово ли сведение для прослушивания (audio/mix.opus). */ mixReady: boolean }
  /** Папка есть, meeting.json ещё нет: встреча только что создаётся (или создание прервалось). */
  | { kind: 'creating'; id: string }
  | { kind: 'broken'; id: string; reason: string };

export const entryId = (entry: MeetingListEntry): string => (entry.kind === 'ok' ? entry.meeting.id : entry.id);
```

- [ ] **Step 4: Тесты общих типов записи и форматирования**

`src/shared/recording.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { levelFromPeak, litSegments, METER_SEGMENTS } from './recording';

describe('levelFromPeak', () => {
  it('maps −60…0 dB onto 0…1', () => {
    expect(levelFromPeak(1)).toBe(1);
    expect(levelFromPeak(0.001)).toBeCloseTo(0, 5); // −60 дБ
    expect(levelFromPeak(10 ** (-30 / 20))).toBeCloseTo(0.5, 5);
  });

  it('clamps silence, noise below the floor, overload and garbage', () => {
    expect(levelFromPeak(0)).toBe(0);
    expect(levelFromPeak(0.0001)).toBe(0);
    expect(levelFromPeak(1.7)).toBe(1);
    expect(levelFromPeak(Number.NaN)).toBe(0);
    expect(levelFromPeak(-0.5)).toBe(0);
  });
});

describe('litSegments', () => {
  it('lights all segments at full scale and none in silence', () => {
    expect(litSegments(1)).toBe(METER_SEGMENTS);
    expect(litSegments(0)).toBe(0);
  });

  it('rounds to the nearest segment', () => {
    expect(litSegments(10 ** (-30 / 20))).toBe(10);
    expect(litSegments(10 ** (-30 / 20), 4)).toBe(2);
  });
});
```

`src/shared/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBytes, formatDurationShort } from './format';

describe('formatDurationShort', () => {
  it.each([
    [0, 'меньше минуты'],
    [59, 'меньше минуты'],
    [60, '1 мин'],
    [42 * 60 + 15, '42 мин'],
    [3600, '1 ч 00 мин'],
    [3600 + 4 * 60 + 59, '1 ч 04 мин'],
    [2 * 3600 + 35 * 60, '2 ч 35 мин'],
  ])('%s s → %s', (seconds, text) => {
    expect(formatDurationShort(seconds)).toBe(text);
  });

  it('shows a dash for unknown values', () => {
    expect(formatDurationShort(null)).toBe('—');
    expect(formatDurationShort(-1)).toBe('—');
    expect(formatDurationShort(Number.NaN)).toBe('—');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 МБ'],
    [50 * 1024 * 1024, '50 МБ'],
    [450 * 1024 * 1024, '0,4 ГБ'],
    [0.8 * 1024 ** 3, '0,8 ГБ'],
    [1024 ** 3, '1,0 ГБ'],
    [9.94 * 1024 ** 3, '9,9 ГБ'],
    [214.4 * 1024 ** 3, '214 ГБ'],
  ])('%s → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });

  it('shows a dash for garbage', () => {
    expect(formatBytes(-5)).toBe('—');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
```

- [ ] **Step 5: Общие типы записи и форматирование**

`recording.ts` попадает и в preload, поэтому в нём нет zod и пакетов — только типы, константы и чистые функции.

`src/shared/recording.ts`:

```ts
// Типы записи, общие для main, окна записи и главного окна. Без zod и пакетов: модуль попадает в preload.
import type { TrackKind } from './meeting';

export const TRACK_FILES: Record<TrackKind, string> = { mic: 'mic.webm', system: 'system.webm' };
/** Сведение дорожек для прослушивания. */
export const MIX_FILE = 'mix.opus';
/** Делений в индикаторе уровня. */
export const METER_SEGMENTS = 20;
/** Нижняя граница шкалы индикатора, дБ. */
export const METER_FLOOR_DB = -60;

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'stopping';
/** Звук компьютера в текущей записи: не пишется, пишется, не удалось подключиться. */
export type SystemAudioState = 'off' | 'on' | 'failed';
export type SystemSettingsKind = 'microphone' | 'system-audio';

/** Почему запись не началась. settings — какой раздел настроек системы предложить открыть. */
export interface StartProblem {
  message: string;
  settings: SystemSettingsKind | null;
}

/** Окно «Запись остановлена». */
export interface StopDialogData {
  meetingId: string;
  title: string;
  durationSec: number;
}

export interface StopDialogAnswer {
  meetingId: string;
  title: string;
  /** null — «Пропустить». */
  participantsHint: number | null;
}

export interface RecordingState {
  phase: RecordingPhase;
  meetingId: string | null;
  /** Начало записи (мс от эпохи) — таймер окно считает само. */
  startedAt: number | null;
  /** Переключатель «Звук компьютера» для ближайшей записи. */
  systemAudioNext: boolean;
  system: SystemAudioState;
  /** Почему звук компьютера не записывается (для system = 'failed'). */
  systemProblem: string | null;
  /** С начала записи звук компьютера ровно 0 дольше 10 с. */
  systemSilent: boolean;
  /** Микрофон отключили во время записи. */
  micEnded: boolean;
  /** Название микрофона, который пишет. */
  micLabel: string | null;
  /** Свободно в папке библиотеки, байт (обновляется во время записи). */
  freeBytes: number | null;
  startProblem: StartProblem | null;
  stopDialog: StopDialogData | null;
}

export const IDLE_RECORDING_STATE: RecordingState = {
  phase: 'idle',
  meetingId: null,
  startedAt: null,
  systemAudioNext: true,
  system: 'off',
  systemProblem: null,
  systemSilent: false,
  micEnded: false,
  micLabel: null,
  freeBytes: null,
  startProblem: null,
  stopDialog: null,
};

/** Пики дорожек, линейные 0–1. system: null — дорожки звука компьютера нет. */
export interface Peaks {
  mic: number;
  system: number | null;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Пик → положение индикатора 0–1 по шкале −60…0 дБ. */
export function levelFromPeak(peak: number): number {
  if (!(peak > 0)) return 0;
  const db = 20 * Math.log10(peak);
  return clamp01((db - METER_FLOOR_DB) / -METER_FLOOR_DB);
}

/** Сколько делений индикатора зажечь. */
export function litSegments(peak: number, segments: number = METER_SEGMENTS): number {
  return Math.round(levelFromPeak(peak) * segments);
}

// ---- Окно записи ----

export type SoundKind = 'start' | 'stop';

export interface RecorderStartCommand {
  meetingId: string;
  /** null — микрофон, выбранный в системе. */
  micDeviceId: string | null;
  systemAudio: boolean;
}

/** Ошибка getUserMedia / getDisplayMedia: имя DOMException и текст. */
export interface MediaFailure {
  name: string;
  message: string;
}

export interface RecorderStarted {
  meetingId: string;
  /** Время старта каждой дорожки (мс от эпохи, часы окна записи). */
  tracks: { kind: TrackKind; startedAt: number }[];
  micLabel: string;
  /** Звук компьютера просили, но подключиться не удалось. */
  systemFailure: MediaFailure | null;
}

export interface RecorderStartFailed {
  meetingId: string;
  failure: MediaFailure;
}

export interface RecorderChunk {
  meetingId: string;
  kind: TrackKind;
  data: ArrayBuffer;
}

export interface RecorderPeaks extends Peaks {
  meetingId: string;
}

export interface RecorderTrackEnded {
  meetingId: string;
  kind: TrackKind;
}

export interface RecorderStopped {
  meetingId: string;
}
```

`src/shared/format.ts`:

```ts
// Форматирование для людей, общее для main (уведомления, диалоги) и окон.
const pad = (n: number): string => String(n).padStart(2, '0');

/** Длительность для списка и уведомлений: «меньше минуты», «42 мин», «1 ч 04 мин». */
export function formatDurationShort(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return 'меньше минуты';
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} ч ${pad(m)} мин` : `${m} мин`;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 100 * MB) return `${Math.round(bytes / MB)} МБ`;
  const gb = bytes / GB;
  const text = gb < 10 ? gb.toFixed(1) : String(Math.round(gb));
  return `${text.replace('.', ',')} ГБ`;
}
```

- [ ] **Step 6: Тест причин ошибок файлов**

`src/main/fs/fs-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fsErrorReason, humanFsError } from './fs-errors';

const withCode = (code: string): NodeJS.ErrnoException => Object.assign(new Error(`${code}: raw`), { code });

describe('fsErrorReason', () => {
  it.each([
    ['EACCES', 'нет прав на эту папку'],
    ['EPERM', 'нет прав на эту папку'],
    ['ENOSPC', 'на диске закончилось место'],
    ['EBUSY', 'файл занят другой программой'],
    ['ENOENT', 'папка не найдена'],
    ['EROFS', 'диск доступен только для чтения'],
  ])('%s → %s', (code, reason) => {
    expect(fsErrorReason(withCode(code))).toBe(reason);
  });

  it('falls back to the error text for unknown codes and non-errors', () => {
    expect(fsErrorReason(withCode('EWHATEVER'))).toBe('EWHATEVER: raw');
    expect(fsErrorReason('строка')).toBe('строка');
    expect(fsErrorReason(null)).toBe('null');
  });
});

describe('humanFsError', () => {
  it('prefixes the action and keeps the original error as the cause', () => {
    const original = withCode('EACCES');
    const err = humanFsError('Не удалось открыть папку', original);
    expect(err.message).toBe('Не удалось открыть папку: нет прав на эту папку');
    expect(err.cause).toBe(original);
  });
});
```

- [ ] **Step 7: Причины ошибок файлов**

`src/main/fs/fs-errors.ts`:

```ts
// Системные ошибки файлов → понятная причина по-русски. Код и подробности остаются в журнале.
const REASONS: Record<string, string> = {
  EACCES: 'нет прав на эту папку',
  EPERM: 'нет прав на эту папку',
  ENOSPC: 'на диске закончилось место',
  EDQUOT: 'на диске закончилось место',
  EBUSY: 'файл занят другой программой',
  ENOENT: 'папка не найдена',
  ENOTDIR: 'папка не найдена',
  EROFS: 'диск доступен только для чтения',
  EIO: 'ошибка чтения или записи диска',
};

/** «нет прав на эту папку» для EACCES; иначе — текст самой ошибки. */
export function fsErrorReason(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code && REASONS[code]) return REASONS[code];
  return err instanceof Error ? err.message : String(err);
}

/** Ошибка для показа человеку: «Не удалось открыть папку: нет прав на эту папку». */
export function humanFsError(action: string, err: unknown): Error {
  return new Error(`${action}: ${fsErrorReason(err)}`, { cause: err });
}
```

- [ ] **Step 8: Тесты библиотеки**

`src/main/library/library.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import {
  audioDir,
  createMeeting,
  listMeetings,
  meetingDir,
  readMeeting,
  removeMeetingDir,
  saveMeeting,
  updateMeeting,
} from './library';
import { makeTempDir } from '../../test-support/temp-dir';

const tempLibrary = () => join(makeTempDir('textmeet-lib-'), 'library');
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

  it('removes the half-created folder when creation fails', async () => {
    const lib = tempLibrary();
    await expect(
      createMeeting(lib, { source: 'recording', status: 'recording', title: '   ', now: at, randomSuffix: suffixes('a1b2c3') }),
    ).rejects.toThrow();
    expect(existsSync(join(lib, '2026-09-25_1430_a1b2c3'))).toBe(false);
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
    expect(list[0]).toMatchObject({ kind: 'ok', mixReady: false });
    expect(list[1]).toEqual({ kind: 'creating', id: '2026-09-23_1200_dddddd' });
    expect(list[2]).toMatchObject({ kind: 'broken', id: '2026-09-22_1200_cccccc' });
  });

  it('reports whether the listening mix is ready', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recorded', now: at });
    writeFileSync(join(audioDir(lib, meeting.id), 'mix.opus'), 'x');
    expect(await listMeetings(lib)).toEqual([{ kind: 'ok', meeting, mixReady: true }]);
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

describe('updateMeeting', () => {
  it('keeps fields written by a newer version of the app', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    const file = join(meetingDir(lib, meeting.id), 'meeting.json');
    writeFileSync(file, JSON.stringify({ ...meeting, futureField: { keep: true } }));

    const updated = await updateMeeting(lib, meeting.id, (m) => ({ ...m, status: 'recorded' }));

    expect(updated.status).toBe('recorded');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ status: 'recorded', futureField: { keep: true } });
  });

  it('applies concurrent changes of one meeting in order without losing any', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await Promise.all([
      updateMeeting(lib, meeting.id, (m) => ({ ...m, title: 'Планёрка' })),
      updateMeeting(lib, meeting.id, (m) => ({ ...m, durationSec: 90 })),
      updateMeeting(lib, meeting.id, (m) => ({ ...m, participantsHint: 3 })),
    ]);
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ title: 'Планёрка', durationSec: 90, participantsHint: 3 });
  });

  it('reports a failed change and keeps serving the next ones', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await expect(updateMeeting(lib, meeting.id, (m) => ({ ...m, title: '' }))).rejects.toThrow();
    await expect(updateMeeting(lib, meeting.id, (m) => ({ ...m, title: 'Ок' }))).resolves.toMatchObject({ title: 'Ок' });
  });
});

describe('removeMeetingDir', () => {
  it('removes the meeting folder and refuses bad ids', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await removeMeetingDir(lib, meeting.id);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
    await expect(removeMeetingDir(lib, '..')).rejects.toThrow(RangeError);
  });
});
```

- [ ] **Step 9: Запустить — новые тесты падают**

Run: `npx vitest run src/main/library/library.test.ts`
Expected: FAIL — нет `audioDir`, `removeMeetingDir`, `updateMeeting`; в списке нет `creating` и `mixReady`.

- [ ] **Step 10: Библиотека**

`src/main/library/library.ts`:

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import {
  entryId,
  MEETING_ID_PATTERN,
  MeetingSchema,
  type Meeting,
  type MeetingListEntry,
  type MeetingSource,
  type MeetingStatus,
} from '../../shared/meeting';
import { MIX_FILE } from '../../shared/recording';
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

export function audioDir(libraryDir: string, id: string): string {
  return join(meetingDir(libraryDir, id), AUDIO_DIR);
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
    try {
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
    } catch (err) {
      // Не оставляем полусозданную папку: в списке она висела бы «создаётся» навсегда.
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }
}

/** Удаляет папку встречи целиком (например, запись не началась — в ней ничего нет). */
export async function removeMeetingDir(libraryDir: string, id: string): Promise<void> {
  await fsp.rm(meetingDir(libraryDir, id), { recursive: true, force: true });
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

// Одну встречу могут менять почти одновременно (конец записи, сведение, ответ в окне «Запись остановлена»):
// изменения одной встречи выполняются строго по очереди, чтобы ни одно не потерялось.
const updateQueues = new Map<string, Promise<unknown>>();

/** Прочитать → изменить → записать; незнакомые поля meeting.json сохраняются. */
export function updateMeeting(
  libraryDir: string,
  id: string,
  change: (meeting: Meeting) => Meeting,
): Promise<Meeting> {
  const key = meetingDir(libraryDir, id);
  const previous = updateQueues.get(key) ?? Promise.resolve();
  const run = previous.then(async () => {
    const next = change(await readMeeting(libraryDir, id));
    await saveMeeting(libraryDir, next);
    return MeetingSchema.parse(next);
  });
  const settled = run.catch(() => undefined);
  updateQueues.set(key, settled);
  void settled.then(() => {
    if (updateQueues.get(key) === settled) updateQueues.delete(key);
  });
  return run;
}

/** Все встречи библиотеки, новые сверху. Повреждённые не роняют список, а помечаются. */
export async function listMeetings(libraryDir: string): Promise<MeetingListEntry[]> {
  await fsp.mkdir(libraryDir, { recursive: true });
  const dirents = await fsp.readdir(libraryDir, { withFileTypes: true });
  const ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
  const entries = await Promise.all(ids.map((id) => readEntry(libraryDir, id)));
  return entries.sort((a, b) => entryId(b).localeCompare(entryId(a)));
}

async function fileExists(file: string): Promise<boolean> {
  return fsp.access(file).then(
    () => true,
    () => false,
  );
}

async function readEntry(libraryDir: string, id: string): Promise<MeetingListEntry> {
  try {
    const result = await readJsonFile(join(libraryDir, id, MEETING_FILE), MeetingSchema);
    if (!result.ok) {
      if (result.reason === 'missing') return { kind: 'creating', id };
      return { kind: 'broken', id, reason: result.message };
    }
    if (result.value.id !== id) {
      return { kind: 'broken', id, reason: `id в meeting.json (${result.value.id}) не совпадает с именем папки` };
    }
    const mixReady = await fileExists(join(libraryDir, id, AUDIO_DIR, MIX_FILE));
    return { kind: 'ok', meeting: result.value, mixReady };
  } catch (err) {
    return { kind: 'broken', id, reason: (err as Error).message };
  }
}
```

- [ ] **Step 11: Все тесты и типы**

Run: `npx vitest run src/shared src/main/fs src/main/library`
Expected: PASS.

Run: `npm run typecheck`
Expected: без ошибок (старые экраны окна продолжают собираться: запись `creating` показывается там как повреждённая —
окно переделывается в Task 13).

- [ ] **Step 12: Коммит**

```bash
git add src/shared src/main/fs src/main/library
git commit -m "feat: add recording fields, safe meeting updates and readable file errors"
```

---

### Task 3: Горячая клавиша — правила

Разбор нажатия в формат Electron, правила (уточнение спецификации §3.1: нужен Ctrl/Alt/Win(Cmd) или одна клавиша
F1–F24; Shift с буквой — нельзя) и показ человеку. Модуль без Electron и DOM: им пользуются и main, и окно настроек.

**Files:**
- Create: `src/shared/hotkey.ts`, `src/shared/hotkey.test.ts`

- [ ] **Step 1: Тест**

`src/shared/hotkey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  checkAccelerator,
  defaultHotkey,
  formatHotkey,
  hotkeyFromKey,
  keyName,
  needsModifierMessage,
  shiftOnlyMessage,
  UNSUPPORTED_KEY_MESSAGE,
  type KeyInput,
} from './hotkey';

const key = (code: string, mods: Partial<Omit<KeyInput, 'code'>> = {}): KeyInput => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('defaultHotkey', () => {
  it('is Ctrl+Space on Windows and Option+Space on macOS', () => {
    expect(defaultHotkey('win32')).toBe('Control+Space');
    expect(defaultHotkey('darwin')).toBe('Alt+Space');
    expect(defaultHotkey('linux')).toBe('Control+Space');
  });
});

describe('keyName', () => {
  it.each([
    ['KeyR', 'R'],
    ['Digit7', '7'],
    ['Numpad3', 'num3'],
    ['F1', 'F1'],
    ['F24', 'F24'],
    ['Space', 'Space'],
    ['NumpadEnter', 'Enter'],
    ['ArrowUp', 'Up'],
    ['PageDown', 'PageDown'],
  ])('%s → %s', (code, name) => {
    expect(keyName(code)).toBe(name);
  });

  it.each(['F25', 'Minus', 'CapsLock', 'IntlBackslash', 'MediaPlayPause'])('does not support %s', (code) => {
    expect(keyName(code)).toBeNull();
  });
});

describe('hotkeyFromKey', () => {
  it('waits while only modifiers are held', () => {
    expect(hotkeyFromKey(key('ControlLeft', { ctrlKey: true }), 'win32')).toEqual({ kind: 'pending' });
    expect(hotkeyFromKey(key('MetaRight', { metaKey: true }), 'darwin')).toEqual({ kind: 'pending' });
  });

  it('cancels on a bare Escape', () => {
    expect(hotkeyFromKey(key('Escape'), 'win32')).toEqual({ kind: 'cancel' });
  });

  it('builds accelerators with modifiers in a fixed order', () => {
    expect(hotkeyFromKey(key('Space', { ctrlKey: true }), 'win32')).toEqual({
      kind: 'ok',
      accelerator: 'Control+Space',
    });
    expect(hotkeyFromKey(key('KeyR', { shiftKey: true, altKey: true, ctrlKey: true }), 'win32')).toEqual({
      kind: 'ok',
      accelerator: 'Control+Alt+Shift+R',
    });
  });

  it('maps the Win key to Super and the Mac Command key to Command', () => {
    expect(hotkeyFromKey(key('KeyM', { metaKey: true }), 'win32')).toEqual({ kind: 'ok', accelerator: 'Super+M' });
    expect(hotkeyFromKey(key('KeyM', { metaKey: true }), 'darwin')).toEqual({ kind: 'ok', accelerator: 'Command+M' });
  });

  it('accepts a function key alone or with Shift', () => {
    expect(hotkeyFromKey(key('F9'), 'win32')).toEqual({ kind: 'ok', accelerator: 'F9' });
    expect(hotkeyFromKey(key('F9', { shiftKey: true }), 'win32')).toEqual({ kind: 'ok', accelerator: 'Shift+F9' });
  });

  it.each(['KeyR', 'Digit1', 'Space', 'Enter', 'Tab', 'Escape'])('rejects %s without a modifier', (code) => {
    // Escape с Shift — тоже не отмена, а отказ по правилу.
    const input = code === 'Escape' ? key(code, { shiftKey: true }) : key(code);
    const result = hotkeyFromKey(input, 'win32');
    expect(result.kind).toBe('rejected');
  });

  it('explains why a single key is not allowed, in platform words', () => {
    expect(hotkeyFromKey(key('KeyR'), 'win32')).toEqual({ kind: 'rejected', message: needsModifierMessage('win32') });
    expect(needsModifierMessage('win32')).toContain('Ctrl, Alt или Win');
    expect(needsModifierMessage('darwin')).toContain('Control, Option или Command');
  });

  it('rejects Shift with a letter — it is just a capital letter', () => {
    expect(hotkeyFromKey(key('KeyR', { shiftKey: true }), 'win32')).toEqual({
      kind: 'rejected',
      message: shiftOnlyMessage('win32'),
    });
  });

  it('rejects keys it cannot register', () => {
    expect(hotkeyFromKey(key('Minus', { ctrlKey: true }), 'win32')).toEqual({
      kind: 'rejected',
      message: UNSUPPORTED_KEY_MESSAGE,
    });
  });
});

describe('checkAccelerator', () => {
  it.each(['Control+Space', 'Alt+Space', 'Control+Alt+Shift+R', 'F12', 'Shift+F3', 'Super+num5', 'Command+Up'])(
    'accepts %s',
    (accelerator) => {
      expect(checkAccelerator(accelerator, 'win32')).toEqual({ ok: true });
    },
  );

  it.each([
    ['R', needsModifierMessage('win32')],
    ['Shift+R', shiftOnlyMessage('win32')],
    ['Control+Plus', UNSUPPORTED_KEY_MESSAGE],
    ['Ctrl+Space', UNSUPPORTED_KEY_MESSAGE],
    ['Control+Control+Space', UNSUPPORTED_KEY_MESSAGE],
    ['', UNSUPPORTED_KEY_MESSAGE],
  ])('rejects %s', (accelerator, message) => {
    expect(checkAccelerator(accelerator, 'win32')).toEqual({ ok: false, message });
  });
});

describe('formatHotkey', () => {
  it('shows Windows combinations with plus signs', () => {
    expect(formatHotkey('Control+Space', 'win32')).toBe('Ctrl+Space');
    expect(formatHotkey('Control+Alt+Shift+Super+R', 'win32')).toBe('Ctrl+Alt+Shift+Win+R');
    expect(formatHotkey('F9', 'win32')).toBe('F9');
    expect(formatHotkey('Control+num4', 'win32')).toBe('Ctrl+Num 4');
  });

  it('shows Mac combinations with symbols', () => {
    expect(formatHotkey('Alt+Space', 'darwin')).toBe('⌥ Space');
    expect(formatHotkey('Control+Alt+Shift+Command+Up', 'darwin')).toBe('⌃⌥⇧⌘ ↑');
    expect(formatHotkey('F5', 'darwin')).toBe('F5');
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/shared/hotkey.test.ts`
Expected: FAIL — `Failed to resolve import "./hotkey"`.

- [ ] **Step 3: Код**

`src/shared/hotkey.ts`:

```ts
// Горячая клавиша записи: разбор нажатия в формат Electron (accelerator), правила и показ человеку.
// Здесь нет ни Electron, ни DOM: модуль нужен и main (проверка), и окну настроек (ввод).

export const DEFAULT_HOTKEY_WINDOWS = 'Control+Space';
export const DEFAULT_HOTKEY_MAC = 'Alt+Space';

export function defaultHotkey(platform: string): string {
  return platform === 'darwin' ? DEFAULT_HOTKEY_MAC : DEFAULT_HOTKEY_WINDOWS;
}

/** Нужные поля KeyboardEvent. */
export interface KeyInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type HotkeyResult =
  /** Пока нажаты только модификаторы — ждём клавишу. */
  | { kind: 'pending' }
  /** Esc без модификаторов — отмена ввода. */
  | { kind: 'cancel' }
  | { kind: 'ok'; accelerator: string }
  | { kind: 'rejected'; message: string };

type Modifier = 'Control' | 'Alt' | 'Shift' | 'Super' | 'Command';
const MODIFIER_ORDER: readonly Modifier[] = ['Control', 'Alt', 'Shift', 'Super', 'Command'];
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};
const NAMED_KEY_NAMES = new Set(Object.values(NAMED_KEYS));

const isFunctionKey = (key: string): boolean => /^F([1-9]|1\d|2[0-4])$/.test(key);

/** KeyboardEvent.code → имя клавиши в accelerator; null — клавиша не поддерживается. */
export function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] ?? null;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1] ?? null;
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `num${numpad[1]}`;
  if (isFunctionKey(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

function isSupportedKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key) || /^num\d$/.test(key) || isFunctionKey(key) || NAMED_KEY_NAMES.has(key);
}

const isMac = (platform: string): boolean => platform === 'darwin';

function modifierWords(platform: string): string {
  return isMac(platform) ? 'Control, Option или Command' : 'Ctrl, Alt или Win';
}

export function needsModifierMessage(platform: string): string {
  return (
    `Одну клавишу без ${modifierWords(platform)} назначить нельзя — она мешала бы печатать. ` +
    `Подойдёт ${modifierWords(platform)} вместе с клавишей или одна из F1–F24.`
  );
}

export function shiftOnlyMessage(platform: string): string {
  return (
    'Shift с клавишей — это просто заглавная буква или знак, печатать их станет нельзя. ' +
    `Добавьте ${modifierWords(platform)}.`
  );
}

export const UNSUPPORTED_KEY_MESSAGE = 'Эту клавишу назначить нельзя. Подойдут буквы, цифры, пробел, стрелки и F1–F24.';

/** Проверка правил для уже разобранной комбинации. */
function checkRules(modifiers: ReadonlySet<Modifier>, key: string, platform: string): string | null {
  if (isFunctionKey(key)) return null;
  const hasStrong = modifiers.has('Control') || modifiers.has('Alt') || modifiers.has('Super') || modifiers.has('Command');
  if (hasStrong) return null;
  return modifiers.has('Shift') ? shiftOnlyMessage(platform) : needsModifierMessage(platform);
}

function buildAccelerator(modifiers: ReadonlySet<Modifier>, key: string): string {
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), key].join('+');
}

/** Нажатие в поле «Горячая клавиша» → accelerator или объяснение, почему нельзя. */
export function hotkeyFromKey(input: KeyInput, platform: string): HotkeyResult {
  if (MODIFIER_CODES.has(input.code)) return { kind: 'pending' };
  const modifiers = new Set<Modifier>();
  if (input.ctrlKey) modifiers.add('Control');
  if (input.altKey) modifiers.add('Alt');
  if (input.shiftKey) modifiers.add('Shift');
  if (input.metaKey) modifiers.add(isMac(platform) ? 'Command' : 'Super');
  if (input.code === 'Escape' && modifiers.size === 0) return { kind: 'cancel' };

  const key = keyName(input.code);
  if (key === null) return { kind: 'rejected', message: UNSUPPORTED_KEY_MESSAGE };
  const problem = checkRules(modifiers, key, platform);
  if (problem) return { kind: 'rejected', message: problem };
  return { kind: 'ok', accelerator: buildAccelerator(modifiers, key) };
}

/** Проверка значения, пришедшего из окна или из settings.json. */
export function checkAccelerator(accelerator: string, platform: string): { ok: true } | { ok: false; message: string } {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    if (!(MODIFIER_ORDER as readonly string[]).includes(part) || modifiers.has(part as Modifier)) {
      return { ok: false, message: UNSUPPORTED_KEY_MESSAGE };
    }
    modifiers.add(part as Modifier);
  }
  if (!isSupportedKey(key)) return { ok: false, message: UNSUPPORTED_KEY_MESSAGE };
  const problem = checkRules(modifiers, key, platform);
  return problem ? { ok: false, message: problem } : { ok: true };
}

const WINDOWS_MODIFIER_LABELS: Record<Modifier, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Super: 'Win',
  Command: 'Win',
};
const MAC_MODIFIER_LABELS: Record<Modifier, string> = {
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Super: '⌘',
  Command: '⌘',
};
const KEY_LABELS: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' };

function keyLabel(key: string): string {
  const numpad = /^num(\d)$/.exec(key);
  if (numpad) return `Num ${numpad[1]}`;
  return KEY_LABELS[key] ?? key;
}

/** «Control+Space» → «Ctrl+Space» (Windows) или «⌃ Space» (Mac). */
export function formatHotkey(accelerator: string, platform: string): string {
  const parts = accelerator.split('+');
  const key = keyLabel(parts.pop() ?? '');
  const modifiers = parts.map((p) => {
    const labels = isMac(platform) ? MAC_MODIFIER_LABELS : WINDOWS_MODIFIER_LABELS;
    return labels[p as Modifier] ?? p;
  });
  if (isMac(platform)) return modifiers.length > 0 ? `${modifiers.join('')} ${key}` : key;
  return [...modifiers, key].join('+');
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/shared/hotkey.test.ts`
Expected: PASS, тестов: 44.

- [ ] **Step 5: Коммит**

```bash
git add src/shared/hotkey.ts src/shared/hotkey.test.ts
git commit -m "feat: parse, check and display the recording hotkey"
```

---

### Task 4: Тексты для человека

Все тексты, которые показывает main: уведомления (лист 8 макета), системные окна «Мало места на диске» и
«Идёт запись», причины отказа микрофона и звука компьютера, адреса разделов системных настроек.

**Files:**
- Create: `src/main/texts.ts`, `src/main/texts.test.ts`

- [ ] **Step 1: Тест**

`src/main/texts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dialogTexts,
  MIC_ACCESS_DENIED,
  micProblem,
  notificationTexts,
  systemAudioProblem,
  systemSettingsUrl,
} from './texts';

describe('notificationTexts', () => {
  it('builds the recording notifications', () => {
    expect(notificationTexts.started('Ctrl+Space')).toEqual({
      title: 'Запись началась',
      body: 'Ctrl+Space — остановить.',
      silent: true,
    });
    expect(notificationTexts.stopped(60).silent).toBe(true);
    expect(notificationTexts.stillRecording('F9').silent).toBeUndefined();
    expect(notificationTexts.stopped(42 * 60 + 15).title).toBe('Запись остановлена · 42 мин');
    expect(notificationTexts.stillRecording('⌥ Space').body).toContain('нажмите ⌥ Space');
    expect(notificationTexts.lowDisk(0.5 * 1024 ** 3).body).toBe('Осталось 0,5 ГБ. Запись продолжается.');
    expect(notificationTexts.hotkeyBusy('Ctrl+Space').body).toMatch(/^Ctrl\+Space уже использует/);
    expect(notificationTexts.stoppedByDisk('на диске закончилось место').body).toContain('на диске закончилось место');
    expect(notificationTexts.startFailed(MIC_ACCESS_DENIED).body).toBe(MIC_ACCESS_DENIED.message);
  });

  it('counts recovered recordings', () => {
    expect(notificationTexts.recovered(1).body).toMatch(/^Прошлая запись/);
    expect(notificationTexts.recovered(3).body).toContain('(3)');
  });

  it('has texts for an interrupted recording and a lost microphone', () => {
    expect(notificationTexts.interrupted().title).toBe('Запись прервалась');
    expect(notificationTexts.micEnded().body).toContain('Микрофон отключился');
  });
});

describe('dialogTexts', () => {
  it('asks before recording with little disk space', () => {
    const text = dialogTexts.lowDisk(0.8 * 1024 ** 3);
    expect(text.message).toBe('Мало места на диске');
    expect(text.detail).toContain('Свободно 0,8 ГБ');
    expect(text.buttons).toEqual(['Отмена', 'Всё равно начать']);
  });

  it('asks before quitting during a recording', () => {
    expect(dialogTexts.quitWhileRecording().buttons).toEqual(['Продолжить запись', 'Остановить и выйти']);
  });
});

describe('micProblem', () => {
  it.each(['NotAllowedError', 'SecurityError', 'PermissionDeniedError'])('%s means no access', (name) => {
    expect(micProblem({ name, message: '' })).toBe(MIC_ACCESS_DENIED);
  });

  it.each([
    ['NotFoundError', 'Микрофон не найден'],
    ['OverconstrainedError', 'Микрофон не найден'],
    ['NotReadableError', 'Микрофон занят'],
    ['AbortError', 'Микрофон занят'],
  ])('%s → %s', (name, start) => {
    const problem = micProblem({ name, message: 'raw' });
    expect(problem.message.startsWith(start)).toBe(true);
    expect(problem.settings).toBeNull();
  });

  it('falls back to the original message', () => {
    expect(micProblem({ name: 'TypeError', message: 'странно' }).message).toBe('Не удалось начать запись: странно');
    expect(micProblem({ name: 'TypeError', message: '' }).message).toBe('Не удалось начать запись: TypeError');
  });
});

describe('systemAudioProblem', () => {
  it('points to the macOS permission when access is refused', () => {
    expect(systemAudioProblem({ name: 'NotAllowedError', message: '' }, 'darwin')).toContain('Запись системного звука');
    expect(systemAudioProblem({ name: 'AbortError', message: '' }, 'darwin')).toContain('Запись системного звука');
  });

  it('explains a busy device and other failures; the microphone keeps recording', () => {
    expect(systemAudioProblem({ name: 'NotReadableError', message: '' }, 'win32')).toContain('устройство занято');
    const other = systemAudioProblem({ name: 'AbortError', message: '' }, 'win32');
    expect(other).toContain('(AbortError)');
    expect(other).toContain('Микрофон записывается как обычно.');
  });
});

describe('systemSettingsUrl', () => {
  it('opens the right settings page on each system', () => {
    expect(systemSettingsUrl('microphone', 'win32')).toBe('ms-settings:privacy-microphone');
    expect(systemSettingsUrl('system-audio', 'win32')).toBe('ms-settings:sound');
    expect(systemSettingsUrl('microphone', 'darwin')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    );
    expect(systemSettingsUrl('system-audio', 'darwin')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/main/texts.test.ts`
Expected: FAIL — `Failed to resolve import "./texts"`.

- [ ] **Step 3: Код**

`src/main/texts.ts`:

```ts
// Тексты для человека, которые показывает main: уведомления, системные окна, причины ошибок записи.
import { formatBytes, formatDurationShort } from '../shared/format';
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';

export interface NotificationText {
  title: string;
  body: string;
  /** Без системного звука: у старта и стопа свой сигнал. */
  silent?: boolean;
}

export const notificationTexts = {
  started: (hotkey: string): NotificationText => ({
    title: 'Запись началась',
    body: `${hotkey} — остановить.`,
    silent: true,
  }),
  stopped: (durationSec: number): NotificationText => ({
    title: `Запись остановлена · ${formatDurationShort(durationSec)}`,
    body: 'Окно TextMeet открыто: укажите, сколько было участников.',
    silent: true,
  }),
  stillRecording: (hotkey: string): NotificationText => ({
    title: 'Запись всё ещё идёт',
    body: `Уже 10 минут не слышно ни микрофона, ни звука компьютера. Если встреча закончилась, нажмите ${hotkey}.`,
  }),
  lowDisk: (freeBytes: number): NotificationText => ({
    title: 'Мало места на диске',
    body: `Осталось ${formatBytes(freeBytes)}. Запись продолжается.`,
  }),
  hotkeyBusy: (hotkey: string): NotificationText => ({
    title: 'Горячая клавиша занята',
    body: `${hotkey} уже использует другая программа. Начать запись можно из окна или меню в трее, сменить клавишу — в настройках.`,
  }),
  recovered: (count: number): NotificationText => ({
    title: 'Запись восстановлена',
    body:
      count === 1
        ? 'Прошлая запись прервалась из-за сбоя. Записанное сохранено — встреча уже в списке.'
        : `Прошлые записи прервались из-за сбоя (${count}). Записанное сохранено — встречи уже в списке.`,
  }),
  interrupted: (): NotificationText => ({
    title: 'Запись прервалась',
    body: 'Окно записи закрылось из-за сбоя. Записанное сохранено — встреча уже в списке.',
  }),
  startFailed: (problem: StartProblem): NotificationText => ({ title: 'Запись не началась', body: problem.message }),
  stoppedByDisk: (reason: string): NotificationText => ({
    title: 'Запись остановлена',
    body: `Не удалось записать на диск: ${reason}. Записанное до этого сохранено.`,
  }),
  micEnded: (): NotificationText => ({
    title: 'Запись остановлена',
    body: 'Микрофон отключился, а звук компьютера не записывался. Записанное сохранено.',
  }),
};

export interface DialogText {
  title: string;
  message: string;
  detail: string;
  /** Кнопки слева направо; последняя — действие по умолчанию. */
  buttons: [string, string];
}

export const dialogTexts = {
  lowDisk: (freeBytes: number): DialogText => ({
    title: 'TextMeet',
    message: 'Мало места на диске',
    detail: `Свободно ${formatBytes(freeBytes)}. Долгая запись может не поместиться — освободите место или выберите другую папку библиотеки в настройках.`,
    buttons: ['Отмена', 'Всё равно начать'],
  }),
  quitWhileRecording: (): DialogText => ({
    title: 'TextMeet',
    message: 'Идёт запись',
    detail: 'Если выйти, запись остановится и сохранится в библиотеке.',
    buttons: ['Продолжить запись', 'Остановить и выйти'],
  }),
};

export const RECORDER_NOT_READY: StartProblem = {
  message: 'Запись ещё не готова — подождите пару секунд и попробуйте снова.',
  settings: null,
};
export const RECORDER_TIMEOUT: StartProblem = {
  message: 'Окно записи не ответило. Попробуйте ещё раз.',
  settings: null,
};
export const MIC_ACCESS_DENIED: StartProblem = {
  message: 'Нет доступа к микрофону. Разрешите TextMeet пользоваться микрофоном в настройках системы.',
  settings: 'microphone',
};

/** Почему не удалось включить микрофон (по имени DOMException из getUserMedia). */
export function micProblem(failure: MediaFailure): StartProblem {
  switch (failure.name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return MIC_ACCESS_DENIED;
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return {
        message: 'Микрофон не найден. Подключите микрофон или выберите другой в настройках TextMeet.',
        settings: null,
      };
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return {
        message: 'Микрофон занят другой программой или не отвечает. Закройте её и попробуйте снова.',
        settings: null,
      };
    default:
      return { message: `Не удалось начать запись: ${failure.message || failure.name}`, settings: null };
  }
}

/** Почему не удалось подключиться к звуку компьютера (getDisplayMedia). */
export function systemAudioProblem(failure: MediaFailure, platform: string): string {
  const tail = 'Микрофон записывается как обычно.';
  if (platform === 'darwin' && (failure.name === 'NotAllowedError' || failure.name === 'AbortError')) {
    return `Нет разрешения «Запись системного звука» — разрешите его TextMeet в настройках системы. ${tail}`;
  }
  if (failure.name === 'NotReadableError') {
    return `Не удалось подключиться к звуку компьютера: устройство занято или не поддерживается. ${tail}`;
  }
  return `Не удалось подключиться к звуку компьютера (${failure.name}). ${tail}`;
}

/** Адрес раздела системных настроек, который открывает кнопка «Открыть настройки системы». */
export function systemSettingsUrl(kind: SystemSettingsKind, platform: string): string {
  if (platform === 'darwin') {
    const pane = kind === 'microphone' ? 'Privacy_Microphone' : 'Privacy_ScreenCapture';
    return `x-apple.systempreferences:com.apple.preference.security?${pane}`;
  }
  return kind === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:sound';
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/main/texts.test.ts`
Expected: PASS, тестов: 16.

- [ ] **Step 5: Коммит**

```bash
git add src/main/texts.ts src/main/texts.test.ts
git commit -m "feat: add notification, dialog and error texts for recording"
```

---

### Task 5: Горячая клавиша — регистрация

Обёртка над `globalShortcut`: регистрация при запуске (неправильная сохранённая — стандартная), замена с откатом на
прежнюю, пауза на время ввода новой комбинации (занятость проверяется и во время паузы).

**Files:**
- Create: `src/main/hotkey-manager.ts`, `src/main/hotkey-manager.test.ts`

- [ ] **Step 1: Тест**

`src/main/hotkey-manager.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { needsModifierMessage } from '../shared/hotkey';
import { HotkeyManager, type ShortcutRegistry } from './hotkey-manager';

/** Поддельный globalShortcut: taken — комбинации, занятые «другими программами». */
function fakeRegistry(taken: string[] = []) {
  const active = new Map<string, () => void>();
  const registry: ShortcutRegistry = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (taken.includes(accelerator) || active.has(accelerator)) return false;
      active.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => {
      active.delete(accelerator);
    }),
  };
  return { registry, active, press: (accelerator: string) => active.get(accelerator)?.() };
}

describe('HotkeyManager', () => {
  it('registers the default combination for the platform', () => {
    const { registry, active } = fakeRegistry();
    const onPress = vi.fn();
    const manager = new HotkeyManager(registry, 'win32', onPress);

    expect(manager.init(null)).toEqual({ invalid: false });

    expect([...active.keys()]).toEqual(['Control+Space']);
    expect(manager.label).toBe('Ctrl+Space');
    expect(manager.isDefault).toBe(true);
    expect(manager.busy).toBe(false);
  });

  it('calls back when the combination is pressed', () => {
    const { registry, press } = fakeRegistry();
    const onPress = vi.fn();
    new HotkeyManager(registry, 'darwin', onPress).init(null);
    press('Alt+Space');
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('uses the saved combination', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init('Control+Alt+R');
    expect([...active.keys()]).toEqual(['Control+Alt+R']);
    expect(manager.isDefault).toBe(false);
  });

  it('falls back to the default when the saved value breaks the rules', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    expect(manager.init('R')).toEqual({ invalid: true });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('reports a combination taken by another program', () => {
    const { registry } = fakeRegistry(['Alt+Space']);
    const manager = new HotkeyManager(registry, 'darwin', vi.fn());
    manager.init(null);
    expect(manager.busy).toBe(true);
    expect(manager.label).toBe('⌥ Space');
  });

  it('treats an exception from Electron as a failed registration', () => {
    const registry: ShortcutRegistry = {
      register: () => {
        throw new Error('bad accelerator');
      },
      unregister: vi.fn(),
    };
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    expect(manager.busy).toBe(true);
  });

  it('switches to a new combination', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);

    expect(manager.change('Control+Shift+F9')).toEqual({ ok: true });

    expect([...active.keys()]).toEqual(['Control+Shift+F9']);
    expect(manager.accelerator).toBe('Control+Shift+F9');
  });

  it('keeps the old combination when the new one is taken', () => {
    const { registry, active } = fakeRegistry(['Control+Shift+R']);
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);

    expect(manager.change('Control+Shift+R')).toEqual({
      ok: false,
      message: 'Ctrl+Shift+R занята другой программой. Осталась прежняя: Ctrl+Space.',
    });

    expect([...active.keys()]).toEqual(['Control+Space']);
    expect(manager.accelerator).toBe('Control+Space');
    expect(manager.busy).toBe(false);
  });

  it('refuses combinations that break the rules without touching the current one', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    expect(manager.change('R')).toEqual({ ok: false, message: needsModifierMessage('win32') });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('resets to the default with null', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init('F9');
    expect(manager.change(null)).toEqual({ ok: true });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('retries registering the same combination when it was busy', () => {
    const taken = ['Control+Space'];
    const { registry, active } = fakeRegistry(taken);
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    taken.length = 0; // другая программа закрылась
    expect(manager.change('Control+Space')).toEqual({ ok: true });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('releases the combination while a new one is being typed and restores it afterwards', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);

    manager.suspend(true);
    expect(active.size).toBe(0);
    expect(manager.busy).toBe(false);

    manager.suspend(false);
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('saves a change made while suspended and registers it on resume', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    manager.suspend(true);
    expect(manager.change('F8')).toEqual({ ok: true });
    expect(active.size).toBe(0);
    manager.suspend(false);
    expect([...active.keys()]).toEqual(['F8']);
  });

  it('detects a taken combination even while suspended and keeps the old one', () => {
    const { registry, active } = fakeRegistry(['Control+Shift+R']);
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    manager.suspend(true);

    expect(manager.change('Control+Shift+R')).toMatchObject({ ok: false });
    expect(active.size).toBe(0);
    expect(manager.accelerator).toBe('Control+Space');

    manager.suspend(false);
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('ignores repeated suspend calls and releases everything on dispose', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    manager.suspend(false);
    expect(registry.register).toHaveBeenCalledTimes(1);
    manager.dispose();
    expect(active.size).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/main/hotkey-manager.test.ts`
Expected: FAIL — `Failed to resolve import "./hotkey-manager"`.

- [ ] **Step 3: Код**

`src/main/hotkey-manager.ts`:

```ts
import { checkAccelerator, defaultHotkey, formatHotkey } from '../shared/hotkey';

/** То, что нужно от Electron globalShortcut (подменяется в тестах). */
export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export type HotkeyChangeResult = { ok: true } | { ok: false; message: string };

/**
 * Глобальная горячая клавиша записи: регистрация при запуске, замена с откатом на прежнюю,
 * временное снятие, пока в настройках вводят новую комбинацию.
 */
export class HotkeyManager {
  private current: string;
  private registered = false;
  private suspended = false;

  constructor(
    private readonly registry: ShortcutRegistry,
    private readonly platform: string,
    private readonly onPress: () => void,
  ) {
    this.current = defaultHotkey(platform);
  }

  /** Регистрирует сохранённую комбинацию; неправильная сохранённая заменяется стандартной (invalid: true). */
  init(saved: string | null): { invalid: boolean } {
    const invalid = saved !== null && !checkAccelerator(saved, this.platform).ok;
    this.current = saved === null || invalid ? defaultHotkey(this.platform) : saved;
    this.registered = this.tryRegister(this.current);
    return { invalid };
  }

  get accelerator(): string {
    return this.current;
  }

  get label(): string {
    return formatHotkey(this.current, this.platform);
  }

  get isDefault(): boolean {
    return this.current === defaultHotkey(this.platform);
  }

  /** Не удалось зарегистрировать — комбинацию держит другая программа. Во время паузы не считается. */
  get busy(): boolean {
    return !this.suspended && !this.registered;
  }

  /** Новая комбинация (null — стандартная). Не вышло — остаётся прежняя. */
  change(next: string | null): HotkeyChangeResult {
    const target = next ?? defaultHotkey(this.platform);
    const check = checkAccelerator(target, this.platform);
    if (!check.ok) return check;
    if (target === this.current && this.registered) return { ok: true };

    const previous = this.current;
    this.release();
    // Пробуем зарегистрировать и во время паузы: так сразу видно, что комбинацию держит другая программа.
    if (this.tryRegister(target)) {
      this.current = target;
      this.registered = true;
      if (this.suspended) this.release();
      return { ok: true };
    }
    this.registered = !this.suspended && this.tryRegister(previous);
    return {
      ok: false,
      message: `${formatHotkey(target, this.platform)} занята другой программой. Осталась прежняя: ${formatHotkey(previous, this.platform)}.`,
    };
  }

  /** Пока пользователь вводит новую комбинацию, действующая не должна срабатывать. */
  suspend(suspended: boolean): void {
    if (suspended === this.suspended) return;
    this.suspended = suspended;
    if (suspended) this.release();
    else this.registered = this.tryRegister(this.current);
  }

  dispose(): void {
    this.release();
  }

  private release(): void {
    if (!this.registered) return;
    this.registry.unregister(this.current);
    this.registered = false;
  }

  private tryRegister(accelerator: string): boolean {
    try {
      return this.registry.register(accelerator, this.onPress);
    } catch {
      // Electron бросает исключение на комбинациях, которые не умеет разобрать.
      return false;
    }
  }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/main/hotkey-manager.test.ts`
Expected: PASS, тестов: 15.

- [ ] **Step 5: Коммит**

```bash
git add src/main/hotkey-manager.ts src/main/hotkey-manager.test.ts
git commit -m "feat: register the recording hotkey with rollback and pause"
```

---

### Task 6: Дорожки на диске и проверки во время записи

Файлы дорожек: куски дописываются по очереди, первая ошибка диска сообщается один раз. Проверки: тишина 10 минут
на обеих дорожках, «звук компьютера ровно 0 с начала записи дольше 10 с», мало места во время записи.

**Files:**
- Create: `src/main/recording/track-files.ts`, `src/main/recording/track-files.test.ts`,
  `src/main/recording/monitors.ts`, `src/main/recording/monitors.test.ts`

- [ ] **Step 1: Тесты**

`src/main/recording/track-files.test.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { openTrackFiles } from './track-files';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('openTrackFiles', () => {
  it('writes chunks of each track in order', async () => {
    const dir = makeTempDir();
    const files = await openTrackFiles(dir, ['mic', 'system'], vi.fn());

    files.append('mic', bytes(1, 2));
    files.append('system', bytes(9));
    files.append('mic', bytes(3));
    await files.close();

    expect([...readFileSync(join(dir, 'mic.webm'))]).toEqual([1, 2, 3]);
    expect([...readFileSync(join(dir, 'system.webm'))]).toEqual([9]);
    expect(files.bytesWritten('mic')).toBe(3);
  });

  it('starts every file from scratch', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'mic.webm'), 'old');
    const files = await openTrackFiles(dir, ['mic'], vi.fn());
    await files.close();
    expect(readFileSync(join(dir, 'mic.webm')).length).toBe(0);
  });

  it('ignores chunks of tracks it did not open and chunks after closing', async () => {
    const dir = makeTempDir();
    const files = await openTrackFiles(dir, ['mic'], vi.fn());
    files.append('system', bytes(1));
    await files.close();
    files.append('mic', bytes(1));
    await files.close();
    expect(existsSync(join(dir, 'system.webm'))).toBe(false);
    expect(files.bytesWritten('system')).toBe(0);
    expect(readFileSync(join(dir, 'mic.webm')).length).toBe(0);
  });

  it('reports the first write error once and stops writing', async () => {
    const error = Object.assign(new Error('no space'), { code: 'ENOSPC' });
    const write = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const files = await openTrackFiles('dir', ['mic'], onError, async () => ({ write, close: async () => undefined }));

    files.append('mic', bytes(1));
    files.append('mic', bytes(2));
    await files.close();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    expect(write).toHaveBeenCalledOnce();
    expect(files.bytesWritten('mic')).toBe(0);
  });

  it('reports a failure to close a file', async () => {
    const error = new Error('close failed');
    const onError = vi.fn();
    const files = await openTrackFiles('dir', ['mic'], onError, async () => ({
      write: async () => undefined,
      close: async () => {
        throw error;
      },
    }));
    await files.close();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('closes the files it already opened when opening another one fails', async () => {
    const close = vi.fn(async () => undefined);
    let calls = 0;
    const open = async () => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      return { write: async () => undefined, close };
    };
    await expect(openTrackFiles('dir', ['mic', 'system'], vi.fn(), open)).rejects.toMatchObject({ code: 'EBUSY' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails to open when the folder is missing', async () => {
    const dir = join(makeTempDir(), 'нет');
    await expect(openTrackFiles(dir, ['mic', 'system'], vi.fn())).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
```

`src/main/recording/monitors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import {
  freeDiskBytes,
  LOW_DISK_DURING_BYTES,
  LowDiskWatch,
  SILENCE_PEAK,
  SILENCE_REMINDER_MS,
  SilenceWatch,
  SYSTEM_SILENT_AFTER_MS,
  SystemSilenceWatch,
} from './monitors';

const quiet = { mic: SILENCE_PEAK / 2, system: 0 };
const loud = { mic: 0.3, system: 0 };

describe('SilenceWatch', () => {
  it('reminds once after 10 minutes of silence on both tracks', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS - 1, quiet)).toBe(false);
    expect(watch.update(SILENCE_REMINDER_MS, quiet)).toBe(true);
    expect(watch.update(SILENCE_REMINDER_MS * 3, quiet)).toBe(false);
  });

  it('counts sound on the computer track as sound', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS, { mic: 0, system: 0.2 })).toBe(false);
  });

  it('starts over after sound and reminds again after a new silence', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS, quiet)).toBe(true);
    expect(watch.update(SILENCE_REMINDER_MS + 1000, loud)).toBe(false);
    expect(watch.update(2 * SILENCE_REMINDER_MS, quiet)).toBe(false);
    expect(watch.update(2 * SILENCE_REMINDER_MS + 1000, quiet)).toBe(true);
  });

  it('works without a computer track', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS, { mic: 0, system: null })).toBe(true);
  });
});

describe('SystemSilenceWatch', () => {
  it('warns when the computer track is exactly 0 for 10 s from the start', () => {
    const watch = new SystemSilenceWatch(1000);
    expect(watch.update(1000 + SYSTEM_SILENT_AFTER_MS - 1, 0)).toBe(false);
    expect(watch.update(1000 + SYSTEM_SILENT_AFTER_MS, 0)).toBe(true);
  });

  it('stops warning for good once any sound was heard', () => {
    const watch = new SystemSilenceWatch(0);
    expect(watch.update(SYSTEM_SILENT_AFTER_MS, 0)).toBe(true);
    expect(watch.update(SYSTEM_SILENT_AFTER_MS + 100, 0.0001)).toBe(false);
    expect(watch.update(SYSTEM_SILENT_AFTER_MS * 10, 0)).toBe(false);
  });

  it('ignores recordings without a computer track', () => {
    expect(new SystemSilenceWatch(0).update(SYSTEM_SILENT_AFTER_MS * 2, null)).toBe(false);
  });
});

describe('LowDiskWatch', () => {
  it('warns once when free space drops below the limit', () => {
    const watch = new LowDiskWatch();
    expect(watch.update(LOW_DISK_DURING_BYTES)).toBe(false);
    expect(watch.update(LOW_DISK_DURING_BYTES - 1)).toBe(true);
    expect(watch.update(1)).toBe(false);
  });
});

describe('freeDiskBytes', () => {
  it('returns a positive number of bytes for an existing folder', async () => {
    expect(await freeDiskBytes(makeTempDir())).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Запустить — падают**

Run: `npx vitest run src/main/recording`
Expected: FAIL — `Failed to resolve import "./track-files"` и `"./monitors"`.

- [ ] **Step 3: Код**

`src/main/recording/track-files.ts`:

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { TrackKind } from '../../shared/meeting';
import { TRACK_FILES } from '../../shared/recording';

export interface TrackFiles {
  /** Дописывает кусок дорожки. Не бросает: первая ошибка записи уходит в onError, дальше куски не пишутся. */
  append(kind: TrackKind, data: Uint8Array): void;
  /** Дожидается записи всех кусков и закрывает файлы. Повторный вызов ничего не делает. */
  close(): Promise<void>;
  /** Сколько байт дорожки уже записано на диск. */
  bytesWritten(kind: TrackKind): number;
}

/** Нужное от открытого файла (FileHandle); подменяется в тестах. */
export interface TrackHandle {
  write(data: Uint8Array): Promise<unknown>;
  close(): Promise<void>;
}

export type OpenTrackFile = (file: string) => Promise<TrackHandle>;

const openForWriting: OpenTrackFile = (file) => fsp.open(file, 'w');

interface OpenTrack {
  handle: TrackHandle;
  queue: Promise<void>;
  bytes: number;
}

/** Открывает (создаёт заново) файлы дорожек в папке audio/ встречи. */
export async function openTrackFiles(
  dir: string,
  kinds: readonly TrackKind[],
  onError: (err: unknown) => void,
  open: OpenTrackFile = openForWriting,
): Promise<TrackFiles> {
  const tracks = new Map<TrackKind, OpenTrack>();
  try {
    for (const kind of kinds) {
      tracks.set(kind, { handle: await open(join(dir, TRACK_FILES[kind])), queue: Promise.resolve(), bytes: 0 });
    }
  } catch (err) {
    await Promise.all([...tracks.values()].map((t) => t.handle.close().catch(() => undefined)));
    throw err;
  }

  let failed = false;
  let closing: Promise<void> | null = null;
  const fail = (err: unknown): void => {
    if (failed) return;
    failed = true;
    onError(err);
  };

  return {
    append(kind, data) {
      const track = tracks.get(kind);
      if (!track || failed || closing) return;
      track.queue = track.queue.then(async () => {
        if (failed) return;
        try {
          await track.handle.write(data);
          track.bytes += data.byteLength;
        } catch (err) {
          fail(err);
        }
      });
    },
    close() {
      closing ??= (async () => {
        await Promise.all([...tracks.values()].map((t) => t.queue));
        const results = await Promise.allSettled([...tracks.values()].map((t) => t.handle.close()));
        const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (rejected) fail(rejected.reason);
      })();
      return closing;
    },
    bytesWritten: (kind) => tracks.get(kind)?.bytes ?? 0,
  };
}
```

`src/main/recording/monitors.ts`:

```ts
import { promises as fsp } from 'node:fs';
import type { Peaks } from '../../shared/recording';

/** Тише −50 дБ — считаем тишиной. */
export const SILENCE_PEAK = 10 ** (-50 / 20);
export const SILENCE_REMINDER_MS = 10 * 60_000;
export const SYSTEM_SILENT_AFTER_MS = 10_000;
export const LOW_DISK_BEFORE_START_BYTES = 1024 ** 3;
export const LOW_DISK_DURING_BYTES = 500 * 1024 ** 2;
export const DISK_CHECK_INTERVAL_MS = 60_000;

/**
 * Обе дорожки молчат 10 минут подряд → одно напоминание «Запись всё ещё идёт».
 * Следующее — только после того, как звук появится и снова пропадёт на 10 минут.
 */
export class SilenceWatch {
  private quietSince: number;
  private reminded = false;

  constructor(startedAt: number) {
    this.quietSince = startedAt;
  }

  /** true — пора напомнить. */
  update(now: number, peaks: Peaks): boolean {
    const loud = peaks.mic >= SILENCE_PEAK || (peaks.system ?? 0) >= SILENCE_PEAK;
    if (loud) {
      this.quietSince = now;
      this.reminded = false;
      return false;
    }
    if (this.reminded || now - this.quietSince < SILENCE_REMINDER_MS) return false;
    this.reminded = true;
    return true;
  }
}

/**
 * Звук компьютера с начала записи ровно 0 дольше 10 с (на Mac так выглядит отозванное разрешение).
 * Проверяется только «с начала»: на Windows тишина посреди созвона — тоже ровный 0.
 */
export class SystemSilenceWatch {
  private heard = false;

  constructor(private readonly startedAt: number) {}

  /** true — показывать предупреждение «Звук компьютера пока не слышен». */
  update(now: number, systemPeak: number | null): boolean {
    if (this.heard || systemPeak === null) return false;
    if (systemPeak > 0) {
      this.heard = true;
      return false;
    }
    return now - this.startedAt >= SYSTEM_SILENT_AFTER_MS;
  }
}

/** Мало места во время записи → одно уведомление за запись. */
export class LowDiskWatch {
  private warned = false;

  /** true — пора предупредить. */
  update(freeBytes: number): boolean {
    if (this.warned || freeBytes >= LOW_DISK_DURING_BYTES) return false;
    this.warned = true;
    return true;
  }
}

/** Свободное место на диске, где лежит папка (байт, доступных программе). */
export async function freeDiskBytes(dir: string): Promise<number> {
  const stats = await fsp.statfs(dir);
  return stats.bavail * stats.bsize;
}
```

- [ ] **Step 4: Запустить — проходят**

Run: `npx vitest run src/main/recording`
Expected: PASS, тестов: 16.

- [ ] **Step 5: Коммит**

```bash
git add src/main/recording
git commit -m "feat: write track chunks to disk and watch silence and free space"
```

---

### Task 7: ffmpeg и сведение `mix.opus`

Путь к ffmpeg (в установленной программе — из `app.asar.unpacked`), запуск с пониженным приоритетом и разбором
длительности, аргументы сведения (сдвиг дорожек, моно Opus 48 кбит/с), очередь сведения по одной встрече.
Тесты гоняют настоящий ffmpeg из `ffmpeg-static` на тоне, созданном тем же ffmpeg.

**Files:**
- Create: `src/main/audio/ffmpeg.ts`, `src/main/audio/ffmpeg.test.ts`, `src/main/audio/mixer.ts`, `src/main/audio/mixer.test.ts`
- Modify: `electron-builder.yml`

- [ ] **Step 1: Тест запуска ffmpeg**

`src/main/audio/ffmpeg.test.ts`:

```ts
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { parseProgressDuration, resolveFfmpegPath, runFfmpeg } from './ffmpeg';

describe('resolveFfmpegPath', () => {
  it('points inside app.asar.unpacked in the installed app', () => {
    const packed = ['C:', 'TextMeet', 'resources', 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'].join(sep);
    expect(resolveFfmpegPath(packed)).toBe(packed.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`));
  });

  it('keeps a development path as is', () => {
    const dev = ['D:', 'TextMeet', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'].join(sep);
    expect(resolveFfmpegPath(dev)).toBe(dev);
  });

  it('fails clearly when there is no binary for this system', () => {
    expect(() => resolveFfmpegPath(null)).toThrow('ffmpeg для этой системы не найден');
  });

  it('finds the bundled binary', () => {
    expect(resolveFfmpegPath()).toContain('ffmpeg');
  });
});

describe('parseProgressDuration', () => {
  it('takes the last out_time_us value', () => {
    const progress = 'out_time_us=1000000\nprogress=continue\nout_time_us=5000500\nprogress=end\n';
    expect(parseProgressDuration(progress)).toBeCloseTo(5.0005, 6);
  });

  it('returns null when ffmpeg reported no time', () => {
    expect(parseProgressDuration('out_time_us=N/A\nprogress=end\n')).toBeNull();
    expect(parseProgressDuration('')).toBeNull();
  });
});

describe('runFfmpeg', () => {
  it('runs ffmpeg and reports the output duration', async () => {
    const out = join(makeTempDir(), 'tone.opus');
    const run = await runFfmpeg(resolveFfmpegPath(), [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:a',
      'libopus',
      '-f',
      'ogg',
      out,
    ]);
    expect(run.durationSec).toBeCloseTo(2, 1);
  });

  it('rejects with the tail of the ffmpeg log', async () => {
    await expect(runFfmpeg(resolveFfmpegPath(), ['-i', join(makeTempDir(), 'нет.webm'), '-f', 'null', '-'])).rejects.toThrow(
      /ffmpeg завершился с кодом \d+: .+/,
    );
  });

  it('rejects when the binary cannot be started', async () => {
    await expect(runFfmpeg(join(makeTempDir(), 'no-ffmpeg.exe'), [])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/main/audio/ffmpeg.test.ts`
Expected: FAIL — `Failed to resolve import "./ffmpeg"`.

- [ ] **Step 3: Код**

`src/main/audio/ffmpeg.ts`:

```ts
import { spawn } from 'node:child_process';
import { constants as osConstants, setPriority } from 'node:os';
import { sep } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

/**
 * Путь к ffmpeg из пакета ffmpeg-static. В установленной программе пакет лежит внутри app.asar,
 * а запускать можно только распакованную копию (electron-builder: asarUnpack).
 */
export function resolveFfmpegPath(raw: string | null = ffmpegStatic): string {
  if (!raw) throw new Error('ffmpeg для этой системы не найден');
  return raw.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}

/** Длительность обработанного звука из вывода `-progress` (последнее out_time_us), секунды. */
export function parseProgressDuration(progress: string): number | null {
  const matches = [...progress.matchAll(/^out_time_us=(\d+)$/gm)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? null : Number(last) / 1_000_000;
}

const TAIL_CHARS = 4096;
const keepTail = (text: string): string => text.slice(-TAIL_CHARS);

export interface FfmpegRun {
  /** Сколько секунд звука записано в результат; null — ffmpeg не сообщил. */
  durationSec: number | null;
}

/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[]): Promise<FfmpegRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (child.pid !== undefined) {
      try {
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Не удалось понизить приоритет — не страшно.
      }
    }
    let progress = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      progress = keepTail(progress + chunk);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = keepTail(errors + chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ durationSec: parseProgressDuration(progress) });
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${errors.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/main/audio/ffmpeg.test.ts`
Expected: PASS, тестов: 9.

- [ ] **Step 5: Тест сведения**

`src/main/audio/mixer.test.ts`:

```ts
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { resolveFfmpegPath, runFfmpeg } from './ffmpeg';
import { existingInputs, meetingsNeedingMix, mixArgs, Mixer, mixMeeting } from './mixer';

const fakeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });

/** Дорожка WebM/Opus с тоном нужной длины, как её пишет MediaRecorder. */
async function toneTrack(file: string, seconds: number, channels: 1 | 2): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-ac',
    String(channels),
    '-c:a',
    'libopus',
    '-f',
    'webm',
    file,
  ]);
}

async function recordedMeeting(lib: string, tracks: Meeting['tracks'], durationSec: number | null = null) {
  const meeting = await createMeeting(lib, { source: 'recording', status: 'recording' });
  return updateMeeting(lib, meeting.id, (m) => ({ ...m, status: 'recorded', tracks, durationSec }));
}

describe('mixArgs', () => {
  it('delays each track by its offset and mixes them into mono Opus', () => {
    const args = mixArgs(
      [
        { file: 'mic.webm', offsetMs: 0 },
        { file: 'system.webm', offsetMs: 35.4 },
      ],
      'mix.opus.part',
    );
    expect(args.slice(0, 4)).toEqual(['-i', 'mic.webm', '-i', 'system.webm']);
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('[0:a:0]aresample=48000,aformat=channel_layouts=mono,adelay=delays=0:all=1[a0]');
    expect(filter).toContain('adelay=delays=35:all=1[a1]');
    expect(filter).toContain('[a0][a1]amix=inputs=2:duration=longest:normalize=0[m]');
    expect(args.slice(-9)).toEqual(['-ac', '1', '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg', 'mix.opus.part']);
  });

  it('passes a single track through', () => {
    const filter = mixArgs([{ file: 'mic.webm', offsetMs: 0 }], 'out')[3];
    expect(filter).toBe('[0:a:0]aresample=48000,aformat=channel_layouts=mono,adelay=delays=0:all=1[a0];[a0]anull[m]');
  });

  it('refuses to mix nothing', () => {
    expect(() => mixArgs([], 'out')).toThrow(RangeError);
  });
});

describe('existingInputs', () => {
  it('skips missing and empty track files', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'mic.webm'), 'x');
    writeFileSync(join(dir, 'system.webm'), '');
    const inputs = await existingInputs(dir, [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 10 },
    ]);
    expect(inputs).toEqual([{ file: join(dir, 'mic.webm'), offsetMs: 0 }]);
  });
});

describe('mixMeeting', () => {
  it('mixes both tracks, respecting the offset, and fills a missing duration', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 1500 },
    ]);
    const dir = audioDir(lib, meeting.id);
    await toneTrack(join(dir, 'mic.webm'), 2, 1);
    await toneTrack(join(dir, 'system.webm'), 2, 2);

    await mixMeeting(lib, meeting.id, resolveFfmpegPath());

    expect(readdirSync(dir).sort()).toEqual(['mic.webm', 'mix.opus', 'system.webm']);
    expect((await readMeeting(lib, meeting.id)).durationSec).toBeCloseTo(3.5, 1);
  });

  it('keeps a known duration', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }], 99);
    await toneTrack(join(audioDir(lib, meeting.id), 'mic.webm'), 1, 1);
    await mixMeeting(lib, meeting.id, resolveFfmpegPath());
    expect((await readMeeting(lib, meeting.id)).durationSec).toBe(99);
  });

  it('fails without tracks and leaves no partial file behind', async () => {
    const lib = makeTempDir();
    const noTracks = await recordedMeeting(lib, []);
    await expect(mixMeeting(lib, noTracks.id, resolveFfmpegPath())).rejects.toThrow('нет записанных дорожек');

    const broken = await recordedMeeting(lib, [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }]);
    writeFileSync(join(audioDir(lib, broken.id), 'mic.webm'), 'не звук');
    await expect(mixMeeting(lib, broken.id, resolveFfmpegPath())).rejects.toThrow(/ffmpeg/);
    expect(existsSync(join(audioDir(lib, broken.id), 'mix.opus.part'))).toBe(false);
  });
});

describe('meetingsNeedingMix', () => {
  const meeting = (id: string, patch: Partial<Meeting>): Meeting =>
    ({ id, status: 'recorded', tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }], ...patch }) as Meeting;

  it('picks finished recordings with tracks and without a mix', () => {
    const entries: MeetingListEntry[] = [
      { kind: 'ok', meeting: meeting('a', {}), mixReady: false },
      { kind: 'ok', meeting: meeting('b', {}), mixReady: true },
      { kind: 'ok', meeting: meeting('c', { status: 'recording' }), mixReady: false },
      { kind: 'ok', meeting: meeting('d', { tracks: [] }), mixReady: false },
      { kind: 'ok', meeting: meeting('e', { status: 'error' }), mixReady: false },
      { kind: 'broken', id: 'f', reason: 'x' },
      { kind: 'creating', id: 'g' },
    ];
    expect(meetingsNeedingMix(entries)).toEqual(['a', 'e']);
  });
});

describe('Mixer', () => {
  it('mixes queued meetings one by one without duplicates', async () => {
    const order: string[] = [];
    const onMixed = vi.fn();
    const mixer = new Mixer({
      libraryDir: () => 'lib',
      ffmpegPath: () => 'ffmpeg',
      logger: fakeLogger(),
      onMixed,
      mix: async (_lib, id) => {
        order.push(id);
      },
    });
    mixer.enqueue('a');
    mixer.enqueue('b');
    mixer.enqueue('b');
    await mixer.whenIdle();
    expect(order).toEqual(['a', 'b']);
    expect(onMixed).toHaveBeenCalledTimes(2);
  });

  it('logs a failure and goes on with the next meeting', async () => {
    const logger = fakeLogger();
    const onMixed = vi.fn();
    const mixer = new Mixer({
      libraryDir: () => 'lib',
      ffmpegPath: () => 'ffmpeg',
      logger,
      onMixed,
      mix: async (_lib, id) => {
        if (id === 'bad') throw new Error('boom');
      },
    });
    mixer.enqueue('bad');
    mixer.enqueue('good');
    await mixer.whenIdle();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(onMixed).toHaveBeenCalledWith('good');
    await expect(new Mixer({ libraryDir: () => '', ffmpegPath: () => '', logger, onMixed }).whenIdle()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Запустить — падает**

Run: `npx vitest run src/main/audio/mixer.test.ts`
Expected: FAIL — `Failed to resolve import "./mixer"`.

- [ ] **Step 7: Код**

`src/main/audio/mixer.ts`:

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { MeetingListEntry, Track } from '../../shared/meeting';
import { MIX_FILE } from '../../shared/recording';
import { audioDir, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { runFfmpeg } from './ffmpeg';

export interface MixInput {
  file: string;
  /** Сдвиг начала дорожки, мс. */
  offsetMs: number;
}

/** Аргументы ffmpeg: дорожки со сдвигами → моно Ogg Opus 48 кбит/с. */
export function mixArgs(inputs: readonly MixInput[], output: string): string[] {
  if (inputs.length === 0) throw new RangeError('Нечего сводить: нет дорожек');
  const args = inputs.flatMap((input) => ['-i', input.file]);
  const prepared = inputs.map(
    (input, i) =>
      `[${i}:a:0]aresample=48000,aformat=channel_layouts=mono,adelay=delays=${Math.round(input.offsetMs)}:all=1[a${i}]`,
  );
  const mix =
    inputs.length === 1
      ? '[a0]anull[m]'
      : `${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0[m]`;
  return [
    ...args,
    '-filter_complex',
    [...prepared, mix].join(';'),
    '-map',
    '[m]',
    '-ac',
    '1',
    '-c:a',
    'libopus',
    '-b:a',
    '48k',
    '-f',
    'ogg',
    output,
  ];
}

async function nonEmpty(file: string): Promise<boolean> {
  return fsp.stat(file).then(
    (stats) => stats.isFile() && stats.size > 0,
    () => false,
  );
}

/** Какие дорожки есть на диске и не пустые. */
export async function existingInputs(dir: string, tracks: readonly Track[]): Promise<MixInput[]> {
  const inputs: MixInput[] = [];
  for (const track of tracks) {
    const file = join(dir, track.file);
    if (await nonEmpty(file)) inputs.push({ file, offsetMs: track.startOffsetMs });
  }
  return inputs;
}

/** Сводит дорожки встречи в audio/mix.opus; длительность записывает, если её ещё нет (восстановленная запись). */
export async function mixMeeting(libraryDir: string, meetingId: string, ffmpegPath: string): Promise<void> {
  const meeting = await readMeeting(libraryDir, meetingId);
  const dir = audioDir(libraryDir, meetingId);
  const inputs = await existingInputs(dir, meeting.tracks);
  if (inputs.length === 0) throw new Error('нет записанных дорожек');
  const part = join(dir, `${MIX_FILE}.part`);
  try {
    const { durationSec } = await runFfmpeg(ffmpegPath, mixArgs(inputs, part));
    await fsp.rename(part, join(dir, MIX_FILE));
    if (meeting.durationSec === null && durationSec !== null) {
      await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, durationSec: m.durationSec ?? durationSec }));
    }
  } catch (err) {
    await fsp.rm(part, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** Встречи, которым нужно сведение: есть дорожки, нет mix.opus, запись закончена. */
export function meetingsNeedingMix(entries: readonly MeetingListEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'ok' && !entry.mixReady && entry.meeting.status !== 'recording' && entry.meeting.tracks.length > 0
      ? [entry.meeting.id]
      : [],
  );
}

export interface MixerDeps {
  libraryDir(): string;
  ffmpegPath(): string;
  logger: Logger;
  /** Сведение готово — список встреч надо обновить. */
  onMixed(meetingId: string): void;
  mix?: typeof mixMeeting;
}

/** Очередь сведения: по одной встрече за раз, повторы в очереди не дублируются. */
export class Mixer {
  private readonly queue: string[] = [];
  private running: Promise<void> | null = null;

  constructor(private readonly deps: MixerDeps) {}

  enqueue(meetingId: string): void {
    if (!this.queue.includes(meetingId)) this.queue.push(meetingId);
    this.running ??= this.drain();
  }

  /** Дождаться, пока очередь опустеет (для тестов и выхода). */
  whenIdle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async drain(): Promise<void> {
    const mix = this.deps.mix ?? mixMeeting;
    for (let id = this.queue.shift(); id !== undefined; id = this.queue.shift()) {
      try {
        await mix(this.deps.libraryDir(), id, this.deps.ffmpegPath());
        this.deps.logger.info(`Сведение готово: ${id}`);
        this.deps.onMixed(id);
      } catch (err) {
        this.deps.logger.error(`Не удалось свести дорожки встречи ${id}`, err);
      }
    }
    this.running = null;
  }
}
```

- [ ] **Step 8: Запустить — проходит**

Run: `npx vitest run src/main/audio`
Expected: PASS, тестов: 19.

- [ ] **Step 9: ffmpeg вне архива программы**

Запускать ffmpeg можно только из распакованной копии. Итоговый `electron-builder.yml`:

`electron-builder.yml`:

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
# ffmpeg — отдельная программа: запускать её можно только из распакованной копии, не из app.asar.
asarUnpack:
  - node_modules/ffmpeg-static/**
```

- [ ] **Step 10: Коммит**

```bash
git add src/main/audio electron-builder.yml
git commit -m "feat: mix recorded tracks into mix.opus with ffmpeg"
```

---

### Task 8: Восстановление после сбоя

Встреча со статусом «идёт запись», которую программа не ведёт, — прерванная запись: «записано» с пометкой
«восстановлена после сбоя» (дорожки берутся из `meeting.json` или с диска), а если звука нет — «ошибка».
Та же функция закрывает запись при падении окна записи.

**Files:**
- Create: `src/main/recording/recovery.ts`, `src/main/recording/recovery.test.ts`

- [ ] **Step 1: Тест**

`src/main/recording/recovery.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MeetingStatus, Track } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { finalizeInterrupted, INTERRUPTED_WITHOUT_AUDIO, recoverInterruptedRecordings } from './recovery';

const fakeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });
const mic: Track = { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 };
const system: Track = { kind: 'system', file: 'system.webm', startOffsetMs: 40 };

async function meetingWith(lib: string, status: MeetingStatus, tracks: Track[], files: Record<string, string>) {
  const created = await createMeeting(lib, { source: 'recording', status });
  const meeting = await updateMeeting(lib, created.id, (m) => ({ ...m, tracks }));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(audioDir(lib, meeting.id), name), content);
  return meeting;
}

describe('finalizeInterrupted', () => {
  it('marks a recording with audio as recorded and recovered, keeping its tracks', async () => {
    const lib = makeTempDir();
    const meeting = await meetingWith(lib, 'recording', [mic, system], { 'mic.webm': 'x', 'system.webm': 'y' });

    const result = await finalizeInterrupted(lib, meeting.id);

    expect(result).toMatchObject({ status: 'recorded', recovered: true, tracks: [mic, system], durationSec: null });
    expect(await readMeeting(lib, meeting.id)).toEqual(result);
  });

  it('finds track files when the crash came before they were saved in meeting.json', async () => {
    const lib = makeTempDir();
    const meeting = await meetingWith(lib, 'recording', [], { 'mic.webm': 'x', 'system.webm': '' });
    const result = await finalizeInterrupted(lib, meeting.id);
    expect(result.tracks).toEqual([
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 0 },
    ]);
    expect(result.status).toBe('recorded');
  });

  it('marks a recording without any audio as an error', async () => {
    const lib = makeTempDir();
    const meeting = await meetingWith(lib, 'recording', [mic], { 'mic.webm': '' });
    expect(await finalizeInterrupted(lib, meeting.id)).toMatchObject({
      status: 'error',
      recovered: true,
      errorMessage: INTERRUPTED_WITHOUT_AUDIO,
    });
  });
});

describe('recoverInterruptedRecordings', () => {
  it('finalizes only meetings left in the recording state', async () => {
    const lib = makeTempDir();
    const interrupted = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    const finished = await meetingWith(lib, 'recorded', [mic], { 'mic.webm': 'x' });
    const logger = fakeLogger();

    const recovered = await recoverInterruptedRecordings(lib, logger);

    expect(recovered.map((m) => m.id)).toEqual([interrupted.id]);
    expect((await readMeeting(lib, finished.id)).recovered).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('leaves alone the recording that is going on right now', async () => {
    const lib = makeTempDir();
    const active = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    const recovered = await recoverInterruptedRecordings(lib, fakeLogger(), (id) => id === active.id);
    expect(recovered).toEqual([]);
    expect((await readMeeting(lib, active.id)).status).toBe('recording');
  });

  it('skips meetings it cannot read', async () => {
    const lib = makeTempDir();
    const good = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    const bad = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    // Слишком длинное имя спикера: файл не проходит проверку и в списке считается повреждённым.
    const file = join(lib, bad.id, 'meeting.json');
    writeFileSync(file, JSON.stringify({ ...bad, speakerNames: { S1: 'x'.repeat(101) } }));
    const logger = fakeLogger();

    const recovered = await recoverInterruptedRecordings(lib, logger);

    expect(recovered.map((m) => m.id)).toEqual([good.id]);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/main/recording/recovery.test.ts`
Expected: FAIL — `Failed to resolve import "./recovery"`.

- [ ] **Step 3: Код**

`src/main/recording/recovery.ts`:

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting, Track, TrackKind } from '../../shared/meeting';
import { TRACK_FILES } from '../../shared/recording';
import { existingInputs } from '../audio/mixer';
import { audioDir, listMeetings, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';

export const INTERRUPTED_WITHOUT_AUDIO = 'Запись прервалась, звук не сохранился.';

const KINDS: readonly TrackKind[] = ['mic', 'system'];

/** Дорожки по файлам на диске — если сбой случился раньше, чем их записали в meeting.json. */
async function tracksOnDisk(dir: string): Promise<Track[]> {
  const tracks: Track[] = [];
  for (const kind of KINDS) {
    const exists = await fsp.access(join(dir, TRACK_FILES[kind])).then(
      () => true,
      () => false,
    );
    if (exists) tracks.push({ kind, file: TRACK_FILES[kind], startOffsetMs: 0 });
  }
  return tracks;
}

/**
 * Закрывает прерванную запись: «записано» с пометкой «восстановлена после сбоя»,
 * а если звука не осталось — «ошибка». Длительность заполнит сведение (mixer).
 */
export async function finalizeInterrupted(libraryDir: string, meetingId: string): Promise<Meeting> {
  const meeting = await readMeeting(libraryDir, meetingId);
  const dir = audioDir(libraryDir, meetingId);
  const tracks = meeting.tracks.length > 0 ? meeting.tracks : await tracksOnDisk(dir);
  const hasAudio = (await existingInputs(dir, tracks)).length > 0;
  return updateMeeting(libraryDir, meetingId, (m) =>
    hasAudio
      ? { ...m, status: 'recorded', recovered: true, tracks }
      : { ...m, status: 'error', recovered: true, tracks, errorMessage: INTERRUPTED_WITHOUT_AUDIO },
  );
}

/**
 * При запуске: встречи в статусе «идёт запись» — это записи, прерванные сбоем.
 * isActive — запись, которую программа ведёт прямо сейчас (её могли начать клавишей сразу после запуска).
 */
export async function recoverInterruptedRecordings(
  libraryDir: string,
  logger: Logger,
  isActive: (meetingId: string) => boolean = () => false,
): Promise<Meeting[]> {
  const entries = await listMeetings(libraryDir);
  const recovered: Meeting[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'ok' || entry.meeting.status !== 'recording' || isActive(entry.meeting.id)) continue;
    try {
      recovered.push(await finalizeInterrupted(libraryDir, entry.meeting.id));
      logger.warn(`Восстановлена прерванная запись ${entry.meeting.id}`);
    } catch (err) {
      logger.error(`Не удалось восстановить запись ${entry.meeting.id}`, err);
    }
  }
  return recovered;
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/main/recording/recovery.test.ts`
Expected: PASS, тестов: 6.

- [ ] **Step 5: Коммит**

```bash
git add src/main/recording/recovery.ts src/main/recording/recovery.test.ts
git commit -m "feat: recover recordings interrupted by a crash"
```

---

### Task 9: Автомат записи

Сердце Плана 2: `idle → starting → recording → stopping → idle`. Старт (готовность окна записи, место на диске,
доступ к микрофону на Mac, создание встречи, сигнал, команда окну записи, ожидание ответа до 60 с), приём кусков
(в том числе пришедших до открытия файлов), пики и проверки, отказ микрофона и звука компьютера, потеря дорожки,
ошибка диска, стоп (ожидание последних кусков до 10 с, длительность, сведение, окно «Запись остановлена»), падение окна
записи, остановка перед выходом. Переключатель «Звук компьютера» после каждой записи снова включён.
Без Electron: всё внешнее приходит через `ControllerDeps`.

**Files:**
- Create: `src/main/recording/controller.ts`, `src/main/recording/controller.test.ts`

- [ ] **Step 1: Тест**

`src/main/recording/controller.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStartCommand, RecordingState } from '../../shared/recording';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, readMeeting } from '../library/library';
import type { Logger } from '../logger';
import { MIC_ACCESS_DENIED, notificationTexts, RECORDER_NOT_READY, RECORDER_TIMEOUT } from '../texts';
import { RecordingController, type ControllerDeps } from './controller';
import { DISK_CHECK_INTERVAL_MS, LOW_DISK_BEFORE_START_BYTES, SILENCE_REMINDER_MS, SYSTEM_SILENT_AFTER_MS } from './monitors';

const GB = 1024 ** 3;
const fakeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });
const bytes = (...values: number[]) => new Uint8Array(values);

function harness(overrides: Partial<ControllerDeps> = {}) {
  const lib = makeTempDir();
  const clock = { now: 1_700_000_000_000 };
  let ready = true;
  const recorder = {
    isReady: () => ready,
    start: vi.fn<(command: RecorderStartCommand) => void>(),
    stop: vi.fn(),
    playSound: vi.fn(),
  };
  const states: RecordingState[] = [];
  const deps: ControllerDeps = {
    platform: 'win32',
    logger: fakeLogger(),
    recorder,
    now: () => clock.now,
    libraryDir: () => lib,
    settings: () => ({ microphoneId: 'mic-1', recordSounds: true }),
    hotkeyLabel: () => 'Ctrl+Space',
    freeBytes: vi.fn(async () => 50 * GB),
    confirmLowDisk: vi.fn(async () => true),
    ensureMicAccess: vi.fn(async () => true),
    notify: vi.fn(),
    showMainWindow: vi.fn(),
    emitState: (state) => states.push(state),
    emitPeaks: vi.fn(),
    libraryChanged: vi.fn(),
    enqueueMix: vi.fn(),
    timeouts: { startMs: 300, stopMs: 300 },
    ...overrides,
  };
  const controller = new RecordingController(deps);
  const state = () => controller.getState();

  /** Начать и дождаться команды окну записи. */
  async function begin(): Promise<{ command: RecorderStartCommand; starting: Promise<void> }> {
    const starting = controller.toggle();
    await vi.waitFor(() => expect(recorder.start).toHaveBeenCalled());
    const command = recorder.start.mock.calls.at(-1)?.[0] as RecorderStartCommand;
    return { command, starting };
  }

  /** Полный старт: окно записи ответило, что обе (или одна) дорожки пишутся. */
  async function startRecording(system = true) {
    if (!system) controller.setSystemAudioNext(false);
    const { command, starting } = await begin();
    controller.onStarted({
      meetingId: command.meetingId,
      tracks: system
        ? [
            { kind: 'mic', startedAt: 5000 },
            { kind: 'system', startedAt: 5040 },
          ]
        : [{ kind: 'mic', startedAt: 5000 }],
      micLabel: 'Микрофон (Logitech PRO X)',
      systemFailure: null,
    });
    await starting;
    return command;
  }

  async function stopRecording(meetingId: string) {
    const stopping = controller.toggle();
    await vi.waitFor(() => expect(recorder.stop).toHaveBeenCalled());
    controller.onStopped({ meetingId });
    await stopping;
  }

  return {
    lib,
    clock,
    deps,
    recorder,
    controller,
    states,
    state,
    begin,
    startRecording,
    stopRecording,
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RecordingController — normal recording', () => {
  it('records both tracks, stops and asks about participants', async () => {
    const h = harness();

    const command = await h.startRecording();

    expect(command).toEqual({ meetingId: expect.any(String), micDeviceId: 'mic-1', systemAudio: true });
    expect(h.recorder.playSound).toHaveBeenCalledWith('start');
    expect(h.state()).toMatchObject({
      phase: 'recording',
      meetingId: command.meetingId,
      startedAt: h.clock.now,
      system: 'on',
      micLabel: 'Микрофон (Logitech PRO X)',
      freeBytes: 50 * GB,
    });
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.started('Ctrl+Space'), true);
    const recording = await readMeeting(h.lib, command.meetingId);
    expect(recording).toMatchObject({
      status: 'recording',
      tracks: [
        { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
        { kind: 'system', file: 'system.webm', startOffsetMs: 40 },
      ],
    });

    h.controller.onChunk(command.meetingId, 'mic', bytes(1, 2));
    h.controller.onChunk(command.meetingId, 'system', bytes(7));
    h.controller.onChunk(command.meetingId, 'mic', bytes(3));
    h.clock.now += 42_500;
    await h.stopRecording(command.meetingId);

    const dir = audioDir(h.lib, command.meetingId);
    expect([...readFileSync(join(dir, 'mic.webm'))]).toEqual([1, 2, 3]);
    expect([...readFileSync(join(dir, 'system.webm'))]).toEqual([7]);
    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ status: 'recorded', durationSec: 42.5 });
    expect(h.recorder.playSound).toHaveBeenLastCalledWith('stop');
    expect(h.deps.enqueueMix).toHaveBeenCalledWith(command.meetingId);
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.stopped(42.5), true);
    expect(h.deps.showMainWindow).toHaveBeenCalled();
    expect(h.state()).toMatchObject({
      phase: 'idle',
      meetingId: null,
      systemAudioNext: true,
      stopDialog: { meetingId: command.meetingId, title: recording.title, durationSec: 42.5 },
    });
  });

  it('passes through the phases in order', async () => {
    const h = harness();
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    const phases = h.states.map((s) => s.phase).filter((p, i, all) => p !== all[i - 1]);
    expect(phases).toEqual(['starting', 'recording', 'stopping', 'idle']);
  });

  it('records only the microphone when the switch is off, then turns the switch back on', async () => {
    const h = harness();

    const command = await h.startRecording(false);

    expect(command.systemAudio).toBe(false);
    expect(h.state().system).toBe('off');
    await h.stopRecording(command.meetingId);
    expect(readdirSync(audioDir(h.lib, command.meetingId))).toEqual(['mic.webm']);
    expect(h.state().systemAudioNext).toBe(true);
  });

  it('keeps recording the microphone when the computer sound could not be captured', async () => {
    const h = harness();
    const { command, starting } = await h.begin();
    h.controller.onStarted({
      meetingId: command.meetingId,
      tracks: [{ kind: 'mic', startedAt: 1 }],
      micLabel: 'Mic',
      systemFailure: { name: 'NotReadableError', message: 'Could not start audio source' },
    });
    await starting;
    expect(h.state()).toMatchObject({ phase: 'recording', system: 'failed' });
    expect(h.state().systemProblem).toContain('устройство занято');
  });

  it('stays silent when sounds are turned off', async () => {
    const h = harness({ settings: () => ({ microphoneId: null, recordSounds: false }) });
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    expect(h.recorder.playSound).not.toHaveBeenCalled();
  });

  it('keeps chunks that arrive before the track files are open', async () => {
    const h = harness();
    const { command, starting } = await h.begin();
    h.controller.onChunk(command.meetingId, 'mic', bytes(9, 9));
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    await starting;
    await h.stopRecording(command.meetingId);
    expect([...readFileSync(join(audioDir(h.lib, command.meetingId), 'mic.webm'))]).toEqual([9, 9]);
  });

  it('ignores messages about other meetings', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onChunk('other', 'mic', bytes(1));
    h.controller.onPeaks({ meetingId: 'other', mic: 1, system: 1 });
    h.controller.onStopped({ meetingId: 'other' });
    h.controller.onStarted({ meetingId: 'other', tracks: [], micLabel: '', systemFailure: null });
    h.controller.onStartFailed({ meetingId: 'other', failure: { name: 'NotAllowedError', message: '' } });
    h.controller.onTrackEnded({ meetingId: 'other', kind: 'mic' });
    expect(h.deps.emitPeaks).not.toHaveBeenCalled();
    expect(h.state().phase).toBe('recording');
    await h.stopRecording(command.meetingId);
    expect(readFileSync(join(audioDir(h.lib, command.meetingId), 'mic.webm')).length).toBe(0);
  });

  it('ignores toggles while starting', async () => {
    const h = harness();
    const { command, starting } = await h.begin();
    await h.controller.toggle();
    expect(h.recorder.start).toHaveBeenCalledOnce();
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    await starting;
  });
});

describe('RecordingController — start problems', () => {
  it('does not start before the recorder window is ready', async () => {
    const h = harness();
    h.setReady(false);
    await h.controller.toggle();
    expect(h.state()).toMatchObject({ phase: 'idle', startProblem: RECORDER_NOT_READY });
    expect(existsSync(h.lib) ? readdirSync(h.lib) : []).toEqual([]);
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.startFailed(RECORDER_NOT_READY), true);
  });

  it('explains a refused microphone and removes the empty meeting', async () => {
    const h = harness();
    const { command, starting } = await h.begin();
    h.controller.onStartFailed({ meetingId: command.meetingId, failure: { name: 'NotAllowedError', message: 'Permission denied' } });
    await starting;
    expect(h.state()).toMatchObject({ phase: 'idle', meetingId: null, startProblem: MIC_ACCESS_DENIED });
    expect(readdirSync(h.lib)).toEqual([]);
    expect(h.recorder.stop).toHaveBeenCalled();
  });

  it('stops asking macOS when microphone access is denied', async () => {
    const h = harness({ ensureMicAccess: async () => false });
    await h.controller.toggle();
    expect(h.state().startProblem).toBe(MIC_ACCESS_DENIED);
    expect(h.recorder.start).not.toHaveBeenCalled();
  });

  it('gives up when the recorder window does not answer', async () => {
    const h = harness();
    await h.begin();
    await vi.waitFor(() => expect(h.state().startProblem).toBe(RECORDER_TIMEOUT));
    expect(readdirSync(h.lib)).toEqual([]);
  });

  it('asks before recording with little disk space', async () => {
    const confirmLowDisk = vi.fn(async () => false);
    const h = harness({ freeBytes: async () => LOW_DISK_BEFORE_START_BYTES - 1, confirmLowDisk });
    await h.controller.toggle();
    expect(confirmLowDisk).toHaveBeenCalledWith(LOW_DISK_BEFORE_START_BYTES - 1);
    expect(h.state()).toMatchObject({ phase: 'idle', startProblem: null });
    expect(h.recorder.start).not.toHaveBeenCalled();

    confirmLowDisk.mockResolvedValue(true);
    const { command, starting } = await h.begin();
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    await starting;
    expect(h.state().phase).toBe('recording');
  });

  it('explains a library folder it cannot write to', async () => {
    const parent = makeTempDir();
    const file = join(parent, 'library');
    writeFileSync(file, 'не папка');
    const h = harness({ libraryDir: () => file });
    await h.controller.toggle();
    expect(h.state().phase).toBe('idle');
    expect(h.state().startProblem?.message).toMatch(/^Не удалось начать запись: /);
  });

  it('fails the start when the track files cannot be opened', async () => {
    const h = harness({
      openTracks: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    });
    const { command, starting } = await h.begin();
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    await starting;
    expect(h.state().startProblem?.message).toBe('Не удалось начать запись: нет прав на эту папку');
  });

  it('lets the user dismiss the problem', async () => {
    const h = harness();
    h.setReady(false);
    await h.controller.toggle();
    h.controller.dismissStartProblem();
    expect(h.state().startProblem).toBeNull();
  });
});

describe('RecordingController — during a recording', () => {
  it('forwards peaks and reminds about a long silence', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onPeaks({ meetingId: command.meetingId, mic: 0.5, system: 0.1 });
    expect(h.deps.emitPeaks).toHaveBeenCalledWith({ mic: 0.5, system: 0.1 });

    h.clock.now += SILENCE_REMINDER_MS;
    h.controller.onPeaks({ meetingId: command.meetingId, mic: 0, system: 0 });
    h.clock.now += SILENCE_REMINDER_MS;
    h.controller.onPeaks({ meetingId: command.meetingId, mic: 0, system: 0 });
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.stillRecording('Ctrl+Space'));
  });

  it('flags computer sound that stays at exactly 0 from the start', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.clock.now += SYSTEM_SILENT_AFTER_MS;
    h.controller.onPeaks({ meetingId: command.meetingId, mic: 0.2, system: 0 });
    expect(h.state().systemSilent).toBe(true);
    h.controller.onPeaks({ meetingId: command.meetingId, mic: 0.2, system: 0.01 });
    expect(h.state().systemSilent).toBe(false);
  });

  it('marks a lost computer track as failed', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onTrackEnded({ meetingId: command.meetingId, kind: 'system' });
    expect(h.state()).toMatchObject({ phase: 'recording', system: 'failed' });
    expect(h.state().systemProblem).toContain('перестал записываться');
  });

  it('keeps going when the microphone is unplugged but the computer sound is recorded', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onTrackEnded({ meetingId: command.meetingId, kind: 'mic' });
    expect(h.state()).toMatchObject({ phase: 'recording', micEnded: true });
  });

  it('remembers a track that ended while the files were still being opened', async () => {
    const h = harness();
    const { command, starting } = await h.begin();
    h.controller.onTrackEnded({ meetingId: command.meetingId, kind: 'system' });
    expect(h.state().phase).toBe('starting');
    h.controller.onStarted({
      meetingId: command.meetingId,
      tracks: [
        { kind: 'mic', startedAt: 1 },
        { kind: 'system', startedAt: 1 },
      ],
      micLabel: 'Mic',
      systemFailure: null,
    });
    await starting;
    expect(h.state()).toMatchObject({ phase: 'recording', system: 'failed' });
  });

  it('stops when the microphone is unplugged and there is no computer sound', async () => {
    const h = harness();
    const command = await h.startRecording(false);
    h.controller.onTrackEnded({ meetingId: command.meetingId, kind: 'mic' });
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());
    h.controller.onStopped({ meetingId: command.meetingId });
    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.micEnded());
    expect(h.state().stopDialog?.meetingId).toBe(command.meetingId);
  });

  it('stops and keeps what was recorded when the disk fails', async () => {
    let failWrite: (err: unknown) => void = () => undefined;
    const h = harness({
      openTracks: async (_dir, _kinds, onError) => {
        failWrite = onError;
        return { append: vi.fn(), close: async () => undefined, bytesWritten: () => 0 };
      },
    });
    const command = await h.startRecording();
    failWrite(Object.assign(new Error('full'), { code: 'ENOSPC' }));
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());
    h.controller.onStopped({ meetingId: command.meetingId });
    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.stoppedByDisk('на диске закончилось место'));
    expect((await readMeeting(h.lib, command.meetingId)).status).toBe('recorded');
  });

  it('checks free space every minute and warns once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const free = vi.fn(async () => 50 * GB);
    const h = harness({ freeBytes: free });
    const command = await h.startRecording();
    free.mockResolvedValue(100 * 1024 ** 2);
    vi.advanceTimersByTime(DISK_CHECK_INTERVAL_MS);
    await vi.waitFor(() => expect(h.state().freeBytes).toBe(100 * 1024 ** 2));
    vi.advanceTimersByTime(DISK_CHECK_INTERVAL_MS);
    await vi.waitFor(() => expect(free).toHaveBeenCalledTimes(3));
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.lowDisk(100 * 1024 ** 2));
    expect(vi.mocked(h.deps.notify).mock.calls.filter(([text]) => text.title === 'Мало места на диске')).toHaveLength(1);
    await h.stopRecording(command.meetingId);
  });

  it('logs a failed disk check and carries on', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const free = vi.fn(async () => 50 * GB);
    const h = harness({ freeBytes: free });
    const command = await h.startRecording();
    free.mockRejectedValue(new Error('statfs'));
    vi.advanceTimersByTime(DISK_CHECK_INTERVAL_MS);
    await vi.waitFor(() => expect(h.deps.logger.warn).toHaveBeenCalled());
    expect(h.state().phase).toBe('recording');
    await h.stopRecording(command.meetingId);
  });

  it('finishes the stop even if the recorder window never confirms it', async () => {
    const h = harness();
    const command = await h.startRecording();
    await h.controller.toggle();
    expect(h.state().phase).toBe('idle');
    expect((await readMeeting(h.lib, command.meetingId)).status).toBe('recorded');
  });
});

describe('RecordingController — crashes and quitting', () => {
  it('saves the recording as recovered when the recorder window crashes', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onChunk(command.meetingId, 'mic', bytes(1));

    h.controller.onRecorderGone();

    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ status: 'recorded', recovered: true });
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.interrupted());
    expect(h.deps.enqueueMix).toHaveBeenCalledWith(command.meetingId);
    expect(h.state().stopDialog).toBeNull();
  });

  it('marks the recording as recovered when the recorder window crashes while stopping', async () => {
    const h = harness();
    const command = await h.startRecording();
    const stopping = h.controller.toggle();
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());

    h.controller.onRecorderGone();
    await stopping;

    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ status: 'recorded', recovered: true });
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.interrupted());
    expect(h.deps.notify).not.toHaveBeenCalledWith(notificationTexts.stopped(expect.any(Number)), true);
    expect(h.state().stopDialog?.meetingId).toBe(command.meetingId);
  });

  it('fails the start when the recorder window crashes while starting', async () => {
    const h = harness();
    await h.begin();
    h.controller.onRecorderGone();
    await vi.waitFor(() => expect(h.state().startProblem?.message).toContain('Окно записи закрылось'));
  });

  it('does nothing when the recorder window restarts while idle', () => {
    const h = harness();
    h.controller.onRecorderGone();
    expect(h.states).toEqual([]);
  });

  it('stops without questions or sounds before quitting', async () => {
    const h = harness();
    const command = await h.startRecording();
    const quitting = h.controller.stopForQuit();
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());
    h.controller.onStopped({ meetingId: command.meetingId });
    await quitting;
    expect(h.state()).toMatchObject({ phase: 'idle', stopDialog: null });
    expect(h.recorder.playSound).not.toHaveBeenCalledWith('stop');
    expect(h.deps.showMainWindow).not.toHaveBeenCalled();
    expect((await readMeeting(h.lib, command.meetingId)).status).toBe('recorded');
  });

  it('waits for a start in progress before stopping for quit', async () => {
    const h = harness();
    const { command } = await h.begin();
    const quitting = h.controller.stopForQuit();
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());
    h.controller.onStopped({ meetingId: command.meetingId });
    await quitting;
    expect(h.state().phase).toBe('idle');
  });
});

describe('RecordingController — stop dialog', () => {
  it('saves the title and the number of participants', async () => {
    const h = harness();
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);

    await h.controller.finishStopDialog({ meetingId: command.meetingId, title: '  Созвон с Ириной ', participantsHint: 3 });

    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ title: 'Созвон с Ириной', participantsHint: 3 });
    expect(h.state().stopDialog).toBeNull();
    expect(h.deps.libraryChanged).toHaveBeenCalled();
  });

  it('keeps the default title when the field was emptied and allows skipping the question', async () => {
    const h = harness();
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    const title = (await readMeeting(h.lib, command.meetingId)).title;

    await h.controller.finishStopDialog({ meetingId: command.meetingId, title: '   ', participantsHint: null });

    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ title, participantsHint: null });
  });

  it('keeps the dialog of the current recording when an older one is answered', async () => {
    const h = harness();
    const first = await h.startRecording();
    await h.stopRecording(first.meetingId);
    h.recorder.start.mockClear();
    h.recorder.stop.mockClear();
    const second = await h.startRecording();
    await h.stopRecording(second.meetingId);

    await h.controller.finishStopDialog({ meetingId: first.meetingId, title: 'Первая', participantsHint: 2 });

    expect(h.state().stopDialog?.meetingId).toBe(second.meetingId);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/main/recording/controller.test.ts`
Expected: FAIL — `Failed to resolve import "./controller"`.

- [ ] **Step 3: Код**

`src/main/recording/controller.ts`:

```ts
import { promises as fsp } from 'node:fs';
import type { Meeting, Track, TrackKind } from '../../shared/meeting';
import {
  IDLE_RECORDING_STATE,
  TRACK_FILES,
  type Peaks,
  type RecorderPeaks,
  type RecorderStartCommand,
  type RecorderStarted,
  type RecorderStartFailed,
  type RecorderStopped,
  type RecorderTrackEnded,
  type RecordingState,
  type SoundKind,
  type StartProblem,
  type StopDialogAnswer,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { fsErrorReason, humanFsError } from '../fs/fs-errors';
import { audioDir, createMeeting, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import {
  micProblem,
  notificationTexts,
  RECORDER_NOT_READY,
  RECORDER_TIMEOUT,
  systemAudioProblem,
  MIC_ACCESS_DENIED,
  type NotificationText,
} from '../texts';
import {
  DISK_CHECK_INTERVAL_MS,
  LOW_DISK_BEFORE_START_BYTES,
  LowDiskWatch,
  SilenceWatch,
  SystemSilenceWatch,
} from './monitors';
import { finalizeInterrupted } from './recovery';
import { openTrackFiles, type TrackFiles } from './track-files';

/** Окно записи, каким его видит автомат. */
export interface RecorderLink {
  isReady(): boolean;
  start(command: RecorderStartCommand): void;
  stop(): void;
  playSound(kind: SoundKind): void;
}

export interface ControllerDeps {
  platform: string;
  logger: Logger;
  recorder: RecorderLink;
  now(): number;
  libraryDir(): string;
  settings(): Pick<Settings, 'microphoneId' | 'recordSounds'>;
  hotkeyLabel(): string;
  freeBytes(dir: string): Promise<number>;
  /** Системное окно «Мало места на диске»: true — «Всё равно начать». */
  confirmLowDisk(freeBytes: number): Promise<boolean>;
  /** macOS: запрос доступа к микрофону; Windows — всегда true. */
  ensureMicAccess(): Promise<boolean>;
  /** onlyWhenAway — не показывать, если главное окно на экране и в фокусе. */
  notify(text: NotificationText, onlyWhenAway?: boolean): void;
  showMainWindow(): void;
  emitState(state: RecordingState): void;
  emitPeaks(peaks: Peaks): void;
  libraryChanged(): void;
  enqueueMix(meetingId: string): void;
  openTracks?: typeof openTrackFiles;
  timeouts?: { startMs: number; stopMs: number };
}

export type StopReason = 'user' | 'quit' | 'disk' | 'mic-ended';

/** Ждём ответа окна записи на «начать»: на Mac в это время может висеть запрос разрешения. */
export const START_TIMEOUT_MS = 60_000;
export const STOP_TIMEOUT_MS = 10_000;

const SYSTEM_TRACK_ENDED = 'Звук компьютера перестал записываться. Микрофон записывается как обычно.';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Результат ожидания или fallback, если не дождались. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface Session {
  meeting: Meeting;
  systemRequested: boolean;
  files: TrackFiles | null;
  pendingChunks: { kind: TrackKind; bytes: Uint8Array }[];
  /** Дорожки, пропавшие, пока main ещё открывал файлы: разбираются, когда запись пошла. */
  pendingEnded: TrackKind[];
  /** Окно записи упало во время остановки: последние куски могли не дойти. */
  interrupted: boolean;
  startedAt: number;
  silence: SilenceWatch;
  systemSilence: SystemSilenceWatch;
  lowDisk: LowDiskWatch;
  diskTimer: ReturnType<typeof setInterval> | null;
  started: Deferred<StartProblem | null>;
  stopped: Deferred<void>;
}

/** Автомат записи: idle → starting → recording → stopping → idle. */
export class RecordingController {
  private state: RecordingState = { ...IDLE_RECORDING_STATE };
  private session: Session | null = null;
  private busy: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ControllerDeps) {}

  getState(): RecordingState {
    return this.state;
  }

  /** Кнопка, пункт трея, горячая клавиша: начать, если не идёт; остановить, если идёт. */
  toggle(): Promise<void> {
    if (this.state.phase === 'idle') return this.start();
    if (this.state.phase === 'recording') return this.stop('user');
    return Promise.resolve();
  }

  setSystemAudioNext(enabled: boolean): void {
    if (this.state.phase === 'idle') this.update({ systemAudioNext: enabled });
  }

  dismissStartProblem(): void {
    this.update({ startProblem: null });
  }

  /** Ответ в окне «Запись остановлена». */
  async finishStopDialog(answer: StopDialogAnswer): Promise<void> {
    const title = answer.title.trim();
    await updateMeeting(this.deps.libraryDir(), answer.meetingId, (m) => ({
      ...m,
      title: title === '' ? m.title : title,
      participantsHint: answer.participantsHint,
    }));
    if (this.state.stopDialog?.meetingId === answer.meetingId) this.update({ stopDialog: null });
    this.deps.libraryChanged();
  }

  start(): Promise<void> {
    if (this.state.phase !== 'idle') return this.busy;
    this.busy = this.runStart().catch((err: unknown) => {
      this.deps.logger.error('Запись не началась', err);
      this.failStart({ message: humanFsError('Не удалось начать запись', err).message, settings: null });
    });
    return this.busy;
  }

  stop(reason: StopReason = 'user'): Promise<void> {
    if (this.state.phase !== 'recording') return this.busy;
    this.busy = this.runStop(reason).catch((err: unknown) => {
      this.deps.logger.error('Не удалось корректно остановить запись', err);
      this.resetToIdle(null);
    });
    return this.busy;
  }

  /** Перед выходом: дождаться начала, если оно идёт, и остановить без вопросов и окон. */
  async stopForQuit(): Promise<void> {
    await this.busy;
    if (this.state.phase === 'recording') await this.stop('quit');
  }

  // ---- Сообщения окна записи ----

  onStarted(message: RecorderStarted): void {
    const session = this.sessionFor(message.meetingId);
    if (!session || this.state.phase !== 'starting') return;
    this.acceptStarted(session, message).catch((err: unknown) => {
      this.deps.logger.error('Не удалось открыть файлы дорожек', err);
      session.started.resolve({ message: humanFsError('Не удалось начать запись', err).message, settings: null });
    });
  }

  onStartFailed(message: RecorderStartFailed): void {
    const session = this.sessionFor(message.meetingId);
    if (!session) return;
    this.deps.logger.warn(`Микрофон не включился: ${message.failure.name}: ${message.failure.message}`);
    session.started.resolve(micProblem(message.failure));
  }

  onChunk(meetingId: string, kind: TrackKind, bytes: Uint8Array): void {
    const session = this.sessionFor(meetingId);
    if (!session) return;
    if (session.files) session.files.append(kind, bytes);
    else session.pendingChunks.push({ kind, bytes });
  }

  onPeaks(message: RecorderPeaks): void {
    const session = this.sessionFor(message.meetingId);
    if (!session || this.state.phase !== 'recording') return;
    const peaks: Peaks = { mic: message.mic, system: message.system };
    this.deps.emitPeaks(peaks);
    const now = this.deps.now();
    if (session.silence.update(now, peaks)) {
      this.deps.notify(notificationTexts.stillRecording(this.deps.hotkeyLabel()));
    }
    const systemSilent = session.systemSilence.update(now, peaks.system);
    if (systemSilent !== this.state.systemSilent) this.update({ systemSilent });
  }

  onTrackEnded(message: RecorderTrackEnded): void {
    const session = this.sessionFor(message.meetingId);
    if (!session) return;
    if (this.state.phase === 'starting') {
      session.pendingEnded.push(message.kind);
      return;
    }
    if (this.state.phase !== 'recording') return;
    this.deps.logger.warn(`Дорожка ${message.kind} завершилась во время записи`);
    if (message.kind === 'system') {
      this.update({ system: 'failed', systemProblem: SYSTEM_TRACK_ENDED, systemSilent: false });
    } else if (this.state.system === 'on') {
      this.update({ micEnded: true });
    } else {
      void this.stop('mic-ended');
    }
  }

  onStopped(message: RecorderStopped): void {
    this.sessionFor(message.meetingId)?.stopped.resolve();
  }

  /** Окно записи упало или перезагрузилось. */
  onRecorderGone(): void {
    const session = this.session;
    if (!session) return;
    if (this.state.phase === 'starting') {
      session.started.resolve({ message: 'Окно записи закрылось из-за сбоя. Попробуйте ещё раз.', settings: null });
      return;
    }
    // Во время остановки окно тоже могло упасть: ждать его ответа незачем, а запись — с пометкой о сбое.
    if (this.state.phase === 'stopping') {
      session.interrupted = true;
      session.stopped.resolve();
      return;
    }
    if (this.state.phase !== 'recording') return;
    this.busy = this.finishInterrupted(session).catch((err: unknown) => {
      this.deps.logger.error('Не удалось сохранить прерванную запись', err);
      this.resetToIdle(null);
    });
  }

  // ---- Внутреннее ----

  private async runStart(): Promise<void> {
    this.update({ phase: 'starting', startProblem: null });
    if (!this.deps.recorder.isReady()) return this.failStart(RECORDER_NOT_READY);

    const libraryDir = this.deps.libraryDir();
    await fsp.mkdir(libraryDir, { recursive: true });
    const free = await this.deps.freeBytes(libraryDir);
    if (free < LOW_DISK_BEFORE_START_BYTES && !(await this.deps.confirmLowDisk(free))) {
      this.update({ phase: 'idle' });
      return;
    }
    if (!(await this.deps.ensureMicAccess())) return this.failStart(MIC_ACCESS_DENIED);

    const meeting = await createMeeting(libraryDir, {
      source: 'recording',
      status: 'recording',
      now: new Date(this.deps.now()),
    });
    const session: Session = {
      meeting,
      systemRequested: this.state.systemAudioNext,
      files: null,
      pendingChunks: [],
      pendingEnded: [],
      interrupted: false,
      startedAt: this.deps.now(),
      silence: new SilenceWatch(this.deps.now()),
      systemSilence: new SystemSilenceWatch(this.deps.now()),
      lowDisk: new LowDiskWatch(),
      diskTimer: null,
      started: deferred(),
      stopped: deferred(),
    };
    this.session = session;
    this.update({ meetingId: meeting.id, freeBytes: free });
    this.deps.libraryChanged();

    if (this.deps.settings().recordSounds) this.deps.recorder.playSound('start');
    this.deps.recorder.start({
      meetingId: meeting.id,
      micDeviceId: this.deps.settings().microphoneId,
      systemAudio: session.systemRequested,
    });

    const problem = await within(session.started.promise, this.deps.timeouts?.startMs ?? START_TIMEOUT_MS, RECORDER_TIMEOUT);
    if (problem) {
      this.deps.recorder.stop();
      await session.files?.close();
      this.session = null;
      await removeMeetingDir(libraryDir, meeting.id).catch((err: unknown) =>
        this.deps.logger.error(`Не удалось удалить папку несостоявшейся записи ${meeting.id}`, err),
      );
      this.deps.libraryChanged();
      this.failStart(problem);
    }
  }

  private async acceptStarted(session: Session, message: RecorderStarted): Promise<void> {
    const libraryDir = this.deps.libraryDir();
    const earliest = Math.min(...message.tracks.map((t) => t.startedAt));
    const tracks: Track[] = message.tracks.map((t) => ({
      kind: t.kind,
      file: TRACK_FILES[t.kind],
      startOffsetMs: Math.max(0, Math.round(t.startedAt - earliest)),
    }));
    const files = await (this.deps.openTracks ?? openTrackFiles)(
      audioDir(libraryDir, session.meeting.id),
      tracks.map((t) => t.kind),
      (err) => this.onDiskError(err),
    );
    session.files = files;
    for (const chunk of session.pendingChunks.splice(0)) files.append(chunk.kind, chunk.bytes);
    // Дорожки и сдвиги — сразу в meeting.json: после сбоя по ним восстановится запись.
    session.meeting = await updateMeeting(libraryDir, session.meeting.id, (m) => ({ ...m, tracks }));

    const now = this.deps.now();
    session.startedAt = now;
    session.silence = new SilenceWatch(now);
    session.systemSilence = new SystemSilenceWatch(now);
    const systemFailed = session.systemRequested && message.systemFailure !== null;
    if (message.systemFailure) {
      this.deps.logger.warn(`Звук компьютера не подключился: ${message.systemFailure.name}: ${message.systemFailure.message}`);
    }
    this.update({
      phase: 'recording',
      startedAt: now,
      system: !session.systemRequested ? 'off' : systemFailed ? 'failed' : 'on',
      systemProblem: message.systemFailure ? systemAudioProblem(message.systemFailure, this.deps.platform) : null,
      micLabel: message.micLabel,
    });
    session.diskTimer = setInterval(() => void this.checkDisk(session), DISK_CHECK_INTERVAL_MS);
    this.deps.notify(notificationTexts.started(this.deps.hotkeyLabel()), true);
    this.deps.logger.info(`Запись началась: ${session.meeting.id} (${tracks.map((t) => t.kind).join(', ')})`);
    session.started.resolve(null);
    for (const kind of session.pendingEnded.splice(0)) this.onTrackEnded({ meetingId: session.meeting.id, kind });
  }

  private async runStop(reason: StopReason): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.update({ phase: 'stopping' });
    this.clearTimers(session);
    this.deps.recorder.stop();
    await within(session.stopped.promise, this.deps.timeouts?.stopMs ?? STOP_TIMEOUT_MS, undefined);
    await session.files?.close();

    const libraryDir = this.deps.libraryDir();
    const durationSec = Math.max(0, Math.round((this.deps.now() - session.startedAt) / 100) / 10);
    const meeting = await updateMeeting(libraryDir, session.meeting.id, (m) => ({
      ...m,
      status: 'recorded',
      durationSec,
      recovered: m.recovered || session.interrupted,
    }));
    if (reason !== 'quit' && this.deps.settings().recordSounds) this.deps.recorder.playSound('stop');
    this.deps.enqueueMix(meeting.id);
    this.deps.logger.info(`Запись остановлена: ${meeting.id}, ${durationSec} с (${reason})`);

    if (reason === 'quit') {
      this.resetToIdle(null);
    } else {
      if (session.interrupted) this.deps.notify(notificationTexts.interrupted());
      else if (reason === 'user') this.deps.notify(notificationTexts.stopped(durationSec), true);
      if (reason === 'mic-ended') this.deps.notify(notificationTexts.micEnded());
      this.resetToIdle({ meetingId: meeting.id, title: meeting.title, durationSec });
      this.deps.showMainWindow();
    }
    this.deps.libraryChanged();
  }

  private async finishInterrupted(session: Session): Promise<void> {
    this.clearTimers(session);
    await session.files?.close();
    const meeting = await finalizeInterrupted(this.deps.libraryDir(), session.meeting.id);
    this.deps.enqueueMix(meeting.id);
    this.deps.notify(notificationTexts.interrupted());
    this.resetToIdle(null);
    this.deps.libraryChanged();
  }

  private onDiskError(err: unknown): void {
    this.deps.logger.error('Не удалось записать кусок дорожки на диск', err);
    this.deps.notify(notificationTexts.stoppedByDisk(fsErrorReason(err)));
    void this.stop('disk');
  }

  private async checkDisk(session: Session): Promise<void> {
    try {
      const free = await this.deps.freeBytes(this.deps.libraryDir());
      if (this.session !== session) return;
      this.update({ freeBytes: free });
      if (session.lowDisk.update(free)) this.deps.notify(notificationTexts.lowDisk(free));
    } catch (err) {
      this.deps.logger.warn('Не удалось узнать свободное место на диске', err);
    }
  }

  private failStart(problem: StartProblem): void {
    this.session = null;
    this.update({ ...IDLE_RECORDING_STATE, systemAudioNext: this.state.systemAudioNext, startProblem: problem });
    this.deps.notify(notificationTexts.startFailed(problem), true);
  }

  /** После каждой записи переключатель «Звук компьютера» снова включён. */
  private resetToIdle(stopDialog: RecordingState['stopDialog']): void {
    if (this.session) this.clearTimers(this.session);
    this.session = null;
    this.update({ ...IDLE_RECORDING_STATE, stopDialog: stopDialog ?? this.state.stopDialog });
  }

  private clearTimers(session: Session): void {
    if (session.diskTimer) clearInterval(session.diskTimer);
    session.diskTimer = null;
  }

  private sessionFor(meetingId: string): Session | null {
    return this.session?.meeting.id === meetingId ? this.session : null;
  }

  private update(patch: Partial<RecordingState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.emitState(this.state);
  }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/main/recording`
Expected: PASS, все тесты папки (в `controller.test.ts` — 35).

- [ ] **Step 5: Коммит**

```bash
git add src/main/recording/controller.ts src/main/recording/controller.test.ts
git commit -m "feat: add the recording state machine"
```

---

### Task 10: Значок записи, разрешения, меню macOS, протокол плеера

Четыре небольших модуля, которые Task 11 подключит к Electron: кольцо с красной точкой для трея Windows, решение
«кому что разрешено» (захват звука — только окну записи; из отложенного в Плане 1), урезанное меню macOS (без
«Перезагрузить» и инструментов разработчика; тоже из отложенного), выдача `mix.opus` плееру с поддержкой `Range`.

**Files:**
- Modify: `src/main/icons/circle-icon.ts`, `src/main/icons/circle-icon.test.ts`
- Create: `src/main/permissions.ts`, `src/main/permissions.test.ts`, `src/main/app-menu.ts`, `src/main/app-menu.test.ts`,
  `src/main/media-protocol.ts`, `src/main/media-protocol.test.ts`

- [ ] **Step 1: Тесты**

`src/main/icons/circle-icon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { drawCircleIcon, drawRecordingIcon, RECORDING_RED } from './circle-icon';

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

describe('drawRecordingIcon', () => {
  const blue = { r: 59, g: 130, b: 246 };
  const rgbaAt = (pixels: Uint8Array, size: number, x: number, y: number) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];

  it('puts an opaque red dot in the lower right corner', () => {
    const pixels = drawRecordingIcon(32, blue);
    expect(rgbaAt(pixels, 32, 23, 23)).toEqual([RECORDING_RED.r, RECORDING_RED.g, RECORDING_RED.b, 255]);
  });

  it('keeps the rest of the ring in its own color', () => {
    const pixels = drawRecordingIcon(32, blue);
    expect(rgbaAt(pixels, 32, 3, 16)).toEqual([59, 130, 246, 255]);
    expect(alphaAt(pixels, 32, 0, 0)).toBe(0);
  });

  it('cuts a transparent gap between the ring and the dot', () => {
    const ring = drawCircleIcon(32, blue, 'ring');
    const pixels = drawRecordingIcon(32, blue);
    let cut = 0;
    for (let i = 3; i < ring.length; i += 4) if (ring[i] === 255 && pixels[i] === 0) cut += 1;
    expect(cut).toBeGreaterThan(4);
  });
});
```

`src/main/permissions.test.ts`:

```ts
import type { Session, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { allowPermissionCheck, allowPermissionRequest, applyPermissionPolicy } from './permissions';

describe('allowPermissionRequest', () => {
  it('lets only the recorder window capture sound', () => {
    expect(allowPermissionRequest('media', 'recorder')).toBe(true);
    expect(allowPermissionRequest('display-capture', 'recorder')).toBe(true);
    expect(allowPermissionRequest('media', 'main')).toBe(false);
    expect(allowPermissionRequest('media', 'other')).toBe(false);
  });

  it.each(['notifications', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen'])('refuses %s', (permission) => {
    expect(allowPermissionRequest(permission, 'recorder')).toBe(false);
    expect(allowPermissionRequest(permission, 'main')).toBe(false);
  });
});

describe('allowPermissionCheck', () => {
  it('lets the main window see microphone names but not capture', () => {
    expect(allowPermissionCheck('media', 'main')).toBe(true);
    expect(allowPermissionCheck('display-capture', 'main')).toBe(false);
  });

  it('lets the recorder window check what it needs', () => {
    expect(allowPermissionCheck('media', 'recorder')).toBe(true);
    expect(allowPermissionCheck('display-capture', 'recorder')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(allowPermissionCheck('media', 'other')).toBe(false);
    expect(allowPermissionCheck('notifications', 'main')).toBe(false);
  });
});

describe('applyPermissionPolicy', () => {
  it('answers requests and checks by the window that asks', () => {
    type RequestHandler = (contents: WebContents | null, permission: string, callback: (ok: boolean) => void) => void;
    type CheckHandler = (contents: WebContents | null, permission: string) => boolean;
    let onRequest: RequestHandler = () => undefined;
    let onCheck: CheckHandler = () => false;
    const session = {
      setPermissionRequestHandler: (handler: RequestHandler) => {
        onRequest = handler;
      },
      setPermissionCheckHandler: (handler: CheckHandler) => {
        onCheck = handler;
      },
    } as unknown as Session;
    const main = {} as WebContents;
    const recorder = {} as WebContents;
    applyPermissionPolicy(session, { main: () => main, recorder: () => recorder });

    const callback = vi.fn();
    onRequest(recorder, 'media', callback);
    onRequest(main, 'media', callback);
    onRequest(null, 'media', callback);
    expect(callback.mock.calls).toEqual([[true], [false], [false]]);
    expect(onCheck(main, 'media')).toBe(true);
    expect(onCheck({} as WebContents, 'media')).toBe(false);
  });
});
```

`src/main/app-menu.test.ts`:

```ts
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { macMenuTemplate } from './app-menu';

const roles = (items: MenuItemConstructorOptions[]): string[] =>
  items.flatMap((item) => [
    ...(item.role ? [item.role] : []),
    ...(Array.isArray(item.submenu) ? roles(item.submenu) : []),
  ]);

describe('macMenuTemplate', () => {
  it('has the app, edit and window menus', () => {
    expect(macMenuTemplate().map((m) => m.label)).toEqual(['TextMeet', 'Правка', 'Окно']);
  });

  it('keeps copy and paste and quitting', () => {
    expect(roles(macMenuTemplate())).toEqual(
      expect.arrayContaining(['copy', 'paste', 'selectAll', 'quit', 'close']),
    );
  });

  it('has no reload and no developer tools', () => {
    const all = roles(macMenuTemplate());
    for (const role of ['reload', 'forceReload', 'toggleDevTools', 'viewMenu']) expect(all).not.toContain(role);
  });
});
```

`src/main/media-protocol.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test-support/temp-dir';
import { parseRange, resolveMediaPath, serveMedia } from './media-protocol';

const ID = '2026-09-28_1430_a1b2c3';
const URL_OK = `tm-media://meeting/${ID}/mix.opus`;

describe('resolveMediaPath', () => {
  it('maps a meeting mix to its file', () => {
    expect(resolveMediaPath(URL_OK, 'D:\\Lib')).toBe(join('D:\\Lib', ID, 'audio', 'mix.opus'));
  });

  it.each([
    'не адрес',
    `https://meeting/${ID}/mix.opus`,
    `tm-media://other/${ID}/mix.opus`,
    `tm-media://meeting/${ID}/mic.webm`,
    `tm-media://meeting/${ID}/../../secret.txt`,
    `tm-media://meeting/..%2F${ID}/mix.opus`,
    `tm-media://meeting/${ID}`,
    `tm-media://meeting/${ID}/audio/mix.opus`,
  ])('refuses %s', (url) => {
    expect(resolveMediaPath(url, 'D:\\Lib')).toBeNull();
  });
});

describe('parseRange', () => {
  it.each([
    [null, null],
    ['', null],
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=100-', { start: 100, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=990-5000', { start: 990, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['bytes=1000-', 'invalid'],
    ['bytes=50-10', 'invalid'],
    ['bytes=-0', 'invalid'],
    ['bytes=-', null],
    ['items=0-5', null],
  ] as const)('%s → %j', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected);
  });
});

describe('serveMedia', () => {
  function library(content: string): string {
    const lib = makeTempDir();
    mkdirSync(join(lib, ID, 'audio'), { recursive: true });
    writeFileSync(join(lib, ID, 'audio', 'mix.opus'), content);
    return lib;
  }

  it('serves the whole file', async () => {
    const response = await serveMedia(new Request(URL_OK), library('0123456789'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/ogg');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(await response.text()).toBe('0123456789');
  });

  it('serves a byte range for seeking', async () => {
    const response = await serveMedia(new Request(URL_OK, { headers: { Range: 'bytes=2-5' } }), library('0123456789'));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
  });

  it('answers 416 for a range past the end', async () => {
    const response = await serveMedia(new Request(URL_OK, { headers: { Range: 'bytes=20-' } }), library('0123456789'));
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  it('serves an empty file', async () => {
    const response = await serveMedia(new Request(URL_OK), library(''));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('answers 404 for foreign addresses and missing files', async () => {
    expect((await serveMedia(new Request(`tm-media://meeting/${ID}/mic.webm`), library('x'))).status).toBe(404);
    expect((await serveMedia(new Request(URL_OK), makeTempDir())).status).toBe(404);
  });
});
```

- [ ] **Step 2: Запустить — падают**

Run: `npx vitest run src/main/icons src/main/permissions.test.ts src/main/app-menu.test.ts src/main/media-protocol.test.ts`
Expected: FAIL — нет `drawRecordingIcon`, модулей `permissions`, `app-menu`, `media-protocol`.

- [ ] **Step 3: Код**

`src/main/icons/circle-icon.ts`:

```ts
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** ring — кольцо (ожидание), dot — закрашенный круг (идёт запись на macOS, где значок одноцветный). */
export type CircleStyle = 'ring' | 'dot';

/** Красная точка записи на значке Windows. */
export const RECORDING_RED: Rgb = { r: 229, g: 57, b: 53 };

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

/** Кольцо с красной точкой в правом нижнем углу (идёт запись); вокруг точки — прозрачный зазор. */
export function drawRecordingIcon(size: number, ringColor: Rgb): Uint8Array {
  const pixels = drawCircleIcon(size, ringColor, 'ring');
  const cx = size * 0.72;
  const cy = size * 0.72;
  const radius = size * 0.26;
  const gap = size / 16;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const dot = clamp01(radius + 0.5 - distance);
      const cut = clamp01(radius + gap + 0.5 - distance);
      const i = (y * size + x) * 4;
      const ring = ((pixels[i + 3] ?? 0) / 255) * (1 - cut);
      const alpha = dot + ring * (1 - dot);
      const mix = (red: number, base: number): number =>
        alpha === 0 ? 0 : Math.round((red * dot + base * ring * (1 - dot)) / alpha);
      pixels[i] = mix(RECORDING_RED.r, ringColor.r);
      pixels[i + 1] = mix(RECORDING_RED.g, ringColor.g);
      pixels[i + 2] = mix(RECORDING_RED.b, ringColor.b);
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}
```

`src/main/permissions.ts`:

```ts
import type { Session, WebContents } from 'electron';

/** Кто спрашивает разрешение. */
export type Requester = 'main' | 'recorder' | 'other';

/** Запросы (getUserMedia и т. п.): захватывать звук может только окно записи. */
export function allowPermissionRequest(permission: string, from: Requester): boolean {
  return from === 'recorder' && (permission === 'media' || permission === 'display-capture');
}

/**
 * Проверки (без захвата): главное окно видит названия микрофонов в настройках,
 * окно записи — всё, что ему нужно для захвата.
 */
export function allowPermissionCheck(permission: string, from: Requester): boolean {
  if (permission !== 'media' && permission !== 'display-capture') return false;
  return from === 'recorder' || (from === 'main' && permission === 'media');
}

export interface PermissionWindows {
  main(): WebContents | null;
  recorder(): WebContents | null;
}

function requester(contents: WebContents | null, windows: PermissionWindows): Requester {
  if (contents && contents === windows.recorder()) return 'recorder';
  if (contents && contents === windows.main()) return 'main';
  return 'other';
}

/** Разрешения сессии: всё, чего не разрешили явно, запрещено. */
export function applyPermissionPolicy(session: Session, windows: PermissionWindows): void {
  session.setPermissionRequestHandler((contents, permission, callback) =>
    callback(allowPermissionRequest(permission, requester(contents, windows))),
  );
  session.setPermissionCheckHandler((contents, permission) =>
    allowPermissionCheck(permission, requester(contents, windows)),
  );
}
```

`src/main/app-menu.ts`:

```ts
import type { MenuItemConstructorOptions } from 'electron';

/**
 * Меню программы на macOS: без «Перезагрузить» и инструментов разработчика.
 * «Правка» нужна, чтобы в полях работали ⌘C / ⌘V / ⌘A. На Windows меню нет совсем.
 */
export function macMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'TextMeet',
      submenu: [
        { role: 'about', label: 'О программе TextMeet' },
        { type: 'separator' },
        { role: 'hide', label: 'Скрыть TextMeet' },
        { role: 'hideOthers', label: 'Скрыть остальные' },
        { role: 'unhide', label: 'Показать все' },
        { type: 'separator' },
        { role: 'quit', label: 'Выйти из TextMeet' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выбрать всё' },
      ],
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'close', label: 'Закрыть окно' },
      ],
    },
  ];
}
```

`src/main/media-protocol.ts`:

```ts
import { createReadStream, promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MEETING_ID_PATTERN } from '../shared/meeting';
import { MIX_FILE } from '../shared/recording';
import { AUDIO_DIR } from './library/library';

/** Схема, по которой плеер главного окна получает звук встречи: tm-media://meeting/<id>/mix.opus */
export const MEDIA_SCHEME = 'tm-media';
const HOST = 'meeting';
/** Какие файлы папки audio/ можно отдавать. */
const SERVED_FILES = new Set([MIX_FILE]);

/** Файл встречи по адресу; null — адрес чужой или ведёт куда не положено. */
export function resolveMediaPath(url: string, libraryDir: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== HOST) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [id, file] = parts as [string, string];
  if (!MEETING_ID_PATTERN.test(id) || !SERVED_FILES.has(file)) return null;
  return join(libraryDir, id, AUDIO_DIR, file);
}

export type ByteRange = { start: number; end: number };

/** Заголовок Range → отрезок байт; null — отдать весь файл; 'invalid' — отрезок за пределами файла. */
export function parseRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const [, from = '', to = ''] = match;
  let start: number;
  let end: number;
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/** Ответ на запрос плеера: весь файл или отрезок (206) — без отрезков нельзя перематывать. */
export async function serveMedia(request: Request, libraryDir: string): Promise<Response> {
  const file = resolveMediaPath(request.url, libraryDir);
  if (!file) return new Response(null, { status: 404 });
  const stats = await fsp.stat(file).catch(() => null);
  if (!stats?.isFile()) return new Response(null, { status: 404 });

  const size = stats.size;
  const range = parseRange(request.headers.get('range'), size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const headers: Record<string, string> = {
    'Content-Type': 'audio/ogg',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(size === 0 ? 0 : end - start + 1),
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const body = size === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>);
  return new Response(body, { status: range ? 206 : 200, headers });
}
```

- [ ] **Step 4: Запустить — проходят**

Run: `npx vitest run src/main/icons src/main/permissions.test.ts src/main/app-menu.test.ts src/main/media-protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/main/icons src/main/permissions.ts src/main/permissions.test.ts src/main/app-menu.ts src/main/app-menu.test.ts src/main/media-protocol.ts src/main/media-protocol.test.ts
git commit -m "feat: add the recording tray icon, permission policy, macOS menu and media protocol"
```

---

### Task 11: Оболочка main — контракт IPC, окна, трей, запуск

Связывает всё с Electron. Контракт IPC — одна таблица типов (из отложенного в Плане 1): preload и main пользуются
типизированными обёртками, расхождение ловит проверка типов. В `index.ts`: тестовый режим, протокол плеера,
автомат записи, горячая клавиша, разрешения и обработчик `getDisplayMedia` (только окну записи), перезапуск окна записи
после сбоя (не больше 3 раз в минуту), трей с состоянием записи, восстановление и досведение при запуске, выход во
время записи с вопросом (отмена выхода ничего не ломает, журнал дописывается перед выходом), остановка записи при
выключении компьютера. Старые экраны главного окна и старое окно записи продолжают собираться — их заменят Task 12–13.

**Files:**
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/windows.ts`, `src/main/tray-menu.ts`,
  `src/main/tray-menu.test.ts`, `src/main/tray.ts`, `src/main/index.ts`
- Create: `src/main/notifications.ts`

- [ ] **Step 1: Контракт IPC**

`src/shared/ipc.ts`:

```ts
// Контракт между окнами и main: имена каналов и таблицы «канал → что передаётся → что возвращается».
// preload и main пользуются типизированными обёртками над этими таблицами, поэтому расхождение ловит
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { MeetingListEntry } from './meeting';
import type {
  Peaks,
  RecorderChunk,
  RecorderPeaks,
  RecorderStartCommand,
  RecorderStarted,
  RecorderStartFailed,
  RecorderStopped,
  RecorderTrackEnded,
  RecordingState,
  SoundKind,
  StopDialogAnswer,
  SystemSettingsKind,
} from './recording';
import type { Settings } from './settings';

export const IPC = {
  // Главное окно → main (запрос — ответ).
  getSettings: 'settings:get',
  setLaunchAtLogin: 'settings:set-launch-at-login',
  chooseLibraryDir: 'settings:choose-library-dir',
  setMicrophone: 'settings:set-microphone',
  setRecordSounds: 'settings:set-record-sounds',
  setHotkey: 'settings:set-hotkey',
  suspendHotkey: 'settings:suspend-hotkey',
  openLibraryDir: 'library:open-dir',
  openMeetingDir: 'library:open-meeting-dir',
  listMeetings: 'library:list',
  getAppInfo: 'app:info',
  getRecordingState: 'recording:get-state',
  toggleRecording: 'recording:toggle',
  setSystemAudio: 'recording:set-system-audio',
  dismissStartProblem: 'recording:dismiss-problem',
  finishStopDialog: 'recording:finish-stop-dialog',
  openSystemSettings: 'system:open-settings',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
  libraryChanged: 'library:changed',
  // main → окно записи (команды).
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
  recorderPlaySound: 'recorder:play-sound',
  // Окно записи → main (сообщения).
  recorderReady: 'recorder:ready',
  recorderStarted: 'recorder:started',
  recorderStartFailed: 'recorder:start-failed',
  recorderChunk: 'recorder:chunk',
  recorderPeaks: 'recorder:peaks',
  recorderTrackEnded: 'recorder:track-ended',
  recorderStopped: 'recorder:stopped',
} as const;

/** Что показать под переключателем «Запускать при входе в систему». */
export type LaunchAtLoginNotice = 'none' | 'dev-build' | 'needs-approval' | 'blocked-by-system' | 'unsupported';

export interface HotkeyState {
  /** Действующая комбинация (accelerator). */
  accelerator: string;
  /** Как показать человеку: «Ctrl+Space», «⌥ Space». */
  label: string;
  isDefault: boolean;
  /** Не удалось зарегистрировать — занята другой программой. */
  busy: boolean;
}

export interface SettingsState {
  settings: Settings;
  /** Итоговая папка библиотеки (с учётом значения по умолчанию). */
  libraryDir: string;
  launchAtLoginNotice: LaunchAtLoginNotice;
  hotkey: HotkeyState;
}

export type HotkeyChange = { ok: true; state: SettingsState } | { ok: false; message: string; state: SettingsState };

export interface AppInfo {
  version: string;
  platform: string;
  logFile: string;
  recorderReady: boolean;
}

/** Запросы главного окна: канал → аргумент (void — без аргумента) → ответ. */
export interface MainInvokeContract {
  [IPC.getSettings]: { arg: void; result: SettingsState };
  [IPC.setLaunchAtLogin]: { arg: boolean; result: SettingsState };
  [IPC.chooseLibraryDir]: { arg: void; result: SettingsState };
  [IPC.setMicrophone]: { arg: string | null; result: SettingsState };
  [IPC.setRecordSounds]: { arg: boolean; result: SettingsState };
  [IPC.setHotkey]: { arg: string | null; result: HotkeyChange };
  [IPC.suspendHotkey]: { arg: boolean; result: void };
  [IPC.openLibraryDir]: { arg: void; result: void };
  [IPC.openMeetingDir]: { arg: string; result: void };
  [IPC.listMeetings]: { arg: void; result: MeetingListEntry[] };
  [IPC.getAppInfo]: { arg: void; result: AppInfo };
  [IPC.getRecordingState]: { arg: void; result: RecordingState };
  [IPC.toggleRecording]: { arg: void; result: void };
  [IPC.setSystemAudio]: { arg: boolean; result: RecordingState };
  [IPC.dismissStartProblem]: { arg: void; result: void };
  [IPC.finishStopDialog]: { arg: StopDialogAnswer; result: void };
  [IPC.openSystemSettings]: { arg: SystemSettingsKind; result: void };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
export type InvokeResult<C extends MainInvokeChannel> = MainInvokeContract[C]['result'];

/** События main → главное окно. */
export interface MainEventContract {
  [IPC.recordingState]: RecordingState;
  [IPC.recordingPeaks]: Peaks;
  [IPC.libraryChanged]: void;
}
export type MainEventChannel = keyof MainEventContract;

/** Команды main → окно записи. */
export interface RecorderCommandContract {
  [IPC.recorderStart]: RecorderStartCommand;
  [IPC.recorderStop]: void;
  [IPC.recorderPlaySound]: SoundKind;
}
export type RecorderCommandChannel = keyof RecorderCommandContract;

/** Сообщения окна записи → main. */
export interface RecorderMessageContract {
  [IPC.recorderReady]: void;
  [IPC.recorderStarted]: RecorderStarted;
  [IPC.recorderStartFailed]: RecorderStartFailed;
  [IPC.recorderChunk]: RecorderChunk;
  [IPC.recorderPeaks]: RecorderPeaks;
  [IPC.recorderTrackEnded]: RecorderTrackEnded;
  [IPC.recorderStopped]: RecorderStopped;
}
export type RecorderMessageChannel = keyof RecorderMessageContract;

type Listener<T> = (payload: T) => void;
type Unsubscribe = () => void;

/** API главного окна: window.textmeet */
export interface TextMeetApi {
  getSettings(): Promise<SettingsState>;
  setLaunchAtLogin(enabled: boolean): Promise<SettingsState>;
  chooseLibraryDir(): Promise<SettingsState>;
  setMicrophone(deviceId: string | null): Promise<SettingsState>;
  setRecordSounds(enabled: boolean): Promise<SettingsState>;
  /** null — вернуть комбинацию по умолчанию. */
  setHotkey(accelerator: string | null): Promise<HotkeyChange>;
  /** Пока в настройках вводят новую комбинацию, действующая снимается. */
  suspendHotkey(suspended: boolean): Promise<void>;
  openLibraryDir(): Promise<void>;
  openMeetingDir(id: string): Promise<void>;
  listMeetings(): Promise<MeetingListEntry[]>;
  getAppInfo(): Promise<AppInfo>;
  getRecordingState(): Promise<RecordingState>;
  toggleRecording(): Promise<void>;
  setSystemAudio(enabled: boolean): Promise<RecordingState>;
  dismissStartProblem(): Promise<void>;
  finishStopDialog(answer: StopDialogAnswer): Promise<void>;
  openSystemSettings(kind: SystemSettingsKind): Promise<void>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
}

/** API скрытого окна записи: window.recorder */
export interface RecorderBridge {
  ready(): void;
  started(message: RecorderStarted): void;
  startFailed(message: RecorderStartFailed): void;
  chunk(message: RecorderChunk): void;
  peaks(message: RecorderPeaks): void;
  trackEnded(message: RecorderTrackEnded): void;
  stopped(message: RecorderStopped): void;
  onStart(listener: Listener<RecorderStartCommand>): Unsubscribe;
  onStop(listener: () => void): Unsubscribe;
  onPlaySound(listener: Listener<SoundKind>): Unsubscribe;
}
```

- [ ] **Step 2: Preload по контракту**

`src/preload/index.ts`:

```ts
// Один preload на оба окна. Preload работает в песочнице: подключать можно только 'electron'
// и собственный код без пакетов (zod сюда не тянуть). Кому что разрешено, проверяет main (ipc.ts).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type InvokeArg,
  type InvokeResult,
  type MainEventChannel,
  type MainEventContract,
  type MainInvokeChannel,
  type RecorderBridge,
  type RecorderCommandChannel,
  type RecorderCommandContract,
  type RecorderMessageChannel,
  type RecorderMessageContract,
  type TextMeetApi,
} from '../shared/ipc';

// Аргумент void означает «без аргумента»: такие каналы вызываются без второго параметра.
type ArgList<T> = [T] extends [void] ? [] : [T];

const invoke = <C extends MainInvokeChannel>(channel: C, ...arg: ArgList<InvokeArg<C>>): Promise<InvokeResult<C>> =>
  ipcRenderer.invoke(channel, ...arg);

function subscribe<C extends MainEventChannel | RecorderCommandChannel>(
  channel: C,
  listener: (payload: (MainEventContract & RecorderCommandContract)[C]) => void,
): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: (MainEventContract & RecorderCommandContract)[C]) =>
    listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const send = <C extends RecorderMessageChannel>(channel: C, ...payload: ArgList<RecorderMessageContract[C]>): void =>
  ipcRenderer.send(channel, ...payload);

const api: TextMeetApi = {
  getSettings: () => invoke(IPC.getSettings),
  setLaunchAtLogin: (enabled) => invoke(IPC.setLaunchAtLogin, enabled),
  chooseLibraryDir: () => invoke(IPC.chooseLibraryDir),
  setMicrophone: (deviceId) => invoke(IPC.setMicrophone, deviceId),
  setRecordSounds: (enabled) => invoke(IPC.setRecordSounds, enabled),
  setHotkey: (accelerator) => invoke(IPC.setHotkey, accelerator),
  suspendHotkey: (suspended) => invoke(IPC.suspendHotkey, suspended),
  openLibraryDir: () => invoke(IPC.openLibraryDir),
  openMeetingDir: (id) => invoke(IPC.openMeetingDir, id),
  listMeetings: () => invoke(IPC.listMeetings),
  getAppInfo: () => invoke(IPC.getAppInfo),
  getRecordingState: () => invoke(IPC.getRecordingState),
  toggleRecording: () => invoke(IPC.toggleRecording),
  setSystemAudio: (enabled) => invoke(IPC.setSystemAudio, enabled),
  dismissStartProblem: () => invoke(IPC.dismissStartProblem),
  finishStopDialog: (answer) => invoke(IPC.finishStopDialog, answer),
  openSystemSettings: (kind) => invoke(IPC.openSystemSettings, kind),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
};

const recorder: RecorderBridge = {
  ready: () => send(IPC.recorderReady),
  started: (message) => send(IPC.recorderStarted, message),
  startFailed: (message) => send(IPC.recorderStartFailed, message),
  chunk: (message) => send(IPC.recorderChunk, message),
  peaks: (message) => send(IPC.recorderPeaks, message),
  trackEnded: (message) => send(IPC.recorderTrackEnded, message),
  stopped: (message) => send(IPC.recorderStopped, message),
  onStart: (listener) => subscribe(IPC.recorderStart, listener),
  onStop: (listener) => subscribe(IPC.recorderStop, () => listener()),
  onPlaySound: (listener) => subscribe(IPC.recorderPlaySound, listener),
};

contextBridge.exposeInMainWorld('textmeet', api);
contextBridge.exposeInMainWorld('recorder', recorder);
```

- [ ] **Step 3: Тест меню трея**

`src/main/tray-menu.test.ts`:

```ts
import type { KeyboardEvent, MenuItem, MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenu } from './tray-menu';

const actions = () => ({ openWindow: vi.fn(), toggleRecording: vi.fn(), quit: vi.fn() });
const labels = (items: MenuItemConstructorOptions[]) => items.map((i) => i.label ?? i.type);
const find = (items: MenuItemConstructorOptions[], label: string) => items.find((i) => i.label === label);
const click = (items: MenuItemConstructorOptions[], label: string) =>
  find(items, label)?.click?.({} as MenuItem, undefined, {} as KeyboardEvent);

describe('buildTrayMenu', () => {
  it('offers to start a recording when idle', () => {
    const a = actions();
    const items = buildTrayMenu(a, { phase: 'idle', hotkey: 'Control+Space' });
    expect(labels(items)).toEqual(['Начать запись', 'Открыть TextMeet', 'separator', 'Выход']);
    expect(find(items, 'Начать запись')).toMatchObject({
      accelerator: 'Control+Space',
      registerAccelerator: false,
      enabled: true,
    });

    click(items, 'Начать запись');
    click(items, 'Открыть TextMeet');
    click(items, 'Выход');
    expect(a.toggleRecording).toHaveBeenCalledOnce();
    expect(a.openWindow).toHaveBeenCalledOnce();
    expect(a.quit).toHaveBeenCalledOnce();
  });

  it('shows the recording and offers to stop it', () => {
    const items = buildTrayMenu(actions(), { phase: 'recording', hotkey: 'Alt+Space' });
    expect(labels(items)).toEqual(['● Идёт запись', 'Остановить запись', 'Открыть TextMeet', 'separator', 'Выход']);
    expect(find(items, '● Идёт запись')?.enabled).toBe(false);
    expect(find(items, 'Остановить запись')?.enabled).toBe(true);
  });

  it('disables the record item while starting or stopping', () => {
    expect(find(buildTrayMenu(actions(), { phase: 'starting', hotkey: 'F9' }), 'Начать запись')?.enabled).toBe(false);
    expect(find(buildTrayMenu(actions(), { phase: 'stopping', hotkey: 'F9' }), 'Остановить запись')?.enabled).toBe(false);
  });
});
```

- [ ] **Step 4: Запустить — падает**

Run: `npx vitest run src/main/tray-menu.test.ts`
Expected: FAIL — меню не знает о записи (нет пункта «Начать запись»).

- [ ] **Step 5: Меню трея и трей**

`src/main/tray-menu.ts`:

```ts
import type { MenuItemConstructorOptions } from 'electron';
import type { RecordingPhase } from '../shared/recording';

export interface TrayActions {
  openWindow(): void;
  toggleRecording(): void;
  quit(): void;
}

export interface TrayMenuState {
  phase: RecordingPhase;
  /** Горячая клавиша (accelerator) — показывается рядом с пунктом записи. */
  hotkey: string;
}

export function buildTrayMenu(actions: TrayActions, state: TrayMenuState): MenuItemConstructorOptions[] {
  const recording = state.phase === 'recording' || state.phase === 'stopping';
  const record: MenuItemConstructorOptions = {
    label: recording ? 'Остановить запись' : 'Начать запись',
    // Клавиша регистрируется глобально (hotkey-manager), в меню она только подсказка.
    accelerator: state.hotkey,
    registerAccelerator: false,
    enabled: state.phase === 'idle' || state.phase === 'recording',
    click: () => actions.toggleRecording(),
  };
  return [
    ...(recording ? [{ label: '● Идёт запись', enabled: false } satisfies MenuItemConstructorOptions] : []),
    record,
    { label: 'Открыть TextMeet', click: () => actions.openWindow() },
    { type: 'separator' },
    { label: 'Выход', click: () => actions.quit() },
  ];
}
```

`src/main/tray.ts`:

```ts
import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import type { RecordingPhase } from '../shared/recording';
import { drawCircleIcon, drawRecordingIcon, type Rgb } from './icons/circle-icon';
import { encodePng } from './icons/png';
import { buildTrayMenu, type TrayActions } from './tray-menu';

// macOS: чёрный шаблон — система сама перекрашивает его под светлую/тёмную строку меню;
// цветную точку шаблон не покажет, поэтому во время записи там закрашенный круг.
const MAC_TEMPLATE_COLOR: Rgb = { r: 0, g: 0, b: 0 };
// Windows: синий заметен и на светлой, и на тёмной панели задач.
const WINDOWS_COLOR: Rgb = { r: 59, g: 130, b: 246 };

function icon(recording: boolean): NativeImage {
  const isMac = process.platform === 'darwin';
  const draw = (size: number): Uint8Array => {
    if (isMac) return drawCircleIcon(size, MAC_TEMPLATE_COLOR, recording ? 'dot' : 'ring');
    return recording ? drawRecordingIcon(size, WINDOWS_COLOR) : drawCircleIcon(size, WINDOWS_COLOR, 'ring');
  };
  const image = nativeImage.createFromBuffer(encodePng(16, 16, draw(16)), { scaleFactor: 1 });
  image.addRepresentation({ scaleFactor: 2, buffer: encodePng(32, 32, draw(32)) });
  if (isMac) image.setTemplateImage(true);
  return image;
}

export interface AppTray {
  /** Значок, подсказка и меню под состояние записи и текущую горячую клавишу. */
  update(phase: RecordingPhase, hotkey: string): void;
}

export function createTray(actions: TrayActions, hotkey: string): AppTray {
  const idle = icon(false);
  const recordingIcon = icon(true);
  const tray = new Tray(idle);
  // На Windows привычно открывать окно щелчком по значку; на macOS щелчок открывает меню.
  if (process.platform === 'win32') tray.on('click', () => actions.openWindow());

  let last = '';
  const update = (phase: RecordingPhase, key: string): void => {
    const signature = `${phase}|${key}`;
    if (signature === last) return;
    last = signature;
    const recording = phase === 'recording' || phase === 'stopping';
    tray.setImage(recording ? recordingIcon : idle);
    tray.setToolTip(recording ? 'TextMeet — идёт запись' : 'TextMeet');
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu(actions, { phase, hotkey: key })));
  };
  update('idle', hotkey);
  // Ссылку на трей держит замыкание update — иначе сборщик мусора убрал бы значок.
  return { update };
}
```

- [ ] **Step 6: Запустить — проходит**

Run: `npx vitest run src/main/tray-menu.test.ts`
Expected: PASS, тестов: 3.

- [ ] **Step 7: Окна и уведомления**

`src/main/windows.ts`:

```ts
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { Logger } from './logger';

type Page = 'main' | 'recorder';

// Один preload на оба окна; какое окно что может — проверяет main (ipc.ts).
const PRELOAD = join(__dirname, '../preload/index.js');

function loadPage(win: BrowserWindow, page: Page, logger: Logger, query: Record<string, string> = {}): void {
  // В режиме разработки (npm run dev) страницы отдаёт dev-сервер electron-vite.
  const devUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const search = new URLSearchParams(query).toString();
  const loading = devUrl
    ? win.loadURL(`${devUrl}/${page}/index.html${search ? `?${search}` : ''}`)
    : win.loadFile(join(__dirname, `../renderer/${page}/index.html`), { query });
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

/** Режим автотестов (TEXTMEET_TEST_MEDIA): звук компьютера — тон ('tone') или отказ ('fail'). */
export function testMediaMode(): 'tone' | 'fail' | null {
  const mode = process.env.TEXTMEET_TEST_MEDIA;
  return mode === 'tone' || mode === 'fail' ? mode : null;
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
      // Сигналы старта/стопа и анализ уровня звучат без нажатия в самом окне (его никто не видит).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  lockDown(win);
  const testMedia = testMediaMode();
  loadPage(win, 'recorder', logger, testMedia ? { testSystemAudio: testMedia } : {});
  return win;
}
```

`src/main/notifications.ts`:

```ts
import { Notification } from 'electron';
import type { Logger } from './logger';
import type { NotificationText } from './texts';

export interface NotifierDeps {
  logger: Logger;
  /** Щелчок по уведомлению открывает окно. */
  openWindow(): void;
  /** Главное окно на экране и в фокусе — уведомления «только если не смотрят» не нужны. */
  isWindowActive(): boolean;
}

export type Notify = (text: NotificationText, onlyWhenAway?: boolean) => void;

export function createNotifier(deps: NotifierDeps): Notify {
  // Держим ссылки, пока уведомление на экране: иначе сборщик мусора уберёт его вместе с обработчиком щелчка.
  const shown = new Set<Notification>();
  return (text, onlyWhenAway = false) => {
    if (onlyWhenAway && deps.isWindowActive()) return;
    if (!Notification.isSupported()) {
      deps.logger.warn(`Уведомления не поддерживаются: ${text.title}`);
      return;
    }
    const notification = new Notification({ title: text.title, body: text.body, silent: text.silent ?? false });
    shown.add(notification);
    notification.on('click', () => deps.openWindow());
    notification.on('close', () => shown.delete(notification));
    notification.on('failed', (_event, error) => {
      shown.delete(notification);
      deps.logger.warn(`Уведомление не показано: ${error}`);
    });
    notification.show();
  };
}
```

- [ ] **Step 8: Обработчики IPC**

`src/main/ipc.ts`:

```ts
import { promises as fsp } from 'node:fs';
import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import { z } from 'zod';
import {
  IPC,
  type AppInfo,
  type InvokeResult,
  type LaunchAtLoginNotice,
  type MainInvokeChannel,
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import type { Logger } from './logger';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { systemSettingsUrl } from './texts';

export interface IpcDeps {
  settings: SettingsStore;
  logger: Logger;
  platform: string;
  hotkeys: HotkeyManager;
  controller: RecordingController;
  libraryDir(): string;
  launchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice;
  applyLaunchAtLogin(enabled: boolean): void;
  mainContents(): WebContents | null;
  recorderContents(): WebContents | null;
  appInfo(): AppInfo;
  onRecorderReady(): void;
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
}

const StopDialogAnswerSchema = z.object({
  meetingId: MeetingIdSchema,
  title: z.string().max(200),
  participantsHint: z.number().int().min(1).max(50).nullable(),
});
const FailureSchema = z.object({ name: z.string().max(200), message: z.string().max(2000) });
const Bytes = z.custom<ArrayBuffer | Uint8Array>((v) => v instanceof ArrayBuffer || v instanceof Uint8Array);

const RecorderSchemas = {
  [IPC.recorderReady]: z.undefined(),
  [IPC.recorderStarted]: z.object({
    meetingId: MeetingIdSchema,
    tracks: z.array(z.object({ kind: TrackKindSchema, startedAt: z.number().finite() })).min(1),
    micLabel: z.string().max(500),
    systemFailure: FailureSchema.nullable(),
  }),
  [IPC.recorderStartFailed]: z.object({ meetingId: MeetingIdSchema, failure: FailureSchema }),
  [IPC.recorderChunk]: z.object({ meetingId: MeetingIdSchema, kind: TrackKindSchema, data: Bytes }),
  [IPC.recorderPeaks]: z.object({
    meetingId: MeetingIdSchema,
    mic: z.number().finite(),
    system: z.number().finite().nullable(),
  }),
  [IPC.recorderTrackEnded]: z.object({ meetingId: MeetingIdSchema, kind: TrackKindSchema }),
  [IPC.recorderStopped]: z.object({ meetingId: MeetingIdSchema }),
} satisfies Record<RecorderMessageChannel, z.ZodType>;

export function registerIpc(deps: IpcDeps): void {
  /** Каналы главного окна отвечают только главному окну; ошибки пишутся в журнал и уходят в окно. */
  const handle = <C extends MainInvokeChannel>(
    channel: C,
    handler: (arg: unknown, event: IpcMainInvokeEvent) => Promise<InvokeResult<C>> | InvokeResult<C>,
  ): void => {
    ipcMain.handle(channel, async (event, arg: unknown) => {
      try {
        // Проверка внутри try — чтобы отказ «чужому» окну тоже попал в журнал.
        if (event.sender !== deps.mainContents()) throw new Error(`IPC ${channel}: запрос не из главного окна`);
        return await handler(arg, event);
      } catch (err) {
        deps.logger.error(`IPC ${channel} завершился ошибкой`, err);
        throw err;
      }
    });
  };

  /** Сообщения окна записи: только от окна записи и только правильной формы. */
  const onRecorder = <C extends RecorderMessageChannel>(
    channel: C,
    handler: (message: z.output<(typeof RecorderSchemas)[C]>) => void,
  ): void => {
    ipcMain.on(channel, (event: IpcMainEvent, payload: unknown) => {
      if (event.sender !== deps.recorderContents()) {
        deps.logger.warn(`IPC ${channel}: сообщение не из окна записи`);
        return;
      }
      const parsed = RecorderSchemas[channel].safeParse(payload);
      if (!parsed.success) {
        deps.logger.warn(`IPC ${channel}: неверные данные: ${parsed.error.message}`);
        return;
      }
      handler(parsed.data as z.output<(typeof RecorderSchemas)[C]>);
    });
  };

  const settingsState = (): SettingsState => {
    const settings = deps.settings.get();
    return {
      settings,
      libraryDir: deps.libraryDir(),
      launchAtLoginNotice: deps.launchAtLoginNotice(settings.launchAtLogin),
      hotkey: {
        accelerator: deps.hotkeys.accelerator,
        label: deps.hotkeys.label,
        isDefault: deps.hotkeys.isDefault,
        busy: deps.hotkeys.busy,
      },
    };
  };

  const openFolder = async (dir: string): Promise<void> => {
    try {
      await fsp.mkdir(dir, { recursive: true });
    } catch (err) {
      throw humanFsError('Не удалось открыть папку', err);
    }
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(`Не удалось открыть папку: ${failure}`);
  };

  handle(IPC.getSettings, () => settingsState());

  handle(IPC.setLaunchAtLogin, async (arg) => {
    const enabled = z.boolean().parse(arg);
    await deps.settings.update({ launchAtLogin: enabled });
    deps.applyLaunchAtLogin(enabled);
    return settingsState();
  });

  handle(IPC.chooseLibraryDir, async (_arg, event) => {
    if (deps.controller.getState().phase !== 'idle') {
      throw new Error('Во время записи папку библиотеки менять нельзя.');
    }
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

  handle(IPC.setMicrophone, async (arg) => {
    await deps.settings.update({ microphoneId: z.string().min(1).max(500).nullable().parse(arg) });
    return settingsState();
  });

  handle(IPC.setRecordSounds, async (arg) => {
    await deps.settings.update({ recordSounds: z.boolean().parse(arg) });
    return settingsState();
  });

  handle(IPC.setHotkey, async (arg) => {
    const next = z.string().min(1).max(100).nullable().parse(arg);
    const result = deps.hotkeys.change(next);
    if (!result.ok) return { ok: false, message: result.message, state: settingsState() };
    await deps.settings.update({ recordHotkey: deps.hotkeys.isDefault ? null : deps.hotkeys.accelerator });
    deps.hotkeyChanged();
    return { ok: true, state: settingsState() };
  });

  handle(IPC.suspendHotkey, (arg) => {
    deps.hotkeys.suspend(z.boolean().parse(arg));
  });

  handle(IPC.openLibraryDir, () => openFolder(deps.libraryDir()));

  handle(IPC.openMeetingDir, (arg) => openFolder(meetingDir(deps.libraryDir(), MeetingIdSchema.parse(arg))));

  handle(IPC.listMeetings, () => listMeetings(deps.libraryDir()));

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());

  // Не ждём, пока запись начнётся (на Mac это может занять время ответа на запрос разрешения):
  // ход старта окно видит по событиям recording:state.
  handle(IPC.toggleRecording, () => {
    void deps.controller.toggle();
  });

  handle(IPC.setSystemAudio, (arg) => {
    deps.controller.setSystemAudioNext(z.boolean().parse(arg));
    return deps.controller.getState();
  });

  handle(IPC.dismissStartProblem, () => deps.controller.dismissStartProblem());

  handle(IPC.finishStopDialog, (arg) => deps.controller.finishStopDialog(StopDialogAnswerSchema.parse(arg)));

  handle(IPC.openSystemSettings, async (arg) => {
    const kind = z.enum(['microphone', 'system-audio']).parse(arg);
    await shell.openExternal(systemSettingsUrl(kind, deps.platform));
  });

  onRecorder(IPC.recorderReady, () => deps.onRecorderReady());
  onRecorder(IPC.recorderStarted, (message) => deps.controller.onStarted(message));
  onRecorder(IPC.recorderStartFailed, (message) => deps.controller.onStartFailed(message));
  onRecorder(IPC.recorderChunk, (message) => {
    const bytes = message.data instanceof Uint8Array ? message.data : new Uint8Array(message.data);
    deps.controller.onChunk(message.meetingId, message.kind, bytes);
  });
  onRecorder(IPC.recorderPeaks, (message) => deps.controller.onPeaks(message));
  onRecorder(IPC.recorderTrackEnded, (message) => deps.controller.onTrackEnded(message));
  onRecorder(IPC.recorderStopped, (message) => deps.controller.onStopped(message));
}
```

- [ ] **Step 9: Запуск программы**

`src/main/index.ts`:

```ts
import { join } from 'node:path';
import {
  app,
  dialog,
  globalShortcut,
  Menu,
  powerMonitor,
  protocol,
  session,
  systemPreferences,
  type BrowserWindow,
} from 'electron';
import {
  IPC,
  type MainEventChannel,
  type MainEventContract,
  type RecorderCommandChannel,
  type RecorderCommandContract,
} from '../shared/ipc';
import { macMenuTemplate } from './app-menu';
import { resolveFfmpegPath } from './audio/ffmpeg';
import { meetingsNeedingMix, Mixer } from './audio/mixer';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { HotkeyManager } from './hotkey-manager';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
import { applyPermissionPolicy } from './permissions';
import { RecordingController } from './recording/controller';
import { freeDiskBytes } from './recording/monitors';
import { recoverInterruptedRecordings } from './recording/recovery';
import { createSettingsStore } from './settings/settings-store';
import { dialogTexts, notificationTexts } from './texts';
import { createTray, type AppTray } from './tray';
import { createMainWindow, createRecorderWindow, testMediaMode } from './windows';

// Версия для разработки (npm run dev / npm start) иначе делила бы с установленной программой папку данных
// и блокировку «один экземпляр»: запуск молча уступал бы установленной версии, а тестовые данные попадали
// бы в настоящие. Поэтому у неё своя папка данных и своя библиотека по умолчанию.
const isDevRun = !app.isPackaged && !process.env.TEXTMEET_USER_DATA;

// Только для автотестов: отдельные папки данных и «домашняя» папка, чтобы не трогать настоящие.
// Папка данных задаётся до requestSingleInstanceLock(): блокировка привязана к ней.
if (process.env.TEXTMEET_USER_DATA) app.setPath('userData', process.env.TEXTMEET_USER_DATA);
else if (isDevRun) app.setPath('userData', join(app.getPath('appData'), DEV_FOLDER_NAME));
const homeDir = (): string => process.env.TEXTMEET_HOME ?? app.getPath('home');
const logFile = (): string => join(app.getPath('userData'), 'logs', 'textmeet.log');

// Только для автотестов (TEXTMEET_TEST_MEDIA): поддельный микрофон Chromium вместо настоящего
// и никаких системных запросов разрешений — на машинах GitHub Actions на них некому ответить.
// Разрешение на микрофон по-прежнему решает обработчик программы (permissions.ts).
const testMedia = testMediaMode();
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');

// Протокол плеера регистрируется до готовности приложения — так требует Electron.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Выход подтверждён: окна можно закрывать по-настоящему. */
let quitApproved = false;
let preparingQuit = false;
/** Компьютер выключается или пользователь выходит из системы — без вопросов. */
let systemEnding = false;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;
let recorderReady = false;
const recorderCrashes: number[] = [];
// Второй запуск или щелчок по Dock могут прийти, пока start() ещё не создал окна:
// тогда просьбу показать окно только запоминаем, иначе появится второе, «чужое» главное окно.
let windowsCreated = false;
let showRequested = false;

/** Окно записи перезапускается после сбоя, но не бесконечно: 3 сбоя за минуту — больше не пробуем. */
const RECORDER_CRASH_LIMIT = 3;
const RECORDER_CRASH_WINDOW_MS = 60_000;

function openMainWindow(logger: Logger): void {
  if (!windowsCreated) {
    showRequested = true;
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow(logger, { show: true });
    hideInsteadOfClose(mainWindow);
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Закрытие окна прячет его в трей; по-настоящему окна закрываются только при выходе. */
function hideInsteadOfClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitApproved) return;
    event.preventDefault();
    // macOS: окно во весь экран, спрятанное сразу, оставляет пустой чёрный экран — сначала выходим из полноэкранного режима.
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => win.hide());
      win.setFullScreen(false);
      return;
    }
    win.hide();
  });
}

const mainVisible = (): boolean =>
  !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized();

// Аргумент void означает «без данных».
type Payload<T> = [T] extends [void] ? [] : [T];

function sendToMain<C extends MainEventChannel>(channel: C, ...payload: Payload<MainEventContract[C]>): void {
  const contents = mainWindow?.webContents;
  if (contents && !contents.isDestroyed()) contents.send(channel, ...payload);
}

function sendToRecorder<C extends RecorderCommandChannel>(channel: C, ...payload: Payload<RecorderCommandContract[C]>): void {
  const contents = recorderWindow?.webContents;
  if (contents && !contents.isDestroyed()) contents.send(channel, ...payload);
}

function startRecorderWindow(logger: Logger, controller: RecordingController): BrowserWindow {
  recorderReady = false;
  const win = createRecorderWindow(logger);
  hideInsteadOfClose(win);
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Окно записи завершилось: ${details.reason} (код ${details.exitCode})`);
    if (quitApproved) return;
    recorderReady = false;
    controller.onRecorderGone();
    const now = Date.now();
    recorderCrashes.push(now);
    while (recorderCrashes.length > 0 && now - (recorderCrashes[0] ?? now) > RECORDER_CRASH_WINDOW_MS) recorderCrashes.shift();
    win.destroy();
    if (recorderCrashes.length >= RECORDER_CRASH_LIMIT) {
      logger.error('Окно записи падает снова и снова — больше не перезапускаем');
      recorderWindow = null;
      return;
    }
    recorderWindow = startRecorderWindow(logger, controller);
  });
  return win;
}

async function confirmLowDisk(freeBytes: number): Promise<boolean> {
  const text = dialogTexts.lowDisk(freeBytes);
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: text.title,
    message: text.message,
    detail: text.detail,
    buttons: text.buttons,
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

/** Выход: во время записи — спросить, остановить запись, дописать журнал; отказ оставляет всё как было. */
async function prepareQuit(logger: Logger, controller: RecordingController, hotkeys: HotkeyManager): Promise<void> {
  if (preparingQuit) return;
  preparingQuit = true;
  try {
    if (controller.getState().phase !== 'idle' && !systemEnding) {
      const text = dialogTexts.quitWhileRecording();
      const { response } = await dialog.showMessageBox({
        type: 'question',
        title: text.title,
        message: text.message,
        detail: text.detail,
        buttons: text.buttons,
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response !== 1) return;
    }
    await controller.stopForQuit();
  } catch (err) {
    logger.error('Ошибка при остановке записи перед выходом', err);
  } finally {
    preparingQuit = false;
  }
  if (controller.getState().phase !== 'idle') return;
  hotkeys.dispose();
  logger.info('TextMeet завершает работу');
  await logger.flush();
  quitApproved = true;
  app.quit();
}

/** При запуске: закрыть прерванные сбоем записи и досвести то, что не успело свестись. */
async function recoverAndMix(
  logger: Logger,
  libraryDir: string,
  notify: Notify,
  mixer: Mixer,
  controller: RecordingController,
): Promise<void> {
  try {
    const recovered = await recoverInterruptedRecordings(
      libraryDir,
      logger,
      (id) => controller.getState().meetingId === id,
    );
    if (recovered.length > 0) {
      notify(notificationTexts.recovered(recovered.length));
      sendToMain(IPC.libraryChanged);
    }
    for (const id of meetingsNeedingMix(await listMeetings(libraryDir))) mixer.enqueue(id);
  } catch (err) {
    logger.error('Не удалось проверить прерванные записи', err);
  }
}

async function start(logger: Logger): Promise<void> {
  process.on('uncaughtException', (err) => logger.error('Необработанная ошибка', err));
  process.on('unhandledRejection', (reason) => logger.error('Необработанный отказ промиса', reason));

  app.on('second-instance', () => openMainWindow(logger));
  app.on('activate', () => openMainWindow(logger));
  app.on('window-all-closed', () => {
    // Остаёмся в трее.
  });
  app.on('render-process-gone', (_event, contents, details) => {
    if (contents !== recorderWindow?.webContents) {
      logger.error(`Процесс окна завершился: ${details.reason} (код ${details.exitCode})`);
    }
  });
  if (process.platform === 'win32') app.setAppUserModelId('dev.textmeet.app');

  await app.whenReady();
  const settings = await createSettingsStore(join(app.getPath('userData'), 'settings.json'), logger);
  syncLaunchAtLogin(settings.get().launchAtLogin);
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate(macMenuTemplate()) : null);

  const libraryDir = (): string =>
    resolveLibraryDir(settings.get().libraryDir, homeDir(), isDevRun ? DEV_FOLDER_NAME : LIBRARY_FOLDER_NAME);
  const notify = createNotifier({
    logger,
    openWindow: () => openMainWindow(logger),
    isWindowActive: () => mainVisible() && !!mainWindow?.isFocused(),
  });
  const mixer = new Mixer({
    libraryDir,
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
    onMixed: () => sendToMain(IPC.libraryChanged),
  });

  // Автомату нужна подпись горячей клавиши, а горячей клавише — автомат: связываем через замыкание.
  let hotkeys: HotkeyManager | null = null;
  const controller = new RecordingController({
    platform: process.platform,
    logger,
    recorder: {
      isReady: () => recorderReady && !!recorderWindow && !recorderWindow.isDestroyed(),
      start: (command) => sendToRecorder(IPC.recorderStart, command),
      stop: () => sendToRecorder(IPC.recorderStop),
      playSound: (kind) => sendToRecorder(IPC.recorderPlaySound, kind),
    },
    now: () => Date.now(),
    libraryDir,
    settings: () => settings.get(),
    hotkeyLabel: () => hotkeys?.label ?? '',
    freeBytes: freeDiskBytes,
    confirmLowDisk,
    ensureMicAccess: async () =>
      testMedia !== null || process.platform !== 'darwin' || (await systemPreferences.askForMediaAccess('microphone')),
    notify,
    showMainWindow: () => openMainWindow(logger),
    emitState: (state) => {
      sendToMain(IPC.recordingState, state);
      tray?.update(state.phase, hotkeys?.accelerator ?? '');
    },
    emitPeaks: (peaks) => {
      if (mainVisible()) sendToMain(IPC.recordingPeaks, peaks);
    },
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (id) => mixer.enqueue(id),
  });
  const hotkeyManager = new HotkeyManager(globalShortcut, process.platform, () => void controller.toggle());
  hotkeys = hotkeyManager;
  if (hotkeyManager.init(settings.get().recordHotkey).invalid) {
    logger.warn('Сохранённая горячая клавиша не подходит по правилам — используется стандартная');
  }

  applyPermissionPolicy(session.defaultSession, {
    main: () => mainWindow?.webContents ?? null,
    recorder: () => recorderWindow?.webContents ?? null,
  });
  // Звук компьютера — только окну записи. Источник — сам кадр окна, не экран (вариант Г из спайка):
  // с источником-экраном macOS отвечает «Invalid capture constraints».
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.frame || !recorderWindow || request.frame !== recorderWindow.webContents.mainFrame) {
      callback({});
      return;
    }
    callback({ video: request.frame, audio: 'loopback' });
  });
  protocol.handle(MEDIA_SCHEME, (request) => serveMedia(request, libraryDir()));

  registerIpc({
    settings,
    logger,
    platform: process.platform,
    hotkeys: hotkeyManager,
    controller,
    libraryDir,
    launchAtLoginNotice: currentLaunchAtLoginNotice,
    applyLaunchAtLogin: syncLaunchAtLogin,
    mainContents: () => mainWindow?.webContents ?? null,
    recorderContents: () => recorderWindow?.webContents ?? null,
    appInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      logFile: logFile(),
      recorderReady,
    }),
    onRecorderReady: () => {
      recorderReady = true;
      logger.info('Окно записи готово');
    },
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
  });

  app.on('before-quit', (event) => {
    if (quitApproved) return;
    event.preventDefault();
    void prepareQuit(logger, controller, hotkeyManager);
  });
  const onSystemEnding = (): void => {
    systemEnding = true;
    void controller.stopForQuit();
  };
  powerMonitor.on('shutdown', onSystemEnding);

  recorderWindow = startRecorderWindow(logger, controller);
  mainWindow = createMainWindow(logger, { show: showRequested || !startedAtLogin() });
  hideInsteadOfClose(mainWindow);
  mainWindow.on('session-end', onSystemEnding);
  windowsCreated = true;
  tray = createTray(
    { openWindow: () => openMainWindow(logger), toggleRecording: () => void controller.toggle(), quit: () => app.quit() },
    hotkeyManager.accelerator,
  );
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller);
}

/** Сбой запуска не должен быть молчаливым: пишем в журнал и показываем окно с путём к нему. */
async function reportStartupFailure(logger: Logger, err: unknown): Promise<void> {
  logger.error('Не удалось запуститься', err);
  await logger.flush();
  dialog.showErrorBox(
    'TextMeet не запустился',
    `Подробности — в журнале ошибок:\n${logFile()}\n\n${err instanceof Error ? err.message : String(err)}`,
  );
}

if (app.requestSingleInstanceLock()) {
  // Журнал создаём до start(): иначе ошибку самого запуска некуда записать.
  const logger = createLogger(logFile());
  start(logger).catch((err: unknown) => reportStartupFailure(logger, err).finally(() => app.exit(1)));
} else {
  // Программа уже запущена — она сама покажет окно по событию second-instance.
  app.exit(0);
}
```

- [ ] **Step 10: Типы, тесты, сборка**

Run: `npm run typecheck`
Expected: без ошибок.

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: сборка main, preload и renderer без ошибок.

- [ ] **Step 11: Коммит**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main
git commit -m "feat: wire recording into the Electron shell with a typed IPC contract"
```

---

### Task 12: Окно записи

Скрытое окно записи по командам main: включает микрофон (выбранный отключён — берёт системный), звук компьютера
по рецепту спайка (в тестовом режиме — тон или отказ), пишет каждую дорожку `MediaRecorder` кусками раз в секунду
(порядок кусков сохраняет цепочка обещаний), шлёт пики ~15 раз в секунду, сообщает о пропавшем устройстве,
на «стоп» досылает последние куски и отвечает «остановлено». Команды выполняются строго по очереди.

**Files:**
- Create: `src/renderer/recorder/media.ts`, `src/renderer/recorder/media.test.ts`, `src/renderer/recorder/capture.ts`,
  `src/renderer/recorder/levels.ts`, `src/renderer/recorder/sounds.ts`
- Modify: `src/renderer/recorder/recorder.ts`

- [ ] **Step 1: Тест чистых помощников**

`src/renderer/recorder/media.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { peakOf, soundNotes, testSystemAudioFrom, toFailure } from './media';

describe('toFailure', () => {
  it('keeps the name and message of a DOMException-like error', () => {
    expect(toFailure({ name: 'NotAllowedError', message: 'Permission denied' })).toEqual({
      name: 'NotAllowedError',
      message: 'Permission denied',
    });
  });

  it('handles plain errors, strings and odd values', () => {
    expect(toFailure(new TypeError('bad'))).toEqual({ name: 'TypeError', message: 'bad' });
    expect(toFailure('oops')).toEqual({ name: 'Error', message: 'oops' });
    expect(toFailure({ name: '', message: 5 })).toEqual({ name: 'Error', message: '[object Object]' });
    expect(toFailure(null)).toEqual({ name: 'Error', message: 'null' });
  });
});

describe('peakOf', () => {
  it('returns the largest absolute sample', () => {
    expect(peakOf(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
  });

  it('is 0 for silence and for an empty buffer', () => {
    expect(peakOf(new Float32Array(8))).toBe(0);
    expect(peakOf([])).toBe(0);
  });
});

describe('soundNotes', () => {
  it('goes up for start and down for stop', () => {
    expect(soundNotes('start').map((n) => n.frequency)).toEqual([660, 880]);
    expect(soundNotes('stop').map((n) => n.frequency)).toEqual([880, 660]);
  });

  it('plays the second note after the first', () => {
    const [first, second] = soundNotes('start');
    expect(second!.at).toBeGreaterThanOrEqual(first!.at + first!.duration);
  });
});

describe('testSystemAudioFrom', () => {
  it('reads the test switch from the page address', () => {
    expect(testSystemAudioFrom('?testSystemAudio=tone')).toBe('tone');
    expect(testSystemAudioFrom('?testSystemAudio=fail')).toBe('fail');
    expect(testSystemAudioFrom('?testSystemAudio=other')).toBeNull();
    expect(testSystemAudioFrom('')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/renderer/recorder`
Expected: FAIL — `Failed to resolve import "./media"`.

- [ ] **Step 3: Помощники**

`src/renderer/recorder/media.ts`:

```ts
// Чистые помощники окна записи (без DOM): их проверяют модульные тесты.
import type { MediaFailure, SoundKind } from '../../shared/recording';

/** Любая ошибка getUserMedia / getDisplayMedia / MediaRecorder → имя и текст для main. */
export function toFailure(err: unknown): MediaFailure {
  if (err && typeof err === 'object') {
    const { name, message } = err as { name?: unknown; message?: unknown };
    return {
      name: typeof name === 'string' && name ? name : 'Error',
      message: typeof message === 'string' ? message : String(err),
    };
  }
  return { name: 'Error', message: String(err) };
}

/** Пик (наибольшее по модулю значение) звуковых отсчётов. */
export function peakOf(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i] ?? 0);
    if (value > peak) peak = value;
  }
  return peak;
}

export interface Note {
  frequency: number;
  /** Начало от момента воспроизведения, с. */
  at: number;
  duration: number;
}

/** Сигналы: старт — две ноты вверх, стоп — вниз. */
export function soundNotes(kind: SoundKind): Note[] {
  const [first, second] = kind === 'start' ? [660, 880] : [880, 660];
  return [
    { frequency: first, at: 0, duration: 0.11 },
    { frequency: second, at: 0.12, duration: 0.11 },
  ];
}

export type TestSystemAudio = 'tone' | 'fail' | null;

/** Тестовая подмена звука компьютера из адреса страницы (включает только main для автотестов). */
export function testSystemAudioFrom(search: string): TestSystemAudio {
  const value = new URLSearchParams(search).get('testSystemAudio');
  return value === 'tone' || value === 'fail' ? value : null;
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/renderer/recorder`
Expected: PASS, тестов: 7.

- [ ] **Step 5: Захват, уровни, сигналы**

`src/renderer/recorder/capture.ts`:

```ts
import type { TrackKind } from '../../shared/meeting';
import type { MediaFailure, RecorderStartCommand } from '../../shared/recording';
import { toFailure, type TestSystemAudio } from './media';

const MIME_TYPE = 'audio/webm;codecs=opus';
const BITS_PER_SECOND = 64_000;
/** Кусок раз в секунду: сбой программы теряет не больше секунды записи. */
const TIMESLICE_MS = 1000;

export interface CaptureEvents {
  chunk(kind: TrackKind, data: ArrayBuffer): void;
  /** Устройство пропало (микрофон выдернули, звук компьютера отключился). */
  trackEnded(kind: TrackKind): void;
}

export interface Capture {
  micLabel: string;
  tracks: { kind: TrackKind; startedAt: number }[];
  systemFailure: MediaFailure | null;
  streams: { kind: TrackKind; stream: MediaStream }[];
  /** Останавливает запись, дожидается отправки последних кусков и отпускает устройства. */
  stop(): Promise<void>;
}

/** Микрофон без обработки браузера: эхо- и шумоподавление портят распознавание. */
function microphone(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
    },
    video: false,
  });
}

/** Выбранный в настройках микрофон отключён — пишем с микрофона, выбранного в системе (его название видно в окне). */
async function openMicrophone(deviceId: string | null): Promise<MediaStream> {
  try {
    return await microphone(deviceId);
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) return microphone(null);
    throw err;
  }
}

/** Звук компьютера — рецепт спайка (вариант Г): кадр окна + loopback, без своего звука и без обработки. */
async function openSystemAudio(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: 320, height: 240, frameRate: 1 },
    // restrictOwnAudio нет в типах DOM этой версии TypeScript.
    audio: {
      restrictOwnAudio: true,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    } as MediaTrackConstraints,
  });
  // Видео не нужно: сразу отпускаем.
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  if (stream.getAudioTracks().length === 0) throw new DOMException('Нет звуковой дорожки', 'NotFoundError');
  return stream;
}

/** Только для автотестов: тон вместо звука компьютера. */
function toneStream(): { stream: MediaStream; close(): void } {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  oscillator.frequency.value = 330;
  const gain = context.createGain();
  gain.gain.value = 0.2;
  const destination = context.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  return { stream: destination.stream, close: () => void context.close() };
}

interface RecordedTrack {
  kind: TrackKind;
  recorder: MediaRecorder;
  startedAt: number;
  /** Завершается, когда запись остановлена и все куски отправлены. */
  finished: Promise<void>;
}

function recordTrack(kind: TrackKind, stream: MediaStream, events: CaptureEvents): Promise<RecordedTrack> {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), {
      mimeType: MIME_TYPE,
      audioBitsPerSecond: BITS_PER_SECOND,
    });
    // Blob → ArrayBuffer асинхронно: цепочка сохраняет порядок кусков.
    let delivery = Promise.resolve();
    const finished = new Promise<void>((done) => {
      recorder.addEventListener('stop', () => void delivery.then(done));
    });
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size === 0) return;
      delivery = delivery
        .then(async () => events.chunk(kind, await event.data.arrayBuffer()))
        .catch((err: unknown) => console.error('TextMeet: кусок записи не отправлен', err));
    });
    let started = false;
    recorder.addEventListener(
      'start',
      () => {
        started = true;
        resolve({ kind, recorder, startedAt: Date.now(), finished });
      },
      { once: true },
    );
    // До старта ошибка — это отказ записи; после — дорожка перестала писаться, об этом узнает main.
    recorder.addEventListener('error', (event) => {
      if (started) events.trackEnded(kind);
      else reject((event as ErrorEvent).error ?? event);
    });
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => events.trackEnded(kind), { once: true });
    }
    recorder.start(TIMESLICE_MS);
  });
}

/** Включает микрофон (обязательно) и звук компьютера (если просили; отказ — не ошибка) и начинает запись. */
export async function startCapture(
  command: RecorderStartCommand,
  events: CaptureEvents,
  testSystemAudio: TestSystemAudio,
): Promise<Capture> {
  const mic = await openMicrophone(command.micDeviceId);
  const cleanup: (() => void)[] = [() => mic.getTracks().forEach((t) => t.stop())];
  try {
    let system: MediaStream | null = null;
    let systemFailure: MediaFailure | null = null;
    if (command.systemAudio) {
      try {
        if (testSystemAudio === 'fail') throw new DOMException('Тестовый отказ', 'NotReadableError');
        if (testSystemAudio === 'tone') {
          const tone = toneStream();
          cleanup.push(tone.close);
          system = tone.stream;
        } else {
          system = await openSystemAudio();
        }
        const systemStream = system;
        cleanup.push(() => systemStream.getTracks().forEach((t) => t.stop()));
      } catch (err) {
        systemFailure = toFailure(err);
      }
    }
    const streams = [{ kind: 'mic' as const, stream: mic }, ...(system ? [{ kind: 'system' as const, stream: system }] : [])];
    const recorded = await Promise.all(streams.map((s) => recordTrack(s.kind, s.stream, events)));
    return {
      micLabel: mic.getAudioTracks()[0]?.label ?? '',
      tracks: recorded.map((r) => ({ kind: r.kind, startedAt: r.startedAt })),
      systemFailure,
      streams,
      stop: async () => {
        for (const r of recorded) if (r.recorder.state !== 'inactive') r.recorder.stop();
        await Promise.all(recorded.map((r) => r.finished));
        for (const release of cleanup) release();
      },
    };
  } catch (err) {
    for (const release of cleanup) release();
    throw err;
  }
}
```

`src/renderer/recorder/levels.ts`:

```ts
import type { TrackKind } from '../../shared/meeting';
import type { Peaks } from '../../shared/recording';
import { peakOf } from './media';

/** Уровни дорожек по AnalyserNode: пик последних ~40 мс звука. */
export class LevelMeter {
  private readonly context = new AudioContext();
  private readonly analysers = new Map<TrackKind, { node: AnalyserNode; samples: Float32Array<ArrayBuffer> }>();

  constructor(streams: readonly { kind: TrackKind; stream: MediaStream }[]) {
    // Окно скрыто и без нажатий: контекст может начаться «на паузе».
    void this.context.resume();
    for (const { kind, stream } of streams) {
      const node = this.context.createAnalyser();
      node.fftSize = 2048;
      this.context.createMediaStreamSource(stream).connect(node);
      this.analysers.set(kind, { node, samples: new Float32Array(node.fftSize) });
    }
  }

  peaks(): Peaks {
    const read = (kind: TrackKind): number | null => {
      const analyser = this.analysers.get(kind);
      if (!analyser) return null;
      analyser.node.getFloatTimeDomainData(analyser.samples);
      return peakOf(analyser.samples);
    };
    return { mic: read('mic') ?? 0, system: read('system') };
  }

  close(): Promise<void> {
    return this.context.close();
  }
}
```

`src/renderer/recorder/sounds.ts`:

```ts
import type { SoundKind } from '../../shared/recording';
import { soundNotes } from './media';

const VOLUME = 0.18;
let context: AudioContext | null = null;

/** Короткий сигнал старта или стопа — без звуковых файлов, синусом. */
export function playSound(kind: SoundKind): void {
  context ??= new AudioContext();
  const ctx = context;
  void ctx.resume();
  const t0 = ctx.currentTime + 0.02;
  for (const note of soundNotes(kind)) {
    const start = t0 + note.at;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = note.frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(VOLUME, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.01);
  }
}
```

- [ ] **Step 6: Окно записи**

`src/renderer/recorder/recorder.ts`:

```ts
// Скрытое окно записи: по командам main включает устройства, пишет дорожки кусками и шлёт уровни.
import type { RecorderStartCommand } from '../../shared/recording';
import { startCapture, type Capture } from './capture';
import { LevelMeter } from './levels';
import { testSystemAudioFrom, toFailure } from './media';
import { playSound } from './sounds';

/** Уровни ~15 раз в секунду. */
const PEAKS_INTERVAL_MS = 66;
const testSystemAudio = testSystemAudioFrom(window.location.search);

interface Session {
  meetingId: string;
  capture: Capture;
  meter: LevelMeter;
  timer: ReturnType<typeof setInterval>;
}

let session: Session | null = null;
// Команды выполняются строго по очереди: «стоп» не обгонит незаконченный «старт».
let queue: Promise<void> = Promise.resolve();
const enqueue = (task: () => Promise<void>): void => {
  queue = queue.then(task).catch((err: unknown) => console.error('TextMeet: ошибка окна записи', err));
};

async function start(command: RecorderStartCommand): Promise<void> {
  if (session) await stop();
  const { meetingId } = command;
  try {
    const capture = await startCapture(
      command,
      {
        chunk: (kind, data) => window.recorder.chunk({ meetingId, kind, data }),
        trackEnded: (kind) => window.recorder.trackEnded({ meetingId, kind }),
      },
      testSystemAudio,
    );
    const meter = new LevelMeter(capture.streams);
    const timer = setInterval(() => window.recorder.peaks({ meetingId, ...meter.peaks() }), PEAKS_INTERVAL_MS);
    session = { meetingId, capture, meter, timer };
    window.recorder.started({
      meetingId,
      tracks: capture.tracks,
      micLabel: capture.micLabel,
      systemFailure: capture.systemFailure,
    });
  } catch (err) {
    window.recorder.startFailed({ meetingId, failure: toFailure(err) });
  }
}

async function stop(): Promise<void> {
  const current = session;
  if (!current) return;
  session = null;
  clearInterval(current.timer);
  await current.capture.stop();
  await current.meter.close().catch(() => undefined);
  window.recorder.stopped({ meetingId: current.meetingId });
}

window.recorder.onStart((command) => enqueue(() => start(command)));
window.recorder.onStop(() => enqueue(stop));
window.recorder.onPlaySound((kind) => playSound(kind));
window.recorder.ready();
```

- [ ] **Step 7: Типы и сборка**

Run: `npm run typecheck && npm run build`
Expected: без ошибок.

- [ ] **Step 8: Коммит**

```bash
git add src/renderer/recorder
git commit -m "feat: capture microphone and computer sound in the recorder window"
```

---

### Task 13: Главное окно в стиле «Бумага»

Новый вид по утверждённому макету: боковая панель (блок записи всегда вверху, список встреч по дням, «Открыть папку
библиотеки» и настройки внизу), правая часть — идущая запись, встреча с плеером, настройки; окно «Запись остановлена».
Старые экраны удаляются. Шрифты Golos Text и Literata встроены (`@fontsource`). Одна задача, потому что новые помощники
форматирования заменяют старые, которыми пользовались удаляемые экраны.

**Files:**
- Modify: `src/renderer/main/format.ts`, `src/renderer/main/format.test.ts`, `src/renderer/main/styles.css`,
  `src/renderer/main/main.tsx`, `src/renderer/main/index.html`, `src/renderer/main/App.tsx`
- Create: `src/renderer/main/icons.tsx`, `hooks.ts`, `Meter.tsx`, `RecordPanel.tsx`, `MeetingList.tsx`, `Player.tsx`,
  `MeetingPane.tsx`, `LivePane.tsx`, `HotkeyField.tsx`, `SettingsPane.tsx`, `StopDialog.tsx` (все в `src/renderer/main/`)
- Delete: `src/renderer/main/LibraryScreen.tsx`, `src/renderer/main/SettingsScreen.tsx`

- [ ] **Step 1: Тест помощников форматирования**

`src/renderer/main/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import {
  cleanDeviceLabel,
  dayLabel,
  formatClock,
  formatDuration,
  formatDurationWithSeconds,
  formatLongDate,
  formatTimeOfDay,
  groupByDay,
  hotkeyKeys,
  launchAtLoginNoticeText,
  meetingNote,
  parseParticipants,
  participantsText,
  pluralize,
} from './format';

const meeting = (id: string, createdAt: Date, patch: Partial<Meeting> = {}): Meeting => ({
  schemaVersion: 1,
  id,
  title: id,
  createdAt: createdAt.toISOString(),
  durationSec: 60,
  source: 'recording',
  participantsHint: null,
  model: null,
  status: 'done',
  errorMessage: null,
  speakerNames: {},
  tracks: [],
  recovered: false,
  ...patch,
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

describe('formatClock', () => {
  it.each([
    [0, '00:00:00'],
    [23 * 60 + 41.9, '00:23:41'],
    [3 * 3600 + 5, '03:00:05'],
    [-4, '00:00:00'],
    [Number.NaN, '00:00:00'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});

describe('formatDurationWithSeconds', () => {
  it.each([
    [15, '15 с'],
    [42 * 60 + 15, '42 мин 15 с'],
    [3600 + 2 * 60 + 5, '1 ч 02 мин 05 с'],
    [-1, '0 с'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDurationWithSeconds(seconds)).toBe(expected);
  });
});

describe('dates', () => {
  it('formats the time of day and the long date in local time', () => {
    const iso = new Date(2026, 8, 27, 16, 5).toISOString();
    expect(formatTimeOfDay(iso)).toBe('16:05');
    expect(formatLongDate(iso)).toBe('27 сентября 2026, 16:05');
  });

  it('shows a dash for garbage', () => {
    expect(formatTimeOfDay('вчера')).toBe('—');
    expect(formatLongDate('вчера')).toBe('—');
  });
});

describe('pluralize / participantsText', () => {
  it.each([
    [1, '1 участник'],
    [2, '2 участника'],
    [4, '4 участника'],
    [5, '5 участников'],
    [11, '11 участников'],
    [12, '12 участников'],
    [21, '21 участник'],
    [22, '22 участника'],
  ])('%s → %s', (n, text) => {
    expect(participantsText(n)).toBe(text);
  });

  it('works for other words', () => {
    expect(pluralize(3, 'встреча', 'встречи', 'встреч')).toBe('встречи');
  });
});

describe('parseParticipants', () => {
  it.each([
    ['7', 7],
    [' 12 ', 12],
    ['1', 1],
    ['50', 50],
    ['0', null],
    ['51', null],
    ['2.5', null],
    ['пять', null],
    ['', null],
    ['100', null],
  ])('%j → %s', (text, value) => {
    expect(parseParticipants(text)).toBe(value);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 28, 15, 0);

  it('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 8, 28, 0, 1), now)).toBe('Сегодня');
    expect(dayLabel(new Date(2026, 8, 27, 23, 59), now)).toBe('Вчера');
  });

  it('shows the date, with the year only for other years', () => {
    expect(dayLabel(new Date(2026, 8, 25, 21, 9), now)).toBe('25 сентября');
    expect(dayLabel(new Date(2025, 11, 31, 10, 0), now)).toBe('31 декабря 2025');
  });

  it('knows yesterday across a month border', () => {
    expect(dayLabel(new Date(2026, 8, 30, 12, 0), new Date(2026, 9, 1, 9, 0))).toBe('Вчера');
  });
});

describe('groupByDay', () => {
  const now = new Date(2026, 8, 28, 15, 0);

  it('groups consecutive meetings of one day', () => {
    const entries: MeetingListEntry[] = [
      { kind: 'ok', meeting: meeting('a', new Date(2026, 8, 28, 14, 30)), mixReady: false },
      { kind: 'creating', id: '2026-09-28_1100_bbbbbb' },
      { kind: 'ok', meeting: meeting('c', new Date(2026, 8, 27, 16, 20)), mixReady: false },
      { kind: 'broken', id: '2026-09-25_2109_dddddd', reason: 'x' },
      { kind: 'broken', id: 'странная-папка', reason: 'x' },
    ];
    expect(groupByDay(entries, now).map((g) => [g.label, g.entries.length])).toEqual([
      ['Сегодня', 2],
      ['Вчера', 1],
      ['25 сентября', 1],
      ['Без даты', 1],
    ]);
  });

  it('returns no groups for an empty library', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('meetingNote', () => {
  const at = new Date(2026, 8, 28);

  it('marks only meetings with something to say', () => {
    expect(meetingNote(meeting('a', at, { status: 'done' }))).toBeNull();
    expect(meetingNote(meeting('a', at, { status: 'recorded' }))).toEqual({ text: 'записано', tone: 'accent' });
    expect(meetingNote(meeting('a', at, { status: 'recorded', recovered: true }))).toEqual({
      text: 'восстановлена после сбоя',
      tone: 'warn',
    });
    expect(meetingNote(meeting('a', at, { status: 'recording' }))?.tone).toBe('live');
    expect(meetingNote(meeting('a', at, { status: 'queued' }))?.text).toBe('в очереди на расшифровку');
    expect(meetingNote(meeting('a', at, { status: 'transcribing' }))?.text).toBe('расшифровка…');
    expect(meetingNote(meeting('a', at, { status: 'error' }))).toEqual({ text: 'ошибка', tone: 'error' });
  });
});

describe('cleanDeviceLabel', () => {
  it.each([
    ['Default - Микрофон (Logitech PRO X)', 'Микрофон (Logitech PRO X)'],
    ['По умолчанию — Микрофон MacBook Air', 'Микрофон MacBook Air'],
    ['Communications - Headset', 'Headset'],
    ['Микрофон (Realtek)', 'Микрофон (Realtek)'],
  ])('%s → %s', (label, clean) => {
    expect(cleanDeviceLabel(label)).toBe(clean);
  });
});

describe('hotkeyKeys', () => {
  it('splits Windows and Mac labels into keys', () => {
    expect(hotkeyKeys('Ctrl+Space', 'win32')).toEqual(['Ctrl', 'Space']);
    expect(hotkeyKeys('F9', 'win32')).toEqual(['F9']);
    expect(hotkeyKeys('⌥ Space', 'darwin')).toEqual(['⌥', 'Space']);
    expect(hotkeyKeys('⌃⌥⇧ R', 'darwin')).toEqual(['⌃', '⌥', '⇧', 'R']);
    expect(hotkeyKeys('F5', 'darwin')).toEqual(['F5']);
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

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/renderer/main/format.test.ts`
Expected: FAIL — нет `formatClock`, `groupByDay`, `meetingNote`, `hotkeyKeys` и др.

- [ ] **Step 3: Помощники форматирования**

`src/renderer/main/format.ts`:

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';

const pad = (n: number): string => String(n).padStart(2, '0');

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** 75 → «1:15», 3725 → «1:02:05», неизвестно → «—». Для таймера и плеера. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Таймер записи: всегда с часами — «00:23:41». */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** «42 мин 15 с», «1 ч 02 мин 05 с», «15 с» — для окна «Запись остановлена». */
export function formatDurationWithSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} ч ${pad(m)} мин ${pad(s)} с`;
  if (m > 0) return `${m} мин ${pad(s)} с`;
  return `${s} с`;
}

/** Время дня «14:30» по ISO-дате (местное). */
export function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «27 сентября 2026, 16:20» */
export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 1 участник, 2 участника, 5 участников, 21 участник. */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «Другое» число участников: целое от 1 до 50; иначе null. */
export function parseParticipants(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 50 ? n : null;
}

export function participantsText(n: number): string {
  return `${n} ${pluralize(n, 'участник', 'участника', 'участников')}`;
}

/** Местная дата встречи: из createdAt, а для «создаётся»/«повреждена» — из имени папки. */
function entryDate(entry: MeetingListEntry): Date | null {
  if (entry.kind === 'ok') {
    const d = new Date(entry.meeting.createdAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})_/.exec(entryId(entry));
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi);
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** «Сегодня», «Вчера», «25 сентября», «25 сентября 2025». */
export function dayLabel(date: Date, now: Date): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Сегодня';
  if (dayKey(date) === dayKey(yesterday)) return 'Вчера';
  const base = `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export interface DayGroup {
  label: string;
  entries: MeetingListEntry[];
}

/** Встречи по дням в том порядке, в каком пришли (новые сверху). */
export function groupByDay(entries: readonly MeetingListEntry[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const date = entryDate(entry);
    const label = date ? dayLabel(date, now) : 'Без даты';
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export type NoteTone = 'accent' | 'warn' | 'error' | 'live';

export interface MeetingNote {
  text: string;
  tone: NoteTone;
}

/** Пометка встречи в списке — только если есть о чём сказать. У готовой встречи пометки нет. */
export function meetingNote(meeting: Meeting): MeetingNote | null {
  switch (meeting.status) {
    case 'recording':
      return { text: 'идёт запись', tone: 'live' };
    case 'recorded':
      return meeting.recovered
        ? { text: 'восстановлена после сбоя', tone: 'warn' }
        : { text: 'записано', tone: 'accent' };
    case 'queued':
      return { text: 'в очереди на расшифровку', tone: 'accent' };
    case 'transcribing':
      return { text: 'расшифровка…', tone: 'accent' };
    case 'error':
      return { text: 'ошибка', tone: 'error' };
    case 'done':
      return null;
  }
}

/** Убирает приставку «По умолчанию — » / «Default - » из названия устройства. */
export function cleanDeviceLabel(label: string): string {
  return label.replace(/^(default|по умолчанию|communications|связь)\s*[-–—]\s*/i, '').trim();
}

/** Клавиши комбинации для показа по отдельности: «Ctrl+Space» → [Ctrl, Space]; «⌃⌥ R» → [⌃, ⌥, R]. */
export function hotkeyKeys(label: string, platform: string): string[] {
  if (platform !== 'darwin') return label.split('+').filter(Boolean);
  const [symbols = '', ...rest] = label.split(' ');
  return rest.length === 0 ? [symbols] : [...symbols, rest.join(' ')];
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

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/renderer/main`
Expected: PASS.

- [ ] **Step 5: Оформление и шрифты**

Токены цветов — из `project/tm.css` макета; тёмная тема — по системе.

`src/renderer/main/styles.css`:

```css
/* Оформление «Бумага» — по утверждённому макету (docs/superpowers/specs/2026-09-28-textmeet-plan-2-design.md). */
:root {
  color-scheme: light dark;
  --bg: #f7f3ea;
  --side: #eee8db;
  --surface: #fffdf8;
  --text: #26221b;
  --muted: #736b5c;
  --line: #dcd3c2;
  --sel: #e3dccb;
  --now: #f3e6b3;
  --rec: #b8352a;
  --rec-text: #fffdf8;
  --rec-soft: #f2dcd5;
  --meter-on: #26221b;
  --meter-off: #dcd3c2;
  --btn: #26221b;
  --btn-text: #f7f3ea;
  --accent: #2e4f86;
  --warn: #855700;
  --warn-soft: #f4e6c4;
  --shade: rgba(38, 34, 27, 0.42);
  --f-ui: 'Golos Text', 'Segoe UI', -apple-system, sans-serif;
  --f-text: 'Literata', Georgia, serif;
  --r: 6px;
  font-family: var(--f-ui);
  font-size: 13.5px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1d1b17;
    --side: #23201b;
    --surface: #2a2620;
    --text: #eee7d7;
    --muted: #a69d8b;
    --line: #3a352c;
    --sel: #352f26;
    --now: #4a4020;
    --rec: #f0624f;
    --rec-text: #1d1b17;
    --rec-soft: #3e231e;
    --meter-on: #eee7d7;
    --meter-off: #3a352c;
    --btn: #eee7d7;
    --btn-text: #1d1b17;
    --accent: #9db6e6;
    --warn: #e8b04b;
    --warn-soft: #3b2f17;
    --shade: rgba(0, 0, 0, 0.55);
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

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Поле ввода горячей клавиши подсвечено своей рамкой. */
.keybox:focus-visible {
  outline: none;
}

/* Тонкие полосы прокрутки в цвет «бумаги». */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--muted);
}

::-webkit-scrollbar-track {
  background: transparent;
}

.ic {
  width: 16px;
  height: 16px;
  flex: none;
}

.app {
  display: flex;
  height: 100vh;
  position: relative;
}

/* ---- Боковая панель ---- */
.side {
  width: 300px;
  flex: none;
  background: var(--side);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 14px 12px 12px;
  gap: 12px;
}

.rec {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.rec.idle {
  gap: 12px;
}

.start,
.stop {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: var(--r);
  background: var(--rec);
  color: var(--rec-text);
  font-weight: 600;
}

.start {
  height: 46px;
  padding: 0 14px;
  font-size: 15px;
}

.start:disabled,
.stop:disabled {
  cursor: default;
  opacity: 0.75;
}

.start .rdot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}

.start kbd,
.stop kbd {
  font-family: var(--f-ui);
  font-size: 11px;
  font-weight: 400;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid currentColor;
}

.start kbd {
  margin-left: auto;
}

.stop {
  justify-content: center;
  height: 40px;
  margin-top: 6px;
}

.stop.big {
  height: 48px;
  padding: 0 24px;
  font-size: 15px;
  margin-top: 0;
}

.stop .sq {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}

.tog {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
}

.sw {
  width: 34px;
  height: 20px;
  border-radius: 10px;
  background: var(--meter-off);
  border: 0;
  position: relative;
  flex: none;
  padding: 0;
  margin-top: 1px;
}

.sw i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface);
  transition: left 120ms ease;
}

.sw[aria-checked='true'] {
  background: var(--btn);
}

.sw[aria-checked='true'] i {
  left: 16px;
  background: var(--btn-text);
}

.sw:disabled {
  cursor: default;
  opacity: 0.6;
}

.tog b {
  display: block;
  font-weight: 500;
  font-size: 13px;
}

.tog small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
  line-height: 1.4;
}

.micline {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  min-width: 0;
}

.micline span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-top {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 2px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--rec);
  box-shadow: 0 0 0 4px var(--rec-soft);
  flex: none;
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}

.rec-lbl {
  color: var(--rec);
  font-weight: 600;
  font-size: 12.5px;
  flex: 1;
}

.timer {
  font-family: var(--f-text);
  font-size: 23px;
  font-variant-numeric: tabular-nums;
}

.mrow {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
}

.mrow .ic {
  width: 14px;
  height: 14px;
}

.flag {
  margin-left: auto;
  color: var(--warn);
  font-weight: 500;
}

.meter {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
}

.meter.big {
  height: 12px;
  border-radius: 6px;
}

.meter i {
  flex: 1;
  background: var(--meter-off);
}

.meter i.on {
  background: var(--meter-on);
}

.problem {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--r);
  background: var(--rec-soft);
  font-size: 12.5px;
  line-height: 1.45;
}

.problem-actions {
  display: flex;
  gap: 8px;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.grp {
  font-family: var(--f-text);
  font-style: italic;
  font-size: 13px;
  color: var(--muted);
  padding: 10px 10px 4px;
}

.it {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--r);
  padding: 8px 10px;
}

.it:hover {
  background: color-mix(in srgb, var(--sel) 55%, transparent);
}

.it[aria-current='true'] {
  background: var(--sel);
}

.it b {
  font-weight: 600;
  font-size: 13.5px;
}

.it .meta-line {
  font-size: 12px;
  color: var(--muted);
}

.tone-accent {
  color: var(--accent);
}

.tone-warn {
  color: var(--warn);
}

.tone-error,
.tone-live {
  color: var(--rec);
}

.empty-list {
  padding: 10px;
  color: var(--muted);
  line-height: 1.5;
}

.foot {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 13px;
  white-space: nowrap;
}

.btn:hover {
  border-color: var(--muted);
}

.btn.pri {
  background: var(--btn);
  color: var(--btn-text);
  border-color: var(--btn);
}

.btn.ghost {
  background: transparent;
  border-color: transparent;
}

.btn.ghost:hover {
  border-color: var(--line);
}

.btn.on {
  background: var(--sel);
  border-color: var(--muted);
}

.sq-btn {
  width: 34px;
  padding: 0;
}

.foot .grow {
  flex: 1;
}

/* ---- Правая часть ---- */
.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.head {
  padding: 26px 36px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--line);
}

.head h1 {
  margin: 0;
  font-family: var(--f-text);
  font-size: 29px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.meta {
  color: var(--muted);
  font-size: 13px;
}

.acts {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.banner {
  margin: 16px 36px 0;
  padding: 14px 16px;
  border-radius: var(--r);
  background: var(--warn-soft);
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.banner > .ic {
  color: var(--warn);
  width: 20px;
  height: 20px;
}

.banner b {
  display: block;
  font-weight: 600;
  margin-bottom: 3px;
}

.banner p {
  margin: 0;
  line-height: 1.5;
}

.banner .acts {
  margin-top: 10px;
}

.empty-note {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  text-align: center;
  padding: 0 80px;
  line-height: 1.5;
}

.empty-note b {
  font-family: var(--f-text);
  font-size: 18px;
  color: var(--text);
  font-weight: 600;
}

.reason {
  white-space: pre-wrap;
  color: var(--muted);
  font-size: 12.5px;
  text-align: left;
}

.live {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 0 80px;
  min-height: 0;
}

.live-state {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--rec);
  font-weight: 600;
  font-size: 14px;
}

.big-timer {
  font-family: var(--f-text);
  font-size: 72px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1;
}

.bms {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bm-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  min-width: 0;
}

.bm-head b {
  font-weight: 600;
}

.bm-head span {
  color: var(--muted);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-head .flag {
  flex: none;
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
  text-align: center;
  line-height: 1.5;
}

.live-foot {
  padding: 12px 36px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: var(--side);
}

/* ---- Плеер ---- */
.player {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 36px;
  border-top: 1px solid var(--line);
  background: var(--side);
}

.player.pending {
  color: var(--muted);
  font-size: 12.5px;
}

.play {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--btn);
  color: var(--btn-text);
  border: 0;
  flex: none;
}

.ptime {
  font-family: var(--f-text);
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
}

.track {
  flex: 1;
  accent-color: var(--text);
}

.speed {
  font-size: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 3px 8px;
  color: var(--muted);
  background: transparent;
  min-width: 44px;
}

/* ---- Настройки ---- */
.set {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 30px 48px 24px;
}

.set > h1 {
  font-family: var(--f-text);
  font-size: 30px;
  font-weight: 600;
  margin: 0 0 4px;
}

.sec {
  padding: 20px 0 4px;
  border-top: 1px solid var(--line);
  margin-top: 16px;
  max-width: 760px;
}

.sec h2 {
  margin: 0 0 2px;
  font-family: var(--f-text);
  font-size: 19px;
  font-weight: 600;
}

.fld {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 18px;
  padding: 12px 0;
}

.fld > .lb {
  font-weight: 500;
  padding-top: 8px;
}

/* Строка с переключателем: подпись вровень с ним. */
.fld.tight > .lb {
  padding-top: 1px;
}

.ctl {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: flex-start;
  min-width: 0;
}

.ctl small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.hr {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.selw {
  position: relative;
  display: inline-flex;
  max-width: 100%;
}

.selw select {
  appearance: none;
  height: 34px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  min-width: 360px;
  max-width: 100%;
}

.selw .ic {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 14px;
  height: 14px;
  pointer-events: none;
  color: var(--muted);
}

.keybox {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  min-width: 170px;
}

.keybox.cap {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  color: var(--muted);
}

.keybox.bad {
  border-color: var(--rec);
}

kbd.k {
  font-family: var(--f-ui);
  font-size: 12.5px;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
}

.err {
  color: var(--rec);
  font-size: 12.5px;
  line-height: 1.45;
  margin: 0;
}

.wrn {
  color: var(--warn);
  font-size: 12.5px;
  line-height: 1.45;
  margin: 0;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.path {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12.5px;
  word-break: break-all;
}

.notice {
  padding: 8px 12px;
  border-radius: var(--r);
  background: var(--warn-soft);
  font-size: 12.5px;
  line-height: 1.45;
}

.about {
  color: var(--muted);
  font-size: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  margin-top: 18px;
  max-width: 760px;
  word-break: break-all;
}

/* ---- Окно «Запись остановлена» ---- */
.shade {
  position: absolute;
  inset: 0;
  background: var(--shade);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.dlg {
  width: 480px;
  max-width: calc(100% - 32px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 24px 26px 20px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dlg h2 {
  margin: 0;
  font-family: var(--f-text);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.dlg .meta {
  margin-top: -8px;
}

.lab {
  font-weight: 500;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inp {
  height: 36px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--bg);
  padding: 0 12px;
  width: 100%;
}

.q {
  font-weight: 600;
  font-size: 14.5px;
  margin-top: 4px;
}

.nums {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.num {
  width: 44px;
  height: 44px;
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--bg);
  font-family: var(--f-text);
  font-size: 17px;
}

.num[aria-pressed='true'] {
  background: var(--btn);
  color: var(--btn-text);
  border-color: var(--btn);
}

.other {
  width: 96px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--bg);
  padding: 0 10px;
}

.note {
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.5;
  margin: 0;
}

.dlg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.dlg-foot .btn {
  height: 38px;
  padding: 0 16px;
}

.pad {
  padding: 24px;
}

.muted {
  color: var(--muted);
}
```

`src/renderer/main/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Шрифты встроены в программу: работают без интернета.
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/600.css';
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

Политика безопасности страницы: шрифты — свои, звук плеера — только по протоколу `tm-media:`.

`src/renderer/main/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src tm-media:"
    />
    <title>TextMeet</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Значки, хуки, индикатор уровня**

`src/renderer/main/icons.tsx`:

```tsx
// Значки — тонкий контур 24×24, цвет берут у текста.
import type { ReactNode } from 'react';

function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const ScreenIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icon>
);

export const FolderIcon = () => (
  <Icon>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

export const WarnIcon = () => (
  <Icon>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v4M12 17.5v.5" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon filled>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Icon>
);
```

`src/renderer/main/hooks.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingListEntry } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';

/** Состояние записи из main: сначала запрос, дальше — события. */
export function useRecordingState(): RecordingState | null {
  const [state, setState] = useState<RecordingState | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.textmeet.onRecordingState((next) => setState(next));
    window.textmeet
      .getRecordingState()
      .then((initial) => {
        // Событие могло прийти раньше ответа — оно новее.
        if (active) setState((current) => current ?? initial);
      })
      .catch((err: unknown) => console.error('TextMeet: состояние записи не получено', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}

const SILENT: Peaks = { mic: 0, system: null };

/** Уровни дорожек, пока идёт запись. */
export function usePeaks(active: boolean): Peaks {
  const [peaks, setPeaks] = useState<Peaks>(SILENT);
  useEffect(() => {
    if (!active) {
      setPeaks(SILENT);
      return;
    }
    return window.textmeet.onPeaks(setPeaks);
  }, [active]);
  return peaks;
}

/** Текущее время, обновляется, пока active (таймер записи). */
export function useNow(active: boolean, intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** Список встреч: при запуске, при изменениях из main и при возврате фокуса (встречи из OneDrive). */
export function useMeetings(): { entries: MeetingListEntry[] | null; error: string | null } {
  const [entries, setEntries] = useState<MeetingListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Перечитывания могут наложиться — показываем только ответ на последний запрос.
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const list = await window.textmeet.listMeetings();
      if (request !== latestRequest.current) return;
      setEntries(list);
      setError(null);
    } catch (err) {
      if (request === latestRequest.current) setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    const unsubscribe = window.textmeet.onLibraryChanged(() => void reload());
    return () => {
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [reload]);

  return { entries, error };
}

export interface Microphone {
  deviceId: string;
  label: string;
}

/** Микрофоны компьютера (названия видны, потому что main разрешает главному окну проверку «media»). */
export function useMicrophones(): { devices: Microphone[]; defaultLabel: string | null } {
  const [result, setResult] = useState<{ devices: Microphone[]; defaultLabel: string | null }>({
    devices: [],
    defaultLabel: null,
  });
  useEffect(() => {
    let active = true;
    const load = async () => {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const defaultDevice = all.find((d) => d.deviceId === 'default');
      const devices = all
        .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
        .map((d, i) => ({ deviceId: d.deviceId, label: cleanDeviceLabel(d.label) || `Микрофон ${i + 1}` }));
      const defaultLabel = defaultDevice ? cleanDeviceLabel(defaultDevice.label) || null : (devices[0]?.label ?? null);
      if (active) setResult({ devices, defaultLabel });
    };
    const reload = () => void load().catch((err: unknown) => console.error('TextMeet: микрофоны не прочитаны', err));
    reload();
    navigator.mediaDevices.addEventListener('devicechange', reload);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener('devicechange', reload);
    };
  }, []);
  return result;
}
```

`src/renderer/main/Meter.tsx`:

```tsx
import { litSegments, METER_SEGMENTS } from '../../shared/recording';

/** Индикатор уровня: 20 делений по шкале −60…0 дБ. */
export function Meter({ peak, label, big = false }: { peak: number | null; label: string; big?: boolean }) {
  const lit = peak === null ? 0 : litSegments(peak);
  return (
    <div
      className={big ? 'meter big' : 'meter'}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={METER_SEGMENTS}
      aria-valuenow={lit}
    >
      {Array.from({ length: METER_SEGMENTS }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : undefined} />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Боковая панель**

`src/renderer/main/RecordPanel.tsx`:

```tsx
import type { RecordingState } from '../../shared/recording';
import { errorText } from './errors';
import { formatClock } from './format';
import { useNow, usePeaks } from './hooks';
import { MicIcon, ScreenIcon } from './icons';
import { Meter } from './Meter';

interface Props {
  state: RecordingState;
  hotkey: string;
  /** Какой микрофон будет писать (для строки под кнопкой). */
  micLabel: string;
  onError(message: string): void;
}

const run = (action: Promise<unknown>, onError: (message: string) => void) => {
  action.catch((err: unknown) => onError(errorText(err)));
};

/** Блок записи вверху боковой панели: всегда на виду, какую бы встречу ни открыли. */
export function RecordPanel({ state, hotkey, micLabel, onError }: Props) {
  const active = state.phase !== 'idle';
  const now = useNow(state.phase === 'recording');
  const peaks = usePeaks(state.phase === 'recording');
  const toggle = () => run(window.textmeet.toggleRecording(), onError);

  if (!active) {
    return (
      <section className="rec idle" aria-label="Запись">
        <button type="button" className="start" onClick={toggle}>
          <span className="rdot" />
          Начать запись
          <kbd>{hotkey}</kbd>
        </button>
        <div className="tog">
          <button
            type="button"
            className="sw"
            role="switch"
            aria-checked={state.systemAudioNext}
            aria-label="Звук компьютера"
            onClick={() => run(window.textmeet.setSystemAudio(!state.systemAudioNext), onError)}
          >
            <i />
          </button>
          <div>
            <b>Звук компьютера</b>
            <small>Выключите для редкой встречи вживую — после записи включится сам</small>
          </div>
        </div>
        {state.startProblem && (
          <div className="problem" role="alert">
            <span>{state.startProblem.message}</span>
            <div className="problem-actions">
              {state.startProblem.settings && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => run(window.textmeet.openSystemSettings(state.startProblem!.settings!), onError)}
                >
                  Открыть настройки системы
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => run(window.textmeet.dismissStartProblem(), onError)}>
                Скрыть
              </button>
            </div>
          </div>
        )}
        <div className="micline" title={micLabel}>
          <MicIcon />
          <span>{micLabel}</span>
        </div>
      </section>
    );
  }

  const elapsed = state.startedAt === null ? 0 : (now - state.startedAt) / 1000;
  const label = state.phase === 'starting' ? 'Включаем…' : state.phase === 'stopping' ? 'Сохраняем…' : 'Идёт запись';
  const systemFlag =
    state.system === 'failed' ? 'не пишется' : state.system === 'off' ? 'выключен' : state.systemSilent ? 'не слышно' : null;

  return (
    <section className="rec" aria-label="Идёт запись">
      <div className="rec-top">
        <span className="dot" />
        <span className="rec-lbl">{label}</span>
        <span className="timer" data-testid="sidebar-timer">
          {formatClock(elapsed)}
        </span>
      </div>
      <div className="mrow">
        <MicIcon />
        <span>Микрофон</span>
        {state.micEnded && <span className="flag">отключён</span>}
      </div>
      <Meter peak={peaks.mic} label="Уровень микрофона" />
      <div className="mrow">
        <ScreenIcon />
        <span>Звук компьютера</span>
        {systemFlag && <span className="flag">{systemFlag}</span>}
      </div>
      <Meter peak={peaks.system} label="Уровень звука компьютера" />
      <button type="button" className="stop" onClick={toggle} disabled={state.phase !== 'recording'}>
        <span className="sq" />
        Остановить
        <kbd>{hotkey}</kbd>
      </button>
    </section>
  );
}
```

`src/renderer/main/MeetingList.tsx`:

```tsx
import { entryId, type MeetingListEntry } from '../../shared/meeting';
import type { RecordingState } from '../../shared/recording';
import { formatDurationShort } from '../../shared/format';
import { formatClock, formatTimeOfDay, groupByDay, meetingNote, type MeetingNote } from './format';
import { useNow } from './hooks';

interface Props {
  entries: MeetingListEntry[] | null;
  error: string | null;
  recording: RecordingState;
  selectedId: string | null;
  onSelect(id: string): void;
}

function Item({
  entry,
  live,
  elapsed,
  selected,
  onSelect,
}: {
  entry: MeetingListEntry;
  live: boolean;
  elapsed: number;
  selected: boolean;
  onSelect(): void;
}) {
  let title: string;
  let meta: string;
  let note: MeetingNote | null;
  if (entry.kind === 'ok') {
    title = entry.meeting.title;
    meta = live
      ? formatTimeOfDay(entry.meeting.createdAt)
      : `${formatTimeOfDay(entry.meeting.createdAt)} · ${formatDurationShort(entry.meeting.durationSec)}`;
    note = live ? { text: `● идёт запись · ${formatClock(elapsed)}`, tone: 'live' } : meetingNote(entry.meeting);
  } else if (entry.kind === 'creating') {
    title = 'Новая встреча';
    meta = '';
    note = { text: 'создаётся…', tone: 'accent' };
  } else {
    title = 'Не удалось прочитать встречу';
    meta = `папка ${entry.id}`;
    note = null;
  }
  return (
    <button type="button" className="it" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
      <b>{title}</b>
      <span className="meta-line">
        {meta}
        {meta && note ? ' · ' : ''}
        {note && <span className={`tone-${note.tone}`}>{note.text}</span>}
        {entry.kind === 'broken' && <span className="tone-error"> · повреждена</span>}
      </span>
    </button>
  );
}

/** Список встреч по дням, новые сверху. */
export function MeetingList({ entries, error, recording, selectedId, onSelect }: Props) {
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
  const now = useNow(liveId !== null);
  const elapsed = recording.startedAt === null ? 0 : (now - recording.startedAt) / 1000;

  if (entries === null && error === null) return <div className="list muted pad">Загрузка…</div>;

  return (
    <nav className="list" aria-label="Встречи">
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {entries?.length === 0 && (
        <p className="empty-list">
          Пока нет встреч. Нажмите «Начать запись» — встреча появится здесь.
        </p>
      )}
      {groupByDay(entries ?? [], new Date()).map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className="grp">{group.label}</div>
          {group.entries.map((entry) => {
            const id = entryId(entry);
            return (
              <Item
                key={id}
                entry={entry}
                live={id === liveId}
                elapsed={elapsed}
                selected={id === selectedId}
                onSelect={() => onSelect(id)}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 8: Встреча, плеер, идущая запись**

`src/renderer/main/Player.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { formatDuration } from './format';
import { PauseIcon, PlayIcon } from './icons';

const SPEEDS = [1, 1.5, 2] as const;
const speedLabel = (speed: number): string => `${String(speed).replace('.', ',')}×`;

/** Плеер сведённой записи встречи (audio/mix.opus через протокол tm-media). */
export function Player({ meetingId, fallbackDuration }: { meetingId: string; fallbackDuration: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(fallbackDuration);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);

  // Другая встреча — плеер с нуля.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(fallbackDuration);
    setFailed(false);
  }, [meetingId, fallbackDuration]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  };

  const nextSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1);

  if (failed) {
    return <footer className="player pending">Не удалось открыть запись для прослушивания.</footer>;
  }

  return (
    <footer className="player">
      <audio
        ref={audio}
        preload="metadata"
        src={`tm-media://meeting/${meetingId}/mix.opus`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = speed;
        }}
        onError={() => setFailed(true)}
      />
      <button type="button" className="play" aria-label={playing ? 'Пауза' : 'Слушать'} onClick={toggle}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="ptime">{formatDuration(position)}</span>
      <input
        className="track"
        type="range"
        min={0}
        max={duration ?? 0}
        step={0.1}
        value={Math.min(position, duration ?? 0)}
        aria-label="Место в записи"
        onChange={(e) => {
          const el = audio.current;
          const value = Number(e.currentTarget.value);
          if (el) el.currentTime = value;
          setPosition(value);
        }}
      />
      <span className="ptime">{formatDuration(duration)}</span>
      <button type="button" className="speed" aria-label="Скорость воспроизведения" onClick={nextSpeed}>
        {speedLabel(speed)}
      </button>
    </footer>
  );
}
```

`src/renderer/main/MeetingPane.tsx`:

```tsx
import { formatDurationShort } from '../../shared/format';
import type { MeetingListEntry } from '../../shared/meeting';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';

interface Props {
  entry: MeetingListEntry;
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

/** Выбранная встреча: заголовок, пометки, плеер. Текст встречи появится с расшифровкой (План 3). */
export function MeetingPane({ entry, onError }: Props) {
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

  const { meeting, mixReady } = entry;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  const hasAudio = meeting.tracks.length > 0;

  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <h1>{meeting.title}</h1>
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          <OpenFolder id={meeting.id} onError={onError} />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
        <div className="banner" role="status">
          <WarnIcon />
          <div>
            <b>Запись восстановлена после сбоя</b>
            <p>Программа закрылась во время записи. Сохранено всё, что успело записаться.</p>
          </div>
        </div>
      )}
      {meeting.status === 'error' && (
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>Ошибка</b>
            <p>{meeting.errorMessage ?? 'Что-то пошло не так.'}</p>
          </div>
        </div>
      )}
      <div className="empty-note">
        <b>{hasAudio ? 'Запись сохранена' : 'Звука нет'}</b>
        <span>Текст встречи появится здесь, когда в TextMeet добавится расшифровка.</span>
      </div>
      {mixReady ? (
        <Player meetingId={meeting.id} fallbackDuration={meeting.durationSec} />
      ) : (
        hasAudio && <footer className="player pending">Готовим запись для прослушивания…</footer>
      )}
    </main>
  );
}
```

`src/renderer/main/LivePane.tsx`:

```tsx
import { formatBytes } from '../../shared/format';
import type { RecordingState } from '../../shared/recording';
import { errorText } from './errors';
import { formatClock, formatTimeOfDay } from './format';
import { useNow, usePeaks } from './hooks';
import { WarnIcon } from './icons';
import { Meter } from './Meter';

interface Props {
  state: RecordingState;
  title: string;
  hotkey: string;
  platform: string;
  onError(message: string): void;
}

function Banner({ title, text, onOpenSettings }: { title: string; text: string; onOpenSettings?: () => void }) {
  return (
    <div className="banner" role="status">
      <WarnIcon />
      <div>
        <b>{title}</b>
        <p>{text}</p>
        {onOpenSettings && (
          <div className="acts">
            <button type="button" className="btn pri" onClick={onOpenSettings}>
              Открыть настройки системы
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function systemLabel(state: RecordingState): string {
  if (state.system === 'off') return 'выключен для этой записи';
  if (state.system === 'failed') return 'не записывается';
  return 'весь звук, кроме самого TextMeet';
}

/** Идущая запись в правой части: крупный таймер, уровни, «Остановить». */
export function LivePane({ state, title, hotkey, platform, onError }: Props) {
  const now = useNow(state.phase === 'recording');
  const peaks = usePeaks(state.phase === 'recording');
  const elapsed = state.startedAt === null ? 0 : (now - state.startedAt) / 1000;
  const isMac = platform === 'darwin';
  const openSettings = () =>
    window.textmeet.openSystemSettings('system-audio').catch((err: unknown) => onError(errorText(err)));
  const phaseText =
    state.phase === 'starting' ? 'Включаем микрофон…' : state.phase === 'stopping' ? 'Сохраняем запись…' : 'Идёт запись';

  return (
    <main className="pane" aria-label="Идёт запись">
      <header className="head">
        <h1>{title}</h1>
        <div className="meta">
          {state.startedAt === null
            ? 'Запись начинается…'
            : `Запись идёт с ${formatTimeOfDay(new Date(state.startedAt).toISOString())} · сохраняется на диск каждую секунду`}
        </div>
      </header>
      {state.system === 'failed' && state.systemProblem && (
        <Banner
          title="Звук компьютера не записывается"
          text={state.systemProblem}
          onOpenSettings={isMac ? openSettings : undefined}
        />
      )}
      {state.systemSilent && (
        <Banner
          title="Звук компьютера пока не слышен"
          text={
            isMac
              ? 'Скорее всего, у TextMeet нет разрешения «Запись системного звука». Микрофон при этом записывается как обычно.'
              : 'Если созвон уже идёт, проверьте, что его звук идёт через этот компьютер. Микрофон записывается как обычно.'
          }
          onOpenSettings={isMac ? openSettings : undefined}
        />
      )}
      {state.micEnded && (
        <Banner title="Микрофон отключился" text="Звук компьютера продолжает записываться." />
      )}
      <div className="live">
        <div className="live-state">
          <span className="dot" />
          {phaseText}
        </div>
        <div className="big-timer" data-testid="live-timer">
          {formatClock(elapsed)}
        </div>
        <div className="bms">
          <div>
            <div className="bm-head">
              <b>Микрофон</b>
              <span>{state.micLabel ?? ''}</span>
            </div>
            <Meter big peak={peaks.mic} label="Уровень микрофона" />
          </div>
          <div>
            <div className="bm-head">
              <b>Звук компьютера</b>
              <span>{systemLabel(state)}</span>
              {state.systemSilent && <span className="flag">не слышно</span>}
            </div>
            <Meter big peak={peaks.system} label="Уровень звука компьютера" />
          </div>
        </div>
        <button
          type="button"
          className="stop big"
          disabled={state.phase !== 'recording'}
          onClick={() => window.textmeet.toggleRecording().catch((err: unknown) => onError(errorText(err)))}
        >
          <span className="sq" />
          Остановить запись
          <kbd>{hotkey}</kbd>
        </button>
        <p className="hint">
          Клавиша работает из любой программы, даже поверх созвона на весь экран.
          <br />
          Окно можно закрыть — запись продолжится, а у значка в {isMac ? 'строке меню' : 'трее'} появится отметка записи.
        </p>
      </div>
      <footer className="live-foot">
        <span>{state.freeBytes === null ? '' : `Свободно на диске: ${formatBytes(state.freeBytes)}`}</span>
        <span>Если программа закроется со сбоем, запись восстановится при следующем запуске</span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 9: Настройки и горячая клавиша**

`src/renderer/main/HotkeyField.tsx`:

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { hotkeyFromKey } from '../../shared/hotkey';
import type { SettingsState } from '../../shared/ipc';
import { errorText } from './errors';
import { hotkeyKeys } from './format';
import { WarnIcon } from './icons';

interface Props {
  state: SettingsState;
  platform: string;
  onChange(next: SettingsState): void;
}

/** «Горячая клавиша записи»: показ, ввод новой комбинации, сброс. */
export function HotkeyField({ state, platform, onChange }: Props) {
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { hotkey } = state;

  // Пока ждём комбинацию, действующая снята (иначе нажатие Ctrl+Space начало бы запись).
  useEffect(() => {
    if (!capturing) return;
    box.current?.focus();
    void window.textmeet.suspendHotkey(true);
    return () => void window.textmeet.suspendHotkey(false);
  }, [capturing]);

  const apply = async (accelerator: string | null) => {
    try {
      const result = await window.textmeet.setHotkey(accelerator);
      onChange(result.state);
      if (result.ok) {
        setMessage(null);
        setCapturing(false);
      } else {
        setMessage(result.message);
      }
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!capturing) return;
    event.preventDefault();
    const result = hotkeyFromKey(event, platform);
    if (result.kind === 'pending') return;
    if (result.kind === 'cancel') {
      setCapturing(false);
      setMessage(null);
      return;
    }
    if (result.kind === 'rejected') setMessage(result.message);
    else void apply(result.accelerator);
  };

  return (
    <div className="ctl">
      <div className="hr">
        <div
          ref={box}
          className={`keybox${capturing ? ' cap' : ''}${message ? ' bad' : ''}`}
          tabIndex={capturing ? 0 : -1}
          role="textbox"
          aria-label="Горячая клавиша записи"
          aria-readonly={!capturing}
          data-testid="hotkey-box"
          onKeyDown={onKeyDown}
        >
          {capturing ? (
            'Нажмите новую комбинацию…'
          ) : (
            hotkeyKeys(hotkey.label, platform).map((key, i) => (
              <span key={`${key}-${i}`}>
                {i > 0 && platform !== 'darwin' ? '+' : ''}
                <kbd className="k">{key}</kbd>
              </span>
            ))
          )}
        </div>
        {capturing ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCapturing(false);
              setMessage(null);
            }}
          >
            Отмена
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setCapturing(true)}>
              Изменить
            </button>
            {!hotkey.isDefault && (
              <button type="button" className="btn ghost" onClick={() => void apply(null)}>
                Сбросить
              </button>
            )}
          </>
        )}
      </div>
      {capturing && !message && <small>Esc — отмена. Старая комбинация действует, пока новая не сохранится.</small>}
      {message && (
        <p className="err" role="alert">
          {message}
        </p>
      )}
      {hotkey.busy && !capturing && (
        <p className="wrn" role="status">
          <WarnIcon />
          <span>
            Комбинация занята другой программой. Запись можно начать кнопкой в окне или из меню в{' '}
            {platform === 'darwin' ? 'строке меню' : 'трее'}.
          </span>
        </p>
      )}
      <small>
        Начинает и останавливает запись из любой программы, даже поверх созвона на весь экран. Пока TextMeet запущен,
        эта комбинация не доходит до других программ.
      </small>
    </div>
  );
}
```

`src/renderer/main/SettingsPane.tsx`:

```tsx
import { useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
import { HotkeyField } from './HotkeyField';
import { useMicrophones } from './hooks';
import { ChevronIcon } from './icons';

interface Props {
  state: SettingsState;
  info: AppInfo | null;
  onChange(next: SettingsState): void;
}

function Toggle({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange(value: boolean): void;
}) {
  return (
    <div className="tog">
      <button type="button" className="sw" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <i />
      </button>
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

/** Настройки: запись и общие. Разделы расшифровки и ИИ появятся в своих планах. */
export function SettingsPane({ state, info, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const microphones = useMicrophones();
  const platform = info?.platform ?? 'win32';
  const { settings } = state;

  /** rollback — что вернуть на экран, если main откажет (для мгновенно показанных изменений). */
  const run = async (action: () => Promise<SettingsState>, rollback?: SettingsState) => {
    try {
      onChange(await action());
      setError(null);
    } catch (err) {
      if (rollback) onChange(rollback);
      setError(errorText(err));
    }
  };

  const setInstantly = (patch: Partial<SettingsState['settings']>, action: () => Promise<SettingsState>) => {
    onChange({ ...state, settings: { ...settings, ...patch } });
    void run(action, state);
  };

  const savedMissing =
    settings.microphoneId !== null && !microphones.devices.some((d) => d.deviceId === settings.microphoneId);
  const notice = launchAtLoginNoticeText(state.launchAtLoginNotice);

  return (
    <main className="pane" aria-label="Настройки">
      <div className="set">
        <h1>Настройки</h1>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}

        <section className="sec">
          <h2>Запись</h2>
          <div className="fld">
            <div className="lb">Микрофон</div>
            <div className="ctl">
              <span className="selw">
                <select
                  aria-label="Микрофон"
                  value={settings.microphoneId ?? ''}
                  onChange={(e) => {
                    const deviceId = e.currentTarget.value || null;
                    setInstantly({ microphoneId: deviceId }, () => window.textmeet.setMicrophone(deviceId));
                  }}
                >
                  <option value="">
                    Как в системе{microphones.defaultLabel ? ` — ${microphones.defaultLabel}` : ''}
                  </option>
                  {microphones.devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                  {savedMissing && <option value={settings.microphoneId ?? ''}>Выбранный микрофон (не подключён)</option>}
                </select>
                <ChevronIcon />
              </span>
              <small>
                {savedMissing
                  ? 'Выбранный микрофон сейчас не подключён — запись пойдёт с микрофона, выбранного в системе.'
                  : 'Если сменить микрофон в системе, TextMeet возьмёт новый со следующей записи.'}
              </small>
            </div>
          </div>
          <div className="fld">
            <div className="lb">Горячая клавиша записи</div>
            <HotkeyField state={state} platform={platform} onChange={onChange} />
          </div>
          <div className="fld tight">
            <div className="lb">Звуковой сигнал</div>
            <div className="ctl">
              <Toggle
                checked={settings.recordSounds}
                label="Короткий звук при начале и остановке записи"
                onChange={(value) => setInstantly({ recordSounds: value }, () => window.textmeet.setRecordSounds(value))}
              />
            </div>
          </div>
        </section>

        <section className="sec">
          <h2>Общие</h2>
          <div className="fld">
            <div className="lb">Папка библиотеки</div>
            <div className="ctl">
              <span className="path" data-testid="library-dir">
                {state.libraryDir}
              </span>
              <div className="hr">
                <button type="button" className="btn" onClick={() => void run(() => window.textmeet.chooseLibraryDir())}>
                  Изменить…
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)))}
                >
                  Открыть папку
                </button>
              </div>
            </div>
          </div>
          <div className="fld tight">
            <div className="lb">Автозапуск</div>
            <div className="ctl">
              <Toggle
                checked={settings.launchAtLogin}
                label="Запускать TextMeet при входе в систему"
                hint="Программа стартует свёрнутой в трей, чтобы горячая клавиша работала сразу."
                onChange={(value) =>
                  setInstantly({ launchAtLogin: value }, () => window.textmeet.setLaunchAtLogin(value))
                }
              />
              {notice && (
                <p className="notice" data-testid="launch-notice">
                  {notice}
                </p>
              )}
            </div>
          </div>
        </section>

        {info && (
          <footer className="about">
            TextMeet {info.version} · журнал ошибок: {info.logFile}
          </footer>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Окно «Запись остановлена»**

`src/renderer/main/StopDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { StopDialogData } from '../../shared/recording';
import { errorText } from './errors';
import { formatDurationWithSeconds, parseParticipants } from './format';

const CHOICES = [2, 3, 4, 5, 6] as const;

/** «Запись остановлена»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data }: { data: StopDialogData }) {
  const [title, setTitle] = useState(data.title);
  const [choice, setChoice] = useState<number | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(data.title);
    setChoice(null);
    setOther('');
    setError(null);
    dialog.current?.focus();
  }, [data.meetingId, data.title]);

  const finish = async (participantsHint: number | null) => {
    setSaving(true);
    try {
      await window.textmeet.finishStopDialog({ meetingId: data.meetingId, title, participantsHint });
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  const confirm = () => {
    if (other.trim() !== '') {
      const n = parseParticipants(other);
      if (n === null) {
        setError('Введите число от 1 до 50.');
        return;
      }
      void finish(n);
      return;
    }
    if (choice === null) {
      setError('Выберите, сколько было человек, или нажмите «Пропустить».');
      return;
    }
    void finish(choice);
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
        }}
      >
        <h2 id="stop-title">Запись остановлена</h2>
        <div className="meta">{formatDurationWithSeconds(data.durationSec)} · уже сохранена в библиотеке</div>
        <label className="lab">
          Название
          <input className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <div className="q" id="participants-question">
          Сколько человек было на встрече, включая вас?
        </div>
        <div className="nums" role="group" aria-labelledby="participants-question">
          {CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              className="num"
              aria-pressed={choice === n && other === ''}
              onClick={() => {
                setChoice(n);
                setOther('');
                setError(null);
              }}
            >
              {n}
            </button>
          ))}
          <input
            className="other"
            inputMode="numeric"
            placeholder="другое"
            aria-label="Другое число участников"
            value={other}
            onChange={(e) => {
              setOther(e.currentTarget.value);
              setError(null);
            }}
          />
        </div>
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

- [ ] **Step 11: Окно целиком; старые экраны — удалить**

`src/renderer/main/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
import { errorText } from './errors';
import { useMeetings, useMicrophones, useRecordingState } from './hooks';
import { SettingsIcon } from './icons';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
import { RecordPanel } from './RecordPanel';
import { SettingsPane } from './SettingsPane';
import { StopDialog } from './StopDialog';

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

export function App() {
  const recording = useRecordingState() ?? IDLE_RECORDING_STATE;
  const { entries, error: listError } = useMeetings();
  const microphones = useMicrophones();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
      .then(([s, i]) => {
        setSettings(s);
        setInfo(i);
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  // Началась запись — показываем её; остановилась — показываем записанную встречу.
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
  useEffect(() => {
    if (liveId) setSelection({ kind: 'meeting', id: liveId });
  }, [liveId]);
  const dialogId = recording.stopDialog?.meetingId ?? null;
  useEffect(() => {
    if (dialogId) setSelection({ kind: 'meeting', id: dialogId });
  }, [dialogId]);

  const platform = info?.platform ?? 'win32';
  const hotkey = settings?.hotkey.label ?? '';
  const chosenMic = microphones.devices.find((d) => d.deviceId === settings?.settings.microphoneId);
  const micLabel = chosenMic?.label ?? microphones.defaultLabel ?? 'Микрофон, выбранный в системе';
  const selectedId = selection?.kind === 'meeting' ? selection.id : null;
  const selectedEntry = entries?.find((e) => entryId(e) === selectedId) ?? null;

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} /> : null;
  } else if (selectedId !== null && selectedId === liveId) {
    const title = selectedEntry?.kind === 'ok' ? selectedEntry.meeting.title : 'Новая встреча';
    pane = <LivePane state={recording} title={title} hotkey={hotkey} platform={platform} onError={setError} />;
  } else if (selectedEntry) {
    pane = <MeetingPane entry={selectedEntry} onError={setError} />;
  } else {
    pane = (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Выберите встречу слева или начните запись</b>
          <span>{hotkey ? `${hotkey} начинает и останавливает запись из любой программы.` : ''}</span>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <aside className="side" aria-label="Запись и встречи">
        <RecordPanel state={recording} hotkey={hotkey} micLabel={micLabel} onError={setError} />
        {error && (
          <p role="alert" className="problem">
            {error}
          </p>
        )}
        <MeetingList
          entries={entries}
          error={listError}
          recording={recording}
          selectedId={selectedId}
          onSelect={(id) => setSelection({ kind: 'meeting', id })}
        />
        <div className="foot">
          <button
            type="button"
            className="btn grow"
            onClick={() => window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)))}
          >
            Открыть папку библиотеки
          </button>
          <button
            type="button"
            className={`btn sq-btn${selection?.kind === 'settings' ? ' on' : ''}`}
            aria-label="Настройки"
            aria-pressed={selection?.kind === 'settings'}
            onClick={() => setSelection({ kind: 'settings' })}
          >
            <SettingsIcon />
          </button>
        </div>
      </aside>
      {pane}
      {recording.stopDialog && <StopDialog data={recording.stopDialog} />}
    </div>
  );
}
```

```bash
git rm src/renderer/main/LibraryScreen.tsx src/renderer/main/SettingsScreen.tsx
```

- [ ] **Step 12: Типы, тесты, сборка**

Run: `npm run typecheck && npm test && npm run build`
Expected: без ошибок, все модульные тесты проходят.

- [ ] **Step 13: Посмотреть окно**

Run: `npm run dev` — окно должно выглядеть как листы 1–3 и 6 макета (светлая тема; в тёмной теме Windows — как лист 4).
«Начать запись» пишет с настоящего микрофона и звука компьютера этого ПК; «Остановить» открывает «Запись остановлена»;
через несколько секунд после ответа во встрече появляется плеер. Закрыть окно разработки.

- [ ] **Step 14: Коммит**

```bash
git add src/renderer/main
git commit -m "feat: redesign the main window in the Paper style with recording controls"
```

---

### Task 14: Сквозные тесты

Тестовый режим (`TEXTMEET_TEST_MEDIA`): поддельный микрофон, тон или отказ вместо звука компьютера. Проверяются: запись
с двумя дорожками → «Запись остановлена» → `meeting.json` → `mix.opus` → плеер знает длительность; запись без звука
компьютера и возврат переключателя; отказ звука компьютера; отказ микрофона без пустой встречи; восстановление при
запуске; падение окна записи во время записи и повторная запись; выход во время записи с вопросом; горячая клавиша в
настройках; главное окно не может выдать себя за окно записи; экраны в новом виде. Тест собранной программы
(`packaged.spec.ts`) без `TEXTMEET_PACKAGED_APP` пропускается — он для Task 15.

**Files:**
- Modify: `e2e/helpers.ts`, `e2e/shell.spec.ts`, `e2e/screens.spec.ts`
- Create: `e2e/recording.spec.ts`, `e2e/hotkey.spec.ts`, `e2e/packaged.spec.ts`

- [ ] **Step 1: Помощник запуска**

`e2e/helpers.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';

export interface MeetingFixture {
  id: string;
  /** Объект пишется как JSON, строка — как есть (для повреждённых файлов). */
  json: unknown;
  /** Файлы в папке audio/: имя → сколько секунд тона записать (WebM/Opus, как у MediaRecorder). */
  audio?: Record<string, number>;
}

export interface LaunchOptions {
  /** Объект пишется как JSON, строка — как есть. По умолчанию библиотека — во временной папке. */
  settings?: unknown;
  meetings?: MeetingFixture[];
  /** Звук компьютера в тестовом режиме: тон или отказ. Настоящие устройства в тестах не трогаем. */
  media?: 'tone' | 'fail';
  /** Собранная программа вместо out/ (проверка установщика). */
  executablePath?: string;
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

// Меньше тайм-аута теста: если окно не появилось, уборка в launchApp ещё успеет выполниться.
const WINDOW_TIMEOUT_MS = 15_000;

const serialize = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const run = promisify(execFile);

/** Тон нужной длины в WebM/Opus — как дорожка, записанная MediaRecorder. */
export async function toneWebm(file: string, seconds: number): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg для этой системы не найден');
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:a',
    'libopus',
    '-f',
    'webm',
    file,
  ]);
}

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

export async function readMeetingJson(libraryDir: string, id: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(libraryDir, id, 'meeting.json'), 'utf8')) as Record<string, unknown>;
}

async function windowByPage(app: ElectronApplication, pagePath: string): Promise<Page> {
  const matches = (page: Page) => page.url().includes(pagePath);
  return (
    app.windows().find(matches) ??
    (await app.waitForEvent('window', { predicate: matches, timeout: WINDOW_TIMEOUT_MS }))
  );
}

/** Главное окно ищем по адресу: скрытое окно записи может открыться раньше. */
export function mainWindow(app: ElectronApplication): Promise<Page> {
  return windowByPage(app, '/main/index.html');
}

export function recorderWindow(app: ElectronApplication): Promise<Page> {
  return windowByPage(app, '/recorder/index.html');
}

/** Окно записи загрузилось и сообщило main, что готово. */
export async function waitForRecorder(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.textmeet.getAppInfo().then((i) => i.recorderReady))).toBe(true);
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
    for (const [file, seconds] of Object.entries(meeting.audio ?? {})) {
      await toneWebm(join(libraryDir, meeting.id, 'audio', file), seconds);
    }
  }

  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    app = await electron.launch({
      ...(options.executablePath ? { executablePath: options.executablePath, args: [] } : { args: ['.'] }),
      env: {
        ...process.env,
        TEXTMEET_USER_DATA: userDataDir,
        TEXTMEET_HOME: homeDir,
        TEXTMEET_TEST_MEDIA: options.media ?? 'tone',
      },
    });
    page = await mainWindow(app);
  } catch (err) {
    // Запуск не удался — не оставляем за собой ни процесс, ни временные папки.
    await app?.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    throw err;
  }
  return {
    app,
    page,
    root,
    userDataDir,
    homeDir,
    libraryDir,
    close: async () => {
      // Если запись ещё идёт, при выходе программа спросит системным окном — отвечаем «Остановить и выйти».
      // Тест мог уже закрыть программу сам (выход из меню) — тогда закрывать нечего.
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
        })
        .catch(() => undefined);
      await app.close().catch(() => undefined);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
```

- [ ] **Step 2: Тесты**

`e2e/shell.spec.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, recorderWindow, type LaunchedApp } from './helpers';

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

test('the recorder window cannot use the main window API', async () => {
  launched = await launchApp();
  const recorder = await recorderWindow(launched.app);
  await expect(recorder.evaluate(() => window.textmeet.getSettings())).rejects.toThrow('не из главного окна');
});

test('the main window cannot pretend to be the recorder window', async () => {
  launched = await launchApp();
  const { page, userDataDir } = launched;
  await page.evaluate(() => window.recorder.ready());
  await expect
    .poll(() => readFile(join(userDataDir, 'logs', 'textmeet.log'), 'utf8'))
    .toContain('recorder:ready: сообщение не из окна записи');
});
```

`e2e/screens.spec.ts`:

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

test('lists meetings by day, newest first, and marks broken and unfinished ones', async () => {
  launched = await launchApp({
    meetings: [
      { id: '2026-09-20_1000_aaaaaa', json: meetingJson('2026-09-20_1000_aaaaaa', { title: 'Старая встреча' }) },
      {
        id: '2026-09-25_1430_bbbbbb',
        json: meetingJson('2026-09-25_1430_bbbbbb', { title: 'Свежая встреча', createdAt: '2026-09-25T11:30:00.000Z' }),
      },
      { id: '2026-09-22_1200_cccccc', json: '{oops' },
    ],
  });
  const { page, libraryDir } = launched;
  await mkdir(join(libraryDir, '2026-09-23_0900_dddddd'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  const list = page.getByRole('navigation', { name: 'Встречи' });
  await expect(list.locator('.it b')).toHaveText([
    'Свежая встреча',
    'Новая встреча',
    'Не удалось прочитать встречу',
    'Старая встреча',
  ]);
  await expect(list.getByText('создаётся…')).toBeVisible();

  await list.getByRole('button', { name: /Свежая встреча/ }).click();
  await expect(page.getByRole('heading', { name: 'Свежая встреча' })).toBeVisible();

  await list.getByRole('button', { name: /Не удалось прочитать/ }).click();
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

test('settings show the library folder and save the switches', async () => {
  launched = await launchApp();
  const { page, libraryDir, userDataDir } = launched;
  const settingsFile = async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8'));
  await page.getByRole('button', { name: 'Настройки' }).click();

  await expect(page.getByTestId('library-dir')).toHaveText(libraryDir);
  // Тесты запускают версию для разработки — автозапуск в системе не прописывается.
  await expect(page.getByTestId('launch-notice')).toContainText('установленной программе');

  const autostart = page.getByRole('switch', { name: 'Запускать TextMeet при входе в систему' });
  await expect(autostart).toHaveAttribute('aria-checked', 'true');
  await autostart.click();
  await expect.poll(async () => (await settingsFile()).launchAtLogin).toBe(false);

  await page.getByRole('switch', { name: 'Короткий звук при начале и остановке записи' }).click();
  await expect.poll(async () => (await settingsFile()).recordSounds).toBe(false);
});

test('lists the microphones and saves the choice', async () => {
  launched = await launchApp();
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  const select = page.getByRole('combobox', { name: 'Микрофон' });
  await expect(select.locator('option').first()).toHaveText(/^Как в системе/);
  // Поддельные устройства Chromium: кроме «как в системе» есть хотя бы один микрофон.
  await expect.poll(() => select.locator('option').count()).toBeGreaterThan(1);
  const deviceId = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(deviceId ?? '');
  await expect
    .poll(async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).microphoneId)
    .toBe(deviceId);
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
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
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

`e2e/recording.spec.ts`:

```ts
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, readMeetingJson, waitForRecorder, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

/** Папки встреч в библиотеке. */
const meetingIds = async (libraryDir: string): Promise<string[]> =>
  (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

async function startRecording(page: Page): Promise<void> {
  await waitForRecorder(page);
  await page.getByRole('button', { name: /Начать запись/ }).click();
  await expect(page.getByRole('main', { name: 'Идёт запись' })).toBeVisible();
  // Таймер пошёл — запись действительно идёт, куски пишутся на диск.
  await expect(page.getByTestId('live-timer')).not.toHaveText('00:00:00', { timeout: 10_000 });
}

test('records both tracks, asks about participants and prepares the recording for listening', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;

  await startRecording(page);
  await expect
    .poll(() => page.getByRole('meter', { name: 'Уровень звука компьютера' }).first().getAttribute('aria-valuenow'))
    .not.toBe('0');
  await expect(page.getByTestId('live-timer')).toHaveText(/00:00:0[2-9]/, { timeout: 10_000 });
  await page.getByRole('button', { name: /Остановить запись/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Запись остановлена' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Название' }).fill('Созвон с Ириной');
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Выберите, сколько было человек');
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog).toBeHidden();

  const [id] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({
    title: 'Созвон с Ириной',
    participantsHint: 3,
    status: 'recorded',
    tracks: [{ kind: 'mic' }, { kind: 'system' }].map((t) => expect.objectContaining(t)),
  });
  for (const file of ['mic.webm', 'system.webm']) {
    expect((await stat(join(libraryDir, id!, 'audio', file))).size).toBeGreaterThan(0);
  }
  await expect(page.getByRole('heading', { name: 'Созвон с Ириной' })).toBeVisible();
  await expect(page.getByText('3 участника')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Слушать' })).toBeVisible({ timeout: 15_000 });
  expect(existsSync(join(libraryDir, id!, 'audio', 'mix.opus'))).toBe(true);
  // Плеер получает файл через протокол tm-media и знает его длительность (нужна для перемотки).
  const duration = await page.locator('audio').evaluate(
    (audio: HTMLAudioElement) =>
      new Promise<number>((resolve) => {
        if (audio.readyState >= 1) resolve(audio.duration);
        else audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
      }),
  );
  expect(duration).toBeGreaterThan(1.5);
});

test('records only the microphone when the switch is off, then turns the switch back on', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;
  const toggle = page.getByRole('switch', { name: 'Звук компьютера' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await startRecording(page);
  await expect(page.getByText('выключен для этой записи')).toBeVisible();
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click();

  const [id] = await meetingIds(libraryDir);
  expect(await readdir(join(libraryDir, id!, 'audio'))).toContain('mic.webm');
  expect(await readdir(join(libraryDir, id!, 'audio'))).not.toContain('system.webm');
  expect((await readMeetingJson(libraryDir, id!)).participantsHint).toBeNull();
  await expect(page.getByRole('switch', { name: 'Звук компьютера' })).toHaveAttribute('aria-checked', 'true');
});

test('keeps recording the microphone when the computer sound cannot be captured', async () => {
  launched = await launchApp({ media: 'fail' });
  const { page, libraryDir } = launched;

  await startRecording(page);
  await expect(page.getByText('Звук компьютера не записывается')).toBeVisible();
  await expect(page.getByLabel('Идёт запись').getByText('не пишется')).toBeVisible();
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click();

  const [id] = await meetingIds(libraryDir);
  expect(await readdir(join(libraryDir, id!, 'audio'))).toContain('mic.webm');
});

test('explains a refused microphone and leaves no empty meeting', async () => {
  launched = await launchApp();
  const { page, app, libraryDir } = launched;
  await waitForRecorder(page);
  await app.evaluate(({ session }) => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  });

  await page.getByRole('button', { name: /Начать запись/ }).click();

  await expect(page.getByRole('alert')).toContainText('Нет доступа к микрофону');
  await expect(page.getByRole('button', { name: 'Открыть настройки системы' })).toBeVisible();
  expect(await meetingIds(libraryDir)).toEqual([]);
  await page.getByRole('button', { name: 'Скрыть' }).click();
  await expect(page.getByText('Нет доступа к микрофону')).toBeHidden();
});

test('recovers a recording interrupted by a crash at the next start', async () => {
  const id = '2026-09-27_1015_abcdef';
  launched = await launchApp({
    meetings: [
      {
        id,
        json: {
          schemaVersion: 1,
          id,
          title: 'Прерванная встреча',
          createdAt: '2026-09-27T07:15:00.000Z',
          durationSec: null,
          source: 'recording',
          participantsHint: null,
          model: null,
          status: 'recording',
          errorMessage: null,
          speakerNames: {},
          tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
        },
        audio: { 'mic.webm': 3 },
      },
    ],
  });
  const { page, libraryDir } = launched;

  await expect(page.getByText('восстановлена после сбоя')).toBeVisible();
  await expect.poll(async () => (await readMeetingJson(libraryDir, id)).durationSec, { timeout: 15_000 }).toBeCloseTo(3, 0);
  expect(await readMeetingJson(libraryDir, id)).toMatchObject({ status: 'recorded', recovered: true });
  await page.getByRole('button', { name: /Прерванная встреча/ }).click();
  await expect(page.getByText('Запись восстановлена после сбоя')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Слушать' })).toBeVisible();
});

test('saves the recording when the recorder window crashes and can record again', async () => {
  launched = await launchApp();
  const { page, app, libraryDir } = launched;
  await startRecording(page);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === 'TextMeet — запись')
      ?.webContents.forcefullyCrashRenderer();
  });

  await expect(page.getByRole('button', { name: /Начать запись/ })).toBeVisible({ timeout: 15_000 });
  const [first] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, first!)).toMatchObject({ status: 'recorded', recovered: true });

  await startRecording(page);
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await expect(page.getByRole('dialog', { name: 'Запись остановлена' })).toBeVisible();
  expect(await meetingIds(libraryDir)).toHaveLength(2);
});

test('asks before quitting during a recording and saves it on exit', async () => {
  launched = await launchApp();
  const { page, app, libraryDir } = launched;
  await startRecording(page);

  // Системное окно в тесте не нажать — отвечаем за пользователя: сначала «Продолжить запись».
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await expect(page.getByTestId('live-timer')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Идёт запись' })).toBeVisible();

  // Теперь «Остановить и выйти».
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await closed;

  const [id] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({ status: 'recorded' });
});
```

`e2e/hotkey.spec.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('changes the recording hotkey, refuses single keys and resets to the default', async () => {
  launched = await launchApp();
  const { page, userDataDir } = launched;
  const saved = async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).recordHotkey;
  const box = page.getByTestId('hotkey-box');
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(box).toContainText('Space');

  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(box).toHaveText('Нажмите новую комбинацию…');
  await page.keyboard.press('KeyR');
  await expect(page.getByRole('alert')).toContainText('Одну клавишу без');

  await page.keyboard.press('Control+Alt+Shift+F11');
  await expect(box).toContainText('F11');
  await expect.poll(saved).toBe('Control+Alt+Shift+F11');
  // Подсказка на кнопке записи тоже сменилась.
  await expect(page.getByRole('button', { name: /Начать запись/ })).toContainText('F11');

  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect.poll(saved).toBeNull();
  await expect(page.getByRole('button', { name: 'Сбросить' })).toBeHidden();
});

test('cancels typing a new hotkey with Escape', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hotkey-box')).toContainText('Space');
  await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible();
});
```

`e2e/packaged.spec.ts`:

```ts
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, waitForRecorder, type LaunchedApp } from './helpers';

// Только после сборки установщика: TEXTMEET_PACKAGED_APP — путь к исполняемому файлу собранной программы
// (Windows: release/win-unpacked/TextMeet.exe; Mac: …/TextMeet.app/Contents/MacOS/TextMeet).
const executablePath = process.env.TEXTMEET_PACKAGED_APP;

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('the packaged app records and mixes the tracks with its bundled ffmpeg', async () => {
  test.skip(!executablePath, 'проверяется только собранная программа (TEXTMEET_PACKAGED_APP)');
  launched = await launchApp({ executablePath });
  const { page, libraryDir } = launched;
  await waitForRecorder(page);

  await page.getByRole('button', { name: /Начать запись/ }).click();
  await expect(page.getByTestId('live-timer')).toHaveText(/00:00:0[2-9]/, { timeout: 15_000 });
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click();

  const [id] = await readdir(libraryDir);
  // mix.opus появляется, только если ffmpeg из app.asar.unpacked запустился.
  await expect.poll(() => existsSync(join(libraryDir, id!, 'audio', 'mix.opus')), { timeout: 30_000 }).toBe(true);
});
```

- [ ] **Step 3: Прогнать три раза подряд**

Run: `npm run e2e`, затем ещё два раза `npx playwright test`
Expected: каждый раз `19 passed, 1 skipped` (пропущен тест собранной программы), без повторов.

- [ ] **Step 4: Типы и коммит**

Run: `npm run typecheck`
Expected: без ошибок.

```bash
git add e2e
git commit -m "test: cover recording, recovery, quitting and the hotkey end to end"
```

---

### Task 15: Упаковка и сборка в GitHub Actions

Версия 0.2.0; `actions/*@v5` (GitHub предупреждал об устаревании Node 20 в `@v4`); подпись ffmpeg в сборке для Mac;
проверка собранной программы на обеих ОС — `e2e/packaged.spec.ts`: пишет и сводит дорожки ffmpeg из установщика.

**Files:**
- Modify: `package.json` (`"version": "0.2.0"`), `.github/workflows/ci.yml`, `.github/workflows/build.yml`

- [ ] **Step 1: Версия**

В `package.json` заменить `"version": "0.1.0"` на `"version": "0.2.0"`.

- [ ] **Step 2: Рабочие процессы**

`.github/workflows/ci.yml`:

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
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:coverage
```

`.github/workflows/build.yml`:

```yaml
name: build

on:
  workflow_dispatch:
  push:
    tags: ['v*']

permissions:
  contents: read

jobs:
  build:
    # Минуты закрытого репозитория ограничены, а macOS считается с множителем — зависшая сборка не должна их съесть.
    timeout-minutes: 30
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
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
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

      # Собранная программа пишет и сводит дорожки своим ffmpeg (из app.asar.unpacked).
      - name: Check the packaged app (Windows)
        if: runner.os == 'Windows'
        run: npx playwright test e2e/packaged.spec.ts
        env:
          TEXTMEET_PACKAGED_APP: release/win-unpacked/TextMeet.exe

      - name: Package (macOS, ad-hoc signed .dmg)
        if: runner.os == 'macOS'
        run: |
          npx electron-builder --mac dir --arm64 --publish never
          APP="$(find release -maxdepth 2 -name 'TextMeet.app' -type d | head -n 1)"
          echo "App: $APP"
          # Неподписанное arm64-приложение macOS не запускает — подписываем ad-hoc, как в спайке.
          # ffmpeg (сведение дорожек) лежит в app.asar.unpacked и тоже должен быть подписан.
          find "$APP" \( -name '*.node' -o -name '*.dylib' -o -name 'ffmpeg' \) -type f -exec codesign --force --sign - {} \;
          codesign --force --deep --sign - "$APP"
          codesign --verify --deep --verbose=2 "$APP"
          # Собранная программа пишет и сводит дорожки своим подписанным ffmpeg.
          TEXTMEET_PACKAGED_APP="$APP/Contents/MacOS/TextMeet" npx playwright test e2e/packaged.spec.ts
          mkdir -p dmg
          ditto "$APP" dmg/TextMeet.app
          ln -s /Applications dmg/Applications
          VERSION="$(node -p "require('./package.json').version")"
          hdiutil create -volname TextMeet -srcfolder dmg -ov -format UDZO "release/TextMeet-$VERSION-arm64.dmg"

      - uses: actions/upload-artifact@v5
        with:
          name: ${{ matrix.artifact }}
          path: |
            release/*.exe
            release/*.dmg
          if-no-files-found: error
```

- [ ] **Step 3: Собрать и проверить установщик локально**

```bash
npm run dist:win
TEXTMEET_PACKAGED_APP=release/win-unpacked/TextMeet.exe npx playwright test e2e/packaged.spec.ts
```

Expected: `release/TextMeet-Setup-0.2.0.exe` собран; тест собранной программы — `1 passed`;
`release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe` на месте.

- [ ] **Step 4: Коммит и отправка**

```bash
git add package.json .github/workflows
git commit -m "ci: check the packaged app with its bundled ffmpeg and update actions to v5"
git push -u origin plan-2-recording
```

- [ ] **Step 5: Сборка установщиков в GitHub Actions**

`build.yml` уже есть на `main` (с Плана 1), поэтому его можно запустить для ветки:

```bash
"C:/Program Files/GitHub CLI/gh.exe" workflow run build.yml --ref plan-2-recording
"C:/Program Files/GitHub CLI/gh.exe" run watch "$("C:/Program Files/GitHub CLI/gh.exe" run list --workflow build.yml --branch plan-2-recording --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: обе сборки (windows-latest, macos-latest) зелёные, включая «Check the packaged app»; артефакты
`TextMeet-windows` и `TextMeet-mac` загружены. Если на Mac упал тест собранной программы — проверить подпись ffmpeg
(`codesign --verify` на `…/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg`).

---

### Task 16: Ручная проверка на Windows и Mac (контрольная точка с пользователем)

Пользователь не программист: инструкции — по шагам, простыми словами, по-русски. Результаты — в
`docs/superpowers/plan-2-checks.md` (Task 17). Если что-то не работает — сначала разобраться и исправить
(отдельным коммитом с тестом), потом продолжать.

**Files:** нет (только проверка)

- [ ] **Step 1: Передать пользователю установщики**

Windows — `TextMeet-Setup-0.2.0.exe` из артефакта `TextMeet-windows` (или локальный из Task 15), Mac — `.dmg` из
`TextMeet-mac`. Установка поверх версии 0.1.0 (Windows: «Подробнее → Выполнить в любом случае»; Mac — перетащить в
«Программы», затем «Всё равно открыть» в «Конфиденциальность и безопасность»).

- [ ] **Step 2: Windows — чек-лист**

| # | Что сделать | Что должно получиться |
|---|---|---|
| 1 | Открыть TextMeet | Вид как в макете «Бумага»; вверху слева красная «Начать запись» с `Ctrl+Space`, ниже переключатель «Звук компьютера» (включён) и название микрофона |
| 2 | Включить видео с голосом (YouTube) или начать тестовый созвон, нажать «Начать запись», говорить в микрофон 20–30 с | Короткий сигнал, таймер идёт, оба индикатора двигаются; у значка в трее красная точка; в списке «● идёт запись» |
| 3 | «Остановить» | Сигнал, окно «Запись остановлена»; выбрать число участников, «Расшифровать» |
| 4 | Во встрече нажать «Слушать» | Слышны и свой голос, и звук компьютера; перемотка ползунком работает; скорость 1× / 1,5× / 2× |
| 5 | Выключить «Звук компьютера», записать 10 с, остановить, «Пропустить» | В папке встречи только `mic.webm`; переключатель снова включён |
| 6 | Открыть созвон/видео во весь экран, нажать `Ctrl+Space`, через 20 с ещё раз | Старт: сигнал и уведомление «Запись началась»; стоп: сигнал, окно TextMeet открывается с «Запись остановлена» |
| 7 | Меню трея во время записи и без неё | «● Идёт запись» / «Остановить запись» и «Начать запись» |
| 8 | Начать запись, в Диспетчере задач снять задачу «TextMeet», запустить TextMeet снова | Уведомление «Запись восстановлена»; встреча с пометкой «восстановлена после сбоя» слушается |
| 9 | Во время записи: трей → «Выход» → «Продолжить запись»; снова «Выход» → «Остановить и выйти» | Первый раз запись продолжается; второй — программа закрывается, встреча сохранена |
| 10 | Настройки → «Изменить» у горячей клавиши → нажать одну букву; затем `Ctrl+Alt+R` | Сначала понятное сообщение, почему нельзя; потом комбинация сохранилась и работает; «Сбросить» возвращает `Ctrl+Space` |
| 11 | Настройки → Микрофон — выбрать другой (если есть) | Под красной кнопкой — новое название; запись идёт с него |
| 12 | Светлая и тёмная тема Windows | Обе читаются, как листы 1 и 4 макета |

- [ ] **Step 3: Mac — чек-лист**

Перед проверкой сбросить разрешения TextMeet, чтобы увидеть все запросы с нуля (Терминал):

```bash
tccutil reset All dev.textmeet.app
```

| # | Что сделать | Что должно получиться |
|---|---|---|
| 1 | Открыть TextMeet, «Начать запись» | macOS спрашивает доступ к микрофону и к записи системного звука. **Записать, спросила ли она ещё и «Запись экрана»** — это открытый вопрос спайка |
| 2 | Пункты 2–5 и 9–12 из списка Windows | То же; горячая клавиша — `⌥ Space`, значок в строке меню во время записи — закрашенный круг |
| 3 | Если `⌥ Space` занята (Raycast, Alfred, ChatGPT) | При запуске уведомление «Горячая клавиша занята», в настройках — предупреждение; запись кнопкой работает |
| 4 | Уведомления | Появляются; щелчок открывает окно |
| 5 | Отказать в «Запись системного звука» (Системные настройки → Конфиденциальность и безопасность) и записать 15 с | Жёлтая плашка «Звук компьютера пока не слышен» с кнопкой «Открыть настройки системы»; кнопка открывает нужный раздел; микрофон записан |
| 6 | Сбой: во время записи «Мониторинг системы» → TextMeet → «Завершить принудительно», открыть снова | Как пункт 8 Windows |

- [ ] **Step 4: Итог от пользователя**

Записать ответы (что работает, что нет, ответ про «Запись экрана») для Task 17. Непройденные пункты исправить до
слияния или, если пользователь согласен, внести в «Отложено» с планом, где это будет исправлено.

---

### Task 17: Документы, память и слияние

**Files:**
- Create: `docs/superpowers/plan-2-checks.md`
- Modify: `docs/superpowers/plans/2026-09-25-textmeet-roadmap.md`, `docs/superpowers/specs/2026-09-25-textmeet-design.md`
  (§9 — ответ про «Запись экрана»; §5.3 — если на Mac понадобилось что-то ещё), `docs/superpowers/spike-results.md`
  (закрыть открытый вопрос про «Запись экрана»)

- [ ] **Step 1: Итоги проверки**

`docs/superpowers/plan-2-checks.md` — по образцу `plan-1-checks.md`: сборки (номер запуска GitHub Actions), таблица
пунктов Task 16 с отметками Windows / Mac, ответ про «Запись экрана», раздел «Отложено на следующие планы» (всё, что
осталось; обязательно — Electron fuses → План 8).

- [ ] **Step 2: Дорожная карта**

В строке Плана 2 таблицы `2026-09-25-textmeet-roadmap.md` статус «ждёт» → «выполнен ([план](2026-09-28-textmeet-plan-2-recording.md),
[проверки](../plan-2-checks.md))».

- [ ] **Step 3: Коммит документов**

```bash
git add docs
git commit -m "docs: record plan 2 checks and mark plan 2 done"
```

- [ ] **Step 4: Слияние в `main`**

Сначала подтянуть `main` (на нём может быть только то, что уже на ветке), затем слить и отправить:

```bash
git checkout main
git pull
git merge --no-ff plan-2-recording -m "Merge plan 2: recording"
npm ci
npm run typecheck && npm test
git push
```

Expected: проверки проходят; `ci` на `main` в GitHub Actions зелёный.

- [ ] **Step 5: Память проекта**

Обновить `textmeet-project` в памяти Claude: План 2 выполнен (коммит слияния), что отложено, следующий шаг — подробный
План 3 (расшифровка): перед ним порог авто-режима диаризации и обработка перекрытий (открытые вопросы спайка).
