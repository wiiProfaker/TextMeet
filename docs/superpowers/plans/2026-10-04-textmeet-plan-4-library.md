# TextMeet — План 4: библиотека

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Работа со встречами: щелчок по времени реплики — слушать с этого места (звучащая реплика подсвечена, текст идёт за звуком); правка текста реплики, удаление реплики с «Вернуть», переименование встречи; спикеры — переименование во всей встрече, объединение одинаковым именем, смена спикера у реплики; поиск по всем встречам вместо списка слева с переходом к найденной реплике; «Удалить аудио» и «Удалить встречу» — в Корзину.

**Architecture:** Правки — операции над репликой по её id (`src/shared/transcript-edit.ts`, чистые функции); main применяет их к только что прочитанному `transcript.json` (`library/meeting-edits.ts`), а запись каждого файла встречи идёт по очереди (`library/file-lock.ts`) — вместе с записью результата расшифровки. Поиск — индекс в памяти main (`library/search-index.ts`): перечитывает только встречи с изменившимися файлами, обновляется при каждом перечитывании списка встреч; нормализация без учёта регистра и «ё/е» сохраняет длину строки (`src/shared/search-text.ts`), поэтому окно подсвечивает совпадения тем же кодом. Удаление — `shell.trashItem` с повторами (`library/trash.ts`, `library/meeting-delete.ts`): сначала отменяются расшифровка и сведение встречи (`TranscriptionQueue.cancel`, `Mixer.cancel`), при неудаче всё ставится обратно. В окне плеер управляется из всей встречи (`usePlayback`), реплика — `memo`-компонент с постоянными обработчиками.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0, React 19.3, TypeScript 7.0.2, zod 4.6.5, Vitest 5.0.2, Playwright 1.63.0, GitHub Actions.

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.4, §5.6, §6. **Решения Плана 4:** [2026-10-04-textmeet-plan-4-design.md](../specs/2026-10-04-textmeet-plan-4-design.md). **Макет:** [Макет TextMeet](https://claude.ai/artifact/Urmc3atvSFifUpDyBzjeR6), листы 9–11. «Отложено» прошлых планов: [Плана 2](../plan-2-checks.md), [Плана 3](../plan-3-checks.md).

---

## Факты, на которые опирается план (проверены 2026-10-04 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии ветки `plan-4-library` на Windows 11: 804 модульных теста
(покрытие ~98 % строк), 41 сквозной тест (+1 пропущенный — проверка собранной программы). После каждой задачи проверка
типов и модульные тесты проходят. Два независимых ревью кода (main и окно) нашли недочёты — они исправлены в Task 13 и
Task 14 и закрыты тестами. Внешний вид новых частей проверен снимками в светлой и тёмной теме.

- **`.row` в тексте встречи — `content-visibility: auto`** (длинные встречи): она обрезает всё, что выходит за реплику.
  Меню «Кто говорит» открывается в реплике с классом `menu-open`, где это отключено; найденная реплика (`found`) тоже
  раскладывается сразу, иначе прокрутка к ней промахивается.
- **Название встречи теперь кнопка** (переименование): локатор `getByRole('button', { name: /Название/ })` находит и
  строку списка, и заголовок. В сквозных тестах строку списка ищут внутри `navigation «Встречи»`.
- **Окна подтверждения рисуются через портал** в `document.body` — `.shade` (`position: absolute`) иначе привязалась бы
  к ближайшему позиционированному предку.
- **В сквозных тестах «Корзина» — папка** `TEXTMEET_TEST_TRASH` (на машинах CI Корзины может не быть); программа
  слушает эту переменную только в режиме автотестов.
- **`play()` отклоняется с `AbortError`**, когда воспроизведение прерывают пауза, перемотка или удаление аудио — это не
  поломка записи (иначе плеер насовсем сменился бы надписью «Не удалось открыть запись»).
- **На этом компьютере установлен TextMeet**, он держит `Ctrl+Space`: проверка «Сбросить» в `e2e/hotkey.spec.ts`
  локально падает, пока установленная программа запущена (не закрывать её по имени процесса — это программа
  пользователя). На GitHub проверка проходит.
- **Файлы в рабочей копии — с окончаниями CRLF** (`core.autocrlf=true`), в блоках плана — LF: заменяйте блоки
  инструментом правки (он сопоставляет строки без учёта окончаний), а не побайтовыми скриптами.

## Известные ограничения (в «Отложено» проверок Плана 4)

- «Удалить аудио» проверяет статус встречи и затем переносит папку: если ровно в эту секунду встречу поставили в
  очередь сведения или расшифровки (например, восстановление при запуске), задача увидит пропавшие файлы и закончится
  ошибкой.
- Процесс расшифровки закрывается при удалении встречи, но запущенный им ffmpeg может держать файл ещё мгновение —
  перенос в Корзину повторяется 3 раза через 300 мс; проверить вручную на Windows (Task 16).
- «Вернуть» удалённую последнюю реплику спикера возвращает её как «Спикер N» — имя забыто вместе со спикером.
- Если удалённую встречу как раз перечитывает индекс поиска, она может мелькнуть в найденном до следующего обновления.
- Встреча, у которой удалили все реплики, после исчезновения «Вернуть» показывает «В записи не найдено речи».
- Один модульный тест однажды упал под сильной нагрузкой и не повторился (5 прогонов подряд — зелёные); ожидания в
  новых тестах очереди и сведения сделаны с запасом.

## Что сознательно не входит в План 4

- Импорт, экспорт, «Скопировать всё» — План 5. ИИ и поиск по итогам ИИ — План 6.
- Поиск внутри одной встречи (Ctrl+F) — найденное подсвечивается в открытой встрече.

## Карта файлов

```
src/main/library/file-lock.ts            # запись одного файла по очереди (withFileLock)
src/main/library/library.ts              # updateMeeting — через withFileLock
src/main/library/transcript-store.ts     # writeTranscript / updateTranscript — через withFileLock
src/shared/transcript.ts                 # looseObject у реплик и спикеров, editedAt
src/shared/meeting.ts                    # audioDeleted
src/shared/search-text.ts                # normalize, queryWords, findRanges, snippet, splitByRanges
src/shared/search.ts                     # ответ поиска (типы)
src/shared/transcript-edit.ts            # applyEdit, pruneSpeakers, mergeTarget, hasManualChanges
src/main/library/search-index.ts         # индекс поиска в main
src/main/library/meeting-edits.ts        # renameMeeting, renameSpeaker, editTranscript
src/main/library/trash.ts                # moveToTrash с повторами, folderTrash для тестов
src/main/library/meeting-delete.ts       # deleteAudio, deleteMeeting, audioSize
src/main/transcription/queue.ts          # cancel; новая расшифровка сбрасывает имена собеседников
src/main/audio/ffmpeg.ts, mixer.ts       # отмена сведения; встречи с ошибкой тоже сводятся
src/main/recording/controller.ts         # очередь окон «Запись остановлена», dropStopDialog
src/shared/ipc.ts, src/preload/index.ts, src/main/ipc.ts, src/main/index.ts   # новые каналы library:*
src/renderer/main/playback.ts            # звучащая реплика, скорости, «текст за звуком»
src/renderer/main/hooks.ts               # usePlayback, useTranscript (перечитывание), useSearch, SearchViewContext
src/renderer/main/Player.tsx             # плеер без своего состояния
src/renderer/main/TranscriptView.tsx     # реплики (memo), правка, меню спикера, «Вернуть», найденная реплика
src/renderer/main/SegmentText.tsx        # текст реплики и поле правки
src/renderer/main/MeetingTitle.tsx       # название встречи с переименованием
src/renderer/main/SpeakerChips.tsx, SpeakerMenu.tsx, ConfirmDialog.tsx, MeetingMenu.tsx, menu-keys.ts
src/renderer/main/SearchBox.tsx, SearchResults.tsx
src/renderer/main/MeetingPane.tsx, App.tsx, TranscribeDialog.tsx, format.ts, icons.tsx, styles.css
e2e/helpers.ts, e2e/library.spec.ts, e2e/transcription.spec.ts
```

## Задачи

Ветка — `plan-4-library` (на ней уже документ решений). Проверка после каждой задачи: `npm run typecheck`, затем
`npx vitest run`; где указано — сквозные тесты (`npm run build`, затем `npx playwright test`).

### Task 1: Запись файлов встречи по очереди; новые поля данных

**Files:**
- Create: `src/main/library/file-lock.test.ts`, `src/main/library/file-lock.ts`
- Modify: `src/main/library/library.ts`, `src/main/library/transcript-store.test.ts`, `src/main/library/transcript-store.ts`, `src/main/transcription/queue.test.ts`, `src/main/transcription/queue.ts`, `src/renderer/main/format.test.ts`, `src/shared/meeting.test.ts`, `src/shared/meeting.ts`, `src/shared/transcript.ts`

Очередь «прочитать → изменить → записать» из `updateMeeting` выносится в `withFileLock` (ключ — путь файла) и
используется и для `transcript.json`: `writeTranscript` (результат расшифровки) и новое `updateTranscript` (правки) не
затирают друг друга. Если правка ничего не поменяла (вернула тот же объект), файл не перезаписывается. Реплики и спикеры
`transcript.json` читаются как `looseObject` (поля более новой версии не теряются — отложено из Плана 3); новое
необязательное `editedAt`. В `meeting.json` — `audioDeleted` (по умолчанию `false`). Новая расшифровка сбрасывает
имена собеседников (имя «Я» остаётся): «Спикер 1» нового текста — не обязательно тот же человек.

- [ ] **Step 1: Тесты**

**Создать `src/main/library/file-lock.test.ts`:**

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withFileLock } from './file-lock';

const later = <T>(value: T, ms: number) => new Promise<T>((done) => setTimeout(() => done(value), ms));

describe('withFileLock', () => {
  it('runs the work of one file strictly in order', async () => {
    const order: string[] = [];
    await Promise.all([
      withFileLock('/lib/a.json', async () => order.push(await later('first', 20))),
      withFileLock('/lib/a.json', async () => order.push(await later('second', 1))),
      withFileLock(join('/lib', '.', 'a.json'), async () => order.push('third')),
    ]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('does not make different files wait for each other', async () => {
    const order: string[] = [];
    await Promise.all([
      withFileLock('/lib/a.json', async () => order.push(await later('slow', 20))),
      withFileLock('/lib/b.json', async () => order.push('fast')),
    ]);
    expect(order).toEqual(['fast', 'slow']);
  });

  it('reports a failed work and keeps serving the next ones', async () => {
    const failed = withFileLock('/lib/a.json', async () => {
      throw new Error('диск полон');
    });
    const next = withFileLock('/lib/a.json', async () => 'ok');
    await expect(failed).rejects.toThrow('диск полон');
    await expect(next).resolves.toBe('ok');
  });
});
```

**Заменить всё содержимое `src/main/library/transcript-store.test.ts` на:**

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { readTranscript, transcriptPath, updateTranscript, writeTranscript } from './transcript-store';

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

  it('keeps fields of segments and speakers written by a newer version of the app', async () => {
    const lib = library();
    const newer = {
      ...transcript,
      speakers: [{ id: 'me', kind: 'me', voice: [0.1] }],
      segments: [{ ...transcript.segments[0], words: [{ w: 'Да', t: 0 }] }],
    };
    writeFileSync(transcriptPath(lib, ID), JSON.stringify(newer));

    await updateTranscript(lib, ID, (t) => ({ ...t, segments: t.segments.map((s) => ({ ...s, text: 'Нет.' })) }));

    expect(JSON.parse(readFileSync(transcriptPath(lib, ID), 'utf8'))).toMatchObject({
      speakers: [{ id: 'me', voice: [0.1] }],
      segments: [{ text: 'Нет.', words: [{ w: 'Да', t: 0 }] }],
    });
  });

  it('applies a change and returns the saved transcript', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    const saved = await updateTranscript(lib, ID, (t) => ({ ...t, editedAt: '2026-10-04T09:00:00.000Z' }));
    expect(saved.editedAt).toBe('2026-10-04T09:00:00.000Z');
    expect(await readTranscript(lib, ID)).toEqual(saved);
  });

  it('refuses to change a transcript that does not exist', async () => {
    await expect(updateTranscript(library(), ID, (t) => t)).rejects.toThrow('Текста встречи нет');
  });

  it('does not lose an edit made while a new transcription is being written', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    const fresh = { ...transcript, model: 't-one', segments: [{ ...transcript.segments[0]!, text: 'Новый.' }] };
    await Promise.all([
      updateTranscript(lib, ID, (t) => ({ ...t, editedAt: '2026-10-04T09:00:00.000Z' })),
      writeTranscript(lib, ID, fresh),
      updateTranscript(lib, ID, (t) => ({ ...t, segments: t.segments.map((s) => ({ ...s, edited: true })) })),
    ]);
    // Правки и запись идут по очереди: последняя правка применена к уже записанному новому тексту.
    expect(await readTranscript(lib, ID)).toEqual({ ...fresh, segments: [{ ...fresh.segments[0], edited: true }] });
  });

  it('refuses an invalid transcript', async () => {
    const bad = { ...transcript, segments: [{ ...transcript.segments[0], speakerId: 'бог' }] } as unknown as Transcript;
    await expect(writeTranscript(library(), ID, bad)).rejects.toThrow();
  });
});
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
});

describe('TranscriptionQueue', () => {
  it('transcribes a meeting: queued → transcribing → transcript.json and «done»', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
```

**на:**

```ts
});

describe('TranscriptionQueue', () => {
  it('forgets the names of other speakers after a new transcription and keeps the owner name', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'done', speakerNames: { me: 'Кирилл', s1: 'Ирина' } });
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    // Пока новая расшифровка идёт, имена прежнего текста ещё видны.
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл' });
  });

  it('transcribes a meeting: queued → transcribing → transcript.json and «done»', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
  speakerNames: {},
  tracks: [],
  recovered: false,
  ...patch,
});
```

**на:**

```ts
  speakerNames: {},
  tracks: [],
  recovered: false,
  audioDeleted: false,
  ...patch,
});
```

**В `src/shared/meeting.test.ts` заменить:**

```ts
  speakerNames: {},
  tracks: [],
  recovered: false,
};

describe('MEETING_ID_PATTERN', () => {
```

**на:**

```ts
  speakerNames: {},
  tracks: [],
  recovered: false,
  audioDeleted: false,
};

describe('MEETING_ID_PATTERN', () => {
```

**В `src/shared/meeting.test.ts` заменить:**

```ts
    expect(MeetingSchema.parse(valid)).toEqual(valid);
  });

  it('reads a meeting written by the previous version (no tracks, no recovered flag)', () => {
    const { tracks: _tracks, recovered: _recovered, ...old } = valid;
    expect(MeetingSchema.parse(old)).toEqual(valid);
  });
```

**на:**

```ts
    expect(MeetingSchema.parse(valid)).toEqual(valid);
  });

  it('reads a meeting written by the previous version (no tracks, no recovered and audioDeleted flags)', () => {
    const { tracks: _tracks, recovered: _recovered, audioDeleted: _audioDeleted, ...old } = valid;
    expect(MeetingSchema.parse(old)).toEqual(valid);
  });
```

**В `src/shared/meeting.test.ts` заменить:**

```ts
    ['track file with a path', { tracks: [{ kind: 'mic', file: '../mic.webm', startOffsetMs: 0 }] }],
    ['negative track offset', { tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: -5 }] }],
    ['recovered not a boolean', { recovered: 'yes' }],
  ])('rejects %s', (_name, patch) => {
    expect(MeetingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
```

**на:**

```ts
    ['track file with a path', { tracks: [{ kind: 'mic', file: '../mic.webm', startOffsetMs: 0 }] }],
    ['negative track offset', { tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: -5 }] }],
    ['recovered not a boolean', { recovered: 'yes' }],
    ['audioDeleted not a boolean', { audioDeleted: 1 }],
  ])('rejects %s', (_name, patch) => {
    expect(MeetingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/library/file-lock.test.ts src/main/library/transcript-store.test.ts src/main/transcription/queue.test.ts src/renderer/main/format.test.ts src/shared/meeting.test.ts`
Ожидается: FAIL — нет модуля `./file-lock`, нет `updateTranscript`, нет поля `audioDeleted`.

- [ ] **Step 3: Код**

**Создать `src/main/library/file-lock.ts`:**

```ts
import { resolve } from 'node:path';

// Изменения одного файла (прочитать → изменить → записать) выполняются строго по очереди, иначе два почти
// одновременных изменения прочитают одно и то же, и второе затрёт первое.
const queues = new Map<string, Promise<unknown>>();

/** Выполнить work после всего, что раньше поставлено для этого файла. Сбой одной работы не мешает следующим. */
export function withFileLock<T>(file: string, work: () => Promise<T>): Promise<T> {
  const key = resolve(file);
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(work);
  const settled = run.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}
```

**В `src/main/library/library.ts` заменить:**

```ts
import { MIX_FILE } from '../../shared/recording';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { defaultMeetingTitle, makeMeetingId, randomMeetingSuffix } from './naming';

export const MEETING_FILE = 'meeting.json';
```

**на:**

```ts
import { MIX_FILE } from '../../shared/recording';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { withFileLock } from './file-lock';
import { defaultMeetingTitle, makeMeetingId, randomMeetingSuffix } from './naming';

export const MEETING_FILE = 'meeting.json';
```

**В `src/main/library/library.ts` заменить:**

```ts
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

/**
```

**на:**

```ts
  await writeJsonAtomic(join(meetingDir(libraryDir, valid.id), MEETING_FILE), valid);
}

/**
 * Прочитать → изменить → записать; незнакомые поля meeting.json сохраняются. Одну встречу могут менять почти
 * одновременно (конец записи, сведение, ответ в окне «Запись остановлена», правки) — изменения идут по очереди.
 */
export function updateMeeting(
  libraryDir: string,
  id: string,
  change: (meeting: Meeting) => Meeting,
): Promise<Meeting> {
  return withFileLock(join(meetingDir(libraryDir, id), MEETING_FILE), async () => {
    const next = change(await readMeeting(libraryDir, id));
    await saveMeeting(libraryDir, next);
    return MeetingSchema.parse(next);
  });
}

/**
```

**Заменить всё содержимое `src/main/library/transcript-store.ts` на:**

```ts
import { join } from 'node:path';
import { TranscriptSchema, type Transcript } from '../../shared/transcript';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { withFileLock } from './file-lock';
import { meetingDir } from './library';

export const TRANSCRIPT_FILE = 'transcript.json';
const NO_TRANSCRIPT = 'Текста встречи нет — возможно, его удалили.';

export const transcriptPath = (libraryDir: string, id: string): string =>
  join(meetingDir(libraryDir, id), TRANSCRIPT_FILE);

/** Текст встречи; null — встречу ещё не расшифровывали. Повреждённый файл — ошибка с причиной. */
export async function readTranscript(libraryDir: string, id: string): Promise<Transcript | null> {
  const result = await readJsonFile(transcriptPath(libraryDir, id), TranscriptSchema);
  if (result.ok) return result.value;
  if (result.reason === 'missing') return null;
  throw new Error(`Текст встречи не прочитан: ${result.message}`);
}

const save = (libraryDir: string, id: string, transcript: Transcript): Promise<void> =>
  writeJsonAtomic(transcriptPath(libraryDir, id), TranscriptSchema.parse(transcript));

/** Записать текст целиком (результат расшифровки) — по очереди с правками этой встречи. */
export function writeTranscript(libraryDir: string, id: string, transcript: Transcript): Promise<void> {
  return withFileLock(transcriptPath(libraryDir, id), () => save(libraryDir, id, transcript));
}

/** Прочитать → изменить → записать (правки); незнакомые поля сохраняются. Текста нет — ошибка. */
export function updateTranscript(
  libraryDir: string,
  id: string,
  change: (transcript: Transcript) => Transcript,
): Promise<Transcript> {
  return withFileLock(transcriptPath(libraryDir, id), async () => {
    const current = await readTranscript(libraryDir, id);
    if (!current) throw new Error(NO_TRANSCRIPT);
    const next = TranscriptSchema.parse(change(current));
    await save(libraryDir, id, next);
    return next;
  });
}
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import { asrModel, DEFAULT_ASR_MODEL, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
```

**на:**

```ts
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import { asrModel, DEFAULT_ASR_MODEL, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { ME } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
import { interpolateDiarize, type DiarizeClock } from './progress';
import { WorkerToMainSchema, type MainToWorker, type TranscribeCommand } from './protocol';

/** Процесс расшифровки глазами очереди (в программе — utilityProcess, в тестах — подделка). */
export interface WorkerHandle {
  send(message: MainToWorker): void;
```

**на:**

```ts
import { interpolateDiarize, type DiarizeClock } from './progress';
import { WorkerToMainSchema, type MainToWorker, type TranscribeCommand } from './protocol';

/** Из имён спикеров остаётся только имя владельца. */
const ownNameOnly = (names: Readonly<Record<string, string>>): Record<string, string> =>
  names[ME] === undefined ? {} : { [ME]: names[ME] };

/** Процесс расшифровки глазами очереди (в программе — utilityProcess, в тестах — подделка). */
export interface WorkerHandle {
  send(message: MainToWorker): void;
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'done', model, errorMessage: null } : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
```

**на:**

```ts
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        // «Спикер 1» новой расшифровки — не обязательно тот же человек: имена собеседников сбрасываются, имя «Я» —
        // это всегда владелец — остаётся.
        m.status === 'transcribing'
          ? { ...m, status: 'done', model, errorMessage: null, speakerNames: ownNameOnly(m.speakerNames) }
          : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
```

**В `src/shared/meeting.ts` заменить:**

```ts
  tracks: z.array(TrackSchema).default([]),
  /** Запись прервалась (сбой программы или окна записи) и была восстановлена. */
  recovered: z.boolean().default(false),
});

export type Meeting = z.infer<typeof MeetingSchema>;
```

**на:**

```ts
  tracks: z.array(TrackSchema).default([]),
  /** Запись прервалась (сбой программы или окна записи) и была восстановлена. */
  recovered: z.boolean().default(false),
  /** Аудио удалили (в Корзину), текст остался. Дорожек у такой встречи нет. */
  audioDeleted: z.boolean().default(false),
});

export type Meeting = z.infer<typeof MeetingSchema>;
```

**Заменить всё содержимое `src/shared/transcript.ts` на:**

```ts
import { z } from 'zod';
import { asrModel, isAsrModelId } from './asr-models';

/** Спикер: «me» — владелец (дорожка микрофона), «s1», «s2»… — собеседники по порядку первого появления. */
export const SpeakerIdSchema = z.string().regex(/^(me|s[1-9]\d{0,2})$/);

// looseObject у реплик и спикеров: поля более новой версии программы не теряются при правке текста.
export const TranscriptSegmentSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Секунды от начала встречи (начала самой ранней дорожки) — то же начало, что у mix.opus. */
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  speakerId: SpeakerIdSchema,
  text: z.string().max(20_000),
  /** Текст или спикера реплики правили руками. */
  edited: z.boolean().default(false),
});

export const TranscriptSpeakerSchema = z.looseObject({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) });

// looseObject: как у meeting.json — поля более новой версии программы не теряются при перезаписи.
export const TranscriptSchema = z.looseObject({
  schemaVersion: z.literal(1),
  model: z.string().min(1),
  /** Название модели на момент расшифровки — для подписи во встрече (План 7); у текстов Плана 3 его нет. */
  modelTitle: z.string().min(1).max(200).optional(),
  createdAt: z.iso.datetime(),
  /** Последняя ручная правка (текст, удаление реплики, спикеры); нет — текст не правили. */
  editedAt: z.iso.datetime().optional(),
  speakers: z.array(TranscriptSpeakerSchema),
  segments: z.array(TranscriptSegmentSchema),
});

export type SpeakerId = z.infer<typeof SpeakerIdSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type TranscriptSpeaker = z.infer<typeof TranscriptSpeakerSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

export const ME: SpeakerId = 'me';

/** Подпись «Текст: …» во встрече: название из текста, иначе — по каталогу, неизвестная модель — её id. */
export function transcriptModelTitle(transcript: Pick<Transcript, 'model' | 'modelTitle'>): string {
  if (transcript.modelTitle) return transcript.modelTitle;
  return isAsrModelId(transcript.model) ? asrModel(transcript.model).title : transcript.model;
}

/** Номер собеседника → id: 0 → «s1». */
export const otherSpeakerId = (index: number): SpeakerId => `s${index + 1}`;

/** Подпись спикера: имя из meeting.json, иначе «Я» / «Спикер N». */
export function speakerLabel(id: string, names: Readonly<Record<string, string>> = {}): string {
  const name = names[id];
  if (name) return name;
  if (id === ME) return 'Я';
  const match = /^s(\d+)$/.exec(id);
  return match ? `Спикер ${match[1]}` : id;
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  692 passed (692)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: write meeting files in order; keep unknown transcript fields; audioDeleted and editedAt"
```

### Task 2: Поиск по тексту: нормализация, совпадения, отрывки

**Files:**
- Create: `src/shared/search-text.test.ts`, `src/shared/search-text.ts`

Общий для main и окна модуль без зависимостей. `normalize` меняет каждый символ отдельно (нижний регистр, «ё» →
«е») и только если длина не меняется — позиции совпадений в нормализованной строке совпадают с исходной. Запрос делится
на слова (знаки по краям отбрасываются); реплика найдена, если в ней есть каждое слово как часть слова. `snippet` —
кусок около 80 символов вокруг первого совпадения, края по возможности не режут слова.

- [ ] **Step 1: Тесты**

**Создать `src/shared/search-text.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { findRanges, isSearchable, matchesAll, normalize, queryWords, snippet, splitByRanges } from './search-text';

const marked = (text: string, ranges: { start: number; end: number }[]) =>
  splitByRanges(text, ranges)
    .map((p) => (p.mark ? `[${p.text}]` : p.text))
    .join('');

describe('normalize', () => {
  it('ignores case and «ё»', () => {
    expect(normalize('Ёлка ЁЖ Бюджет')).toBe('елка еж бюджет');
  });

  it('keeps the length, so positions match the original text', () => {
    // «İ» в нижнем регистре — два символа: такой символ не меняется.
    const text = 'İstanbul Ёж 🙂 ok';
    expect(normalize(text)).toHaveLength(text.length);
    expect(normalize(text)).toBe('İstanbul еж 🙂 ok');
  });
});

describe('queryWords', () => {
  it('splits, normalizes, drops punctuation at the edges and repeats', () => {
    expect(queryWords('  Бюджет, на   «октябрь» бюджет ')).toEqual(['бюджет', 'на', 'октябрь']);
  });

  it('keeps punctuation inside a word', () => {
    expect(queryWords('e-mail 3.5')).toEqual(['e-mail', '3.5']);
  });

  it('gives nothing for a query of punctuation only', () => {
    expect(queryWords(' ?! — ')).toEqual([]);
  });
});

describe('isSearchable', () => {
  it('needs at least two letters', () => {
    expect(isSearchable('б')).toBe(false);
    expect(isSearchable(' б, ')).toBe(false);
    expect(isSearchable('бю')).toBe(true);
    expect(isSearchable('а б')).toBe(true);
  });
});

describe('matchesAll', () => {
  it('needs every word, as a part of a word, in any order', () => {
    const text = normalize('По бюджету на октябрь осталась половина.');
    expect(matchesAll(text, queryWords('октябрь бюджет'))).toBe(true);
    expect(matchesAll(text, queryWords('бюдж'))).toBe(true);
    expect(matchesAll(text, queryWords('бюджет ноябрь'))).toBe(false);
  });

  it('finds nothing for no words', () => {
    expect(matchesAll('текст', [])).toBe(false);
  });
});

describe('findRanges', () => {
  it('finds every occurrence of every word in the original positions', () => {
    const text = 'Бюджет и ещё раз бюджет. Ёлки!';
    const ranges = findRanges(normalize(text), queryWords('бюджет елки'));
    expect(marked(text, ranges)).toBe('[Бюджет] и ещё раз [бюджет]. [Ёлки]!');
  });

  it('merges overlapping and adjacent matches', () => {
    expect(findRanges('абвгд', ['абв', 'бвг', 'д'])).toEqual([{ start: 0, end: 5 }]);
  });
});

describe('splitByRanges', () => {
  it('returns the whole text when nothing is marked', () => {
    expect(splitByRanges('текст', [])).toEqual([{ text: 'текст', mark: false }]);
  });

  it('ignores ranges outside the text', () => {
    expect(marked('абв', [{ start: 1, end: 9 }, { start: 5, end: 6 }])).toBe('а[бв]');
  });
});

describe('snippet', () => {
  it('returns a short text as it is', () => {
    expect(snippet('Короткий бюджет.', [{ start: 9, end: 15 }])).toEqual({
      text: 'Короткий бюджет.',
      ranges: [{ start: 9, end: 15 }],
    });
  });

  it('cuts a long text around the first match without cutting words', () => {
    const text =
      'Сначала мы долго обсуждали отпуск и погоду, потом наконец перешли к делу: по бюджету на октябрь у нас ' +
      'остаётся примерно половина от того, что планировали, а подрядчики считаются отдельно.';
    const ranges = findRanges(normalize(text), ['бюджет']);
    const cut = snippet(text, ranges, 80);
    expect(cut.text.startsWith('…')).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(82);
    expect(marked(cut.text, cut.ranges)).toContain('по [бюджет]у на октябрь');
    // Слова не разрезаны: после «…» — начало слова, перед «…» — конец слова.
    const words = text.split(/\s+/);
    const inner = cut.text.slice(1, -1).split(' ');
    expect(words).toContain(inner[0]);
    expect(words).toContain(inner.at(-1));
  });

  it('starts at the beginning when the match is near it', () => {
    const text = `Бюджет ${'и ещё немного слов '.repeat(10)}конец.`;
    const cut = snippet(text, [{ start: 0, end: 6 }], 40);
    expect(cut.text.startsWith('Бюджет')).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.ranges).toEqual([{ start: 0, end: 6 }]);
  });

  it('ends at the end when the match is near it', () => {
    const text = `${'слово и ещё слово '.repeat(10)}про бюджет`;
    const at = text.indexOf('бюджет');
    const cut = snippet(text, [{ start: at, end: at + 6 }], 40);
    expect(cut.text.endsWith('про бюджет')).toBe(true);
    expect(marked(cut.text, cut.ranges).endsWith('[бюджет]')).toBe(true);
  });

  it('cuts from the beginning when there is no match (a title match only)', () => {
    const cut = snippet('слово '.repeat(30), [], 20);
    expect(cut.text.startsWith('слово')).toBe(true);
    expect(cut.ranges).toEqual([]);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/shared/search-text.test.ts`
Ожидается: FAIL — нет модуля `./search-text`.

- [ ] **Step 3: Код**

**Создать `src/shared/search-text.ts`:**

```ts
// Поиск по тексту встреч — общий для main (поиск по всем встречам) и окна (подсветка в открытой встрече).
// Только чистые функции.

export interface TextRange {
  start: number;
  end: number;
}

export interface TextPiece {
  text: string;
  mark: boolean;
}

/** Меньше букв в запросе — не ищем: на одну букву нашлось бы почти всё. */
export const MIN_QUERY_LETTERS = 2;

/**
 * Для сравнения без учёта регистра и «ё/е». Каждый символ меняется отдельно и только если длина не меняется,
 * поэтому позиции в нормализованной строке совпадают с позициями в исходной.
 */
export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const next = lower.length === ch.length ? lower : ch;
    out += next === 'ё' ? 'е' : next;
  }
  return out;
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Слова запроса: нормализованы, без знаков по краям («бюджет,» → «бюджет»), без повторов. */
export function queryWords(query: string): string[] {
  const words = normalize(query)
    .split(/\s+/)
    .map((word) => word.replace(EDGE_PUNCTUATION, ''))
    .filter((word) => word.length > 0);
  return [...new Set(words)];
}

export function isSearchable(query: string): boolean {
  return queryWords(query).join('').length >= MIN_QUERY_LETTERS;
}

/** В нормализованном тексте есть каждое слово (как часть слова: «бюджет» находит «бюджета»). */
export function matchesAll(normalized: string, words: readonly string[]): boolean {
  return words.length > 0 && words.every((word) => normalized.includes(word));
}

/** Все вхождения всех слов, по порядку; пересекающиеся и соседние слиты. */
export function findRanges(normalized: string, words: readonly string[]): TextRange[] {
  const found: TextRange[] = [];
  for (const word of words) {
    for (let at = normalized.indexOf(word); at !== -1; at = normalized.indexOf(word, at + 1)) {
      found.push({ start: at, end: at + word.length });
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Текст кусками: подсвеченные (mark) и обычные — для показа совпадений. */
export function splitByRanges(text: string, ranges: readonly TextRange[]): TextPiece[] {
  const pieces: TextPiece[] = [];
  let at = 0;
  for (const range of ranges) {
    const start = Math.max(at, Math.min(range.start, text.length));
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > at) pieces.push({ text: text.slice(at, start), mark: false });
    pieces.push({ text: text.slice(start, end), mark: true });
    at = end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), mark: false });
  return pieces;
}

const ELLIPSIS = '…';
/** На сколько символов можно сдвинуть край отрывка, чтобы не резать слово. */
const WORD_SNAP = 15;

/**
 * Кусок длинного текста вокруг первого совпадения (около max символов), с «…» там, где текст обрезан, и
 * совпадениями внутри куска. Края отрывка по возможности не режут слова.
 */
export function snippet(text: string, ranges: readonly TextRange[], max = 80): { text: string; ranges: TextRange[] } {
  if (text.length <= max) return { text, ranges: ranges.map((r) => ({ ...r })) };
  const first = ranges[0] ?? { start: 0, end: 0 };
  let start = Math.max(0, first.start - Math.floor((max - (first.end - first.start)) / 2));
  let end = Math.min(text.length, start + max);
  start = Math.max(0, end - max);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space - start <= WORD_SNAP && space < first.start) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space !== -1 && end - space <= WORD_SNAP && space >= first.end) end = space;
  }
  while (start < first.start && text[start] === ' ') start++;
  while (end > first.end && text[end - 1] === ' ') end--;
  const prefix = start > 0 ? ELLIPSIS : '';
  const suffix = end < text.length ? ELLIPSIS : '';
  const shift = prefix.length - start;
  const inside = ranges
    .filter((r) => r.end > start && r.start < end)
    .map((r) => ({ start: Math.max(r.start, start) + shift, end: Math.min(r.end, end) + shift }));
  return { text: prefix + text.slice(start, end) + suffix, ranges: inside };
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  709 passed (709)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: search text helpers — case and ё insensitive matching, ranges, snippets"
```

### Task 3: Правки текста встречи — чистые функции

**Files:**
- Create: `src/shared/transcript-edit.test.ts`, `src/shared/transcript-edit.ts`

`applyEdit` применяет одну правку: новый текст реплики (пустой — удалить), «Вернуть» (вставить по времени
начала), смену спикера реплики (в том числе «новый собеседник» — следующий свободный номер), объединение двух спикеров.
Список спикеров после правки — только те, у кого есть реплики. Ничего не изменилось — тот же объект. `mergeTarget`
решает, не просьба ли новое имя объединить спикеров (совпадение без учёта регистра, «ё» и пробелов, в том числе с «Я» и
«Спикер N»); `hasManualChanges` — предупреждать ли в окне «Расшифровать заново».

- [ ] **Step 1: Тесты**

**Создать `src/shared/transcript-edit.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import type { Transcript, TranscriptSegment } from './transcript';
import { TranscriptSchema } from './transcript';
import {
  applyEdit,
  editTexts,
  hasManualChanges,
  mergeTarget,
  nextSpeakerId,
  pruneSpeakers,
  sameName,
} from './transcript-edit';

const NOW = new Date('2026-10-04T09:00:00.000Z');
const seg = (id: string, start: number, speakerId: string, text: string): TranscriptSegment => ({
  id,
  start,
  end: start + 1,
  speakerId,
  text,
  edited: false,
});

const base = (): Transcript => ({
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-01T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
    { id: 's2', kind: 'other' },
  ],
  segments: [
    seg('a', 0, 's1', 'Смотри, по бюджету.'),
    seg('b', 2, 'me', 'С подрядчиками?'),
    seg('c', 4, 's2', 'Без.'),
    seg('d', 6, 's1', 'Отлично.'),
  ],
});

const texts = (t: Transcript) => t.segments.map((s) => `${s.speakerId}:${s.text}`);

describe('applyEdit — text', () => {
  it('changes the text, trims it, marks the segment and the transcript as edited', () => {
    const next = applyEdit(base(), { kind: 'text', segmentId: 'c', text: '  Без подрядчиков. ' }, NOW);
    expect(next.segments[2]).toMatchObject({ text: 'Без подрядчиков.', edited: true });
    expect(next.editedAt).toBe(NOW.toISOString());
    expect(TranscriptSchema.parse(next)).toEqual(next);
  });

  it('returns the same transcript when the text did not change', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'text', segmentId: 'c', text: 'Без. ' }, NOW)).toBe(t);
  });

  it('deletes the segment when the text is emptied, and drops a speaker left without segments', () => {
    const next = applyEdit(base(), { kind: 'text', segmentId: 'c', text: '   ' }, NOW);
    expect(next.segments.map((s) => s.id)).toEqual(['a', 'b', 'd']);
    expect(next.speakers.map((s) => s.id)).toEqual(['me', 's1']);
    expect(next.editedAt).toBe(NOW.toISOString());
  });

  it('refuses a segment that is gone', () => {
    expect(() => applyEdit(base(), { kind: 'text', segmentId: 'x', text: 'а' }, NOW)).toThrow(editTexts.segmentGone);
  });

  it('keeps unknown fields of the segment', () => {
    const t = base();
    t.segments[0] = { ...t.segments[0]!, words: [1, 2] };
    const next = applyEdit(t, { kind: 'text', segmentId: 'a', text: 'Новое.' }, NOW);
    expect(next.segments[0]).toMatchObject({ text: 'Новое.', words: [1, 2] });
  });
});

describe('applyEdit — restore', () => {
  it('puts a deleted segment back in its place by time and brings its speaker back', () => {
    const t = base();
    const removed = applyEdit(t, { kind: 'text', segmentId: 'c', text: '' }, NOW);
    const back = applyEdit(removed, { kind: 'restore', segment: t.segments[2]! }, NOW);
    expect(back.segments.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(back.speakers.map((s) => s.id)).toEqual(['me', 's1', 's2']);
  });

  it('appends a segment later than all others', () => {
    const next = applyEdit(base(), { kind: 'restore', segment: seg('z', 99, 'me', 'Пока.') }, NOW);
    expect(next.segments.at(-1)?.id).toBe('z');
  });

  it('does nothing when the segment is already there', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'restore', segment: t.segments[0]! }, NOW)).toBe(t);
  });
});

describe('applyEdit — speaker', () => {
  it('moves one segment to another speaker', () => {
    const next = applyEdit(base(), { kind: 'speaker', segmentId: 'd', speakerId: 's2' }, NOW);
    expect(texts(next)).toEqual(['s1:Смотри, по бюджету.', 'me:С подрядчиками?', 's2:Без.', 's2:Отлично.']);
    expect(next.segments[3]?.edited).toBe(true);
    expect(next.editedAt).toBe(NOW.toISOString());
  });

  it('gives a segment to a new speaker with the next free number', () => {
    const next = applyEdit(base(), { kind: 'speaker', segmentId: 'c', speakerId: 'new' }, NOW);
    expect(next.segments[2]?.speakerId).toBe('s3');
    // s2 остался без реплик и исчез, новый — в конце.
    expect(next.speakers).toEqual([
      { id: 'me', kind: 'me' },
      { id: 's1', kind: 'other' },
      { id: 's3', kind: 'other' },
    ]);
  });

  it('returns the same transcript when the speaker is the same', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'speaker', segmentId: 'a', speakerId: 's1' }, NOW)).toBe(t);
  });

  it('refuses a speaker that is not in the meeting', () => {
    expect(() => applyEdit(base(), { kind: 'speaker', segmentId: 'a', speakerId: 's7' }, NOW)).toThrow(editTexts.speakerGone);
  });
});

describe('applyEdit — merge', () => {
  it('gives every segment of one speaker to another and drops the first', () => {
    const next = applyEdit(base(), { kind: 'merge', from: 's2', into: 's1' }, NOW);
    expect(texts(next)).toEqual(['s1:Смотри, по бюджету.', 'me:С подрядчиками?', 's1:Без.', 's1:Отлично.']);
    expect(next.speakers.map((s) => s.id)).toEqual(['me', 's1']);
    expect(next.segments[2]?.edited).toBe(true);
    expect(next.segments[0]?.edited).toBe(false);
  });

  it('can merge into the owner', () => {
    const next = applyEdit(base(), { kind: 'merge', from: 's2', into: 'me' }, NOW);
    expect(next.segments[2]?.speakerId).toBe('me');
  });

  it('does nothing when both are the same speaker', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'merge', from: 's1', into: 's1' }, NOW)).toBe(t);
  });

  it('refuses a speaker that is gone', () => {
    expect(() => applyEdit(base(), { kind: 'merge', from: 's9', into: 's1' }, NOW)).toThrow(editTexts.speakerGone);
    expect(() => applyEdit(base(), { kind: 'merge', from: 's1', into: 's9' }, NOW)).toThrow(editTexts.speakerGone);
  });
});

describe('nextSpeakerId', () => {
  it('takes the number after the biggest one in speakers and segments', () => {
    expect(nextSpeakerId(base())).toBe('s3');
    expect(nextSpeakerId({ speakers: [{ id: 'me', kind: 'me' }], segments: [seg('a', 0, 's7', 'x')] })).toBe('s8');
    expect(nextSpeakerId({ speakers: [{ id: 'me', kind: 'me' }], segments: [] })).toBe('s1');
  });

  it('refuses to go past the last allowed number', () => {
    expect(() => nextSpeakerId({ speakers: [{ id: 's999', kind: 'other' }], segments: [] })).toThrow(
      editTexts.tooManySpeakers,
    );
  });
});

describe('pruneSpeakers', () => {
  it('keeps the order of speakers with segments and adds missing ones at the end', () => {
    const speakers = pruneSpeakers(
      [
        { id: 's2', kind: 'other' },
        { id: 'me', kind: 'me', extra: true },
        { id: 's1', kind: 'other' },
      ],
      [seg('a', 0, 'me', 'x'), seg('b', 1, 's4', 'y'), seg('c', 2, 's2', 'z'), seg('d', 3, 's4', 'w')],
    );
    expect(speakers).toEqual([
      { id: 's2', kind: 'other' },
      { id: 'me', kind: 'me', extra: true },
      { id: 's4', kind: 'other' },
    ]);
  });
});

describe('sameName and mergeTarget', () => {
  const speakers = base().speakers;

  it('compares names without case, «ё» and spaces at the edges', () => {
    expect(sameName('  Семён ', 'семен')).toBe(true);
    expect(sameName('Семён', 'Семёна')).toBe(false);
  });

  it('finds another speaker with the same label, including the default ones', () => {
    expect(mergeTarget(speakers, { s1: 'Ирина' }, 's2', 'ирина')).toBe('s1');
    expect(mergeTarget(speakers, {}, 's2', 'Спикер 1')).toBe('s1');
    expect(mergeTarget(speakers, {}, 's2', 'я')).toBe('me');
  });

  it('does not merge with the speaker itself, with nobody or for an empty name', () => {
    expect(mergeTarget(speakers, { s2: 'Олег' }, 's2', 'Олег')).toBeNull();
    expect(mergeTarget(speakers, { s1: 'Ирина' }, 's2', 'Олег')).toBeNull();
    expect(mergeTarget(speakers, {}, 's2', '  ')).toBeNull();
  });
});

describe('hasManualChanges', () => {
  it('is true when the text was edited or other speakers were named', () => {
    expect(hasManualChanges({ editedAt: NOW.toISOString() }, {})).toBe(true);
    expect(hasManualChanges({}, { s1: 'Ирина' })).toBe(true);
  });

  it('is false for an untouched text, the owner name only, or no text', () => {
    expect(hasManualChanges({}, {})).toBe(false);
    expect(hasManualChanges({}, { me: 'Кирилл' })).toBe(false);
    expect(hasManualChanges(null, {})).toBe(false);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/shared/transcript-edit.test.ts`
Ожидается: FAIL — нет модуля `./transcript-edit`.

- [ ] **Step 3: Код**

**Создать `src/shared/transcript-edit.ts`:**

```ts
// Ручные правки текста встречи — чистые функции. main применяет их к только что прочитанному transcript.json
// (по очереди с записью расшифровки), окно — чтобы заранее узнать, не объединение ли это.
import { normalize } from './search-text';
import {
  ME,
  speakerLabel,
  type SpeakerId,
  type Transcript,
  type TranscriptSegment,
  type TranscriptSpeaker,
} from './transcript';

export type TranscriptEdit =
  /** Новый текст реплики; пустой — удалить реплику. */
  | { kind: 'text'; segmentId: string; text: string }
  /** «Вернуть» удалённую реплику. */
  | { kind: 'restore'; segment: TranscriptSegment }
  /** Кто говорит в реплике; 'new' — новый собеседник. */
  | { kind: 'speaker'; segmentId: string; speakerId: SpeakerId | 'new' }
  /** Все реплики from становятся репликами into. */
  | { kind: 'merge'; from: SpeakerId; into: SpeakerId };

export const editTexts = {
  segmentGone: 'Реплика не найдена — текст встречи изменился. Правка не сохранена.',
  speakerGone: 'Такого спикера во встрече уже нет — текст встречи изменился.',
  tooManySpeakers: 'Во встрече слишком много спикеров.',
} as const;

/** Наибольший номер собеседника: s999 (так в схеме). */
const MAX_OTHER = 999;

/** Следующий свободный номер собеседника: после s1, s3 — s4. */
export function nextSpeakerId(transcript: Pick<Transcript, 'speakers' | 'segments'>): SpeakerId {
  const ids = [...transcript.speakers.map((s) => s.id), ...transcript.segments.map((s) => s.speakerId)];
  const max = Math.max(0, ...ids.map((id) => Number(/^s(\d+)$/.exec(id)?.[1] ?? 0)));
  if (max >= MAX_OTHER) throw new Error(editTexts.tooManySpeakers);
  return `s${max + 1}`;
}

const speakerOf = (id: SpeakerId): TranscriptSpeaker => ({ id, kind: id === ME ? 'me' : 'other' });

/**
 * Спикеры = те, у кого есть реплики: прежние в прежнем порядке, недостающие — в конце.
 * Спикер без единой реплики из строки «Спикеры» исчезает.
 */
export function pruneSpeakers(speakers: readonly TranscriptSpeaker[], segments: readonly TranscriptSegment[]): TranscriptSpeaker[] {
  const used = new Set(segments.map((s) => s.speakerId));
  const kept = speakers.filter((s) => used.has(s.id));
  const known = new Set(kept.map((s) => s.id));
  for (const segment of segments) {
    if (known.has(segment.speakerId)) continue;
    known.add(segment.speakerId);
    kept.push(speakerOf(segment.speakerId));
  }
  return kept;
}

function findSegment(transcript: Transcript, segmentId: string): TranscriptSegment {
  const segment = transcript.segments.find((s) => s.id === segmentId);
  if (!segment) throw new Error(editTexts.segmentGone);
  return segment;
}

function requireSpeaker(transcript: Transcript, id: SpeakerId): void {
  if (!transcript.speakers.some((s) => s.id === id)) throw new Error(editTexts.speakerGone);
}

function changed(transcript: Transcript, segments: TranscriptSegment[], now: Date, extra: TranscriptSpeaker[] = []): Transcript {
  return {
    ...transcript,
    editedAt: now.toISOString(),
    speakers: pruneSpeakers([...transcript.speakers, ...extra], segments),
    segments,
  };
}

function editText(transcript: Transcript, segmentId: string, text: string, now: Date): Transcript {
  const segment = findSegment(transcript, segmentId);
  const next = text.trim();
  if (next === '') return changed(transcript, transcript.segments.filter((s) => s.id !== segmentId), now);
  if (next === segment.text) return transcript;
  const segments = transcript.segments.map((s) => (s.id === segmentId ? { ...s, text: next, edited: true } : s));
  return changed(transcript, segments, now);
}

/** Вставить на место по времени начала; реплика с таким id уже есть — ничего не делать. */
function restore(transcript: Transcript, segment: TranscriptSegment, now: Date): Transcript {
  if (transcript.segments.some((s) => s.id === segment.id)) return transcript;
  const at = transcript.segments.findIndex((s) => s.start > segment.start);
  const segments = [...transcript.segments];
  segments.splice(at === -1 ? segments.length : at, 0, segment);
  return changed(transcript, segments, now);
}

function changeSpeaker(transcript: Transcript, segmentId: string, target: SpeakerId | 'new', now: Date): Transcript {
  const segment = findSegment(transcript, segmentId);
  const speakerId = target === 'new' ? nextSpeakerId(transcript) : target;
  if (target !== 'new') {
    requireSpeaker(transcript, target);
    if (segment.speakerId === target) return transcript;
  }
  const segments = transcript.segments.map((s) => (s.id === segmentId ? { ...s, speakerId, edited: true } : s));
  return changed(transcript, segments, now, target === 'new' ? [speakerOf(speakerId)] : []);
}

function merge(transcript: Transcript, from: SpeakerId, into: SpeakerId, now: Date): Transcript {
  if (from === into) return transcript;
  requireSpeaker(transcript, from);
  requireSpeaker(transcript, into);
  const segments = transcript.segments.map((s) => (s.speakerId === from ? { ...s, speakerId: into, edited: true } : s));
  return changed(transcript, segments, now);
}

/** Применить правку. Ничего не изменилось — возвращается тот же объект (записывать нечего). */
export function applyEdit(transcript: Transcript, edit: TranscriptEdit, now: Date): Transcript {
  switch (edit.kind) {
    case 'text':
      return editText(transcript, edit.segmentId, edit.text, now);
    case 'restore':
      return restore(transcript, edit.segment, now);
    case 'speaker':
      return changeSpeaker(transcript, edit.segmentId, edit.speakerId, now);
    case 'merge':
      return merge(transcript, edit.from, edit.into, now);
  }
}

/** Имена совпадают без учёта регистра, «ё/е» и пробелов по краям. */
export const sameName = (a: string, b: string): boolean => normalize(a.trim()) === normalize(b.trim());

/**
 * Новое имя спикера совпадает с подписью другого спикера встречи (в том числе «Я» или «Спикер 2») — это просьба
 * объединить их: возвращается тот, с кем объединять. Пустое имя ни с кем не совпадает.
 */
export function mergeTarget(
  speakers: readonly TranscriptSpeaker[],
  names: Readonly<Record<string, string>>,
  speakerId: SpeakerId,
  name: string,
): SpeakerId | null {
  if (name.trim() === '') return null;
  const other = speakers.find((s) => s.id !== speakerId && sameName(speakerLabel(s.id, names), name));
  return other?.id ?? null;
}

/** Текст правили руками или собеседникам дали имена — «Расшифровать заново» их потеряет. */
export function hasManualChanges(transcript: Pick<Transcript, 'editedAt'> | null, names: Readonly<Record<string, string>>): boolean {
  return !!transcript?.editedAt || Object.keys(names).some((id) => id !== ME);
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  733 passed (733)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: manual transcript edits — text, delete and restore, speaker change, merge"
```

### Task 4: Индекс поиска по всем встречам в main

**Files:**
- Create: `src/main/library/search-index.test.ts`, `src/main/library/search-index.ts`, `src/shared/search.ts`

`SearchIndex` держит в памяти названия и тексты встреч. `refresh()` проходит папку библиотеки и перечитывает
только встречи, у которых изменились время или размер `meeting.json` / `transcript.json`; вызовы во время обновления
склеиваются в одно следующее. `invalidate(id)` — встречу поменяла сама программа (время файла могло не измениться),
`remove(id)` — встречу удалили. `search(query)` ждёт идущего обновления; встречи — новые сверху, по каждой — до 3
реплик и общее число. Повреждённые встречи пропускаются (одна строка в журнал на изменение), встреча с повреждённым
текстом ищется по названию.

- [ ] **Step 1: Тесты**

**Создать `src/main/library/search-index.test.ts`:**

```ts
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_HITS_PER_MEETING, SEARCH_MAX_MEETINGS } from '../../shared/search';
import { makeTempDir } from '../../test-support/temp-dir';
import type { Logger } from '../logger';
import { SearchIndex } from './search-index';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };

afterEach(() => {
  vi.clearAllMocks();
});

const idOf = (n: number) => `2026-09-${String(n).padStart(2, '0')}_1000_a1b2c3`;

function writeMeeting(
  lib: string,
  n: number,
  title: string,
  segments: { text: string; speakerId?: string }[] | null,
  speakerNames: Record<string, string> = {},
): string {
  const id = idOf(n);
  mkdirSync(join(lib, id), { recursive: true });
  writeFileSync(
    join(lib, id, 'meeting.json'),
    JSON.stringify({
      schemaVersion: 1,
      id,
      title,
      createdAt: `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`,
      durationSec: 60,
      source: 'recording',
      participantsHint: null,
      model: 'gigaam-v3-e2e-rnnt',
      status: 'done',
      errorMessage: null,
      speakerNames,
    }),
  );
  if (segments) {
    writeFileSync(
      join(lib, id, 'transcript.json'),
      JSON.stringify({
        schemaVersion: 1,
        model: 'gigaam-v3-e2e-rnnt',
        createdAt: '2026-09-30T10:00:00.000Z',
        speakers: [{ id: 'me', kind: 'me' }],
        segments: segments.map((s, i) => ({
          id: `seg-${i + 1}`,
          start: i * 10,
          end: i * 10 + 5,
          speakerId: s.speakerId ?? 'me',
          text: s.text,
          edited: false,
        })),
      }),
    );
  }
  return id;
}

function setup() {
  let lib = makeTempDir('textmeet-search-');
  const index = new SearchIndex({ libraryDir: () => lib, logger });
  return {
    lib: () => lib,
    setLibrary: (dir: string) => {
      lib = dir;
    },
    index,
  };
}

describe('SearchIndex', () => {
  it('finds segments in every meeting, newest meeting first, with speaker labels and marked snippets', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Планёрка', [{ text: 'Бюджет на иллюстрации пока не утверждён.', speakerId: 's1' }]);
    const irina = writeMeeting(
      t.lib(),
      3,
      'Созвон с Ириной',
      [{ text: 'По бюджету на октябрь осталась половина.', speakerId: 's1' }, { text: 'Без подрядчиков?' }],
      { s1: 'Ирина' },
    );
    writeMeeting(t.lib(), 2, 'Про отпуск', [{ text: 'Ничего про деньги.' }]);
    await t.index.refresh();

    const result = await t.index.search('Бюджет');

    expect(result.truncated).toBe(false);
    expect(result.meetings.map((m) => m.title)).toEqual(['Созвон с Ириной', 'Планёрка']);
    expect(result.meetings[0]).toEqual({
      meetingId: irina,
      title: 'Созвон с Ириной',
      titleRanges: [],
      createdAt: '2026-09-03T10:00:00.000Z',
      total: 1,
      hits: [
        {
          segmentId: 'seg-1',
          start: 0,
          speakerId: 's1',
          speaker: 'Ирина',
          text: 'По бюджету на октябрь осталась половина.',
          ranges: [{ start: 3, end: 9 }],
        },
      ],
    });
  });

  it('needs every word of the query in one segment and ignores «ё»', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Встреча', [{ text: 'Семён про бюджет' }, { text: 'Октябрь и бюджет' }]);
    await t.index.refresh();
    const result = await t.index.search('бюджет семен');
    expect(result.meetings[0]?.hits.map((h) => h.segmentId)).toEqual(['seg-1']);
  });

  it('finds a meeting by its title and marks it', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет 2027', [{ text: 'Начнём.' }]);
    await t.index.refresh();
    const [meeting] = (await t.index.search('бюджет')).meetings;
    expect(meeting).toMatchObject({ title: 'Бюджет 2027', titleRanges: [{ start: 0, end: 6 }], total: 0, hits: [] });
  });

  it('shows only the first hits of a meeting and counts all of them', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Встреча', Array.from({ length: 7 }, (_, i) => ({ text: `бюджет ${i}` })));
    await t.index.refresh();
    const [meeting] = (await t.index.search('бюджет')).meetings;
    expect(meeting?.total).toBe(7);
    expect(meeting?.hits).toHaveLength(SEARCH_HITS_PER_MEETING);
  });

  it('returns nothing for a query that is too short', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', [{ text: 'бюджет' }]);
    await t.index.refresh();
    expect(await t.index.search(' б ')).toEqual({ query: ' б ', meetings: [], truncated: false });
  });

  it('stops after the maximum number of meetings', async () => {
    const t = setup();
    const index = t.index as unknown as { entries: Map<string, unknown> };
    for (let i = 0; i <= SEARCH_MAX_MEETINGS; i++) {
      index.entries.set(`m${i}`, {
        stamp: 'x',
        meeting: { id: `m${i}`, title: 'Бюджет', titleNorm: 'бюджет', createdAt: '2026-09-01', speakerNames: {}, segments: [] },
      });
    }
    // Папка совпадает — обновлять индекс поиску незачем.
    (t.index as unknown as { dir: string }).dir = t.lib();
    const result = await t.index.search('бюджет');
    expect(result.meetings).toHaveLength(SEARCH_MAX_MEETINGS);
    expect(result.truncated).toBe(true);
  });

  it('rereads only changed meetings and forgets removed folders', async () => {
    const t = setup();
    const a = writeMeeting(t.lib(), 1, 'Первая', [{ text: 'старый текст' }]);
    const b = writeMeeting(t.lib(), 2, 'Вторая', [{ text: 'бюджет' }]);
    await t.index.refresh();

    writeMeeting(t.lib(), 1, 'Первая', [{ text: 'новый бюджет' }]);
    // Время изменения другое — встреча перечитывается.
    utimesSync(join(t.lib(), a, 'transcript.json'), new Date(), new Date(Date.now() + 5000));
    rmSync(join(t.lib(), b), { recursive: true });
    await t.index.refresh();

    const result = await t.index.search('бюджет');
    expect(result.meetings.map((m) => m.meetingId)).toEqual([a]);
  });

  it('rereads a meeting the app changed itself, even with the same file time', async () => {
    const t = setup();
    const a = writeMeeting(t.lib(), 1, 'Встреча', [{ text: 'старый текст' }]);
    const time = new Date('2026-10-01T10:00:00.000Z');
    const sameTime = () => {
      for (const file of ['meeting.json', 'transcript.json']) utimesSync(join(t.lib(), a, file), time, time);
    };
    sameTime();
    await t.index.refresh();
    // То же время изменения и тот же размер (текст той же длины) — по отпечатку изменение не видно.
    writeMeeting(t.lib(), 1, 'Встреча', [{ text: 'свежий текст' }]);
    sameTime();

    await t.index.refresh();
    expect((await t.index.search('свежий')).meetings).toHaveLength(0);
    t.index.invalidate(a);
    await t.index.refresh();
    expect((await t.index.search('свежий')).meetings).toHaveLength(1);
  });

  it('forgets a removed meeting at once', async () => {
    const t = setup();
    const a = writeMeeting(t.lib(), 1, 'Бюджет', null);
    await t.index.refresh();
    t.index.remove(a);
    expect((await t.index.search('бюджет')).meetings).toHaveLength(0);
  });

  it('skips broken meetings, finds a meeting with a broken text by its title, and logs once per change', async () => {
    const t = setup();
    const broken = idOf(1);
    mkdirSync(join(t.lib(), broken));
    writeFileSync(join(t.lib(), broken, 'meeting.json'), '{ не json');
    const damaged = writeMeeting(t.lib(), 2, 'Бюджет', null);
    writeFileSync(join(t.lib(), damaged, 'transcript.json'), '{"schemaVersion": 7}');
    // Папка без meeting.json — встреча создаётся: не ошибка.
    mkdirSync(join(t.lib(), idOf(3)));
    await t.index.refresh();
    await t.index.refresh();

    expect((await t.index.search('бюджет')).meetings.map((m) => m.meetingId)).toEqual([damaged]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('merges refreshes requested while one is running', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', null);
    const first = t.index.refresh();
    const second = t.index.refresh();
    const third = t.index.refresh();
    expect(third).toBe(second);
    await Promise.all([first, second, third]);
    expect((await t.index.search('бюджет')).meetings).toHaveLength(1);
  });

  it('waits for a running refresh before searching', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', null);
    await t.index.refresh();
    writeMeeting(t.lib(), 2, 'Бюджет второй', null);
    void t.index.refresh();
    expect((await t.index.search('бюджет')).meetings).toHaveLength(2);
  });

  it('starts over in a new library folder and treats a missing folder as empty', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', null);
    await t.index.refresh();
    t.setLibrary(join(makeTempDir('textmeet-search-'), 'missing'));
    expect((await t.index.search('бюджет')).meetings).toHaveLength(0);
  });

  it('reports a library folder it cannot read', async () => {
    const t = setup();
    const file = join(makeTempDir('textmeet-search-'), 'file');
    writeFileSync(file, 'x');
    t.setLibrary(file);
    await expect(t.index.refresh()).rejects.toThrow('Не удалось прочитать библиотеку');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/library/search-index.test.ts`
Ожидается: FAIL — нет модуля `./search-index`.

- [ ] **Step 3: Код**

**Создать `src/main/library/search-index.ts`:**

```ts
import { promises as fsp } from 'node:fs';
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

/** Длина отрывка реплики в найденном. */
const SNIPPET_CHARS = 80;

interface IndexedSegment {
  id: string;
  start: number;
  speakerId: SpeakerId;
  text: string;
  norm: string;
}

interface IndexedMeeting {
  id: string;
  title: string;
  titleNorm: string;
  createdAt: string;
  speakerNames: Readonly<Record<string, string>>;
  segments: IndexedSegment[];
}

interface Entry {
  /** Время изменения и размер meeting.json и transcript.json: изменились — встречу перечитать. */
  stamp: string;
  /** null — встречу не удалось прочитать (в поиске её нет). */
  meeting: IndexedMeeting | null;
}

export interface SearchIndexDeps {
  libraryDir(): string;
  logger: Logger;
}

async function fileStamp(file: string): Promise<string> {
  try {
    const stat = await fsp.stat(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '-';
  }
}

/**
 * Поиск по всем встречам: тексты и названия в памяти. Обновление перечитывает только изменившиеся встречи (по
 * времени изменения файлов), поэтому его можно звать часто — при каждом перечитывании списка встреч.
 */
export class SearchIndex {
  private readonly entries = new Map<string, Entry>();
  private dir: string | null = null;
  private running: Promise<void> | null = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly deps: SearchIndexDeps) {}

  /** Обновить по диску. Вызовы во время обновления склеиваются в одно следующее. */
  refresh(): Promise<void> {
    if (this.running) {
      this.pending ??= this.running
        .catch(() => undefined)
        .then(() => {
          this.pending = null;
          return this.refresh();
        });
      return this.pending;
    }
    this.running = this.scan().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Встречу изменила сама программа: перечитать её при следующем обновлении, даже если время файлов то же. */
  invalidate(meetingId: string): void {
    const entry = this.entries.get(meetingId);
    if (entry) entry.stamp = '';
  }

  remove(meetingId: string): void {
    this.entries.delete(meetingId);
  }

  async search(query: string): Promise<SearchResult> {
    if (!isSearchable(query)) return { query, meetings: [], truncated: false };
    if (this.pending || this.running) await (this.pending ?? this.running);
    if (this.dir !== this.deps.libraryDir()) await this.refresh();
    const words = queryWords(query);
    const meetings = [...this.entries.values()]
      .flatMap((entry) => (entry.meeting ? [entry.meeting] : []))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const found: SearchMeeting[] = [];
    for (const meeting of meetings) {
      const result = searchMeeting(meeting, words);
      if (!result) continue;
      if (found.length === SEARCH_MAX_MEETINGS) return { query, meetings: found, truncated: true };
      found.push(result);
    }
    return { query, meetings: found, truncated: false };
  }

  private async scan(): Promise<void> {
    const dir = this.deps.libraryDir();
    if (dir !== this.dir) {
      this.entries.clear();
      this.dir = dir;
    }
    let ids: string[];
    try {
      const dirents = await fsp.readdir(dir, { withFileTypes: true });
      ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw humanFsError('Не удалось прочитать библиотеку', err);
      ids = [];
    }
    const present = new Set(ids);
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
    await Promise.all(ids.map((id) => this.update(dir, id)));
  }

  private async update(dir: string, id: string): Promise<void> {
    const folder = join(dir, id);
    const stamp = `${await fileStamp(join(folder, MEETING_FILE))}|${await fileStamp(join(folder, TRANSCRIPT_FILE))}`;
    if (this.entries.get(id)?.stamp === stamp) return;
    const meeting = await this.read(dir, id);
    // Пока читали, папку библиотеки сменили — эта встреча уже не наша.
    if (this.dir === dir) this.entries.set(id, { stamp, meeting });
  }

  private async read(dir: string, id: string): Promise<IndexedMeeting | null> {
    try {
      const result = await readJsonFile(join(dir, id, MEETING_FILE), MeetingSchema);
      if (!result.ok) {
        if (result.reason !== 'missing') this.deps.logger.warn(`Поиск: встреча ${id} не прочитана — ${result.message}`);
        return null;
      }
      const meeting = result.value;
      let segments: IndexedSegment[] = [];
      try {
        const transcript = await readTranscript(dir, id);
        segments = (transcript?.segments ?? []).map((s) => ({
          id: s.id,
          start: s.start,
          speakerId: s.speakerId,
          text: s.text,
          norm: normalize(s.text),
        }));
      } catch (err) {
        // Повреждённый текст: встреча ищется хотя бы по названию.
        this.deps.logger.warn(`Поиск: текст встречи ${id} не прочитан`, err);
      }
      return {
        id,
        title: meeting.title,
        titleNorm: normalize(meeting.title),
        createdAt: meeting.createdAt,
        speakerNames: meeting.speakerNames,
        segments,
      };
    } catch (err) {
      this.deps.logger.warn(`Поиск: встреча ${id} не прочитана`, err);
      return null;
    }
  }
}

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
        start: s.start,
        speakerId: s.speakerId,
        speaker: speakerLabel(s.speakerId, meeting.speakerNames),
        text: cut.text,
        ranges: cut.ranges,
      };
    }),
  };
}
```

**Создать `src/shared/search.ts`:**

```ts
// Ответ поиска по всем встречам: main → окно. Только типы.
import type { TextRange } from './search-text';
import type { SpeakerId } from './transcript';

export interface SearchHit {
  segmentId: string;
  /** Начало реплики, секунды. */
  start: number;
  speakerId: SpeakerId;
  /** Подпись спикера (с именами из meeting.json). */
  speaker: string;
  /** Отрывок реплики вокруг совпадения. */
  text: string;
  /** Совпадения в отрывке. */
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

export interface SearchResult {
  query: string;
  meetings: SearchMeeting[];
  /** Найдено больше SEARCH_MAX_MEETINGS встреч — хвост отброшен. */
  truncated: boolean;
}

export const SEARCH_HITS_PER_MEETING = 3;
export const SEARCH_MAX_MEETINGS = 200;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  747 passed (747)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: search index of all meetings in main"
```

### Task 5: Переименование, правки и поиск из окна

**Files:**
- Create: `src/main/library/meeting-edits.test.ts`, `src/main/library/meeting-edits.ts`
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/main/library/transcript-store.test.ts`, `src/main/library/transcript-store.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`

`meeting-edits.ts`: `renameMeeting` (пустое название — отказ), `renameSpeaker` (пустое имя — вернуть «Спикер
N»), `editTranscript` (отказ, пока встреча ждёт расшифровки заново или расшифровывается; имена спикеров, которых в
тексте больше нет, забываются — иначе новый собеседник с тем же номером получил бы чужое имя). Правка проверяется zod на
входе в main. Новые каналы: `library:rename-meeting`, `library:rename-speaker`, `library:edit-transcript`,
`library:search`. Поиск обновляется при каждом запросе списка встреч (окно перечитывает его при изменениях и при
возврате в окно) и сразу после своих правок.

- [ ] **Step 1: Тесты**

**Создать `src/main/library/meeting-edits.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import type { Transcript } from '../../shared/transcript';
import { editTexts } from '../../shared/transcript-edit';
import { makeTempDir } from '../../test-support/temp-dir';
import { editTranscript, meetingEditTexts, renameMeeting, renameSpeaker, TranscriptEditSchema } from './meeting-edits';
import { createMeeting, readMeeting, updateMeeting } from './library';
import { readTranscript, writeTranscript } from './transcript-store';

const NOW = new Date('2026-10-04T09:00:00.000Z');

const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-01T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
    { id: 's2', kind: 'other' },
  ],
  segments: [
    { id: 'a', start: 0, end: 1, speakerId: 's1', text: 'Привет.', edited: false },
    { id: 'b', start: 2, end: 3, speakerId: 'me', text: 'Здравствуйте.', edited: false },
    { id: 'c', start: 4, end: 5, speakerId: 's2', text: 'Добрый день.', edited: false },
  ],
};

async function meetingWithText(patch: Partial<Meeting> = {}): Promise<{ lib: string; id: string }> {
  const lib = makeTempDir('textmeet-edits-');
  const meeting = await createMeeting(lib, { source: 'recording', status: 'done' });
  await updateMeeting(lib, meeting.id, (m) => ({ ...m, ...patch }));
  await writeTranscript(lib, meeting.id, transcript);
  return { lib, id: meeting.id };
}

describe('renameMeeting', () => {
  it('saves a trimmed title', async () => {
    const { lib, id } = await meetingWithText();
    expect((await renameMeeting(lib, id, '  Созвон с Ириной ')).title).toBe('Созвон с Ириной');
    expect((await readMeeting(lib, id)).title).toBe('Созвон с Ириной');
  });

  it('refuses an empty title', async () => {
    const { lib, id } = await meetingWithText();
    await expect(renameMeeting(lib, id, '   ')).rejects.toThrow(meetingEditTexts.emptyTitle);
  });
});

describe('renameSpeaker', () => {
  it('sets, trims and clears a speaker name', async () => {
    const { lib, id } = await meetingWithText({ speakerNames: { me: 'Кирилл' } });
    expect((await renameSpeaker(lib, id, 's1', ' Ирина ')).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    expect((await renameSpeaker(lib, id, 's1', '  ')).speakerNames).toEqual({ me: 'Кирилл' });
    expect((await renameSpeaker(lib, id, 'me', null)).speakerNames).toEqual({});
  });
});

describe('editTranscript', () => {
  it('applies an edit and returns the meeting and the saved text', async () => {
    const { lib, id } = await meetingWithText();
    const result = await editTranscript(lib, id, { kind: 'text', segmentId: 'b', text: 'Добрый вечер.' }, NOW);
    expect(result.transcript.segments[1]).toMatchObject({ text: 'Добрый вечер.', edited: true });
    expect(result.meeting.id).toBe(id);
    expect(result.meetingChanged).toBe(false);
    expect(await readTranscript(lib, id)).toEqual(result.transcript);
  });

  it('forgets the name of a speaker that has no segments left', async () => {
    const { lib, id } = await meetingWithText({ speakerNames: { me: 'Кирилл', s1: 'Ирина', s2: 'Олег' } });
    const result = await editTranscript(lib, id, { kind: 'merge', from: 's2', into: 's1' }, NOW);
    expect(result.meeting.speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    expect(result.meetingChanged).toBe(true);
    expect((await readMeeting(lib, id)).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
  });

  it('keeps the owner name even when the owner has no segments', async () => {
    const { lib, id } = await meetingWithText({ speakerNames: { me: 'Кирилл' } });
    const result = await editTranscript(lib, id, { kind: 'text', segmentId: 'b', text: '' }, NOW);
    expect(result.meeting.speakerNames).toEqual({ me: 'Кирилл' });
  });

  it.each(['queued', 'transcribing'] as const)('refuses to edit while the meeting is %s', async (status) => {
    const { lib, id } = await meetingWithText({ status });
    await expect(editTranscript(lib, id, { kind: 'text', segmentId: 'b', text: 'x' }, NOW)).rejects.toThrow(
      meetingEditTexts.transcribing,
    );
  });

  it('reports a segment that is gone', async () => {
    const { lib, id } = await meetingWithText();
    await expect(editTranscript(lib, id, { kind: 'text', segmentId: 'zz', text: 'x' }, NOW)).rejects.toThrow(
      editTexts.segmentGone,
    );
  });
});

describe('TranscriptEditSchema', () => {
  it('accepts every kind of edit', () => {
    for (const edit of [
      { kind: 'text', segmentId: 'seg-1', text: '' },
      { kind: 'restore', segment: transcript.segments[0] },
      { kind: 'speaker', segmentId: 'seg-1', speakerId: 'new' },
      { kind: 'speaker', segmentId: 'seg-1', speakerId: 's2' },
      { kind: 'merge', from: 's2', into: 'me' },
    ]) {
      expect(TranscriptEditSchema.safeParse(edit).success).toBe(true);
    }
  });

  it('refuses wrong edits', () => {
    for (const edit of [
      { kind: 'text', segmentId: '', text: 'x' },
      { kind: 'text', segmentId: 'a', text: 'x'.repeat(20_001) },
      { kind: 'speaker', segmentId: 'a', speakerId: 'бог' },
      { kind: 'merge', from: 's1' },
      { kind: 'delete', segmentId: 'a' },
    ]) {
      expect(TranscriptEditSchema.safeParse(edit).success).toBe(false);
    }
  });
});
```

**В `src/main/library/transcript-store.test.ts` заменить:**

```ts
    expect(await readTranscript(lib, ID)).toEqual(saved);
  });

  it('refuses to change a transcript that does not exist', async () => {
    await expect(updateTranscript(library(), ID, (t) => t)).rejects.toThrow('Текста встречи нет');
  });
```

**на:**

```ts
    expect(await readTranscript(lib, ID)).toEqual(saved);
  });

  it('does not rewrite the file when nothing changed', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    writeFileSync(transcriptPath(lib, ID), `${readFileSync(transcriptPath(lib, ID), 'utf8')}\n\n`);
    const before = readFileSync(transcriptPath(lib, ID), 'utf8');
    await updateTranscript(lib, ID, (t) => t);
    expect(readFileSync(transcriptPath(lib, ID), 'utf8')).toBe(before);
  });

  it('refuses to change a transcript that does not exist', async () => {
    await expect(updateTranscript(library(), ID, (t) => t)).rejects.toThrow('Текста встречи нет');
  });
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/library/meeting-edits.test.ts src/main/library/transcript-store.test.ts`
Ожидается: FAIL — нет модуля `./meeting-edits`.

- [ ] **Step 3: Код**

**В `src/main/index.ts` заменить:**

```ts
import { HotkeyManager } from './hotkey-manager';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { CatalogDownloads } from './models/catalog-downloads';
```

**на:**

```ts
import { HotkeyManager } from './hotkey-manager';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { SearchIndex } from './library/search-index';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { CatalogDownloads } from './models/catalog-downloads';
```

**В `src/main/index.ts` заменить:**

```ts
    openWindow: () => openMainWindow(logger),
    isWindowActive: () => mainVisible() && !!mainWindow?.isFocused(),
  });
  const mixer = new Mixer({
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
```

**на:**

```ts
    openWindow: () => openMainWindow(logger),
    isWindowActive: () => mainVisible() && !!mainWindow?.isFocused(),
  });
  const searchIndex = new SearchIndex({ libraryDir, logger });
  const mixer = new Mixer({
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
```

**В `src/main/index.ts` заменить:**

```ts
      logger.info('Окно записи готово');
    },
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    transcription: queue,
    models,
    downloads: catalogDownloads,
```

**на:**

```ts
      logger.info('Окно записи готово');
    },
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    search: searchIndex,
    transcription: queue,
    models,
    downloads: catalogDownloads,
```

**В `src/main/index.ts` заменить:**

```ts
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller, queue);
}

/** Сбой запуска не должен быть молчаливым: пишем в журнал и показываем окно с путём к нему. */
```

**на:**

```ts
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller, queue);
  searchIndex.refresh().catch((err: unknown) => logger.warn('Поиск не построился при запуске', err));
}

/** Сбой запуска не должен быть молчаливым: пишем в журнал и показываем окно с путём к нему. */
```

**В `src/main/ipc.ts` заменить:**

```ts
} from '../shared/ipc';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
```

**на:**

```ts
} from '../shared/ipc';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { editTranscript, renameMeeting, renameSpeaker, TranscriptEditSchema } from './library/meeting-edits';
import type { SearchIndex } from './library/search-index';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
```

**В `src/main/ipc.ts` заменить:**

```ts
  onRecorderReady(): void;
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**на:**

```ts
  onRecorderReady(): void;
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
  /** Встреча изменилась — окно перечитает список встреч. */
  libraryChanged(): void;
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'search'>;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**В `src/main/ipc.ts` заменить:**

```ts
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
```

**на:**

```ts
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';

const RenameMeetingSchema = z.object({ meetingId: MeetingIdSchema, title: z.string().max(200) });
const RenameSpeakerSchema = z.object({
  meetingId: MeetingIdSchema,
  speakerId: SpeakerIdSchema,
  name: z.string().max(100).nullable(),
});
const EditTranscriptSchema = z.object({ meetingId: MeetingIdSchema, edit: TranscriptEditSchema });

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.openMeetingDir, (arg) => openMeetingFolder(meetingDir(deps.libraryDir(), MeetingIdSchema.parse(arg))));

  handle(IPC.listMeetings, () => {
    const libraryDir = deps.libraryDir();
    return listMeetings(libraryDir, (id) => deps.mixFailed(libraryDir, id));
  });

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**на:**

```ts

  handle(IPC.openMeetingDir, (arg) => openMeetingFolder(meetingDir(deps.libraryDir(), MeetingIdSchema.parse(arg))));

  /** Встречу поменяла программа: поиск перечитает её, даже если время изменения файла то же. */
  const searchChanged = (meetingId: string): void => {
    deps.search.invalidate(meetingId);
    deps.search.refresh().catch((err: unknown) => deps.logger.warn('Поиск не обновился', err));
  };

  handle(IPC.listMeetings, () => {
    const libraryDir = deps.libraryDir();
    // Окно перечитывает список при каждом изменении и при возврате фокуса — заодно поиск подхватывает
    // изменённые и пришедшие через OneDrive встречи.
    deps.search.refresh().catch((err: unknown) => deps.logger.warn('Поиск не обновился', err));
    return listMeetings(libraryDir, (id) => deps.mixFailed(libraryDir, id));
  });

  handle(IPC.renameMeeting, async (arg) => {
    const request = RenameMeetingSchema.parse(arg);
    const meeting = await renameMeeting(deps.libraryDir(), request.meetingId, request.title);
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
  });

  handle(IPC.renameSpeaker, async (arg) => {
    const request = RenameSpeakerSchema.parse(arg);
    const meeting = await renameSpeaker(deps.libraryDir(), request.meetingId, request.speakerId, request.name);
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
  });

  handle(IPC.editTranscript, async (arg) => {
    const request = EditTranscriptSchema.parse(arg);
    const result = await editTranscript(deps.libraryDir(), request.meetingId, request.edit, new Date());
    searchChanged(request.meetingId);
    if (result.meetingChanged) deps.libraryChanged();
    return { meeting: result.meeting, transcript: result.transcript };
  });

  handle(IPC.search, (arg) => deps.search.search(z.string().max(500).parse(arg)));

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**Создать `src/main/library/meeting-edits.ts`:**

```ts
// Правки встречи из окна: название, имена спикеров, текст. Всё пишется по очереди с другими изменениями встречи.
import { z } from 'zod';
import type { Meeting } from '../../shared/meeting';
import { ME, SpeakerIdSchema, TranscriptSegmentSchema, type SpeakerId, type Transcript } from '../../shared/transcript';
import { applyEdit, type TranscriptEdit } from '../../shared/transcript-edit';
import { readMeeting, updateMeeting } from './library';
import { updateTranscript } from './transcript-store';

export const meetingEditTexts = {
  emptyTitle: 'Название не может быть пустым.',
  transcribing: 'Сейчас идёт расшифровка заново — править текст можно после неё.',
} as const;

/** Правка из окна — проверяется на входе в main. */
export const TranscriptEditSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), segmentId: z.string().min(1).max(40), text: z.string().max(20_000) }),
  z.object({ kind: z.literal('restore'), segment: TranscriptSegmentSchema }),
  z.object({
    kind: z.literal('speaker'),
    segmentId: z.string().min(1).max(40),
    speakerId: z.union([SpeakerIdSchema, z.literal('new')]),
  }),
  z.object({ kind: z.literal('merge'), from: SpeakerIdSchema, into: SpeakerIdSchema }),
]);

export async function renameMeeting(libraryDir: string, meetingId: string, title: string): Promise<Meeting> {
  const next = title.trim();
  if (next === '') throw new Error(meetingEditTexts.emptyTitle);
  return updateMeeting(libraryDir, meetingId, (m) => ({ ...m, title: next }));
}

/** Имя спикера во всей встрече; пустое или null — вернуть «Спикер N» / «Я». */
export function renameSpeaker(
  libraryDir: string,
  meetingId: string,
  speakerId: SpeakerId,
  name: string | null,
): Promise<Meeting> {
  const next = name?.trim() ?? '';
  return updateMeeting(libraryDir, meetingId, (m) => {
    const { [speakerId]: _old, ...rest } = m.speakerNames;
    return { ...m, speakerNames: next === '' ? rest : { ...rest, [speakerId]: next } };
  });
}

/** Имена спикеров, которых в тексте больше нет, забываются: иначе новый собеседник с тем же номером получил бы чужое имя. */
function namesOfPresent(names: Readonly<Record<string, string>>, transcript: Transcript): Record<string, string> | null {
  const present = new Set<string>([ME, ...transcript.speakers.map((s) => s.id)]);
  const kept = Object.fromEntries(Object.entries(names).filter(([id]) => present.has(id)));
  return Object.keys(kept).length === Object.keys(names).length ? null : kept;
}

/**
 * Правка текста. Пока встреча ждёт расшифровки заново или расшифровывается, правка всё равно пропала бы —
 * отказываем. Ответ — встреча, новый текст и поменялась ли встреча (забыты имена спикеров без реплик).
 */
export async function editTranscript(
  libraryDir: string,
  meetingId: string,
  edit: TranscriptEdit,
  now: Date,
): Promise<{ meeting: Meeting; transcript: Transcript; meetingChanged: boolean }> {
  const before = await readMeeting(libraryDir, meetingId);
  if (before.status === 'queued' || before.status === 'transcribing') throw new Error(meetingEditTexts.transcribing);
  const transcript = await updateTranscript(libraryDir, meetingId, (t) => applyEdit(t, edit, now));
  if (!namesOfPresent(before.speakerNames, transcript)) return { meeting: before, transcript, meetingChanged: false };
  const meeting = await updateMeeting(libraryDir, meetingId, (m) => ({
    ...m,
    speakerNames: namesOfPresent(m.speakerNames, transcript) ?? m.speakerNames,
  }));
  return { meeting, transcript, meetingChanged: true };
}
```

**В `src/main/library/transcript-store.ts` заменить:**

```ts
  return withFileLock(transcriptPath(libraryDir, id), () => save(libraryDir, id, transcript));
}

/** Прочитать → изменить → записать (правки); незнакомые поля сохраняются. Текста нет — ошибка. */
export function updateTranscript(
  libraryDir: string,
  id: string,
```

**на:**

```ts
  return withFileLock(transcriptPath(libraryDir, id), () => save(libraryDir, id, transcript));
}

/**
 * Прочитать → изменить → записать (правки); незнакомые поля сохраняются. Текста нет — ошибка. change вернул тот же
 * объект — ничего не изменилось, файл не перезаписывается.
 */
export function updateTranscript(
  libraryDir: string,
  id: string,
```

**В `src/main/library/transcript-store.ts` заменить:**

```ts
  return withFileLock(transcriptPath(libraryDir, id), async () => {
    const current = await readTranscript(libraryDir, id);
    if (!current) throw new Error(NO_TRANSCRIPT);
    const next = TranscriptSchema.parse(change(current));
    await save(libraryDir, id, next);
    return next;
  });
```

**на:**

```ts
  return withFileLock(transcriptPath(libraryDir, id), async () => {
    const current = await readTranscript(libraryDir, id);
    if (!current) throw new Error(NO_TRANSCRIPT);
    const changed = change(current);
    if (changed === current) return current;
    const next = TranscriptSchema.parse(changed);
    await save(libraryDir, id, next);
    return next;
  });
```

**В `src/preload/index.ts` заменить:**

```ts
  openLibraryDir: () => invoke(IPC.openLibraryDir),
  openMeetingDir: (id) => invoke(IPC.openMeetingDir, id),
  listMeetings: () => invoke(IPC.listMeetings),
  getAppInfo: () => invoke(IPC.getAppInfo),
  getRecordingState: () => invoke(IPC.getRecordingState),
  toggleRecording: () => invoke(IPC.toggleRecording),
```

**на:**

```ts
  openLibraryDir: () => invoke(IPC.openLibraryDir),
  openMeetingDir: (id) => invoke(IPC.openMeetingDir, id),
  listMeetings: () => invoke(IPC.listMeetings),
  renameMeeting: (request) => invoke(IPC.renameMeeting, request),
  renameSpeaker: (request) => invoke(IPC.renameSpeaker, request),
  editTranscript: (request) => invoke(IPC.editTranscript, request),
  search: (query) => invoke(IPC.search, query),
  getAppInfo: () => invoke(IPC.getAppInfo),
  getRecordingState: () => invoke(IPC.getRecordingState),
  toggleRecording: () => invoke(IPC.toggleRecording),
```

**В `src/shared/ipc.ts` заменить:**

```ts
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { MeetingListEntry } from './meeting';
import type {
  Peaks,
  RecorderChunk,
```

**на:**

```ts
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { Meeting, MeetingListEntry } from './meeting';
import type {
  Peaks,
  RecorderChunk,
```

**В `src/shared/ipc.ts` заменить:**

```ts
  StopDialogAnswer,
  SystemSettingsKind,
} from './recording';
import type { Settings } from './settings';
import type { Transcript } from './transcript';
import type { ModelGroupId, ModelsState, TranscribeRequest, TranscriptionProgress } from './transcription';

export const IPC = {
```

**на:**

```ts
  StopDialogAnswer,
  SystemSettingsKind,
} from './recording';
import type { SearchResult } from './search';
import type { Settings } from './settings';
import type { SpeakerId, Transcript } from './transcript';
import type { TranscriptEdit } from './transcript-edit';
import type { ModelGroupId, ModelsState, TranscribeRequest, TranscriptionProgress } from './transcription';

export const IPC = {
```

**В `src/shared/ipc.ts` заменить:**

```ts
  openLibraryDir: 'library:open-dir',
  openMeetingDir: 'library:open-meeting-dir',
  listMeetings: 'library:list',
  getAppInfo: 'app:info',
  getRecordingState: 'recording:get-state',
  toggleRecording: 'recording:toggle',
```

**на:**

```ts
  openLibraryDir: 'library:open-dir',
  openMeetingDir: 'library:open-meeting-dir',
  listMeetings: 'library:list',
  renameMeeting: 'library:rename-meeting',
  renameSpeaker: 'library:rename-speaker',
  editTranscript: 'library:edit-transcript',
  search: 'library:search',
  getAppInfo: 'app:info',
  getRecordingState: 'recording:get-state',
  toggleRecording: 'recording:toggle',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  recorderReady: boolean;
}

/** Запросы главного окна: канал → аргумент (void — без аргумента) → ответ. */
export interface MainInvokeContract {
  [IPC.getSettings]: { arg: void; result: SettingsState };
```

**на:**

```ts
  recorderReady: boolean;
}

export interface RenameMeetingRequest {
  meetingId: string;
  title: string;
}

export interface RenameSpeakerRequest {
  meetingId: string;
  speakerId: SpeakerId;
  /** null или пусто — вернуть «Спикер N» / «Я». */
  name: string | null;
}

export interface EditTranscriptRequest {
  meetingId: string;
  edit: TranscriptEdit;
}

export interface EditedTranscript {
  meeting: Meeting;
  transcript: Transcript;
}

/** Запросы главного окна: канал → аргумент (void — без аргумента) → ответ. */
export interface MainInvokeContract {
  [IPC.getSettings]: { arg: void; result: SettingsState };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.openLibraryDir]: { arg: void; result: void };
  [IPC.openMeetingDir]: { arg: string; result: void };
  [IPC.listMeetings]: { arg: void; result: MeetingListEntry[] };
  [IPC.getAppInfo]: { arg: void; result: AppInfo };
  [IPC.getRecordingState]: { arg: void; result: RecordingState };
  [IPC.toggleRecording]: { arg: void; result: void };
```

**на:**

```ts
  [IPC.openLibraryDir]: { arg: void; result: void };
  [IPC.openMeetingDir]: { arg: string; result: void };
  [IPC.listMeetings]: { arg: void; result: MeetingListEntry[] };
  [IPC.renameMeeting]: { arg: RenameMeetingRequest; result: Meeting };
  [IPC.renameSpeaker]: { arg: RenameSpeakerRequest; result: Meeting };
  [IPC.editTranscript]: { arg: EditTranscriptRequest; result: EditedTranscript };
  [IPC.search]: { arg: string; result: SearchResult };
  [IPC.getAppInfo]: { arg: void; result: AppInfo };
  [IPC.getRecordingState]: { arg: void; result: RecordingState };
  [IPC.toggleRecording]: { arg: void; result: void };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  openLibraryDir(): Promise<void>;
  openMeetingDir(id: string): Promise<void>;
  listMeetings(): Promise<MeetingListEntry[]>;
  getAppInfo(): Promise<AppInfo>;
  getRecordingState(): Promise<RecordingState>;
  toggleRecording(): Promise<void>;
```

**на:**

```ts
  openLibraryDir(): Promise<void>;
  openMeetingDir(id: string): Promise<void>;
  listMeetings(): Promise<MeetingListEntry[]>;
  renameMeeting(request: RenameMeetingRequest): Promise<Meeting>;
  renameSpeaker(request: RenameSpeakerRequest): Promise<Meeting>;
  /** Правка текста встречи; ответ — встреча и сохранённый текст. */
  editTranscript(request: EditTranscriptRequest): Promise<EditedTranscript>;
  /** Поиск по всем встречам. */
  search(query: string): Promise<SearchResult>;
  getAppInfo(): Promise<AppInfo>;
  getRecordingState(): Promise<RecordingState>;
  toggleRecording(): Promise<void>;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  759 passed (759)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rename meetings and speakers, edit transcripts and search from the window"
```

### Task 6: Окна «Запись остановлена» по очереди; сведение встреч с ошибкой

**Files:**
- Modify: `src/main/audio/mixer.test.ts`, `src/main/audio/mixer.ts`, `src/main/recording/controller.test.ts`, `src/main/recording/controller.ts`

Отложенное из Плана 2. Если новая запись остановлена, пока окно «Запись остановлена» прошлой ещё открыто, новое
окно ждёт своей очереди (`waitingDialogs`), а не заменяет прежнее; `dropStopDialog(id)` убирает окно удалённой встречи.
Встречи в статусе `error` с дорожками и без `mix.opus` тоже ставятся в очередь сведения — иначе плеер вечно «готовит
запись».

- [ ] **Step 1: Тесты**

**В `src/main/audio/mixer.test.ts` заменить:**

```ts
  const meeting = (id: string, patch: Partial<Meeting>): Meeting =>
    ({ id, status: 'recorded', tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }], ...patch }) as Meeting;

  it('picks finished recordings with tracks and without a mix, skipping recordings that ended in an error', () => {
    const entries: MeetingListEntry[] = [
      { kind: 'ok', meeting: meeting('a', {}), mixReady: false, mixFailed: false },
      { kind: 'ok', meeting: meeting('b', {}), mixReady: true, mixFailed: false },
```

**на:**

```ts
  const meeting = (id: string, patch: Partial<Meeting>): Meeting =>
    ({ id, status: 'recorded', tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }], ...patch }) as Meeting;

  it('picks finished recordings with tracks and without a mix, including meetings with an error', () => {
    const entries: MeetingListEntry[] = [
      { kind: 'ok', meeting: meeting('a', {}), mixReady: false, mixFailed: false },
      { kind: 'ok', meeting: meeting('b', {}), mixReady: true, mixFailed: false },
```

**В `src/main/audio/mixer.test.ts` заменить:**

```ts
      { kind: 'broken', id: 'f', reason: 'x' },
      { kind: 'creating', id: 'g' },
    ];
    expect(meetingsNeedingMix(entries)).toEqual(['a']);
  });
});
```

**на:**

```ts
      { kind: 'broken', id: 'f', reason: 'x' },
      { kind: 'creating', id: 'g' },
    ];
    expect(meetingsNeedingMix(entries)).toEqual(['a', 'e']);
  });
});
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    expect(h.deps.enqueueTranscription).toHaveBeenCalledWith(h.lib, command.meetingId);
  });

  it('keeps the dialog of the current recording when an older one is answered', async () => {
    const h = harness();
    const first = await h.startRecording();
    await h.stopRecording(first.meetingId);
```

**на:**

```ts
    expect(h.deps.enqueueTranscription).toHaveBeenCalledWith(h.lib, command.meetingId);
  });

  it('shows the dialog of a newer recording after the older one is answered, not instead of it', async () => {
    const h = harness();
    const first = await h.startRecording();
    await h.stopRecording(first.meetingId);
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    const second = await h.startRecording();
    await h.stopRecording(second.meetingId);

    await h.controller.finishStopDialog({ meetingId: first.meetingId, title: 'Первая', participantsHint: 2 });

    expect(h.state().stopDialog?.meetingId).toBe(second.meetingId);
  });

  it('keeps the dialog of the last recording when the next start fails', async () => {
```

**на:**

```ts
    const second = await h.startRecording();
    await h.stopRecording(second.meetingId);

    expect(h.state().stopDialog?.meetingId).toBe(first.meetingId);
    await h.controller.finishStopDialog({ meetingId: first.meetingId, title: 'Первая', participantsHint: 2 });
    expect(h.state().stopDialog?.meetingId).toBe(second.meetingId);
    await h.controller.finishStopDialog({ meetingId: second.meetingId, title: 'Вторая', participantsHint: null });
    expect(h.state().stopDialog).toBeNull();
  });

  it('drops the dialog of a deleted meeting, open or waiting', async () => {
    const h = harness();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      h.recorder.start.mockClear();
      h.recorder.stop.mockClear();
      const command = await h.startRecording();
      await h.stopRecording(command.meetingId);
      ids.push(command.meetingId);
    }
    const [first, second, third] = ids as [string, string, string];

    h.controller.dropStopDialog(second);
    expect(h.state().stopDialog?.meetingId).toBe(first);
    h.controller.dropStopDialog(first);
    expect(h.state().stopDialog?.meetingId).toBe(third);
    h.controller.dropStopDialog('2026-01-01_0000_ffffff');
    expect(h.state().stopDialog?.meetingId).toBe(third);
    h.controller.dropStopDialog(third);
    expect(h.state().stopDialog).toBeNull();
  });

  it('keeps the dialog of the last recording when the next start fails', async () => {
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/audio/mixer.test.ts src/main/recording/controller.test.ts`
Ожидается: FAIL — новое окно заменяет открытое; встреча с ошибкой не попадает в `meetingsNeedingMix`.

- [ ] **Step 3: Код**

**В `src/main/audio/mixer.ts` заменить:**

```ts
}

/**
 * Встречи, которым нужно сведение: есть дорожки, нет mix.opus, запись закончена.
 * «Ошибку» не сводим: запись без звука (у такой встречи и дорожек нет).
 */
export function meetingsNeedingMix(entries: readonly MeetingListEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'ok' &&
    !entry.mixReady &&
    entry.meeting.status !== 'recording' &&
    entry.meeting.status !== 'error' &&
    entry.meeting.tracks.length > 0
      ? [entry.meeting.id]
      : [],
```

**на:**

```ts
}

/**
 * Встречи, которым нужно сведение: есть дорожки, нет mix.opus, запись закончена. Встречи с ошибкой (например,
 * расшифровки) тоже: иначе плеер вечно «готовит запись». У записи, прервавшейся без звука, дорожек нет.
 */
export function meetingsNeedingMix(entries: readonly MeetingListEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'ok' &&
    !entry.mixReady &&
    entry.meeting.status !== 'recording' &&
    entry.meeting.tracks.length > 0
      ? [entry.meeting.id]
      : [],
```

**В `src/main/recording/controller.ts` заменить:**

```ts
  type SoundKind,
  type StartProblem,
  type StopDialogAnswer,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { fsErrorReason, humanFsError } from '../fs/fs-errors';
```

**на:**

```ts
  type SoundKind,
  type StartProblem,
  type StopDialogAnswer,
  type StopDialogData,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { fsErrorReason, humanFsError } from '../fs/fs-errors';
```

**В `src/main/recording/controller.ts` заменить:**

```ts
  private state: RecordingState = { ...IDLE_RECORDING_STATE };
  private session: Session | null = null;
  private busy: Promise<void> = Promise.resolve();
  /** Выход решён: новые записи не начинаются, кнопки и клавиша ничего не делают. */
  private quitting = false;
```

**на:**

```ts
  private state: RecordingState = { ...IDLE_RECORDING_STATE };
  private session: Session | null = null;
  private busy: Promise<void> = Promise.resolve();
  /** Окна «Запись остановлена», ждущие, пока ответят на открытое (state.stopDialog). */
  private waitingDialogs: StopDialogData[] = [];
  /** Выход решён: новые записи не начинаются, кнопки и клавиша ничего не делают. */
  private quitting = false;
```

**В `src/main/recording/controller.ts` заменить:**

```ts
    } catch (err) {
      throw humanFsError('Не удалось сохранить ответ в окне «Запись остановлена»', err);
    } finally {
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.update({ stopDialog: null });
    }
    this.deps.libraryChanged();
    this.deps.enqueueTranscription(libraryDir, answer.meetingId);
```

**на:**

```ts
    } catch (err) {
      throw humanFsError('Не удалось сохранить ответ в окне «Запись остановлена»', err);
    } finally {
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.showNextStopDialog();
    }
    this.deps.libraryChanged();
    this.deps.enqueueTranscription(libraryDir, answer.meetingId);
```

**В `src/main/recording/controller.ts` заменить:**

```ts
    this.deps.notify(notificationTexts.startFailed(problem), true);
  }

  /**
   * После каждой записи переключатель «Звук компьютера» снова включён.
   * session — запись, которую завершаем: запоздавшая остановка старой записи не должна сбросить новую.
   */
  private resetToIdle(session: Session | null, stopDialog: RecordingState['stopDialog']): void {
    if (this.session !== session) return;
    if (this.session) this.clearTimers(this.session);
    this.session = null;
    this.update({ ...IDLE_RECORDING_STATE, stopDialog: stopDialog ?? this.state.stopDialog });
  }

  private clearTimers(session: Session): void {
```

**на:**

```ts
    this.deps.notify(notificationTexts.startFailed(problem), true);
  }

  /** Встречу удалили: её окно «Запись остановлена» больше не нужно — ни открытое, ни ждущее. */
  dropStopDialog(meetingId: string): void {
    this.waitingDialogs = this.waitingDialogs.filter((dialog) => dialog.meetingId !== meetingId);
    if (this.state.stopDialog?.meetingId === meetingId) this.showNextStopDialog();
  }

  private showNextStopDialog(): void {
    this.update({ stopDialog: this.waitingDialogs.shift() ?? null });
  }

  /**
   * После каждой записи переключатель «Звук компьютера» снова включён.
   * session — запись, которую завершаем: запоздавшая остановка старой записи не должна сбросить новую.
   * Окно «Запись остановлена» прошлой записи ещё открыто — новое ждёт своей очереди, а не заменяет его.
   */
  private resetToIdle(session: Session | null, stopDialog: RecordingState['stopDialog']): void {
    if (this.session !== session) return;
    if (this.session) this.clearTimers(this.session);
    this.session = null;
    const current = this.state.stopDialog;
    if (stopDialog && current) this.waitingDialogs.push(stopDialog);
    this.update({ ...IDLE_RECORDING_STATE, stopDialog: current ?? stopDialog });
  }

  private clearTimers(session: Session): void {
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  760 passed (760)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: queue stop dialogs instead of replacing them; mix meetings with an error too"
```

### Task 7: Удаление аудио и встречи в Корзину

**Files:**
- Create: `src/main/library/meeting-delete.test.ts`, `src/main/library/meeting-delete.ts`, `src/main/library/trash.test.ts`, `src/main/library/trash.ts`
- Modify: `src/main/audio/ffmpeg.test.ts`, `src/main/audio/ffmpeg.ts`, `src/main/audio/mixer.test.ts`, `src/main/audio/mixer.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/transcription/queue.test.ts`, `src/main/transcription/queue.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`

`runFfmpeg` принимает `signal`: отмена останавливает ffmpeg (`FFMPEG_CANCELLED`). `Mixer.cancel` снимает
встречу из очереди сведения или останавливает её сведение и ждёт, пока ffmpeg отпустит файлы; `isPending` — встреча ещё
сводится. `TranscriptionQueue.cancel` снимает встречу из очереди расшифровки или прерывает её работу (процесс
закрывается) и ждёт конца задачи. `trash.ts`: перенос в Корзину с 3 попытками через 300 мс; в автотестах — в папку
`TEXTMEET_TEST_TRASH`. `meeting-delete.ts`: «Удалить аудио» (отказ во время записи, расшифровки и сведения; папка
`audio/` — в Корзину, `tracks: []`, `audioDeleted: true`), «Удалить встречу» (сначала отмена расшифровки и сведения,
затем папка — в Корзину; работает и для папки, которую не удалось прочитать), размер аудио для окна подтверждения.
Каналы `library:delete-audio`, `library:delete-meeting`, `library:audio-size`.

- [ ] **Step 1: Тесты**

**В `src/main/audio/ffmpeg.test.ts` заменить:**

```ts
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { parseProgressDuration, resolveFfmpegPath, runFfmpeg } from './ffmpeg';

describe('resolveFfmpegPath', () => {
  it('points inside app.asar.unpacked in the installed app', () => {
```

**на:**

```ts
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { FFMPEG_CANCELLED, parseProgressDuration, resolveFfmpegPath, runFfmpeg } from './ffmpeg';

describe('resolveFfmpegPath', () => {
  it('points inside app.asar.unpacked in the installed app', () => {
```

**В `src/main/audio/ffmpeg.test.ts` заменить:**

```ts
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('rejects when the binary cannot be started', async () => {
    await expect(runFfmpeg(join(makeTempDir(), 'no-ffmpeg.exe'), [])).rejects.toMatchObject({ code: 'ENOENT' });
  });
```

**на:**

```ts
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('stops ffmpeg when the work is cancelled', async () => {
    const args = ['-re', '-f', 'lavfi', '-i', 'sine=duration=30', '-f', 'null', '-'];
    const abort = new AbortController();
    const started = Date.now();
    const run = runFfmpeg(resolveFfmpegPath(), args, { signal: abort.signal });
    setTimeout(() => abort.abort(), 300);
    await expect(run).rejects.toThrow(FFMPEG_CANCELLED);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('does not start ffmpeg for work cancelled already', async () => {
    await expect(runFfmpeg(resolveFfmpegPath(), ['-version'], { signal: AbortSignal.abort() })).rejects.toThrow(
      FFMPEG_CANCELLED,
    );
  });

  it('rejects when the binary cannot be started', async () => {
    await expect(runFfmpeg(join(makeTempDir(), 'no-ffmpeg.exe'), [])).rejects.toMatchObject({ code: 'ENOENT' });
  });
```

**В `src/main/audio/mixer.test.ts` заменить:**

```ts
});

describe('Mixer', () => {
  function mixerWith(mix: (libraryDir: string, meetingId: string) => Promise<void>, logger = fakeLogger()) {
    const onSettled = vi.fn<(meetingId: string) => void>();
    const mixer = new Mixer({ ffmpegPath: () => 'ffmpeg', logger, onSettled, mix });
    return { mixer, onSettled, logger };
```

**на:**

```ts
});

describe('Mixer', () => {
  function mixerWith(
    mix: (libraryDir: string, meetingId: string, ffmpegPath: string, signal?: AbortSignal) => Promise<void>,
    logger = fakeLogger(),
  ) {
    const onSettled = vi.fn<(meetingId: string) => void>();
    const mixer = new Mixer({ ffmpegPath: () => 'ffmpeg', logger, onSettled, mix });
    return { mixer, onSettled, logger };
```

**В `src/main/audio/mixer.test.ts` заменить:**

```ts
    expect(mixer.hasFailed('other-lib', 'bad')).toBe(false);
  });

  it('forgets a failure once the meeting is mixed after all', async () => {
    let attempts = 0;
    const { mixer, onSettled } = mixerWith(async () => {
```

**на:**

```ts
    expect(mixer.hasFailed('other-lib', 'bad')).toBe(false);
  });

  it('cancels a queued meeting and stops the one being mixed, waiting until it lets the files go', async () => {
    const order: string[] = [];
    let stopped = false;
    const { mixer, onSettled, logger } = mixerWith(
      (_lib, id, _ffmpeg, signal) =>
        new Promise<void>((resolve, reject) => {
          order.push(id);
          if (id !== 'a') {
            resolve();
            return;
          }
          signal?.addEventListener('abort', () => {
            setTimeout(() => {
              stopped = true;
              reject(new Error('cancelled'));
            }, 20);
          });
        }),
    );
    mixer.enqueue('lib', 'a');
    mixer.enqueue('lib', 'b');
    mixer.enqueue('lib', 'c');
    await vi.waitFor(() => expect(order).toEqual(['a']));
    expect(mixer.isPending('lib', 'a')).toBe(true);
    expect(mixer.isPending('lib', 'b')).toBe(true);
    expect(mixer.isPending('other', 'b')).toBe(false);

    await mixer.cancel('lib', 'b');
    expect(mixer.isPending('lib', 'b')).toBe(false);
    await mixer.cancel('lib', 'a');
    expect(stopped).toBe(true);

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith('c'));
    expect(order).toEqual(['a', 'c']);
    // Отменённое сведение — не сбой: ни ошибки в журнале, ни «не удалось подготовить запись».
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(mixer.hasFailed('lib', 'a')).toBe(false);
    expect(mixer.isPending('lib', 'c')).toBe(false);
  });

  it('cancels nothing for a meeting that is not in the queue', async () => {
    const { mixer } = mixerWith(async () => undefined);
    await expect(mixer.cancel('lib', 'x')).resolves.toBeUndefined();
  });

  it('forgets a failure once the meeting is mixed after all', async () => {
    let attempts = 0;
    const { mixer, onSettled } = mixerWith(async () => {
```

**Создать `src/main/library/meeting-delete.test.ts`:**

```ts
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, meetingDir, readMeeting, updateMeeting } from './library';
import { audioSize, deleteAudio, deleteMeeting, deleteTexts, type DeleteDeps } from './meeting-delete';
import { folderTrash } from './trash';

async function setup(patch: Partial<Meeting> = {}) {
  const lib = makeTempDir('textmeet-delete-');
  const created = await createMeeting(lib, { source: 'recording', status: 'recording' });
  writeFileSync(join(audioDir(lib, created.id), 'mic.webm'), 'x'.repeat(1000));
  writeFileSync(join(audioDir(lib, created.id), 'mix.opus'), 'y'.repeat(500));
  const meeting = await updateMeeting(lib, created.id, (m) => ({
    ...m,
    status: 'done',
    tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
    ...patch,
  }));
  const calls: string[] = [];
  const bin = join(makeTempDir('textmeet-bin-'), 'bin');
  const deps: DeleteDeps = {
    libraryDir: () => lib,
    trash: folderTrash(bin),
    isRecording: vi.fn(() => false),
    transcription: {
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`transcription ${id}`);
      }),
    },
    mixer: {
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`mixer ${id}`);
      }),
      isPending: vi.fn(() => false),
    },
    dropStopDialog: vi.fn((id: string) => {
      calls.push(`dialog ${id}`);
    }),
    trashRetryMs: 0,
  };
  return { lib, meeting, deps, calls, bin };
}

describe('audioSize', () => {
  it('adds up the files of the audio folder and is 0 without it', async () => {
    const { lib, meeting } = await setup();
    expect(await audioSize(lib, meeting.id)).toBe(1500);
    expect(await audioSize(lib, '2026-01-01_0000_ffffff')).toBe(0);
  });
});

describe('deleteAudio', () => {
  it('moves the audio folder to the trash and keeps the meeting with no tracks', async () => {
    const { lib, meeting, deps } = await setup();
    const updated = await deleteAudio(deps, meeting.id);
    expect(updated).toMatchObject({ tracks: [], audioDeleted: true, status: 'done' });
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ tracks: [], audioDeleted: true });
    expect(existsSync(audioDir(lib, meeting.id))).toBe(false);
    expect(existsSync(join(meetingDir(lib, meeting.id), 'meeting.json'))).toBe(true);
  });

  it('marks the audio deleted even when the folder is already gone', async () => {
    const { lib, meeting, deps } = await setup();
    await deps.trash(audioDir(lib, meeting.id));
    expect((await deleteAudio(deps, meeting.id)).audioDeleted).toBe(true);
  });

  it.each([
    ['being recorded', {}, { recording: true }, deleteTexts.recording],
    ['queued', { status: 'queued' }, {}, deleteTexts.transcribing],
    ['transcribing', { status: 'transcribing' }, {}, deleteTexts.transcribing],
    ['still mixing', {}, { mixing: true }, deleteTexts.mixing],
    ['without audio already', { audioDeleted: true, tracks: [] }, {}, deleteTexts.noAudio],
  ] as const)('refuses a meeting %s', async (_name, patch, state, message) => {
    const { lib, meeting, deps } = await setup(patch as Partial<Meeting>);
    vi.mocked(deps.isRecording).mockReturnValue('recording' in state);
    vi.mocked(deps.mixer.isPending).mockReturnValue('mixing' in state);
    await expect(deleteAudio(deps, meeting.id)).rejects.toThrow(message);
    expect(existsSync(audioDir(lib, meeting.id))).toBe(true);
  });
});

describe('deleteMeeting', () => {
  it('stops its transcription and mixing, drops its stop dialog, then moves the folder to the trash', async () => {
    const { lib, meeting, deps, calls, bin } = await setup({ status: 'transcribing' });
    await deleteMeeting(deps, meeting.id);
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`, `dialog ${meeting.id}`]);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
    expect(existsSync(join(bin, `1-${meeting.id}`, 'meeting.json'))).toBe(true);
  });

  it('refuses the meeting being recorded', async () => {
    const { lib, meeting, deps, calls } = await setup();
    vi.mocked(deps.isRecording).mockReturnValue(true);
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow(deleteTexts.recording);
    expect(calls).toEqual([]);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(true);
  });

  it('deletes a folder whose meeting.json cannot be read', async () => {
    const { lib, meeting, deps } = await setup();
    writeFileSync(join(meetingDir(lib, meeting.id), 'meeting.json'), '{ сломано');
    await deleteMeeting(deps, meeting.id);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
  });

  it('refuses a path outside the library', async () => {
    const { deps } = await setup();
    await expect(deleteMeeting(deps, '..')).rejects.toThrow(RangeError);
  });
});
```

**Создать `src/main/library/trash.test.ts`:**

```ts
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { folderTrash, moveToTrash, TRASH_ATTEMPTS } from './trash';

const busy = () => Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });

describe('moveToTrash', () => {
  it('moves at the first try', async () => {
    const trash = vi.fn(async () => undefined);
    await moveToTrash('/lib/x', trash, 0);
    expect(trash).toHaveBeenCalledOnce();
  });

  it('tries again while the file is briefly held', async () => {
    const trash = vi
      .fn<(path: string) => Promise<void>>()
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce(undefined);
    await moveToTrash('/lib/x', trash, 0);
    expect(trash).toHaveBeenCalledTimes(2);
  });

  it('gives up with a plain reason and never deletes for good', async () => {
    const trash = vi.fn(async () => {
      throw busy();
    });
    await expect(moveToTrash('/lib/x', trash, 0)).rejects.toThrow(
      'Не удалось переместить в Корзину: файл занят другой программой',
    );
    expect(trash).toHaveBeenCalledTimes(TRASH_ATTEMPTS);
  });

  it('shows the message of an error without a known code', async () => {
    await expect(
      moveToTrash('/lib/x', async () => Promise.reject(new Error('Корзина отключена')), 0),
    ).rejects.toThrow('Не удалось переместить в Корзину: Корзина отключена');
  });
});

describe('folderTrash', () => {
  it('moves folders into the test trash folder under unique names', async () => {
    const root = makeTempDir('textmeet-trash-');
    const bin = join(root, 'bin');
    const trash = folderTrash(bin);
    for (const name of ['a', 'b']) {
      mkdirSync(join(root, name, 'audio'), { recursive: true });
      writeFileSync(join(root, name, 'audio', 'mix.opus'), 'x');
    }
    mkdirSync(join(root, 'c', 'audio'), { recursive: true });
    await trash(join(root, 'a', 'audio'));
    await trash(join(root, 'c', 'audio'));
    await trash(join(root, 'b'));
    expect(existsSync(join(root, 'a', 'audio'))).toBe(false);
    expect(existsSync(join(root, 'b'))).toBe(false);
    expect(readdirSync(bin).sort()).toEqual(['1-audio', '2-audio', '3-b']);
  });
});
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBeNull();
  });

  it('fails clearly when there are no recorded tracks', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { tracks: [] });
```

**на:**

```ts
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBeNull();
  });

  it('cancel stops the running meeting, drops a queued one and goes on with the rest', async () => {
    const lib = makeTempDir();
    const running = await recordedMeeting(lib);
    const queued = await recordedMeeting(lib);
    const next = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, running.id);
    await t.queue.enqueue(lib, queued.id);
    await t.queue.enqueue(lib, next.id);
    await transcribeSent(t.worker);
    const first = t.worker();

    await t.queue.cancel(lib, queued.id);
    expect(t.queue.progress().map((p) => p.meetingId)).toEqual([running.id, next.id]);
    await t.queue.cancel(lib, running.id);
    // Процесс расшифровки закрыт, задача завершилась без уведомления.
    expect(first.killed).toBe(true);
    expect(t.finished).toEqual([]);

    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const command = await transcribeSent(t.worker);
    expect(command.input.tracks[0]?.file).toContain(next.id);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.meeting.id).toBe(next.id);
    expect((await readMeeting(lib, queued.id)).status).toBe('queued');
  });

  it('cancel stops a meeting whose models are still being prepared', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    let signal: AbortSignal | undefined;
    const t = setup({
      ensure: (_onProgress, s) => {
        signal = s;
        return new Promise<void>((_resolve, reject) =>
          s?.addEventListener('abort', () => reject(new DownloadError('cancelled', 'скачивание отменено'))),
        );
      },
    });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await t.queue.cancel(lib, meeting.id);
    expect(signal?.aborted).toBe(true);
    expect(t.finished).toEqual([]);
    expect(t.workers).toHaveLength(0);
    expect(t.queue.isBusy()).toBe(false);
  });

  it('cancel stops a meeting that is just starting', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    // Задача уже взята, но ещё пишет статус «расшифровывается».
    await t.queue.cancel(lib, meeting.id);
    expect(t.ensured).toEqual([]);
    expect(t.workers).toHaveLength(0);
    expect(t.finished).toEqual([]);
  });

  it('cancel of a meeting that is not in the queue does nothing', async () => {
    const t = setup();
    await expect(t.queue.cancel(makeTempDir(), '2026-01-01_0000_ffffff')).resolves.toBeUndefined();
  });

  it('fails clearly when there are no recorded tracks', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { tracks: [] });
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/audio/ffmpeg.test.ts src/main/audio/mixer.test.ts src/main/library/meeting-delete.test.ts src/main/library/trash.test.ts src/main/transcription/queue.test.ts`
Ожидается: FAIL — нет модулей `./trash` и `./meeting-delete`, нет `FFMPEG_CANCELLED`, `Mixer.cancel`, `TranscriptionQueue.cancel`.

- [ ] **Step 3: Код**

**В `src/main/audio/ffmpeg.ts` заменить:**

```ts
export interface FfmpegOptions {
  /** Сколько ffmpeg может молчать, прежде чем его остановят как зависший. */
  stallMs?: number;
}

/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[], options: FfmpegOptions = {}): Promise<FfmpegRun> {
  const stallMs = options.stallMs ?? FFMPEG_STALL_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
```

**на:**

```ts
export interface FfmpegOptions {
  /** Сколько ffmpeg может молчать, прежде чем его остановят как зависший. */
  stallMs?: number;
  /** Отмена: ffmpeg останавливается, обещание отклоняется с FFMPEG_CANCELLED. */
  signal?: AbortSignal;
}

export const FFMPEG_CANCELLED = 'ffmpeg остановлен: работа отменена';

/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[], options: FfmpegOptions = {}): Promise<FfmpegRun> {
  const stallMs = options.stallMs ?? FFMPEG_STALL_MS;
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(FFMPEG_CANCELLED));
      return;
    }
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
```

**В `src/main/audio/ffmpeg.ts` заменить:**

```ts
      }, stallMs);
    };
    rearmWatchdog();

    let progress = '';
    let errors = '';
```

**на:**

```ts
      }, stallMs);
    };
    rearmWatchdog();
    let cancelled = false;
    const onAbort = (): void => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    let progress = '';
    let errors = '';
```

**В `src/main/audio/ffmpeg.ts` заменить:**

```ts
    });
    child.on('error', (err) => {
      clearTimeout(watchdog);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(watchdog);
      if (stalled) reject(new Error('ffmpeg завис — долго ничего не сообщал и был остановлен'));
      else if (code === 0) resolve({ durationSec: parseProgressDuration(progress) });
      else {
        const how = code === null ? `сигналом ${signal}` : `кодом ${code}`;
        reject(new Error(`ffmpeg завершился с ${how}: ${errors.trim().split('\n').slice(-3).join(' | ')}`));
      }
    });
```

**на:**

```ts
    });
    child.on('error', (err) => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code, killSignal) => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
      if (cancelled) reject(new Error(FFMPEG_CANCELLED));
      else if (stalled) reject(new Error('ffmpeg завис — долго ничего не сообщал и был остановлен'));
      else if (code === 0) resolve({ durationSec: parseProgressDuration(progress) });
      else {
        const how = code === null ? `сигналом ${killSignal}` : `кодом ${code}`;
        reject(new Error(`ffmpeg завершился с ${how}: ${errors.trim().split('\n').slice(-3).join(' | ')}`));
      }
    });
```

**В `src/main/audio/mixer.ts` заменить:**

```ts
import { MIX_FILE } from '../../shared/recording';
import { audioDir, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { runFfmpeg } from './ffmpeg';

export interface MixInput {
  file: string;
```

**на:**

```ts
import { MIX_FILE } from '../../shared/recording';
import { audioDir, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { FFMPEG_CANCELLED, runFfmpeg } from './ffmpeg';

export interface MixInput {
  file: string;
```

**В `src/main/audio/mixer.ts` заменить:**

```ts
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
```

**на:**

```ts
}

/** Сводит дорожки встречи в audio/mix.opus; длительность записывает, если её ещё нет (восстановленная запись). */
export async function mixMeeting(
  libraryDir: string,
  meetingId: string,
  ffmpegPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const meeting = await readMeeting(libraryDir, meetingId);
  const dir = audioDir(libraryDir, meetingId);
  const inputs = await existingInputs(dir, meeting.tracks);
  if (inputs.length === 0) throw new Error('нет записанных дорожек');
  const part = join(dir, `${MIX_FILE}.part`);
  try {
    const { durationSec } = await runFfmpeg(ffmpegPath, mixArgs(inputs, part), { signal });
    await fsp.rename(part, join(dir, MIX_FILE));
    if (meeting.durationSec === null && durationSec !== null) {
      await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, durationSec: m.durationSec ?? durationSec }));
```

**В `src/main/audio/mixer.ts` заменить:**

```ts
  /** Встречи, которые не удалось свести в этом запуске: вместо вечного «Готовим…» окно покажет, что не вышло. */
  private readonly failed = new Set<string>();
  private running = false;

  constructor(private readonly deps: MixerDeps) {}
```

**на:**

```ts
  /** Встречи, которые не удалось свести в этом запуске: вместо вечного «Готовим…» окно покажет, что не вышло. */
  private readonly failed = new Set<string>();
  private running = false;
  private current: { job: MixJob; abort: AbortController; done: Promise<void> } | null = null;

  constructor(private readonly deps: MixerDeps) {}
```

**В `src/main/audio/mixer.ts` заменить:**

```ts
    return this.failed.has(jobKey(libraryDir, meetingId));
  }

  private async drain(): Promise<void> {
    const mix = this.deps.mix ?? mixMeeting;
    for (let job = this.queue.shift(); job !== undefined; job = this.queue.shift()) {
      const { libraryDir, meetingId } = job;
      try {
        await mix(libraryDir, meetingId, this.deps.ffmpegPath());
        this.failed.delete(jobKey(libraryDir, meetingId));
        this.deps.logger.info(`Сведение готово: ${meetingId}`);
      } catch (err) {
        this.failed.add(jobKey(libraryDir, meetingId));
        this.deps.logger.error(`Не удалось свести дорожки встречи ${meetingId}`, err);
      }
      this.deps.onSettled(meetingId);
    }
    this.running = false;
  }
}
```

**на:**

```ts
    return this.failed.has(jobKey(libraryDir, meetingId));
  }

  /** Встреча ждёт сведения или сводится. */
  isPending(libraryDir: string, meetingId: string): boolean {
    const key = jobKey(libraryDir, meetingId);
    const current = this.current;
    return (
      this.queue.some((job) => jobKey(job.libraryDir, job.meetingId) === key) ||
      (current !== null && jobKey(current.job.libraryDir, current.job.meetingId) === key)
    );
  }

  /** Встречу удаляют: снять из очереди, а если она сводится — остановить ffmpeg и дождаться, пока он отпустит файлы. */
  async cancel(libraryDir: string, meetingId: string): Promise<void> {
    const key = jobKey(libraryDir, meetingId);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const job = this.queue[i]!;
      if (jobKey(job.libraryDir, job.meetingId) === key) this.queue.splice(i, 1);
    }
    this.failed.delete(key);
    const current = this.current;
    if (current && jobKey(current.job.libraryDir, current.job.meetingId) === key) {
      current.abort.abort();
      await current.done;
    }
  }

  private async drain(): Promise<void> {
    const mix = this.deps.mix ?? mixMeeting;
    for (let job = this.queue.shift(); job !== undefined; job = this.queue.shift()) {
      const abort = new AbortController();
      const done = this.mixOne(mix, job, abort.signal);
      this.current = { job, abort, done };
      await done;
      this.current = null;
    }
    this.running = false;
  }

  private async mixOne(mix: typeof mixMeeting, job: MixJob, signal: AbortSignal): Promise<void> {
    const { libraryDir, meetingId } = job;
    try {
      await mix(libraryDir, meetingId, this.deps.ffmpegPath(), signal);
      this.failed.delete(jobKey(libraryDir, meetingId));
      this.deps.logger.info(`Сведение готово: ${meetingId}`);
    } catch (err) {
      if (signal.aborted) {
        this.deps.logger.info(`Сведение отменено: ${meetingId}`);
        return;
      }
      this.failed.add(jobKey(libraryDir, meetingId));
      this.deps.logger.error(`Не удалось свести дорожки встречи ${meetingId}`, err);
    }
    this.deps.onSettled(meetingId);
  }
}
```

**В `src/main/index.ts` заменить:**

```ts
  powerMonitor,
  protocol,
  session,
  systemPreferences,
  type BrowserWindow,
} from 'electron';
```

**на:**

```ts
  powerMonitor,
  protocol,
  session,
  shell,
  systemPreferences,
  type BrowserWindow,
} from 'electron';
```

**В `src/main/index.ts` заменить:**

```ts
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { SearchIndex } from './library/search-index';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { CatalogDownloads } from './models/catalog-downloads';
```

**на:**

```ts
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { SearchIndex } from './library/search-index';
import { folderTrash, type Trash } from './library/trash';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { CatalogDownloads } from './models/catalog-downloads';
```

**В `src/main/index.ts` заменить:**

```ts
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
```

**на:**

```ts
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Только для автотестов: «Корзина» — обычная папка (на машинах CI настоящей Корзины может не быть). */
const trash: Trash = process.env.TEXTMEET_TEST_TRASH
  ? folderTrash(process.env.TEXTMEET_TEST_TRASH)
  : (path) => shell.trashItem(path);
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
```

**В `src/main/index.ts` заменить:**

```ts
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    search: searchIndex,
    transcription: queue,
    models,
    downloads: catalogDownloads,
```

**на:**

```ts
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    search: searchIndex,
    deletion: {
      libraryDir,
      trash,
      isRecording: (id) => {
        const state = controller.getState();
        return state.phase !== 'idle' && state.meetingId === id;
      },
      transcription: queue,
      mixer,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    transcription: queue,
    models,
    downloads: catalogDownloads,
```

**В `src/main/ipc.ts` заменить:**

```ts
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { editTranscript, renameMeeting, renameSpeaker, TranscriptEditSchema } from './library/meeting-edits';
import type { SearchIndex } from './library/search-index';
import { readTranscript } from './library/transcript-store';
```

**на:**

```ts
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { audioSize, deleteAudio, deleteMeeting, type DeleteDeps } from './library/meeting-delete';
import { editTranscript, renameMeeting, renameSpeaker, TranscriptEditSchema } from './library/meeting-edits';
import type { SearchIndex } from './library/search-index';
import { readTranscript } from './library/transcript-store';
```

**В `src/main/ipc.ts` заменить:**

```ts
  hotkeyChanged(): void;
  /** Встреча изменилась — окно перечитает список встреч. */
  libraryChanged(): void;
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'search'>;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**на:**

```ts
  hotkeyChanged(): void;
  /** Встреча изменилась — окно перечитает список встреч. */
  libraryChanged(): void;
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'remove' | 'search'>;
  deletion: DeleteDeps;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.search, (arg) => deps.search.search(z.string().max(500).parse(arg)));

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**на:**

```ts

  handle(IPC.search, (arg) => deps.search.search(z.string().max(500).parse(arg)));

  handle(IPC.audioSize, (arg) => audioSize(deps.libraryDir(), MeetingIdSchema.parse(arg)));

  handle(IPC.deleteAudio, async (arg) => {
    await deleteAudio(deps.deletion, MeetingIdSchema.parse(arg));
    deps.libraryChanged();
  });

  // Имя папки, а не только прочитанная встреча: удалить можно и папку, которую не удалось прочитать.
  handle(IPC.deleteMeeting, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    await deleteMeeting(deps.deletion, id);
    deps.search.remove(id);
    deps.libraryChanged();
  });

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**Создать `src/main/library/meeting-delete.ts`:**

```ts
// «Удалить аудио» и «Удалить встречу»: всё — в Корзину, ничего не стирается насовсем.
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../shared/meeting';
import { audioDir, meetingDir, readMeeting, updateMeeting } from './library';
import { moveToTrash, type Trash } from './trash';

export const deleteTexts = {
  recording: 'Эта встреча сейчас записывается — сначала остановите запись.',
  transcribing: 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.',
  mixing: 'Запись ещё готовится к прослушиванию — удалите аудио чуть позже.',
  noAudio: 'Аудио этой встречи уже удалено.',
} as const;

export interface DeleteDeps {
  libraryDir(): string;
  trash: Trash;
  /** Эта встреча сейчас записывается. */
  isRecording(meetingId: string): boolean;
  transcription: { cancel(libraryDir: string, meetingId: string): Promise<void> };
  mixer: {
    cancel(libraryDir: string, meetingId: string): Promise<void>;
    isPending(libraryDir: string, meetingId: string): boolean;
  };
  /** Убрать окно «Запись остановлена» этой встречи (открытое или ждущее). */
  dropStopDialog(meetingId: string): void;
  /** Пауза между попытками переноса в Корзину (в тестах — 0). */
  trashRetryMs?: number;
}

/** Размер файлов папки audio/ — для окна «Удалить аудио?». Папки нет — 0. */
export async function audioSize(libraryDir: string, meetingId: string): Promise<number> {
  const dir = audioDir(libraryDir, meetingId);
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    names.map((name) =>
      fsp.stat(join(dir, name)).then(
        (stat) => (stat.isFile() ? stat.size : 0),
        () => 0,
      ),
    ),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

const exists = (path: string): Promise<boolean> =>
  fsp.access(path).then(
    () => true,
    () => false,
  );

/** Аудио — в Корзину; текст остаётся. Встреча больше не сводится и не расшифровывается: дорожек у неё нет. */
export async function deleteAudio(deps: DeleteDeps, meetingId: string): Promise<Meeting> {
  const libraryDir = deps.libraryDir();
  const meeting = await readMeeting(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  if (meeting.status === 'queued' || meeting.status === 'transcribing') throw new Error(deleteTexts.transcribing);
  if (deps.mixer.isPending(libraryDir, meetingId)) throw new Error(deleteTexts.mixing);
  if (meeting.audioDeleted) throw new Error(deleteTexts.noAudio);
  const dir = audioDir(libraryDir, meetingId);
  if (await exists(dir)) await moveToTrash(dir, deps.trash, deps.trashRetryMs);
  return updateMeeting(libraryDir, meetingId, (m) => ({ ...m, tracks: [], audioDeleted: true }));
}

/**
 * Папку встречи — в Корзину. Сначала отменяются её расшифровка и сведение (они держат файлы) и убирается её окно
 * «Запись остановлена». Работает и для папки, которую не удалось прочитать.
 */
export async function deleteMeeting(deps: DeleteDeps, meetingId: string): Promise<void> {
  const libraryDir = deps.libraryDir();
  const dir = meetingDir(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  await deps.transcription.cancel(libraryDir, meetingId);
  await deps.mixer.cancel(libraryDir, meetingId);
  deps.dropStopDialog(meetingId);
  await moveToTrash(dir, deps.trash, deps.trashRetryMs);
}
```

**Создать `src/main/library/trash.ts`:**

```ts
import { promises as fsp } from 'node:fs';
import { basename, join } from 'node:path';
import { knownFsReason } from '../fs/fs-errors';

/** Переносит файл или папку в Корзину системы (в программе — shell.trashItem). */
export type Trash = (path: string) => Promise<void>;

export const TRASH_ATTEMPTS = 3;
export const TRASH_RETRY_MS = 300;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * В Корзину — с повторами: OneDrive, антивирус и только что закрытый плеер ненадолго держат файлы. Не вышло —
 * ничего не удаляется насовсем, ошибка с понятной причиной.
 */
export async function moveToTrash(path: string, trash: Trash, retryMs = TRASH_RETRY_MS): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await trash(path);
      return;
    } catch (err) {
      if (attempt >= TRASH_ATTEMPTS) {
        const reason = knownFsReason(err) ?? (err instanceof Error ? err.message : String(err));
        throw new Error(`Не удалось переместить в Корзину: ${reason}`, { cause: err });
      }
      await wait(retryMs);
    }
  }
}

/**
 * «Корзина» автотестов (TEXTMEET_TEST_TRASH): перенос в обычную папку. На машинах CI настоящей Корзины может
 * не быть, а тестовые файлы в Корзине разработчика не нужны.
 */
export function folderTrash(dir: string): Trash {
  let counter = 0;
  return async (path) => {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(path, join(dir, `${++counter}-${basename(path)}`));
  };
}
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
  private active: Job | null = null;
  /** Задача взята из очереди, а meeting.json ещё не прочитан: она прочитает и то, что запишут до этого. */
  private starting: Job | null = null;
  private pendingEnqueues = 0;
  private worker: WorkerHandle | null = null;
  /** Модель последней задачи этого процесса: он держит её в памяти (Whisper — около 1 ГБ). */
```

**на:**

```ts
  private active: Job | null = null;
  /** Задача взята из очереди, а meeting.json ещё не прочитан: она прочитает и то, что запишут до этого. */
  private starting: Job | null = null;
  /** Задача, которая сейчас выполняется (active), закончилась — для отмены, которой надо дождаться. */
  private activeDone: Promise<void> | null = null;
  /** Задачу отменяют (встречу удаляют), пока она ещё готовится: она не начнёт работу. */
  private cancelling: Job | null = null;
  private pendingEnqueues = 0;
  private worker: WorkerHandle | null = null;
  /** Модель последней задачи этого процесса: он держит её в памяти (Whisper — около 1 ГБ). */
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    for (const meeting of meetings) this.add({ libraryDir, meetingId: meeting.id });
  }

  /** Началась или закончилась запись: процессу — новое число потоков. */
  threadsChanged(): void {
    this.worker?.send({ type: 'threads', threads: this.deps.threads() });
```

**на:**

```ts
    for (const meeting of meetings) this.add({ libraryDir, meetingId: meeting.id });
  }

  /**
   * Встречу удаляют: снять её из очереди; если она расшифровывается — прервать (процесс расшифровки закрывается) и
   * дождаться, пока задача отпустит файлы встречи. Статус в meeting.json не меняется — папку всё равно удалят.
   */
  async cancel(libraryDir: string, meetingId: string): Promise<void> {
    const job: Job = { libraryDir, meetingId };
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (sameJob(this.queue[i]!, job)) this.queue.splice(i, 1);
    }
    const active = this.active;
    if (active && sameJob(active, job)) {
      this.cancelling = active;
      const current = this.current;
      if (current && sameJob(current.job, job)) {
        current.cancelled = true;
        current.abort.abort();
        if (current.settle) this.killWorker(current.worker);
      }
      await this.activeDone;
      if (this.cancelling === active) this.cancelling = null;
    }
    this.emitProgress(true);
  }

  /** Началась или закончилась запись: процессу — новое число потоков. */
  threadsChanged(): void {
    this.worker?.send({ type: 'threads', threads: this.deps.threads() });
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
      this.active = job;
      this.starting = job;
      try {
        await this.runJob(job);
      } catch (err) {
        this.deps.logger.error(`Очередь расшифровки: сбой задачи ${job.meetingId}`, err);
      } finally {
        this.active = null;
        this.starting = null;
      }
    }
```

**на:**

```ts
      this.active = job;
      this.starting = job;
      try {
        const run = this.runJob(job);
        this.activeDone = run.then(
          () => undefined,
          () => undefined,
        );
        await run;
      } catch (err) {
        this.deps.logger.error(`Очередь расшифровки: сбой задачи ${job.meetingId}`, err);
      } finally {
        this.active = null;
        this.activeDone = null;
        this.starting = null;
      }
    }
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
      worker: null,
      progress: { meetingId, stage: 'prepare', fraction: 0, download: null },
      clock: null,
      cancelled: this.disposed,
      abort: new AbortController(),
      settle: null,
      rearm: null,
```

**на:**

```ts
      worker: null,
      progress: { meetingId, stage: 'prepare', fraction: 0, download: null },
      clock: null,
      cancelled: this.disposed || this.cancelling === job,
      abort: new AbortController(),
      settle: null,
      rearm: null,
```

**В `src/preload/index.ts` заменить:**

```ts
  renameSpeaker: (request) => invoke(IPC.renameSpeaker, request),
  editTranscript: (request) => invoke(IPC.editTranscript, request),
  search: (query) => invoke(IPC.search, query),
  getAppInfo: () => invoke(IPC.getAppInfo),
  getRecordingState: () => invoke(IPC.getRecordingState),
  toggleRecording: () => invoke(IPC.toggleRecording),
```

**на:**

```ts
  renameSpeaker: (request) => invoke(IPC.renameSpeaker, request),
  editTranscript: (request) => invoke(IPC.editTranscript, request),
  search: (query) => invoke(IPC.search, query),
  audioSize: (meetingId) => invoke(IPC.audioSize, meetingId),
  deleteAudio: (meetingId) => invoke(IPC.deleteAudio, meetingId),
  deleteMeeting: (meetingId) => invoke(IPC.deleteMeeting, meetingId),
  getAppInfo: () => invoke(IPC.getAppInfo),
  getRecordingState: () => invoke(IPC.getRecordingState),
  toggleRecording: () => invoke(IPC.toggleRecording),
```

**В `src/shared/ipc.ts` заменить:**

```ts
  renameSpeaker: 'library:rename-speaker',
  editTranscript: 'library:edit-transcript',
  search: 'library:search',
  getAppInfo: 'app:info',
  getRecordingState: 'recording:get-state',
  toggleRecording: 'recording:toggle',
```

**на:**

```ts
  renameSpeaker: 'library:rename-speaker',
  editTranscript: 'library:edit-transcript',
  search: 'library:search',
  audioSize: 'library:audio-size',
  deleteAudio: 'library:delete-audio',
  deleteMeeting: 'library:delete-meeting',
  getAppInfo: 'app:info',
  getRecordingState: 'recording:get-state',
  toggleRecording: 'recording:toggle',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.renameSpeaker]: { arg: RenameSpeakerRequest; result: Meeting };
  [IPC.editTranscript]: { arg: EditTranscriptRequest; result: EditedTranscript };
  [IPC.search]: { arg: string; result: SearchResult };
  [IPC.getAppInfo]: { arg: void; result: AppInfo };
  [IPC.getRecordingState]: { arg: void; result: RecordingState };
  [IPC.toggleRecording]: { arg: void; result: void };
```

**на:**

```ts
  [IPC.renameSpeaker]: { arg: RenameSpeakerRequest; result: Meeting };
  [IPC.editTranscript]: { arg: EditTranscriptRequest; result: EditedTranscript };
  [IPC.search]: { arg: string; result: SearchResult };
  [IPC.audioSize]: { arg: string; result: number };
  [IPC.deleteAudio]: { arg: string; result: void };
  [IPC.deleteMeeting]: { arg: string; result: void };
  [IPC.getAppInfo]: { arg: void; result: AppInfo };
  [IPC.getRecordingState]: { arg: void; result: RecordingState };
  [IPC.toggleRecording]: { arg: void; result: void };
```

**В `src/shared/ipc.ts` заменить:**

```ts
  editTranscript(request: EditTranscriptRequest): Promise<EditedTranscript>;
  /** Поиск по всем встречам. */
  search(query: string): Promise<SearchResult>;
  getAppInfo(): Promise<AppInfo>;
  getRecordingState(): Promise<RecordingState>;
  toggleRecording(): Promise<void>;
```

**на:**

```ts
  editTranscript(request: EditTranscriptRequest): Promise<EditedTranscript>;
  /** Поиск по всем встречам. */
  search(query: string): Promise<SearchResult>;
  /** Сколько байт занимает аудио встречи (для окна «Удалить аудио?»). */
  audioSize(meetingId: string): Promise<number>;
  /** «Удалить аудио»: папка audio/ — в Корзину, текст остаётся. */
  deleteAudio(meetingId: string): Promise<void>;
  /** «Удалить встречу»: папка встречи — в Корзину (и папка, которую не удалось прочитать). */
  deleteMeeting(meetingId: string): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  getRecordingState(): Promise<RecordingState>;
  toggleRecording(): Promise<void>;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  785 passed (785)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: delete audio or a whole meeting to the trash, stopping its transcription and mixing"
```

### Task 8: Слушать с места реплики

**Files:**
- Create: `e2e/library.spec.ts`, `src/renderer/main/playback.test.ts`, `src/renderer/main/playback.ts`
- Modify: `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/Player.tsx`, `src/renderer/main/TranscriptView.tsx`, `src/renderer/main/hooks.ts`, `src/renderer/main/styles.css`

Плеер перестаёт хранить состояние сам: `usePlayback` (в `hooks.ts`) держит `<audio>`, место, скорость и даёт
постоянную `seekAndPlay` — её получает каждая реплика, и новая функция перерисовывала бы весь текст при игре. Время
реплики — кнопка «Слушать с 0:04», пока запись готова к прослушиванию. Звучащая реплика (`segmentAt` — двоичный поиск
по началам) подсвечена, текст прокручивается за звуком, если человек не листал его сам последние 5 с. Текст встречи
перечитывается и при возврате в окно (отложено из Плана 3: текст, заменённый снаружи).

- [ ] **Step 1: Тесты**

**Создать `e2e/library.spec.ts`:**

```ts
// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { expect, test, type Page } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-25_1430_a1b2c3';

const TRANSCRIPT = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-25T12:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
    { id: 's2', kind: 'other' },
  ],
  segments: [
    { id: 'seg-1', start: 0.5, end: 1.8, speakerId: 's1', text: 'По бюджету на октябрь осталась половина.', edited: false },
    { id: 'seg-2', start: 2, end: 3.5, speakerId: 'me', text: 'С подрядчиками или без?', edited: false },
    { id: 'seg-3', start: 4, end: 5.5, speakerId: 's2', text: 'Без подрядчиков.', edited: false },
  ],
};

/** Расшифрованная встреча со звуком (6 с тона; сведение программа сделает при запуске). */
const doneMeeting = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  json: meetingJson(ID, {
    title: 'Созвон с Ириной',
    durationSec: 6,
    status: 'done',
    model: 'gigaam-v3-e2e-rnnt',
    tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
    ...overrides,
  }),
  audio: { 'mic.webm': 6 },
});

async function openMeeting(page: Page, title = 'Созвон с Ириной'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

const audioState = (page: Page) =>
  page.evaluate(() => {
    const audio = document.querySelector('audio');
    return audio ? { time: audio.currentTime, paused: audio.paused } : null;
  });

test('a click on the time of a segment plays the recording from there and marks the playing segment', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  // Время становится кнопкой, когда запись готова к прослушиванию.
  await text.getByRole('button', { name: 'Слушать с 0:04' }).click({ timeout: 15_000 });

  await expect.poll(async () => (await audioState(page))?.time ?? 0).toBeGreaterThanOrEqual(4);
  expect((await audioState(page))?.paused).toBe(false);
  await expect(text.locator('.row[aria-current="true"]')).toContainText('Без подрядчиков.');

  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect.poll(async () => (await audioState(page))?.paused).toBe(true);
});

test('the time of a segment is plain text while there is nothing to play', async () => {
  launched = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { title: 'Созвон с Ириной', status: 'done', tracks: [] }) }],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  await expect(text).toContainText('0:04');
  await expect(text.getByRole('button', { name: /Слушать с/ })).toHaveCount(0);
});
```

**Создать `src/renderer/main/playback.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { MANUAL_SCROLL_PAUSE_MS, nextSpeed, segmentAt, shouldFollow, speedLabel } from './playback';

describe('segmentAt', () => {
  const starts = [0.5, 3, 3, 10];

  it('finds the last segment that has started', () => {
    expect(segmentAt(starts, 0.5)).toBe(0);
    expect(segmentAt(starts, 2.9)).toBe(0);
    expect(segmentAt(starts, 3)).toBe(2);
    expect(segmentAt(starts, 9.99)).toBe(2);
    expect(segmentAt(starts, 600)).toBe(3);
  });

  it('is -1 before the first segment and for no segments', () => {
    expect(segmentAt(starts, 0)).toBe(-1);
    expect(segmentAt([], 5)).toBe(-1);
  });
});

describe('speeds', () => {
  it('goes round 1× → 1,5× → 2× → 1×', () => {
    expect(nextSpeed(1)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(2);
    expect(nextSpeed(2)).toBe(1);
    expect(nextSpeed(3)).toBe(1);
  });

  it('labels a speed the Russian way', () => {
    expect(speedLabel(1.5)).toBe('1,5×');
    expect(speedLabel(2)).toBe('2×');
  });
});

describe('shouldFollow', () => {
  const base = { playing: true, editing: false, now: 100_000, lastManualScroll: 0 };

  it('follows the sound while it plays', () => {
    expect(shouldFollow(base)).toBe(true);
  });

  it('does not follow when paused, while a segment is edited or right after a manual scroll', () => {
    expect(shouldFollow({ ...base, playing: false })).toBe(false);
    expect(shouldFollow({ ...base, editing: true })).toBe(false);
    expect(shouldFollow({ ...base, lastManualScroll: base.now - MANUAL_SCROLL_PAUSE_MS + 1 })).toBe(false);
    expect(shouldFollow({ ...base, lastManualScroll: base.now - MANUAL_SCROLL_PAUSE_MS })).toBe(true);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/playback.test.ts`
Ожидается: FAIL — нет модуля `./playback`; сквозной тест не находит кнопку «Слушать с 0:04».

- [ ] **Step 3: Код**

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
```

**на:**

```tsx
import { useMemo, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { useTranscript, type TranscriptLoad } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';
import { TranscribeDialog } from './TranscribeDialog';
import { progressView, transcribeActions, type ProgressView } from './transcription-format';
import { TranscriptView } from './TranscriptView';
```

**на:**

```tsx
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';
import { segmentAt } from './playback';
import { TranscribeDialog } from './TranscribeDialog';
import { progressView, transcribeActions, type ProgressView } from './transcription-format';
import { TranscriptView } from './TranscriptView';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx

type BusyStatus = 'queued' | 'transcribing';

/** Средняя часть встречи: текст, ход расшифровки или приглашение расшифровать. */
function Body({
  meeting,
  load,
  busy,
  progress,
  onTranscribe,
}: {
  meeting: Meeting;
  load: TranscriptLoad;
  busy: BusyStatus | null;
  progress: TranscriptionProgress | null;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
```

**на:**

```tsx

type BusyStatus = 'queued' | 'transcribing';

/** Текст встречи, связанный с плеером: звучащая реплика подсвечена, щелчок по времени — слушать с этого места. */
function ReadyText({
  load,
  meeting,
  playback,
  canPlay,
}: {
  load: Extract<TranscriptLoad, { kind: 'ready' }>;
  meeting: Meeting;
  playback: Playback;
  canPlay: boolean;
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
  // До первого «Слушать» ничего не подсвечено.
  const nowIndex = canPlay && (playback.playing || playback.position > 0) ? segmentAt(starts, playback.position) : -1;
  return (
    <TranscriptView
      transcript={transcript}
      names={meeting.speakerNames}
      nowIndex={nowIndex}
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
    />
  );
}

/** Средняя часть встречи: текст, ход расшифровки или приглашение расшифровать. */
function Body({
  meeting,
  load,
  busy,
  progress,
  playback,
  canPlay,
  onTranscribe,
}: {
  meeting: Meeting;
  load: TranscriptLoad;
  busy: BusyStatus | null;
  progress: TranscriptionProgress | null;
  playback: Playback;
  /** Запись готова к прослушиванию. */
  canPlay: boolean;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
    return (
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        <TranscriptView transcript={load.transcript} names={meeting.speakerNames} />
      </>
    );
  }
```

**на:**

```tsx
    return (
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        <ReadyText load={load} meeting={meeting} playback={playback} canPlay={canPlay} />
      </>
    );
  }
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
  const load = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
```

**на:**

```tsx
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
  const [load] = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const playback = usePlayback(meeting.id, meeting.durationSec);
  const canPlay = mixReady && !playback.failed;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
        load={load}
        busy={busy}
        progress={progress}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
        <Player meetingId={meeting.id} fallbackDuration={meeting.durationSec} />
      ) : (
        hasAudio && (
          <footer className="player pending">
```

**на:**

```tsx
        load={load}
        busy={busy}
        progress={progress}
        playback={playback}
        canPlay={canPlay}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
        <Player meetingId={meeting.id} playback={playback} />
      ) : (
        hasAudio && (
          <footer className="player pending">
```

**Заменить всё содержимое `src/renderer/main/Player.tsx` на:**

```tsx
import { formatDuration } from './format';
import type { Playback } from './hooks';
import { PauseIcon, PlayIcon } from './icons';
import { speedLabel } from './playback';

/** Плеер сведённой записи встречи (audio/mix.opus через протокол tm-media). Управление — usePlayback. */
export function Player({ meetingId, playback }: { meetingId: string; playback: Playback }) {
  const { ref, playing, position, duration, speed, failed, events } = playback;

  if (failed) {
    return <footer className="player pending">Не удалось открыть запись для прослушивания.</footer>;
  }

  return (
    <footer className="player">
      <audio ref={ref} preload="metadata" src={`tm-media://meeting/${meetingId}/mix.opus`} {...events} />
      <button type="button" className="play" aria-label={playing ? 'Пауза' : 'Слушать'} onClick={playback.toggle}>
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
        onChange={(e) => playback.seek(Number(e.currentTarget.value))}
      />
      <span className="ptime">{formatDuration(duration)}</span>
      <button
        type="button"
        className="speed"
        aria-label={`Скорость воспроизведения: ${speedLabel(speed)}`}
        onClick={playback.nextSpeed}
      >
        {speedLabel(speed)}
      </button>
    </footer>
  );
}
```

**Заменить всё содержимое `src/renderer/main/TranscriptView.tsx` на:**

```tsx
import { memo, useEffect, useRef } from 'react';
import { speakerLabel, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import { PlayIcon } from './icons';
import { shouldFollow } from './playback';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
  /** Имена спикеров из meeting.json. */
  names: Readonly<Record<string, string>>;
  /** Звучащая реплика (номер) — подсвечена; -1 — никакая. */
  nowIndex: number;
  /** Запись играет — текст идёт за звуком. */
  playing: boolean;
  /** Слушать с начала реплики; null — запись недоступна (готовится, не свелась, удалена). */
  onPlayAt: ((seconds: number) => void) | null;
}

/** Клавиши, которыми человек листает текст сам. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface RowProps {
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  onPlayAt: ((seconds: number) => void) | null;
}

/** Реплика: время (щелчок — слушать с этого места), спикер, текст. memo: при игре меняются только две реплики. */
const Row = memo(function Row({ segment, label, now, onPlayAt }: RowProps) {
  const time = formatTimestamp(segment.start);
  return (
    <div className={now ? 'row now' : 'row'} data-segment={segment.id} aria-current={now ? 'true' : undefined}>
      {onPlayAt ? (
        <button type="button" className="t tbtn" aria-label={`Слушать с ${time}`} onClick={() => onPlayAt(segment.start)}>
          <PlayIcon />
          {time}
        </button>
      ) : (
        <span className="t">{time}</span>
      )}
      <div>
        <div className={`who ${speakerTone(segment.speakerId)}`}>{label}</div>
        <div className="say">{segment.text}</div>
      </div>
    </div>
  );
});

/** Текст встречи, как на листах 1 и 9 макета: спикеры сверху, реплики «время · кто · что». */
export function TranscriptView({ transcript, names, nowIndex, playing, onPlayAt }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;

  // Звучит следующая реплика — показать её, если человек не листает текст сам.
  useEffect(() => {
    if (nowId === null) return;
    if (!shouldFollow({ playing, editing: false, now: Date.now(), lastManualScroll: lastManualScroll.current })) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(nowId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nowId, playing]);

  if (transcript.segments.length === 0) {
    return (
      <div className="empty-note">
        <b>В записи не найдено речи</b>
        <span>Если речь там есть, попробуйте «Расшифровать заново» и укажите число участников.</span>
      </div>
    );
  }
  const manualScroll = () => {
    lastManualScroll.current = Date.now();
  };
  return (
    <>
      <div className="spk" role="list" aria-label="Спикеры">
        <span aria-hidden="true">Спикеры</span>
        {transcript.speakers.map((s) => (
          <span key={s.id} className="chip" role="listitem">
            <span className={`pip ${speakerTone(s.id)}`} />
            {speakerLabel(s.id, names)}
          </span>
        ))}
      </div>
      <div
        ref={box}
        className="tx"
        role="region"
        aria-label="Текст встречи"
        onWheel={manualScroll}
        onTouchMove={manualScroll}
        onKeyDown={(e) => {
          if (SCROLL_KEYS.has(e.key)) manualScroll();
        }}
        onPointerDown={(e) => {
          // Полоса прокрутки — щелчок по самой области текста.
          if (e.target === e.currentTarget) manualScroll();
        }}
      >
        {transcript.segments.map((segment, i) => (
          <Row
            key={segment.id}
            segment={segment}
            label={speakerLabel(segment.speakerId, names)}
            now={i === nowIndex}
            onPlayAt={onPlayAt}
          />
        ))}
      </div>
    </>
  );
}
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';

/** Состояние записи из main: сначала запрос, дальше — события. */
export function useRecordingState(): RecordingState | null {
```

**на:**

```ts
import { useCallback, useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { cleanDeviceLabel } from './format';
import { nextSpeed } from './playback';

/** Состояние записи из main: сначала запрос, дальше — события. */
export function useRecordingState(): RecordingState | null {
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
/**
 * Текст встречи; перечитывается, когда меняется статус или расшифровка начинается и заканчивается (running — есть
 * ход от main). Одного статуса мало: быстрая расшифровка заново может пройти между перечитываниями списка встреч,
 * и окно увидит «готово → готово». Пока текст перечитывается, показывается прежний (старый текст виден до конца
 * расшифровки заново); пока грузится текст другой встречи, прежний не показывается.
 */
export function useTranscript(meetingId: string, status: MeetingStatus, running: boolean): TranscriptLoad {
  const [state, setState] = useState<{ meetingId: string; load: TranscriptLoad } | null>(null);
  useEffect(() => {
    let active = true;
    const done = (load: TranscriptLoad) => {
```

**на:**

```ts
/**
 * Текст встречи; перечитывается, когда меняется статус или расшифровка начинается и заканчивается (running — есть
 * ход от main). Одного статуса мало: быстрая расшифровка заново может пройти между перечитываниями списка встреч,
 * и окно увидит «готово → готово». Ещё текст перечитывается при возврате в окно — его могли заменить снаружи
 * (другой компьютер через OneDrive). Пока текст перечитывается, показывается прежний (старый текст виден до конца
 * расшифровки заново); пока грузится текст другой встречи, прежний не показывается. set — показать текст, который
 * вернула правка, не перечитывая файл.
 */
export function useTranscript(
  meetingId: string,
  status: MeetingStatus,
  running: boolean,
): [TranscriptLoad, (transcript: Transcript) => void] {
  const [state, setState] = useState<{ meetingId: string; load: TranscriptLoad } | null>(null);
  const [focusCount, setFocusCount] = useState(0);
  useEffect(() => {
    const onFocus = () => setFocusCount((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const set = useCallback(
    (transcript: Transcript) => setState({ meetingId, load: { kind: 'ready', transcript } }),
    [meetingId],
  );
  useEffect(() => {
    let active = true;
    const done = (load: TranscriptLoad) => {
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
    return () => {
      active = false;
    };
  }, [meetingId, status, running]);
  return state?.meetingId === meetingId ? state.load : { kind: 'loading' };
}
```

**на:**

```ts
    return () => {
      active = false;
    };
  }, [meetingId, status, running, focusCount]);
  return [state?.meetingId === meetingId ? state.load : { kind: 'loading' }, set];
}

/** Плеер встречи: элемент <audio> — у Player, управление — у всей встречи (щелчок по времени реплики). */
export interface Playback {
  ref: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  /** Место в записи, секунды. */
  position: number;
  duration: number | null;
  speed: number;
  failed: boolean;
  toggle(): void;
  seek(seconds: number): void;
  /** Слушать с этого места. */
  seekAndPlay(seconds: number): void;
  nextSpeed(): void;
  /** Остановить и отпустить файл записи (перед «Удалить аудио»: иначе Windows не даст перенести папку). */
  release(): void;
  /** Обработчики событий <audio>. */
  events: {
    onPlay(): void;
    onPause(): void;
    onEnded(): void;
    onTimeUpdate(event: SyntheticEvent<HTMLAudioElement>): void;
    onLoadedMetadata(event: SyntheticEvent<HTMLAudioElement>): void;
    onError(): void;
  };
}

export function usePlayback(meetingId: string, fallbackDuration: number | null): Playback {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(fallbackDuration);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  // Другая встреча — плеер с нуля.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(fallbackDuration);
    setFailed(false);
  }, [meetingId, fallbackDuration]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  const play = useCallback((el: HTMLAudioElement) => {
    void el.play().catch(() => setFailed(true));
  }, []);
  // Постоянная функция: её получает каждая реплика, и новая функция перерисовывала бы весь текст при игре.
  const seekAndPlay = useCallback(
    (seconds: number) => {
      const el = ref.current;
      if (!el) return;
      el.currentTime = seconds;
      setPosition(seconds);
      if (el.paused) play(el);
    },
    [play],
  );

  return {
    ref,
    playing,
    position,
    duration,
    speed,
    failed,
    toggle: () => {
      const el = ref.current;
      if (!el) return;
      if (el.paused) play(el);
      else el.pause();
    },
    seek: (seconds) => {
      const el = ref.current;
      if (el) el.currentTime = seconds;
      setPosition(seconds);
    },
    seekAndPlay,
    nextSpeed: () => setSpeed((s) => nextSpeed(s)),
    release: () => {
      const el = ref.current;
      if (!el) return;
      el.pause();
      el.removeAttribute('src');
      el.load();
    },
    events: {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onTimeUpdate: (event) => setPosition(event.currentTarget.currentTime),
      onLoadedMetadata: (event) => {
        if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        event.currentTarget.playbackRate = speed;
      },
      onError: () => setFailed(true),
    },
  };
}
```

**Создать `src/renderer/main/playback.ts`:**

```ts
// Прослушивание встречи и текст: какая реплика звучит, когда текст идёт за звуком. Чистые функции.

export const SPEEDS = [1, 1.5, 2] as const;

export const speedLabel = (speed: number): string => `${String(speed).replace('.', ',')}×`;

export const nextSpeed = (speed: number): number =>
  SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1;

/**
 * Звучащая реплика — последняя, чьё начало не позже места записи; до первой реплики — -1.
 * starts — начала реплик по возрастанию (так их пишет расшифровка и правки).
 */
export function segmentAt(starts: readonly number[], position: number): number {
  let low = 0;
  let high = starts.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((starts[middle] ?? Infinity) <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Человек сам листал текст недавно — за звуком его не прокручиваем, чтобы не вырывать из рук. */
export const MANUAL_SCROLL_PAUSE_MS = 5000;

export function shouldFollow(state: { playing: boolean; editing: boolean; now: number; lastManualScroll: number }): boolean {
  return state.playing && !state.editing && state.now - state.lastManualScroll >= MANUAL_SCROLL_PAUSE_MS;
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
  font-variant-numeric: tabular-nums;
}

.who {
  font-size: 12.5px;
  font-weight: 600;
```

**на:**

```css
  font-variant-numeric: tabular-nums;
}

/* Время реплики — кнопка «Слушать с …»; при наведении — значок ▶. */
.tbtn {
  display: inline-flex;
  align-items: flex-start;
  gap: 4px;
  align-self: start;
  background: none;
  border: 0;
  padding: 2px 0 0;
  text-align: left;
  cursor: pointer;
}

.tbtn .ic {
  width: 9px;
  height: 9px;
  margin-top: 3px;
  opacity: 0;
}

.tbtn:hover,
.tbtn:focus-visible {
  color: var(--accent);
}

.tbtn:hover .ic,
.tbtn:focus-visible .ic {
  opacity: 1;
}

/* Звучащая реплика — «маркер», как на листе 9 макета. */
.row.now {
  background: var(--now);
}

.row.now .tbtn {
  color: var(--text);
}

.who {
  font-size: 12.5px;
  font-weight: 600;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  791 passed (791)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `30 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: play a meeting from the time of a segment and mark the playing segment"
```

### Task 9: Правка текста реплики, удаление с «Вернуть», название встречи

**Files:**
- Create: `src/renderer/main/MeetingTitle.tsx`, `src/renderer/main/SegmentText.tsx`
- Modify: `e2e/library.spec.ts`, `e2e/transcription.spec.ts`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/TranscriptView.tsx`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`

`SegmentText` — текст реплики (`role="button"`, выделение мышью правку не начинает) и поле правки того же
шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc — отмена, уход из поля — сохранить. Пустой текст удаляет
реплику — внизу «Реплика 0:04 удалена · Вернуть» на 10 с. Пока встреча ждёт расшифровки заново или расшифровывается,
текст не правится. `MeetingTitle` — название-кнопка, поле на его месте; пустое название не сохраняется. Название стало
кнопкой — в `e2e/transcription.spec.ts` строку списка встреч ищут внутри навигации «Встречи».

- [ ] **Step 1: Тесты**

**В `e2e/library.spec.ts` заменить:**

```ts
// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { expect, test, type Page } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });
```

**на:**

```ts
// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, meetingJson, pollMeetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });
```

**В `e2e/library.spec.ts` заменить:**

```ts
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

const audioState = (page: Page) =>
  page.evaluate(() => {
    const audio = document.querySelector('audio');
```

**на:**

```ts
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/** Для expect.poll: transcript.json могут как раз перезаписывать — тогда undefined, и опрос повторится. */
const pollTranscript = (libraryDir: string): Promise<{ editedAt?: string; segments: Record<string, unknown>[] } | undefined> =>
  readFile(join(libraryDir, ID, 'transcript.json'), 'utf8')
    .then((text) => JSON.parse(text) as { segments: Record<string, unknown>[] })
    .catch(() => undefined);

const audioState = (page: Page) =>
  page.evaluate(() => {
    const audio = document.querySelector('audio');
```

**В `e2e/library.spec.ts` заменить:**

```ts
  await expect(text).toContainText('0:04');
  await expect(text.getByRole('button', { name: /Слушать с/ })).toHaveCount(0);
});
```

**на:**

```ts
  await expect(text).toContainText('0:04');
  await expect(text.getByRole('button', { name: /Слушать с/ })).toHaveCount(0);
});

test('a click on the text edits the segment: Enter saves, Escape cancels', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');

  await text.getByRole('button', { name: 'С подрядчиками или без?' }).click();
  const field = text.getByRole('textbox', { name: 'Текст реплики' });
  await field.fill('Это с учётом подрядчиков?');
  await field.press('Enter');
  await expect(field).toBeHidden();
  await expect(text.getByRole('button', { name: 'Это с учётом подрядчиков?' })).toBeVisible();
  await expect
    .poll(async () => (await pollTranscript(libraryDir))?.segments[1])
    .toMatchObject({ text: 'Это с учётом подрядчиков?', edited: true });

  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await field.fill('Что-то другое');
  await field.press('Escape');
  await expect(text.getByRole('button', { name: 'Без подрядчиков.' })).toBeVisible();
  expect((await pollTranscript(libraryDir))?.segments[2]).toMatchObject({ text: 'Без подрядчиков.', edited: false });
});

test('an emptied segment is deleted and «Вернуть» brings it back', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');

  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await text.getByRole('textbox', { name: 'Текст реплики' }).fill('');
  await text.getByRole('textbox', { name: 'Текст реплики' }).press('Enter');
  await expect(text.locator('.row')).toHaveCount(2);
  // Спикер 2 остался без реплик — из строки «Спикеры» он исчез.
  await expect(page.getByLabel('Спикеры')).not.toContainText('Спикер 2');
  await expect(page.getByRole('status')).toContainText('Реплика 0:04 удалена');
  await expect.poll(async () => (await pollTranscript(libraryDir))?.segments.length).toBe(2);

  await page.getByRole('button', { name: 'Вернуть' }).click();
  await expect(text.locator('.row')).toHaveCount(3);
  await expect(page.getByLabel('Спикеры')).toContainText('Спикер 2');
  await expect.poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.id)).toEqual([
    'seg-1',
    'seg-2',
    'seg-3',
  ]);
});

test('a click on the title renames the meeting', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);

  await page.getByRole('heading', { name: 'Созвон с Ириной' }).getByRole('button').click();
  const field = page.getByRole('textbox', { name: 'Название встречи' });
  await field.fill('  Бюджет на октябрь ');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Встречи' })).toContainText('Бюджет на октябрь');
  await expect.poll(async () => (await pollMeetingJson(libraryDir, ID))?.title).toBe('Бюджет на октябрь');

  // Пустое название не сохраняется.
  await page.getByRole('heading', { name: 'Бюджет на октябрь' }).getByRole('button').click();
  await field.fill('   ');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
});
```

**В `e2e/transcription.spec.ts` заменить:**

```ts

  const banner = page.getByRole('alert').filter({ hasText: 'Ошибка расшифровки' });
  await expect(banner).toContainText('ffmpeg не прочитал дорожку', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText('ошибка расшифровки');
  // Текста ещё не было — «заново» не к чему.
  await expect(page.getByRole('button', { name: 'Расшифровать', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toHaveCount(0);
```

**на:**

```ts

  const banner = page.getByRole('alert').filter({ hasText: 'Ошибка расшифровки' });
  await expect(banner).toContainText('ffmpeg не прочитал дорожку', { timeout: 20_000 });
  // В списке встреч: название встречи справа — тоже кнопка (переименовать).
  await expect(
    page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }),
  ).toContainText('ошибка расшифровки');
  // Текста ещё не было — «заново» не к чему.
  await expect(page.getByRole('button', { name: 'Расшифровать', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toHaveCount(0);
```

**В `e2e/transcription.spec.ts` заменить:**

```ts
    page.getByRole('status').filter({ hasText: /В очереди на расшифровку|Скачиваем модель GigaAM v3|Готовим звук/ }),
  ).toBeVisible();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText(/в очереди на расшифровку|скачиваем модель|расшифровка/);

  await transcription.release();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
```

**на:**

```ts
    page.getByRole('status').filter({ hasText: /В очереди на расшифровку|Скачиваем модель GigaAM v3|Готовим звук/ }),
  ).toBeVisible();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  await expect(
    page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }),
  ).toContainText(/в очереди на расшифровку|скачиваем модель|расшифровка/);

  await transcription.release();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
```

- [ ] **Step 2: Тесты падают**

Сквозные тесты новой части падают до кода (сквозные тесты не находят кнопку с текстом реплики и поле «Текст реплики») — проверяются после Step 4.

- [ ] **Step 3: Код**

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useMemo, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { Player } from './Player';
import { segmentAt } from './playback';
import { TranscribeDialog } from './TranscribeDialog';
```

**на:**

```tsx
import { useCallback, useMemo, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type Transcript } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
import { segmentAt } from './playback';
import { TranscribeDialog } from './TranscribeDialog';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  meeting,
  playback,
  canPlay,
}: {
  load: Extract<TranscriptLoad, { kind: 'ready' }>;
  meeting: Meeting;
  playback: Playback;
  canPlay: boolean;
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
```

**на:**

```tsx
  meeting,
  playback,
  canPlay,
  onEdit,
}: {
  load: Extract<TranscriptLoad, { kind: 'ready' }>;
  meeting: Meeting;
  playback: Playback;
  canPlay: boolean;
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
      nowIndex={nowIndex}
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
    />
  );
}
```

**на:**

```tsx
      nowIndex={nowIndex}
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
      onEdit={onEdit}
    />
  );
}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  progress,
  playback,
  canPlay,
  onTranscribe,
}: {
  meeting: Meeting;
```

**на:**

```tsx
  progress,
  playback,
  canPlay,
  onEdit,
  onTranscribe,
}: {
  meeting: Meeting;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  playback: Playback;
  /** Запись готова к прослушиванию. */
  canPlay: boolean;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
```

**на:**

```tsx
  playback: Playback;
  /** Запись готова к прослушиванию. */
  canPlay: boolean;
  onEdit(edit: TranscriptEdit): Promise<void>;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
    return (
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        <ReadyText load={load} meeting={meeting} playback={playback} canPlay={canPlay} />
      </>
    );
  }
```

**на:**

```tsx
    return (
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        {/* Пока встреча ждёт расшифровки заново или расшифровывается, прежний текст не правится: правки пропали бы. */}
        <ReadyText load={load} meeting={meeting} playback={playback} canPlay={canPlay} onEdit={busy ? null : onEdit} />
      </>
    );
  }
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
  const [load] = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const playback = usePlayback(meeting.id, meeting.durationSec);
  const canPlay = mixReady && !playback.failed;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
```

**на:**

```tsx
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
  const [load, setTranscript] = useTranscript(meeting.id, meeting.status, busy !== null || progress !== null);
  const edit = useCallback(
    async (change: TranscriptEdit) => {
      const result = await window.textmeet.editTranscript({ meetingId: meeting.id, edit: change });
      setTranscript(result.transcript);
    },
    [meeting.id, setTranscript],
  );
  const playback = usePlayback(meeting.id, meeting.durationSec);
  const canPlay = mixReady && !playback.failed;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <h1>{meeting.title}</h1>
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          {actions.header && (
```

**на:**

```tsx
  return (
    <main className="pane" aria-label="Встреча">
      <header className="head">
        <MeetingTitle meetingId={meeting.id} title={meeting.title} onError={onError} />
        <div className="meta">{meta.join(' · ')}</div>
        <div className="acts">
          {actions.header && (
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
        progress={progress}
        playback={playback}
        canPlay={canPlay}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
```

**на:**

```tsx
        progress={progress}
        playback={playback}
        canPlay={canPlay}
        onEdit={edit}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
```

**Создать `src/renderer/main/MeetingTitle.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { errorText } from './errors';
import { PencilIcon } from './icons';

interface Props {
  meetingId: string;
  title: string;
  onError(message: string): void;
}

/** Название встречи; щелчок — поле на его месте. Enter или уход из поля — сохранить, Esc — отмена. */
export function MeetingTitle({ meetingId, title, onError }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(title);
    field.current?.select();
    // Только при входе в правку.
  }, [editing]);

  if (!editing) {
    return (
      <h1>
        <button type="button" className="title-btn" aria-description="Переименовать встречу" onClick={() => setEditing(true)}>
          {title}
          <PencilIcon />
        </button>
      </h1>
    );
  }

  const save = async () => {
    if (done.current) return;
    done.current = true;
    const next = draft.trim();
    setEditing(false);
    // Пустое или прежнее название не сохраняем — остаётся прежнее.
    if (next === '' || next === title) return;
    try {
      await window.textmeet.renameMeeting({ meetingId, title: next });
    } catch (err) {
      onError(errorText(err));
    }
  };

  return (
    <h1>
      <input
        ref={field}
        className="title-edit"
        aria-label="Название встречи"
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            setEditing(false);
          }
        }}
      />
    </h1>
  );
}
```

**Создать `src/renderer/main/SegmentText.tsx`:**

```tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { errorText } from './errors';

interface Props {
  text: string;
  /** Можно править (не идёт расшифровка заново). */
  editable: boolean;
  editing: boolean;
  /** Щелчок по тексту: начать правку; caret — где поставить курсор. */
  onStartEditing(): void;
  onStopEditing(): void;
  /** Сохранить; пустой текст удаляет реплику. Ошибка — исключением (её покажем под полем). */
  onSave(text: string): Promise<void>;
}

/** Где в тексте щёлкнули: туда же встанет курсор в поле правки. */
function caretOffset(event: MouseEvent<HTMLElement>): number | null {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || !event.currentTarget.contains(selection.anchorNode)) return null;
  return selection.anchorOffset;
}

/**
 * Текст реплики. Щелчок — поле правки того же шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc —
 * отменить, уход из поля — сохранить. Выделение мышью (чтобы скопировать) правку не начинает.
 */
export function SegmentText({ text, editable, editing, onStartEditing, onStopEditing, onSave }: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  /** Сохранение уже идёт или правка закончена: уход из поля после Enter второй раз не сохраняет. */
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(text);
    setError(null);
    const el = field.current;
    if (!el) return;
    el.focus();
    const at = Math.min(caret.current ?? text.length, text.length);
    el.setSelectionRange(at, at);
    // Только при входе в правку: текст во время правки снаружи не меняется — правят только здесь.
  }, [editing]);

  if (!editing) {
    if (!editable) return <div className="say">{text}</div>;
    return (
      <div
        className="say editable"
        role="button"
        tabIndex={0}
        aria-description="Щёлкните, чтобы исправить текст"
        onClick={(e) => {
          // Человек выделил кусок, чтобы скопировать, — это не просьба править.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          caret.current = caretOffset(e);
          onStartEditing();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          caret.current = null;
          onStartEditing();
        }}
      >
        {text}
      </div>
    );
  }

  const save = async () => {
    if (done.current) return;
    done.current = true;
    if (draft.trim() === text) {
      onStopEditing();
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      onStopEditing();
    } catch (err) {
      done.current = false;
      setError(errorText(err));
      setSaving(false);
      field.current?.focus();
    }
  };

  return (
    <div>
      <textarea
        ref={field}
        className="say-edit"
        aria-label="Текст реплики"
        value={draft}
        maxLength={20_000}
        readOnly={saving}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            onStopEditing();
          }
        }}
      />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : (
        <div className="edit-hint">Enter — сохранить · Esc — отменить · Shift+Enter — новая строка</div>
      )}
    </div>
  );
}
```

**Заменить всё содержимое `src/renderer/main/TranscriptView.tsx` на:**

```tsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { speakerLabel, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
import { PlayIcon } from './icons';
import { shouldFollow } from './playback';
import { SegmentText } from './SegmentText';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
  /** Имена спикеров из meeting.json. */
  names: Readonly<Record<string, string>>;
  /** Звучащая реплика (номер) — подсвечена; -1 — никакая. */
  nowIndex: number;
  /** Запись играет — текст идёт за звуком. */
  playing: boolean;
  /** Слушать с начала реплики; null — запись недоступна (готовится, не свелась, удалена). */
  onPlayAt: ((seconds: number) => void) | null;
  /** Сохранить правку; null — текст сейчас не правится (идёт расшифровка заново). */
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
}

/** Сколько висит «Реплика удалена · Вернуть». */
const UNDO_MS = 10_000;

/** Клавиши, которыми человек листает текст сам. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface RowProps {
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
  setEditing: ((segmentId: string | null) => void) | null;
  onSaveText(segment: TranscriptSegment, text: string): Promise<void>;
}

/**
 * Реплика: время (щелчок — слушать с этого места), спикер, текст (щелчок — править). memo: при игре и правке
 * перерисовываются только затронутые реплики — поэтому все обработчики постоянные.
 */
const Row = memo(function Row({ segment, label, now, onPlayAt, editing, setEditing, onSaveText }: RowProps) {
  const time = formatTimestamp(segment.start);
  return (
    <div className={now ? 'row now' : 'row'} data-segment={segment.id} aria-current={now ? 'true' : undefined}>
      {onPlayAt ? (
        <button type="button" className="t tbtn" aria-label={`Слушать с ${time}`} onClick={() => onPlayAt(segment.start)}>
          <PlayIcon />
          {time}
        </button>
      ) : (
        <span className="t">{time}</span>
      )}
      <div>
        <div className={`who ${speakerTone(segment.speakerId)}`}>{label}</div>
        <SegmentText
          text={segment.text}
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
          onStopEditing={() => setEditing?.(null)}
          onSave={(text) => onSaveText(segment, text)}
        />
      </div>
    </div>
  );
});

/** Текст встречи, как на листах 1 и 9 макета: спикеры сверху, реплики «время · кто · что». */
export function TranscriptView({ transcript, names, nowIndex, playing, onPlayAt, onEdit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Удалённая реплика, которую ещё можно вернуть. */
  const [removed, setRemoved] = useState<TranscriptSegment | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
  useEffect(() => {
    if (nowId === null) return;
    if (!shouldFollow({ playing, editing, now: Date.now(), lastManualScroll: lastManualScroll.current })) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(nowId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nowId, playing, editing]);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  // Правка стала невозможна (началась расшифровка заново) — поле правки закрывается.
  useEffect(() => {
    if (!onEdit) setEditingId(null);
  }, [onEdit]);

  const saveText = useCallback(
    async (segment: TranscriptSegment, text: string) => {
      if (!onEdit) return;
      await onEdit({ kind: 'text', segmentId: segment.id, text });
      if (text.trim() === '') {
        setUndoError(null);
        setRemoved(segment);
      }
    },
    [onEdit],
  );

  const restore = async () => {
    if (!removed || !onEdit) return;
    try {
      await onEdit({ kind: 'restore', segment: removed });
      setRemoved(null);
    } catch (err) {
      setUndoError(errorText(err));
    }
  };

  if (transcript.segments.length === 0 && !removed) {
    return (
      <div className="empty-note">
        <b>В записи не найдено речи</b>
        <span>Если речь там есть, попробуйте «Расшифровать заново» и укажите число участников.</span>
      </div>
    );
  }
  const manualScroll = () => {
    lastManualScroll.current = Date.now();
  };
  return (
    <>
      <div className="spk" role="list" aria-label="Спикеры">
        <span aria-hidden="true">Спикеры</span>
        {transcript.speakers.map((s) => (
          <span key={s.id} className="chip" role="listitem">
            <span className={`pip ${speakerTone(s.id)}`} />
            {speakerLabel(s.id, names)}
          </span>
        ))}
      </div>
      <div
        ref={box}
        className="tx"
        role="region"
        aria-label="Текст встречи"
        onWheel={manualScroll}
        onTouchMove={manualScroll}
        onKeyDown={(e) => {
          if (SCROLL_KEYS.has(e.key)) manualScroll();
        }}
        onPointerDown={(e) => {
          // Полоса прокрутки — щелчок по самой области текста.
          if (e.target === e.currentTarget) manualScroll();
        }}
      >
        {transcript.segments.map((segment, i) => (
          <Row
            key={segment.id}
            segment={segment}
            label={speakerLabel(segment.speakerId, names)}
            now={i === nowIndex}
            onPlayAt={onPlayAt}
            editing={segment.id === editingId}
            setEditing={onEdit ? setEditingId : null}
            onSaveText={saveText}
          />
        ))}
        {removed && (
          <div className="undo" role="status">
            Реплика {formatTimestamp(removed.start)} удалена
            <button type="button" className="lnk" onClick={() => void restore()}>
              Вернуть
            </button>
            {undoError && <span className="undo-err">{undoError}</span>}
          </div>
        )}
      </div>
    </>
  );
}
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
```

**на:**

```tsx
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
```

**В `src/renderer/main/styles.css` заменить:**

```css
  font-size: 16.5px;
  line-height: 1.55;
  user-select: text;
}

/* ---- Ход расшифровки ---- */
```

**на:**

```css
  font-size: 16.5px;
  line-height: 1.55;
  user-select: text;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Щелчок по тексту — правка (лист 9 макета). */
.say.editable {
  cursor: text;
  border-radius: 4px;
  margin: -2px -6px;
  padding: 2px 6px;
}

.say.editable:hover {
  background: color-mix(in srgb, var(--sel) 45%, transparent);
}

.say.editable:focus-visible {
  outline: 2px solid var(--accent);
}

.say-edit {
  display: block;
  width: calc(100% + 22px);
  margin: -7px -11px 0;
  border: 1px solid var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  border-radius: var(--r);
  background: var(--surface);
  padding: 6px 10px;
  font-family: var(--f-text);
  font-size: 16.5px;
  line-height: 1.55;
  resize: none;
  outline: none;
  field-sizing: content;
  min-height: 2.6em;
}

.edit-hint {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 6px;
}

/* «Реплика удалена · Вернуть» — внизу текста, пока её можно вернуть. */
.undo {
  position: sticky;
  bottom: 0;
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
  padding: 9px 14px;
  background: var(--btn);
  color: var(--btn-text);
  border-radius: var(--r);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.undo .lnk {
  color: var(--btn-text);
  text-decoration: underline;
  font-weight: 600;
}

.undo-err {
  color: var(--rec-soft);
}

/* Название встречи: щелчок — переименовать. */
.title-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: text;
  overflow-wrap: anywhere;
}

.title-btn .ic {
  width: 17px;
  height: 17px;
  flex: none;
  color: var(--muted);
  opacity: 0.6;
}

.title-btn:hover .ic,
.title-btn:focus-visible .ic {
  opacity: 1;
}

.title-edit {
  width: 100%;
  font: inherit;
  letter-spacing: inherit;
  border: 1px solid var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  border-radius: var(--r);
  background: var(--surface);
  padding: 0 8px;
  margin: 0 -9px;
  outline: none;
}

/* ---- Ход расшифровки ---- */
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  791 passed (791)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `33 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: edit the text of a segment, delete it with undo, rename the meeting"
```

### Task 10: Спикеры: переименование, объединение, смена у реплики

**Files:**
- Create: `src/renderer/main/ConfirmDialog.tsx`, `src/renderer/main/SpeakerChips.tsx`, `src/renderer/main/SpeakerMenu.tsx`
- Modify: `e2e/library.spec.ts`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/TranscriptView.tsx`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`

`SpeakerChips`: щелчок по чипу — поле имени; имя, совпавшее с подписью другого спикера, — окно «Объединить …?»
(`ConfirmDialog`, рисуется через портал поверх всего окна). Безымянный собеседник — чип пунктиром с карандашом.
`SpeakerMenu`: щелчок по имени над репликой — «Кто говорит в этой реплике?» со всеми спикерами и «Новый собеседник».
Реплика с открытым меню получает `menu-open` — без `content-visibility`, иначе меню обрезается.

- [ ] **Step 1: Тесты**

**В `e2e/library.spec.ts` заменить:**

```ts
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
});
```

**на:**

```ts
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
});

test('a speaker is renamed in the whole meeting, and the same name merges two speakers', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const speakers = page.getByLabel('Спикеры');
  const text = page.getByLabel('Текст встречи');

  await speakers.getByRole('button', { name: 'Спикер 1' }).click();
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).fill('Ирина');
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).press('Enter');
  await expect(speakers.getByRole('button', { name: 'Ирина' })).toBeVisible();
  await expect(text.locator('.row').first()).toContainText('Ирина');
  await expect.poll(async () => (await pollMeetingJson(libraryDir, ID))?.speakerNames).toEqual({ s1: 'Ирина' });

  await speakers.getByRole('button', { name: 'Спикер 2' }).click();
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).fill('ирина');
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Объединить «Спикер 2» и «Ирина»?' });
  await dialog.getByRole('button', { name: 'Объединить' }).click();
  await expect(dialog).toBeHidden();
  await expect(speakers.getByRole('listitem')).toHaveText(['Я', 'Ирина']);
  await expect(text.locator('.row').nth(2)).toContainText('Ирина');
  await expect
    .poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.speakerId))
    .toEqual(['s1', 'me', 's1']);
});

test('the speaker of one segment is changed from the menu, also to a new speaker', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const rows = page.getByLabel('Текст встречи').locator('.row');

  await rows.nth(1).getByRole('button', { name: 'Я', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Кто говорит в этой реплике' });
  await expect(menu.getByRole('menuitemradio', { name: 'Я' })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('menuitemradio', { name: 'Спикер 2' }).click();
  await expect(menu).toBeHidden();
  await expect(rows.nth(1)).toContainText('Спикер 2');
  // У «Я» не осталось реплик — его нет в строке «Спикеры».
  await expect(page.getByLabel('Спикеры').getByRole('listitem')).toHaveText(['Спикер 1', 'Спикер 2']);

  await rows.nth(0).getByRole('button', { name: 'Спикер 1', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Новый собеседник' }).click();
  await expect(rows.nth(0)).toContainText('Спикер 3');
  await expect
    .poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.speakerId))
    .toEqual(['s3', 's2', 's2']);

  // Esc закрывает меню без изменений.
  await rows.nth(2).getByRole('button', { name: 'Спикер 2', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
```

- [ ] **Step 2: Тесты падают**

Сквозные тесты новой части падают до кода (сквозные тесты не находят поле «Имя спикера» и меню «Кто говорит в этой реплике») — проверяются после Step 4.

- [ ] **Step 3: Код**

**Создать `src/renderer/main/ConfirmDialog.tsx`:**

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { errorText } from './errors';
import { keepFocusInside } from './focus';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Ошибка — исключением: окно остаётся открытым и показывает её. */
  onConfirm(): Promise<void>;
  onCancel(): void;
}

/**
 * Окно подтверждения (объединить спикеров, удалить аудио, удалить встречу): «Отмена» / действие. Рисуется поверх
 * всего окна программы, откуда бы его ни открыли.
 */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Окно закрылось — фокус возвращается туда, откуда его открыли.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>('.btn.pri')?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="note body">{children}</p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type Transcript } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
```

**на:**

```tsx
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  playback,
  canPlay,
  onEdit,
}: {
  load: Extract<TranscriptLoad, { kind: 'ready' }>;
  meeting: Meeting;
  playback: Playback;
  canPlay: boolean;
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
  // До первого «Слушать» ничего не подсвечено.
  const nowIndex = canPlay && (playback.playing || playback.position > 0) ? segmentAt(starts, playback.position) : -1;
  return (
```

**на:**

```tsx
  playback,
  canPlay,
  onEdit,
  onError,
}: {
  load: Extract<TranscriptLoad, { kind: 'ready' }>;
  meeting: Meeting;
  playback: Playback;
  canPlay: boolean;
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
  onError(message: string): void;
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
  const renameSpeaker = useCallback(
    async (speakerId: SpeakerId, name: string | null) => {
      await window.textmeet.renameSpeaker({ meetingId: meeting.id, speakerId, name });
    },
    [meeting.id],
  );
  // До первого «Слушать» ничего не подсвечено.
  const nowIndex = canPlay && (playback.playing || playback.position > 0) ? segmentAt(starts, playback.position) : -1;
  return (
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
      onEdit={onEdit}
    />
  );
}
```

**на:**

```tsx
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
      onEdit={onEdit}
      onRenameSpeaker={renameSpeaker}
      onError={onError}
    />
  );
}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  playback,
  canPlay,
  onEdit,
  onTranscribe,
}: {
  meeting: Meeting;
```

**на:**

```tsx
  playback,
  canPlay,
  onEdit,
  onError,
  onTranscribe,
}: {
  meeting: Meeting;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  /** Запись готова к прослушиванию. */
  canPlay: boolean;
  onEdit(edit: TranscriptEdit): Promise<void>;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
```

**на:**

```tsx
  /** Запись готова к прослушиванию. */
  canPlay: boolean;
  onEdit(edit: TranscriptEdit): Promise<void>;
  onError(message: string): void;
  /** Кнопка «Расшифровать» под «Текста пока нет»; null — её нет (например, она уже в заголовке). */
  onTranscribe: (() => void) | null;
}) {
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        {/* Пока встреча ждёт расшифровки заново или расшифровывается, прежний текст не правится: правки пропали бы. */}
        <ReadyText load={load} meeting={meeting} playback={playback} canPlay={canPlay} onEdit={busy ? null : onEdit} />
      </>
    );
  }
```

**на:**

```tsx
      <>
        {busy && <ProgressStrip view={progressView(busy, progress)} />}
        {/* Пока встреча ждёт расшифровки заново или расшифровывается, прежний текст не правится: правки пропали бы. */}
        <ReadyText
          load={load}
          meeting={meeting}
          playback={playback}
          canPlay={canPlay}
          onEdit={busy ? null : onEdit}
          onError={onError}
        />
      </>
    );
  }
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
        playback={playback}
        canPlay={canPlay}
        onEdit={edit}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
```

**на:**

```tsx
        playback={playback}
        canPlay={canPlay}
        onEdit={edit}
        onError={onError}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
```

**Создать `src/renderer/main/SpeakerChips.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { ME, speakerLabel, type SpeakerId, type TranscriptSpeaker } from '../../shared/transcript';
import { mergeTarget } from '../../shared/transcript-edit';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { PencilIcon } from './icons';
import { speakerTone } from './transcription-format';

interface Props {
  speakers: readonly TranscriptSpeaker[];
  names: Readonly<Record<string, string>>;
  /** null — спикеров сейчас не переименовать (идёт расшифровка заново). */
  onRename: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onMerge(from: SpeakerId, into: SpeakerId): Promise<void>;
  onError(message: string): void;
}

/** Поле имени вместо чипа: Enter или уход из поля — сохранить, Esc — отмена. */
function NameField({
  speakerId,
  initial,
  onDone,
}: {
  speakerId: SpeakerId;
  initial: string;
  onDone(name: string | null): void;
}) {
  const [draft, setDraft] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => field.current?.select(), []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <label className={`chip edit ${speakerTone(speakerId)}`}>
      <span className="pip" />
      <input
        ref={field}
        aria-label="Имя спикера"
        placeholder={speakerLabel(speakerId)}
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => finish(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(draft);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(null);
          }
        }}
      />
    </label>
  );
}

/**
 * Строка «Спикеры»: щелчок по чипу — переименовать во всей встрече; пустое имя вернёт «Спикер N» / «Я». Имя,
 * которое уже есть у другого спикера, — просьба объединить их (окно подтверждения, лист 11 макета).
 */
export function SpeakerChips({ speakers, names, onRename, onMerge, onError }: Props) {
  const [editing, setEditing] = useState<SpeakerId | null>(null);
  const [merge, setMerge] = useState<{ from: SpeakerId; into: SpeakerId } | null>(null);

  const finish = async (speakerId: SpeakerId, name: string | null) => {
    setEditing(null);
    // Esc — без изменений.
    if (name === null || !onRename) return;
    const next = name.trim();
    if (next === (names[speakerId] ?? '')) return;
    const into = mergeTarget(speakers, names, speakerId, next);
    if (into) {
      setMerge({ from: speakerId, into });
      return;
    }
    try {
      await onRename(speakerId, next === '' ? null : next);
    } catch (err) {
      onError(errorText(err));
    }
  };

  return (
    <>
      <div className="spk" role="list" aria-label="Спикеры">
        <span aria-hidden="true">Спикеры</span>
        {speakers.map((s) => {
          const label = speakerLabel(s.id, names);
          if (editing === s.id) {
            return (
              <span key={s.id} role="listitem">
                <NameField speakerId={s.id} initial={names[s.id] ?? ''} onDone={(name) => void finish(s.id, name)} />
              </span>
            );
          }
          // Безымянный собеседник — пунктиром и с карандашом: его стоит назвать.
          const unnamed = s.id !== ME && names[s.id] === undefined;
          return (
            <span key={s.id} role="listitem">
              {onRename ? (
                <button
                  type="button"
                  className={unnamed ? 'chip un' : 'chip'}
                  aria-description="Переименовать во всей встрече"
                  onClick={() => setEditing(s.id)}
                >
                  <span className={`pip ${speakerTone(s.id)}`} />
                  {label}
                  {unnamed && <PencilIcon />}
                </button>
              ) : (
                <span className="chip">
                  <span className={`pip ${speakerTone(s.id)}`} />
                  {label}
                </span>
              )}
            </span>
          );
        })}
      </div>
      {merge && (
        <ConfirmDialog
          title={`Объединить «${speakerLabel(merge.from, names)}» и «${speakerLabel(merge.into, names)}»?`}
          confirmLabel="Объединить"
          onCancel={() => setMerge(null)}
          onConfirm={async () => {
            await onMerge(merge.from, merge.into);
            setMerge(null);
          }}
        >
          Похоже, это один человек. Все реплики «{speakerLabel(merge.from, names)}» станут репликами «
          {speakerLabel(merge.into, names)}», и в списке останется один спикер.
        </ConfirmDialog>
      )}
    </>
  );
}
```

**Создать `src/renderer/main/SpeakerMenu.tsx`:**

```tsx
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SpeakerId } from '../../shared/transcript';
import { PlusIcon } from './icons';
import { speakerTone } from './transcription-format';

export interface SpeakerOption {
  id: SpeakerId;
  label: string;
}

interface Props {
  options: readonly SpeakerOption[];
  current: SpeakerId;
  onPick(speakerId: SpeakerId | 'new'): void;
  onClose(): void;
}

/** «Кто говорит в этой реплике?» — меню под именем спикера (лист 11 макета). Стрелки, Enter, Esc. */
export function SpeakerMenu({ options, current, onPick, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    // Щелчок мимо меню закрывает его.
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div ref={menu} className="menu" role="menu" aria-label="Кто говорит в этой реплике" onKeyDown={move}>
      <div className="mhead" aria-hidden="true">
        Кто говорит в этой реплике?
      </div>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="mi"
          role="menuitemradio"
          aria-checked={option.id === current}
          onClick={() => onPick(option.id)}
        >
          <span className={`pip ${speakerTone(option.id)}`} />
          <span className="mi-label">{option.label}</span>
          {option.id === current && <span aria-hidden="true">✓</span>}
        </button>
      ))}
      <div className="sep" role="separator" />
      <button type="button" className="mi" role="menuitem" onClick={() => onPick('new')}>
        <PlusIcon />
        <span className="mi-label">Новый собеседник</span>
      </button>
    </div>
  );
}
```

**Заменить всё содержимое `src/renderer/main/TranscriptView.tsx` на:**

```tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { speakerLabel, type SpeakerId, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
import { ChevronIcon, PlayIcon } from './icons';
import { shouldFollow } from './playback';
import { SegmentText } from './SegmentText';
import { SpeakerChips } from './SpeakerChips';
import { SpeakerMenu, type SpeakerOption } from './SpeakerMenu';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
  /** Имена спикеров из meeting.json. */
  names: Readonly<Record<string, string>>;
  /** Звучащая реплика (номер) — подсвечена; -1 — никакая. */
  nowIndex: number;
  /** Запись играет — текст идёт за звуком. */
  playing: boolean;
  /** Слушать с начала реплики; null — запись недоступна (готовится, не свелась, удалена). */
  onPlayAt: ((seconds: number) => void) | null;
  /** Сохранить правку; null — текст сейчас не правится (идёт расшифровка заново). */
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
  /** Переименовать спикера во всей встрече; null — сейчас нельзя. */
  onRenameSpeaker: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onError(message: string): void;
}

/** Сколько висит «Реплика удалена · Вернуть». */
const UNDO_MS = 10_000;

/** Клавиши, которыми человек листает текст сам. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface RowProps {
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
  setEditing: ((segmentId: string | null) => void) | null;
  onSaveText(segment: TranscriptSegment, text: string): Promise<void>;
  /** Спикеры встречи для меню «Кто говорит». */
  speakers: readonly SpeakerOption[];
  menuOpen: boolean;
  setMenuFor(segmentId: string | null): void;
  onPickSpeaker(segment: TranscriptSegment, speakerId: SpeakerId | 'new'): void;
}

/**
 * Реплика: время (щелчок — слушать с этого места), спикер, текст (щелчок — править). memo: при игре и правке
 * перерисовываются только затронутые реплики — поэтому все обработчики постоянные.
 */
const Row = memo(function Row({
  segment,
  label,
  now,
  onPlayAt,
  editing,
  setEditing,
  onSaveText,
  speakers,
  menuOpen,
  setMenuFor,
  onPickSpeaker,
}: RowProps) {
  const time = formatTimestamp(segment.start);
  const tone = speakerTone(segment.speakerId);
  return (
    <div
      className={['row', now && 'now', menuOpen && 'menu-open'].filter(Boolean).join(' ')}
      data-segment={segment.id}
      aria-current={now ? 'true' : undefined}
    >
      {onPlayAt ? (
        <button
          type="button"
          className="t tbtn"
          aria-label={`Слушать с ${time}`}
          onClick={() => onPlayAt(segment.start)}
        >
          <PlayIcon />
          {time}
        </button>
      ) : (
        <span className="t">{time}</span>
      )}
      <div>
        {setEditing ? (
          <div className="who-wrap">
            <button
              type="button"
              className={`who whob ${tone}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-description="Сменить спикера этой реплики"
              onClick={() => setMenuFor(menuOpen ? null : segment.id)}
            >
              {label}
              <ChevronIcon />
            </button>
            {menuOpen && (
              <SpeakerMenu
                options={speakers}
                current={segment.speakerId}
                onClose={() => setMenuFor(null)}
                onPick={(speakerId) => {
                  setMenuFor(null);
                  onPickSpeaker(segment, speakerId);
                }}
              />
            )}
          </div>
        ) : (
          <div className={`who ${tone}`}>{label}</div>
        )}
        <SegmentText
          text={segment.text}
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
          onStopEditing={() => setEditing?.(null)}
          onSave={(text) => onSaveText(segment, text)}
        />
      </div>
    </div>
  );
});

/** Текст встречи, как на листах 1 и 9 макета: спикеры сверху, реплики «время · кто · что». */
export function TranscriptView({
  transcript,
  names,
  nowIndex,
  playing,
  onPlayAt,
  onEdit,
  onRenameSpeaker,
  onError,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Удалённая реплика, которую ещё можно вернуть. */
  const [removed, setRemoved] = useState<TranscriptSegment | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  /** Реплика, у которой открыто меню «Кто говорит». */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const speakers = useMemo(
    () => transcript.speakers.map((s) => ({ id: s.id, label: speakerLabel(s.id, names) })),
    [transcript.speakers, names],
  );
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
  useEffect(() => {
    if (nowId === null) return;
    if (!shouldFollow({ playing, editing, now: Date.now(), lastManualScroll: lastManualScroll.current })) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(nowId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nowId, playing, editing]);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  // Правка стала невозможна (началась расшифровка заново) — поле правки и меню закрываются.
  useEffect(() => {
    if (onEdit) return;
    setEditingId(null);
    setMenuFor(null);
  }, [onEdit]);

  const pickSpeaker = useCallback(
    (segment: TranscriptSegment, speakerId: SpeakerId | 'new') => {
      if (!onEdit || speakerId === segment.speakerId) return;
      onEdit({ kind: 'speaker', segmentId: segment.id, speakerId }).catch((err: unknown) => onError(errorText(err)));
    },
    [onEdit, onError],
  );

  const mergeSpeakers = async (from: SpeakerId, into: SpeakerId) => {
    if (onEdit) await onEdit({ kind: 'merge', from, into });
  };

  const saveText = useCallback(
    async (segment: TranscriptSegment, text: string) => {
      if (!onEdit) return;
      await onEdit({ kind: 'text', segmentId: segment.id, text });
      if (text.trim() === '') {
        setUndoError(null);
        setRemoved(segment);
      }
    },
    [onEdit],
  );

  const restore = async () => {
    if (!removed || !onEdit) return;
    try {
      await onEdit({ kind: 'restore', segment: removed });
      setRemoved(null);
    } catch (err) {
      setUndoError(errorText(err));
    }
  };

  if (transcript.segments.length === 0 && !removed) {
    return (
      <div className="empty-note">
        <b>В записи не найдено речи</b>
        <span>Если речь там есть, попробуйте «Расшифровать заново» и укажите число участников.</span>
      </div>
    );
  }
  const manualScroll = () => {
    lastManualScroll.current = Date.now();
  };
  return (
    <>
      <SpeakerChips
        speakers={transcript.speakers}
        names={names}
        onRename={onEdit ? onRenameSpeaker : null}
        onMerge={mergeSpeakers}
        onError={onError}
      />
      <div
        ref={box}
        className="tx"
        role="region"
        aria-label="Текст встречи"
        onWheel={manualScroll}
        onTouchMove={manualScroll}
        onKeyDown={(e) => {
          if (SCROLL_KEYS.has(e.key)) manualScroll();
        }}
        onPointerDown={(e) => {
          // Полоса прокрутки — щелчок по самой области текста.
          if (e.target === e.currentTarget) manualScroll();
        }}
      >
        {transcript.segments.map((segment, i) => (
          <Row
            key={segment.id}
            segment={segment}
            label={speakerLabel(segment.speakerId, names)}
            now={i === nowIndex}
            onPlayAt={onPlayAt}
            editing={segment.id === editingId}
            setEditing={onEdit ? setEditingId : null}
            onSaveText={saveText}
            speakers={speakers}
            menuOpen={segment.id === menuFor}
            setMenuFor={setMenuFor}
            onPickSpeaker={pickSpeaker}
          />
        ))}
        {removed && (
          <div className="undo" role="status">
            Реплика {formatTimestamp(removed.start)} удалена
            <button type="button" className="lnk" onClick={() => void restore()}>
              Вернуть
            </button>
            {undoError && <span className="undo-err">{undoError}</span>}
          </div>
        )}
      </div>
    </>
  );
}
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
```

**на:**

```tsx
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
```

**В `src/renderer/main/styles.css` заменить:**

```css
  font-size: 12.5px;
}

.pip {
  width: 8px;
  height: 8px;
```

**на:**

```css
  font-size: 12.5px;
}

button.chip {
  cursor: pointer;
}

button.chip:hover {
  border-color: var(--muted);
}

/* Безымянный собеседник — пунктиром: его стоит назвать. */
.chip.un {
  border-style: dashed;
}

.chip .ic {
  width: 13px;
  height: 13px;
  color: var(--muted);
}

.chip.edit {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  padding-right: 4px;
}

.chip.edit input {
  border: 0;
  background: transparent;
  color: var(--text);
  width: 110px;
  outline: none;
}

.chip.edit input::placeholder {
  color: var(--muted);
}

.pip {
  width: 8px;
  height: 8px;
```

**В `src/renderer/main/styles.css` заменить:**

```css
  opacity: 1;
}

/* Звучащая реплика — «маркер», как на листе 9 макета. */
.row.now {
  background: var(--now);
```

**на:**

```css
  opacity: 1;
}

/* Реплика с открытым меню «Кто говорит»: без экономии отрисовки (она обрезает всё, что выходит за реплику) и
   поверх следующих реплик. */
.row.menu-open {
  content-visibility: visible;
  position: relative;
  z-index: 3;
}

/* Звучащая реплика — «маркер», как на листе 9 макета. */
.row.now {
  background: var(--now);
```

**В `src/renderer/main/styles.css` заменить:**

```css
  color: var(--text);
}

.who {
  font-size: 12.5px;
  font-weight: 600;
```

**на:**

```css
  color: var(--text);
}

/* Имя над репликой — кнопка меню «Кто говорит в этой реплике?». */
.who-wrap {
  position: relative;
}

.whob {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.whob .ic {
  width: 12px;
  height: 12px;
  opacity: 0;
}

.whob:hover .ic,
.whob:focus-visible .ic,
.whob[aria-expanded='true'] .ic {
  opacity: 0.8;
}

.menu {
  position: absolute;
  z-index: 4;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 260px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.mhead {
  padding: 6px 10px 4px;
  color: var(--muted);
  font-size: 12px;
}

.mi {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.mi:hover,
.mi:focus-visible {
  background: var(--sel);
  outline: none;
}

.mi[aria-checked='true'] {
  font-weight: 600;
}

.mi-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mi .ic {
  width: 15px;
  height: 15px;
  color: var(--muted);
}

.mi.danger {
  color: var(--rec);
}

.sep {
  height: 1px;
  background: var(--line);
  margin: 5px 4px;
}

.dlg .note.body {
  font-size: 13.5px;
  color: var(--text);
}

.who {
  font-size: 12.5px;
  font-weight: 600;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  791 passed (791)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `35 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rename speakers, merge them by name, change the speaker of a segment"
```

### Task 11: Меню «…»: папка встречи, удаление аудио и встречи

**Files:**
- Create: `src/renderer/main/MeetingMenu.tsx`
- Modify: `e2e/helpers.ts`, `e2e/library.spec.ts`, `src/renderer/main/App.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/TranscribeDialog.tsx`, `src/renderer/main/format.test.ts`, `src/renderer/main/format.ts`, `src/renderer/main/hooks.ts`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`

`MeetingMenu` в заголовке встречи: «Открыть папку встречи» (кнопка из заголовка переезжает сюда), «Удалить
аудио…» (недоступно во время расшифровки и пока запись готовится), «Удалить встречу…». Перед удалением плеер отпускает
файл записи (`release`) и получает его обратно, если удалить не вышло. После удаления встречи выбирается соседняя.
Встречу «не удалось прочитать» и «создаётся» тоже можно удалить («Удалить папку…»). В строке под заголовком —
«аудио удалено». Окно «Расшифровать заново» предупреждает, что правки и имена собеседников пропадут.

- [ ] **Step 1: Тесты**

**В `e2e/helpers.ts` заменить:**

```ts
  userDataDir: string;
  homeDir: string;
  libraryDir: string;
  close(): Promise<void>;
}
```

**на:**

```ts
  userDataDir: string;
  homeDir: string;
  libraryDir: string;
  /** «Корзина» программы в тестах (TEXTMEET_TEST_TRASH): удалённое переносится сюда. */
  trashDir: string;
  close(): Promise<void>;
}
```

**В `e2e/helpers.ts` заменить:**

```ts
  const userDataDir = join(root, 'userData');
  const homeDir = join(root, 'home');
  const libraryDir = join(root, 'library');

  let app: ElectronApplication | undefined;
  let page: Page;
```

**на:**

```ts
  const userDataDir = join(root, 'userData');
  const homeDir = join(root, 'home');
  const libraryDir = join(root, 'library');
  const trashDir = join(root, 'trash');

  let app: ElectronApplication | undefined;
  let page: Page;
```

**В `e2e/helpers.ts` заменить:**

```ts
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
        TEXTMEET_TEST_DOWNLOAD_MS: String(options.downloadStepMs ?? 0),
      },
    });
    page = await mainWindow(app);
```

**на:**

```ts
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
        TEXTMEET_TEST_DOWNLOAD_MS: String(options.downloadStepMs ?? 0),
        // Удалённое — в папку теста, а не в Корзину системы (на машинах CI её может не быть).
        TEXTMEET_TEST_TRASH: trashDir,
      },
    });
    page = await mainWindow(app);
```

**В `e2e/helpers.ts` заменить:**

```ts
    userDataDir,
    homeDir,
    libraryDir,
    close: async () => {
      // Если запись ещё идёт, при выходе программа спросит системным окном — отвечаем «Остановить и выйти».
      // Тест мог уже закрыть программу сам (выход из меню) — тогда закрывать нечего.
```

**на:**

```ts
    userDataDir,
    homeDir,
    libraryDir,
    trashDir,
    close: async () => {
      // Если запись ещё идёт, при выходе программа спросит системным окном — отвечаем «Остановить и выйти».
      // Тест мог уже закрыть программу сам (выход из меню) — тогда закрывать нечего.
```

**В `e2e/library.spec.ts` заменить:**

```ts
// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, meetingJson, pollMeetingJson, type LaunchedApp } from './helpers';
```

**на:**

```ts
// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, meetingJson, pollMeetingJson, type LaunchedApp } from './helpers';
```

**В `e2e/library.spec.ts` заменить:**

```ts
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
```

**на:**

```ts
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('«Удалить аудио» moves the audio to the trash and keeps the text', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir, trashDir } = launched;
  await openMeeting(page);
  // Аудио удаляется, когда запись готова к прослушиванию.
  await expect(page.getByRole('button', { name: 'Слушать', exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Удалить аудио…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить аудио?' });
  await expect(dialog).toContainText('Запись (меньше минуты, меньше 1 МБ) переместится в Корзину.');
  await dialog.getByRole('button', { name: 'Удалить аудио' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('.meta')).toContainText('аудио удалено');
  await expect(page.getByRole('button', { name: 'Слушать', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toBeHidden();
  await expect(page.getByLabel('Текст встречи')).toContainText('Без подрядчиков.');
  expect(existsSync(join(libraryDir, ID, 'audio'))).toBe(false);
  expect(await readdir(trashDir)).toEqual(['1-audio']);
  expect(await pollMeetingJson(libraryDir, ID)).toMatchObject({ audioDeleted: true, tracks: [] });

  await page.getByRole('button', { name: 'Ещё' }).click();
  await expect(page.getByRole('menuitem', { name: 'Удалить аудио…' })).toHaveCount(0);
});

test('«Удалить встречу» moves the meeting folder to the trash and selects the next meeting', async () => {
  const OTHER = '2026-09-24_1000_d4e5f6';
  launched = await launchApp({
    meetings: [
      doneMeeting(),
      { id: OTHER, json: meetingJson(OTHER, { title: 'Планёрка', createdAt: '2026-09-24T07:00:00.000Z' }) },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page, libraryDir, trashDir } = launched;
  await openMeeting(page);

  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Удалить встречу…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить встречу «Созвон с Ириной»?' });
  await dialog.getByRole('button', { name: 'Удалить встречу' }).click();

  await expect(page.getByRole('heading', { name: 'Планёрка' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Встречи' })).not.toContainText('Созвон с Ириной');
  expect(existsSync(join(libraryDir, ID))).toBe(false);
  expect(await readdir(trashDir)).toEqual([`1-${ID}`]);
});

test('a folder that cannot be read can be deleted too', async () => {
  launched = await launchApp({ meetings: [{ id: ID, json: '{ сломано' }] });
  const { page, libraryDir } = launched;
  await page.getByRole('button', { name: /Не удалось прочитать встречу/ }).click();
  await page.getByRole('button', { name: 'Удалить папку…' }).click();
  await page.getByRole('dialog', { name: 'Удалить папку встречи?' }).getByRole('button', { name: 'Удалить папку' }).click();
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  expect(existsSync(join(libraryDir, ID))).toBe(false);
});

test('«Расшифровать заново» warns that edits and names will be lost', async () => {
  launched = await launchApp({
    meetings: [doneMeeting({ speakerNames: { s1: 'Ирина' } })],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page } = launched;
  await openMeeting(page);
  await page.getByRole('button', { name: 'Расшифровать заново' }).click();
  await expect(page.getByRole('dialog', { name: 'Расшифровать заново' })).toContainText(
    'ваши правки и имена собеседников пропадут',
  );
});
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
import {
  cleanDeviceLabel,
  dayLabel,
  formatClock,
  formatDuration,
  formatDurationWithSeconds,
```

**на:**

```ts
import {
  cleanDeviceLabel,
  dayLabel,
  deleteAudioText,
  formatClock,
  formatDuration,
  formatDurationWithSeconds,
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
    expect(launchAtLoginNoticeText('unsupported')).toContain('не поддерживается');
  });
});
```

**на:**

```ts
    expect(launchAtLoginNoticeText('unsupported')).toContain('не поддерживается');
  });
});

describe('deleteAudioText', () => {
  const tail = 'переместится в Корзину. Текст встречи останется, но слушать запись и расшифровывать её заново будет нельзя.';

  it('names the length and the size of the recording', () => {
    expect(deleteAudioText(32 * 60, 15 * 1024 * 1024)).toBe(`Запись (32 мин, 15 МБ) ${tail}`);
  });

  it('says «меньше 1 МБ» for a tiny recording', () => {
    expect(deleteAudioText(30, 200_000)).toBe(`Запись (меньше минуты, меньше 1 МБ) ${tail}`);
  });

  it('leaves out what is not known yet', () => {
    expect(deleteAudioText(null, null)).toBe(`Запись ${tail}`);
    expect(deleteAudioText(120, null)).toBe(`Запись (2 мин) ${tail}`);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/format.test.ts`
Ожидается: FAIL — сквозные тесты не находят кнопку «Ещё»; нет `deleteAudioText`.

- [ ] **Step 3: Код**

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  const selectedId = selection?.kind === 'meeting' ? selection.id : null;
  const selectedEntry = entries?.find((e) => entryId(e) === selectedId) ?? null;

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} /> : null;
```

**на:**

```tsx
  const selectedId = selection?.kind === 'meeting' ? selection.id : null;
  const selectedEntry = entries?.find((e) => entryId(e) === selectedId) ?? null;

  /** Встречу удалили — выбрать соседнюю: ниже по списку, а если её нет — выше. */
  const selectNeighbor = (id: string) => {
    const list = entries ?? [];
    const at = list.findIndex((e) => entryId(e) === id);
    const next = list[at + 1] ?? list[at - 1];
    setSelection(next && at !== -1 ? { kind: 'meeting', id: entryId(next) } : null);
  };

  let pane;
  if (selection?.kind === 'settings') {
    pane = settings ? <SettingsPane state={settings} info={info} onChange={setSettings} /> : null;
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
        entry={selectedEntry}
        progress={progress.get(entryId(selectedEntry)) ?? null}
        onError={setError}
      />
    );
  } else {
```

**на:**

```tsx
        entry={selectedEntry}
        progress={progress.get(entryId(selectedEntry)) ?? null}
        onError={setError}
        onDeleted={() => selectNeighbor(entryId(selectedEntry))}
      />
    );
  } else {
```

**Создать `src/renderer/main/MeetingMenu.tsx`:**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Meeting } from '../../shared/meeting';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { deleteAudioText } from './format';
import { FolderIcon, MoreIcon, MuteIcon, TrashIcon } from './icons';

interface Props {
  meeting: Meeting;
  /** Почему аудио сейчас не удалить (идёт расшифровка, готовится запись); null — можно. */
  audioBlocked: string | null;
  /** Перед удалением: плеер отпускает файл записи; ответ — «вернуть», если удалить не вышло. */
  releaseAudio(): () => void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
  onError(message: string): void;
}

type Confirm = 'audio' | 'meeting' | null;

/** Кнопка «…» в заголовке встречи: папка встречи, «Удалить аудио…», «Удалить встречу…» (лист 11 макета). */
export function MeetingMenu({ meeting, audioBlocked, releaseAudio, onDeleted, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [audioBytes, setAudioBytes] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (confirm !== 'audio') return;
    let active = true;
    window.textmeet
      .audioSize(meeting.id)
      .then((bytes) => {
        if (active) setAudioBytes(bytes);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [confirm, meeting.id]);

  const withReleasedAudio = async (remove: () => Promise<void>) => {
    const restore = releaseAudio();
    try {
      await remove();
    } catch (err) {
      restore();
      throw err;
    }
  };

  const pick = (next: Confirm) => {
    setOpen(false);
    setConfirm(next);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} className="more-wrap">
      <button
        type="button"
        className="btn sq-btn"
        aria-label="Ещё"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="menu right" role="menu" aria-label="Ещё" onKeyDown={keys}>
          <button
            type="button"
            className="mi"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.textmeet.openMeetingDir(meeting.id).catch((err: unknown) => onError(errorText(err)));
            }}
          >
            <FolderIcon />
            <span className="mi-label">Открыть папку встречи</span>
          </button>
          <div className="sep" role="separator" />
          {!meeting.audioDeleted && (
            <button
              type="button"
              className="mi"
              role="menuitem"
              disabled={audioBlocked !== null}
              title={audioBlocked ?? undefined}
              onClick={() => pick('audio')}
            >
              <MuteIcon />
              <span className="mi-label">Удалить аудио…</span>
            </button>
          )}
          <button type="button" className="mi danger" role="menuitem" onClick={() => pick('meeting')}>
            <TrashIcon />
            <span className="mi-label">Удалить встречу…</span>
          </button>
        </div>
      )}
      {confirm === 'audio' && (
        <ConfirmDialog
          title="Удалить аудио?"
          confirmLabel="Удалить аудио"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await withReleasedAudio(() => window.textmeet.deleteAudio(meeting.id));
            setConfirm(null);
          }}
        >
          {deleteAudioText(meeting.durationSec, audioBytes)}
        </ConfirmDialog>
      )}
      {confirm === 'meeting' && (
        <ConfirmDialog
          title={`Удалить встречу «${meeting.title}»?`}
          confirmLabel="Удалить встречу"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await withReleasedAudio(() => window.textmeet.deleteMeeting(meeting.id));
            onDeleted();
          }}
        >
          Папка встречи — запись и текст — переместится в Корзину. Вернуть её можно оттуда.
        </ConfirmDialog>
      )}
    </div>
  );
}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
import { segmentAt } from './playback';
import { TranscribeDialog } from './TranscribeDialog';
import { progressView, transcribeActions, type ProgressView } from './transcription-format';
import { TranscriptView } from './TranscriptView';
```

**на:**

```tsx
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import { hasManualChanges, type TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
import { segmentAt } from './playback';
import { ConfirmDialog } from './ConfirmDialog';
import { MeetingMenu } from './MeetingMenu';
import { TranscribeDialog } from './TranscribeDialog';
import { progressView, transcribeActions, type ProgressView } from './transcription-format';
import { TranscriptView } from './TranscriptView';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  onError(message: string): void;
}

function OpenFolder({ id, onError }: { id: string; onError(message: string): void }) {
  return (
    <button
```

**на:**

```tsx
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  onError(message: string): void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
}

const AUDIO_BUSY = 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.';
const AUDIO_MIXING = 'Запись ещё готовится к прослушиванию — удалите аудио чуть позже.';

function OpenFolder({ id, onError }: { id: string; onError(message: string): void }) {
  return (
    <button
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  );
}

function ProgressBar({ value, wide }: { value: number; wide?: boolean }) {
  return (
    <div
```

**на:**

```tsx
  );
}

/** Папку встречи, которая создаётся слишком долго или не читается, тоже можно убрать — в Корзину. */
function DeleteFolder({ id, onDeleted }: { id: string; onDeleted(): void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
        <TrashIcon />
        Удалить папку…
      </button>
      {confirm && (
        <ConfirmDialog
          title="Удалить папку встречи?"
          confirmLabel="Удалить папку"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await window.textmeet.deleteMeeting(id);
            onDeleted();
          }}
        >
          Папка {id} переместится в Корзину. Вернуть её можно оттуда.
        </ConfirmDialog>
      )}
    </>
  );
}

function ProgressBar({ value, wide }: { value: number; wide?: boolean }) {
  return (
    <div
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
}

/** Прочитанная встреча: заголовок, пометки, текст или ход расшифровки, плеер. */
function MeetingView({ entry, progress, onError }: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
```

**на:**

```tsx
}

/** Прочитанная встреча: заголовок, пометки, текст или ход расшифровки, плеер. */
function MeetingView({
  entry,
  progress,
  onError,
  onDeleted,
}: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
  const [dialog, setDialog] = useState(false);
  const { meeting, mixReady, mixFailed } = entry;
  const busy = meeting.status === 'queued' || meeting.status === 'transcribing' ? meeting.status : null;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
  const hasAudio = meeting.tracks.length > 0;
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
```

**на:**

```tsx
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
  if (meeting.audioDeleted) meta.push('аудио удалено');
  const hasAudio = meeting.tracks.length > 0;
  const audioBlocked = busy ? AUDIO_BUSY : hasAudio && !mixReady && !mixFailed ? AUDIO_MIXING : null;
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
              {actions.header}
            </button>
          )}
          <OpenFolder id={meeting.id} onError={onError} />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
```

**на:**

```tsx
              {actions.header}
            </button>
          )}
          <MeetingMenu
            meeting={meeting}
            audioBlocked={audioBlocked}
            releaseAudio={playback.release}
            onDeleted={onDeleted}
            onError={onError}
          />
        </div>
      </header>
      {meeting.recovered && meeting.status !== 'error' && (
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
          meetingId={meeting.id}
          again={actions.header === 'Расшифровать заново'}
          replacesText={hasText}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
```

**на:**

```tsx
          meetingId={meeting.id}
          again={actions.header === 'Расшифровать заново'}
          replacesText={hasText}
          losesEdits={hasManualChanges(load.kind === 'ready' ? load.transcript : null, meeting.speakerNames)}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, onError }: Props) {
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
```

**на:**

```tsx
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, onError, onDeleted }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
        <div className="empty-note">
          <b>Встреча создаётся…</b>
          <span>Если это сообщение не исчезает, встреча не успела создаться — папку можно удалить.</span>
          <div className="acts">
            <OpenFolder id={entry.id} onError={onError} />
            <DeleteFolder id={entry.id} onDeleted={onDeleted} />
          </div>
        </div>
      </main>
    );
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
          <b>Не удалось прочитать встречу</b>
          <span>Папка: {entry.id}</span>
          <pre className="reason">{entry.reason}</pre>
          <OpenFolder id={entry.id} onError={onError} />
        </div>
      </main>
    );
  }
  return <MeetingView entry={entry} progress={progress} onError={onError} />;
}
```

**на:**

```tsx
          <b>Не удалось прочитать встречу</b>
          <span>Папка: {entry.id}</span>
          <pre className="reason">{entry.reason}</pre>
          <div className="acts">
            <OpenFolder id={entry.id} onError={onError} />
            <DeleteFolder id={entry.id} onDeleted={onDeleted} />
          </div>
        </div>
      </main>
    );
  }
  return <MeetingView entry={entry} progress={progress} onError={onError} onDeleted={onDeleted} />;
}
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
import type { ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { ChevronIcon } from './icons';
import { modelChoiceLabel } from './model-catalog';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';
```

**на:**

```tsx
import type { ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { ChevronIcon, WarnIcon } from './icons';
import { modelChoiceLabel } from './model-catalog';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
  again: boolean;
  /** Текст уже есть: он заменится, когда новая расшифровка закончится. */
  replacesText: boolean;
  /** Число участников, указанное раньше (выбрано заранее). */
  participantsHint: number | null;
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: модель (по умолчанию — из настроек), число участников и запуск. */
export function TranscribeDialog({ meetingId, again, replacesText, participantsHint, onClose }: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [models, setModels] = useState<ModelsState | null>(null);
  /** null — пока не выбрали сами: модель из настроек. */
```

**на:**

```tsx
  again: boolean;
  /** Текст уже есть: он заменится, когда новая расшифровка закончится. */
  replacesText: boolean;
  /** Текст правили руками или собеседникам дали имена — это пропадёт. */
  losesEdits: boolean;
  /** Число участников, указанное раньше (выбрано заранее). */
  participantsHint: number | null;
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: модель (по умолчанию — из настроек), число участников и запуск. */
export function TranscribeDialog({ meetingId, again, replacesText, losesEdits, participantsHint, onClose }: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [models, setModels] = useState<ModelsState | null>(null);
  /** null — пока не выбрали сами: модель из настроек. */
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
      >
        <h2 id={titleId}>{title}</h2>
        {replacesText && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        {models && (
          <div className="dlg-field">
            <div className="q">Модель</div>
```

**на:**

```tsx
      >
        <h2 id={titleId}>{title}</h2>
        {replacesText && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        {losesEdits && (
          <p className="wrn">
            <WarnIcon />
            <span>Текст расшифруется с нуля: ваши правки и имена собеседников пропадут.</span>
          </p>
        )}
        {models && (
          <div className="dlg-field">
            <div className="q">Модель</div>
```

**В `src/renderer/main/format.ts` заменить:**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';
```

**на:**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import { formatBytes, formatDurationShort } from '../../shared/format';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';
```

**В `src/renderer/main/format.ts` заменить:**

```ts
  }
}

/** Убирает приставку «По умолчанию — » / «Default - » из названия устройства. */
export function cleanDeviceLabel(label: string): string {
  return label.replace(/^(default|по умолчанию|communications|связь)\s*[-–—]\s*/i, '').trim();
```

**на:**

```ts
  }
}

/** Текст окна «Удалить аудио?»: «Запись (32 мин, 15 МБ) переместится в Корзину…»; размер — когда узнали. */
export function deleteAudioText(durationSec: number | null, bytes: number | null): string {
  const parts: string[] = [];
  if (durationSec !== null && durationSec >= 0) parts.push(formatDurationShort(durationSec));
  if (bytes !== null) parts.push(bytes < 1024 * 1024 ? 'меньше 1 МБ' : formatBytes(bytes));
  const what = parts.length > 0 ? `Запись (${parts.join(', ')})` : 'Запись';
  return `${what} переместится в Корзину. Текст встречи останется, но слушать запись и расшифровывать её заново будет нельзя.`;
}

/** Убирает приставку «По умолчанию — » / «Default - » из названия устройства. */
export function cleanDeviceLabel(label: string): string {
  return label.replace(/^(default|по умолчанию|communications|связь)\s*[-–—]\s*/i, '').trim();
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
  /** Слушать с этого места. */
  seekAndPlay(seconds: number): void;
  nextSpeed(): void;
  /** Остановить и отпустить файл записи (перед «Удалить аудио»: иначе Windows не даст перенести папку). */
  release(): void;
  /** Обработчики событий <audio>. */
  events: {
    onPlay(): void;
```

**на:**

```ts
  /** Слушать с этого места. */
  seekAndPlay(seconds: number): void;
  nextSpeed(): void;
  /**
   * Остановить и отпустить файл записи (перед удалением: иначе Windows не даст перенести папку в Корзину).
   * Возвращает «вернуть как было» — если удалить не вышло.
   */
  release(): () => void;
  /** Обработчики событий <audio>. */
  events: {
    onPlay(): void;
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
    nextSpeed: () => setSpeed((s) => nextSpeed(s)),
    release: () => {
      const el = ref.current;
      if (!el) return;
      el.pause();
      el.removeAttribute('src');
      el.load();
    },
    events: {
      onPlay: () => setPlaying(true),
```

**на:**

```ts
    nextSpeed: () => setSpeed((s) => nextSpeed(s)),
    release: () => {
      const el = ref.current;
      const src = el?.getAttribute('src');
      if (!el || !src) return () => undefined;
      el.pause();
      el.removeAttribute('src');
      el.load();
      return () => {
        el.setAttribute('src', src);
        el.load();
      };
    },
    events: {
      onPlay: () => setPlaying(true),
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
```

**на:**

```tsx
  </Icon>
);

export const MoreIcon = () => (
  <Icon filled>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </Icon>
);

export const MuteIcon = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M17 9l4 6M21 9l-4 6" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
```

**В `src/renderer/main/styles.css` заменить:**

```css
  color: var(--rec);
}

.sep {
  height: 1px;
  background: var(--line);
```

**на:**

```css
  color: var(--rec);
}

.mi.danger .ic {
  color: var(--rec);
}

.mi:disabled {
  opacity: 0.5;
  cursor: default;
  background: transparent;
}

/* Меню «…» в заголовке встречи — справа под кнопкой. */
.more-wrap {
  position: relative;
}

.menu.right {
  left: auto;
  right: 0;
}

.sep {
  height: 1px;
  background: var(--line);
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  794 passed (794)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `39 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: meeting menu — open the folder, delete audio or the meeting to the trash; warn about lost edits"
```

### Task 12: Поиск в боковой панели

**Files:**
- Create: `src/renderer/main/SearchBox.tsx`, `src/renderer/main/SearchResults.tsx`
- Modify: `e2e/library.spec.ts`, `src/renderer/main/App.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/SegmentText.tsx`, `src/renderer/main/TranscriptView.tsx`, `src/renderer/main/format.test.ts`, `src/renderer/main/format.ts`, `src/renderer/main/hooks.ts`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`

`SearchBox` над списком; пока в нём слово хотя бы из двух букв, вместо списка встреч — `SearchResults`
(«Найдено в 2 встречах», встреча, под ней до 3 реплик со временем и подсветкой, «и ещё N — откройте встречу»).
`useSearch` — после паузы набора 200 мс, только ответ на последний запрос; повторяется при изменениях библиотеки и при
возврате в окно. Щелчок по реплике открывает встречу и прокручивает к ней (`.row.found`), в открытой встрече подсвечены
все совпадения (`SearchViewContext`). Esc и крестик очищают поиск.

- [ ] **Step 1: Тесты**

**В `e2e/library.spec.ts` заменить:**

```ts
    'ваши правки и имена собеседников пропадут',
  );
});
```

**на:**

```ts
    'ваши правки и имена собеседников пропадут',
  );
});

test('search finds segments and titles in all meetings and opens the meeting at the segment', async () => {
  const OTHER = '2026-09-24_1000_d4e5f6';
  launched = await launchApp({
    meetings: [
      doneMeeting(),
      { id: OTHER, json: meetingJson(OTHER, { title: 'Бюджет 2027', createdAt: '2026-09-24T07:00:00.000Z' }) },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page } = launched;
  const box = page.getByRole('searchbox', { name: 'Поиск по всем встречам' });
  const found = page.getByRole('navigation', { name: 'Найдено' });

  await box.fill('БЮДЖЕТ');
  await expect(found.getByRole('status')).toHaveText('Найдено в 2 встречах');
  await expect(found.getByRole('group', { name: 'Бюджет 2027' })).toBeVisible();
  await found.getByRole('button', { name: /По бюджету на октябрь/ }).click();

  await expect(page.getByRole('heading', { name: 'Созвон с Ириной' })).toBeVisible();
  const row = page.getByLabel('Текст встречи').locator('.row.found');
  await expect(row).toContainText('По бюджету на октябрь');
  await expect(row.locator('mark')).toHaveText('бюджет');
  await expect(found.getByRole('button', { name: /По бюджету на октябрь/ })).toHaveAttribute('aria-current', 'true');

  await box.fill('ёлка зима');
  await expect(found.getByRole('status')).toHaveText('Ничего не найдено');

  await box.press('Escape');
  await expect(found).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Встречи' })).toContainText('Бюджет 2027');
  await expect(page.getByLabel('Текст встречи').locator('mark')).toHaveCount(0);
});

test('search sees a segment right after it was edited', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await text.getByRole('textbox', { name: 'Текст реплики' }).fill('Без подрядчиков из Самары.');
  await text.getByRole('textbox', { name: 'Текст реплики' }).press('Enter');
  await expect(text.getByRole('button', { name: 'Без подрядчиков из Самары.' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('самары');
  await expect(page.getByRole('navigation', { name: 'Найдено' }).getByRole('status')).toHaveText('Найдено в 1 встрече');
});
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
  parseParticipants,
  participantsText,
  pluralize,
} from './format';

const meeting = (id: string, createdAt: Date, patch: Partial<Meeting> = {}): Meeting => ({
```

**на:**

```ts
  parseParticipants,
  participantsText,
  pluralize,
  searchFoundText,
  searchMeetingMeta,
} from './format';

const meeting = (id: string, createdAt: Date, patch: Partial<Meeting> = {}): Meeting => ({
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
    expect(deleteAudioText(120, null)).toBe(`Запись (2 мин) ${tail}`);
  });
});
```

**на:**

```ts
    expect(deleteAudioText(120, null)).toBe(`Запись (2 мин) ${tail}`);
  });
});

describe('search texts', () => {
  const now = new Date(2026, 9, 4, 12, 0);

  it('describes a found meeting by its day, time and number of matches', () => {
    expect(searchMeetingMeta(new Date(2026, 9, 3, 16, 20).toISOString(), 2, now)).toBe('вчера, 16:20 · 2 совпадения');
    expect(searchMeetingMeta(new Date(2026, 9, 4, 11, 0).toISOString(), 1, now)).toBe('сегодня, 11:00 · 1 совпадение');
    expect(searchMeetingMeta(new Date(2026, 8, 22, 10, 0).toISOString(), 14, now)).toBe(
      '22 сентября, 10:00 · 14 совпадений',
    );
  });

  it('leaves out the number when only the title matched', () => {
    expect(searchMeetingMeta(new Date(2026, 8, 22, 10, 0).toISOString(), 0, now)).toBe('22 сентября, 10:00');
  });

  it('says how many meetings were found', () => {
    expect(searchFoundText(0, false)).toBe('Ничего не найдено');
    expect(searchFoundText(1, false)).toBe('Найдено в 1 встрече');
    expect(searchFoundText(3, false)).toBe('Найдено в 3 встречах');
    expect(searchFoundText(11, false)).toBe('Найдено в 11 встречах');
    expect(searchFoundText(21, false)).toBe('Найдено в 21 встрече');
    expect(searchFoundText(200, true)).toBe('Найдено в первых 200 встречах');
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/format.test.ts`
Ожидается: FAIL — нет `searchFoundText`, `searchMeetingMeta`; сквозные тесты не находят поле поиска.

- [ ] **Step 3: Код**

**В `src/renderer/main/App.tsx` заменить:**

```tsx
import { useEffect, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
import { errorText } from './errors';
import { useMeetings, useMicrophones, useRecordingState, useTranscriptionProgress } from './hooks';
import { SettingsIcon } from './icons';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
import { RecordPanel } from './RecordPanel';
import { SettingsPane } from './SettingsPane';
import { StopDialog } from './StopDialog';
```

**на:**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
import { isSearchable, queryWords } from '../../shared/search-text';
import { errorText } from './errors';
import {
  SearchViewContext,
  useMeetings,
  useMicrophones,
  useRecordingState,
  useSearch,
  useTranscriptionProgress,
  type SearchView,
} from './hooks';
import { SettingsIcon } from './icons';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
import { RecordPanel } from './RecordPanel';
import { SearchBox } from './SearchBox';
import { SearchResults } from './SearchResults';
import { SettingsPane } from './SettingsPane';
import { StopDialog } from './StopDialog';
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
```

**на:**

```tsx
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<SearchView['focus']>(null);
  const searching = isSearchable(query);
  const search = useSearch(query);
  const searchView = useMemo<SearchView>(
    () => ({ words: searching ? queryWords(query) : [], focus: searching ? focus : null }),
    [query, searching, focus],
  );

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
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
          progress={progress}
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
      {recording.stopDialog && <StopDialog data={recording.stopDialog} onError={setError} />}
    </div>
  );
}
```

**на:**

```tsx
  }

  return (
    <SearchViewContext.Provider value={searchView}>
      <div className="app">
        <aside className="side" aria-label="Запись и встречи">
          <RecordPanel state={recording} hotkey={hotkey} micLabel={micLabel} onError={setError} />
          {error && (
            <p role="alert" className="problem">
              {error}
            </p>
          )}
          <SearchBox value={query} onChange={setQuery} />
          {searching ? (
            <SearchResults
              state={search}
              selected={focus ? { meetingId: focus.meetingId, segmentId: focus.segmentId } : null}
              onOpen={(id, segmentId) => {
                setSelection({ kind: 'meeting', id });
                setFocus((prev) => (segmentId ? { meetingId: id, segmentId, nonce: (prev?.nonce ?? 0) + 1 } : null));
              }}
            />
          ) : (
            <MeetingList
              entries={entries}
              error={listError}
              recording={recording}
              selectedId={selectedId}
              progress={progress}
              onSelect={(id) => setSelection({ kind: 'meeting', id })}
            />
          )}
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
        {recording.stopDialog && <StopDialog data={recording.stopDialog} onError={setError} />}
      </div>
    </SearchViewContext.Provider>
  );
}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useCallback, useMemo, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
```

**на:**

```tsx
import { useCallback, useContext, useMemo, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
```

**на:**

```tsx
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
  const renameSpeaker = useCallback(
    async (speakerId: SpeakerId, name: string | null) => {
      await window.textmeet.renameSpeaker({ meetingId: meeting.id, speakerId, name });
```

**на:**

```tsx
}) {
  const { transcript } = load;
  const starts = useMemo(() => transcript.segments.map((s) => s.start), [transcript]);
  const search = useContext(SearchViewContext);
  const focus = search.focus?.meetingId === meeting.id ? search.focus : null;
  const renameSpeaker = useCallback(
    async (speakerId: SpeakerId, name: string | null) => {
      await window.textmeet.renameSpeaker({ meetingId: meeting.id, speakerId, name });
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
      onEdit={onEdit}
      onRenameSpeaker={renameSpeaker}
      onError={onError}
    />
```

**на:**

```tsx
      playing={playback.playing}
      onPlayAt={canPlay ? playback.seekAndPlay : null}
      onEdit={onEdit}
      searchWords={search.words}
      focus={focus}
      onRenameSpeaker={renameSpeaker}
      onError={onError}
    />
```

**Создать `src/renderer/main/SearchBox.tsx`:**

```tsx
import { CloseIcon, SearchIcon } from './icons';

/** Поле «Поиск по всем встречам» над списком; крестик и Esc очищают поиск. */
export function SearchBox({ value, onChange }: { value: string; onChange(next: string): void }) {
  return (
    <label className={value ? 'search on' : 'search'}>
      <SearchIcon />
      <input
        type="text"
        role="searchbox"
        placeholder="Поиск по всем встречам"
        aria-label="Поиск по всем встречам"
        value={value}
        maxLength={500}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      {value && (
        <button type="button" className="clr" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <CloseIcon />
        </button>
      )}
    </label>
  );
}
```

**Создать `src/renderer/main/SearchResults.tsx`:**

```tsx
import { splitByRanges, type TextRange } from '../../shared/search-text';
import type { SearchMeeting } from '../../shared/search';
import { searchFoundText, searchMeetingMeta } from './format';
import type { SearchState } from './hooks';
import { formatTimestamp, speakerTone } from './transcription-format';

/** Текст с подсвеченными совпадениями. */
export function Marked({ text, ranges }: { text: string; ranges: readonly TextRange[] }) {
  return (
    <>{splitByRanges(text, ranges).map((piece, i) => (piece.mark ? <mark key={i}>{piece.text}</mark> : piece.text))}</>
  );
}

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
        <b>
          <Marked text={meeting.title} ranges={meeting.titleRanges} />
        </b>
        <span>{searchMeetingMeta(meeting.createdAt, meeting.total, new Date())}</span>
      </button>
      {meeting.hits.map((hit) => (
        <button
          key={hit.segmentId}
          type="button"
          className="hit"
          aria-current={
            selected?.meetingId === meeting.meetingId && selected.segmentId === hit.segmentId ? 'true' : undefined
          }
          onClick={() => onOpen(meeting.meetingId, hit.segmentId)}
        >
          <span className="ht">{formatTimestamp(hit.start)}</span>
          <span>
            <span className={`hw ${speakerTone(hit.speakerId)}`}>{hit.speaker}</span>
            <Marked text={hit.text} ranges={hit.ranges} />
          </span>
        </button>
      ))}
      {more > 0 && (
        <button type="button" className="more" onClick={() => onOpen(meeting.meetingId, null)}>
          и ещё {more} — откройте встречу
        </button>
      )}
    </div>
  );
}

/** Найденное вместо списка встреч (лист 10 макета): встреча, под ней реплики со временем и подсветкой. */
export function SearchResults({ state, selected, onOpen }: Props) {
  if (state.kind === 'error') {
    return (
      <div className="list">
        <p role="alert" className="err pad">
          {state.message}
        </p>
      </div>
    );
  }
  const result = state.kind === 'ready' || state.kind === 'searching' ? state.result : null;
  if (!result) return <div className="list muted pad">Ищем…</div>;
  return (
    <nav className="list" aria-label="Найдено">
      <div className="found-n" role="status">
        {searchFoundText(result.meetings.length, result.truncated)}
      </div>
      {result.meetings.map((meeting) => (
        <MeetingHits key={meeting.meetingId} meeting={meeting} selected={selected} onOpen={onOpen} />
      ))}
    </nav>
  );
}
```

**В `src/renderer/main/SegmentText.tsx` заменить:**

```tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { errorText } from './errors';

interface Props {
  text: string;
  /** Можно править (не идёт расшифровка заново). */
  editable: boolean;
  editing: boolean;
```

**на:**

```tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { findRanges, normalize } from '../../shared/search-text';
import { errorText } from './errors';
import { Marked } from './SearchResults';

interface Props {
  text: string;
  /** Слова поиска — подсветить в тексте. */
  words: readonly string[];
  /** Можно править (не идёт расшифровка заново). */
  editable: boolean;
  editing: boolean;
```

**В `src/renderer/main/SegmentText.tsx` заменить:**

```tsx
 * Текст реплики. Щелчок — поле правки того же шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc —
 * отменить, уход из поля — сохранить. Выделение мышью (чтобы скопировать) правку не начинает.
 */
export function SegmentText({ text, editable, editing, onStartEditing, onStopEditing, onSave }: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
```

**на:**

```tsx
 * Текст реплики. Щелчок — поле правки того же шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc —
 * отменить, уход из поля — сохранить. Выделение мышью (чтобы скопировать) правку не начинает.
 */
export function SegmentText({ text, words, editable, editing, onStartEditing, onStopEditing, onSave }: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
```

**В `src/renderer/main/SegmentText.tsx` заменить:**

```tsx
  }, [editing]);

  if (!editing) {
    if (!editable) return <div className="say">{text}</div>;
    return (
      <div
        className="say editable"
```

**на:**

```tsx
  }, [editing]);

  if (!editing) {
    const shown = words.length > 0 ? <Marked text={text} ranges={findRanges(normalize(text), words)} /> : text;
    if (!editable) return <div className="say">{shown}</div>;
    return (
      <div
        className="say editable"
```

**В `src/renderer/main/SegmentText.tsx` заменить:**

```tsx
          onStartEditing();
        }}
      >
        {text}
      </div>
    );
  }
```

**на:**

```tsx
          onStartEditing();
        }}
      >
        {shown}
      </div>
    );
  }
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  onPlayAt: ((seconds: number) => void) | null;
  /** Сохранить правку; null — текст сейчас не правится (идёт расшифровка заново). */
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
  /** Переименовать спикера во всей встрече; null — сейчас нельзя. */
  onRenameSpeaker: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onError(message: string): void;
```

**на:**

```tsx
  onPlayAt: ((seconds: number) => void) | null;
  /** Сохранить правку; null — текст сейчас не правится (идёт расшифровка заново). */
  onEdit: ((edit: TranscriptEdit) => Promise<void>) | null;
  /** Слова поиска — подсвечены в репликах. */
  searchWords: readonly string[];
  /** Реплика, к которой перешли из найденного: прокрутить к ней и обвести. */
  focus: { segmentId: string; nonce: number } | null;
  /** Переименовать спикера во всей встрече; null — сейчас нельзя. */
  onRenameSpeaker: ((speakerId: SpeakerId, name: string | null) => Promise<void>) | null;
  onError(message: string): void;
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
```

**на:**

```tsx
  segment: TranscriptSegment;
  label: string;
  now: boolean;
  /** Перешли к этой реплике из найденного. */
  found: boolean;
  words: readonly string[];
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  segment,
  label,
  now,
  onPlayAt,
  editing,
  setEditing,
```

**на:**

```tsx
  segment,
  label,
  now,
  found,
  words,
  onPlayAt,
  editing,
  setEditing,
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  const tone = speakerTone(segment.speakerId);
  return (
    <div
      className={['row', now && 'now', menuOpen && 'menu-open'].filter(Boolean).join(' ')}
      data-segment={segment.id}
      aria-current={now ? 'true' : undefined}
    >
```

**на:**

```tsx
  const tone = speakerTone(segment.speakerId);
  return (
    <div
      className={['row', now && 'now', found && 'found', menuOpen && 'menu-open'].filter(Boolean).join(' ')}
      data-segment={segment.id}
      aria-current={now ? 'true' : undefined}
    >
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
        )}
        <SegmentText
          text={segment.text}
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
```

**на:**

```tsx
        )}
        <SegmentText
          text={segment.text}
          words={words}
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  playing,
  onPlayAt,
  onEdit,
  onRenameSpeaker,
  onError,
}: Props) {
```

**на:**

```tsx
  playing,
  onPlayAt,
  onEdit,
  searchWords,
  focus,
  onRenameSpeaker,
  onError,
}: Props) {
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  );
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
  useEffect(() => {
```

**на:**

```tsx
  );
  const nowId = nowIndex >= 0 ? (transcript.segments[nowIndex]?.id ?? null) : null;
  const editing = editingId !== null;
  const foundId = focus?.segmentId ?? null;

  // Перешли из найденного — показать реплику посередине.
  useEffect(() => {
    if (!focus) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(focus.segmentId)}"]`);
    row?.scrollIntoView({ block: 'center' });
    lastManualScroll.current = Date.now();
  }, [focus]);

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
  useEffect(() => {
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
            segment={segment}
            label={speakerLabel(segment.speakerId, names)}
            now={i === nowIndex}
            onPlayAt={onPlayAt}
            editing={segment.id === editingId}
            setEditing={onEdit ? setEditingId : null}
```

**на:**

```tsx
            segment={segment}
            label={speakerLabel(segment.speakerId, names)}
            now={i === nowIndex}
            found={segment.id === foundId}
            words={searchWords}
            onPlayAt={onPlayAt}
            editing={segment.id === editingId}
            setEditing={onEdit ? setEditingId : null}
```

**В `src/renderer/main/format.ts` заменить:**

```ts
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export interface DayGroup {
  label: string;
  entries: MeetingListEntry[];
```

**на:**

```ts
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** Встреча в найденном: «вчера, 16:20 · 2 совпадения»; совпало только название — без числа. */
export function searchMeetingMeta(createdAt: string, total: number, now: Date): string {
  const date = new Date(createdAt);
  const day = dayLabel(date, now);
  const when = `${day === 'Сегодня' || day === 'Вчера' ? day.toLowerCase() : day}, ${formatTimeOfDay(createdAt)}`;
  if (total === 0) return when;
  return `${when} · ${total} ${pluralize(total, 'совпадение', 'совпадения', 'совпадений')}`;
}

/** «Найдено в 1 встрече», «Найдено в 3 встречах»; truncated — показаны не все. */
export function searchFoundText(meetings: number, truncated: boolean): string {
  if (meetings === 0) return 'Ничего не найдено';
  const place = meetings % 10 === 1 && meetings % 100 !== 11 ? 'встрече' : 'встречах';
  return `Найдено в ${truncated ? 'первых ' : ''}${meetings} ${place}`;
}

export interface DayGroup {
  label: string;
  entries: MeetingListEntry[];
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import { useCallback, useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
```

**на:**

```ts
import { createContext, useCallback, useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { SearchResult } from '../../shared/search';
import { isSearchable } from '../../shared/search-text';
import type { Transcript } from '../../shared/transcript';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
    },
  };
}
```

**на:**

```ts
    },
  };
}

/** Пауза набора перед поиском. */
const SEARCH_DELAY_MS = 200;

export type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching'; result: SearchResult | null }
  | { kind: 'ready'; result: SearchResult }
  | { kind: 'error'; message: string };

/**
 * Поиск по всем встречам: после паузы набора; показывается только ответ на последний запрос. Повторяется, когда
 * библиотека изменилась и при возврате в окно — найденное не устаревает.
 */
export function useSearch(query: string): SearchState {
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [again, setAgain] = useState(0);
  const latest = useRef(0);
  const active = isSearchable(query);

  useEffect(() => {
    if (!active) return;
    const bump = () => setAgain((n) => n + 1);
    window.addEventListener('focus', bump);
    const unsubscribe = window.textmeet.onLibraryChanged(bump);
    return () => {
      window.removeEventListener('focus', bump);
      unsubscribe();
    };
  }, [active]);

  useEffect(() => {
    const request = ++latest.current;
    if (!active) {
      setState({ kind: 'idle' });
      return;
    }
    setState((current) => ({ kind: 'searching', result: current.kind === 'ready' ? current.result : null }));
    const timer = setTimeout(() => {
      window.textmeet
        .search(query)
        .then((result) => {
          if (request === latest.current) setState({ kind: 'ready', result });
        })
        .catch((err: unknown) => {
          if (request === latest.current) setState({ kind: 'error', message: errorText(err) });
        });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, active, again]);

  return state;
}

/** Поиск глазами открытой встречи: слова для подсветки и реплика, к которой перешли из найденного. */
export interface SearchView {
  /** Слова запроса; пусто — поиска нет. */
  words: readonly string[];
  /** nonce — каждый переход новый: повторный щелчок по той же реплике снова к ней прокручивает. */
  focus: { meetingId: string; segmentId: string; nonce: number } | null;
}

export const SearchViewContext = createContext<SearchView>({ words: [], focus: null });
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
```

**на:**

```tsx
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
```

**В `src/renderer/main/styles.css` заменить:**

```css
  --sp4: #7a6420;
  --warn: #855700;
  --warn-soft: #f4e6c4;
  --shade: rgba(38, 34, 27, 0.42);
  --f-ui: 'Golos Text', 'Segoe UI', -apple-system, sans-serif;
  --f-text: 'Literata', Georgia, serif;
```

**на:**

```css
  --sp4: #7a6420;
  --warn: #855700;
  --warn-soft: #f4e6c4;
  --mark: #eacb62;
  --shade: rgba(38, 34, 27, 0.42);
  --f-ui: 'Golos Text', 'Segoe UI', -apple-system, sans-serif;
  --f-text: 'Literata', Georgia, serif;
```

**В `src/renderer/main/styles.css` заменить:**

```css
    --sp4: #e0c477;
    --warn: #e8b04b;
    --warn-soft: #3b2f17;
    --shade: rgba(0, 0, 0, 0.55);
  }
}
```

**на:**

```css
    --sp4: #e0c477;
    --warn: #e8b04b;
    --warn-soft: #3b2f17;
    --mark: #7a6420;
    --shade: rgba(0, 0, 0, 0.55);
  }
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
.say-edit {
  display: block;
  width: calc(100% + 22px);
  margin: -7px -11px 0;
  border: 1px solid var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  border-radius: var(--r);
  background: var(--surface);
  padding: 6px 10px;
  font-family: var(--f-text);
  font-size: 16.5px;
  line-height: 1.55;
```

**на:**

```css
.say-edit {
  display: block;
  width: calc(100% + 22px);
  margin: -3px -11px 0;
  border: 1px solid var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  border-radius: var(--r);
  background: var(--surface);
  padding: 2px 10px;
  font-family: var(--f-text);
  font-size: 16.5px;
  line-height: 1.55;
```

**В `src/renderer/main/styles.css` заменить:**

```css
  color: var(--muted);
  cursor: default;
}
```

**на:**

```css
  color: var(--muted);
  cursor: default;
}

/* ---- Поиск по всем встречам (лист 10 макета) ---- */
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 6px 0 10px;
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--muted);
  flex: none;
}

.search:focus-within,
.search.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  outline: none;
}

.search input::placeholder {
  color: var(--muted);
}

.search .clr {
  display: flex;
  border: 0;
  background: none;
  padding: 3px;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
}

.search .clr:hover {
  color: var(--text);
}

mark {
  background: var(--mark);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.found-n {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 10px 6px;
}

.rg {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 8px;
}

.rg-h,
.hit,
.more {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--r);
  cursor: pointer;
}

.rg-h {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 10px 4px;
}

.rg-h b {
  font-weight: 600;
  font-size: 13.5px;
}

.rg-h span {
  font-size: 12px;
  color: var(--muted);
}

.hit {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12.5px;
  line-height: 1.45;
}

.rg-h:hover,
.hit:hover {
  background: color-mix(in srgb, var(--sel) 55%, transparent);
}

.hit[aria-current='true'] {
  background: var(--sel);
}

.hit .ht {
  font-family: var(--f-text);
  font-size: 11.5px;
  color: var(--muted);
  padding-top: 1px;
  font-variant-numeric: tabular-nums;
}

.hit .hw {
  font-weight: 600;
  font-size: 12px;
  margin-right: 4px;
}

.more {
  padding: 2px 10px 2px 54px;
  color: var(--accent);
  font-size: 12px;
}

/* Реплика, к которой перешли из найденного. */
.row.found {
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  797 passed (797)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `41 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: search all meetings from the sidebar and open the meeting at the found segment"
```

### Task 13: Доработки по ревью: main

**Files:**
- Modify: `src/main/audio/mixer.test.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/library/meeting-delete.test.ts`, `src/main/library/meeting-delete.ts`, `src/main/library/search-index.ts`, `src/main/library/trash.test.ts`, `src/main/library/trash.ts`, `src/main/texts.ts`, `src/main/transcription/queue.test.ts`, `src/main/transcription/queue.ts`, `src/shared/search-text.test.ts`, `src/shared/search-text.ts`

По итогам ревью кода прототипа. Перенос в Корзину не удался — расшифровка и сведение встречи ставятся обратно, её
окно «Запись остановлена» остаётся (иначе встреча висела бы «в очереди» без задачи). Системные ошибки файлов в новых
каналах — понятным текстом без путей; у Корзины незнакомая причина — общим текстом (системный текст — только в журнал).
Встречу с удалённым аудио нельзя поставить на расшифровку (её текст не превратится в «ошибку»). Отменённая задача
очереди не сообщает «готово», даже если отмена пришла во время записи результата. Первое построение индекса читает не
больше 32 встреч разом. «а б» — не поиск: нужно слово хотя бы из двух букв. `TEXTMEET_TEST_TRASH` действует только в
режиме автотестов. Ожидания в новых тестах очереди и сведения — с запасом для медленной машины.

- [ ] **Step 1: Тесты**

**В `src/main/audio/mixer.test.ts` заменить:**

```ts
    mixer.enqueue('lib', 'a');
    mixer.enqueue('lib', 'b');
    mixer.enqueue('lib', 'c');
    await vi.waitFor(() => expect(order).toEqual(['a']));
    expect(mixer.isPending('lib', 'a')).toBe(true);
    expect(mixer.isPending('lib', 'b')).toBe(true);
    expect(mixer.isPending('other', 'b')).toBe(false);
```

**на:**

```ts
    mixer.enqueue('lib', 'a');
    mixer.enqueue('lib', 'b');
    mixer.enqueue('lib', 'c');
    await vi.waitFor(() => expect(order).toEqual(['a']), { timeout: 5000 });
    expect(mixer.isPending('lib', 'a')).toBe(true);
    expect(mixer.isPending('lib', 'b')).toBe(true);
    expect(mixer.isPending('other', 'b')).toBe(false);
```

**В `src/main/audio/mixer.test.ts` заменить:**

```ts
    await mixer.cancel('lib', 'a');
    expect(stopped).toBe(true);

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith('c'));
    expect(order).toEqual(['a', 'c']);
    // Отменённое сведение — не сбой: ни ошибки в журнале, ни «не удалось подготовить запись».
    expect(onSettled).toHaveBeenCalledTimes(1);
```

**на:**

```ts
    await mixer.cancel('lib', 'a');
    expect(stopped).toBe(true);

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith('c'), { timeout: 5000 });
    expect(order).toEqual(['a', 'c']);
    // Отменённое сведение — не сбой: ни ошибки в журнале, ни «не удалось подготовить запись».
    expect(onSettled).toHaveBeenCalledTimes(1);
```

**В `src/main/library/meeting-delete.test.ts` заменить:**

```ts
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`transcription ${id}`);
      }),
    },
    mixer: {
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`mixer ${id}`);
      }),
      isPending: vi.fn(() => false),
    },
    dropStopDialog: vi.fn((id: string) => {
      calls.push(`dialog ${id}`);
    }),
```

**на:**

```ts
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`transcription ${id}`);
      }),
      enqueue: vi.fn(async (_lib: string, id: string) => {
        calls.push(`requeue ${id}`);
      }),
    },
    mixer: {
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`mixer ${id}`);
      }),
      isPending: vi.fn(() => false),
      enqueue: vi.fn((_lib: string, id: string) => {
        calls.push(`remix ${id}`);
      }),
    },
    logger: { warn: vi.fn() },
    dropStopDialog: vi.fn((id: string) => {
      calls.push(`dialog ${id}`);
    }),
```

**В `src/main/library/meeting-delete.test.ts` заменить:**

```ts
});

describe('deleteMeeting', () => {
  it('stops its transcription and mixing, drops its stop dialog, then moves the folder to the trash', async () => {
    const { lib, meeting, deps, calls, bin } = await setup({ status: 'transcribing' });
    await deleteMeeting(deps, meeting.id);
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`, `dialog ${meeting.id}`]);
```

**на:**

```ts
});

describe('deleteMeeting', () => {
  it('stops its transcription and mixing, moves the folder to the trash, then drops its stop dialog', async () => {
    const { lib, meeting, deps, calls, bin } = await setup({ status: 'transcribing' });
    await deleteMeeting(deps, meeting.id);
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`, `dialog ${meeting.id}`]);
```

**В `src/main/library/meeting-delete.test.ts` заменить:**

```ts
    expect(existsSync(join(bin, `1-${meeting.id}`, 'meeting.json'))).toBe(true);
  });

  it('refuses the meeting being recorded', async () => {
    const { lib, meeting, deps, calls } = await setup();
    vi.mocked(deps.isRecording).mockReturnValue(true);
```

**на:**

```ts
    expect(existsSync(join(bin, `1-${meeting.id}`, 'meeting.json'))).toBe(true);
  });

  it('puts its transcription and mixing back and keeps its stop dialog when the trash fails', async () => {
    const { lib, meeting, deps, calls } = await setup({ status: 'queued' });
    vi.mocked(deps.mixer.isPending).mockReturnValue(true);
    deps.trash = async () => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(calls).toEqual([
      `transcription ${meeting.id}`,
      `mixer ${meeting.id}`,
      `requeue ${meeting.id}`,
      `remix ${meeting.id}`,
    ]);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(true);
  });

  it('does not requeue a meeting that was not waiting for transcription or mixing', async () => {
    const { meeting, deps, calls } = await setup();
    deps.trash = async () => {
      throw new Error('нет Корзины');
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`]);
  });

  it('refuses the meeting being recorded', async () => {
    const { lib, meeting, deps, calls } = await setup();
    vi.mocked(deps.isRecording).mockReturnValue(true);
```

**В `src/main/library/trash.test.ts` заменить:**

```ts
    expect(trash).toHaveBeenCalledTimes(TRASH_ATTEMPTS);
  });

  it('shows the message of an error without a known code', async () => {
    await expect(
      moveToTrash('/lib/x', async () => Promise.reject(new Error('Корзина отключена')), 0),
    ).rejects.toThrow('Не удалось переместить в Корзину: Корзина отключена');
  });
});
```

**на:**

```ts
    expect(trash).toHaveBeenCalledTimes(TRASH_ATTEMPTS);
  });

  it('does not show the system text of an unknown error (it may contain a path)', async () => {
    const run = moveToTrash('/lib/x', async () => Promise.reject(new Error("Failed to move 'C:\\lib\\x'")), 0);
    await expect(run).rejects.toThrow(
      'Не удалось переместить в Корзину: файл занят другой программой или Корзина недоступна',
    );
    await expect(run).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('C:') }),
    });
  });
});
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл' });
  });
```

**на:**

```ts
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1), { timeout: 5000 });
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл' });
  });
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    expect(first.killed).toBe(true);
    expect(t.finished).toEqual([]);

    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const command = await transcribeSent(t.worker);
    expect(command.input.tracks[0]?.file).toContain(next.id);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.meeting.id).toBe(next.id);
    expect((await readMeeting(lib, queued.id)).status).toBe('queued');
  });
```

**на:**

```ts
    expect(first.killed).toBe(true);
    expect(t.finished).toEqual([]);

    await vi.waitFor(() => expect(t.workers).toHaveLength(2), { timeout: 5000 });
    const command = await transcribeSent(t.worker);
    expect(command.input.tracks[0]?.file).toContain(next.id);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1), { timeout: 5000 });
    expect(t.finished[0]?.meeting.id).toBe(next.id);
    expect((await readMeeting(lib, queued.id)).status).toBe('queued');
  });
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    expect(t.finished).toEqual([]);
  });

  it('cancel of a meeting that is not in the queue does nothing', async () => {
    const t = setup();
    await expect(t.queue.cancel(makeTempDir(), '2026-01-01_0000_ffffff')).resolves.toBeUndefined();
```

**на:**

```ts
    expect(t.finished).toEqual([]);
  });

  it('cancel that comes after the result does not announce the meeting', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await t.queue.cancel(lib, meeting.id);
    expect(t.finished).toEqual([]);
  });

  it('refuses to transcribe a meeting whose audio was deleted', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'done', tracks: [], audioDeleted: true });
    const t = setup();
    await expect(t.queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.audioDeleted);
    expect((await readMeeting(lib, meeting.id)).status).toBe('done');
  });

  it('cancel of a meeting that is not in the queue does nothing', async () => {
    const t = setup();
    await expect(t.queue.cancel(makeTempDir(), '2026-01-01_0000_ffffff')).resolves.toBeUndefined();
```

**В `src/shared/search-text.test.ts` заменить:**

```ts
});

describe('isSearchable', () => {
  it('needs at least two letters', () => {
    expect(isSearchable('б')).toBe(false);
    expect(isSearchable(' б, ')).toBe(false);
    expect(isSearchable('бю')).toBe(true);
    expect(isSearchable('а б')).toBe(true);
  });
});
```

**на:**

```ts
});

describe('isSearchable', () => {
  it('needs a word of at least two letters', () => {
    expect(isSearchable('б')).toBe(false);
    expect(isSearchable(' б, ')).toBe(false);
    expect(isSearchable('а б')).toBe(false);
    expect(isSearchable('бю')).toBe(true);
    expect(isSearchable('в бюджет')).toBe(true);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/audio/mixer.test.ts src/main/library/meeting-delete.test.ts src/main/library/trash.test.ts src/main/transcription/queue.test.ts src/shared/search-text.test.ts`
Ожидается: FAIL — deleteMeeting не возвращает задачи при сбое Корзины; enqueue не отказывает встрече без аудио; отменённая задача сообщает «готово».

- [ ] **Step 3: Код**

**В `src/main/index.ts` заменить:**

```ts
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Только для автотестов: «Корзина» — обычная папка (на машинах CI настоящей Корзины может не быть). */
const trash: Trash = process.env.TEXTMEET_TEST_TRASH
  ? folderTrash(process.env.TEXTMEET_TEST_TRASH)
  : (path) => shell.trashItem(path);
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;

/** Потоков для расшифровки: все ядра, кроме одного (не больше 8); во время записи — 2 (§5.3 решений Плана 3). */
const FULL_THREADS = Math.max(1, Math.min(8, availableParallelism() - 1));
```

**на:**

```ts
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = process.env.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(process.env.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!process.env.TEXTMEET_TEST_ASR;
/** Только для автотестов: «Корзина» — обычная папка (на машинах CI настоящей Корзины может не быть). */
const testTrash = testRun ? process.env.TEXTMEET_TEST_TRASH : undefined;
const trash: Trash = testTrash ? folderTrash(testTrash) : (path) => shell.trashItem(path);

/** Потоков для расшифровки: все ядра, кроме одного (не больше 8); во время записи — 2 (§5.3 решений Плана 3). */
const FULL_THREADS = Math.max(1, Math.min(8, availableParallelism() - 1));
```

**В `src/main/index.ts` заменить:**

```ts
      },
      transcription: queue,
      mixer,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    transcription: queue,
```

**на:**

```ts
      },
      transcription: queue,
      mixer,
      logger,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    transcription: queue,
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.openMeetingDir, (arg) => openMeetingFolder(meetingDir(deps.libraryDir(), MeetingIdSchema.parse(arg))));

  /** Встречу поменяла программа: поиск перечитает её, даже если время изменения файла то же. */
  const searchChanged = (meetingId: string): void => {
    deps.search.invalidate(meetingId);
```

**на:**

```ts

  handle(IPC.openMeetingDir, (arg) => openMeetingFolder(meetingDir(deps.libraryDir(), MeetingIdSchema.parse(arg))));

  /** Системная ошибка файла (EACCES, ENOSPC…) — понятной причиной, без путей; остальные тексты уже для людей. */
  const forPeople = (action: string, err: unknown): Error =>
    (err as NodeJS.ErrnoException | null)?.code ? humanFsError(action, err) : (err as Error);
  const shown =
    <T>(action: string, work: () => Promise<T>) =>
    (): Promise<T> =>
      work().catch((err: unknown) => {
        throw forPeople(action, err);
      });

  /** Встречу поменяла программа: поиск перечитает её, даже если время изменения файла то же. */
  const searchChanged = (meetingId: string): void => {
    deps.search.invalidate(meetingId);
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.renameMeeting, async (arg) => {
    const request = RenameMeetingSchema.parse(arg);
    const meeting = await renameMeeting(deps.libraryDir(), request.meetingId, request.title);
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
```

**на:**

```ts

  handle(IPC.renameMeeting, async (arg) => {
    const request = RenameMeetingSchema.parse(arg);
    const meeting = await shown('Не удалось переименовать встречу', () =>
      renameMeeting(deps.libraryDir(), request.meetingId, request.title),
    )();
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.renameSpeaker, async (arg) => {
    const request = RenameSpeakerSchema.parse(arg);
    const meeting = await renameSpeaker(deps.libraryDir(), request.meetingId, request.speakerId, request.name);
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
```

**на:**

```ts

  handle(IPC.renameSpeaker, async (arg) => {
    const request = RenameSpeakerSchema.parse(arg);
    const meeting = await shown('Не удалось переименовать спикера', () =>
      renameSpeaker(deps.libraryDir(), request.meetingId, request.speakerId, request.name),
    )();
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
```

**В `src/main/ipc.ts` заменить:**

```ts

  handle(IPC.editTranscript, async (arg) => {
    const request = EditTranscriptSchema.parse(arg);
    const result = await editTranscript(deps.libraryDir(), request.meetingId, request.edit, new Date());
    searchChanged(request.meetingId);
    if (result.meetingChanged) deps.libraryChanged();
    return { meeting: result.meeting, transcript: result.transcript };
```

**на:**

```ts

  handle(IPC.editTranscript, async (arg) => {
    const request = EditTranscriptSchema.parse(arg);
    const result = await shown('Не удалось сохранить правку', () =>
      editTranscript(deps.libraryDir(), request.meetingId, request.edit, new Date()),
    )();
    searchChanged(request.meetingId);
    if (result.meetingChanged) deps.libraryChanged();
    return { meeting: result.meeting, transcript: result.transcript };
```

**В `src/main/ipc.ts` заменить:**

```ts
  handle(IPC.audioSize, (arg) => audioSize(deps.libraryDir(), MeetingIdSchema.parse(arg)));

  handle(IPC.deleteAudio, async (arg) => {
    await deleteAudio(deps.deletion, MeetingIdSchema.parse(arg));
    deps.libraryChanged();
  });

  // Имя папки, а не только прочитанная встреча: удалить можно и папку, которую не удалось прочитать.
  handle(IPC.deleteMeeting, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    await deleteMeeting(deps.deletion, id);
    deps.search.remove(id);
    deps.libraryChanged();
  });
```

**на:**

```ts
  handle(IPC.audioSize, (arg) => audioSize(deps.libraryDir(), MeetingIdSchema.parse(arg)));

  handle(IPC.deleteAudio, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    await shown('Не удалось удалить аудио', () => deleteAudio(deps.deletion, id))();
    deps.libraryChanged();
  });

  // Имя папки, а не только прочитанная встреча: удалить можно и папку, которую не удалось прочитать.
  handle(IPC.deleteMeeting, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    await shown('Не удалось удалить встречу', () => deleteMeeting(deps.deletion, id))();
    deps.search.remove(id);
    deps.libraryChanged();
  });
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../shared/meeting';
import { audioDir, meetingDir, readMeeting, updateMeeting } from './library';
import { moveToTrash, type Trash } from './trash';
```

**на:**

```ts
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../shared/meeting';
import type { Logger } from '../logger';
import { audioDir, meetingDir, readMeeting, updateMeeting } from './library';
import { moveToTrash, type Trash } from './trash';
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
  trash: Trash;
  /** Эта встреча сейчас записывается. */
  isRecording(meetingId: string): boolean;
  transcription: { cancel(libraryDir: string, meetingId: string): Promise<void> };
  mixer: {
    cancel(libraryDir: string, meetingId: string): Promise<void>;
    isPending(libraryDir: string, meetingId: string): boolean;
  };
  /** Убрать окно «Запись остановлена» этой встречи (открытое или ждущее). */
  dropStopDialog(meetingId: string): void;
  /** Пауза между попытками переноса в Корзину (в тестах — 0). */
```

**на:**

```ts
  trash: Trash;
  /** Эта встреча сейчас записывается. */
  isRecording(meetingId: string): boolean;
  transcription: {
    cancel(libraryDir: string, meetingId: string): Promise<void>;
    enqueue(libraryDir: string, meetingId: string): Promise<void>;
  };
  mixer: {
    cancel(libraryDir: string, meetingId: string): Promise<void>;
    isPending(libraryDir: string, meetingId: string): boolean;
    enqueue(libraryDir: string, meetingId: string): void;
  };
  logger: Pick<Logger, 'warn'>;
  /** Убрать окно «Запись остановлена» этой встречи (открытое или ждущее). */
  dropStopDialog(meetingId: string): void;
  /** Пауза между попытками переноса в Корзину (в тестах — 0). */
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
}

/**
 * Папку встречи — в Корзину. Сначала отменяются её расшифровка и сведение (они держат файлы) и убирается её окно
 * «Запись остановлена». Работает и для папки, которую не удалось прочитать.
 */
export async function deleteMeeting(deps: DeleteDeps, meetingId: string): Promise<void> {
  const libraryDir = deps.libraryDir();
  const dir = meetingDir(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  await deps.transcription.cancel(libraryDir, meetingId);
  await deps.mixer.cancel(libraryDir, meetingId);
  deps.dropStopDialog(meetingId);
  await moveToTrash(dir, deps.trash, deps.trashRetryMs);
}
```

**на:**

```ts
}

/**
 * Папку встречи — в Корзину. Сначала отменяются её расшифровка и сведение (они держат файлы); после переноса
 * убирается её окно «Запись остановлена». Перенос не удался — отменённое ставится обратно, иначе встреча так и висела
 * бы «в очереди» без задачи, а запись — «готовится». Работает и для папки, которую не удалось прочитать.
 */
export async function deleteMeeting(deps: DeleteDeps, meetingId: string): Promise<void> {
  const libraryDir = deps.libraryDir();
  const dir = meetingDir(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  const status = await readMeeting(libraryDir, meetingId).then(
    (meeting) => meeting.status,
    () => null,
  );
  const wasMixing = deps.mixer.isPending(libraryDir, meetingId);
  await deps.transcription.cancel(libraryDir, meetingId);
  await deps.mixer.cancel(libraryDir, meetingId);
  try {
    await moveToTrash(dir, deps.trash, deps.trashRetryMs);
  } catch (err) {
    if (status === 'queued' || status === 'transcribing') {
      await deps.transcription
        .enqueue(libraryDir, meetingId)
        .catch((requeueErr: unknown) => deps.logger.warn(`Встреча ${meetingId} не вернулась в очередь`, requeueErr));
    }
    if (wasMixing) deps.mixer.enqueue(libraryDir, meetingId);
    throw err;
  }
  deps.dropStopDialog(meetingId);
}
```

**В `src/main/library/search-index.ts` заменить:**

```ts
import { MEETING_FILE } from './library';
import { readTranscript, TRANSCRIPT_FILE } from './transcript-store';

/** Длина отрывка реплики в найденном. */
const SNIPPET_CHARS = 80;
```

**на:**

```ts
import { MEETING_FILE } from './library';
import { readTranscript, TRANSCRIPT_FILE } from './transcript-store';

/** Сколько встреч поиск читает одновременно: тысячи открытых файлов разом упёрлись бы в предел системы. */
const READ_BATCH = 32;

/** Длина отрывка реплики в найденном. */
const SNIPPET_CHARS = 80;
```

**В `src/main/library/search-index.ts` заменить:**

```ts
    }
    const present = new Set(ids);
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
    await Promise.all(ids.map((id) => this.update(dir, id)));
  }

  private async update(dir: string, id: string): Promise<void> {
```

**на:**

```ts
    }
    const present = new Set(ids);
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
    for (let at = 0; at < ids.length; at += READ_BATCH) {
      await Promise.all(ids.slice(at, at + READ_BATCH).map((id) => this.update(dir, id)));
    }
  }

  private async update(dir: string, id: string): Promise<void> {
```

**В `src/main/library/trash.ts` заменить:**

```ts
      return;
    } catch (err) {
      if (attempt >= TRASH_ATTEMPTS) {
        const reason = knownFsReason(err) ?? (err instanceof Error ? err.message : String(err));
        throw new Error(`Не удалось переместить в Корзину: ${reason}`, { cause: err });
      }
      await wait(retryMs);
```

**на:**

```ts
      return;
    } catch (err) {
      if (attempt >= TRASH_ATTEMPTS) {
        // Текст системы может содержать путь — он остаётся в журнале (cause), человеку — понятная причина.
        const reason = knownFsReason(err) ?? 'файл занят другой программой или Корзина недоступна';
        throw new Error(`Не удалось переместить в Корзину: ${reason}`, { cause: err });
      }
      await wait(retryMs);
```

**В `src/main/texts.ts` заменить:**

```ts
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
  hung: 'Расшифровка зависла и была остановлена.',
  badMessage: 'Процесс расшифровки прислал неверные данные.',
```

**на:**

```ts
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  audioDeleted: 'Аудио этой встречи удалено — расшифровать её заново нельзя.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
  hung: 'Расшифровка зависла и была остановлена.',
  badMessage: 'Процесс расшифровки прислал неверные данные.',
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
        if (m.status === 'recording') throw new Error(transcriptionTexts.stillRecording);
        return {
          ...m,
          status: 'queued',
```

**на:**

```ts
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
        if (m.status === 'recording') throw new Error(transcriptionTexts.stillRecording);
        if (m.audioDeleted) throw new Error(transcriptionTexts.audioDeleted);
        return {
          ...m,
          status: 'queued',
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
          ? { ...m, status: 'done', model, errorMessage: null, speakerNames: ownNameOnly(m.speakerNames) }
          : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
        this.deps.logger.info(`Расшифровка ${meetingId} сохранена, но встреча уже снова в очереди`);
```

**на:**

```ts
          ? { ...m, status: 'done', model, errorMessage: null, speakerNames: ownNameOnly(m.speakerNames) }
          : m,
      );
      // Встречу удаляют: результат записан в папку, которая уходит в Корзину, — сообщать не о чем.
      if (current.cancelled) return null;
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
        this.deps.logger.info(`Расшифровка ${meetingId} сохранена, но встреча уже снова в очереди`);
```

**В `src/shared/search-text.ts` заменить:**

```ts
  mark: boolean;
}

/** Меньше букв в запросе — не ищем: на одну букву нашлось бы почти всё. */
export const MIN_QUERY_LETTERS = 2;

/**
```

**на:**

```ts
  mark: boolean;
}

/** Нет слова хотя бы из стольких букв — не ищем: на одну букву нашлось бы почти всё. */
export const MIN_QUERY_LETTERS = 2;

/**
```

**В `src/shared/search-text.ts` заменить:**

```ts
}

export function isSearchable(query: string): boolean {
  return queryWords(query).join('').length >= MIN_QUERY_LETTERS;
}

/** В нормализованном тексте есть каждое слово (как часть слова: «бюджет» находит «бюджета»). */
```

**на:**

```ts
}

export function isSearchable(query: string): boolean {
  return queryWords(query).some((word) => word.length >= MIN_QUERY_LETTERS);
}

/** В нормализованном тексте есть каждое слово (как часть слова: «бюджет» находит «бюджета»). */
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  801 passed (801)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: keep a meeting usable when the trash fails; plain errors; no re-transcription without audio"
```

### Task 14: Доработки по ревью: окно

**Files:**
- Create: `src/renderer/main/menu-keys.test.ts`, `src/renderer/main/menu-keys.ts`
- Modify: `e2e/library.spec.ts`, `src/renderer/main/App.tsx`, `src/renderer/main/MeetingMenu.tsx`, `src/renderer/main/MeetingTitle.tsx`, `src/renderer/main/SegmentText.tsx`, `src/renderer/main/SpeakerMenu.tsx`, `src/renderer/main/TranscriptView.tsx`, `src/renderer/main/hooks.ts`, `src/renderer/main/styles.css`

По итогам ревью окна. `play()` с `AbortError` (пауза, перемотка, удаление) — не поломка записи. Сохранение
правки, закончившееся после того, как начали править другую реплику, не закрывает чужую правку, а его ошибка уходит в
боковую панель; уход в другую программу (Alt+Tab) правку не сохраняет. Неудачное перечитывание текста (OneDrive ещё
пишет файл) не стирает показанный текст и открытую правку; ответ на более ранний запрос не затирает свежую правку.
Меню спикера закрывается повторным щелчком по имени и не сбрасывает фокус при перерисовке; стрелки в меню — с первого
или последнего пункта (`menu-keys.ts`); фокус после меню, окон подтверждения и правки возвращается туда, откуда их
открыли. Подсветка поиска в открытой встрече — по запросу, который уже искали (не на каждую букву), переход к реплике
забывается вместе с поиском; найденная реплика прокручивается точно. Курсор правки встаёт на место щелчка и в тексте с
подсветкой.

- [ ] **Step 1: Тесты**

**В `e2e/library.spec.ts` заменить:**

```ts
    tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
    ...overrides,
  }),
  audio: { 'mic.webm': 6 },
});

async function openMeeting(page: Page, title = 'Созвон с Ириной'): Promise<void> {
```

**на:**

```ts
    tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
    ...overrides,
  }),
  // 10 с: после перехода к 0:04 запись успеет поиграть, пока тест проверяет её.
  audio: { 'mic.webm': 10 },
});

async function openMeeting(page: Page, title = 'Созвон с Ириной'): Promise<void> {
```

**В `e2e/library.spec.ts` заменить:**

```ts
  await expect(text.locator('.row')).toHaveCount(2);
  // Спикер 2 остался без реплик — из строки «Спикеры» он исчез.
  await expect(page.getByLabel('Спикеры')).not.toContainText('Спикер 2');
  await expect(page.getByRole('status')).toContainText('Реплика 0:04 удалена');
  await expect.poll(async () => (await pollTranscript(libraryDir))?.segments.length).toBe(2);

  await page.getByRole('button', { name: 'Вернуть' }).click();
```

**на:**

```ts
  await expect(text.locator('.row')).toHaveCount(2);
  // Спикер 2 остался без реплик — из строки «Спикеры» он исчез.
  await expect(page.getByLabel('Спикеры')).not.toContainText('Спикер 2');
  await expect(text.getByRole('status')).toContainText('Реплика 0:04 удалена');
  await expect.poll(async () => (await pollTranscript(libraryDir))?.segments.length).toBe(2);

  await page.getByRole('button', { name: 'Вернуть' }).click();
```

**В `e2e/library.spec.ts` заменить:**

```ts
  await field.fill('   ');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
});

test('a speaker is renamed in the whole meeting, and the same name merges two speakers', async () => {
```

**на:**

```ts
  await field.fill('   ');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
  expect((await pollMeetingJson(libraryDir, ID))?.title).toBe('Бюджет на октябрь');
});

test('a speaker is renamed in the whole meeting, and the same name merges two speakers', async () => {
```

**В `e2e/library.spec.ts` заменить:**

```ts
    .poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.speakerId))
    .toEqual(['s3', 's2', 's2']);

  // Esc закрывает меню без изменений.
  await rows.nth(2).getByRole('button', { name: 'Спикер 2', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('«Удалить аудио» moves the audio to the trash and keeps the text', async () => {
```

**на:**

```ts
    .poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.speakerId))
    .toEqual(['s3', 's2', 's2']);

  // Esc закрывает меню без изменений, повторный щелчок по имени — тоже.
  const who = rows.nth(2).getByRole('button', { name: 'Спикер 2', exact: true });
  await who.click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(who).toBeFocused();
  await who.click();
  await expect(menu).toBeVisible();
  await who.click();
  await expect(menu).toBeHidden();
});

test('«Удалить аудио» moves the audio to the trash and keeps the text', async () => {
```

**Создать `src/renderer/main/menu-keys.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { menuFocusStep } from './menu-keys';

describe('menuFocusStep', () => {
  it('goes round the menu', () => {
    expect(menuFocusStep(0, 3, 1)).toBe(1);
    expect(menuFocusStep(2, 3, 1)).toBe(0);
    expect(menuFocusStep(0, 3, -1)).toBe(2);
  });

  it('starts at the first item going down and at the last going up when nothing is focused', () => {
    expect(menuFocusStep(-1, 3, 1)).toBe(0);
    expect(menuFocusStep(-1, 3, -1)).toBe(2);
  });

  it('has nowhere to go in an empty menu', () => {
    expect(menuFocusStep(-1, 0, 1)).toBe(-1);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/menu-keys.test.ts`
Ожидается: FAIL — нет модуля `./menu-keys`; сквозной тест: меню спикера не закрывается повторным щелчком.

- [ ] **Step 3: Код**

**В `src/renderer/main/App.tsx` заменить:**

```tsx

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

export function App() {
  const recording = useRecordingState() ?? IDLE_RECORDING_STATE;
  const { entries, error: listError } = useMeetings();
```

**на:**

```tsx

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

/** Один и тот же пустой список: новый [] перерисовывал бы каждую реплику открытой встречи. */
const NO_WORDS: readonly string[] = [];

export function App() {
  const recording = useRecordingState() ?? IDLE_RECORDING_STATE;
  const { entries, error: listError } = useMeetings();
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  const [focus, setFocus] = useState<SearchView['focus']>(null);
  const searching = isSearchable(query);
  const search = useSearch(query);
  const searchView = useMemo<SearchView>(
    () => ({ words: searching ? queryWords(query) : [], focus: searching ? focus : null }),
    [query, searching, focus],
  );

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
```

**на:**

```tsx
  const [focus, setFocus] = useState<SearchView['focus']>(null);
  const searching = isSearchable(query);
  const search = useSearch(query);
  // Подсветка — по запросу, ответ на который уже пришёл (после паузы набора), а не на каждую нажатую букву.
  const searched =
    searching && (search.kind === 'ready' || search.kind === 'searching') ? (search.result?.query ?? '') : '';
  const searchView = useMemo<SearchView>(
    () => ({ words: searched ? queryWords(searched) : NO_WORDS, focus: searching ? focus : null }),
    [searched, searching, focus],
  );
  const changeQuery = (next: string) => {
    setQuery(next);
    // Поиск закончен — забыть реплику, к которой переходили: у нового поиска её нет.
    if (!isSearchable(next)) setFocus(null);
  };

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
              {error}
            </p>
          )}
          <SearchBox value={query} onChange={setQuery} />
          {searching ? (
            <SearchResults
              state={search}
```

**на:**

```tsx
              {error}
            </p>
          )}
          <SearchBox value={query} onChange={changeQuery} />
          {searching ? (
            <SearchResults
              state={search}
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
import { errorText } from './errors';
import { deleteAudioText } from './format';
import { FolderIcon, MoreIcon, MuteIcon, TrashIcon } from './icons';

interface Props {
  meeting: Meeting;
```

**на:**

```tsx
import { errorText } from './errors';
import { deleteAudioText } from './format';
import { FolderIcon, MoreIcon, MuteIcon, TrashIcon } from './icons';
import { menuFocusStep } from './menu-keys';

interface Props {
  meeting: Meeting;
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [audioBytes, setAudioBytes] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
```

**на:**

```tsx
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [audioBytes, setAudioBytes] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
    }
  };

  const pick = (next: Confirm) => {
    setOpen(false);
    setConfirm(next);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      setOpen(false);
    }
  };
```

**на:**

```tsx
    }
  };

  /** Окно подтверждения запоминает, откуда его открыли: фокус — на «Ещё», а не на исчезающий пункт меню. */
  const pick = (next: Confirm) => {
    button.current?.focus();
    setOpen(false);
    setAudioBytes(null);
    setConfirm(next);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[menuFocusStep(at, items.length, event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      button.current?.focus();
      setOpen(false);
    }
  };
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
  return (
    <div ref={wrap} className="more-wrap">
      <button
        type="button"
        className="btn sq-btn"
        aria-label="Ещё"
```

**на:**

```tsx
  return (
    <div ref={wrap} className="more-wrap">
      <button
        ref={button}
        type="button"
        className="btn sq-btn"
        aria-label="Ещё"
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
            className="mi"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.textmeet.openMeetingDir(meeting.id).catch((err: unknown) => onError(errorText(err)));
            }}
```

**на:**

```tsx
            className="mi"
            role="menuitem"
            onClick={() => {
              button.current?.focus();
              setOpen(false);
              window.textmeet.openMeetingDir(meeting.id).catch((err: unknown) => onError(errorText(err)));
            }}
```

**В `src/renderer/main/MeetingTitle.tsx` заменить:**

```tsx
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(title);
    field.current?.select();
    // Только при входе в правку.
  }, [editing]);

  if (!editing) {
    return (
      <h1>
        <button type="button" className="title-btn" aria-description="Переименовать встречу" onClick={() => setEditing(true)}>
          {title}
          <PencilIcon />
        </button>
```

**на:**

```tsx
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  const shown = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  /** Закончили клавишей — фокус возвращается на название. */
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing) {
      if (refocus.current) shown.current?.focus();
      refocus.current = false;
      return;
    }
    done.current = false;
    setDraft(title);
    field.current?.select();
    // Только при входе в правку и выходе из неё.
  }, [editing]);

  if (!editing) {
    return (
      <h1>
        <button
          ref={shown}
          type="button"
          className="title-btn"
          aria-description="Переименовать встречу"
          onClick={() => setEditing(true)}
        >
          {title}
          <PencilIcon />
        </button>
```

**В `src/renderer/main/MeetingTitle.tsx` заменить:**

```tsx
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            setEditing(false);
          }
        }}
```

**на:**

```tsx
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            refocus.current = true;
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            refocus.current = true;
            setEditing(false);
          }
        }}
```

**Заменить всё содержимое `src/renderer/main/SegmentText.tsx` на:**

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findRanges, normalize } from '../../shared/search-text';
import { errorText } from './errors';
import { Marked } from './SearchResults';

interface Props {
  text: string;
  /** Слова поиска — подсветить в тексте. */
  words: readonly string[];
  /** Можно править (не идёт расшифровка заново). */
  editable: boolean;
  editing: boolean;
  /** Щелчок по тексту: начать правку. */
  onStartEditing(): void;
  onStopEditing(): void;
  /** Сохранить; пустой текст удаляет реплику. Ошибка — исключением (её покажем под полем). */
  onSave(text: string): Promise<void>;
  /** Сохранение не удалось, когда правят уже другую реплику: показать ошибку там, где её увидят. */
  onLostError(message: string): void;
}

/** Где в тексте щёлкнули — туда же встанет курсор в поле правки (с подсветкой поиска текст разбит на куски). */
function caretOffset(element: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) return null;
  const range = document.createRange();
  range.setStart(element, 0);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

/**
 * Текст реплики. Щелчок — поле правки того же шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc —
 * отменить, уход из поля — сохранить (но не уход в другую программу). Выделение мышью (чтобы скопировать) правку
 * не начинает.
 */
export function SegmentText({
  text,
  words,
  editable,
  editing,
  onStartEditing,
  onStopEditing,
  onSave,
  onLostError,
}: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const shownText = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  /** Сохранение уже идёт или правка закончена: уход из поля после Enter второй раз не сохраняет. */
  const done = useRef(false);
  /** Правку закончили клавишей — фокус возвращается на текст реплики. */
  const refocus = useRef(false);
  const editingNow = useRef(editing);
  editingNow.current = editing;

  // До отрисовки поля: без мелькания прежнего черновика и с курсором там, где щёлкнули.
  useLayoutEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(text);
    setError(null);
    setSaving(false);
    // Только при входе в правку: текст во время правки снаружи не меняется — правят только здесь.
  }, [editing]);

  useEffect(() => {
    if (editing) {
      const el = field.current;
      if (!el) return;
      el.focus();
      const at = Math.min(caret.current ?? el.value.length, el.value.length);
      el.setSelectionRange(at, at);
      return;
    }
    if (refocus.current) {
      refocus.current = false;
      shownText.current?.focus();
    }
  }, [editing]);

  if (!editing) {
    const shown = words.length > 0 ? <Marked text={text} ranges={findRanges(normalize(text), words)} /> : text;
    if (!editable) return <div className="say">{shown}</div>;
    return (
      <div
        ref={shownText}
        className="say editable"
        role="button"
        tabIndex={0}
        aria-description="Щёлкните, чтобы исправить текст"
        onClick={(e) => {
          // Человек выделил кусок, чтобы скопировать, — это не просьба править.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          caret.current = caretOffset(e.currentTarget);
          onStartEditing();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          caret.current = null;
          onStartEditing();
        }}
      >
        {shown}
      </div>
    );
  }

  const save = async (byKey: boolean) => {
    if (done.current) return;
    done.current = true;
    refocus.current = byKey;
    if (draft.trim() === text) {
      onStopEditing();
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      onStopEditing();
    } catch (err) {
      done.current = false;
      refocus.current = false;
      setSaving(false);
      // Пока сохранялось, человек ушёл править другую реплику — показываем ошибку в боковой панели.
      if (!editingNow.current) {
        onLostError(errorText(err));
        return;
      }
      setError(errorText(err));
      field.current?.focus();
    }
  };

  return (
    <div>
      <textarea
        ref={field}
        className="say-edit"
        aria-label="Текст реплики"
        value={draft}
        maxLength={20_000}
        readOnly={saving}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          // Ушли в другую программу (Alt+Tab) — правка остаётся открытой, а не сохраняется на полуслове.
          if (document.hasFocus()) void save(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            refocus.current = true;
            onStopEditing();
          }
        }}
      />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : (
        <div className="edit-hint">Enter — сохранить · Esc — отменить · Shift+Enter — новая строка</div>
      )}
    </div>
  );
}
```

**В `src/renderer/main/SpeakerMenu.tsx` заменить:**

```tsx
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SpeakerId } from '../../shared/transcript';
import { PlusIcon } from './icons';
import { speakerTone } from './transcription-format';

export interface SpeakerOption {
```

**на:**

```tsx
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SpeakerId } from '../../shared/transcript';
import { PlusIcon } from './icons';
import { menuFocusStep } from './menu-keys';
import { speakerTone } from './transcription-format';

export interface SpeakerOption {
```

**В `src/renderer/main/SpeakerMenu.tsx` заменить:**

```tsx
  options: readonly SpeakerOption[];
  current: SpeakerId;
  onPick(speakerId: SpeakerId | 'new'): void;
  onClose(): void;
}

/** «Кто говорит в этой реплике?» — меню под именем спикера (лист 11 макета). Стрелки, Enter, Esc. */
export function SpeakerMenu({ options, current, onPick, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    // Щелчок мимо меню закрывает его.
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };
```

**на:**

```tsx
  options: readonly SpeakerOption[];
  current: SpeakerId;
  onPick(speakerId: SpeakerId | 'new'): void;
  /** returnFocus — закрыли с клавиатуры: фокус вернуть на имя спикера. */
  onClose(returnFocus: boolean): void;
}

/** «Кто говорит в этой реплике?» — меню под именем спикера (лист 11 макета). Стрелки, Enter, Esc. */
export function SpeakerMenu({ options, current, onPick, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  // Последний onClose: подписка ставится один раз, при открытии (иначе каждая перерисовка реплики сбрасывала бы
  // фокус на текущего спикера).
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    // Щелчок мимо меню закрывает его; по имени спикера — нет: имя само закрывает меню.
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.parentElement?.contains(event.target as Node)) close.current(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[menuFocusStep(at, items.length, event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    }
  };
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { speakerLabel, type SpeakerId, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
```

**на:**

```tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { speakerLabel, type SpeakerId, type Transcript, type TranscriptSegment } from '../../shared/transcript';
import type { TranscriptEdit } from '../../shared/transcript-edit';
import { errorText } from './errors';
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
  setEditing: ((segmentId: string | null) => void) | null;
  onSaveText(segment: TranscriptSegment, text: string): Promise<void>;
  /** Спикеры встречи для меню «Кто говорит». */
  speakers: readonly SpeakerOption[];
```

**на:**

```tsx
  onPlayAt: ((seconds: number) => void) | null;
  editing: boolean;
  /** null — реплику не править. */
  setEditing: Dispatch<SetStateAction<string | null>> | null;
  onError(message: string): void;
  onSaveText(segment: TranscriptSegment, text: string): Promise<void>;
  /** Спикеры встречи для меню «Кто говорит». */
  speakers: readonly SpeakerOption[];
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  menuOpen,
  setMenuFor,
  onPickSpeaker,
}: RowProps) {
  const time = formatTimestamp(segment.start);
  const tone = speakerTone(segment.speakerId);
  return (
```

**на:**

```tsx
  menuOpen,
  setMenuFor,
  onPickSpeaker,
  onError,
}: RowProps) {
  const who = useRef<HTMLButtonElement>(null);
  const time = formatTimestamp(segment.start);
  const tone = speakerTone(segment.speakerId);
  return (
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
        {setEditing ? (
          <div className="who-wrap">
            <button
              type="button"
              className={`who whob ${tone}`}
              aria-haspopup="menu"
```

**на:**

```tsx
        {setEditing ? (
          <div className="who-wrap">
            <button
              ref={who}
              type="button"
              className={`who whob ${tone}`}
              aria-haspopup="menu"
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
              <SpeakerMenu
                options={speakers}
                current={segment.speakerId}
                onClose={() => setMenuFor(null)}
                onPick={(speakerId) => {
                  setMenuFor(null);
                  onPickSpeaker(segment, speakerId);
                }}
              />
```

**на:**

```tsx
              <SpeakerMenu
                options={speakers}
                current={segment.speakerId}
                onClose={(returnFocus) => {
                  setMenuFor(null);
                  if (returnFocus) who.current?.focus();
                }}
                onPick={(speakerId) => {
                  setMenuFor(null);
                  who.current?.focus();
                  onPickSpeaker(segment, speakerId);
                }}
              />
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
          onStopEditing={() => setEditing?.(null)}
          onSave={(text) => onSaveText(segment, text)}
        />
      </div>
    </div>
```

**на:**

```tsx
          editable={setEditing !== null}
          editing={editing}
          onStartEditing={() => setEditing?.(segment.id)}
          // Только свою правку: пока эта сохранялась, могли начать править другую реплику.
          onStopEditing={() => setEditing?.((current) => (current === segment.id ? null : current))}
          onSave={(text) => onSaveText(segment, text)}
          onLostError={onError}
        />
      </div>
    </div>
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
  const editing = editingId !== null;
  const foundId = focus?.segmentId ?? null;

  // Перешли из найденного — показать реплику посередине.
  useEffect(() => {
    if (!focus) return;
    const row = box.current?.querySelector(`[data-segment="${CSS.escape(focus.segmentId)}"]`);
    row?.scrollIntoView({ block: 'center' });
    lastManualScroll.current = Date.now();
  }, [focus]);

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
```

**на:**

```tsx
  const editing = editingId !== null;
  const foundId = focus?.segmentId ?? null;

  // Перешли из найденного — показать реплику посередине. Реплики выше раскладываются только при прокрутке
  // (content-visibility) и сдвигают её — поэтому ещё раз в следующем кадре.
  useEffect(() => {
    if (!focus) return;
    const show = () => {
      const row = box.current?.querySelector(`[data-segment="${CSS.escape(focus.segmentId)}"]`);
      row?.scrollIntoView({ block: 'center' });
    };
    show();
    const frame = requestAnimationFrame(show);
    lastManualScroll.current = Date.now();
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  // Звучит следующая реплика — показать её, если человек не листает текст сам и не правит реплику.
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
            menuOpen={segment.id === menuFor}
            setMenuFor={setMenuFor}
            onPickSpeaker={pickSpeaker}
          />
        ))}
        {removed && (
```

**на:**

```tsx
            menuOpen={segment.id === menuFor}
            setMenuFor={setMenuFor}
            onPickSpeaker={pickSpeaker}
            onError={onError}
          />
        ))}
        {removed && (
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const set = useCallback(
    (transcript: Transcript) => setState({ meetingId, load: { kind: 'ready', transcript } }),
    [meetingId],
  );
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
  }, [meetingId, status, running, focusCount]);
  return [state?.meetingId === meetingId ? state.load : { kind: 'loading' }, set];
}
```

**на:**

```ts
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  // Номер последнего запроса: ответ на более ранний (например, перечитывание при возврате в окно, начатое до
  // правки) не затирает более свежий текст.
  const latest = useRef(0);
  const set = useCallback(
    (transcript: Transcript) => {
      latest.current += 1;
      setState({ meetingId, load: { kind: 'ready', transcript } });
    },
    [meetingId],
  );
  useEffect(() => {
    const request = ++latest.current;
    const done = (load: TranscriptLoad) => {
      if (request !== latest.current) return;
      setState((current) => {
        // Перечитать не вышло (OneDrive ещё пишет файл) — показанный текст и открытая правка остаются.
        const shown = current?.meetingId === meetingId && current.load.kind === 'ready';
        return shown && load.kind !== 'ready' ? current : { meetingId, load };
      });
    };
    window.textmeet
      .getTranscript(meetingId)
      .then((transcript) => done(transcript ? { kind: 'ready', transcript } : { kind: 'none' }))
      .catch((err: unknown) => done({ kind: 'error', message: errorText(err) }));
  }, [meetingId, status, running, focusCount]);
  return [state?.meetingId === meetingId ? state.load : { kind: 'loading' }, set];
}
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  // Другая встреча — плеер с нуля.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(fallbackDuration);
    setFailed(false);
  }, [meetingId, fallbackDuration]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  const play = useCallback((el: HTMLAudioElement) => {
    void el.play().catch(() => setFailed(true));
  }, []);
  // Постоянная функция: её получает каждая реплика, и новая функция перерисовывала бы весь текст при игре.
  const seekAndPlay = useCallback(
```

**на:**

```ts
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  // Другая встреча — плеер с нуля (длительность из meeting.json может уточниться во время игры — это не повод).
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(fallbackDuration);
    setFailed(false);
  }, [meetingId]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  // AbortError — воспроизведение прервали (пауза, перемотка, удаление аудио): это не поломка записи.
  const play = useCallback((el: HTMLAudioElement) => {
    void el.play().catch((err: unknown) => {
      if ((err as Error | null)?.name !== 'AbortError') setFailed(true);
    });
  }, []);
  // Постоянная функция: её получает каждая реплика, и новая функция перерисовывала бы весь текст при игре.
  const seekAndPlay = useCallback(
```

**Создать `src/renderer/main/menu-keys.ts`:**

```ts
/**
 * Куда перейти стрелкой в меню: по кругу; если ни один пункт не в фокусе — на первый (вниз) или последний (вверх).
 * at — номер пункта в фокусе (-1 — никакой), count — сколько пунктов, step — 1 вниз, -1 вверх.
 */
export function menuFocusStep(at: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (at < 0) return step === 1 ? 0 : count - 1;
  return (at + step + count) % count;
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
}

.undo-err {
  color: var(--rec-soft);
}

/* Название встречи: щелчок — переименовать. */
```

**на:**

```css
}

.undo-err {
  color: var(--btn-text);
  opacity: 0.8;
}

/* Название встречи: щелчок — переименовать. */
```

**В `src/renderer/main/styles.css` заменить:**

```css
  font-size: 12px;
}

/* Реплика, к которой перешли из найденного. */
.row.found {
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
```

**на:**

```css
  font-size: 12px;
}

/* Реплика, к которой перешли из найденного; раскладывается сразу — к ней прокручивают. */
.row.found {
  box-shadow: inset 0 0 0 1.5px var(--accent);
  content-visibility: visible;
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  804 passed (804)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `41 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: editing, menus, playback and search highlights after review"
```

### Task 15: Сборка на GitHub (Windows и Mac)

Отправка ветки — действие наружу: **спросить пользователя перед `git push`**.

- [ ] **Step 1: Отправить ветку** (после «да» пользователя)

```bash
git push -u origin plan-4-library
```

- [ ] **Step 2: Сборка** — `build.yml` есть на `main`, запускается на ветке:

```bash
gh workflow run build.yml --ref plan-4-library
gh run list -w build -L 1
gh run watch <id> --exit-status
```

Ожидается: оба задания (`windows-latest`, `macos-latest`) зелёные — модульные тесты, сквозные (в том числе
`e2e/library.spec.ts`; в тестах «Корзина» — папка `TEXTMEET_TEST_TRASH`), проверка собранной программы.

### Task 16: Ручная проверка на Windows и Mac (контрольная точка с пользователем)

Собранные программы — артефакты запуска `build.yml` из Task 15 (`TextMeet-windows`, `TextMeet-mac`). Дать пользователю
простой список и дождаться ответа. На каждой машине, на настоящей расшифрованной встрече:

1. Щелчок по времени реплики — запись играет с этого места, звучащая реплика подсвечена жёлтым, текст идёт за звуком;
   если пролистать текст колёсиком, он не прыгает обратно.
2. Щелчок по тексту реплики — поле правки; исправить слово, Enter — сохранилось (закрыть и открыть встречу — правка на
   месте). Esc — отмена.
3. Стереть реплику целиком, Enter — она исчезла, внизу «Реплика … удалена · Вернуть»; «Вернуть» — она на месте.
4. Щелчок по названию встречи — переименовать; новое название и в списке слева.
5. Щелчок по «Спикер 1» в строке «Спикеры» — дать имя; оно у всех его реплик. Дать «Спикеру 2» то же имя —
   окно «Объединить…» — после «Объединить» в списке один спикер.
6. Щелчок по имени над репликой — выбрать другого спикера; «Новый собеседник» — появился «Спикер N».
7. Поиск слева: слово из встречи (с другой буквой «ё/е» и в другом падеже) — найдено; щелчок — встреча открыта на этой
   реплике, слово подсвечено; крестик — снова список встреч.
8. «…» → «Удалить аудио…» у ненужной встречи — плеер пропал, текст остался, папка `audio` — в Корзине системы.
9. «…» → «Удалить встречу…» у ненужной встречи — встречи нет в списке, её папка — в Корзине.
10. Записать две короткие встречи подряд, не отвечая в первом окне «Запись остановлена», — после ответа в первом
    появляется второе.

Записать ответы (что прошло, что нет) — они нужны в Task 17.

### Task 17: Документы, память и слияние

- [ ] **Step 1: `docs/superpowers/plan-4-checks.md`** — как `plan-7-checks.md`: что проверено (Task 16 по пунктам на
  Windows и Mac, ссылка на запуск из Task 15), что исправлено по ревью сверх первой версии прототипа, и «Отложено»:
  пункты из раздела «Известные ограничения» в начале плана и всё, что найдёт Task 16.
- [ ] **Step 2: Спецификация** — §3.4: поиск — вместо списка слева; правка — щелчок по тексту, время — слушать;
  смена спикера у реплики и объединение одинаковым именем; переименование встречи; удаление папки, которую не удалось
  прочитать. §5.6: `audioDeleted` в `meeting.json`, `editedAt` в `transcript.json`; запись файлов встречи по очереди;
  индекс поиска перечитывает изменившиеся встречи. §6: «Корзина недоступна». **Дорожная карта** — строка Плана 4:
  «выполнен» со ссылками на решения, план и проверки; следующий — План 5.
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: record plan 4 checks and mark plan 4 done"
```

- [ ] **Step 4: Слияние** (спросить пользователя перед `git push`)

```bash
git checkout main
git merge --no-ff plan-4-library -m "Merge plan 4: library"
npm ci
npm run typecheck
npm test
git push origin main
gh run list -w ci -L 1
```

Ожидается: `ci` на `main` зелёный.

- [ ] **Step 5: Память** — в `textmeet-project.md`: План 4 выполнен, дальше по дорожной карте — Планы 5, 6, 8.
