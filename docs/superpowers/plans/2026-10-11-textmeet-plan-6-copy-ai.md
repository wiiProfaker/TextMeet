# TextMeet — План 6: «Скопировать для ИИ»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «Скопировать для ИИ» во встрече кладёт в буфер обмена запрос и текст встречи простым текстом — его вставляют в Claude, ChatGPT или любой другой чат; запрос меняется в настройках («ИИ» → «Запрос для ИИ», «Вернуть стандартный»).

**Architecture:** Запрос хранится в настройках (`aiPrompt`: `null` — стандартный из `src/shared/ai-prompt.ts`, `''` — без запроса, иначе — свой текст). Копирование — в main (`copyForAi` рядом с «Скопировать всё» в `src/main/export/export-meeting.ts`): тот же простой текст встречи (`toPlainText`), перед ним — запрос и пустая строка. Окно: кнопка в шапке встречи (`CopyForAiButton.tsx`) и раздел «ИИ» в настройках (`AiSettings.tsx`, сохраняется сам). Облачный ИИ из программы не подключается.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0, React 19.3, TypeScript 7.0.2, zod 4.6.5, Vitest 5.0.2, Playwright 1.63.0.

**Spec:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.5, §3.6. **Решения Плана 6:** [2026-10-11-textmeet-plan-6-design.md](../specs/2026-10-11-textmeet-plan-6-design.md). **Макет:** [Макет TextMeet](https://claude.ai/artifact/Urmc3atvSFifUpDyBzjeR6), лист 1 (кнопка в шапке встречи) и лист 6 (раздел «ИИ» — по решениям Плана 6, §2.2, без сервиса, ключа и модели).

## Global Constraints

- Все тексты интерфейса — по-русски, дословно как в решениях Плана 6 (§2): «Скопировать для ИИ», «Скопировано»,
  «Текст встречи с запросом скопирован», «ИИ», «Запрос для ИИ», «Вернуть стандартный», подсказка «Добавляется перед
  текстом встречи, когда вы нажимаете „Скопировать для ИИ“. Вставьте скопированное в Claude, ChatGPT или другой чат.»
- Стандартный запрос — дословно §2.3 решений (шесть строк, первая — одной строкой).
- Запрос — не длиннее 4000 символов (`AI_PROMPT_MAX`); испорченное значение в `settings.json` забывается
  (`.catch(null)`), остальные настройки не сбрасываются; `schemaVersion` настроек не меняется.
- В буфер обмена — только простой текст, переводы строк `\n` на обеих системах.
- Новых зависимостей нет. Облачный ИИ из программы не подключается (ни ключом API, ни через подписку).
- Текст запроса и текст встречи не пишутся в журнал ошибок.

## Review Focus

- **Запрос набрали и сразу ушли из настроек (или сразу нажали «Скопировать для ИИ»)** — запрос сохранён, и копия
  берёт уже его. Тесты: Task 1 (`e2e/ai.spec.ts`, «typed right before leaving»), Task 3 (то же копирование без ожидания
  сохранения — «copies with the own prompt…»).
- **Настройки не сохраняются (диск недоступен, файл занят)** — набранный текст остаётся в поле, уходит снова при
  следующем уходе из поля или со страницы, ошибка видна и после ухода со страницы. Тест: Task 3 («a prompt that could
  not be saved…»).
- **`settings.json` с испорченным или слишком длинным `aiPrompt`** (правили руками, файл из более новой версии) —
  берётся стандартный запрос, остальные настройки на месте. Тест: Task 1 (`settings.test.ts`).
- **Запрос с переводами строк Windows, пробелами по краям или пустой** — в буфере аккуратный текст: без `\r`, без
  лишних пробелов, пустой запрос не добавляет пустых строк. Тесты: Task 1 (`ai-prompt.test.ts`), Task 2
  (`export-meeting.test.ts`).
- **У встречи нет текста или его не прочитать** — кнопки нет, а если текст пропал между показом и нажатием — понятная
  ошибка, буфер обмена не тронут. Тесты: Task 2 (`export-meeting.test.ts`, `e2e/ai.spec.ts`).

---

## Факты, на которые опирается план (проверены 2026-10-11 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии ветки `plan-6-copy-ai` на Windows 11: 972 модульных теста,
67 сквозных (+1 пропущенный — проверка собранной программы). После каждой задачи проверка типов и модульные тесты
проходят. Ревью кода (typescript-reviewer) нашло недочёты — они исправлены в Task 3 и закрыты тестами. Внешний вид
кнопки и раздела настроек проверен снимками в светлой и тёмной теме.

- **Буфер обмена в Electron 44 асинхронный:** `clipboard.write([new ClipboardItem({ 'text/plain': … })])` — запись
  только с `text/plain` работает (оформленного текста в буфере нет); чтение в сквозных тестах — `await
  clipboard.readText()` и `await clipboard.read()` через `app.evaluate`.
- **Хранилище настроек пишет файл и только потом меняет значение в памяти**, изменения — по очереди. Каналы IPC
  одного окна main обрабатывает по порядку, и `update()` встаёт в очередь сразу, поэтому `settled()` в начале
  `copyForAi` дожидается запроса, отправленного окном перед нажатием.
- **Chromium отправляет `blur`, когда поле в фокусе убирают со страницы** — набранное сохраняется при уходе из настроек
  и через `onBlur`, и через сброс при закрытии раздела (`useEffect`): сквозной тест «уход сразу после набора» проходит
  любым из двух путей; без сброса при закрытии падает тест неудачного сохранения (текст должен уйти снова).
- **Неудачное сохранение в сквозном тесте** — подмена обработчика канала в main: `ipcMain.removeHandler(…)`, затем
  `ipcMain.handle(…)` с ошибкой.
- **Настройки в сквозных тестах:** свой `settings.json` в `launchApp({ settings })` должен содержать `libraryDir` папки
  теста, иначе встречи теста не видны; поэтому запрос в тестах меняется через окно настроек.
- **Окно работает в `StrictMode`:** эффекты запускаются, сбрасываются и запускаются снова — сброс раздела «ИИ» при
  этом ничего не отправляет (неотправленного текста ещё нет).
- **На этом компьютере установлен TextMeet**, он держит `Ctrl+Space`: проверка «Сбросить» в `e2e/hotkey.spec.ts`
  локально падает, пока установленная программа запущена (не закрывать её по имени процесса — это программа
  пользователя).
- **Файлы в рабочей копии — с окончаниями CRLF** (`core.autocrlf=true`), в блоках плана — LF: заменяйте блоки
  инструментом правки (он сопоставляет строки без учёта окончаний), а не побайтовыми скриптами.
- **Минуты GitHub Actions на 2026-10-11 закончились** (поэтому План 5 проверен и слит только локально): сборка и
  проверки этого плана — локально (Task 4); отправка на GitHub — когда лимит обновится, только с согласия пользователя.

## Известные ограничения (в «Отложено» проверок Плана 6)

- При нажатии «Скопировать для ИИ» кнопка становится уже («Скопировано»), и «Экспорт» сдвигается влево на 2 секунды —
  как у «Экспорта» после «Скопировать всё».
- Вставка длиннее 4000 символов в поле запроса молча обрезается (`maxLength`).
- Если сохранение не удалось после ухода со страницы настроек, при возврате в поле — прежний сохранённый запрос
  (ошибка видна в строке слева).

## Что сознательно не входит в План 6

- Подключение Claude и ChatGPT из программы; итоги и вопросы к встрече внутри программы, `ai.json`, итоги в поиске и в
  выгрузке — План 9 «Локальная модель для итогов» (решения Плана 6, §5). Несколько запросов (шаблоны), открытие сайта
  чата после копирования — не делаются.

## Карта файлов

```
src/shared/ai-prompt.ts                  # стандартный запрос, предел, схема, storedAiPrompt / resolveAiPrompt / withAiPrompt
src/shared/settings.ts                   # поле aiPrompt
src/shared/ipc.ts, src/preload/index.ts  # каналы settings:set-ai-prompt и export:copy-for-ai
src/main/ipc.ts                          # обработчики каналов
src/main/settings/settings-store.ts      # settled(): дождаться начатых сохранений
src/main/export/export-meeting.ts        # copyForAi
src/main/index.ts                        # буфер обмена без html; запрос из настроек для копирования
src/renderer/main/AiSettings.tsx         # раздел «ИИ» в настройках
src/renderer/main/CopyForAiButton.tsx    # кнопка в шапке встречи
src/renderer/main/hooks.ts               # useCopiedFlag (из ExportMenu)
src/renderer/main/ExportMenu.tsx, MeetingPane.tsx, SettingsPane.tsx, App.tsx, styles.css
e2e/ai.spec.ts
```

## Задачи

Ветка — `plan-6-copy-ai` (на ней уже документ решений). Проверка после каждой задачи: `npm run typecheck`, затем
`npx vitest run`; где указано — сквозные тесты (`npm run build`, затем `npx playwright test`).

### Task 1: «Запрос для ИИ» в настройках

**Files:**
- Create: `e2e/ai.spec.ts`, `src/renderer/main/AiSettings.tsx`, `src/shared/ai-prompt.test.ts`, `src/shared/ai-prompt.ts`
- Modify: `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/main/SettingsPane.tsx`, `src/renderer/main/styles.css`, `src/shared/ipc.ts`, `src/shared/settings.test.ts`, `src/shared/settings.ts`

**Interfaces:**
- Consumes: `SettingsSchema` (`shared/settings.ts`), `handle` / `settingsState()` в `main/ipc.ts`, `run` в `SettingsPane.tsx`.
- Produces (`shared/ai-prompt.ts`): `AI_PROMPT_MAX = 4000`, `DEFAULT_AI_PROMPT: string`, `AiPromptSchema` (`string ≤ 4000 | null`),
  `storedAiPrompt(text: string | null): string | null`, `resolveAiPrompt(stored: string | null): string`,
  `withAiPrompt(prompt: string, text: string): string`; `Settings.aiPrompt: string | null`; канал `IPC.setAiPrompt`
  (`'settings:set-ai-prompt'`, `string | null` → `SettingsState`), `window.textmeet.setAiPrompt(prompt)`;
  компонент `AiSettings({ aiPrompt, save })` (в Task 3 его свойства меняются).

`shared/ai-prompt.ts` — стандартный запрос (решения Плана 6, §2.3), предел 4000 символов, схема значения и чистые
функции: `storedAiPrompt` (как хранить присланный окном текст: стандартный — `null`, переводы строк — `\n`),
`resolveAiPrompt` (текст по значению из настроек) и `withAiPrompt` (запрос, пустая строка, текст встречи; пустой
запрос не добавляется). В настройках — поле `aiPrompt` (`null` — стандартный, `''` — без запроса; испорченное
забывается, не сбрасывая остальное). Канал `settings:set-ai-prompt`. В окне — раздел «ИИ» между «Расшифровкой» и
«Общими» (`AiSettings.tsx`): поле «Запрос для ИИ», подсказка, «Вернуть стандартный» (видна, только если запрос изменён).
Кнопки «Сохранить» нет: текст уходит в main через 500 мс после последней набранной буквы, при уходе из поля и при уходе
со страницы настроек; пока поле в фокусе, ответ main не перезаписывает набираемый текст.

- [ ] **Step 1: Тесты**

**Создать `e2e/ai.spec.ts`:**

```ts
// «Скопировать для ИИ» и «Запрос для ИИ» в настройках (План 6).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DEFAULT_AI_PROMPT } from '../src/shared/ai-prompt';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';
const createdAt = new Date(2026, 8, 27, 16, 20).toISOString();
const TRANSCRIPT = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T14:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'seg-1', start: 708, end: 712, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false },
    { id: 'seg-2', start: 724, end: 726, speakerId: 'me', text: 'Понял.', edited: false },
  ],
};

function launchWithMeeting(settings?: Record<string, unknown>): Promise<LaunchedApp> {
  return launchApp({
    ...(settings ? { settings } : {}),
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          createdAt,
          durationSec: 32 * 60,
          status: 'done',
          speakerNames: { s1: 'Ирина' },
        }),
      },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
}

const savedPrompt = async (userDataDir: string): Promise<unknown> =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).aiPrompt;

test('the AI prompt starts as the standard one, saves itself and goes back to the standard', async () => {
  launched = await launchWithMeeting();
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await expect(field).toHaveValue(DEFAULT_AI_PROMPT);
  const reset = page.getByRole('button', { name: 'Вернуть стандартный' });
  await expect(reset).toBeHidden();

  await field.fill('Коротко: о чём договорились?');
  await expect(reset).toBeVisible();
  // Сохраняется сам — после паузы набора, без ухода из поля.
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Коротко: о чём договорились?');
  await expect(field).toBeFocused();

  await field.fill('');
  await field.blur();
  await expect.poll(() => savedPrompt(userDataDir)).toBe('');

  await reset.click();
  await expect(field).toHaveValue(DEFAULT_AI_PROMPT);
  await expect(field).toBeFocused();
  await expect(reset).toBeHidden();
  await expect.poll(() => savedPrompt(userDataDir)).toBeNull();
});

test('a prompt typed right before leaving the settings is saved and shown again', async () => {
  launched = await launchWithMeeting();
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('textbox', { name: 'Запрос для ИИ' }).fill('Список задач, по пунктам.');
  // Сразу на встречу — раньше, чем пройдёт пауза набора.
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Список задач, по пунктам.');

  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('textbox', { name: 'Запрос для ИИ' })).toHaveValue('Список задач, по пунктам.');
});
```

**Создать `src/shared/ai-prompt.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { AI_PROMPT_MAX, AiPromptSchema, DEFAULT_AI_PROMPT, resolveAiPrompt, storedAiPrompt, withAiPrompt } from './ai-prompt';

describe('DEFAULT_AI_PROMPT', () => {
  it('explains who is who and asks for the summary parts', () => {
    expect(DEFAULT_AI_PROMPT).toContain('«Я» — это я');
    expect(DEFAULT_AI_PROMPT).toContain('«Спикер 2»');
    expect(DEFAULT_AI_PROMPT.split('\n')).toHaveLength(6);
    expect(DEFAULT_AI_PROMPT).toContain('— задачи: кто, что, к какому сроку;');
    expect(DEFAULT_AI_PROMPT.length).toBeLessThan(AI_PROMPT_MAX);
  });
});

describe('AiPromptSchema', () => {
  it('accepts null, an empty string and a text up to the limit', () => {
    expect(AiPromptSchema.parse(null)).toBeNull();
    expect(AiPromptSchema.parse('')).toBe('');
    expect(AiPromptSchema.parse('я'.repeat(AI_PROMPT_MAX))).toHaveLength(AI_PROMPT_MAX);
  });

  it('rejects a longer text and other types', () => {
    expect(AiPromptSchema.safeParse('я'.repeat(AI_PROMPT_MAX + 1)).success).toBe(false);
    expect(AiPromptSchema.safeParse(42).success).toBe(false);
    expect(AiPromptSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('storedAiPrompt', () => {
  it('stores the standard prompt as null', () => {
    expect(storedAiPrompt(null)).toBeNull();
    expect(storedAiPrompt(DEFAULT_AI_PROMPT)).toBeNull();
    expect(storedAiPrompt(DEFAULT_AI_PROMPT.replace(/\n/g, '\r\n'))).toBeNull();
  });

  it('keeps an own prompt and an empty one, with \n line breaks', () => {
    expect(storedAiPrompt('Кратко:\r\nо чём договорились?')).toBe('Кратко:\nо чём договорились?');
    expect(storedAiPrompt('')).toBe('');
  });
});

describe('resolveAiPrompt', () => {
  it('gives the standard prompt for null and the stored text otherwise', () => {
    expect(resolveAiPrompt(null)).toBe(DEFAULT_AI_PROMPT);
    expect(resolveAiPrompt('Свой')).toBe('Свой');
    expect(resolveAiPrompt('')).toBe('');
  });
});

describe('withAiPrompt', () => {
  it('puts the prompt, an empty line and the text', () => {
    expect(withAiPrompt('  Итоги, пожалуйста.\n', 'Встреча\nтекст\n')).toBe('Итоги, пожалуйста.\n\nВстреча\nтекст\n');
  });

  it('turns \r\n of the prompt into \n', () => {
    expect(withAiPrompt('а\r\nб', 'т')).toBe('а\nб\n\nт');
  });

  it('adds nothing for an empty or blank prompt', () => {
    expect(withAiPrompt('', 'текст')).toBe('текст');
    expect(withAiPrompt(' \n\t', 'текст')).toBe('текст');
  });
});
```

**В `src/shared/settings.test.ts` заменить:**

```ts
      recordSounds: true,
      asrModel: 'gigaam-v3-e2e-rnnt',
      exportDir: null,
    });
  });
```

**на:**

```ts
      recordSounds: true,
      asrModel: 'gigaam-v3-e2e-rnnt',
      exportDir: null,
      aiPrompt: null,
    });
  });
```

**В `src/shared/settings.test.ts` заменить:**

```ts
    expect(SettingsSchema.parse({ exportDir: 42 }).exportDir).toBeNull();
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
```

**на:**

```ts
    expect(SettingsSchema.parse({ exportDir: 42 }).exportDir).toBeNull();
  });

  it('keeps an own AI prompt and an empty one', () => {
    expect(SettingsSchema.parse({ aiPrompt: 'Кратко: о чём договорились?' }).aiPrompt).toBe('Кратко: о чём договорились?');
    expect(SettingsSchema.parse({ aiPrompt: '' }).aiPrompt).toBe('');
  });

  it('forgets a broken AI prompt without dropping the other settings', () => {
    expect(SettingsSchema.parse({ aiPrompt: 42, recordSounds: false })).toMatchObject({ aiPrompt: null, recordSounds: false });
    expect(SettingsSchema.parse({ aiPrompt: 'я'.repeat(4001) }).aiPrompt).toBeNull();
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/shared/ai-prompt.test.ts src/shared/settings.test.ts`
Ожидается: FAIL — нет модуля `./ai-prompt`, у настроек нет поля `aiPrompt`.

- [ ] **Step 3: Код**

**В `src/main/ipc.ts` заменить:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { IMPORT_EXTENSIONS } from '../shared/import';
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
```

**на:**

```ts
  type RecorderMessageChannel,
  type SettingsState,
} from '../shared/ipc';
import { AiPromptSchema, storedAiPrompt } from '../shared/ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { IMPORT_EXTENSIONS } from '../shared/import';
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
```

**В `src/main/ipc.ts` заменить:**

```ts
    return settingsState();
  });

  handle(IPC.setHotkey, async (arg) => {
    const next = z.string().min(1).max(100).nullable().parse(arg);
    const result = deps.hotkeys.change(next);
```

**на:**

```ts
    return settingsState();
  });

  handle(IPC.setAiPrompt, async (arg) => {
    await deps.settings.update({ aiPrompt: storedAiPrompt(AiPromptSchema.parse(arg)) });
    return settingsState();
  });

  handle(IPC.setHotkey, async (arg) => {
    const next = z.string().min(1).max(100).nullable().parse(arg);
    const result = deps.hotkeys.change(next);
```

**В `src/preload/index.ts` заменить:**

```ts
  chooseLibraryDir: () => invoke(IPC.chooseLibraryDir),
  setMicrophone: (deviceId) => invoke(IPC.setMicrophone, deviceId),
  setRecordSounds: (enabled) => invoke(IPC.setRecordSounds, enabled),
  setHotkey: (accelerator) => invoke(IPC.setHotkey, accelerator),
  suspendHotkey: (suspended) => invoke(IPC.suspendHotkey, suspended),
  openLibraryDir: () => invoke(IPC.openLibraryDir),
```

**на:**

```ts
  chooseLibraryDir: () => invoke(IPC.chooseLibraryDir),
  setMicrophone: (deviceId) => invoke(IPC.setMicrophone, deviceId),
  setRecordSounds: (enabled) => invoke(IPC.setRecordSounds, enabled),
  setAiPrompt: (prompt) => invoke(IPC.setAiPrompt, prompt),
  setHotkey: (accelerator) => invoke(IPC.setHotkey, accelerator),
  suspendHotkey: (suspended) => invoke(IPC.suspendHotkey, suspended),
  openLibraryDir: () => invoke(IPC.openLibraryDir),
```

**Создать `src/renderer/main/AiSettings.tsx`:**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_PROMPT_MAX, DEFAULT_AI_PROMPT, resolveAiPrompt } from '../../shared/ai-prompt';

/** Пауза набора перед сохранением запроса. */
const SAVE_DELAY_MS = 500;

interface Props {
  /** Значение из настроек: null — стандартный запрос, '' — без запроса. */
  aiPrompt: string | null;
  /** Отправить в main; ошибку показывает страница настроек, набранный текст остаётся в поле. */
  save(prompt: string | null): void;
}

/**
 * Настройки → «ИИ» (решения Плана 6, §2.2): «Запрос для ИИ». Кнопки «Сохранить» нет: текст уходит в main через
 * полсекунды после последней набранной буквы, при уходе из поля и при уходе со страницы настроек.
 */
export function AiSettings({ aiPrompt, save }: Props) {
  const [text, setText] = useState(() => resolveAiPrompt(aiPrompt));
  const field = useRef<HTMLTextAreaElement>(null);
  /** Набранный, но ещё не отправленный текст. */
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSave = useRef(save);
  latestSave.current = save;

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const flush = useCallback(() => {
    cancelTimer();
    const value = pending.current;
    pending.current = null;
    if (value !== null) latestSave.current(value);
  }, []);

  // Пока поле в фокусе, ответ main не перезаписывает набираемый текст.
  useEffect(() => {
    if (document.activeElement !== field.current) setText(resolveAiPrompt(aiPrompt));
  }, [aiPrompt]);

  // Ушли со страницы настроек — набранное отправляется сразу.
  useEffect(() => flush, [flush]);

  const change = (value: string) => {
    setText(value);
    pending.current = value;
    cancelTimer();
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const reset = () => {
    cancelTimer();
    pending.current = null;
    setText(DEFAULT_AI_PROMPT);
    latestSave.current(null);
    // Ссылка исчезает — фокус в поле.
    field.current?.focus();
  };

  return (
    <section className="sec">
      <h2>ИИ</h2>
      <div className="fld">
        <div className="lb">Запрос для ИИ</div>
        <div className="ctl">
          <textarea
            ref={field}
            className="ta"
            aria-label="Запрос для ИИ"
            rows={8}
            maxLength={AI_PROMPT_MAX}
            value={text}
            onChange={(e) => change(e.currentTarget.value)}
            onBlur={flush}
          />
          <small>
            Добавляется перед текстом встречи, когда вы нажимаете «Скопировать для ИИ». Вставьте скопированное в
            Claude, ChatGPT или другой чат.
          </small>
          {text !== DEFAULT_AI_PROMPT && (
            <button type="button" className="lnk" onClick={reset}>
              Вернуть стандартный
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
import { useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
import { HotkeyField } from './HotkeyField';
```

**на:**

```tsx
import { useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { AiSettings } from './AiSettings';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
import { HotkeyField } from './HotkeyField';
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
  );
}

/** Настройки: запись, расшифровка и общие. Раздел ИИ появится в Плане 6. */
export function SettingsPane({ state, info, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const microphones = useMicrophones();
```

**на:**

```tsx
  );
}

/** Настройки: запись, расшифровка, ИИ и общие. */
export function SettingsPane({ state, info, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const microphones = useMicrophones();
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx

        <TranscriptionSettings />

        <section className="sec">
          <h2>Общие</h2>
          <div className="fld">
```

**на:**

```tsx

        <TranscriptionSettings />

        <AiSettings
          aiPrompt={settings.aiPrompt}
          save={(prompt) => void run(() => window.textmeet.setAiPrompt(prompt))}
        />

        <section className="sec">
          <h2>Общие</h2>
          <div className="fld">
```

**В `src/renderer/main/styles.css` заменить:**

```css

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**на:**

```css

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
  line-height: 1.45;
}

.hr {
  display: flex;
  align-items: center;
```

**на:**

```css
  line-height: 1.45;
}

/* «Запрос для ИИ»: многострочное поле во всю ширину, высоту можно менять. */
.ta {
  width: 100%;
  min-height: 150px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  padding: 10px 12px;
  line-height: 1.5;
}

.hr {
  display: flex;
  align-items: center;
```

**Создать `src/shared/ai-prompt.ts`:**

```ts
// «Скопировать для ИИ» (решения Плана 6): запрос, который ставится перед текстом встречи. Нужен и окну (поле в
// настройках), и main (копирование).
import { z } from 'zod';

/** Длиннее запрос в настройках не принимается. */
export const AI_PROMPT_MAX = 4000;

/** Стандартный запрос: пояснение, кто есть кто в расшифровке, и что нужно в итогах. */
export const DEFAULT_AI_PROMPT = [
  'Ниже — расшифровка встречи, сделанная автоматически: в ней могут быть ошибки распознавания. «Я» — это я, «Спикер 2», «Спикер 3» — участники, чьи имена неизвестны.',
  'Сделай итоги встречи по-русски, кратко:',
  '— 3–5 главных пунктов;',
  '— принятые решения;',
  '— задачи: кто, что, к какому сроку;',
  '— открытые вопросы.',
].join('\n');

/** Запрос в настройках: null — стандартный, '' — без запроса, иначе — свой текст. */
export const AiPromptSchema = z.string().max(AI_PROMPT_MAX).nullable();

const normalize = (text: string): string => text.replace(/\r\n?/g, '\n');

/** Как хранить присланный окном текст: стандартный — null (тогда его улучшения в новых версиях дойдут сами). */
export function storedAiPrompt(text: string | null): string | null {
  if (text === null) return null;
  const normalized = normalize(text);
  return normalized === DEFAULT_AI_PROMPT ? null : normalized;
}

/** Текст запроса по значению из настроек. */
export function resolveAiPrompt(stored: string | null): string {
  return stored ?? DEFAULT_AI_PROMPT;
}

/** Запрос, пустая строка, текст встречи. Пустой запрос (одни пробелы) не добавляется. */
export function withAiPrompt(prompt: string, text: string): string {
  const clean = normalize(prompt).trim();
  return clean === '' ? text : `${clean}\n\n${text}`;
}
```

**В `src/shared/ipc.ts` заменить:**

```ts
  chooseLibraryDir: 'settings:choose-library-dir',
  setMicrophone: 'settings:set-microphone',
  setRecordSounds: 'settings:set-record-sounds',
  setHotkey: 'settings:set-hotkey',
  suspendHotkey: 'settings:suspend-hotkey',
  openLibraryDir: 'library:open-dir',
```

**на:**

```ts
  chooseLibraryDir: 'settings:choose-library-dir',
  setMicrophone: 'settings:set-microphone',
  setRecordSounds: 'settings:set-record-sounds',
  setAiPrompt: 'settings:set-ai-prompt',
  setHotkey: 'settings:set-hotkey',
  suspendHotkey: 'settings:suspend-hotkey',
  openLibraryDir: 'library:open-dir',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.chooseLibraryDir]: { arg: void; result: SettingsState };
  [IPC.setMicrophone]: { arg: string | null; result: SettingsState };
  [IPC.setRecordSounds]: { arg: boolean; result: SettingsState };
  [IPC.setHotkey]: { arg: string | null; result: HotkeyChange };
  [IPC.suspendHotkey]: { arg: boolean; result: void };
  [IPC.openLibraryDir]: { arg: void; result: void };
```

**на:**

```ts
  [IPC.chooseLibraryDir]: { arg: void; result: SettingsState };
  [IPC.setMicrophone]: { arg: string | null; result: SettingsState };
  [IPC.setRecordSounds]: { arg: boolean; result: SettingsState };
  [IPC.setAiPrompt]: { arg: string | null; result: SettingsState };
  [IPC.setHotkey]: { arg: string | null; result: HotkeyChange };
  [IPC.suspendHotkey]: { arg: boolean; result: void };
  [IPC.openLibraryDir]: { arg: void; result: void };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  chooseLibraryDir(): Promise<SettingsState>;
  setMicrophone(deviceId: string | null): Promise<SettingsState>;
  setRecordSounds(enabled: boolean): Promise<SettingsState>;
  /** null — вернуть комбинацию по умолчанию. */
  setHotkey(accelerator: string | null): Promise<HotkeyChange>;
  /** Пока в настройках вводят новую комбинацию, действующая снимается. */
```

**на:**

```ts
  chooseLibraryDir(): Promise<SettingsState>;
  setMicrophone(deviceId: string | null): Promise<SettingsState>;
  setRecordSounds(enabled: boolean): Promise<SettingsState>;
  /** «Запрос для ИИ»: null — стандартный, '' — без запроса. */
  setAiPrompt(prompt: string | null): Promise<SettingsState>;
  /** null — вернуть комбинацию по умолчанию. */
  setHotkey(accelerator: string | null): Promise<HotkeyChange>;
  /** Пока в настройках вводят новую комбинацию, действующая снимается. */
```

**В `src/shared/settings.ts` заменить:**

```ts
import { z } from 'zod';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL } from './asr-models';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
```

**на:**

```ts
import { z } from 'zod';
import { AiPromptSchema } from './ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL } from './asr-models';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
```

**В `src/shared/settings.ts` заменить:**

```ts
  asrModel: z.enum(ASR_MODEL_IDS).default(DEFAULT_ASR_MODEL).catch(DEFAULT_ASR_MODEL),
  /** Папка, куда последний раз сохраняли выгрузку встречи; null — «Документы». Испорченная — забывается. */
  exportDir: z.string().min(1).nullable().default(null).catch(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

**на:**

```ts
  asrModel: z.enum(ASR_MODEL_IDS).default(DEFAULT_ASR_MODEL).catch(DEFAULT_ASR_MODEL),
  /** Папка, куда последний раз сохраняли выгрузку встречи; null — «Документы». Испорченная — забывается. */
  exportDir: z.string().min(1).nullable().default(null).catch(null),
  /**
   * «Запрос для ИИ»: null — стандартный (shared/ai-prompt.ts), '' — без запроса, иначе — свой текст. Испорченный
   * (не строка, длиннее 4000 символов) — забывается.
   */
  aiPrompt: AiPromptSchema.default(null).catch(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  967 passed (967)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `63 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: AI prompt in settings"
```

### Task 2: «Скопировать для ИИ» во встрече

**Files:**
- Create: `src/renderer/main/CopyForAiButton.tsx`
- Modify: `e2e/ai.spec.ts`, `src/main/export/export-meeting.test.ts`, `src/main/export/export-meeting.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/main/ExportMenu.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/hooks.ts`, `src/shared/ipc.ts`

**Interfaces:**
- Consumes: `resolveAiPrompt`, `withAiPrompt` (Task 1), `Settings.aiPrompt` (Task 1), `loadDoc` и
  `toPlainText` (План 5).
- Produces: `copyForAi(deps: ExportDeps, meetingId: string): Promise<void>`; в `ExportDeps` — `aiPrompt(): string | null`
  (в Task 3 станет асинхронным) и `writeClipboard(data: { text: string; html?: string })`; канал `IPC.copyForAi`
  (`'export:copy-for-ai'`, id встречи → `void`), `window.textmeet.copyForAi(meetingId)`;
  `useCopiedFlag(): [copied: boolean, markCopied: () => void]` в `hooks.ts`; `CopyForAiButton({ meetingId, onError })`.

`copyForAi` в `main/export/export-meeting.ts`: тот же текст встречи, что у «Скопировать всё» (те же ошибки
«нет текста» и «не удалось прочитать»), перед ним — запрос из настроек и пустая строка; в буфер обмена — только простой
текст (`ClipboardItem` с одним `text/plain`: чаты вставляют его без лишнего оформления). Канал `export:copy-for-ai`.
В окне — кнопка «Скопировать для ИИ» слева от «Экспорта» (`CopyForAiButton.tsx`), видна тогда же, когда «Экспорт».
После нажатия на 2 секунды — «✓ Скопировано»; этот таймер вынесен из `ExportMenu` в общий хук `useCopiedFlag`.

- [ ] **Step 1: Тесты**

**В `e2e/ai.spec.ts` заменить:**

```ts
// «Скопировать для ИИ» и «Запрос для ИИ» в настройках (План 6).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DEFAULT_AI_PROMPT } from '../src/shared/ai-prompt';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';
```

**на:**

```ts
// «Скопировать для ИИ» и «Запрос для ИИ» в настройках (План 6).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { DEFAULT_AI_PROMPT } from '../src/shared/ai-prompt';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';
```

**В `e2e/ai.spec.ts` заменить:**

```ts
  ],
};

function launchWithMeeting(settings?: Record<string, unknown>): Promise<LaunchedApp> {
  return launchApp({
    ...(settings ? { settings } : {}),
    meetings: [
      {
        id: ID,
```

**на:**

```ts
  ],
};

function launchWithMeeting(): Promise<LaunchedApp> {
  return launchApp({
    meetings: [
      {
        id: ID,
```

**В `e2e/ai.spec.ts` заменить:**

```ts
  });
}

const savedPrompt = async (userDataDir: string): Promise<unknown> =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).aiPrompt;
```

**на:**

```ts
  });
}

const EXPECTED_TEXT =
  'Созвон с Ириной\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
  'Ирина [11:48]\nСмотри, по бюджету.\n\nЯ [12:04]\nПонял.\n';

async function openMeeting(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Смотри, по бюджету.');
}

/** Что лежит в буфере обмена: простой текст и есть ли оформленный. */
async function clipboardNow(app: ElectronApplication): Promise<{ text: string; hasHtml: boolean }> {
  return app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    return { text: (await clipboard.readText()).replace(/\r\n/g, '\n'), hasHtml: item?.types.includes('text/html') ?? false };
  });
}

const savedPrompt = async (userDataDir: string): Promise<unknown> =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).aiPrompt;
```

**В `e2e/ai.spec.ts` заменить:**

```ts
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('textbox', { name: 'Запрос для ИИ' })).toHaveValue('Список задач, по пунктам.');
});
```

**на:**

```ts
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('textbox', { name: 'Запрос для ИИ' })).toHaveValue('Список задач, по пунктам.');
});

test('copies the standard prompt and the meeting text as plain text', async () => {
  launched = await launchWithMeeting();
  const { app, page } = launched;
  await openMeeting(page);
  const button = page.getByRole('button', { name: 'Скопировать для ИИ' });
  await button.click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Текст встречи с запросом скопирован' })).toBeAttached();
  expect(await clipboardNow(app)).toEqual({ text: `${DEFAULT_AI_PROMPT}\n\n${EXPECTED_TEXT}`, hasHtml: false });
  await expect(button).toBeVisible({ timeout: 5_000 });
});

test('copies with the own prompt, and only the text when the prompt is empty', async () => {
  launched = await launchWithMeeting();
  const { app, page, userDataDir } = launched;
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('Что решили по бюджету?');
  // Набранный запрос уходит в main при уходе со страницы настроек; копируем, когда он сохранён.
  await openMeeting(page);
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Что решили по бюджету?');
  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  expect((await clipboardNow(app)).text).toBe(`Что решили по бюджету?\n\n${EXPECTED_TEXT}`);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('');
  await openMeeting(page);
  await expect.poll(() => savedPrompt(userDataDir)).toBe('');
  await page.getByRole('button', { name: /Скопировать для ИИ|Скопировано/ }).click();
  await expect.poll(async () => (await clipboardNow(app)).text).toBe(EXPECTED_TEXT);
});

test('a meeting without text has no «Скопировать для ИИ»', async () => {
  const id = '2026-09-28_1430_d4e5f6';
  launched = await launchApp({ meetings: [{ id, json: meetingJson(id, { title: 'Только запись' }) }] });
  const { page } = launched;
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Только запись/ }).click();
  await expect(page.getByRole('heading', { name: 'Только запись' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скопировать для ИИ' })).toHaveCount(0);
});
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { copyMeeting, exportTexts, saveMeeting, type ExportDeps } from './export-meeting';

const transcript: Transcript = {
  schemaVersion: 1,
```

**на:**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { copyForAi, copyMeeting, exportTexts, saveMeeting, type ExportDeps } from './export-meeting';

const transcript: Transcript = {
  schemaVersion: 1,
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
  return { lib, id: meeting.id };
}

function deps(lib: string, over: Partial<ExportDeps> = {}): ExportDeps & { clipboard: { text: string; html: string }[] } {
  const clipboard: { text: string; html: string }[] = [];
  const out = makeTempDir('textmeet-export-out-');
  return {
    clipboard,
```

**на:**

```ts
  return { lib, id: meeting.id };
}

type Clip = { text: string; html?: string };

function deps(lib: string, over: Partial<ExportDeps> = {}): ExportDeps & { clipboard: Clip[] } {
  const clipboard: Clip[] = [];
  const out = makeTempDir('textmeet-export-out-');
  return {
    clipboard,
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
      clipboard.push(data);
    },
    exportDir: () => null,
    rememberExportDir: async () => undefined,
    documentsDir: () => out,
    platform: 'win32',
```

**на:**

```ts
      clipboard.push(data);
    },
    exportDir: () => null,
    aiPrompt: () => null,
    rememberExportDir: async () => undefined,
    documentsDir: () => out,
    platform: 'win32',
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
  });
});

describe('saveMeeting', () => {
  it('offers a safe file name in the documents folder and remembers the folder', async () => {
    const { lib, id } = await meetingWithText();
```

**на:**

```ts
  });
});

const PLAIN =
  'Созвон: Ирина / бюджет\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
  'Ирина [11:48]\nСмотри, по бюджету. Подрядчиков отдельно.\n\nЯ [12:04]\nПонял.\n';

describe('copyForAi', () => {
  it('puts the standard prompt, an empty line and the plain text — without html', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib);
    await copyForAi(d, id);
    expect(d.clipboard).toEqual([{ text: `${DEFAULT_AI_PROMPT}\n\n${PLAIN}` }]);
  });

  it('takes the own prompt from the settings at the moment of copying', async () => {
    const { lib, id } = await meetingWithText();
    let prompt: string | null = 'Что решили?';
    const d = deps(lib, { aiPrompt: () => prompt });
    await copyForAi(d, id);
    prompt = '  Кратко.\r\nПо пунктам.  ';
    await copyForAi(d, id);
    expect(d.clipboard.map((c) => c.text)).toEqual([`Что решили?\n\n${PLAIN}`, `Кратко.\nПо пунктам.\n\n${PLAIN}`]);
  });

  it('copies only the text when the prompt is empty', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib, { aiPrompt: () => '' });
    await copyForAi(d, id);
    expect(d.clipboard).toEqual([{ text: PLAIN }]);
  });

  it('refuses a meeting without text and says plainly that the text could not be read', async () => {
    const empty = await meetingWithText(null);
    await expect(copyForAi(deps(empty.lib), empty.id)).rejects.toThrow(exportTexts.noText);
    const { lib, id } = await meetingWithText();
    writeFileSync(join(lib, id, 'transcript.json'), '{ сломано');
    const d = deps(lib);
    await expect(copyForAi(d, id)).rejects.toThrow(exportTexts.unreadable);
    expect(d.clipboard).toEqual([]);
  });
});

describe('saveMeeting', () => {
  it('offers a safe file name in the documents folder and remembers the folder', async () => {
    const { lib, id } = await meetingWithText();
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/export/export-meeting.test.ts`
Ожидается: FAIL — нет `copyForAi` в `./export-meeting`.

- [ ] **Step 3: Код**

**В `src/main/export/export-meeting.ts` заменить:**

```ts
// «Скопировать всё» и «Сохранить…» (решения Плана 5, §2.3, §4.6): текст берётся из файлов встречи на диске — с
// правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { humanFsError } from '../fs/fs-errors';
```

**на:**

```ts
// «Скопировать всё» и «Сохранить…» (решения Плана 5, §2.3, §4.6) и «Скопировать для ИИ» (решения Плана 6, §3.2): текст
// берётся из файлов встречи на диске — с правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { resolveAiPrompt, withAiPrompt } from '../../shared/ai-prompt';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { humanFsError } from '../fs/fs-errors';
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
  libraryDir(): string;
  /** Окно сохранения системы; null — человек передумал. */
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html: string }): Promise<void>;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
```

**на:**

```ts
  libraryDir(): string;
  /** Окно сохранения системы; null — человек передумал. */
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и (если есть) оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html?: string }): Promise<void>;
  /** «Запрос для ИИ» из настроек: null — стандартный, '' — без запроса. */
  aiPrompt(): string | null;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
  if (format === 'docx') return toDocx(doc);
  return BOM + toPlainText(doc, platform === 'win32' ? '\r\n' : '\n');
```

**на:**

```ts
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

/** «Скопировать для ИИ»: запрос и текст встречи — только простым текстом (чаты вставляют его без лишнего оформления). */
export async function copyForAi(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: withAiPrompt(resolveAiPrompt(deps.aiPrompt()), toPlainText(doc)) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
  if (format === 'docx') return toDocx(doc);
  return BOM + toPlainText(doc, platform === 'win32' ? '\r\n' : '\n');
```

**В `src/main/index.ts` заменить:**

```ts
        const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      writeClipboard: (data) => clipboard.write([new ClipboardItem({ 'text/plain': data.text, 'text/html': data.html })]),
      exportDir: () => settings.get().exportDir,
      rememberExportDir: (dir) => settings.update({ exportDir: dir }),
      documentsDir: () => app.getPath('documents'),
      platform: process.platform,
```

**на:**

```ts
        const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      writeClipboard: (data) =>
        clipboard.write([
          new ClipboardItem(
            data.html === undefined ? { 'text/plain': data.text } : { 'text/plain': data.text, 'text/html': data.html },
          ),
        ]),
      exportDir: () => settings.get().exportDir,
      aiPrompt: () => settings.get().aiPrompt,
      rememberExportDir: (dir) => settings.update({ exportDir: dir }),
      documentsDir: () => app.getPath('documents'),
      platform: process.platform,
```

**В `src/main/ipc.ts` заменить:**

```ts
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import type { Importer } from './import/importer';
```

**на:**

```ts
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { copyForAi, copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import type { Importer } from './import/importer';
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.copyMeeting, (arg) => copyMeeting(deps.exporting, MeetingIdSchema.parse(arg)));

  handle(IPC.saveMeeting, (arg) => {
    const request = SaveMeetingSchema.parse(arg);
    return saveMeeting(deps.exporting, request.meetingId, request.format);
```

**на:**

```ts

  handle(IPC.copyMeeting, (arg) => copyMeeting(deps.exporting, MeetingIdSchema.parse(arg)));

  handle(IPC.copyForAi, (arg) => copyForAi(deps.exporting, MeetingIdSchema.parse(arg)));

  handle(IPC.saveMeeting, (arg) => {
    const request = SaveMeetingSchema.parse(arg);
    return saveMeeting(deps.exporting, request.meetingId, request.format);
```

**В `src/preload/index.ts` заменить:**

```ts
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
  pickImportFiles: () => invoke(IPC.pickImportFiles),
  importFiles: (paths) => invoke(IPC.importFiles, paths),
```

**на:**

```ts
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  copyForAi: (meetingId) => invoke(IPC.copyForAi, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
  pickImportFiles: () => invoke(IPC.pickImportFiles),
  importFiles: (paths) => invoke(IPC.importFiles, paths),
```

**Создать `src/renderer/main/CopyForAiButton.tsx`:**

```tsx
import { errorText } from './errors';
import { useCopiedFlag } from './hooks';
import { CheckIcon, CopyIcon } from './icons';

interface Props {
  meetingId: string;
  onError(message: string): void;
}

/** «Скопировать для ИИ» в заголовке встречи (решения Плана 6, §2.1): запрос из настроек и текст встречи. */
export function CopyForAiButton({ meetingId, onError }: Props) {
  const [copied, markCopied] = useCopiedFlag();

  const copy = () => {
    window.textmeet
      .copyForAi(meetingId)
      .then(markCopied)
      .catch((err: unknown) => onError(errorText(err)));
  };

  return (
    <>
      <button type="button" className="btn" onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'Скопировано' : 'Скопировать для ИИ'}
      </button>
      {/* Экранному диктору — отдельно от названия кнопки. */}
      <span className="sr-only" role="status">
        {copied ? 'Текст встречи с запросом скопирован' : ''}
      </span>
    </>
  );
}
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ExportFormat } from '../../shared/ipc';
import { errorText } from './errors';
import { CheckIcon, ChevronIcon, CopyIcon, ExportIcon, FileIcon } from './icons';
import { menuFocusStep } from './menu-keys';
```

**на:**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ExportFormat } from '../../shared/ipc';
import { errorText } from './errors';
import { useCopiedFlag } from './hooks';
import { CheckIcon, ChevronIcon, CopyIcon, ExportIcon, FileIcon } from './icons';
import { menuFocusStep } from './menu-keys';
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
  onError(message: string): void;
}

/** Сколько кнопка показывает «Скопировано». */
const COPIED_MS = 2000;

/** Кнопка «Экспорт» в заголовке встречи: «Скопировать всё», «Сохранить в Word», «Сохранить как текст» (лист 15). */
export function ExportMenu({ meetingId, onError }: Props) {
  const [open, setOpen] = useState(false);
  /** Сколько раз скопировали: каждое копирование заново показывает «Скопировано» на 2 с. */
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
```

**на:**

```tsx
  onError(message: string): void;
}

/** Кнопка «Экспорт» в заголовке встречи: «Скопировать всё», «Сохранить в Word», «Сохранить как текст» (лист 15). */
export function ExportMenu({ meetingId, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, markCopied] = useCopiedFlag();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (copies === 0) return;
    setCopied(true);
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copies]);

  /** Пункт выбран: меню закрывается, фокус — на «Экспорт» (пункт исчезает вместе с меню). */
  const close = () => {
    button.current?.focus();
```

**на:**

```tsx
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /** Пункт выбран: меню закрывается, фокус — на «Экспорт» (пункт исчезает вместе с меню). */
  const close = () => {
    button.current?.focus();
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
    close();
    window.textmeet
      .copyMeeting(meetingId)
      .then(() => setCopies((n) => n + 1))
      .catch((err: unknown) => onError(errorText(err)));
  };
```

**на:**

```tsx
    close();
    window.textmeet
      .copyMeeting(meetingId)
      .then(markCopied)
      .catch((err: unknown) => onError(errorText(err)));
  };
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { ExportMenu } from './ExportMenu';
import { importView } from './import-format';
import { MeetingTitle } from './MeetingTitle';
```

**на:**

```tsx
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { CopyForAiButton } from './CopyForAiButton';
import { ExportMenu } from './ExportMenu';
import { importView } from './import-format';
import { MeetingTitle } from './MeetingTitle';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
              {actions.header}
            </button>
          )}
          {canExport && <ExportMenu meetingId={meeting.id} onError={onError} />}
          <MeetingMenu
            meeting={meeting}
```

**на:**

```tsx
              {actions.header}
            </button>
          )}
          {canExport && <CopyForAiButton meetingId={meeting.id} onError={onError} />}
          {canExport && <ExportMenu meetingId={meeting.id} onError={onError} />}
          <MeetingMenu
            meeting={meeting}
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import { cleanDeviceLabel } from './format';
import { nextSpeed } from './playback';

/** Состояние записи из main: сначала запрос, дальше — события. */
export function useRecordingState(): RecordingState | null {
  const [state, setState] = useState<RecordingState | null>(null);
```

**на:**

```ts
import { cleanDeviceLabel } from './format';
import { nextSpeed } from './playback';

/** Сколько кнопка показывает «Скопировано». */
const COPIED_MS = 2000;

/**
 * «Скопировано» на кнопке копирования: true на 2 с после markCopied(); каждое новое копирование снова показывает
 * «Скопировано» на 2 с.
 */
export function useCopiedFlag(): [boolean, () => void] {
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copies === 0) return;
    setCopied(true);
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copies]);
  const markCopied = useCallback(() => setCopies((n) => n + 1), []);
  return [copied, markCopied];
}

/** Состояние записи из main: сначала запрос, дальше — события. */
export function useRecordingState(): RecordingState | null {
  const [state, setState] = useState<RecordingState | null>(null);
```

**В `src/shared/ipc.ts` заменить:**

```ts
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  copyMeeting: 'export:copy',
  saveMeeting: 'export:save',
  pickImportFiles: 'import:pick',
  importFiles: 'import:files',
```

**на:**

```ts
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  copyMeeting: 'export:copy',
  copyForAi: 'export:copy-for-ai',
  saveMeeting: 'export:save',
  pickImportFiles: 'import:pick',
  importFiles: 'import:files',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
  [IPC.pickImportFiles]: { arg: void; result: string[] };
  [IPC.importFiles]: { arg: string[]; result: ImportResult };
```

**на:**

```ts
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.copyForAi]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
  [IPC.pickImportFiles]: { arg: void; result: string[] };
  [IPC.importFiles]: { arg: string[]; result: ImportResult };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  selectModel(id: AsrModelId): Promise<ModelsState>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Сохранить в Word» / «Сохранить как текст»: окно сохранения системы и файл. */
  saveMeeting(request: SaveMeetingRequest): Promise<SaveMeetingResult>;
  /** «Импорт файла»: окно выбора файлов системы; пусто — передумали. */
```

**на:**

```ts
  selectModel(id: AsrModelId): Promise<ModelsState>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Скопировать для ИИ»: запрос из настроек и текст встречи — в буфер обмена простым текстом. */
  copyForAi(meetingId: string): Promise<void>;
  /** «Сохранить в Word» / «Сохранить как текст»: окно сохранения системы и файл. */
  saveMeeting(request: SaveMeetingRequest): Promise<SaveMeetingResult>;
  /** «Импорт файла»: окно выбора файлов системы; пусто — передумали. */
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  971 passed (971)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `66 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: copy for AI"
```

### Task 3: Доработки по ревью: неудачное сохранение запроса и копирование сразу после настроек

**Files:**
- Modify: `e2e/ai.spec.ts`, `src/main/export/export-meeting.test.ts`, `src/main/export/export-meeting.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/settings/settings-store.test.ts`, `src/main/settings/settings-store.ts`, `src/renderer/main/AiSettings.tsx`, `src/renderer/main/App.tsx`, `src/renderer/main/SettingsPane.tsx`

**Interfaces:**
- Consumes: всё из Task 1 и Task 2; `humanFsError(action, err)` (`main/fs/fs-errors.ts`), `errorText` (окно).
- Produces: `SettingsStore.settled(): Promise<void>`; `ExportDeps.aiPrompt(): Promise<string | null>`; свойства
  `AiSettings({ aiPrompt, save(prompt): Promise<SettingsState>, onSaved(next), onError(message | null),
  onErrorAfterLeave(message) })`; новое свойство `SettingsPane` — `onError(message: string)` (строка ошибки слева в
  `App`).

Ревью кода (typescript-reviewer) нашло два недочёта и мелочи:
- сохранение запроса не удалось — набранное терялось молча, а если это случилось при уходе со страницы настроек,
  ошибку было некому показать. Теперь текст остаётся в поле и уходит снова при следующем уходе из поля или со страницы;
  ошибка после ухода — в строке слева (`onErrorAfterLeave`), а main пишет понятную причину («Не удалось сохранить
  запрос для ИИ: …» через `humanFsError`);
- ответ на более раннее сохранение мог на миг вернуть в поле старый текст: поле не трогается, пока есть неотправленный
  текст или сохранение ещё не ответило;
- «Скопировать для ИИ» сразу после ухода из настроек мог взять прежний запрос: копия ждёт начатых сохранений настроек
  (`SettingsStore.settled()`);
- подсказка под полем связана с ним (`aria-describedby`).

- [ ] **Step 1: Тесты**

**В `e2e/ai.spec.ts` заменить:**

```ts
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('textbox', { name: 'Запрос для ИИ' }).fill('Список задач, по пунктам.');
  // Сразу на встречу — раньше, чем пройдёт пауза набора.
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Список задач, по пунктам.');

  await page.getByRole('button', { name: 'Настройки' }).click();
```

**на:**

```ts
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('textbox', { name: 'Запрос для ИИ' }).fill('Список задач, по пунктам.');
  // Сразу на встречу — раньше, чем пройдёт пауза набора, и не уводя фокус из поля щелчком: набранное отправляется,
  // когда страница настроек закрывается.
  await page
    .getByRole('navigation', { name: 'Встречи' })
    .getByRole('button', { name: /Созвон с Ириной/ })
    .dispatchEvent('click');
  await expect(page.getByLabel('Текст встречи')).toContainText('Смотри, по бюджету.');
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Список задач, по пунктам.');

  await page.getByRole('button', { name: 'Настройки' }).click();
```

**В `e2e/ai.spec.ts` заменить:**

```ts

test('copies with the own prompt, and only the text when the prompt is empty', async () => {
  launched = await launchWithMeeting();
  const { app, page, userDataDir } = launched;
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('Что решили по бюджету?');
  // Набранный запрос уходит в main при уходе со страницы настроек; копируем, когда он сохранён.
  await openMeeting(page);
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Что решили по бюджету?');
  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  expect((await clipboardNow(app)).text).toBe(`Что решили по бюджету?\n\n${EXPECTED_TEXT}`);
```

**на:**

```ts

test('copies with the own prompt, and only the text when the prompt is empty', async () => {
  launched = await launchWithMeeting();
  const { app, page } = launched;
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('Что решили по бюджету?');
  // Сразу на встречу и копировать: копия ждёт сохранения запроса, набранного перед уходом из настроек.
  await openMeeting(page);
  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  expect((await clipboardNow(app)).text).toBe(`Что решили по бюджету?\n\n${EXPECTED_TEXT}`);
```

**В `e2e/ai.spec.ts` заменить:**

```ts
  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('');
  await openMeeting(page);
  await expect.poll(() => savedPrompt(userDataDir)).toBe('');
  await page.getByRole('button', { name: /Скопировать для ИИ|Скопировано/ }).click();
  await expect.poll(async () => (await clipboardNow(app)).text).toBe(EXPECTED_TEXT);
});

test('a meeting without text has no «Скопировать для ИИ»', async () => {
```

**на:**

```ts
  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('');
  await openMeeting(page);
  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  expect((await clipboardNow(app)).text).toBe(EXPECTED_TEXT);
});

test('a prompt that could not be saved stays in the field, is retried and is reported after leaving', async () => {
  launched = await launchWithMeeting();
  const { app, page, userDataDir } = launched;
  // Сохранение настроек не удаётся (например, диск недоступен).
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('settings:set-ai-prompt');
    ipcMain.handle('settings:set-ai-prompt', () => {
      throw new Error('Не удалось сохранить запрос для ИИ: диск недоступен.');
    });
  });
  await page.getByRole('button', { name: 'Настройки' }).click();
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await field.fill('Новый запрос');
  await field.blur();
  const settingsPane = page.getByRole('main', { name: 'Настройки' });
  await expect(settingsPane.getByRole('alert')).toHaveText('Не удалось сохранить запрос для ИИ: диск недоступен.');
  await expect(field).toHaveValue('Новый запрос');

  // Ушли со страницы настроек — текст отправляется ещё раз, и об ошибке говорит строка слева.
  await openMeeting(page);
  const side = page.getByRole('complementary', { name: 'Запись и встречи' });
  await expect(side.getByRole('alert')).toHaveText('Не удалось сохранить запрос для ИИ: диск недоступен.');
  expect(await savedPrompt(userDataDir)).toBeUndefined();
});

test('a meeting without text has no «Скопировать для ИИ»', async () => {
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
      clipboard.push(data);
    },
    exportDir: () => null,
    aiPrompt: () => null,
    rememberExportDir: async () => undefined,
    documentsDir: () => out,
    platform: 'win32',
```

**на:**

```ts
      clipboard.push(data);
    },
    exportDir: () => null,
    aiPrompt: async () => null,
    rememberExportDir: async () => undefined,
    documentsDir: () => out,
    platform: 'win32',
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts
  it('takes the own prompt from the settings at the moment of copying', async () => {
    const { lib, id } = await meetingWithText();
    let prompt: string | null = 'Что решили?';
    const d = deps(lib, { aiPrompt: () => prompt });
    await copyForAi(d, id);
    prompt = '  Кратко.\r\nПо пунктам.  ';
    await copyForAi(d, id);
```

**на:**

```ts
  it('takes the own prompt from the settings at the moment of copying', async () => {
    const { lib, id } = await meetingWithText();
    let prompt: string | null = 'Что решили?';
    const d = deps(lib, { aiPrompt: async () => prompt });
    await copyForAi(d, id);
    prompt = '  Кратко.\r\nПо пунктам.  ';
    await copyForAi(d, id);
```

**В `src/main/export/export-meeting.test.ts` заменить:**

```ts

  it('copies only the text when the prompt is empty', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib, { aiPrompt: () => '' });
    await copyForAi(d, id);
    expect(d.clipboard).toEqual([{ text: PLAIN }]);
  });
```

**на:**

```ts

  it('copies only the text when the prompt is empty', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib, { aiPrompt: async () => '' });
    await copyForAi(d, id);
    expect(d.clipboard).toEqual([{ text: PLAIN }]);
  });
```

**В `src/main/settings/settings-store.test.ts` заменить:**

```ts
    });
  });

  it('rejects invalid values and keeps the old ones', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
```

**на:**

```ts
    });
  });

  it('settled() waits for the updates already started, failed ones included', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    const ok = store.update({ aiPrompt: 'Свой запрос' });
    const bad = store.update({ libraryDir: '' });
    await store.settled();
    expect(store.get().aiPrompt).toBe('Свой запрос');
    await expect(ok).resolves.toMatchObject({ aiPrompt: 'Свой запрос' });
    await expect(bad).rejects.toThrow();
    await expect(store.settled()).resolves.toBeUndefined();
  });

  it('rejects invalid values and keeps the old ones', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/export/export-meeting.test.ts src/main/settings/settings-store.test.ts`
Ожидается: FAIL — у хранилища настроек нет `settled()`, `copyForAi` читает запрос без ожидания.

- [ ] **Step 3: Код**

**В `src/main/export/export-meeting.ts` заменить:**

```ts
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и (если есть) оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html?: string }): Promise<void>;
  /** «Запрос для ИИ» из настроек: null — стандартный, '' — без запроса. */
  aiPrompt(): string | null;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
```

**на:**

```ts
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и (если есть) оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html?: string }): Promise<void>;
  /**
   * «Запрос для ИИ» из настроек (null — стандартный, '' — без запроса) — после уже начатых сохранений настроек:
   * запрос, набранный перед уходом из настроек, успевает попасть в копию.
   */
  aiPrompt(): Promise<string | null>;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
/** «Скопировать для ИИ»: запрос и текст встречи — только простым текстом (чаты вставляют его без лишнего оформления). */
export async function copyForAi(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: withAiPrompt(resolveAiPrompt(deps.aiPrompt()), toPlainText(doc)) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
```

**на:**

```ts
/** «Скопировать для ИИ»: запрос и текст встречи — только простым текстом (чаты вставляют его без лишнего оформления). */
export async function copyForAi(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  const prompt = resolveAiPrompt(await deps.aiPrompt());
  await deps.writeClipboard({ text: withAiPrompt(prompt, toPlainText(doc)) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
```

**В `src/main/index.ts` заменить:**

```ts
          ),
        ]),
      exportDir: () => settings.get().exportDir,
      aiPrompt: () => settings.get().aiPrompt,
      rememberExportDir: (dir) => settings.update({ exportDir: dir }),
      documentsDir: () => app.getPath('documents'),
      platform: process.platform,
```

**на:**

```ts
          ),
        ]),
      exportDir: () => settings.get().exportDir,
      aiPrompt: () => settings.settled().then(() => settings.get().aiPrompt),
      rememberExportDir: (dir) => settings.update({ exportDir: dir }),
      documentsDir: () => app.getPath('documents'),
      platform: process.platform,
```

**В `src/main/ipc.ts` заменить:**

```ts
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';

const RenameMeetingSchema = z.object({ meetingId: MeetingIdSchema, title: z.string().max(200) });
const RenameSpeakerSchema = z.object({
```

**на:**

```ts
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';
const AI_PROMPT_NOT_SAVED = 'Не удалось сохранить запрос для ИИ';

const RenameMeetingSchema = z.object({ meetingId: MeetingIdSchema, title: z.string().max(200) });
const RenameSpeakerSchema = z.object({
```

**В `src/main/ipc.ts` заменить:**

```ts
  });

  handle(IPC.setAiPrompt, async (arg) => {
    await deps.settings.update({ aiPrompt: storedAiPrompt(AiPromptSchema.parse(arg)) });
    return settingsState();
  });
```

**на:**

```ts
  });

  handle(IPC.setAiPrompt, async (arg) => {
    const aiPrompt = storedAiPrompt(AiPromptSchema.parse(arg));
    try {
      await deps.settings.update({ aiPrompt });
    } catch (err) {
      throw humanFsError(AI_PROMPT_NOT_SAVED, err);
    }
    return settingsState();
  });
```

**В `src/main/settings/settings-store.ts` заменить:**

```ts
  get(): Settings;
  /** Проверяет, сохраняет на диск и только потом меняет значение в памяти. */
  update(patch: SettingsUpdate): Promise<Settings>;
}

/** Нет файла — настройки по умолчанию. Файл повреждён — откладываем его в сторону и тоже берём умолчания. */
```

**на:**

```ts
  get(): Settings;
  /** Проверяет, сохраняет на диск и только потом меняет значение в памяти. */
  update(patch: SettingsUpdate): Promise<Settings>;
  /** Дождаться уже начатых изменений (удачных и нет): после этого get() видит их результат. */
  settled(): Promise<void>;
}

/** Нет файла — настройки по умолчанию. Файл повреждён — откладываем его в сторону и тоже берём умолчания. */
```

**В `src/main/settings/settings-store.ts` заменить:**

```ts
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
```

**на:**

```ts
      queue = run.catch(() => undefined);
      return run;
    },
    settled: () => queue.then(() => undefined),
  };
}
```

**Заменить всё содержимое `src/renderer/main/AiSettings.tsx` на:**

```tsx
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AI_PROMPT_MAX, DEFAULT_AI_PROMPT, resolveAiPrompt } from '../../shared/ai-prompt';
import type { SettingsState } from '../../shared/ipc';
import { errorText } from './errors';

/** Пауза набора перед сохранением запроса. */
const SAVE_DELAY_MS = 500;

interface Props {
  /** Значение из настроек: null — стандартный запрос, '' — без запроса. */
  aiPrompt: string | null;
  /** Отправить в main; ответ — новые настройки. */
  save(prompt: string | null): Promise<SettingsState>;
  onSaved(next: SettingsState): void;
  /** Ошибка (null — убрать) на странице настроек, пока она открыта. */
  onError(message: string | null): void;
  /** Сохранение не удалось, когда со страницы настроек уже ушли: показывает строка ошибки слева. */
  onErrorAfterLeave(message: string): void;
}

/**
 * Настройки → «ИИ» (решения Плана 6, §2.2): «Запрос для ИИ». Кнопки «Сохранить» нет: текст уходит в main через
 * полсекунды после последней набранной буквы, при уходе из поля и при уходе со страницы настроек. Не сохранилось —
 * текст остаётся в поле, и следующий уход из поля пробует снова.
 */
export function AiSettings({ aiPrompt, save, onSaved, onError, onErrorAfterLeave }: Props) {
  const [text, setText] = useState(() => resolveAiPrompt(aiPrompt));
  const hintId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  /** Набранное (или «Вернуть стандартный» — null), но ещё не отправленное. */
  const pending = useRef<{ value: string | null } | null>(null);
  /** Сколько сохранений ещё не ответило. */
  const inFlight = useRef(0);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const props = useRef({ save, onSaved, onError, onErrorAfterLeave });
  props.current = { save, onSaved, onError, onErrorAfterLeave };

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const send = useCallback((value: string | null) => {
    inFlight.current += 1;
    props.current.save(value).then(
      (next) => {
        inFlight.current -= 1;
        props.current.onSaved(next);
        if (mounted.current) props.current.onError(null);
      },
      (err: unknown) => {
        inFlight.current -= 1;
        const message = errorText(err);
        if (!mounted.current) {
          props.current.onErrorAfterLeave(message);
          return;
        }
        // Если после этого ничего не набрали, следующий уход из поля отправит этот текст снова.
        pending.current ??= { value };
        props.current.onError(message);
      },
    );
  }, []);

  const flush = useCallback(() => {
    cancelTimer();
    const next = pending.current;
    pending.current = null;
    if (next) send(next.value);
  }, [send]);

  // Ответ main не трогает поле, пока в нём печатают, есть неотправленный текст или ждём ответа на сохранение:
  // иначе ответ на более раннее сохранение на миг вернул бы старый текст.
  useEffect(() => {
    if (document.activeElement === field.current || pending.current || inFlight.current > 0) return;
    setText(resolveAiPrompt(aiPrompt));
  }, [aiPrompt]);

  // Ушли со страницы настроек — набранное отправляется сразу.
  useEffect(() => {
    mounted.current = true;
    return () => {
      flush();
      mounted.current = false;
    };
  }, [flush]);

  const change = (value: string) => {
    setText(value);
    pending.current = { value };
    cancelTimer();
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const reset = () => {
    cancelTimer();
    pending.current = null;
    setText(DEFAULT_AI_PROMPT);
    send(null);
    // Ссылка исчезает — фокус в поле.
    field.current?.focus();
  };

  return (
    <section className="sec">
      <h2>ИИ</h2>
      <div className="fld">
        <div className="lb">Запрос для ИИ</div>
        <div className="ctl">
          <textarea
            ref={field}
            className="ta"
            aria-label="Запрос для ИИ"
            aria-describedby={hintId}
            rows={8}
            maxLength={AI_PROMPT_MAX}
            value={text}
            onChange={(e) => change(e.currentTarget.value)}
            onBlur={flush}
          />
          <small id={hintId}>
            Добавляется перед текстом встречи, когда вы нажимаете «Скопировать для ИИ». Вставьте скопированное в
            Claude, ChatGPT или другой чат.
          </small>
          {text !== DEFAULT_AI_PROMPT && (
            <button type="button" className="lnk" onClick={reset}>
              Вернуть стандартный
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} /> : null;
  } else if (selectedId !== null && selectedId === liveId) {
    const title = selectedEntry?.kind === 'ok' ? selectedEntry.meeting.title : 'Новая встреча';
    pane = <LivePane state={recording} title={title} hotkey={hotkey} platform={platform} onError={setError} />;
```

**на:**

```tsx

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} onError={setError} /> : null;
  } else if (selectedId !== null && selectedId === liveId) {
    const title = selectedEntry?.kind === 'ok' ? selectedEntry.meeting.title : 'Новая встреча';
    pane = <LivePane state={recording} title={title} hotkey={hotkey} platform={platform} onError={setError} />;
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
  state: SettingsState;
  info: AppInfo | null;
  onChange(next: SettingsState): void;
}

function Toggle({
```

**на:**

```tsx
  state: SettingsState;
  info: AppInfo | null;
  onChange(next: SettingsState): void;
  /** Строка ошибки слева: для ошибок, которые пришли, когда со страницы настроек уже ушли. */
  onError(message: string): void;
}

function Toggle({
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx
}

/** Настройки: запись, расшифровка, ИИ и общие. */
export function SettingsPane({ state, info, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const microphones = useMicrophones();
  const platform = info?.platform ?? 'win32';
```

**на:**

```tsx
}

/** Настройки: запись, расшифровка, ИИ и общие. */
export function SettingsPane({ state, info, onChange, onError }: Props) {
  const [error, setError] = useState<string | null>(null);
  const microphones = useMicrophones();
  const platform = info?.platform ?? 'win32';
```

**В `src/renderer/main/SettingsPane.tsx` заменить:**

```tsx

        <AiSettings
          aiPrompt={settings.aiPrompt}
          save={(prompt) => void run(() => window.textmeet.setAiPrompt(prompt))}
        />

        <section className="sec">
```

**на:**

```tsx

        <AiSettings
          aiPrompt={settings.aiPrompt}
          save={(prompt) => window.textmeet.setAiPrompt(prompt)}
          onSaved={onChange}
          onError={setError}
          onErrorAfterLeave={onError}
        />

        <section className="sec">
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  972 passed (972)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `67 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: AI prompt save is retried and reported after leaving settings; copy waits for pending settings"
```

### Task 4: Полная проверка и установщик на этом компьютере

Минуты GitHub Actions закончились (см. «Факты»), поэтому сборка — локально, как в Плане 5.

- [ ] **Step 1: Чистая установка зависимостей и все проверки**

```bash
npm ci
npm run typecheck
npx vitest run
npm run build
npx playwright test
```

Ожидается: `Tests  972 passed (972)`; сквозные — `67 passed`, `1 skipped` (про `hotkey.spec.ts` на этом компьютере — см.
«Факты»).

- [ ] **Step 2: Установщик и проверка собранной программы**

```bash
npm run dist:win
```

Затем проверка собранной программы — путь к `TextMeet.exe` из `release/win-unpacked` (PowerShell):

```powershell
$env:TEXTMEET_PACKAGED_APP = (Resolve-Path release\win-unpacked\TextMeet.exe).Path; npx playwright test e2e/packaged.spec.ts; Remove-Item Env:TEXTMEET_PACKAGED_APP
```

Ожидается: `1 passed`; в `release/` — `TextMeet-Setup-0.2.0.exe`. Установленную программу пользователя не закрывать
по имени процесса.

### Task 5: Ручная проверка на Windows (контрольная точка с пользователем)

Пользователь ставит `release/TextMeet-Setup-0.2.0.exe` поверх прежней версии. Дать простой список и дождаться ответа:

1. Открыть встречу с текстом → «Скопировать для ИИ» → кнопка на 2 секунды «✓ Скопировано». Вставить в чат Claude
   (claude.ai) или ChatGPT и отправить — в начале стандартный запрос, дальше текст встречи; ИИ делает итоги.
2. Настройки → «ИИ» → поменять запрос, например «Перечисли задачи: кто, что, к какому сроку». Вернуться во встречу →
   «Скопировать для ИИ» → вставить в блокнот: в начале новый запрос.
3. Закрыть TextMeet (из трея «Выйти») и открыть снова → в настройках остался свой запрос; «Вернуть стандартный»
   возвращает стандартный текст, и ссылка пропадает.
4. Очистить поле запроса → «Скопировать для ИИ» → в буфере только текст встречи.

Проверка на Mac — после публикации на GitHub, вместе с Планом 5. Записать ответы — они нужны в Task 6.

### Task 6: Документы, память и слияние

- [ ] **Step 1: `docs/superpowers/plan-6-checks.md`** — как `plan-5-checks.md`: что проверено (Task 4 — числа тестов,
  Task 5 по пунктам на Windows; Mac — после публикации), что исправлено по ревью (Task 3), «Отложено»: пункты из раздела
  «Известные ограничения» в начале плана и всё, что найдёт Task 5.
- [ ] **Step 2: Спецификация и дорожная карта** — по списку §8 решений Плана 6: §1, §3.4, §3.5, §3.6, §4, §5.1, §5.2,
  файлы встречи (`ai.json` — План 9), §5.6, §5.7, §6, §7, §10. Дорожная карта: строка Плана 6 — «выполнен (Windows);
  проверка на Mac — после публикации» со ссылками на решения, план и проверки; новая строка **9. Локальная модель для
  итогов** (зависит от 6, следующий); порядок — 6 → 9 → 8.
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: record plan 6 checks and mark plan 6 done"
```

- [ ] **Step 4: Слияние в `main` локально**

```bash
git checkout main
git merge --no-ff plan-6-copy-ai -m "Merge plan 6: copy for AI"
npm ci
npm run typecheck
npx vitest run
```

Ожидается: `Tests  972 passed (972)`. **`git push` — только с согласия пользователя и когда обновятся минуты GitHub
Actions**; тогда же отправляются `main` с Планом 5 и ветки планов 5 и 6, запускается `build.yml` на `main`, и
пользователь проверяет Планы 5 и 6 на Mac (артефакт `TextMeet-mac`).

- [ ] **Step 5: Память** — в `textmeet-project.md`: План 6 выполнен на Windows и слит локально, дальше — План 9
  «Локальная модель для итогов» (сначала решения и прототип: кандидаты GigaChat 3 Lightning, Qwen3, T-lite;
  пользователь сравнивает итоги с итогами Claude), затем План 8.
