# TextMeet — План 5: импорт и экспорт

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавлять записи из файлов (кнопка «Импорт файла» и перетаскивание в окно: записи созвонов, диктофон телефона, любое аудио и видео) — встреча под датой записи файла, окно «Файл добавлен», расшифровка; выгружать текст встречи: «Скопировать всё», «Сохранить в Word (.docx)…», «Сохранить как текст (.txt)…».

**Architecture:** Импорт — очередь в main (`src/main/import/importer.ts`): файл проверяется `ffmpeg -i` (`probe.ts`), встреча создаётся сразу в состоянии `importing`, первая звуковая дорожка копируется без перекодирования в `audio/source.mka` (`audio-copy.ts`; Matroska принимает почти любой кодек, иначе — Opus), дальше — сведение и окно «Файл добавлен» в общей очереди окон `RecordingController`. Встреча из файла — одна дорожка `file`: расшифровка делит её по голосам, как запись без звука компьютера. Экспорт — одна раскладка текста (`src/shared/export-doc.ts`) для буфера обмена (текст + HTML), .txt и .docx (`src/main/export/`, библиотека `docx`); буфер обмена и окна сохранения — в main.

**Tech Stack:** Node 24, Electron 44.4.5, electron-vite 5.0.0, React 19.3, TypeScript 7.0.2, zod 4.6.5, ffmpeg-static 5.3.0, docx 9.8.1, Vitest 5.0.2, Playwright 1.63.0, GitHub Actions.

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md) — §3.2, §3.4, §5.6, §6. **Решения Плана 5:** [2026-10-05-textmeet-plan-5-design.md](../specs/2026-10-05-textmeet-plan-5-design.md). **Макет:** [Макет TextMeet](https://claude.ai/artifact/Urmc3atvSFifUpDyBzjeR6), листы 12–16. «Отложено» прошлых планов: [Плана 3](../plan-3-checks.md), [Плана 4](../plan-4-checks.md).

---

## Факты, на которые опирается план (проверены 2026-10-05 на черновом прототипе)

Весь код этого плана собран и прогнан в черновой копии ветки `plan-5-import-export` на Windows 11: 927 модульных
тестов, 57 сквозных (+1 пропущенный — проверка собранной программы). После каждой задачи проверка типов и модульные
тесты проходят. Два независимых ревью кода (main и окно) нашли недочёты — они исправлены в Task 12 и Task 13 и закрыты
тестами. Внешний вид новых частей проверен снимками в светлой и тёмной теме.

- **`ffmpeg -i <файл>` без выходного файла** печатает сведения о входном и завершается с кодом 1 — это не ошибка;
  `runFfmpeg` для этого не подходит (он отклоняет ненулевой код), поэтому у разбора свой запуск (`ffmpegInfo`).
- **Matroska (`-c:a copy -f matroska`) принимает почти любой звуковой кодек как есть** — проверено на aac, mp3, opus,
  vorbis, flac, alac, pcm, amr, wma, ac3, adpcm, g722, и ffmpeg читает их обратно. Не принимает, например, Nellymoser из
  FLV — для этого перекодирование в Opus (им же проверяется запасной путь в тестах).
- **Файлы для тестов делает ffmpeg-static** только встроенными кодеками (`mpeg4`, `aac`, `nellymoser`): libx264 и
  кодеры amr есть не во всех сборках ffmpeg для Mac и Linux.
- **Буфер обмена в Electron 44 асинхронный:** `clipboard.write([new ClipboardItem({ 'text/plain': …, 'text/html': … })])`,
  чтение — `clipboard.readText()` / `clipboard.read()` (в сквозных тестах — через `app.evaluate`).
- **`docx` 9.8.1 работает через `require`** (главный процесс собирается в CommonJS, пакет внешний для electron-vite).
  Тесты распаковывают .docx пакетом `jszip` (добавлен в devDependencies).
- **Путь перетащенного файла — только `webUtils.getPathForFile`** (в окне с песочницей `File.path` нет). У файла,
  созданного в тесте (`new File(...)`), пути нет — сквозные тесты проверяют затемнение и сообщение «Не удалось получить
  путь к файлу», а настоящий импорт — через «Импорт файла» с подменённым окном выбора (`dialog.showOpenDialog` в main).
  Перетаскивание в тесте — только после того, как окно отрисовалось: обработчики вешаются в `useEffect`.
- **Окна выбора и сохранения файлов в сквозных тестах подменяются в main** (`app.evaluate(({ dialog }) => …)`) — настоящие
  системные окна в тестах некому закрыть.
- **На этом компьютере установлен TextMeet**, он держит `Ctrl+Space`: проверка «Сбросить» в `e2e/hotkey.spec.ts`
  локально падает, пока установленная программа запущена (не закрывать её по имени процесса — это программа
  пользователя). На GitHub проверка проходит.
- **Файлы в рабочей копии — с окончаниями CRLF** (`core.autocrlf=true`), в блоках плана — LF: заменяйте блоки
  инструментом правки (он сопоставляет строки без учёта окончаний), а не побайтовыми скриптами.

## Известные ограничения (в «Отложено» проверок Плана 5)

- Версия программы до Плана 5 покажет встречу в состоянии `importing` или с дорожкой `file` как «не удалось прочитать»
  (библиотека у пользователя локальная, обе машины обновляются вместе).
- Удаление встречи во время импорта проверено модульными тестами (ffmpeg в сквозном тесте не задержать).
- Когда копирование как есть не вышло и звук перекодируется, полоска хода начинается заново.
- Если диск заполнен, но свободно больше 50 МБ (квоты), причина неудачи — «файл повреждён или его формат не
  поддерживается».
- Сохранение выгрузки не атомарное: сбой посреди записи оставит неполный файл под выбранным именем (зато файл, открытый
  в Word, даёт понятное «файл занят другой программой»).
- Название из имени файла без расширения, но с точками («Встреча 2026.10.05») теряет хвост после последней точки.
- Окно может прислать в `import:files` любой полный путь (в том числе сетевой): программа только читает такой файл.
- Строка ошибки слева, как и раньше, закрывается только следующим действием.

## Что сознательно не входит в План 5

- ИИ, «Скопировать для ИИ», итоги ИИ в выгрузке — План 6. Экспорт в Markdown и субтитры, выгрузка звука, склейка
  нескольких файлов в одну встречу — не делаются.

## Карта файлов

```
src/shared/meeting.ts, settings.ts, recording.ts   # importing, дорожка file, sourceFileName, exportDir, окно kind
src/shared/export-doc.ts                 # раскладка текста: buildExportDoc, toPlainText, toHtml
src/shared/format.ts                     # formatLongDate, formatTimestamp (переехали из окна)
src/shared/import.ts                     # ImportProgress, ImportResult, расширения для окна выбора
src/main/export/docx.ts, file-name.ts, export-meeting.ts   # Word, имя файла, «Скопировать всё» и «Сохранить…»
src/main/import/probe.ts, naming.ts      # сведения о файле, дата записи, название
src/main/import/audio-copy.ts            # звук файла → audio/source.mka (как есть или Opus)
src/main/import/importer.ts              # очередь импорта, отмена, выход, прерванный импорт
src/main/audio/ffmpeg.ts                 # onProgress
src/main/transcription/routing.ts, queue.ts, pipeline.ts   # дорожка file; отказ встрече importing
src/main/recording/controller.ts         # queueDialog, «Файл добавлен», уведомление «не началась»
src/main/library/library.ts, meeting-delete.ts             # createMeeting с длительностью; удаление отменяет импорт
src/main/fs/fs-errors.ts, texts.ts       # humanFsReason; тексты
src/shared/ipc.ts, src/preload/index.ts, src/main/ipc.ts, src/main/index.ts   # каналы import:* и export:*
src/test-support/media-files.ts          # небольшие аудио- и видеофайлы для тестов
src/renderer/main/App.tsx, hooks.ts      # «Импорт файла», перетаскивание, ход импорта
src/renderer/main/import-format.ts, format.ts, MeetingList.tsx, MeetingPane.tsx, MeetingMenu.tsx
src/renderer/main/StopDialog.tsx, ParticipantsPicker.tsx, TranscribeDialog.tsx   # окно «Файл добавлен»
src/renderer/main/ExportMenu.tsx, icons.tsx, styles.css    # «Экспорт»
e2e/helpers.ts, e2e/import.spec.ts, e2e/export.spec.ts
```

## Задачи

Ветка — `plan-5-import-export` (на ней уже документ решений). Проверка после каждой задачи: `npm run typecheck`, затем
`npx vitest run`; где указано — сквозные тесты (`npm run build`, затем `npx playwright test`).

### Task 1: Данные встречи из файла и папка выгрузки

**Files:**
- Modify: `src/main/texts.ts`, `src/main/transcription/pipeline.test.ts`, `src/main/transcription/pipeline.ts`, `src/main/transcription/queue.test.ts`, `src/main/transcription/queue.ts`, `src/main/transcription/routing.test.ts`, `src/main/transcription/routing.ts`, `src/renderer/main/format.test.ts`, `src/renderer/main/format.ts`, `src/shared/meeting.test.ts`, `src/shared/meeting.ts`, `src/shared/recording.ts`, `src/shared/settings.test.ts`, `src/shared/settings.ts`

В `meeting.json` — состояние `importing` (звук из файла ещё копируется), вид дорожки `file` (единственная
дорожка встречи из файла, `audio/source.mka`) и `sourceFileName` (имя исходного файла, по умолчанию `null`). В
настройках — `exportDir` (папка последнего сохранения выгрузки). Расшифровка: дорожка `file` — как запись без звука
компьютера: все голоса — «Спикер N», деление по подсказке числа людей; очередь отказывает встрече `importing`. В списке
у такой встречи пока просто «импорт…» (ход появится в Task 10).

- [ ] **Step 1: Тесты**

**В `src/main/transcription/pipeline.test.ts` заменить:**

```ts
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.5 };

interface Setup {
  audio: Partial<Record<'mic' | 'system', Float32Array>>;
  turns?: Turn[];
  prints?: (samples: Float32Array) => Float32Array | null;
  threads?: () => number;
```

**на:**

```ts
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.5 };

interface Setup {
  audio: Partial<Record<TrackInput['kind'], Float32Array>>;
  turns?: Turn[];
  prints?: (samples: Float32Array) => Float32Array | null;
  threads?: () => number;
```

**В `src/main/transcription/pipeline.test.ts` заменить:**

```ts
    expect(result.speakers.map((s) => s.kind)).toEqual(['other', 'other']);
  });

  it('recreates the recognizer when the number of threads changes', async () => {
    let threads = 4;
    const { deps, recognizerThreads } = setup({
```

**на:**

```ts
    expect(result.speakers.map((s) => s.kind)).toEqual(['other', 'other']);
  });

  it('a meeting from a file: everyone on its one track becomes «Спикер N»', async () => {
    const file: TrackInput = { kind: 'file', file: 'source.mka', offsetSec: 0 };
    const { deps, diarize } = setup({
      audio: { file: signal(10, [{ start: 0, end: 2 }, { start: 4, end: 6 }]) },
      turns: [
        { start: 0, end: 2, speaker: 0 },
        { start: 4, end: 6, speaker: 1 },
      ],
    });
    const result = await runPipeline(input({ tracks: [file], recordedSystem: false, participantsHint: 2, durationSec: 10 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), 2);
    expect(result.segments.map((s) => s.speakerId)).toEqual(['s1', 's2']);
    expect(result.speakers.map((s) => s.kind)).toEqual(['other', 'other']);
  });

  it('recreates the recognizer when the number of threads changes', async () => {
    let threads = 4;
    const { deps, recognizerThreads } = setup({
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
import type { TranscriptionProgress } from '../../shared/transcription';
import { makeTempDir } from '../../test-support/temp-dir';
import { withFileLock } from '../library/file-lock';
import { audioDir, createMeeting, readMeeting, updateMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import { describeError, type Logger } from '../logger';
import { DownloadError } from '../models/download';
```

**на:**

```ts
import type { TranscriptionProgress } from '../../shared/transcription';
import { makeTempDir } from '../../test-support/temp-dir';
import { withFileLock } from '../library/file-lock';
import { audioDir, createMeeting, listMeetings, readMeeting, updateMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import { describeError, type Logger } from '../logger';
import { DownloadError } from '../models/download';
```

**В `src/main/transcription/queue.test.ts` заменить:**

```ts
    await expect(setup().queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.stillRecording);
  });

  it('notes a track that could not be read and keeps the text of the other one', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
```

**на:**

```ts
    await expect(setup().queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.stillRecording);
  });

  it('refuses a meeting whose file is still being copied and does not resume it', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'importing', source: 'import' });
    const t = setup();
    await expect(t.queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.stillImporting);
    t.queue.resume(lib, await listMeetings(lib));
    expect(t.queue.progress()).toEqual([]);
    expect((await readMeeting(lib, meeting.id)).status).toBe('importing');
  });

  it('notes a track that could not be read and keeps the text of the other one', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
```

**В `src/main/transcription/routing.test.ts` заменить:**

```ts
    expect(planTracks([system], true, 3)).toEqual([{ track: system, role: 'others', diarize: { mode: 'fixed', speakers: 2 } }]);
  });

  it('nothing to transcribe', () => {
    expect(planTracks([], false, 2)).toEqual([]);
  });
```

**на:**

```ts
    expect(planTracks([system], true, 3)).toEqual([{ track: system, role: 'others', diarize: { mode: 'fixed', speakers: 2 } }]);
  });

  it('a meeting from a file: one track for everyone, split by the number of people', () => {
    const file: TrackInput = { kind: 'file', file: 'source.mka', offsetSec: 0 };
    expect(planTracks([file], false, 3)).toEqual([{ track: file, role: 'others', diarize: { mode: 'fixed', speakers: 3 } }]);
    expect(planTracks([file], false, null)[0]?.diarize).toEqual({ mode: 'auto' });
    expect(planTracks([file], false, 1)[0]?.diarize).toEqual({ mode: 'none' });
  });

  it('nothing to transcribe', () => {
    expect(planTracks([], false, 2)).toEqual([]);
  });
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
  tracks: [],
  recovered: false,
  audioDeleted: false,
  ...patch,
});
```

**на:**

```ts
  tracks: [],
  recovered: false,
  audioDeleted: false,
  sourceFileName: null,
  ...patch,
});
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
    expect(meetingNote(meeting('a', at, { status: 'queued' }))?.text).toBe('в очереди на расшифровку');
    expect(meetingNote(meeting('a', at, { status: 'transcribing' }))?.text).toBe('расшифровка…');
    expect(meetingNote(meeting('a', at, { status: 'error' }))).toEqual({ text: 'ошибка', tone: 'error' });
  });

  it('shows the progress of transcription and its errors', () => {
```

**на:**

```ts
    expect(meetingNote(meeting('a', at, { status: 'queued' }))?.text).toBe('в очереди на расшифровку');
    expect(meetingNote(meeting('a', at, { status: 'transcribing' }))?.text).toBe('расшифровка…');
    expect(meetingNote(meeting('a', at, { status: 'error' }))).toEqual({ text: 'ошибка', tone: 'error' });
    expect(meetingNote(meeting('a', at, { status: 'importing', source: 'import' }))).toEqual({
      text: 'импорт…',
      tone: 'accent',
    });
  });

  it('shows the progress of transcription and its errors', () => {
```

**В `src/shared/meeting.test.ts` заменить:**

```ts
  tracks: [],
  recovered: false,
  audioDeleted: false,
};

describe('MEETING_ID_PATTERN', () => {
```

**на:**

```ts
  tracks: [],
  recovered: false,
  audioDeleted: false,
  sourceFileName: null,
};

describe('MEETING_ID_PATTERN', () => {
```

**В `src/shared/meeting.test.ts` заменить:**

```ts
    expect(MeetingSchema.parse(valid)).toEqual(valid);
  });

  it('reads a meeting written by the previous version (no tracks, no recovered and audioDeleted flags)', () => {
    const { tracks: _tracks, recovered: _recovered, audioDeleted: _audioDeleted, ...old } = valid;
    expect(MeetingSchema.parse(old)).toEqual(valid);
  });

  it('keeps fields it does not know (written by a newer version)', () => {
    const parsed = MeetingSchema.parse({ ...valid, summaryLanguage: 'ru', extra: { a: 1 } });
    expect(parsed).toMatchObject({ summaryLanguage: 'ru', extra: { a: 1 } });
```

**на:**

```ts
    expect(MeetingSchema.parse(valid)).toEqual(valid);
  });

  it('reads a meeting written by the previous version (no tracks, flags and source file name)', () => {
    const { tracks: _tracks, recovered: _recovered, audioDeleted: _audioDeleted, sourceFileName: _name, ...old } = valid;
    expect(MeetingSchema.parse(old)).toEqual(valid);
  });

  it('accepts a meeting from a file that is still being copied', () => {
    const imported = { ...valid, source: 'import', status: 'importing', sourceFileName: 'Созвон с Ириной.mp4' };
    expect(MeetingSchema.parse(imported)).toEqual(imported);
    const tracks = [{ kind: 'file', file: 'source.mka', startOffsetMs: 0 }];
    expect(MeetingSchema.parse({ ...imported, status: 'recorded', tracks }).tracks).toEqual(tracks);
  });

  it('rejects an empty or too long source file name', () => {
    expect(MeetingSchema.safeParse({ ...valid, sourceFileName: '' }).success).toBe(false);
    expect(MeetingSchema.safeParse({ ...valid, sourceFileName: 'a'.repeat(256) }).success).toBe(false);
  });

  it('keeps fields it does not know (written by a newer version)', () => {
    const parsed = MeetingSchema.parse({ ...valid, summaryLanguage: 'ru', extra: { a: 1 } });
    expect(parsed).toMatchObject({ summaryLanguage: 'ru', extra: { a: 1 } });
```

**В `src/shared/settings.test.ts` заменить:**

```ts
      recordHotkey: null,
      recordSounds: true,
      asrModel: 'gigaam-v3-e2e-rnnt',
    });
  });
```

**на:**

```ts
      recordHotkey: null,
      recordSounds: true,
      asrModel: 'gigaam-v3-e2e-rnnt',
      exportDir: null,
    });
  });
```

**В `src/shared/settings.test.ts` заменить:**

```ts
    expect(SettingsSchema.parse({ asrModel: 42 }).asrModel).toBe('gigaam-v3-e2e-rnnt');
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
```

**на:**

```ts
    expect(SettingsSchema.parse({ asrModel: 42 }).asrModel).toBe('gigaam-v3-e2e-rnnt');
  });

  it('keeps the folder of the last export', () => {
    expect(SettingsSchema.parse({ exportDir: '/Users/kirill/Documents' }).exportDir).toBe('/Users/kirill/Documents');
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
```

**В `src/shared/settings.test.ts` заменить:**

```ts
    expect(SettingsSchema.safeParse({ microphoneId: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
  });
});
```

**на:**

```ts
    expect(SettingsSchema.safeParse({ microphoneId: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ exportDir: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/transcription/pipeline.test.ts src/main/transcription/queue.test.ts src/main/transcription/routing.test.ts src/renderer/main/format.test.ts src/shared/meeting.test.ts src/shared/settings.test.ts`
Ожидается: FAIL — нет состояния `importing`, вида дорожки `file`, полей `sourceFileName` и `exportDir`.

- [ ] **Step 3: Код**

**В `src/main/texts.ts` заменить:**

```ts
/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  audioDeleted: 'Аудио этой встречи удалено — расшифровать её заново нельзя.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
```

**на:**

```ts
/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  stillImporting: 'Звук из файла ещё копируется — расшифровать встречу можно после импорта.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  audioDeleted: 'Аудио этой встречи удалено — расшифровать её заново нельзя.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
```

**В `src/main/transcription/pipeline.ts` заменить:**

```ts
  }
}

const TRACK_NAMES: Record<TrackKind, string> = { mic: 'микрофон', system: 'звук компьютера' };

/**
 * Собеседники по порядку первого появления в готовой расшифровке: «Спикер 1» — тот, кто первым что-то сказал.
```

**на:**

```ts
  }
}

const TRACK_NAMES: Record<TrackKind, string> = { mic: 'микрофон', system: 'звук компьютера', file: 'файл' };

/**
 * Собеседники по порядку первого появления в готовой расшифровке: «Спикер 1» — тот, кто первым что-то сказал.
```

**В `src/main/transcription/queue.ts` заменить:**

```ts
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
        if (m.status === 'recording') throw new Error(transcriptionTexts.stillRecording);
        if (m.audioDeleted) throw new Error(transcriptionTexts.audioDeleted);
        return {
          ...m,
```

**на:**

```ts
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
        if (m.status === 'recording') throw new Error(transcriptionTexts.stillRecording);
        if (m.status === 'importing') throw new Error(transcriptionTexts.stillImporting);
        if (m.audioDeleted) throw new Error(transcriptionTexts.audioDeleted);
        return {
          ...m,
```

**В `src/main/transcription/routing.ts` заменить:**

```ts
 * План по дорожкам.
 * - Запись со звуком компьютера: микрофон — «Я»; звук компьютера — собеседники, их на одного меньше, чем участников.
 * - Запись без звука компьютера (живая встреча): микрофон слышит всех — делится по голосам, все — «Спикер N».
 * recordedSystem — писался ли звук компьютера (есть ли дорожка system в meeting.json), даже если её файл пуст.
 */
export function planTracks(
```

**на:**

```ts
 * План по дорожкам.
 * - Запись со звуком компьютера: микрофон — «Я»; звук компьютера — собеседники, их на одного меньше, чем участников.
 * - Запись без звука компьютера (живая встреча): микрофон слышит всех — делится по голосам, все — «Спикер N».
 * - Встреча из файла: одна общая дорожка — как живая встреча, «Я» не выделяется.
 * recordedSystem — писался ли звук компьютера (есть ли дорожка system в meeting.json), даже если её файл пуст.
 */
export function planTracks(
```

**В `src/main/transcription/routing.ts` заменить:**

```ts
  recordedSystem: boolean,
  participantsHint: number | null,
): TrackPlan[] {
  const mic = tracks.find((t) => t.kind === 'mic');
  const system = tracks.find((t) => t.kind === 'system');
  if (!recordedSystem) {
```

**на:**

```ts
  recordedSystem: boolean,
  participantsHint: number | null,
): TrackPlan[] {
  const file = tracks.find((t) => t.kind === 'file');
  if (file) return [{ track: file, role: 'others', diarize: othersMode(participantsHint) }];
  const mic = tracks.find((t) => t.kind === 'mic');
  const system = tracks.find((t) => t.kind === 'system');
  if (!recordedSystem) {
```

**В `src/renderer/main/format.ts` заменить:**

```ts
 */
export function meetingNote(meeting: Meeting, progress?: TranscriptionProgress): MeetingNote | null {
  switch (meeting.status) {
    case 'recording':
      return { text: 'идёт запись', tone: 'live' };
    case 'recorded':
```

**на:**

```ts
 */
export function meetingNote(meeting: Meeting, progress?: TranscriptionProgress): MeetingNote | null {
  switch (meeting.status) {
    case 'importing':
      return { text: 'импорт…', tone: 'accent' };
    case 'recording':
      return { text: 'идёт запись', tone: 'live' };
    case 'recorded':
```

**В `src/shared/meeting.ts` заменить:**

```ts

export const MeetingIdSchema = z.string().regex(MEETING_ID_PATTERN);
export const MeetingSourceSchema = z.enum(['recording', 'import']);
export const MeetingStatusSchema = z.enum(['recording', 'recorded', 'queued', 'transcribing', 'done', 'error']);
export const TrackKindSchema = z.enum(['mic', 'system']);

/** Дорожка записи: файл в папке audio/ и сдвиг её начала от начала самой ранней дорожки. */
export const TrackSchema = z.object({
```

**на:**

```ts

export const MeetingIdSchema = z.string().regex(MEETING_ID_PATTERN);
export const MeetingSourceSchema = z.enum(['recording', 'import']);
/** importing — звук из файла ещё копируется в папку встречи (План 5). */
export const MeetingStatusSchema = z.enum(['importing', 'recording', 'recorded', 'queued', 'transcribing', 'done', 'error']);
/** file — единственная дорожка встречи из файла (импорт). */
export const TrackKindSchema = z.enum(['mic', 'system', 'file']);

/** Дорожка записи: файл в папке audio/ и сдвиг её начала от начала самой ранней дорожки. */
export const TrackSchema = z.object({
```

**В `src/shared/meeting.ts` заменить:**

```ts
  recovered: z.boolean().default(false),
  /** Аудио удалили (в Корзину), текст остался. Дорожек у такой встречи нет. */
  audioDeleted: z.boolean().default(false),
});

export type Meeting = z.infer<typeof MeetingSchema>;
```

**на:**

```ts
  recovered: z.boolean().default(false),
  /** Аудио удалили (в Корзину), текст остался. Дорожек у такой встречи нет. */
  audioDeleted: z.boolean().default(false),
  /** Имя исходного файла встречи из файла (без пути); null — встреча записана программой. */
  sourceFileName: z.string().min(1).max(255).nullable().default(null),
});

export type Meeting = z.infer<typeof MeetingSchema>;
```

**В `src/shared/recording.ts` заменить:**

```ts
// Типы записи, общие для main, окна записи и главного окна. Без zod и пакетов: модуль попадает в preload.
import type { TrackKind } from './meeting';

export const TRACK_FILES: Record<TrackKind, string> = { mic: 'mic.webm', system: 'system.webm' };
/** Сведение дорожек для прослушивания. */
export const MIX_FILE = 'mix.opus';
/** Делений в индикаторе уровня. */
```

**на:**

```ts
// Типы записи, общие для main, окна записи и главного окна. Без zod и пакетов: модуль попадает в preload.
import type { TrackKind } from './meeting';

/** Файл дорожки в папке audio/ по её виду; file — звук встречи из файла (импорт). */
export const TRACK_FILES: Record<TrackKind, string> = { mic: 'mic.webm', system: 'system.webm', file: 'source.mka' };
/** Сведение дорожек для прослушивания. */
export const MIX_FILE = 'mix.opus';
/** Делений в индикаторе уровня. */
```

**В `src/shared/settings.ts` заменить:**

```ts
   * из-за одного поля остальные настройки не сбрасываются.
   */
  asrModel: z.enum(ASR_MODEL_IDS).default(DEFAULT_ASR_MODEL).catch(DEFAULT_ASR_MODEL),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

**на:**

```ts
   * из-за одного поля остальные настройки не сбрасываются.
   */
  asrModel: z.enum(ASR_MODEL_IDS).default(DEFAULT_ASR_MODEL).catch(DEFAULT_ASR_MODEL),
  /** Папка, куда последний раз сохраняли выгрузку встречи; null — «Документы». */
  exportDir: z.string().min(1).nullable().default(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  831 passed (831)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: data for imported meetings and the export folder"
```

### Task 2: Одна раскладка текста встречи для копирования и выгрузки

**Files:**
- Create: `src/shared/export-doc.test.ts`, `src/shared/export-doc.ts`
- Modify: `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/SearchResults.tsx`, `src/renderer/main/TranscriptView.tsx`, `src/renderer/main/format.test.ts`, `src/renderer/main/format.ts`, `src/renderer/main/transcription-format.test.ts`, `src/renderer/main/transcription-format.ts`, `src/shared/format.test.ts`, `src/shared/format.ts`

`shared/export-doc.ts` — чистые функции: `buildExportDoc` (название, строка «27 сентября 2026, 16:20 · 32 мин»,
«Участники: …» в порядке первого появления, абзацы — подряд идущие реплики одного спикера склеиваются, время — начало
первой), `toPlainText` (переводы строк — какие скажут) и `toHtml` (имена жирным, время серым, всё экранируется).
`formatLongDate` и `formatTimestamp` переезжают из окна в `shared/format.ts` — окно и выгрузка пишут дату и время
одинаково.

- [ ] **Step 1: Тесты**

**В `src/renderer/main/format.test.ts` заменить:**

```ts
  formatClock,
  formatDuration,
  formatDurationWithSeconds,
  formatLongDate,
  formatTimeOfDay,
  groupByDay,
  hotkeyKeys,
```

**на:**

```ts
  formatClock,
  formatDuration,
  formatDurationWithSeconds,
  formatTimeOfDay,
  groupByDay,
  hotkeyKeys,
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
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
```

**на:**

```ts
});

describe('dates', () => {
  it('formats the time of day in local time', () => {
    expect(formatTimeOfDay(new Date(2026, 8, 27, 16, 5).toISOString())).toBe('16:05');
  });

  it('shows a dash for garbage', () => {
    expect(formatTimeOfDay('вчера')).toBe('—');
  });
});
```

**В `src/renderer/main/transcription-format.test.ts` заменить:**

```ts
import type { TranscriptionProgress } from '../../shared/transcription';
import {
  barFraction,
  formatTimestamp,
  percent,
  progressView,
  speakerTone,
```

**на:**

```ts
import type { TranscriptionProgress } from '../../shared/transcription';
import {
  barFraction,
  percent,
  progressView,
  speakerTone,
```

**В `src/renderer/main/transcription-format.test.ts` заменить:**

```ts
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
```

**на:**

```ts
  ...patch,
});

describe('stageText', () => {
  it('names every stage', () => {
    expect(stageText(progress({ stage: 'queued' }))).toBe('В очереди на расшифровку');
```

**Создать `src/shared/export-doc.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from './export-doc';
import type { TranscriptSegment } from './transcript';

const createdAt = new Date(2026, 8, 27, 16, 20).toISOString();
const meeting = { title: 'Созвон с Ириной', createdAt, durationSec: 32 * 60 + 15, speakerNames: { s1: 'Ирина' } };

let n = 0;
const seg = (start: number, speakerId: string, text: string): TranscriptSegment => ({
  id: `seg-${++n}`,
  start,
  end: start + 3,
  speakerId,
  text,
  edited: false,
});

describe('buildExportDoc', () => {
  it('joins replicas of one speaker in a row into a paragraph with the time of the first', () => {
    const doc = buildExportDoc(meeting, {
      segments: [
        seg(708, 's1', 'Смотри, по бюджету на октябрь у нас остаётся примерно половина.'),
        seg(715, 's1', 'Подрядчиков считаем отдельно.'),
        seg(724, 'me', 'Понял. А что с дизайном?'),
        seg(730, 's2', 'Ответ нужен до пятницы.'),
        seg(735, 'me', 'Хорошо.'),
      ],
    });
    expect(doc).toEqual({
      title: 'Созвон с Ириной',
      metaLine: '27 сентября 2026, 16:20 · 32 мин',
      participantsLine: 'Участники: Ирина, Я, Спикер 2',
      paragraphs: [
        {
          speaker: 'Ирина',
          time: '11:48',
          text: 'Смотри, по бюджету на октябрь у нас остаётся примерно половина. Подрядчиков считаем отдельно.',
        },
        { speaker: 'Я', time: '12:04', text: 'Понял. А что с дизайном?' },
        { speaker: 'Спикер 2', time: '12:10', text: 'Ответ нужен до пятницы.' },
        { speaker: 'Я', time: '12:15', text: 'Хорошо.' },
      ],
    });
  });

  it('writes hours for a long meeting and leaves out an unknown duration', () => {
    const doc = buildExportDoc({ ...meeting, durationSec: null }, { segments: [seg(3725, 'me', 'Итак.')] });
    expect(doc.metaLine).toBe('27 сентября 2026, 16:20');
    expect(doc.paragraphs[0]?.time).toBe('1:02:05');
  });

  it('skips empty replicas and joins the ones around them', () => {
    const doc = buildExportDoc(meeting, {
      segments: [seg(1, 's1', 'Раз.'), seg(2, 'me', '   '), seg(3, 's1', 'Два.')],
    });
    expect(doc.paragraphs).toEqual([{ speaker: 'Ирина', time: '0:01', text: 'Раз. Два.' }]);
    expect(doc.participantsLine).toBe('Участники: Ирина');
  });

  it('a meeting without replicas has no participants and no paragraphs', () => {
    const doc = buildExportDoc(meeting, { segments: [] });
    expect(doc.participantsLine).toBeNull();
    expect(doc.paragraphs).toEqual([]);
  });

  it('names a speaker once even if two ids carry the same name', () => {
    const doc = buildExportDoc({ ...meeting, speakerNames: { s1: 'Ирина', s2: 'Ирина' } }, {
      segments: [seg(1, 's1', 'Раз.'), seg(2, 's2', 'Два.')],
    });
    expect(doc.participantsLine).toBe('Участники: Ирина');
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['Раз.', 'Два.']);
  });
});

const doc: ExportDoc = {
  title: 'Созвон с Ириной',
  metaLine: '27 сентября 2026, 16:20 · 32 мин',
  participantsLine: 'Участники: Ирина, Я',
  paragraphs: [
    { speaker: 'Ирина', time: '11:48', text: 'Смотри.' },
    { speaker: 'Я', time: '12:04', text: 'Понял.\nА что с дизайном?' },
  ],
};

describe('toPlainText', () => {
  it('writes the title, the date, the participants and the paragraphs', () => {
    expect(toPlainText(doc)).toBe(
      [
        'Созвон с Ириной',
        '27 сентября 2026, 16:20 · 32 мин',
        'Участники: Ирина, Я',
        '',
        'Ирина [11:48]',
        'Смотри.',
        '',
        'Я [12:04]',
        'Понял.',
        'А что с дизайном?',
        '',
      ].join('\n'),
    );
  });

  it('uses the line ending it is given, also inside a replica', () => {
    const text = toPlainText(doc, '\r\n');
    expect(text).toContain('Понял.\r\nА что с дизайном?\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('a meeting without replicas is just the title and the date', () => {
    expect(toPlainText({ ...doc, participantsLine: null, paragraphs: [] })).toBe(
      'Созвон с Ириной\n27 сентября 2026, 16:20 · 32 мин\n',
    );
  });
});

describe('toHtml', () => {
  it('makes names bold and times grey', () => {
    const html = toHtml(doc);
    expect(html).toContain('<b>Ирина</b> <span style="color:#8a8a8a">[11:48]</span>');
    expect(html).toContain('Понял.<br>А что с дизайном?');
    expect(html.indexOf('Созвон с Ириной')).toBeLessThan(html.indexOf('Участники'));
  });

  it('escapes everything that came from people', () => {
    const html = toHtml({
      title: '<script>alert(1)</script>',
      metaLine: 'a & b',
      participantsLine: 'Участники: "Q"',
      paragraphs: [{ speaker: '<i>Ира</i>', time: '0:01', text: '1 < 2 & 3 > 2' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('&quot;Q&quot;');
    expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2');
  });
});
```

**В `src/shared/format.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { formatBytes, formatDownloaded, formatDurationShort, formatMegabytes } from './format';

describe('formatDurationShort', () => {
  it.each([
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDownloaded,
  formatDurationShort,
  formatLongDate,
  formatMegabytes,
  formatTimestamp,
} from './format';

describe('formatDurationShort', () => {
  it.each([
```

**В `src/shared/format.test.ts` заменить:**

```ts
  });
});

describe('formatDownloaded', () => {
  it('counts in megabytes', () => {
    expect(formatDownloaded(120.4 * 1024 * 1024, 464 * 1024 * 1024)).toBe('120 из 464 МБ');
```

**на:**

```ts
  });
});

describe('formatLongDate', () => {
  it('formats the long date in local time', () => {
    expect(formatLongDate(new Date(2026, 8, 27, 16, 5).toISOString())).toBe('27 сентября 2026, 16:05');
  });

  it('shows a dash for garbage', () => {
    expect(formatLongDate('вчера')).toBe('—');
  });
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

describe('formatDownloaded', () => {
  it('counts in megabytes', () => {
    expect(formatDownloaded(120.4 * 1024 * 1024, 464 * 1024 * 1024)).toBe('120 из 464 МБ');
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/format.test.ts src/renderer/main/transcription-format.test.ts src/shared/export-doc.test.ts src/shared/format.test.ts`
Ожидается: FAIL — нет модуля `./export-doc`, нет `formatLongDate` и `formatTimestamp` в `shared/format.ts`.

- [ ] **Step 3: Код**

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import { hasManualChanges, isStaleEditMessage, type TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { formatLongDate, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
```

**на:**

```tsx
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort, formatLongDate } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import { hasManualChanges, isStaleEditMessage, type TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
```

**В `src/renderer/main/SearchResults.tsx` заменить:**

```tsx
import type { SearchMeeting } from '../../shared/search';
import { searchFoundText, searchMeetingMeta } from './format';
import type { SearchState } from './hooks';
import { formatTimestamp, speakerTone } from './transcription-format';

/** Текст с подсвеченными совпадениями. */
export function Marked({ text, ranges }: { text: string; ranges: readonly TextRange[] }) {
```

**на:**

```tsx
import type { SearchMeeting } from '../../shared/search';
import { searchFoundText, searchMeetingMeta } from './format';
import type { SearchState } from './hooks';
import { formatTimestamp } from '../../shared/format';
import { speakerTone } from './transcription-format';

/** Текст с подсвеченными совпадениями. */
export function Marked({ text, ranges }: { text: string; ranges: readonly TextRange[] }) {
```

**В `src/renderer/main/TranscriptView.tsx` заменить:**

```tsx
import { SegmentText } from './SegmentText';
import { SpeakerChips } from './SpeakerChips';
import { SpeakerMenu, type SpeakerOption } from './SpeakerMenu';
import { formatTimestamp, speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
```

**на:**

```tsx
import { SegmentText } from './SegmentText';
import { SpeakerChips } from './SpeakerChips';
import { SpeakerMenu, type SpeakerOption } from './SpeakerMenu';
import { formatTimestamp } from '../../shared/format';
import { speakerTone } from './transcription-format';

interface Props {
  transcript: Transcript;
```

**В `src/renderer/main/format.ts` заменить:**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import { formatBytes, formatDurationShort } from '../../shared/format';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';

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
```

**на:**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import { formatBytes, formatDurationShort, MONTHS_GENITIVE } from '../../shared/format';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';

const pad = (n: number): string => String(n).padStart(2, '0');

/** 75 → «1:15», 3725 → «1:02:05», неизвестно → «—». Для таймера и плеера. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
```

**В `src/renderer/main/format.ts` заменить:**

```ts
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
```

**на:**

```ts
  return Number.isNaN(d.getTime()) ? '—' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 1 участник, 2 участника, 5 участников, 21 участник. */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
```

**В `src/renderer/main/transcription-format.ts` заменить:**

```ts
import type { MeetingStatus } from '../../shared/meeting';
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

/** Доля → целые проценты 0–100 (и для NaN — 0). */
export const percent = (fraction: number): number =>
  Number.isNaN(fraction) ? 0 : Math.round(Math.min(1, Math.max(0, fraction)) * 100);
```

**на:**

```ts
import type { MeetingStatus } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';

/** Доля → целые проценты 0–100 (и для NaN — 0). */
export const percent = (fraction: number): number =>
  Number.isNaN(fraction) ? 0 : Math.round(Math.min(1, Math.max(0, fraction)) * 100);
```

**Создать `src/shared/export-doc.ts`:**

```ts
// Выгрузка встречи: одна раскладка текста для «Скопировать всё», .txt и .docx (решения Плана 5, §2.3).
// Чистые функции без зависимостей: тексту в буфере обмена, в .txt и в Word не разойтись.
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

export interface ExportDoc {
  title: string;
  /** «27 сентября 2026, 16:20 · 32 мин»; длительность неизвестна — только дата. */
  metaLine: string;
  /** «Участники: Я, Ирина, Спикер 2» — в порядке первого появления; реплик нет — null. */
  participantsLine: string | null;
  paragraphs: ExportParagraph[];
}

/** Подряд идущие реплики одного спикера — один абзац; пустые реплики пропускаются. */
export function buildExportDoc(
  meeting: Pick<Meeting, 'title' | 'createdAt' | 'durationSec' | 'speakerNames'>,
  transcript: Pick<Transcript, 'segments'>,
): ExportDoc {
  const paragraphs: (ExportParagraph & { speakerId: string })[] = [];
  for (const segment of transcript.segments) {
    const text = segment.text.trim();
    if (text === '') continue;
    const last = paragraphs.at(-1);
    if (last && last.speakerId === segment.speakerId) {
      last.text = `${last.text} ${text}`;
      continue;
    }
    paragraphs.push({
      speakerId: segment.speakerId,
      speaker: speakerLabel(segment.speakerId, meeting.speakerNames),
      time: formatTimestamp(segment.start),
      text,
    });
  }
  const participants = [...new Set(paragraphs.map((p) => p.speaker))];
  const meta = [formatLongDate(meeting.createdAt)];
  if (meeting.durationSec !== null) meta.push(formatDurationShort(meeting.durationSec));
  return {
    title: meeting.title,
    metaLine: meta.join(' · '),
    participantsLine: participants.length > 0 ? `Участники: ${participants.join(', ')}` : null,
    paragraphs: paragraphs.map(({ speaker, time, text }) => ({ speaker, time, text })),
  };
}

/** Обычный текст: шапка, пустая строка, абзацы «Имя [время]» + текст через пустую строку. */
export function toPlainText(doc: ExportDoc, eol = '\n'): string {
  const lines = [doc.title, doc.metaLine];
  if (doc.participantsLine) lines.push(doc.participantsLine);
  for (const p of doc.paragraphs) lines.push('', `${p.speaker} [${p.time}]`, p.text);
  return lines.join('\n').replace(/\r?\n/g, eol) + eol;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlLines = (text: string): string => escapeHtml(text).replace(/\r?\n/g, '<br>');

/** Оформленный текст для буфера обмена (вставка в Word, Google Docs): имена жирным, время серым. */
export function toHtml(doc: ExportDoc): string {
  const parts = [
    `<h1 style="font-size:16pt">${htmlLines(doc.title)}</h1>`,
    `<p style="color:#7a7a7a">${htmlLines(doc.metaLine)}</p>`,
  ];
  if (doc.participantsLine) parts.push(`<p>${htmlLines(doc.participantsLine)}</p>`);
  for (const p of doc.paragraphs) {
    parts.push(
      `<p><b>${htmlLines(p.speaker)}</b> <span style="color:#8a8a8a">[${escapeHtml(p.time)}]</span><br>${htmlLines(p.text)}</p>`,
    );
  }
  return parts.join('\n');
}
```

**В `src/shared/format.ts` заменить:**

```ts
// Форматирование для людей, общее для main (уведомления, диалоги) и окон.
const pad = (n: number): string => String(n).padStart(2, '0');

/** Длительность для списка и уведомлений: «меньше минуты», «42 мин», «1 ч 04 мин». */
export function formatDurationShort(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
```

**на:**

```ts
// Форматирование для людей, общее для main (уведомления, диалоги) и окон.
const pad = (n: number): string => String(n).padStart(2, '0');

/** Месяцы в родительном падеже: «27 сентября». */
export const MONTHS_GENITIVE = [
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

/** «27 сентября 2026, 16:20» (местное время). */
export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Время реплики: «1:05», «12:04», «1:02:05». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Длительность для списка и уведомлений: «меньше минуты», «42 мин», «1 ч 04 мин». */
export function formatDurationShort(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  843 passed (843)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: one layout of the meeting text for copying and export"
```

### Task 3: Word-файл и безопасное имя файла

**Files:**
- Create: `src/main/export/docx.test.ts`, `src/main/export/docx.ts`, `src/main/export/file-name.test.ts`, `src/main/export/file-name.ts`
- Modify: `package.json`, `package-lock.json`

`main/export/docx.ts` собирает .docx библиотекой `docx` (MIT, работает и через `require` — главный процесс
собирается в CommonJS): Calibri, русский язык документа, название 16 пт жирным, дата серым, имя жирным, время серым,
перевод строки внутри реплики — разрыв строки Word. `file-name.ts` — имя файла по названию встречи: запрещённые в
Windows и macOS символы — пробел, точки и пробелы по краям убираются, имена устройств Windows (CON, COM1…) получают «_»,
не больше 120 символов (эмодзи не режется), пустое — «Встреча».

- [ ] **Step 1: Зависимости**

```bash
npm install --save-exact docx@9.8.1
npm install --save-dev --save-exact jszip@3.10.2
```

Ожидается: в `package.json` — `"docx": "9.8.1"` в `dependencies` и `"jszip": "3.10.2"` в `devDependencies` (им тесты распаковывают .docx).

- [ ] **Step 2: Тесты**

**Создать `src/main/export/docx.test.ts`:**

```ts
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ExportDoc } from '../../shared/export-doc';
import { toDocx } from './docx';

const doc: ExportDoc = {
  title: 'Созвон с Ириной',
  metaLine: '27 сентября 2026, 16:20 · 32 мин',
  participantsLine: 'Участники: Ирина, Я',
  paragraphs: [
    { speaker: 'Ирина', time: '11:48', text: 'Смотри, по бюджету.' },
    { speaker: 'Я', time: '12:04', text: 'Понял.\nА что с дизайном?' },
  ],
};

async function unpack(buffer: Buffer): Promise<{ document: string; styles: string; core: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const read = (name: string): Promise<string> => {
    const file = zip.file(name);
    if (!file) throw new Error(`в .docx нет ${name}`);
    return file.async('string');
  };
  return { document: await read('word/document.xml'), styles: await read('word/styles.xml'), core: await read('docProps/core.xml') };
}

describe('toDocx', () => {
  it('makes a Word file with the title, the date and every paragraph', async () => {
    const { document, core } = await unpack(await toDocx(doc));
    for (const text of ['Созвон с Ириной', '27 сентября 2026, 16:20 · 32 мин', 'Участники: Ирина, Я', 'Смотри, по бюджету.']) {
      expect(document).toContain(text);
    }
    expect(core).toContain('Созвон с Ириной');
  });

  it('writes names in bold and times in grey', async () => {
    const { document } = await unpack(await toDocx(doc));
    expect(document).toMatch(/<w:r><w:rPr><w:b\/>(?:(?!<\/w:r>).)*<w:t[^>]*>Ирина<\/w:t><\/w:r>/s);
    expect(document).toMatch(/<w:color w:val="8A8A8A"\/>(?:(?!<\/w:r>).)*<w:t[^>]*> \[11:48\]<\/w:t>/s);
  });

  it('keeps a line break inside a replica', async () => {
    const { document } = await unpack(await toDocx(doc));
    expect(document).toMatch(/Понял\.<\/w:t><\/w:r><w:r>(?:(?!<\/w:r>).)*<w:br\/>(?:(?!<\/w:r>).)*А что с дизайном\?/s);
  });

  it('uses Calibri and Russian for spelling', async () => {
    const { styles } = await unpack(await toDocx(doc));
    expect(styles).toContain('Calibri');
    expect(styles).toContain('ru-RU');
  });

  it('a meeting without replicas is just the title and the date', async () => {
    const { document } = await unpack(await toDocx({ ...doc, participantsLine: null, paragraphs: [] }));
    expect(document).toContain('Созвон с Ириной');
    expect(document).not.toContain('Участники');
  });
});
```

**Создать `src/main/export/file-name.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { exportFileName } from './file-name';

describe('exportFileName', () => {
  it('names the file after the meeting', () => {
    expect(exportFileName('Созвон с Ириной', 'docx')).toBe('Созвон с Ириной.docx');
  });

  it('replaces characters that Windows and macOS do not allow in names', () => {
    expect(exportFileName('План: Q4 / бюджет? "черновик" <v2>|*', 'txt')).toBe('План Q4 бюджет черновик v2.txt');
    expect(exportFileName('a\u0000b\tc\nd', 'txt')).toBe('a b c d.txt');
  });

  it('removes dots and spaces at the ends', () => {
    expect(exportFileName('  ..Итоги...  ', 'txt')).toBe('Итоги.txt');
  });

  it('keeps reserved Windows names from turning into devices', () => {
    expect(exportFileName('CON', 'txt')).toBe('CON_.txt');
    expect(exportFileName('com1', 'docx')).toBe('com1_.docx');
    expect(exportFileName('Console', 'txt')).toBe('Console.txt');
  });

  it('shortens a long title without cutting a letter in half', () => {
    const name = exportFileName('😀'.repeat(200), 'txt');
    expect(Array.from(name.replace(/\.txt$/, ''))).toHaveLength(120);
    expect(name).toBe(`${'😀'.repeat(120)}.txt`);
  });

  it('falls back to «Встреча» when nothing is left', () => {
    expect(exportFileName('???', 'docx')).toBe('Встреча.docx');
    expect(exportFileName(' . ', 'txt')).toBe('Встреча.txt');
  });
});
```

- [ ] **Step 3: Тесты падают**

Run: `npx vitest run src/main/export/docx.test.ts src/main/export/file-name.test.ts`
Ожидается: FAIL — нет модулей `./docx` и `./file-name`.

- [ ] **Step 4: Код**

**Создать `src/main/export/docx.ts`:**

```ts
// «Сохранить в Word (.docx)»: та же раскладка, что у .txt и буфера обмена (shared/export-doc.ts), с оформлением.
import { Document, Packer, Paragraph, TextRun, type IRunOptions } from 'docx';
import type { ExportDoc } from '../../shared/export-doc';

/** Шрифт, который есть в Word и на Windows, и на Mac. */
const FONT = 'Calibri';
/** Размеры в Word — в половинах пункта. */
const BODY_SIZE = 22;
const TITLE_SIZE = 32;
const META_GREY = '7A7A7A';
const TIME_GREY = '8A8A8A';
/** Отступ перед абзацем говорящего — в двадцатых долях пункта (10 пт). */
const PARAGRAPH_GAP = 200;

/** Перевод строки внутри текста — разрыв строки в Word (как Shift+Enter). */
const lines = (text: string, options: Omit<IRunOptions, 'text' | 'break'> = {}): TextRun[] =>
  text.split(/\r?\n/).map((line, i) => new TextRun({ ...options, text: line, ...(i > 0 && { break: 1 }) }));

export async function toDocx(doc: ExportDoc): Promise<Buffer> {
  const children = [
    new Paragraph({ children: lines(doc.title, { bold: true, size: TITLE_SIZE }), spacing: { after: 60 } }),
    new Paragraph({ children: lines(doc.metaLine, { color: META_GREY }) }),
  ];
  if (doc.participantsLine) children.push(new Paragraph({ children: lines(doc.participantsLine) }));
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

**Создать `src/main/export/file-name.ts`:**

```ts
// Имя файла выгрузки по названию встречи — такое, что его примут и Windows, и macOS.

/** Не больше стольких символов в имени без расширения: путь к «Документам» тоже занимает место. */
const MAX_NAME_CHARS = 120;
const FALLBACK_NAME = 'Встреча';
/** Запрещённые в именах файлов Windows (на macOS — «/» и «:») и управляющие символы. */
const FORBIDDEN = /[<>:"/\|?*\u0000-\u001f\u007f]/g;
/** Имена устройств Windows: файл «CON.txt» создать нельзя. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const trimEnds = (name: string): string => name.replace(/^[.\s]+|[.\s]+$/g, '');

export function exportFileName(title: string, ext: 'docx' | 'txt'): string {
  let name = trimEnds(title.replace(FORBIDDEN, ' ').replace(/\s+/g, ' '));
  // По символам, а не по UTF-16: эмодзи не режется пополам.
  name = trimEnds(Array.from(name).slice(0, MAX_NAME_CHARS).join(''));
  if (name === '') name = FALLBACK_NAME;
  if (RESERVED.test(name)) name = `${name}_`;
  return `${name}.${ext}`;
}
```

- [ ] **Step 5: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  854 passed (854)`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Word file and a safe file name for the export"
```

### Task 4: «Скопировать всё» и «Сохранить…» в main

**Files:**
- Create: `src/main/export/export-meeting.test.ts`, `src/main/export/export-meeting.ts`
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`

`export-meeting.ts`: текст и имена берутся из файлов встречи на диске. «Скопировать всё» кладёт в буфер
обмена обычный и оформленный текст одной записью (в Electron 44 буфер обмена асинхронный: `clipboard.write([new
ClipboardItem({...})])`). «Сохранить…» открывает окно сохранения системы (папка — `exportDir` или «Документы»),
добавляет расширение, если его не набрали, пишет файл (.txt — UTF-8 с BOM, переводы строк Windows или Mac) и запоминает
папку. Запись не атомарная: файл, открытый в Word, даёт понятное «файл занят другой программой». Каналы
`export:copy`, `export:save`.

- [ ] **Step 1: Тесты**

**Создать `src/main/export/export-meeting.test.ts`:**

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
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-05T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'a', start: 708, end: 712, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false },
    { id: 'b', start: 715, end: 718, speakerId: 's1', text: 'Подрядчиков отдельно.', edited: true },
    { id: 'c', start: 724, end: 726, speakerId: 'me', text: 'Понял.', edited: false },
  ],
};

async function meetingWithText(text: Transcript | null = transcript): Promise<{ lib: string; id: string }> {
  const lib = makeTempDir('textmeet-export-');
  const meeting = await createMeeting(lib, {
    source: 'recording',
    status: 'done',
    title: 'Созвон: Ирина / бюджет',
    now: new Date(2026, 8, 27, 16, 20),
  });
  await updateMeeting(lib, meeting.id, (m) => ({ ...m, durationSec: 32 * 60, speakerNames: { s1: 'Ирина' } }));
  if (text) await writeTranscript(lib, meeting.id, text);
  return { lib, id: meeting.id };
}

function deps(lib: string, over: Partial<ExportDeps> = {}): ExportDeps & { clipboard: { text: string; html: string }[] } {
  const clipboard: { text: string; html: string }[] = [];
  const out = makeTempDir('textmeet-export-out-');
  return {
    clipboard,
    libraryDir: () => lib,
    chooseSavePath: async (defaultPath) => join(out, defaultPath.split(/[\\/]/).pop() ?? 'x'),
    writeClipboard: async (data) => {
      clipboard.push(data);
    },
    exportDir: () => null,
    rememberExportDir: async () => undefined,
    documentsDir: () => out,
    platform: 'win32',
    logger: { warn: vi.fn() },
    ...over,
  };
}

describe('copyMeeting', () => {
  it('puts the plain and the formatted text into the clipboard', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib);
    await copyMeeting(d, id);
    expect(d.clipboard).toHaveLength(1);
    expect(d.clipboard[0]?.text).toBe(
      'Созвон: Ирина / бюджет\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
        'Ирина [11:48]\nСмотри, по бюджету. Подрядчиков отдельно.\n\nЯ [12:04]\nПонял.\n',
    );
    expect(d.clipboard[0]?.html).toContain('<b>Ирина</b>');
  });

  it('refuses a meeting without text', async () => {
    const { lib, id } = await meetingWithText(null);
    await expect(copyMeeting(deps(lib), id)).rejects.toThrow(exportTexts.noText);
    const empty = await meetingWithText({ ...transcript, segments: [] });
    await expect(copyMeeting(deps(empty.lib), empty.id)).rejects.toThrow(exportTexts.noText);
  });

  it('says plainly that the text could not be read', async () => {
    const { lib, id } = await meetingWithText();
    writeFileSync(join(lib, id, 'transcript.json'), '{ сломано');
    await expect(copyMeeting(deps(lib), id)).rejects.toThrow(exportTexts.unreadable);
  });
});

describe('saveMeeting', () => {
  it('offers a safe file name in the documents folder and remembers the folder', async () => {
    const { lib, id } = await meetingWithText();
    const remembered: string[] = [];
    let offered = '';
    const d = deps(lib, {
      chooseSavePath: async (defaultPath) => {
        offered = defaultPath;
        return defaultPath;
      },
      rememberExportDir: async (dir) => {
        remembered.push(dir);
      },
    });
    expect(await saveMeeting(d, id, 'txt')).toEqual({ saved: true });
    expect(offered).toBe(join(d.documentsDir(), 'Созвон Ирина бюджет.txt'));
    expect(remembered).toEqual([d.documentsDir()]);
  });

  it('starts in the folder of the last export', async () => {
    const { lib, id } = await meetingWithText();
    const last = makeTempDir('textmeet-export-last-');
    let offered = '';
    const d = deps(lib, {
      exportDir: () => last,
      chooseSavePath: async (defaultPath) => {
        offered = defaultPath;
        return null;
      },
    });
    expect(await saveMeeting(d, id, 'docx')).toEqual({ saved: false });
    expect(offered).toBe(join(last, 'Созвон Ирина бюджет.docx'));
  });

  it('writes text with a BOM and Windows line endings on Windows', async () => {
    const { lib, id } = await meetingWithText();
    const target = join(makeTempDir('textmeet-export-txt-'), 'итоги.txt');
    await saveMeeting(deps(lib, { chooseSavePath: async () => target }), id, 'txt');
    const bytes = readFileSync(target);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString('utf8').slice(1);
    expect(text.startsWith('Созвон: Ирина / бюджет\r\n27 сентября 2026')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes plain line endings on the Mac', async () => {
    const { lib, id } = await meetingWithText();
    const target = join(makeTempDir('textmeet-export-mac-'), 'итоги.txt');
    await saveMeeting(deps(lib, { platform: 'darwin', chooseSavePath: async () => target }), id, 'txt');
    expect(readFileSync(target, 'utf8')).not.toContain('\r');
  });

  it('writes a Word file and adds the extension when it was typed without one', async () => {
    const { lib, id } = await meetingWithText();
    const dir = makeTempDir('textmeet-export-docx-');
    await saveMeeting(deps(lib, { chooseSavePath: async () => join(dir, 'итоги') }), id, 'docx');
    expect(readFileSync(join(dir, 'итоги.docx')).subarray(0, 2).toString()).toBe('PK');
  });

  it('a failed write is said plainly and the folder is not remembered', async () => {
    const { lib, id } = await meetingWithText();
    const rememberExportDir = vi.fn(async () => undefined);
    const d = deps(lib, {
      chooseSavePath: async () => join(lib, 'нет такой папки', 'итоги.txt'),
      rememberExportDir,
    });
    await expect(saveMeeting(d, id, 'txt')).rejects.toThrow('Не удалось сохранить файл: папка не найдена');
    expect(rememberExportDir).not.toHaveBeenCalled();
  });

  it('keeps the saved file even if the folder could not be remembered', async () => {
    const { lib, id } = await meetingWithText();
    const d = deps(lib, { rememberExportDir: async () => Promise.reject(new Error('диск')) });
    expect(await saveMeeting(d, id, 'txt')).toEqual({ saved: true });
    expect(d.logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/export/export-meeting.test.ts`
Ожидается: FAIL — нет модуля `./export-meeting`.

- [ ] **Step 3: Код**

**Создать `src/main/export/export-meeting.ts`:**

```ts
// «Скопировать всё» и «Сохранить…» (решения Плана 5, §2.3, §4.6): текст берётся из файлов встречи на диске — с
// правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { humanFsError } from '../fs/fs-errors';
import { readMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import { toDocx } from './docx';
import { exportFileName } from './file-name';

export const exportTexts = {
  noText: 'У встречи пока нет текста — выгружать нечего.',
  unreadable: 'Не удалось прочитать текст встречи.',
} as const;

export interface ExportDeps {
  libraryDir(): string;
  /** Окно сохранения системы; null — человек передумал. */
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html: string }): Promise<void>;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
  documentsDir(): string;
  platform: string;
  logger: Pick<Logger, 'warn'>;
}

/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

async function loadDoc(libraryDir: string, meetingId: string): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
    const transcript = await readTranscript(libraryDir, meetingId);
    doc = transcript ? buildExportDoc(meeting, transcript) : null;
  } catch (err) {
    throw new Error(exportTexts.unreadable, { cause: err });
  }
  if (!doc || doc.paragraphs.length === 0) throw new Error(exportTexts.noText);
  return doc;
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
  if (format === 'docx') return toDocx(doc);
  return BOM + toPlainText(doc, platform === 'win32' ? '\r\n' : '\n');
}

/** Окно сохранения → файл. Не атомарно: файл, открытый в Word, даёт понятное «файл занят другой программой». */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  const dir = deps.exportDir() ?? deps.documentsDir();
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
  const path = extname(picked).toLowerCase() === `.${format}` ? picked : `${picked}.${format}`;
  try {
    await fsp.writeFile(path, await fileData(doc, format, deps.platform));
  } catch (err) {
    throw humanFsError('Не удалось сохранить файл', err);
  }
  // Файл уже сохранён — неудача с настройками только в журнал.
  await deps
    .rememberExportDir(dirname(path))
    .catch((err: unknown) => deps.logger.warn('Папка выгрузки не запомнилась', err));
  return { saved: true };
}
```

**В `src/main/index.ts` заменить:**

```ts
import { join } from 'node:path';
import {
  app,
  dialog,
  globalShortcut,
  Menu,
```

**на:**

```ts
import { join } from 'node:path';
import {
  app,
  clipboard,
  ClipboardItem,
  dialog,
  globalShortcut,
  Menu,
```

**В `src/main/index.ts` заменить:**

```ts
      logger,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    transcription: queue,
    models,
    downloads: catalogDownloads,
```

**на:**

```ts
      logger,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    exporting: {
      libraryDir,
      chooseSavePath: async (defaultPath, format) => {
        const options: Electron.SaveDialogOptions = {
          title: format === 'docx' ? 'Сохранить в Word' : 'Сохранить как текст',
          defaultPath,
          filters: [
            format === 'docx' ? { name: 'Документ Word', extensions: ['docx'] } : { name: 'Текст', extensions: ['txt'] },
          ],
        };
        const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      writeClipboard: (data) => clipboard.write([new ClipboardItem({ 'text/plain': data.text, 'text/html': data.html })]),
      exportDir: () => settings.get().exportDir,
      rememberExportDir: (dir) => settings.update({ exportDir: dir }),
      documentsDir: () => app.getPath('documents'),
      platform: process.platform,
      logger,
    },
    transcription: queue,
    models,
    downloads: catalogDownloads,
```

**В `src/main/ipc.ts` заменить:**

```ts
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
```

**на:**

```ts
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
```

**В `src/main/ipc.ts` заменить:**

```ts
  libraryChanged(): void;
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'remove' | 'search'>;
  deletion: DeleteDeps;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**на:**

```ts
  libraryChanged(): void;
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'remove' | 'search'>;
  deletion: DeleteDeps;
  exporting: ExportDeps;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**В `src/main/ipc.ts` заменить:**

```ts
  transcriptVersion: z.iso.datetime(),
});

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
```

**на:**

```ts
  transcriptVersion: z.iso.datetime(),
});

const SaveMeetingSchema = z.object({ meetingId: MeetingIdSchema, format: z.enum(['docx', 'txt']) });

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
```

**В `src/main/ipc.ts` заменить:**

```ts
    deps.libraryChanged();
  });

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**на:**

```ts
    deps.libraryChanged();
  });

  handle(IPC.copyMeeting, (arg) => copyMeeting(deps.exporting, MeetingIdSchema.parse(arg)));

  handle(IPC.saveMeeting, (arg) => {
    const request = SaveMeetingSchema.parse(arg);
    return saveMeeting(deps.exporting, request.meetingId, request.format);
  });

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**В `src/preload/index.ts` заменить:**

```ts
  downloadModel: (id) => invoke(IPC.downloadModel, id),
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
```

**на:**

```ts
  downloadModel: (id) => invoke(IPC.downloadModel, id),
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
```

**В `src/shared/ipc.ts` заменить:**

```ts
  downloadModel: 'models:download',
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
```

**на:**

```ts
  downloadModel: 'models:download',
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  copyMeeting: 'export:copy',
  saveMeeting: 'export:save',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  transcriptVersion: string;
}

export interface EditedTranscript {
  meeting: Meeting;
  transcript: Transcript;
```

**на:**

```ts
  transcriptVersion: string;
}

/** Формат «Сохранить…»: Word или обычный текст. */
export type ExportFormat = 'docx' | 'txt';

export interface SaveMeetingRequest {
  meetingId: string;
  format: ExportFormat;
}

export interface SaveMeetingResult {
  /** false — окно сохранения закрыли без сохранения. */
  saved: boolean;
}

export interface EditedTranscript {
  meeting: Meeting;
  transcript: Transcript;
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.downloadModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
```

**на:**

```ts
  [IPC.downloadModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
```

**В `src/shared/ipc.ts` заменить:**

```ts
  cancelModelDownload(id: AsrModelId): Promise<ModelsState>;
  /** «Выбрать»: модель для новых встреч. */
  selectModel(id: AsrModelId): Promise<ModelsState>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
```

**на:**

```ts
  cancelModelDownload(id: AsrModelId): Promise<ModelsState>;
  /** «Выбрать»: модель для новых встреч. */
  selectModel(id: AsrModelId): Promise<ModelsState>;
  /** «Скопировать всё»: текст встречи — в буфер обмена (обычный и оформленный). */
  copyMeeting(meetingId: string): Promise<void>;
  /** «Сохранить в Word» / «Сохранить как текст»: окно сохранения системы и файл. */
  saveMeeting(request: SaveMeetingRequest): Promise<SaveMeetingResult>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  864 passed (864)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: copy the meeting text and save it as Word or text"
```

### Task 5: Проверка добавляемого файла, его дата и название

**Files:**
- Create: `src/main/import/naming.test.ts`, `src/main/import/naming.ts`, `src/main/import/probe.test.ts`, `src/main/import/probe.ts`, `src/test-support/media-files.ts`

`import/probe.ts`: `ffmpeg -i <файл>` без выходного файла печатает сведения о входном (и завершается с
кодом 1) — `parseProbe` находит поток звука, длительность и `creation_time` самого файла (не дорожки). `examineFile`
отвечает причиной для человека: «файл не найден», «это папка — перетащите сами файлы», «файл пустой», «не получилось
прочитать звук из файла», «в файле нет звука». `naming.ts`: дата записи — `creation_time` (если не раньше 2000 года и
не позже завтра), иначе время изменения файла, иначе сейчас; название — имя файла без расширения.
`test-support/media-files.ts` делает небольшие файлы настоящим ffmpeg — только встроенными в него кодеками (mpeg4, aac,
nellymoser), чтобы они получались на сборках ffmpeg для Windows, Mac и Linux.

- [ ] **Step 1: Тесты**

**Создать `src/main/import/naming.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { pickRecordedAt, titleFromFileName } from './naming';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const MODIFIED = new Date('2026-10-04T15:00:00.000Z');

describe('pickRecordedAt', () => {
  it('takes the date written in the file', () => {
    expect(pickRecordedAt('2026-10-04T13:20:05.000000Z', MODIFIED, NOW).toISOString()).toBe('2026-10-04T13:20:05.000Z');
  });

  it('falls back to the time the file was changed when the file has no date', () => {
    expect(pickRecordedAt(null, MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('вчера', MODIFIED, NOW)).toEqual(MODIFIED);
  });

  it('skips dates that cannot be true', () => {
    expect(pickRecordedAt('1904-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('1970-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('2027-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
  });

  it('allows a clock that is a little fast', () => {
    expect(pickRecordedAt('2026-10-05T20:00:00Z', null, NOW).toISOString()).toBe('2026-10-05T20:00:00.000Z');
  });

  it('uses now when nothing else is believable', () => {
    expect(pickRecordedAt(null, new Date(0), NOW)).toEqual(NOW);
    expect(pickRecordedAt(null, null, NOW)).toEqual(NOW);
  });
});

describe('titleFromFileName', () => {
  const at = new Date(2026, 9, 4, 16, 20);

  it('drops the last extension and the spaces at the ends', () => {
    expect(titleFromFileName('Созвон с Ириной.mp4', at)).toBe('Созвон с Ириной');
    expect(titleFromFileName('  итоги.v2.m4a ', at)).toBe('итоги.v2');
    expect(titleFromFileName('GMT20261002-071500_Recording.mp4', at)).toBe('GMT20261002-071500_Recording');
    expect(titleFromFileName('запись', at)).toBe('запись');
  });

  it('uses the date of the recording when the name is empty', () => {
    expect(titleFromFileName('.mp3', at)).toBe('Встреча 04.10.2026 16:20');
    expect(titleFromFileName('   .wav', at)).toBe('Встреча 04.10.2026 16:20');
  });

  it('keeps at most 200 characters without cutting a letter in half', () => {
    expect(Array.from(titleFromFileName(`${'😀'.repeat(250)}.mp3`, at))).toHaveLength(200);
  });
});
```

**Создать `src/main/import/probe.test.ts`:**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { phoneRecording, videoWithoutSound, videoWithSound } from '../../test-support/media-files';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { examineFile, ffmpegInfo, parseProbe, probeTexts } from './probe';

const ZOOM = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'GMT20261004-132005_Recording.mp4':
  Metadata:
    major_brand     : isom
    creation_time   : 2026-10-04T13:20:05.000000Z
    encoder         : Lavf60.16.100
  Duration: 00:47:12.34, start: 0.000000, bitrate: 113 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, 36 kb/s, 25 fps (default)
    Metadata:
      creation_time   : 2020-01-01T00:00:00.000000Z
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
At least one output file must be specified
`;

describe('parseProbe', () => {
  it('reads the sound, the duration and the date of the file itself', () => {
    expect(parseProbe(ZOOM)).toEqual({ hasAudio: true, durationSec: 47 * 60 + 12.34, creationTime: '2026-10-04T13:20:05.000000Z' });
  });

  it('does not take the date of a track for the date of the file', () => {
    const noFileDate = ZOOM.replace('    creation_time   : 2026-10-04T13:20:05.000000Z\n', '');
    expect(parseProbe(noFileDate)?.creationTime).toBeNull();
  });

  it('a video without sound', () => {
    const video = ZOOM.replace(/ {2}Stream #0:1.*\n/, '');
    expect(parseProbe(video)?.hasAudio).toBe(false);
  });

  it('a raw stream without a known duration', () => {
    const raw = "Input #0, amr, from 'a.amr':\n  Duration: N/A, bitrate: N/A\n  Stream #0:0: Audio: amr_nb (samr), 8000 Hz, mono, flt\n";
    expect(parseProbe(raw)).toEqual({ hasAudio: true, durationSec: null, creationTime: null });
  });

  it('not a media file', () => {
    expect(parseProbe('[in#0 @ 0x1] Error opening input: Invalid data found when processing input\n')).toBeNull();
    expect(parseProbe('')).toBeNull();
  });
});

describe('ffmpegInfo / examineFile', () => {
  const ffmpeg = resolveFfmpegPath();

  it('accepts a video call with sound and reads its date', async () => {
    const file = join(makeTempDir('textmeet-probe-'), 'созвон.mp4');
    await videoWithSound(file, 1, '2026-10-04T13:20:05.000000Z');
    const examined = await examineFile(ffmpeg, file);
    expect(examined).toMatchObject({ ok: true, info: { hasAudio: true, creationTime: '2026-10-04T13:20:05.000000Z' } });
    if (!examined.ok) throw new Error('файл не подошёл');
    expect(examined.info.durationSec).toBeGreaterThan(0.9);
    expect(examined.size).toBeGreaterThan(0);
  });

  it('accepts a phone recording', async () => {
    const file = join(makeTempDir('textmeet-probe-'), 'Новая запись 3.m4a');
    await phoneRecording(file, 1);
    expect((await examineFile(ffmpeg, file)).ok).toBe(true);
  });

  it('refuses a video without sound, a text file, an empty file, a folder and a missing file', async () => {
    const dir = makeTempDir('textmeet-probe-');
    const silent = join(dir, 'экран.mp4');
    await videoWithoutSound(silent, 1);
    writeFileSync(join(dir, 'отчёт.pdf'), 'не видео');
    writeFileSync(join(dir, 'пусто.mp3'), '');
    mkdirSync(join(dir, 'папка'));
    expect(await examineFile(ffmpeg, silent)).toEqual({ ok: false, reason: probeTexts.noAudio });
    expect(await examineFile(ffmpeg, join(dir, 'отчёт.pdf'))).toEqual({ ok: false, reason: probeTexts.unreadable });
    expect(await examineFile(ffmpeg, join(dir, 'пусто.mp3'))).toEqual({ ok: false, reason: probeTexts.empty });
    expect(await examineFile(ffmpeg, join(dir, 'папка'))).toEqual({ ok: false, reason: probeTexts.folder });
    expect(await examineFile(ffmpeg, join(dir, 'нет.mp3'))).toEqual({ ok: false, reason: probeTexts.missing });
  });

  it('stops ffmpeg that takes too long', async () => {
    const file = join(makeTempDir('textmeet-probe-'), 'a.mp4');
    await videoWithSound(file, 1);
    await expect(ffmpegInfo(ffmpeg, file, 0)).rejects.toThrow('слишком долго');
  });

  it('fails when ffmpeg itself is missing', async () => {
    await expect(ffmpegInfo(join(makeTempDir(), 'нет-ffmpeg.exe'), 'a.mp4')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/import/naming.test.ts src/main/import/probe.test.ts`
Ожидается: FAIL — нет модулей `./probe` и `./naming`.

- [ ] **Step 3: Код**

**Создать `src/main/import/naming.ts`:**

```ts
// Дата и название встречи из файла (решения Плана 5, §4.2).
import { defaultMeetingTitle } from '../library/naming';

/** Даты раньше этой — заведомо мусор (у MP4 без даты бывает 1904 или 1970 год). */
const EARLIEST = Date.UTC(2000, 0, 1);
/** Часы компьютера или телефона могут немного спешить. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE_CHARS = 200;

const plausible = (time: number, now: Date): boolean =>
  Number.isFinite(time) && time >= EARLIEST && time <= now.getTime() + FUTURE_SLACK_MS;

/**
 * Когда записан файл: creation_time из самого файла (его пишут телефон и Zoom), иначе время изменения файла, иначе
 * сейчас. Неправдоподобная дата (до 2000 года, в будущем) пропускается.
 */
export function pickRecordedAt(creationTime: string | null, modifiedAt: Date | null, now: Date): Date {
  const created = creationTime === null ? Number.NaN : Date.parse(creationTime);
  if (plausible(created, now)) return new Date(created);
  if (modifiedAt && plausible(modifiedAt.getTime(), now)) return new Date(modifiedAt.getTime());
  return new Date(now.getTime());
}

/** «Созвон с Ириной.mp4» → «Созвон с Ириной»; пустое — «Встреча ДД.ММ.ГГГГ ЧЧ:ММ» по дате записи. */
export function titleFromFileName(fileName: string, recordedAt: Date): string {
  const base = fileName.replace(/\.[^.]*$/, '').trim();
  // По символам, а не по UTF-16: эмодзи не режется пополам.
  const title = Array.from(base).slice(0, MAX_TITLE_CHARS).join('').trim();
  return title === '' ? defaultMeetingTitle(recordedAt) : title;
}
```

**Создать `src/main/import/probe.ts`:**

```ts
// Что за файл добавляют (решения Плана 5, §4.2): есть ли в нём звук, сколько длится, когда записан. ffmpeg без
// выходного файла печатает сведения о входном и завершается с кодом 1 — его вывод и разбираем.
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { knownFsReason } from '../fs/fs-errors';

export const probeTexts = {
  missing: 'файл не найден',
  folder: 'это папка — перетащите сами файлы',
  notFile: 'это не файл',
  empty: 'файл пустой',
  unreadable: 'не получилось прочитать звук из файла',
  noAudio: 'в файле нет звука',
  unavailable: 'файл недоступен',
} as const;

/** Вывод ffmpeg о файле — не больше этого (у файла с сотней дорожек он длинный, а нужна только шапка). */
const MAX_OUTPUT_CHARS = 64 * 1024;
/** Сведения о файле ffmpeg печатает за доли секунды; файл на уснувшем сетевом диске ждём не дольше. */
export const PROBE_TIMEOUT_MS = 30_000;

export interface MediaInfo {
  hasAudio: boolean;
  /** Длительность из шапки файла; null — ffmpeg её не знает. */
  durationSec: number | null;
  /** creation_time самого файла (не дорожки) как есть; null — нет. */
  creationTime: string | null;
}

/** Разбор вывода `ffmpeg -i`; null — ffmpeg не узнал формат (это не аудио и не видео). */
export function parseProbe(output: string): MediaInfo | null {
  const start = output.indexOf('Input #0');
  if (start === -1) return null;
  const input = output.slice(start);
  const firstStream = input.search(/^\s*Stream #0:/m);
  // Сведения самого файла — до первой дорожки; у дорожек свои creation_time.
  const head = firstStream === -1 ? input : input.slice(0, firstStream);
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(head);
  const durationSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null;
  const creation = /^\s*creation_time\s*:\s*(\S.*?)\s*$/m.exec(head);
  return {
    hasAudio: /^\s*Stream #0:\S*: Audio:/m.test(input),
    durationSec,
    creationTime: creation?.[1] ?? null,
  };
}

/** Вывод `ffmpeg -i <файл>` (stderr). Отказ — только если ffmpeg не запустился или завис. */
export function ffmpegInfo(ffmpegPath: string, file: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', file], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (output.length < MAX_OUTPUT_CHARS) output += chunk.slice(0, MAX_OUTPUT_CHARS - output.length);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('ffmpeg слишком долго читал сведения о файле'));
      else resolve(output);
    });
  });
}

export type Examined =
  | { ok: true; info: MediaInfo; size: number; modifiedAt: Date }
  | { ok: false; reason: string };

/** Подходит ли файл для импорта; причина отказа — для человека (§2.2). */
export async function examineFile(ffmpegPath: string, file: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<Examined> {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, reason: probeTexts.missing };
    return { ok: false, reason: knownFsReason(err) ?? probeTexts.unavailable };
  }
  if (stat.isDirectory()) return { ok: false, reason: probeTexts.folder };
  if (!stat.isFile()) return { ok: false, reason: probeTexts.notFile };
  if (stat.size === 0) return { ok: false, reason: probeTexts.empty };
  const info = parseProbe(await ffmpegInfo(ffmpegPath, file, timeoutMs));
  if (!info) return { ok: false, reason: probeTexts.unreadable };
  if (!info.hasAudio) return { ok: false, reason: probeTexts.noAudio };
  return { ok: true, info, size: stat.size, modifiedAt: stat.mtime };
}
```

**Создать `src/test-support/media-files.ts`:**

```ts
// Небольшие аудио- и видеофайлы для проверок импорта. Делает их настоящий ffmpeg (ffmpeg-static); кодеки — только
// встроенные в сам ffmpeg, чтобы файлы получались на сборках для Windows, Mac и Linux.
import { resolveFfmpegPath, runFfmpeg } from '../main/audio/ffmpeg';

const tone = (seconds: number): string[] => ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`];
const picture = (seconds: number): string[] => ['-f', 'lavfi', '-i', `testsrc=size=160x120:rate=5:duration=${seconds}`];

/** Видео с видеорядом и звуком, как запись созвона; creationTime — дата записи в самом файле. */
export async function videoWithSound(file: string, seconds: number, creationTime?: string): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [
    ...picture(seconds),
    ...tone(seconds),
    '-c:v',
    'mpeg4',
    '-c:a',
    'aac',
    ...(creationTime ? ['-metadata', `creation_time=${creationTime}`] : []),
    '-f',
    'mp4',
    file,
  ]);
}

/** Видео без звуковой дорожки. */
export async function videoWithoutSound(file: string, seconds: number): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [...picture(seconds), '-c:v', 'mpeg4', '-f', 'mp4', file]);
}

/** Звук, как с диктофона телефона (AAC в M4A). */
export async function phoneRecording(file: string, seconds: number): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [...tone(seconds), '-c:a', 'aac', '-f', 'ipod', file]);
}

/** Звук в кодеке, который нельзя переложить в Matroska как есть (Nellymoser в FLV): импорт его перекодирует. */
export async function oddCodecRecording(file: string, seconds: number): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [...tone(seconds), '-ar', '22050', '-c:a', 'nellymoser', '-f', 'flv', file]);
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  882 passed (882)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: check an added file and read its date and name"
```

### Task 6: Копирование звука файла в папку встречи

**Files:**
- Create: `src/main/import/audio-copy.test.ts`, `src/main/import/audio-copy.ts`
- Modify: `src/main/audio/ffmpeg.test.ts`, `src/main/audio/ffmpeg.ts`

`runFfmpeg` получает `onProgress(seconds)` — сколько звука обработано (по целым строкам `-progress`).
`import/audio-copy.ts`: первая звуковая дорожка — в `audio/source.mka` без перекодирования (Matroska принимает почти
любой кодек: проверено на aac, mp3, opus, vorbis, flac, alac, pcm, amr, wma, ac3); не вышло — перекодирование в Opus
96 кбит/с (так бывает с Nellymoser из FLV). Не вышло и оно — причина для человека: файла нет → «файл не найден»,
свободного места меньше 50 МБ → «на диске закончилось место», иначе «файл повреждён или его формат не поддерживается».
При отмене второй попытки нет; `.part` не остаётся.

- [ ] **Step 1: Тесты**

**В `src/main/audio/ffmpeg.test.ts` заменить:**

```ts
    expect(run.durationSec).toBeCloseTo(2, 1);
  });

  it('rejects with the tail of the ffmpeg log', async () => {
    await expect(runFfmpeg(resolveFfmpegPath(), ['-i', join(makeTempDir(), 'нет.webm'), '-f', 'null', '-'])).rejects.toThrow(
      /ffmpeg завершился с кодом \d+: .+/,
```

**на:**

```ts
    expect(run.durationSec).toBeCloseTo(2, 1);
  });

  it('reports how much sound is done while it works', async () => {
    const seen: number[] = [];
    const out = join(makeTempDir(), 'tone.opus');
    const args = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libopus', '-f', 'ogg', out];
    const run = await runFfmpeg(resolveFfmpegPath(), args, { onProgress: (seconds) => seen.push(seconds) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBeCloseTo(run.durationSec ?? 0, 3);
  });

  it('rejects with the tail of the ffmpeg log', async () => {
    await expect(runFfmpeg(resolveFfmpegPath(), ['-i', join(makeTempDir(), 'нет.webm'), '-f', 'null', '-'])).rejects.toThrow(
      /ffmpeg завершился с кодом \d+: .+/,
```

**Создать `src/main/import/audio-copy.test.ts`:**

```ts
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { oddCodecRecording, phoneRecording, videoWithSound } from '../../test-support/media-files';
import { FFMPEG_CANCELLED, resolveFfmpegPath } from '../audio/ffmpeg';
import { copyArgs, copySourceAudio, copyTexts, reencodeArgs, SOURCE_FILE } from './audio-copy';
import { ffmpegInfo } from './probe';

const ffmpeg = resolveFfmpegPath();
const plenty = async (): Promise<number> => 10 * 1024 ** 3;

describe('copyArgs / reencodeArgs', () => {
  it('takes only the first sound track: as is, or in Opus', () => {
    expect(copyArgs('in.mp4', 'out.part').join(' ')).toBe('-i in.mp4 -map 0:a:0 -vn -sn -dn -c:a copy -f matroska out.part');
    expect(reencodeArgs('in.flv', 'out.part').join(' ')).toBe(
      '-i in.flv -map 0:a:0 -vn -sn -dn -c:a libopus -b:a 96k -f matroska out.part',
    );
  });
});

describe('copySourceAudio', () => {
  it('copies the sound of a video without the picture', async () => {
    const dir = makeTempDir('textmeet-copy-');
    const source = join(dir, 'созвон.mp4');
    await videoWithSound(source, 2);
    const audio = makeTempDir('textmeet-copy-audio-');
    const seen: number[] = [];
    const result = await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty, onProgress: (s) => seen.push(s) });
    expect(result.reencoded).toBe(false);
    expect(result.durationSec).toBeGreaterThan(1.5);
    expect(seen.length).toBeGreaterThan(0);
    expect(readdirSync(audio)).toEqual([SOURCE_FILE]);
    const info = await ffmpegInfo(ffmpeg, join(audio, SOURCE_FILE));
    expect(info).toMatch(/Audio: aac/);
    expect(info).not.toMatch(/Video:/);
  });

  it('copies a phone recording as is', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'Новая запись.m4a');
    await phoneRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    expect((await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty })).reencoded).toBe(false);
  });

  it('re-encodes a codec that Matroska does not take as is', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'старое.flv');
    await oddCodecRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const result = await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty });
    expect(result.reencoded).toBe(true);
    expect(await ffmpegInfo(ffmpeg, join(audio, SOURCE_FILE))).toMatch(/Audio: opus/);
    expect(readdirSync(audio)).toEqual([SOURCE_FILE]);
  });

  it('names the reason and leaves nothing behind', async () => {
    const dir = makeTempDir('textmeet-copy-');
    const garbage = join(dir, 'сломан.mp3');
    writeFileSync(garbage, 'не звук');
    const audio = makeTempDir('textmeet-copy-audio-');
    await expect(copySourceAudio(ffmpeg, garbage, audio, { freeBytes: plenty })).rejects.toThrow(copyTexts.broken);
    await expect(copySourceAudio(ffmpeg, join(dir, 'нет.mp3'), audio, { freeBytes: plenty })).rejects.toThrow(
      copyTexts.missing,
    );
    await expect(copySourceAudio(ffmpeg, garbage, audio, { freeBytes: async () => 1024 })).rejects.toThrow(
      copyTexts.noSpace,
    );
    expect(readdirSync(audio)).toEqual([]);
  });

  it('stops at once when cancelled and does not try again', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'созвон.mp4');
    await videoWithSound(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const abort = new AbortController();
    abort.abort();
    await expect(copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty, signal: abort.signal })).rejects.toThrow(
      FFMPEG_CANCELLED,
    );
    expect(existsSync(join(audio, SOURCE_FILE))).toBe(false);
    expect(readdirSync(audio)).toEqual([]);
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/audio/ffmpeg.test.ts src/main/import/audio-copy.test.ts`
Ожидается: FAIL — нет модуля `./audio-copy`, `runFfmpeg` не сообщает ход работы.

- [ ] **Step 3: Код**

**В `src/main/audio/ffmpeg.ts` заменить:**

```ts
  stallMs?: number;
  /** Отмена: ffmpeg останавливается, обещание отклоняется с FFMPEG_CANCELLED. */
  signal?: AbortSignal;
}

export const FFMPEG_CANCELLED = 'ffmpeg остановлен: работа отменена';
```

**на:**

```ts
  stallMs?: number;
  /** Отмена: ffmpeg останавливается, обещание отклоняется с FFMPEG_CANCELLED. */
  signal?: AbortSignal;
  /** Сколько секунд звука уже обработано — по мере работы (из -progress). */
  onProgress?(seconds: number): void;
}

export const FFMPEG_CANCELLED = 'ffmpeg остановлен: работа отменена';
```

**В `src/main/audio/ffmpeg.ts` заменить:**

```ts
/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[], options: FfmpegOptions = {}): Promise<FfmpegRun> {
  const stallMs = options.stallMs ?? FFMPEG_STALL_MS;
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(FFMPEG_CANCELLED));
```

**на:**

```ts
/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[], options: FfmpegOptions = {}): Promise<FfmpegRun> {
  const stallMs = options.stallMs ?? FFMPEG_STALL_MS;
  const { signal, onProgress } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(FFMPEG_CANCELLED));
```

**В `src/main/audio/ffmpeg.ts` заменить:**

```ts

    let progress = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      progress = keepTail(progress + chunk);
      rearmWatchdog();
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = keepTail(errors + chunk);
```

**на:**

```ts

    let progress = '';
    let errors = '';
    let reported: number | null = null;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      progress = keepTail(progress + chunk);
      rearmWatchdog();
      if (!onProgress) return;
      // Только целые строки: недописанное «out_time_us=12» показало бы откат назад.
      const seconds = parseProgressDuration(progress.slice(0, progress.lastIndexOf('\n') + 1));
      if (seconds !== null && seconds !== reported) {
        reported = seconds;
        onProgress(seconds);
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = keepTail(errors + chunk);
```

**Создать `src/main/import/audio-copy.ts`:**

```ts
// Звук из добавленного файла — в папку встречи (решения Плана 5, §4.3). Сначала как есть (быстро и без потерь), в
// Matroska: она принимает почти любой звуковой кодек. Не вышло — перекодирование в Opus. Видео не копируется.
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { TRACK_FILES } from '../../shared/recording';
import { runFfmpeg } from '../audio/ffmpeg';

/** Звук встречи из файла в папке audio/. */
export const SOURCE_FILE = TRACK_FILES.file;
/** Меньше этого свободного места после неудачи — причина, скорее всего, в нём. */
const LOW_SPACE_BYTES = 50 * 1024 * 1024;

export const copyTexts = {
  missing: 'файл не найден',
  noSpace: 'на диске закончилось место',
  broken: 'файл повреждён или его формат не поддерживается',
} as const;

const onlySound = (input: string): string[] => ['-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn'];

/** Первая звуковая дорожка как есть. */
export const copyArgs = (input: string, output: string): string[] => [
  ...onlySound(input),
  '-c:a',
  'copy',
  '-f',
  'matroska',
  output,
];

/** Первая звуковая дорожка — в Opus (кодек, которого Matroska не принимает как есть). */
export const reencodeArgs = (input: string, output: string): string[] => [
  ...onlySound(input),
  '-c:a',
  'libopus',
  '-b:a',
  '96k',
  '-f',
  'matroska',
  output,
];

export interface CopyOptions {
  signal?: AbortSignal;
  onProgress?(seconds: number): void;
  /** Свободное место в папке, байт; null — неизвестно. */
  freeBytes(dir: string): Promise<number | null>;
}

export interface CopyResult {
  /** Сколько секунд звука записано; null — ffmpeg не сообщил. */
  durationSec: number | null;
  reencoded: boolean;
}

/** Почему не вышло — для человека; подробности (вывод ffmpeg) остаются в cause. */
async function failureReason(source: string, dir: string, options: CopyOptions): Promise<string> {
  const sourceExists = await fsp.stat(source).then(
    () => true,
    () => false,
  );
  if (!sourceExists) return copyTexts.missing;
  const free = await options.freeBytes(dir).catch(() => null);
  if (free !== null && free < LOW_SPACE_BYTES) return copyTexts.noSpace;
  return copyTexts.broken;
}

/** Копирует звук файла в `<audioDir>/source.mka`; при отмене и ошибке недописанного файла не остаётся. */
export async function copySourceAudio(
  ffmpegPath: string,
  source: string,
  audioDir: string,
  options: CopyOptions,
): Promise<CopyResult> {
  const part = join(audioDir, `${SOURCE_FILE}.part`);
  const run = async (args: string[]): Promise<number | null> => {
    try {
      const { durationSec } = await runFfmpeg(ffmpegPath, args, { signal: options.signal, onProgress: options.onProgress });
      await fsp.rename(part, join(audioDir, SOURCE_FILE));
      return durationSec;
    } catch (err) {
      await fsp.rm(part, { force: true }).catch(() => undefined);
      throw err;
    }
  };
  try {
    return { durationSec: await run(copyArgs(source, part)), reencoded: false };
  } catch (copyErr) {
    if (options.signal?.aborted) throw copyErr;
    try {
      return { durationSec: await run(reencodeArgs(source, part)), reencoded: true };
    } catch (err) {
      if (options.signal?.aborted) throw err;
      throw new Error(await failureReason(source, audioDir, options), { cause: err });
    }
  }
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  889 passed (889)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: copy the sound of an added file into the meeting folder"
```

### Task 7: Очередь импорта

**Files:**
- Create: `src/main/import/importer.test.ts`, `src/main/import/importer.ts`, `src/shared/import.ts`
- Modify: `src/main/import/naming.test.ts`, `src/main/import/naming.ts`, `src/main/library/library.test.ts`, `src/main/library/library.ts`

`import/importer.ts`: `addFiles` проверяет файлы по порядку и сразу создаёт встречу каждого подходящего
(`importing`, дата и название из файла, длительность и имя файла); больше 100 файлов за раз — остальные в неудачах.
Звук копируется по одному файлу за раз; ход — `ImportProgress` (доля или «ждёт очереди»). Готово — встреча
`recorded` с дорожкой `file`, событие `imported` (дальше — сведение и окно «Файл добавлен»). Не вышло — папка
недоделанной встречи удаляется (в ней только неполная копия) и событие `failed` с причиной. `recoverInterruptedImports` —
при запуске встречи `importing` без задачи (сбой программы) становятся ошибкой «импорт прервался». `createMeeting`
принимает длительность и имя исходного файла; `fitLength` режет текст по длине в UTF-16 (как её считает проверка
`meeting.json`), не разрывая эмодзи.

- [ ] **Step 1: Тесты**

**Создать `src/main/import/importer.test.ts`:**

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ImportFailure, ImportProgress } from '../../shared/import';
import type { Meeting } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { videoWithSound } from '../../test-support/media-files';
import { FFMPEG_CANCELLED, resolveFfmpegPath } from '../audio/ffmpeg';
import { audioDir, createMeeting, listMeetings, readMeeting } from '../library/library';
import type { Logger } from '../logger';
import { copyTexts, SOURCE_FILE, type copySourceAudio, type CopyOptions } from './audio-copy';
import { Importer, importTexts, recoverInterruptedImports, type ImporterDeps } from './importer';
import { probeTexts, type Examined, type examineFile } from './probe';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const quiet = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });

/** Сведения о файле: по имени — подходит ли он и какая у него дата. */
function fakeExamine(table: Record<string, Examined>): typeof examineFile {
  return async (_ffmpeg, path) => {
    const name = path.split(/[\\/]/).pop() ?? '';
    return table[name] ?? { ok: false, reason: probeTexts.unreadable };
  };
}

const goodFile = (creationTime: string | null, durationSec: number | null = 60): Examined => ({
  ok: true,
  info: { hasAudio: true, durationSec, creationTime },
  size: 1000,
  modifiedAt: new Date('2026-10-03T08:00:00.000Z'),
});

/** Копирование, которым управляет тест: каждый вызов ждёт finish / fail; отмена отклоняет его, как настоящий ffmpeg. */
function controlledCopy() {
  const calls: { source: string; dir: string; options: CopyOptions; finish(): void; fail(err: Error): void }[] = [];
  const copy: typeof copySourceAudio = (_ffmpeg, source, dir, options) =>
    new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error(FFMPEG_CANCELLED)), { once: true });
      calls.push({
        source,
        dir,
        options,
        finish: () => {
          writeFileSync(join(dir, SOURCE_FILE), 'звук');
          resolve({ durationSec: 61.5, reencoded: false });
        },
        fail: reject,
      });
    });
  return { copy, calls };
}

function setup(over: Partial<ImporterDeps> = {}) {
  const imported: Meeting[] = [];
  const failed: ImportFailure[] = [];
  const progress: ImportProgress[][] = [];
  const changed = vi.fn();
  const deps: ImporterDeps = {
    ffmpegPath: () => 'ffmpeg',
    logger: quiet(),
    now: () => NOW,
    freeBytes: async () => 10 * 1024 ** 3,
    libraryChanged: changed,
    progressChanged: (p) => progress.push(p),
    imported: ({ meeting }) => imported.push(meeting),
    failed: (f) => failed.push(f),
    ...over,
  };
  return { importer: new Importer(deps), imported, failed, progress, changed };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await tick();
  if (!check()) throw new Error('не дождались');
}

describe('Importer.addFiles', () => {
  it('creates a meeting for every good file at once, dated by the file, and refuses the rest', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy } = controlledCopy();
    const t = setup({
      copy,
      examine: fakeExamine({
        'Созвон с Ириной.mp4': goodFile('2026-10-04T13:20:05.000000Z', 2832),
        'Новая запись 3.m4a': goodFile(null),
      }),
    });
    const result = await t.importer.addFiles(lib, [
      join('C:', 'Записи', 'Созвон с Ириной.mp4'),
      join('C:', 'Записи', 'отчёт.pdf'),
      join('C:', 'Записи', 'Новая запись 3.m4a'),
    ]);
    expect(result.failed).toEqual([{ name: 'отчёт.pdf', reason: probeTexts.unreadable }]);
    expect(result.added).toHaveLength(2);
    const [call, phone] = await Promise.all(result.added.map((id) => readMeeting(lib, id)));
    expect(call).toMatchObject({
      source: 'import',
      status: 'importing',
      title: 'Созвон с Ириной',
      createdAt: '2026-10-04T13:20:05.000Z',
      durationSec: 2832,
      sourceFileName: 'Созвон с Ириной.mp4',
      tracks: [],
    });
    expect(phone).toMatchObject({ title: 'Новая запись 3', createdAt: '2026-10-03T08:00:00.000Z' });
    expect(t.changed).toHaveBeenCalled();
  });

  it('takes at most 100 files at once', async () => {
    const lib = makeTempDir('textmeet-import-');
    const files = Array.from({ length: 102 }, (_, i) => `f${i}.mp3`);
    const t = setup({ copy: controlledCopy().copy, examine: async () => goodFile(null) });
    const result = await t.importer.addFiles(lib, files);
    expect(result.added).toHaveLength(100);
    expect(result.failed).toEqual([
      { name: 'f100.mp3', reason: importTexts.tooMany },
      { name: 'f101.mp3', reason: importTexts.tooMany },
    ]);
  });

  it('a file whose details could not be read is refused plainly', async () => {
    const lib = makeTempDir('textmeet-import-');
    const t = setup({ examine: async () => Promise.reject(new Error('spawn ENOENT')) });
    expect(await t.importer.addFiles(lib, ['a.mp3'])).toEqual({
      added: [],
      failed: [{ name: 'a.mp3', reason: probeTexts.unreadable }],
    });
  });

  it('says plainly when the meeting cannot be created', async () => {
    const lib = makeTempDir('textmeet-import-');
    const blocked = join(lib, 'файл-вместо-папки');
    writeFileSync(blocked, '');
    const t = setup({ examine: async () => goodFile(null) });
    const result = await t.importer.addFiles(blocked, ['a.mp3']);
    expect(result.added).toEqual([]);
    expect(result.failed[0]?.name).toBe('a.mp3');
  });
});

describe('Importer queue', () => {
  it('copies one file at a time, reports progress and hands the meeting on', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null, 100) });
    const { added } = await t.importer.addFiles(lib, ['a.mp4', 'b.mp4']);
    await until(() => calls.length === 1);
    expect(t.importer.progress()).toEqual([
      { meetingId: added[0], fraction: 0, waiting: false },
      { meetingId: added[1], fraction: null, waiting: true },
    ]);
    calls[0]?.options.onProgress?.(25);
    expect(t.progress.at(-1)?.[0]).toEqual({ meetingId: added[0], fraction: 0.25, waiting: false });
    expect(t.importer.isPending(lib, added[1] ?? '')).toBe(true);

    calls[0]?.finish();
    await until(() => calls.length === 2);
    expect(t.imported.map((m) => m.id)).toEqual([added[0]]);
    expect(await readMeeting(lib, added[0] ?? '')).toMatchObject({
      status: 'recorded',
      durationSec: 100,
      tracks: [{ kind: 'file', file: SOURCE_FILE, startOffsetMs: 0 }],
    });
    calls[1]?.finish();
    await until(() => t.imported.length === 2);
    await until(() => t.progress.at(-1)?.length === 0);
    expect(t.importer.isPending(lib, added[1] ?? '')).toBe(false);
  });

  it('takes the duration from ffmpeg when the file did not tell it and shows no percentage meanwhile', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null, null) });
    const [id = ''] = (await t.importer.addFiles(lib, ['a.amr'])).added;
    await until(() => calls.length === 1);
    calls[0]?.options.onProgress?.(10);
    expect(t.importer.progress()).toEqual([{ meetingId: id, fraction: null, waiting: false }]);
    calls[0]?.finish();
    await until(() => t.imported.length === 1);
    expect((await readMeeting(lib, id)).durationSec).toBe(61.5);
  });

  it('removes the unfinished meeting when the sound could not be copied and says why', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [id = ''] = (await t.importer.addFiles(lib, [join('D:', 'Созвон.mp4')])).added;
    await until(() => calls.length === 1);
    calls[0]?.fail(new Error(copyTexts.noSpace));
    await until(() => t.failed.length === 1);
    expect(t.failed).toEqual([{ name: 'Созвон.mp4', reason: copyTexts.noSpace }]);
    expect(existsSync(join(lib, id))).toBe(false);
    expect(t.imported).toEqual([]);
  });

  it('cancels a waiting file and stops the one being copied without calling it a failure', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = '', second = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    await t.importer.cancel(lib, second);
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([first]);
    await t.importer.cancel(lib, first);
    expect(t.importer.isPending(lib, first)).toBe(false);
    expect(t.failed).toEqual([]);
    // Папки остались: их переносит в Корзину удаление встречи.
    expect(existsSync(join(lib, first))).toBe(true);
    await tick();
    expect(calls).toHaveLength(1);
  });

  it('removes unfinished meetings when the app quits', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const ids = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    await t.importer.disposeForQuit();
    for (const id of ids) expect(existsSync(join(lib, id))).toBe(false);
    expect(t.failed).toEqual([]);
    expect(t.imported).toEqual([]);
  });

  it('copies a real video: only its sound lands in the meeting folder', async () => {
    const lib = makeTempDir('textmeet-import-');
    const source = join(makeTempDir('textmeet-import-src-'), 'созвон.mp4');
    await videoWithSound(source, 1, '2026-10-04T13:20:05.000000Z');
    const t = setup({ ffmpegPath: () => resolveFfmpegPath() });
    const [id = ''] = (await t.importer.addFiles(lib, [source])).added;
    await until(() => t.imported.length === 1);
    const meeting = await readMeeting(lib, id);
    expect(meeting).toMatchObject({ status: 'recorded', createdAt: '2026-10-04T13:20:05.000Z', title: 'созвон' });
    expect(readFileSync(join(audioDir(lib, id), SOURCE_FILE)).length).toBeGreaterThan(0);
    expect(existsSync(source)).toBe(true);
  });
});

describe('recoverInterruptedImports', () => {
  it('marks a meeting left in import by a crash, but not one being imported now', async () => {
    const lib = makeTempDir('textmeet-import-');
    const crashed = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'a.mp4' });
    const running = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'b.mp4' });
    const done = await createMeeting(lib, { source: 'import', status: 'done' });
    const recovered = await recoverInterruptedImports(lib, quiet(), (id) => id === running.id);
    expect(recovered).toEqual([crashed.id]);
    expect(await readMeeting(lib, crashed.id)).toMatchObject({
      status: 'error',
      tracks: [],
      errorMessage: importTexts.interrupted,
    });
    expect((await readMeeting(lib, running.id)).status).toBe('importing');
    expect((await readMeeting(lib, done.id)).status).toBe('done');
    expect((await listMeetings(lib)).length).toBe(3);
  });
});
```

**В `src/main/import/naming.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { pickRecordedAt, titleFromFileName } from './naming';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const MODIFIED = new Date('2026-10-04T15:00:00.000Z');
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import { fitLength, pickRecordedAt, titleFromFileName } from './naming';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const MODIFIED = new Date('2026-10-04T15:00:00.000Z');
```

**В `src/main/import/naming.test.ts` заменить:**

```ts
  });

  it('keeps at most 200 characters without cutting a letter in half', () => {
    expect(Array.from(titleFromFileName(`${'😀'.repeat(250)}.mp3`, at))).toHaveLength(200);
  });
});
```

**на:**

```ts
  });

  it('keeps at most 200 characters without cutting a letter in half', () => {
    expect(titleFromFileName(`${'я'.repeat(250)}.mp3`, at)).toBe('я'.repeat(200));
    expect(titleFromFileName(`${'😀'.repeat(250)}.mp3`, at)).toBe('😀'.repeat(100));
  });
});

describe('fitLength', () => {
  it('cuts between characters', () => {
    expect(fitLength('аб😀в', 3)).toBe('аб');
    expect(fitLength('аб😀в', 4)).toBe('аб😀');
    expect(fitLength('аб', 10)).toBe('аб');
  });
});
```

**В `src/main/library/library.test.ts` заменить:**

```ts
    expect(meeting.title).toBe('Созвон');
  });

  it('picks another suffix when the folder already exists', async () => {
    const lib = tempLibrary();
    mkdirSync(join(lib, '2026-09-25_1430_aaaaaa'), { recursive: true });
```

**на:**

```ts
    expect(meeting.title).toBe('Созвон');
  });

  it('keeps the duration and the name of the source file of a meeting from a file', async () => {
    const meeting = await createMeeting(tempLibrary(), {
      source: 'import',
      status: 'importing',
      now: at,
      durationSec: 2832.4,
      sourceFileName: 'Созвон с Ириной.mp4',
    });
    expect(meeting).toMatchObject({ durationSec: 2832.4, sourceFileName: 'Созвон с Ириной.mp4', status: 'importing' });
  });

  it('picks another suffix when the folder already exists', async () => {
    const lib = tempLibrary();
    mkdirSync(join(lib, '2026-09-25_1430_aaaaaa'), { recursive: true });
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/import/importer.test.ts src/main/import/naming.test.ts src/main/library/library.test.ts`
Ожидается: FAIL — нет модуля `./importer`, `createMeeting` не принимает `durationSec` и `sourceFileName`.

- [ ] **Step 3: Код**

**Создать `src/main/import/importer.ts`:**

```ts
// Очередь импорта (решения Плана 5, §4.3): файл проверяется, встреча создаётся сразу («импорт…»), звук копируется
// по одному файлу за раз. Electron сюда не подключается — окно, сведение и окно «Файл добавлен» внедряются.
import { basename } from 'node:path';
import { MAX_IMPORT_FILES, type ImportFailure, type ImportProgress, type ImportResult } from '../../shared/import';
import type { Meeting } from '../../shared/meeting';
import { knownFsReason } from '../fs/fs-errors';
import { audioDir, createMeeting, listMeetings, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { copySourceAudio, SOURCE_FILE } from './audio-copy';
import { fitLength, pickRecordedAt, titleFromFileName } from './naming';
import { examineFile, probeTexts } from './probe';

/** Имя исходного файла в meeting.json — не длиннее (столько же разрешают Windows и macOS). */
const MAX_FILE_NAME_LENGTH = 255;

export const importTexts = {
  tooMany: `за раз можно добавить до ${MAX_IMPORT_FILES} файлов`,
  notCreated: 'не удалось создать встречу',
  notSaved: 'не удалось сохранить встречу',
  interrupted: 'Импорт прервался. Добавьте файл ещё раз.',
} as const;

export interface ImporterDeps {
  ffmpegPath(): string;
  logger: Logger;
  now(): Date;
  /** Свободное место в папке, байт; null — неизвестно. */
  freeBytes(dir: string): Promise<number | null>;
  /** Встреча появилась, изменилась или убрана — окно перечитает список. */
  libraryChanged(): void;
  progressChanged(progress: ImportProgress[]): void;
  /** Звук скопирован: сведение и окно «Файл добавлен». */
  imported(event: { libraryDir: string; meeting: Meeting }): void;
  /** Звук не скопировался: недоделанная встреча убрана, окно покажет ошибку. */
  failed(failure: ImportFailure): void;
  examine?: typeof examineFile;
  copy?: typeof copySourceAudio;
}

interface ImportJob {
  /** Папка библиотеки на момент добавления: её могут сменить в настройках, пока файл ждёт очереди. */
  libraryDir: string;
  meetingId: string;
  source: string;
  durationSec: number | null;
}

const sameJob = (job: ImportJob, libraryDir: string, meetingId: string): boolean =>
  job.libraryDir === libraryDir && job.meetingId === meetingId;

export class Importer {
  private readonly queue: ImportJob[] = [];
  private current: { job: ImportJob; abort: AbortController; done: Promise<void>; seconds: number | null } | null = null;
  private running = false;
  private disposed = false;

  constructor(private readonly deps: ImporterDeps) {}

  /** Проверить файлы, создать их встречи и поставить звук в очередь копирования. */
  async addFiles(libraryDir: string, paths: readonly string[]): Promise<ImportResult> {
    const result: ImportResult = { added: [], failed: [] };
    for (const [index, path] of paths.entries()) {
      const name = basename(path);
      const outcome = index < MAX_IMPORT_FILES ? await this.addFile(libraryDir, path, name) : { reason: importTexts.tooMany };
      if (typeof outcome === 'string') result.added.push(outcome);
      else result.failed.push({ name, reason: outcome.reason });
    }
    return result;
  }

  /** Встреча ждёт копирования или копируется. */
  isPending(libraryDir: string, meetingId: string): boolean {
    const current = this.current;
    return (
      this.queue.some((job) => sameJob(job, libraryDir, meetingId)) ||
      (current !== null && sameJob(current.job, libraryDir, meetingId))
    );
  }

  progress(): ImportProgress[] {
    const current = this.current;
    const list: ImportProgress[] = [];
    if (current) {
      const { durationSec } = current.job;
      const fraction =
        durationSec && durationSec > 0 ? Math.min(1, Math.max(0, (current.seconds ?? 0) / durationSec)) : null;
      list.push({ meetingId: current.job.meetingId, fraction, waiting: false });
    }
    for (const job of this.queue) list.push({ meetingId: job.meetingId, fraction: null, waiting: true });
    return list;
  }

  /** Встречу удаляют: снять из очереди или остановить копирование и дождаться, пока ffmpeg отпустит файлы. */
  async cancel(libraryDir: string, meetingId: string): Promise<void> {
    const waiting = this.queue.findIndex((job) => sameJob(job, libraryDir, meetingId));
    if (waiting !== -1) {
      this.queue.splice(waiting, 1);
      this.report();
    }
    const current = this.current;
    if (current && sameJob(current.job, libraryDir, meetingId)) {
      current.abort.abort();
      await current.done;
    }
  }

  /** Выход из программы: остановить копирование и убрать недоделанные встречи — исходные файлы на месте. */
  async disposeForQuit(): Promise<void> {
    this.disposed = true;
    const jobs = [...this.queue];
    this.queue.length = 0;
    const current = this.current;
    if (current) {
      jobs.unshift(current.job);
      current.abort.abort();
      await current.done;
    }
    for (const job of jobs) {
      await removeMeetingDir(job.libraryDir, job.meetingId).catch((err: unknown) =>
        this.deps.logger.warn(`Недоделанная встреча ${job.meetingId} не убрана при выходе`, err),
      );
    }
  }

  /** id созданной встречи или причина отказа. */
  private async addFile(libraryDir: string, path: string, name: string): Promise<string | { reason: string }> {
    const examine = this.deps.examine ?? examineFile;
    let examined;
    try {
      examined = await examine(this.deps.ffmpegPath(), path);
    } catch (err) {
      this.deps.logger.error(`Не удалось прочитать сведения о файле ${name}`, err);
      return { reason: probeTexts.unreadable };
    }
    if (!examined.ok) {
      this.deps.logger.info(`Файл ${name} не добавлен: ${examined.reason}`);
      return { reason: examined.reason };
    }
    const recordedAt = pickRecordedAt(examined.info.creationTime, examined.modifiedAt, this.deps.now());
    let meeting: Meeting;
    try {
      meeting = await createMeeting(libraryDir, {
        source: 'import',
        status: 'importing',
        title: titleFromFileName(name, recordedAt),
        now: recordedAt,
        durationSec: examined.info.durationSec,
        sourceFileName: fitLength(name, MAX_FILE_NAME_LENGTH),
      });
    } catch (err) {
      this.deps.logger.error(`Не удалось создать встречу для файла ${name}`, err);
      return { reason: knownFsReason(err) ?? importTexts.notCreated };
    }
    this.queue.push({ libraryDir, meetingId: meeting.id, source: path, durationSec: examined.info.durationSec });
    this.deps.libraryChanged();
    this.report();
    this.kick();
    return meeting.id;
  }

  private kick(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    for (let job = this.queue.shift(); job !== undefined && !this.disposed; job = this.queue.shift()) {
      const abort = new AbortController();
      const current = { job, abort, done: Promise.resolve(), seconds: null as number | null };
      this.current = current;
      this.report();
      current.done = this.importOne(job, abort.signal, (seconds) => {
        current.seconds = seconds;
        this.report();
      });
      await current.done;
      this.current = null;
      this.report();
    }
    this.running = false;
  }

  private report(): void {
    this.deps.progressChanged(this.progress());
  }

  private async importOne(job: ImportJob, signal: AbortSignal, onProgress: (seconds: number) => void): Promise<void> {
    const { libraryDir, meetingId } = job;
    const copy = this.deps.copy ?? copySourceAudio;
    let reason: string;
    try {
      const result = await copy(this.deps.ffmpegPath(), job.source, audioDir(libraryDir, meetingId), {
        signal,
        onProgress,
        freeBytes: this.deps.freeBytes,
      });
      try {
        const meeting = await updateMeeting(libraryDir, meetingId, (m) => ({
          ...m,
          status: 'recorded',
          tracks: [{ kind: 'file', file: SOURCE_FILE, startOffsetMs: 0 }],
          durationSec: m.durationSec ?? result.durationSec,
        }));
        this.deps.logger.info(`Импорт готов: ${meetingId}${result.reencoded ? ' (звук перекодирован)' : ''}`);
        this.deps.libraryChanged();
        this.deps.imported({ libraryDir, meeting });
        return;
      } catch (err) {
        this.deps.logger.error(`Звук встречи ${meetingId} скопирован, но встреча не сохранилась`, err);
        reason = knownFsReason(err) ?? importTexts.notSaved;
      }
    } catch (err) {
      if (signal.aborted) {
        this.deps.logger.info(`Импорт отменён: ${meetingId}`);
        return;
      }
      this.deps.logger.error(`Не удалось скопировать звук встречи ${meetingId}`, err);
      reason = err instanceof Error ? err.message : String(err);
    }
    await this.discard(job, reason);
  }

  /** Неудача: папка недоделанной встречи убирается (в ней только наша неполная копия); не вышло — встреча с ошибкой. */
  private async discard(job: ImportJob, reason: string): Promise<void> {
    const { libraryDir, meetingId } = job;
    try {
      await removeMeetingDir(libraryDir, meetingId);
    } catch (err) {
      this.deps.logger.warn(`Недоделанная встреча ${meetingId} не убрана`, err);
      await updateMeeting(libraryDir, meetingId, (m) => ({
        ...m,
        status: 'error',
        tracks: [],
        errorMessage: `Не удалось добавить файл: ${reason}.`,
      })).catch((saveErr: unknown) => this.deps.logger.warn(`Ошибка импорта ${meetingId} не записана`, saveErr));
    }
    this.deps.libraryChanged();
    this.deps.failed({ name: basename(job.source), reason });
  }
}

/**
 * При запуске: встречи «импорт…», которых нет в очереди, — импорт прервался сбоем. Встреча остаётся с понятной
 * ошибкой: её можно удалить и добавить файл ещё раз.
 */
export async function recoverInterruptedImports(
  libraryDir: string,
  logger: Logger,
  isPending: (meetingId: string) => boolean,
): Promise<string[]> {
  const recovered: string[] = [];
  for (const entry of await listMeetings(libraryDir)) {
    if (entry.kind !== 'ok' || entry.meeting.status !== 'importing' || isPending(entry.meeting.id)) continue;
    const id = entry.meeting.id;
    try {
      await updateMeeting(libraryDir, id, (m) =>
        m.status === 'importing' ? { ...m, status: 'error', tracks: [], errorMessage: importTexts.interrupted } : m,
      );
      recovered.push(id);
      logger.warn(`Импорт встречи ${id} прервался — встреча помечена ошибкой`);
    } catch (err) {
      logger.error(`Не удалось отметить прерванный импорт ${id}`, err);
    }
  }
  return recovered;
}
```

**Заменить всё содержимое `src/main/import/naming.ts` на:**

```ts
// Дата и название встречи из файла (решения Плана 5, §4.2).
import { defaultMeetingTitle } from '../library/naming';

/** Даты раньше этой — заведомо мусор (у MP4 без даты бывает 1904 или 1970 год). */
const EARLIEST = Date.UTC(2000, 0, 1);
/** Часы компьютера или телефона могут немного спешить. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
/** Как в проверке meeting.json. */
const MAX_TITLE_LENGTH = 200;

const plausible = (time: number, now: Date): boolean =>
  Number.isFinite(time) && time >= EARLIEST && time <= now.getTime() + FUTURE_SLACK_MS;

/**
 * Когда записан файл: creation_time из самого файла (его пишут телефон и Zoom), иначе время изменения файла, иначе
 * сейчас. Неправдоподобная дата (до 2000 года, в будущем) пропускается.
 */
export function pickRecordedAt(creationTime: string | null, modifiedAt: Date | null, now: Date): Date {
  const created = creationTime === null ? Number.NaN : Date.parse(creationTime);
  if (plausible(created, now)) return new Date(created);
  if (modifiedAt && plausible(modifiedAt.getTime(), now)) return new Date(modifiedAt.getTime());
  return new Date(now.getTime());
}

/**
 * Начало текста не длиннее max (длина — как её считают JavaScript и проверка meeting.json: в UTF-16). Режется между
 * символами: эмодзи не разрывается пополам.
 */
export function fitLength(text: string, max: number): string {
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out;
}

/** «Созвон с Ириной.mp4» → «Созвон с Ириной»; пустое — «Встреча ДД.ММ.ГГГГ ЧЧ:ММ» по дате записи. */
export function titleFromFileName(fileName: string, recordedAt: Date): string {
  const title = fitLength(fileName.replace(/\.[^.]*$/, '').trim(), MAX_TITLE_LENGTH).trim();
  return title === '' ? defaultMeetingTitle(recordedAt) : title;
}
```

**В `src/main/library/library.ts` заменить:**

```ts
  status: MeetingStatus;
  title?: string;
  now?: Date;
  randomSuffix?: () => string;
}
```

**на:**

```ts
  status: MeetingStatus;
  title?: string;
  now?: Date;
  /** Длительность, если она известна заранее (встреча из файла). */
  durationSec?: number | null;
  /** Имя исходного файла встречи из файла. */
  sourceFileName?: string | null;
  randomSuffix?: () => string;
}
```

**В `src/main/library/library.ts` заменить:**

```ts
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
```

**на:**

```ts
        id,
        title: input.title ?? defaultMeetingTitle(now),
        createdAt: now.toISOString(),
        durationSec: input.durationSec ?? null,
        source: input.source,
        participantsHint: null,
        model: null,
        status: input.status,
        errorMessage: null,
        speakerNames: {},
        sourceFileName: input.sourceFileName ?? null,
      });
      await writeJsonAtomic(join(dir, MEETING_FILE), meeting);
      return meeting;
```

**Создать `src/shared/import.ts`:**

```ts
// Типы импорта, общие для main и окна. Без zod и пакетов: модуль попадает в preload.

/** Сколько файлов можно добавить за раз (кнопкой или перетаскиванием). */
export const MAX_IMPORT_FILES = 100;

/** Ход импорта встречи для списка и для самой встречи. */
export interface ImportProgress {
  meetingId: string;
  /** Доля скопированного 0–1; null — длительность файла неизвестна (полоска без процентов). */
  fraction: number | null;
  /** Ждёт очереди: копируется другой файл. */
  waiting: boolean;
}

/** Файл, который не удалось добавить: имя без пути и причина для человека. */
export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportResult {
  /** id созданных встреч — по порядку файлов. */
  added: string[];
  failed: ImportFailure[];
}
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  902 passed (902)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: import queue that creates meetings from files and copies their sound"
```

### Task 8: Подключение импорта: каналы, окно «Файл добавлен», удаление, запуск и выход

**Files:**
- Modify: `src/main/import/importer.test.ts`, `src/main/import/importer.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/library/meeting-delete.test.ts`, `src/main/library/meeting-delete.ts`, `src/main/recording/controller.test.ts`, `src/main/recording/controller.ts`, `src/preload/index.ts`, `src/renderer/main/ParticipantsPicker.tsx`, `src/renderer/main/StopDialog.tsx`, `src/shared/import.ts`, `src/shared/ipc.ts`, `src/shared/recording.ts`

Окно «Файл добавлен» — окно «Запись остановлена» с `kind: 'import'` в `StopDialogData` (имя файла,
длительность может быть неизвестна): `RecordingController.queueDialog` показывает его сразу или ставит в общую очередь
окон. Вопрос — «Сколько человек говорит на записи?» (`ParticipantsPicker` получает текст вопроса). Каналы
`import:pick` (окно выбора файлов, фильтр «Аудио и видео» и «Все файлы»), `import:files` (полные пути, не больше
1000), `import:get-progress`, события `import:progress` и `import:failed`; путь перетащенного файла окно получает
через `webUtils.getPathForFile`. «Удалить встречу» сначала отменяет импорт (и возвращает файл в очередь, если Корзина
не приняла папку); «Удалить аудио» во время импорта отказывает. Папку библиотеки нельзя сменить, пока идёт импорт. При
запуске — «импорт прервался» для встреч, оставшихся `importing`; при выходе — копирование останавливается, недоделанные
встречи убираются.

- [ ] **Step 1: Тесты**

**В `src/main/import/importer.test.ts` заменить:**

```ts
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = '', second = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    await t.importer.cancel(lib, second);
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([first]);
    await t.importer.cancel(lib, first);
    expect(t.importer.isPending(lib, first)).toBe(false);
    expect(t.failed).toEqual([]);
    // Папки остались: их переносит в Корзину удаление встречи.
    expect(existsSync(join(lib, first))).toBe(true);
```

**на:**

```ts
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = '', second = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    expect(t.importer.isBusy()).toBe(true);
    await t.importer.cancel(lib, second);
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([first]);
    await t.importer.cancel(lib, first);
    expect(t.importer.isPending(lib, first)).toBe(false);
    expect(t.importer.isBusy()).toBe(false);
    expect(await t.importer.cancel(lib, first)).toBeNull();
    expect(t.failed).toEqual([]);
    // Папки остались: их переносит в Корзину удаление встречи.
    expect(existsSync(join(lib, first))).toBe(true);
```

**В `src/main/import/importer.test.ts` заменить:**

```ts
    expect(calls).toHaveLength(1);
  });

  it('removes unfinished meetings when the app quits', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
```

**на:**

```ts
    expect(calls).toHaveLength(1);
  });

  it('puts a cancelled file back first when its meeting could not be deleted', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = '', second = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    const restore = await t.importer.cancel(lib, first);
    await until(() => calls.length === 2);
    expect(calls[1]?.source).toBe('b.mp4');
    restore?.();
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([second, first]);
    calls[1]?.finish();
    await until(() => calls.length === 3);
    expect(calls[2]?.source).toBe('a.mp4');
  });

  it('removes unfinished meetings when the app quits', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
```

**В `src/main/library/meeting-delete.test.ts` заменить:**

```ts
        calls.push(`remix ${id}`);
      }),
    },
    logger: { warn: vi.fn() },
    dropStopDialog: vi.fn((id: string) => {
      calls.push(`dialog ${id}`);
```

**на:**

```ts
        calls.push(`remix ${id}`);
      }),
    },
    importer: { cancel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    dropStopDialog: vi.fn((id: string) => {
      calls.push(`dialog ${id}`);
```

**В `src/main/library/meeting-delete.test.ts` заменить:**

```ts
    ['transcribing', { status: 'transcribing' }, {}, deleteTexts.transcribing],
    ['still mixing', {}, { mixing: true }, deleteTexts.mixing],
    ['without audio already', { audioDeleted: true, tracks: [] }, {}, deleteTexts.noAudio],
  ] as const)('refuses a meeting %s', async (_name, patch, state, message) => {
    const { lib, meeting, deps } = await setup(patch as Partial<Meeting>);
    vi.mocked(deps.isRecording).mockReturnValue('recording' in state);
```

**на:**

```ts
    ['transcribing', { status: 'transcribing' }, {}, deleteTexts.transcribing],
    ['still mixing', {}, { mixing: true }, deleteTexts.mixing],
    ['without audio already', { audioDeleted: true, tracks: [] }, {}, deleteTexts.noAudio],
    ['whose file is still being copied', { status: 'importing', source: 'import' }, {}, deleteTexts.importing],
  ] as const)('refuses a meeting %s', async (_name, patch, state, message) => {
    const { lib, meeting, deps } = await setup(patch as Partial<Meeting>);
    vi.mocked(deps.isRecording).mockReturnValue('recording' in state);
```

**В `src/main/library/meeting-delete.test.ts` заменить:**

```ts
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(true);
  });

  it('does not requeue a meeting that was not waiting for transcription or mixing', async () => {
    const { meeting, deps, calls } = await setup();
    deps.trash = async () => {
```

**на:**

```ts
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(true);
  });

  it('stops the import of its file first, and puts the file back when the trash fails', async () => {
    const { lib, meeting, deps } = await setup({ status: 'importing', source: 'import', tracks: [] });
    const restore = vi.fn();
    vi.mocked(deps.importer.cancel).mockResolvedValue(restore);
    deps.trash = async () => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(deps.importer.cancel).toHaveBeenCalledWith(lib, meeting.id);
    expect(restore).toHaveBeenCalledOnce();
    deps.trash = folderTrash(join(makeTempDir('textmeet-bin-'), 'bin'));
    restore.mockClear();
    await deleteMeeting(deps, meeting.id);
    expect(restore).not.toHaveBeenCalled();
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
  });

  it('does not requeue a meeting that was not waiting for transcription or mixing', async () => {
    const { meeting, deps, calls } = await setup();
    deps.trash = async () => {
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStartCommand, RecordingState } from '../../shared/recording';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, MEETING_FILE, meetingDir, readMeeting } from '../library/library';
import type { Logger } from '../logger';
import { MIC_ACCESS_DENIED, notificationTexts, RECORDER_BROKEN, RECORDER_NOT_READY, RECORDER_TIMEOUT } from '../texts';
import { RecordingController, type ControllerDeps } from './controller';
```

**на:**

```ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStartCommand, RecordingState, StopDialogData } from '../../shared/recording';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, MEETING_FILE, meetingDir, readMeeting } from '../library/library';
import type { Logger } from '../logger';
import { MIC_ACCESS_DENIED, notificationTexts, RECORDER_BROKEN, RECORDER_NOT_READY, RECORDER_TIMEOUT } from '../texts';
import { RecordingController, type ControllerDeps } from './controller';
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
      phase: 'idle',
      meetingId: null,
      systemAudioNext: true,
      stopDialog: { meetingId: command.meetingId, title: recording.title, durationSec: 42.5 },
    });
  });
```

**на:**

```ts
      phase: 'idle',
      meetingId: null,
      systemAudioNext: true,
      stopDialog: { kind: 'recording', meetingId: command.meetingId, title: recording.title, durationSec: 42.5, fileName: null },
    });
  });
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    expect(h.state().stopDialog).toBeNull();
  });

  it('drops the dialog of a deleted meeting, open or waiting', async () => {
    const h = harness();
    const ids: string[] = [];
```

**на:**

```ts
    expect(h.state().stopDialog).toBeNull();
  });

  it('shows the dialog of an added file at once, or after the dialogs already waiting', async () => {
    const h = harness();
    const fileDialog = (meetingId: string): StopDialogData => ({
      kind: 'import',
      meetingId,
      title: 'Созвон с Ириной',
      durationSec: null,
      fileName: 'Созвон с Ириной.mp4',
    });
    h.controller.queueDialog(fileDialog('2026-10-04_1620_aaaaaa'));
    expect(h.state().stopDialog).toEqual(fileDialog('2026-10-04_1620_aaaaaa'));

    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    h.controller.queueDialog(fileDialog('2026-10-04_1620_bbbbbb'));
    expect(h.state().stopDialog?.meetingId).toBe('2026-10-04_1620_aaaaaa');
    h.controller.dropStopDialog('2026-10-04_1620_aaaaaa');
    expect(h.state().stopDialog?.meetingId).toBe(command.meetingId);
    await h.controller.finishStopDialog({ meetingId: command.meetingId, title: 'Запись', participantsHint: 2 });
    expect(h.state().stopDialog?.meetingId).toBe('2026-10-04_1620_bbbbbb');
  });

  it('names the dialog of an added file when its answer cannot be saved', async () => {
    const h = harness();
    const meeting = await createMeeting(h.lib, { source: 'import', status: 'recorded' });
    h.controller.queueDialog({ kind: 'import', meetingId: meeting.id, title: 'a', durationSec: 3, fileName: 'a.mp3' });
    breakMeetingFile(h.lib, meeting.id);
    await expect(
      h.controller.finishStopDialog({ meetingId: meeting.id, title: 'a', participantsHint: 3 }),
    ).rejects.toThrow(/^Не удалось сохранить ответ в окне «Файл добавлен»/);
  });

  it('drops the dialog of a deleted meeting, open or waiting', async () => {
    const h = harness();
    const ids: string[] = [];
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/import/importer.test.ts src/main/library/meeting-delete.test.ts src/main/recording/controller.test.ts`
Ожидается: FAIL — нет `queueDialog`, `importer` в удалении встречи, нет поля `kind` у окна.

- [ ] **Step 3: Код**

**В `src/main/import/importer.ts` заменить:**

```ts
    return list;
  }

  /** Встречу удаляют: снять из очереди или остановить копирование и дождаться, пока ffmpeg отпустит файлы. */
  async cancel(libraryDir: string, meetingId: string): Promise<void> {
    const waiting = this.queue.findIndex((job) => sameJob(job, libraryDir, meetingId));
    if (waiting !== -1) {
      this.queue.splice(waiting, 1);
      this.report();
    }
    const current = this.current;
    if (current && sameJob(current.job, libraryDir, meetingId)) {
      current.abort.abort();
      await current.done;
    }
  }

  /** Выход из программы: остановить копирование и убрать недоделанные встречи — исходные файлы на месте. */
```

**на:**

```ts
    return list;
  }

  isBusy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /**
   * Встречу удаляют: снять из очереди или остановить копирование и дождаться, пока ffmpeg отпустит файлы. Ответ —
   * как вернуть файл в очередь (первым), если удалить встречу не выйдет; null — встреча не импортировалась.
   */
  async cancel(libraryDir: string, meetingId: string): Promise<(() => void) | null> {
    const waiting = this.queue.findIndex((job) => sameJob(job, libraryDir, meetingId));
    if (waiting !== -1) {
      const job = this.queue[waiting]!;
      this.queue.splice(waiting, 1);
      this.report();
      return () => this.requeue(job);
    }
    const current = this.current;
    if (!current || !sameJob(current.job, libraryDir, meetingId)) return null;
    current.abort.abort();
    await current.done;
    return () => this.requeue(current.job);
  }

  /** Выход из программы: остановить копирование и убрать недоделанные встречи — исходные файлы на месте. */
```

**В `src/main/import/importer.ts` заменить:**

```ts
    return meeting.id;
  }

  private kick(): void {
    if (this.running || this.disposed) return;
    this.running = true;
```

**на:**

```ts
    return meeting.id;
  }

  private requeue(job: ImportJob): void {
    if (this.disposed) return;
    this.queue.unshift(job);
    this.report();
    this.kick();
  }

  private kick(): void {
    if (this.running || this.disposed) return;
    this.running = true;
```

**В `src/main/index.ts` заменить:**

```ts
import { meetingsNeedingMix, Mixer } from './audio/mixer';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { HotkeyManager } from './hotkey-manager';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { SearchIndex } from './library/search-index';
```

**на:**

```ts
import { meetingsNeedingMix, Mixer } from './audio/mixer';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { HotkeyManager } from './hotkey-manager';
import { Importer, recoverInterruptedImports } from './import/importer';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { SearchIndex } from './library/search-index';
```

**В `src/main/index.ts` заменить:**

```ts
let hotkeys: HotkeyManager | null = null;
let recorderReady = false;
let transcription: TranscriptionQueue | null = null;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
let recorderBroken = false;
const recorderCrashes: number[] = [];
```

**на:**

```ts
let hotkeys: HotkeyManager | null = null;
let recorderReady = false;
let transcription: TranscriptionQueue | null = null;
let importer: Importer | null = null;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
let recorderBroken = false;
const recorderCrashes: number[] = [];
```

**В `src/main/index.ts` заменить:**

```ts
  }
  if (controller.getState().phase !== 'idle') return;
  logger.info('TextMeet завершает работу');
  await logger.flush();
  // Только когда выход точно состоится: остановленная очередь молча пропускала бы новые встречи.
  // Встречи остаются «в очереди» / «расшифровывается» и продолжатся при следующем запуске.
```

**на:**

```ts
  }
  if (controller.getState().phase !== 'idle') return;
  logger.info('TextMeet завершает работу');
  // Недоделанные встречи из файлов убираются: исходные файлы на месте, добавить их можно снова.
  await importer?.disposeForQuit().catch((err: unknown) => logger.error('Импорт не остановился перед выходом', err));
  await logger.flush();
  // Только когда выход точно состоится: остановленная очередь молча пропускала бы новые встречи.
  // Встречи остаются «в очереди» / «расшифровывается» и продолжатся при следующем запуске.
```

**В `src/main/index.ts` заменить:**

```ts
  app.quit();
}

/** При запуске: закрыть прерванные сбоем записи, досвести и продолжить расшифровку того, что не успело. */
async function recoverAndMix(
  logger: Logger,
  libraryDir: string,
```

**на:**

```ts
  app.quit();
}

/**
 * При запуске: закрыть прерванные сбоем записи и импорт, досвести и продолжить расшифровку того, что не успело.
 */
async function recoverAndMix(
  logger: Logger,
  libraryDir: string,
```

**В `src/main/index.ts` заменить:**

```ts
  mixer: Mixer,
  controller: RecordingController,
  queue: TranscriptionQueue,
): Promise<void> {
  try {
    const recovered = await recoverInterruptedRecordings(
```

**на:**

```ts
  mixer: Mixer,
  controller: RecordingController,
  queue: TranscriptionQueue,
  imports: Importer,
): Promise<void> {
  try {
    const recovered = await recoverInterruptedRecordings(
```

**В `src/main/index.ts` заменить:**

```ts
      notify(notificationTexts.recovered(recovered.length));
      sendToMain(IPC.libraryChanged);
    }
    const entries = await listMeetings(libraryDir);
    for (const id of meetingsNeedingMix(entries)) mixer.enqueue(libraryDir, id);
    queue.resume(libraryDir, entries);
```

**на:**

```ts
      notify(notificationTexts.recovered(recovered.length));
      sendToMain(IPC.libraryChanged);
    }
    // Файлы могли начать добавлять сразу после запуска — их встречи не трогаем.
    const interrupted = await recoverInterruptedImports(libraryDir, logger, (id) => imports.isPending(libraryDir, id));
    if (interrupted.length > 0) sendToMain(IPC.libraryChanged);
    const entries = await listMeetings(libraryDir);
    for (const id of meetingsNeedingMix(entries)) mixer.enqueue(libraryDir, id);
    queue.resume(libraryDir, entries);
```

**В `src/main/index.ts` заменить:**

```ts
      });
    },
  });
  const hotkeyManager = new HotkeyManager(globalShortcut, process.platform, () => void controller.toggle());
  hotkeys = hotkeyManager;
  if (hotkeyManager.init(settings.get().recordHotkey).invalid) {
```

**на:**

```ts
      });
    },
  });
  const imports = new Importer({
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
    now: () => new Date(),
    freeBytes: freeDiskBytes,
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    progressChanged: (progress) => sendToMain(IPC.importProgress, progress),
    imported: ({ libraryDir: dir, meeting }) => {
      mixer.enqueue(dir, meeting.id);
      controller.queueDialog({
        kind: 'import',
        meetingId: meeting.id,
        title: meeting.title,
        durationSec: meeting.durationSec,
        fileName: meeting.sourceFileName,
      });
    },
    failed: (failure) => sendToMain(IPC.importFailed, failure),
  });
  importer = imports;
  const hotkeyManager = new HotkeyManager(globalShortcut, process.platform, () => void controller.toggle());
  hotkeys = hotkeyManager;
  if (hotkeyManager.init(settings.get().recordHotkey).invalid) {
```

**В `src/main/index.ts` заменить:**

```ts
      },
      transcription: queue,
      mixer,
      logger,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    exporting: {
      libraryDir,
      chooseSavePath: async (defaultPath, format) => {
```

**на:**

```ts
      },
      transcription: queue,
      mixer,
      importer: imports,
      logger,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    importer: imports,
    exporting: {
      libraryDir,
      chooseSavePath: async (defaultPath, format) => {
```

**В `src/main/index.ts` заменить:**

```ts
    // сама, и без dispose() очередь посчитала бы это сбоем. Остановленная очередь оставляет встречу
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    onSystemEnding();
  });
  windowsCreated = true;
```

**на:**

```ts
    // сама, и без dispose() очередь посчитала бы это сбоем. Остановленная очередь оставляет встречу
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    void importer?.disposeForQuit();
    onSystemEnding();
  });
  windowsCreated = true;
```

**В `src/main/index.ts` заменить:**

```ts
  );
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller, queue);
  searchIndex.refresh().catch((err: unknown) => logger.warn('Поиск не построился при запуске', err));
}
```

**на:**

```ts
  );
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller, queue, imports);
  searchIndex.refresh().catch((err: unknown) => logger.warn('Поиск не построился при запуске', err));
}
```

**В `src/main/ipc.ts` заменить:**

```ts
import { promises as fsp } from 'node:fs';
import {
  BrowserWindow,
  dialog,
```

**на:**

```ts
import { promises as fsp } from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  BrowserWindow,
  dialog,
```

**В `src/main/ipc.ts` заменить:**

```ts
  type SettingsState,
} from '../shared/ipc';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { audioSize, deleteAudio, deleteMeeting, type DeleteDeps } from './library/meeting-delete';
import { editTranscript, renameMeeting, renameSpeaker, TranscriptEditSchema } from './library/meeting-edits';
```

**на:**

```ts
  type SettingsState,
} from '../shared/ipc';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { IMPORT_EXTENSIONS } from '../shared/import';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import type { Importer } from './import/importer';
import { listMeetings, meetingDir } from './library/library';
import { audioSize, deleteAudio, deleteMeeting, type DeleteDeps } from './library/meeting-delete';
import { editTranscript, renameMeeting, renameSpeaker, TranscriptEditSchema } from './library/meeting-edits';
```

**В `src/main/ipc.ts` заменить:**

```ts
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'remove' | 'search'>;
  deletion: DeleteDeps;
  exporting: ExportDeps;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**на:**

```ts
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'remove' | 'search'>;
  deletion: DeleteDeps;
  exporting: ExportDeps;
  importer: Pick<Importer, 'addFiles' | 'progress' | 'isBusy'>;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
```

**В `src/main/ipc.ts` заменить:**

```ts
  .refine((v) => v.byteLength <= MAX_CHUNK_BYTES, `кусок дорожки больше ${MAX_CHUNK_BYTES} байт`);
const LIBRARY_LOCKED = 'Во время записи папку библиотеки менять нельзя.';
// Ответ в окне «Запись остановлена» сохраняется в папку текущей библиотеки — до него папку не меняем.
const STOP_DIALOG_OPEN = 'Сначала ответьте в окне «Запись остановлена».';
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';
```

**на:**

```ts
  .refine((v) => v.byteLength <= MAX_CHUNK_BYTES, `кусок дорожки больше ${MAX_CHUNK_BYTES} байт`);
const LIBRARY_LOCKED = 'Во время записи папку библиотеки менять нельзя.';
// Ответ в окне «Запись остановлена» сохраняется в папку текущей библиотеки — до него папку не меняем.
const STOP_DIALOG_OPEN = 'Сначала ответьте в окне «Запись остановлена» или «Файл добавлен».';
// Встречи из файлов дописываются в ту библиотеку, где созданы, — а окно «Файл добавлен» сохраняет ответ в текущую.
const IMPORT_RUNNING = 'Папку библиотеки можно сменить, когда закончится импорт файлов.';
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';
```

**В `src/main/ipc.ts` заменить:**

```ts
});

const SaveMeetingSchema = z.object({ meetingId: MeetingIdSchema, format: z.enum(['docx', 'txt']) });

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
```

**на:**

```ts
});

const SaveMeetingSchema = z.object({ meetingId: MeetingIdSchema, format: z.enum(['docx', 'txt']) });
/** Пути файлов для импорта: полные, не больше 1000 (больше 100 программа отклонит с понятной причиной). */
const ImportPathsSchema = z
  .array(z.string().min(1).max(4096).refine((path) => isAbsolute(path), 'нужен полный путь к файлу'))
  .min(1)
  .max(1000);

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
```

**В `src/main/ipc.ts` заменить:**

```ts
  handle(IPC.chooseLibraryDir, async (_arg, event) => {
    if (deps.controller.getState().phase !== 'idle') throw new Error(LIBRARY_LOCKED);
    if (deps.controller.getState().stopDialog) throw new Error(STOP_DIALOG_OPEN);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Папка библиотеки TextMeet',
```

**на:**

```ts
  handle(IPC.chooseLibraryDir, async (_arg, event) => {
    if (deps.controller.getState().phase !== 'idle') throw new Error(LIBRARY_LOCKED);
    if (deps.controller.getState().stopDialog) throw new Error(STOP_DIALOG_OPEN);
    if (deps.importer.isBusy()) throw new Error(IMPORT_RUNNING);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Папка библиотеки TextMeet',
```

**В `src/main/ipc.ts` заменить:**

```ts
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return settingsState();
    // Пока было открыто окно выбора, запись могли начать клавишей или из трея.
    if (deps.controller.getState().phase !== 'idle') throw new Error(LIBRARY_LOCKED);
    if (deps.controller.getState().stopDialog) throw new Error(STOP_DIALOG_OPEN);
    await deps.settings.update({ libraryDir: picked });
    return settingsState();
  });
```

**на:**

```ts
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return settingsState();
    // Пока было открыто окно выбора, запись могли начать клавишей или из трея, а файлы — перетащить в окно.
    if (deps.controller.getState().phase !== 'idle') throw new Error(LIBRARY_LOCKED);
    if (deps.controller.getState().stopDialog) throw new Error(STOP_DIALOG_OPEN);
    if (deps.importer.isBusy()) throw new Error(IMPORT_RUNNING);
    await deps.settings.update({ libraryDir: picked });
    return settingsState();
  });
```

**В `src/main/ipc.ts` заменить:**

```ts
    return saveMeeting(deps.exporting, request.meetingId, request.format);
  });

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**на:**

```ts
    return saveMeeting(deps.exporting, request.meetingId, request.format);
  });

  handle(IPC.pickImportFiles, async (_arg, event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Импорт файла',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Аудио и видео', extensions: IMPORT_EXTENSIONS },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  handle(IPC.importFiles, (arg) => deps.importer.addFiles(deps.libraryDir(), ImportPathsSchema.parse(arg)));

  handle(IPC.getImportProgress, () => deps.importer.progress());

  handle(IPC.getAppInfo, () => deps.appInfo());

  handle(IPC.getRecordingState, () => deps.controller.getState());
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
  recording: 'Эта встреча сейчас записывается — сначала остановите запись.',
  transcribing: 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.',
  mixing: 'Запись ещё готовится к прослушиванию — удалите аудио чуть позже.',
  noAudio: 'Аудио этой встречи уже удалено.',
} as const;
```

**на:**

```ts
  recording: 'Эта встреча сейчас записывается — сначала остановите запись.',
  transcribing: 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.',
  mixing: 'Запись ещё готовится к прослушиванию — удалите аудио чуть позже.',
  importing: 'Звук из файла ещё копируется — удалите встречу целиком или дождитесь конца импорта.',
  noAudio: 'Аудио этой встречи уже удалено.',
} as const;
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
    isPending(libraryDir: string, meetingId: string): boolean;
    enqueue(libraryDir: string, meetingId: string): void;
  };
  logger: Pick<Logger, 'warn'>;
  /** Убрать окно «Запись остановлена» этой встречи (открытое или ждущее). */
  dropStopDialog(meetingId: string): void;
```

**на:**

```ts
    isPending(libraryDir: string, meetingId: string): boolean;
    enqueue(libraryDir: string, meetingId: string): void;
  };
  /** Импорт файла: отмена отвечает, как вернуть файл в очередь (null — встреча не импортировалась). */
  importer: {
    cancel(libraryDir: string, meetingId: string): Promise<(() => void) | null>;
  };
  logger: Pick<Logger, 'warn'>;
  /** Убрать окно «Запись остановлена» этой встречи (открытое или ждущее). */
  dropStopDialog(meetingId: string): void;
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
  const libraryDir = deps.libraryDir();
  const meeting = await readMeeting(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  if (meeting.status === 'queued' || meeting.status === 'transcribing') throw new Error(deleteTexts.transcribing);
  if (deps.mixer.isPending(libraryDir, meetingId)) throw new Error(deleteTexts.mixing);
  if (meeting.audioDeleted) throw new Error(deleteTexts.noAudio);
```

**на:**

```ts
  const libraryDir = deps.libraryDir();
  const meeting = await readMeeting(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  if (meeting.status === 'importing') throw new Error(deleteTexts.importing);
  if (meeting.status === 'queued' || meeting.status === 'transcribing') throw new Error(deleteTexts.transcribing);
  if (deps.mixer.isPending(libraryDir, meetingId)) throw new Error(deleteTexts.mixing);
  if (meeting.audioDeleted) throw new Error(deleteTexts.noAudio);
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
}

/**
 * Папку встречи — в Корзину. Сначала отменяются её расшифровка и сведение (они держат файлы); после переноса
 * убирается её окно «Запись остановлена». Перенос не удался — отменённое ставится обратно, иначе встреча так и висела
 * бы «в очереди» без задачи, а запись — «готовится». Работает и для папки, которую не удалось прочитать. Папки уже нет
 * (убрали в Проводнике, повторный вызов) — встреча считается удалённой.
```

**на:**

```ts
}

/**
 * Папку встречи — в Корзину. Сначала отменяются её импорт, расшифровка и сведение (они держат файлы); после переноса
 * убирается её окно «Запись остановлена». Перенос не удался — отменённое ставится обратно, иначе встреча так и висела
 * бы «в очереди» без задачи, а запись — «готовится». Работает и для папки, которую не удалось прочитать. Папки уже нет
 * (убрали в Проводнике, повторный вызов) — встреча считается удалённой.
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
  const libraryDir = deps.libraryDir();
  const dir = meetingDir(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  await deps.transcription.cancel(libraryDir, meetingId);
  const wasMixing = deps.mixer.isPending(libraryDir, meetingId);
  await deps.mixer.cancel(libraryDir, meetingId);
```

**на:**

```ts
  const libraryDir = deps.libraryDir();
  const dir = meetingDir(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  const restoreImport = await deps.importer.cancel(libraryDir, meetingId);
  await deps.transcription.cancel(libraryDir, meetingId);
  const wasMixing = deps.mixer.isPending(libraryDir, meetingId);
  await deps.mixer.cancel(libraryDir, meetingId);
```

**В `src/main/library/meeting-delete.ts` заменить:**

```ts
    } catch (err) {
      // Папка исчезла за время попыток — удалять нечего.
      if (await exists(dir)) {
        await restoreJobs(deps, libraryDir, meetingId, wasMixing);
        throw err;
      }
```

**на:**

```ts
    } catch (err) {
      // Папка исчезла за время попыток — удалять нечего.
      if (await exists(dir)) {
        restoreImport?.();
        await restoreJobs(deps, libraryDir, meetingId, wasMixing);
        throw err;
      }
```

**В `src/main/recording/controller.ts` заменить:**

```ts
      }));
      saved = true;
    } catch (err) {
      throw humanFsError('Не удалось сохранить ответ в окне «Запись остановлена»', err);
    } finally {
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.showNextStopDialog();
    }
```

**на:**

```ts
      }));
      saved = true;
    } catch (err) {
      throw humanFsError(`Не удалось сохранить ответ в окне «${this.dialogTitle(answer.meetingId)}»`, err);
    } finally {
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.showNextStopDialog();
    }
```

**В `src/main/recording/controller.ts` заменить:**

```ts
      if (session.interrupted) this.deps.notify(notificationTexts.interrupted());
      else if (reason === 'user') this.deps.notify(notificationTexts.stopped(durationSec), true);
      if (reason === 'mic-ended') this.deps.notify(notificationTexts.micEnded());
      this.resetToIdle(session, { meetingId: meeting.id, title: meeting.title, durationSec });
      this.deps.showMainWindow();
    }
    this.deps.libraryChanged();
```

**на:**

```ts
      if (session.interrupted) this.deps.notify(notificationTexts.interrupted());
      else if (reason === 'user') this.deps.notify(notificationTexts.stopped(durationSec), true);
      if (reason === 'mic-ended') this.deps.notify(notificationTexts.micEnded());
      this.resetToIdle(session, {
        kind: 'recording',
        meetingId: meeting.id,
        title: meeting.title,
        durationSec,
        fileName: null,
      });
      this.deps.showMainWindow();
    }
    this.deps.libraryChanged();
```

**В `src/main/recording/controller.ts` заменить:**

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
```

**на:**

```ts
    this.deps.notify(notificationTexts.startFailed(problem), true);
  }

  /** Окно после импорта: сразу, если других окон нет, иначе — в очередь за ними. */
  queueDialog(dialog: StopDialogData): void {
    if (this.state.stopDialog) this.waitingDialogs.push(dialog);
    else this.update({ stopDialog: dialog });
  }

  /** Встречу удалили: её окно «Запись остановлена» больше не нужно — ни открытое, ни ждущее. */
  dropStopDialog(meetingId: string): void {
    this.waitingDialogs = this.waitingDialogs.filter((dialog) => dialog.meetingId !== meetingId);
    if (this.state.stopDialog?.meetingId === meetingId) this.showNextStopDialog();
  }

  private dialogTitle(meetingId: string): string {
    const dialog = [this.state.stopDialog, ...this.waitingDialogs].find((d) => d?.meetingId === meetingId);
    return dialog?.kind === 'import' ? 'Файл добавлен' : 'Запись остановлена';
  }

  private showNextStopDialog(): void {
    this.update({ stopDialog: this.waitingDialogs.shift() ?? null });
  }
```

**В `src/preload/index.ts` заменить:**

```ts
// Один preload на оба окна. Preload работает в песочнице: подключать можно только 'electron'
// и собственный код без пакетов (zod сюда не тянуть). Кому что разрешено, проверяет main (ipc.ts).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { heldEvent } from '../shared/held-event';
import {
  IPC,
```

**на:**

```ts
// Один preload на оба окна. Preload работает в песочнице: подключать можно только 'electron'
// и собственный код без пакетов (zod сюда не тянуть). Кому что разрешено, проверяет main (ipc.ts).
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { heldEvent } from '../shared/held-event';
import {
  IPC,
```

**В `src/preload/index.ts` заменить:**

```ts
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onModelsChanged: (listener) => subscribe(IPC.modelsChanged, () => listener()),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
};

const recorder: RecorderBridge = {
```

**на:**

```ts
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
  pickImportFiles: () => invoke(IPC.pickImportFiles),
  importFiles: (paths) => invoke(IPC.importFiles, paths),
  getImportProgress: () => invoke(IPC.getImportProgress),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onModelsChanged: (listener) => subscribe(IPC.modelsChanged, () => listener()),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
  onImportProgress: (listener) => subscribe(IPC.importProgress, listener),
  onImportFailed: (listener) => subscribe(IPC.importFailed, listener),
};

const recorder: RecorderBridge = {
```

**В `src/renderer/main/ParticipantsPicker.tsx` заменить:**

```tsx
import { useId } from 'react';
import { CHOICES, type ParticipantsChoice } from './participants';

interface Props {
  value: ParticipantsChoice;
  onChange(next: ParticipantsChoice): void;
}

/** Вопрос «Сколько человек было на встрече, включая вас?» — окно «Запись остановлена» и «Расшифровать заново». */
export function ParticipantsPicker({ value, onChange }: Props) {
  // Своё id у каждого вопроса: окно «Запись остановлена» может открыться поверх «Расшифровать заново».
  const questionId = useId();
  return (
    <>
      <div className="q" id={questionId}>
        Сколько человек было на встрече, включая вас?
      </div>
      <div className="nums" role="group" aria-labelledby={questionId}>
        {CHOICES.map((n) => (
```

**на:**

```tsx
import { useId } from 'react';
import { CHOICES, type ParticipantsChoice } from './participants';

/** Вопрос о встрече, записанной программой: на дорожке микрофона — вы. */
export const RECORDING_QUESTION = 'Сколько человек было на встрече, включая вас?';
/** Вопрос о встрече из файла: «Я» не выделяется, считаются все голоса записи. */
export const FILE_QUESTION = 'Сколько человек говорит на записи?';

interface Props {
  value: ParticipantsChoice;
  onChange(next: ParticipantsChoice): void;
  question?: string;
}

/** Вопрос о числе людей — окна «Запись остановлена», «Файл добавлен» и «Расшифровать заново». */
export function ParticipantsPicker({ value, onChange, question = RECORDING_QUESTION }: Props) {
  // Своё id у каждого вопроса: окно «Запись остановлена» может открыться поверх «Расшифровать заново».
  const questionId = useId();
  return (
    <>
      <div className="q" id={questionId}>
        {question}
      </div>
      <div className="nums" role="group" aria-labelledby={questionId}>
        {CHOICES.map((n) => (
```

**В `src/renderer/main/StopDialog.tsx` заменить:**

```tsx
import { formatDurationWithSeconds } from './format';
import { keepFocusInside } from './focus';
import { EMPTY_CHOICE, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';

/** «Запись остановлена»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data, onError }: { data: StopDialogData; onError(message: string): void }) {
  const [title, setTitle] = useState(data.title);
  const [participants, setParticipants] = useState(EMPTY_CHOICE);
```

**на:**

```tsx
import { formatDurationWithSeconds } from './format';
import { keepFocusInside } from './focus';
import { EMPTY_CHOICE, readChoice } from './participants';
import { FILE_QUESTION, ParticipantsPicker } from './ParticipantsPicker';

/** Строка под заголовком: «42 мин 15 с · уже сохранена в библиотеке» или «47 мин 12 с · «Созвон.mp4»». */
function dialogMeta(data: StopDialogData): string {
  const parts = data.durationSec === null ? [] : [formatDurationWithSeconds(data.durationSec)];
  parts.push(data.kind === 'import' ? `«${data.fileName ?? 'файл'}»` : 'уже сохранена в библиотеке');
  return parts.join(' · ');
}

/** «Запись остановлена» / «Файл добавлен»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data, onError }: { data: StopDialogData; onError(message: string): void }) {
  const [title, setTitle] = useState(data.title);
  const [participants, setParticipants] = useState(EMPTY_CHOICE);
```

**В `src/renderer/main/StopDialog.tsx` заменить:**

```tsx
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id={titleId}>Запись остановлена</h2>
        <div className="meta">{formatDurationWithSeconds(data.durationSec)} · уже сохранена в библиотеке</div>
        <label className="lab">
          Название
          <input className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
            setParticipants(next);
```

**на:**

```tsx
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id={titleId}>{data.kind === 'import' ? 'Файл добавлен' : 'Запись остановлена'}</h2>
        <div className="meta">{dialogMeta(data)}</div>
        <label className="lab">
          Название
          <input className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <ParticipantsPicker
          question={data.kind === 'import' ? FILE_QUESTION : undefined}
          value={participants}
          onChange={(next) => {
            setParticipants(next);
```

**В `src/shared/import.ts` заменить:**

```ts
/** Сколько файлов можно добавить за раз (кнопкой или перетаскиванием). */
export const MAX_IMPORT_FILES = 100;

/** Ход импорта встречи для списка и для самой встречи. */
export interface ImportProgress {
  meetingId: string;
```

**на:**

```ts
/** Сколько файлов можно добавить за раз (кнопкой или перетаскиванием). */
export const MAX_IMPORT_FILES = 100;

/** Расширения для фильтра «Аудио и видео» в окне выбора файлов (остальное — через «Все файлы»). */
export const IMPORT_EXTENSIONS = [
  'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'wma', 'amr', '3gp',
  'mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi',
];

/** Ход импорта встречи для списка и для самой встречи. */
export interface ImportProgress {
  meetingId: string;
```

**В `src/shared/ipc.ts` заменить:**

```ts
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { Meeting, MeetingListEntry } from './meeting';
import type {
  Peaks,
```

**на:**

```ts
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { ImportFailure, ImportProgress, ImportResult } from './import';
import type { Meeting, MeetingListEntry } from './meeting';
import type {
  Peaks,
```

**В `src/shared/ipc.ts` заменить:**

```ts
  selectModel: 'models:select',
  copyMeeting: 'export:copy',
  saveMeeting: 'export:save',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
```

**на:**

```ts
  selectModel: 'models:select',
  copyMeeting: 'export:copy',
  saveMeeting: 'export:save',
  pickImportFiles: 'import:pick',
  importFiles: 'import:files',
  getImportProgress: 'import:get-progress',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  // main → окно записи (команды).
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
```

**на:**

```ts
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  importProgress: 'import:progress',
  /** Звук файла не скопировался: недоделанная встреча убрана. */
  importFailed: 'import:failed',
  // main → окно записи (команды).
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
```

**на:**

```ts
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.copyMeeting]: { arg: string; result: void };
  [IPC.saveMeeting]: { arg: SaveMeetingRequest; result: SaveMeetingResult };
  [IPC.pickImportFiles]: { arg: void; result: string[] };
  [IPC.importFiles]: { arg: string[]; result: ImportResult };
  [IPC.getImportProgress]: { arg: void; result: ImportProgress[] };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
```

**В `src/shared/ipc.ts` заменить:**

```ts
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.modelsChanged]: void;
  [IPC.showMeeting]: string;
}
export type MainEventChannel = keyof MainEventContract;
```

**на:**

```ts
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.modelsChanged]: void;
  [IPC.showMeeting]: string;
  [IPC.importProgress]: ImportProgress[];
  [IPC.importFailed]: ImportFailure;
}
export type MainEventChannel = keyof MainEventContract;
```

**В `src/shared/ipc.ts` заменить:**

```ts
  copyMeeting(meetingId: string): Promise<void>;
  /** «Сохранить в Word» / «Сохранить как текст»: окно сохранения системы и файл. */
  saveMeeting(request: SaveMeetingRequest): Promise<SaveMeetingResult>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onModelsChanged(listener: () => void): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
}

/** API скрытого окна записи: window.recorder */
```

**на:**

```ts
  copyMeeting(meetingId: string): Promise<void>;
  /** «Сохранить в Word» / «Сохранить как текст»: окно сохранения системы и файл. */
  saveMeeting(request: SaveMeetingRequest): Promise<SaveMeetingResult>;
  /** «Импорт файла»: окно выбора файлов системы; пусто — передумали. */
  pickImportFiles(): Promise<string[]>;
  /** Добавить файлы: встречи создаются сразу, звук копируется по очереди. */
  importFiles(paths: string[]): Promise<ImportResult>;
  getImportProgress(): Promise<ImportProgress[]>;
  /** Путь перетащенного в окно файла (в песочнице File.path нет). */
  pathForFile(file: File): string;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onModelsChanged(listener: () => void): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
  onImportProgress(listener: Listener<ImportProgress[]>): Unsubscribe;
  onImportFailed(listener: Listener<ImportFailure>): Unsubscribe;
}

/** API скрытого окна записи: window.recorder */
```

**В `src/shared/recording.ts` заменить:**

```ts
  settings: SystemSettingsKind | null;
}

/** Окно «Запись остановлена». */
export interface StopDialogData {
  meetingId: string;
  title: string;
  durationSec: number;
}

export interface StopDialogAnswer {
```

**на:**

```ts
  settings: SystemSettingsKind | null;
}

/** Окно «Запись остановлена» (после записи) или «Файл добавлен» (после импорта, План 5). */
export interface StopDialogData {
  kind: 'recording' | 'import';
  meetingId: string;
  title: string;
  /** null — длительность файла неизвестна. */
  durationSec: number | null;
  /** Имя добавленного файла (импорт); у записи — null. */
  fileName: string | null;
}

export interface StopDialogAnswer {
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  907 passed (907)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: connect the import queue: channels, the «Файл добавлен» dialog, deletion, recovery and quit"
```

### Task 9: Понятные причины в уведомлениях записи; нет «не началась» для удалённой встречи

**Files:**
- Modify: `src/main/fs/fs-errors.test.ts`, `src/main/fs/fs-errors.ts`, `src/main/index.ts`, `src/main/recording/controller.test.ts`, `src/main/recording/controller.ts`, `src/main/texts.test.ts`, `src/main/texts.ts`

Отложенное из Планов 3 и 4. `humanFsReason`: знакомый код ошибки — понятным текстом, незнакомый — «файл занят
или недоступен» (системный текст и пути — только в журнал); им пользуются `humanFsError` и уведомления «Не удалось
записать на диск» / «не удалось сохранить сведения о записи». Постановку в очередь расшифровки после окна «Запись
остановлена» / «Файл добавлен» теперь проверяет `RecordingController`: не вышло, а папка встречи на месте —
уведомление «Встреча сохранена. Откройте её в TextMeet и нажмите «Расшифровать».»; папки нет (встречу удалили) —
только запись в журнал.

- [ ] **Step 1: Тесты**

**В `src/main/fs/fs-errors.test.ts` заменить:**

```ts
import { describe, expect, it } from 'vitest';
import { fsErrorReason, humanFsError } from './fs-errors';

const withCode = (code: string): NodeJS.ErrnoException => Object.assign(new Error(`${code}: raw`), { code });

describe('fsErrorReason', () => {
  it.each([
    ['EACCES', 'нет прав на эту папку'],
    ['EPERM', 'нет прав на эту папку'],
```

**на:**

```ts
import { describe, expect, it } from 'vitest';
import { humanFsError, humanFsReason } from './fs-errors';

const withCode = (code: string): NodeJS.ErrnoException => Object.assign(new Error(`${code}: raw`), { code });

describe('humanFsReason', () => {
  it.each([
    ['EACCES', 'нет прав на эту папку'],
    ['EPERM', 'нет прав на эту папку'],
```

**В `src/main/fs/fs-errors.test.ts` заменить:**

```ts
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
```

**на:**

```ts
    ['ENOENT', 'папка не найдена'],
    ['EROFS', 'диск доступен только для чтения'],
  ])('%s → %s', (code, reason) => {
    expect(humanFsReason(withCode(code))).toBe(reason);
  });

  it('says it in general words, without the system text, for unknown codes and non-errors', () => {
    expect(humanFsReason(withCode('EWHATEVER'))).toBe('файл занят или недоступен');
    expect(humanFsReason('строка')).toBe('файл занят или недоступен');
    expect(humanFsReason(null)).toBe('файл занят или недоступен');
  });
});
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStartCommand, RecordingState, StopDialogData } from '../../shared/recording';
```

**на:**

```ts
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStartCommand, RecordingState, StopDialogData } from '../../shared/recording';
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    emitPeaks: vi.fn(),
    libraryChanged: vi.fn(),
    enqueueMix: vi.fn(),
    enqueueTranscription: vi.fn(),
    timeouts: { startMs: 300, stopMs: 300 },
    ...overrides,
  };
```

**на:**

```ts
    emitPeaks: vi.fn(),
    libraryChanged: vi.fn(),
    enqueueMix: vi.fn(),
    enqueueTranscription: vi.fn(async () => undefined),
    timeouts: { startMs: 300, stopMs: 300 },
    ...overrides,
  };
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    expect((await readMeeting(h.lib, command.meetingId)).status).toBe('recorded');
  });

  it('stops when the disk fails while the chunks kept during the start are written', async () => {
    const h = harness({
      openTracks: async (_dir, _kinds, onError) => ({
```

**на:**

```ts
    expect((await readMeeting(h.lib, command.meetingId)).status).toBe('recorded');
  });

  it('does not show the system text of an unknown disk error', async () => {
    let failWrite: (err: unknown) => void = () => undefined;
    const h = harness({
      openTracks: async (_dir, _kinds, onError) => {
        failWrite = onError;
        return { append: vi.fn(), close: async () => undefined };
      },
    });
    await h.startRecording();
    failWrite(Object.assign(new Error("UNKNOWN: write 'C:/Users/Ирина/TextMeet/mic.webm'"), { code: 'UNKNOWN' }));
    await vi.waitFor(() =>
      expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.stoppedByDisk('файл занят или недоступен')),
    );
  });

  it('stops when the disk fails while the chunks kept during the start are written', async () => {
    const h = harness({
      openTracks: async (_dir, _kinds, onError) => ({
```

**В `src/main/recording/controller.test.ts` заменить:**

```ts
    expect(h.state().stopDialog?.meetingId).toBe(command.meetingId);
  });

  it('closes the dialog on skip even when the answer cannot be saved, and still reports the error', async () => {
    const h = harness();
    const command = await h.startRecording();
```

**на:**

```ts
    expect(h.state().stopDialog?.meetingId).toBe(command.meetingId);
  });

  it('tells how to transcribe by hand when the meeting could not be queued', async () => {
    const h = harness({ enqueueTranscription: vi.fn(async () => Promise.reject(new Error('очередь'))) });
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    vi.mocked(h.deps.notify).mockClear();
    await h.controller.finishStopDialog({ meetingId: command.meetingId, title: 'Созвон', participantsHint: 2 });
    await vi.waitFor(() => expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.transcribeNotQueued()));
    expect(h.deps.logger.error).toHaveBeenCalled();
  });

  it('says nothing when the meeting was deleted before it could be queued', async () => {
    const h = harness({
      // Встречу удалили, пока ответ сохранялся: очередь её уже не находит.
      enqueueTranscription: vi.fn(async (lib: string, id: string) => {
        rmSync(meetingDir(lib, id), { recursive: true, force: true });
        throw new Error('нет встречи');
      }),
    });
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    vi.mocked(h.deps.notify).mockClear();
    await h.controller.finishStopDialog({ meetingId: command.meetingId, title: 'Созвон', participantsHint: 2 });
    await vi.waitFor(() => expect(h.deps.logger.error).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.deps.notify).not.toHaveBeenCalled();
  });

  it('closes the dialog on skip even when the answer cannot be saved, and still reports the error', async () => {
    const h = harness();
    const command = await h.startRecording();
```

**В `src/main/texts.test.ts` заменить:**

```ts
  it('tells how to start transcription by hand when it could not be queued', () => {
    expect(notificationTexts.transcribeNotQueued()).toEqual({
      title: 'Расшифровка не началась',
      body: 'Запись сохранена. Откройте встречу в TextMeet и нажмите «Расшифровать».',
    });
  });
```

**на:**

```ts
  it('tells how to start transcription by hand when it could not be queued', () => {
    expect(notificationTexts.transcribeNotQueued()).toEqual({
      title: 'Расшифровка не началась',
      body: 'Встреча сохранена. Откройте её в TextMeet и нажмите «Расшифровать».',
    });
  });
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/fs/fs-errors.test.ts src/main/recording/controller.test.ts src/main/texts.test.ts`
Ожидается: FAIL — нет `humanFsReason`, уведомление показывает системный текст, «не началась» приходит и для удалённой встречи.

- [ ] **Step 3: Код**

**В `src/main/fs/fs-errors.ts` заменить:**

```ts
  return (code && REASONS[code]) || null;
}

/** «нет прав на эту папку» для EACCES; иначе — текст самой ошибки. */
export function fsErrorReason(err: unknown): string {
  return knownFsReason(err) ?? (err instanceof Error ? err.message : String(err));
}

/**
```

**на:**

```ts
  return (code && REASONS[code]) || null;
}

/** Причина для человека: знакомый код — понятным текстом, незнакомый — общими словами, без текста системы и путей. */
export function humanFsReason(err: unknown): string {
  return knownFsReason(err) ?? 'файл занят или недоступен';
}

/**
```

**В `src/main/fs/fs-errors.ts` заменить:**

```ts
 * и путей: они остаются в cause (и в журнале).
 */
export function humanFsError(action: string, err: unknown): Error {
  return new Error(`${action}: ${knownFsReason(err) ?? 'файл занят или недоступен'}`, { cause: err });
}
```

**на:**

```ts
 * и путей: они остаются в cause (и в журнале).
 */
export function humanFsError(action: string, err: unknown): Error {
  return new Error(`${action}: ${humanFsReason(err)}`, { cause: err });
}
```

**В `src/main/index.ts` заменить:**

```ts
    },
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
    enqueueTranscription: (dir, id) => {
      // Модель — из настроек на момент ответа в окне «Запись остановлена».
      queue.enqueue(dir, id, undefined, settings.get().asrModel).catch((err: unknown) => {
        logger.error(`Не удалось поставить встречу ${id} в очередь расшифровки`, err);
        notify(notificationTexts.transcribeNotQueued());
      });
    },
  });
  const imports = new Importer({
    ffmpegPath: () => resolveFfmpegPath(),
```

**на:**

```ts
    },
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
    // Модель — из настроек на момент ответа в окне «Запись остановлена» / «Файл добавлен».
    enqueueTranscription: (dir, id) => queue.enqueue(dir, id, undefined, settings.get().asrModel),
  });
  const imports = new Importer({
    ffmpegPath: () => resolveFfmpegPath(),
```

**В `src/main/recording/controller.ts` заменить:**

```ts
  type StopDialogData,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { fsErrorReason, humanFsError } from '../fs/fs-errors';
import { audioDir, createMeeting, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import {
  micProblem,
```

**на:**

```ts
  type StopDialogData,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { humanFsError, humanFsReason } from '../fs/fs-errors';
import { audioDir, createMeeting, meetingDir, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import {
  micProblem,
```

**В `src/main/recording/controller.ts` заменить:**

```ts
  /** Свести дорожки встречи из этой библиотеки (папку могли сменить, пока шла запись). */
  enqueueMix(libraryDir: string, meetingId: string): void;
  /** Ответ в окне «Запись остановлена» сохранён — встреча уходит в очередь расшифровки (и при «Пропустить»). */
  enqueueTranscription(libraryDir: string, meetingId: string): void;
  openTracks?: typeof openTrackFiles;
  timeouts?: { startMs: number; stopMs: number };
}
```

**на:**

```ts
  /** Свести дорожки встречи из этой библиотеки (папку могли сменить, пока шла запись). */
  enqueueMix(libraryDir: string, meetingId: string): void;
  /** Ответ в окне «Запись остановлена» сохранён — встреча уходит в очередь расшифровки (и при «Пропустить»). */
  enqueueTranscription(libraryDir: string, meetingId: string): Promise<void>;
  openTracks?: typeof openTrackFiles;
  timeouts?: { startMs: number; stopMs: number };
}
```

**В `src/main/recording/controller.ts` заменить:**

```ts
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.showNextStopDialog();
    }
    this.deps.libraryChanged();
    this.deps.enqueueTranscription(libraryDir, answer.meetingId);
  }

  start(): Promise<void> {
```

**на:**

```ts
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.showNextStopDialog();
    }
    this.deps.libraryChanged();
    this.deps
      .enqueueTranscription(libraryDir, answer.meetingId)
      .catch((err: unknown) => this.transcriptionNotQueued(libraryDir, answer.meetingId, err));
  }

  /** Встречу не удалось поставить в очередь. Её папку удалили — сказать нечего: это сделал сам человек. */
  private async transcriptionNotQueued(libraryDir: string, meetingId: string, err: unknown): Promise<void> {
    this.deps.logger.error(`Не удалось поставить встречу ${meetingId} в очередь расшифровки`, err);
    const exists = await fsp.stat(meetingDir(libraryDir, meetingId)).then(
      () => true,
      () => false,
    );
    if (exists) this.deps.notify(notificationTexts.transcribeNotQueued());
  }

  start(): Promise<void> {
```

**В `src/main/recording/controller.ts` заменить:**

```ts

  private onDiskError(err: unknown): void {
    this.deps.logger.error('Не удалось записать кусок дорожки на диск', err);
    this.deps.notify(notificationTexts.stoppedByDisk(fsErrorReason(err)));
    // Куски, пришедшие до открытия файлов, пишутся ещё во время старта: остановить можно, только когда запись пойдёт.
    if (this.state.phase === 'starting' && this.session) this.session.diskError = true;
    else void this.stop('disk');
```

**на:**

```ts

  private onDiskError(err: unknown): void {
    this.deps.logger.error('Не удалось записать кусок дорожки на диск', err);
    this.deps.notify(notificationTexts.stoppedByDisk(humanFsReason(err)));
    // Куски, пришедшие до открытия файлов, пишутся ещё во время старта: остановить можно, только когда запись пойдёт.
    if (this.state.phase === 'starting' && this.session) this.session.diskError = true;
    else void this.stop('disk');
```

**В `src/main/recording/controller.ts` заменить:**

```ts

  /** meeting.json не обновился: встреча пока числится «идёт запись», её исправит восстановление при запуске. */
  private saveFailed(err: unknown): void {
    this.deps.notify(notificationTexts.saveFailed(fsErrorReason(err)));
    this.deps.libraryChanged();
  }
```

**на:**

```ts

  /** meeting.json не обновился: встреча пока числится «идёт запись», её исправит восстановление при запуске. */
  private saveFailed(err: unknown): void {
    this.deps.notify(notificationTexts.saveFailed(humanFsReason(err)));
    this.deps.libraryChanged();
  }
```

**В `src/main/texts.ts` заменить:**

```ts
  // После окна «Запись остановлена» встречу не удалось поставить в очередь (например, папка недоступна).
  transcribeNotQueued: (): NotificationText => ({
    title: 'Расшифровка не началась',
    body: 'Запись сохранена. Откройте встречу в TextMeet и нажмите «Расшифровать».',
  }),
};
```

**на:**

```ts
  // После окна «Запись остановлена» встречу не удалось поставить в очередь (например, папка недоступна).
  transcribeNotQueued: (): NotificationText => ({
    title: 'Расшифровка не началась',
    body: 'Встреча сохранена. Откройте её в TextMeet и нажмите «Расшифровать».',
  }),
};
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  910 passed (910)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: plain reasons in recording notices; no «not queued» notice for a deleted meeting"
```

### Task 10: Импорт в окне: кнопка, перетаскивание, ход и ошибки

**Files:**
- Create: `e2e/import.spec.ts`, `src/renderer/main/import-format.test.ts`, `src/renderer/main/import-format.ts`
- Modify: `e2e/helpers.ts`, `src/main/import/importer.ts`, `src/renderer/main/App.tsx`, `src/renderer/main/MeetingList.tsx`, `src/renderer/main/MeetingMenu.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/TranscribeDialog.tsx`, `src/renderer/main/format.test.ts`, `src/renderer/main/format.ts`, `src/renderer/main/hooks.ts`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`

Внизу слева — «Импорт файла» (на месте «Открыть папку библиотеки»: папку открывает кнопка в Настройках).
`useFileDrop`: пока над окном файлы — затемнение «Отпустите — файлы станут встречами» (одно для обеих тем; счётчик
входов, чтобы не мигало над вложенными элементами; перетаскивание текста внутри окна не трогается). Первая добавленная
встреча открывается; неудачи — строкой ошибки слева («Добавлено 2 файла из 3. Не удалось добавить «отчёт.pdf»: …», не
больше трёх имён). В списке — «импорт 35%», «ждёт импорта», «импорт прервался»; во встрече — «Копируем звук из файла» с
полоской, плашка «Импорт прервался», «из файла» в строке под названием. Пока звук копируется или так и не скопировался,
в «…» нет «Удалить аудио…». Окно «Расшифровать заново» у встречи из файла спрашивает «Сколько человек говорит на
записи?».

- [ ] **Step 1: Тесты**

**В `e2e/helpers.ts` заменить:**

```ts
  ]);
}

export function meetingJson(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
```

**на:**

```ts
  ]);
}

/** Видео со звуком, как запись созвона; creationTime — дата записи в самом файле. */
export async function videoWithSound(file: string, seconds: number, creationTime?: string): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg для этой системы не найден');
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=160x120:rate=5:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:v',
    'mpeg4',
    '-c:a',
    'aac',
    ...(creationTime ? ['-metadata', `creation_time=${creationTime}`] : []),
    '-f',
    'mp4',
    file,
  ]);
}

/** Окно выбора файлов программы «выбирает» эти файлы (настоящее системное окно в тестах некому закрыть). */
export async function chooseFiles(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog;
  }, paths);
}

export function meetingJson(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
```

**Создать `e2e/import.spec.ts`:**

```ts
// Импорт файлов (План 5): кнопка «Импорт файла», окно «Файл добавлен», ошибки, перетаскивание, прерванный импорт.
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { chooseFiles, launchApp, meetingJson, readMeetingJson, videoWithSound, type LaunchedApp } from './helpers';

// Копирование звука, запуск процесса расшифровки и ожидания до 20 с — больше обычных 30 с на тест.
test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const meetingIds = async (libraryDir: string): Promise<string[]> =>
  (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

test('a file added with the button becomes a meeting and is transcribed after its dialog', async () => {
  launched = await launchApp();
  const { app, page, root, libraryDir } = launched;
  const file = join(root, 'Созвон с Ириной.mp4');
  await videoWithSound(file, 3, '2026-10-04T13:20:05.000000Z');
  await chooseFiles(app, [file]);

  await page.getByRole('button', { name: 'Импорт файла' }).click();
  const dialog = page.getByRole('dialog', { name: 'Файл добавлен' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByLabel('Название')).toHaveValue('Созвон с Ириной');
  await expect(dialog.getByText('«Созвон с Ириной.mp4»')).toBeVisible();
  await expect(dialog.getByText('Сколько человек говорит на записи?')).toBeVisible();
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  const text = page.getByLabel('Текст встречи');
  await expect(text).toBeVisible({ timeout: 20_000 });
  await expect(text).toContainText('Проверка расшифровки');
  await expect(text).toContainText('Спикер 1');
  await expect(page.locator('.head .meta')).toContainText('4 октября 2026');
  await expect(page.locator('.head .meta')).toContainText('из файла');
  const list = page.getByRole('navigation', { name: 'Встречи' });
  await expect(list.getByRole('button', { name: /Созвон с Ириной/ })).toBeVisible();

  const [id = ''] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, id)).toMatchObject({
    source: 'import',
    sourceFileName: 'Созвон с Ириной.mp4',
    participantsHint: 2,
    status: 'done',
    tracks: [{ kind: 'file', file: 'source.mka', startOffsetMs: 0 }],
  });
  expect(existsSync(join(libraryDir, id, 'audio', 'mix.opus'))).toBe(true);
  expect(existsSync(file)).toBe(true);
});

test('a file without sound is refused with a plain reason, the others are added', async () => {
  launched = await launchApp();
  const { app, page, root, libraryDir } = launched;
  const video = join(root, 'созвон.mp4');
  await videoWithSound(video, 1);
  const pdf = join(root, 'отчёт.pdf');
  await writeFile(pdf, 'не видео');
  await chooseFiles(app, [pdf, video]);

  await page.getByRole('button', { name: 'Импорт файла' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Добавлено 1 файл из 2. Не удалось добавить «отчёт.pdf»: не получилось прочитать звук из файла.',
  );
  const dialog = page.getByRole('dialog', { name: 'Файл добавлен' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Пропустить' }).click();
  await expect(dialog).toBeHidden();
  expect(await meetingIds(libraryDir)).toHaveLength(1);
});

test('the window darkens while files are dragged over it and nothing happens without a real file', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  const drag = (type: 'dragenter' | 'dragleave' | 'drop') =>
    page.evaluate((eventType) => {
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
      document.body.dispatchEvent(new DragEvent(eventType, { dataTransfer: data, bubbles: true, cancelable: true }));
    }, type);

  const overlay = page.getByText('Отпустите — файлы станут встречами');
  await drag('dragenter');
  await expect(overlay).toBeVisible();
  await drag('dragleave');
  await expect(overlay).toBeHidden();
  await drag('dragenter');
  await drag('drop');
  await expect(overlay).toBeHidden();
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
});

test('an import broken off by a crash is marked and the meeting can be deleted', async () => {
  const id = '2026-10-04_1620_a1b2c3';
  launched = await launchApp({
    meetings: [
      {
        id,
        json: meetingJson(id, {
          title: 'Созвон с Ириной',
          source: 'import',
          status: 'importing',
          sourceFileName: 'Созвон с Ириной.mp4',
        }),
      },
    ],
  });
  const { page, libraryDir, trashDir } = launched;
  const list = page.getByRole('navigation', { name: 'Встречи' });
  await expect(list.getByText('импорт прервался')).toBeVisible();
  await list.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Импорт прервался' })).toContainText('Добавьте файл ещё раз.');

  await page.getByRole('button', { name: 'Ещё' }).click();
  await expect(page.getByRole('menuitem', { name: 'Удалить аудио…' })).toBeHidden();
  await page.getByRole('menuitem', { name: 'Удалить встречу…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить встречу' }).click();
  await expect(list.getByRole('button', { name: /Созвон с Ириной/ })).toBeHidden();
  expect(existsSync(join(libraryDir, id))).toBe(false);
  expect(await readdir(trashDir)).toHaveLength(1);
});
```

**В `src/renderer/main/format.test.ts` заменить:**

```ts
    });
  });

  it('shows the progress of transcription and its errors', () => {
    const tracks = [{ kind: 'mic' as const, file: 'mic.webm', startOffsetMs: 0 }];
    const progress = { meetingId: 'a', stage: 'others' as const, fraction: 0.624, download: null };
```

**на:**

```ts
    });
  });

  it('shows the progress of an import and an import that broke off', () => {
    const importing = meeting('a', at, { status: 'importing', source: 'import' });
    expect(meetingNote(importing, undefined, { meetingId: 'a', fraction: 0.354, waiting: false })?.text).toBe('импорт 35%');
    expect(meetingNote(importing, undefined, { meetingId: 'a', fraction: null, waiting: false })?.text).toBe('импорт…');
    expect(meetingNote(importing, undefined, { meetingId: 'a', fraction: null, waiting: true })?.text).toBe('ждёт импорта');
    expect(meetingNote(meeting('a', at, { status: 'error', source: 'import' }))).toEqual({
      text: 'импорт прервался',
      tone: 'error',
    });
    const tracks = [{ kind: 'file' as const, file: 'source.mka', startOffsetMs: 0 }];
    expect(meetingNote(meeting('a', at, { status: 'error', source: 'import', tracks }))?.text).toBe('ошибка расшифровки');
  });

  it('shows the progress of transcription and its errors', () => {
    const tracks = [{ kind: 'mic' as const, file: 'mic.webm', startOffsetMs: 0 }];
    const progress = { meetingId: 'a', stage: 'others' as const, fraction: 0.624, download: null };
```

**Создать `src/renderer/main/import-format.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { importFailedText, importResultText, importView } from './import-format';

const noSound = { name: 'отчёт.pdf', reason: 'в файле нет звука' };

describe('importResultText', () => {
  it('says nothing when every file was added', () => {
    expect(importResultText({ added: ['a', 'b'], failed: [] })).toBeNull();
  });

  it('names the file and the reason', () => {
    expect(importResultText({ added: [], failed: [noSound] })).toBe('Не удалось добавить «отчёт.pdf»: в файле нет звука.');
  });

  it('first says how many were added', () => {
    expect(importResultText({ added: ['a', 'b'], failed: [noSound] })).toBe(
      'Добавлено 2 файла из 3. Не удалось добавить «отчёт.pdf»: в файле нет звука.',
    );
    expect(importResultText({ added: ['a'], failed: [noSound] })).toBe(
      'Добавлено 1 файл из 2. Не удалось добавить «отчёт.pdf»: в файле нет звука.',
    );
  });

  it('lists three failures and counts the rest', () => {
    const failed = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: `${n}.mp3`, reason: 'файл пустой' }));
    expect(importResultText({ added: [], failed })).toBe(
      'Не удалось добавить «a.mp3»: файл пустой; «b.mp3»: файл пустой; «c.mp3»: файл пустой и ещё 3 файла.',
    );
  });
});

describe('importFailedText', () => {
  it('names the file whose sound could not be copied', () => {
    expect(importFailedText({ name: 'Созвон.mp4', reason: 'на диске закончилось место' })).toBe(
      'Не удалось добавить «Созвон.mp4»: на диске закончилось место.',
    );
  });
});

describe('importView', () => {
  it('shows the share copied', () => {
    expect(importView('Созвон.mp4', { meetingId: 'a', fraction: 0.354, waiting: false })).toEqual({
      text: 'Копируем звук из файла',
      note: '«Созвон.mp4» · 35%',
      value: 35,
    });
  });

  it('shows no percentage when the duration is unknown or the progress has not come yet', () => {
    expect(importView('a.amr', { meetingId: 'a', fraction: null, waiting: false })).toEqual({
      text: 'Копируем звук из файла',
      note: '«a.amr»',
      value: null,
    });
    expect(importView('a.amr', null).value).toBeNull();
  });

  it('a file waiting for its turn', () => {
    expect(importView('b.mp4', { meetingId: 'b', fraction: null, waiting: true })).toEqual({
      text: 'Ждёт очереди',
      note: '«b.mp4» — сначала копируются файлы, добавленные раньше',
      value: null,
    });
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/renderer/main/format.test.ts src/renderer/main/import-format.test.ts`
Ожидается: FAIL — нет кнопки «Импорт файла» и окна «Файл добавлен» при импорте.

- [ ] **Step 3: Код**

**В `src/main/import/importer.ts` заменить:**

```ts
  tooMany: `за раз можно добавить до ${MAX_IMPORT_FILES} файлов`,
  notCreated: 'не удалось создать встречу',
  notSaved: 'не удалось сохранить встречу',
  interrupted: 'Импорт прервался. Добавьте файл ещё раз.',
} as const;

export interface ImporterDeps {
```

**на:**

```ts
  tooMany: `за раз можно добавить до ${MAX_IMPORT_FILES} файлов`,
  notCreated: 'не удалось создать встречу',
  notSaved: 'не удалось сохранить встречу',
  /** Под заголовком «Импорт прервался» во встрече. */
  interrupted: 'Добавьте файл ещё раз.',
} as const;

export interface ImporterDeps {
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
import { errorText } from './errors';
import {
  SearchViewContext,
  useMeetings,
  useMicrophones,
  useRecordingState,
```

**на:**

```tsx
import { errorText } from './errors';
import {
  SearchViewContext,
  useFileDrop,
  useImportProgress,
  useMeetings,
  useMicrophones,
  useRecordingState,
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  useTranscriptionProgress,
  type SearchView,
} from './hooks';
import { SettingsIcon } from './icons';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
```

**на:**

```tsx
  useTranscriptionProgress,
  type SearchView,
} from './hooks';
import { ImportIcon, SettingsIcon } from './icons';
import { importFailedText, importResultText } from './import-format';
import { LivePane } from './LivePane';
import { MeetingList } from './MeetingList';
import { MeetingPane } from './MeetingPane';
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  const { entries, error: listError } = useMeetings();
  const microphones = useMicrophones();
  const progress = useTranscriptionProgress();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
```

**на:**

```tsx
  const { entries, error: listError } = useMeetings();
  const microphones = useMicrophones();
  const progress = useTranscriptionProgress();
  const imports = useImportProgress();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  }, [liveId]);
  // Щелчок по уведомлению «Текст встречи готов» — показать эту встречу.
  useEffect(() => window.textmeet.onShowMeeting((id) => setSelection({ kind: 'meeting', id })), []);
  const dialogId = recording.stopDialog?.meetingId ?? null;
  useEffect(() => {
    if (dialogId) setSelection({ kind: 'meeting', id: dialogId });
```

**на:**

```tsx
  }, [liveId]);
  // Щелчок по уведомлению «Текст встречи готов» — показать эту встречу.
  useEffect(() => window.textmeet.onShowMeeting((id) => setSelection({ kind: 'meeting', id })), []);
  // Звук файла не скопировался уже после того, как встреча появилась.
  useEffect(() => window.textmeet.onImportFailed((failure) => setError(importFailedText(failure))), []);

  /** Добавить файлы: первая новая встреча открывается, неудачи — строкой ошибки слева. */
  const importFiles = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setError(null);
    try {
      const result = await window.textmeet.importFiles(paths);
      const first = result.added[0];
      if (first) setSelection({ kind: 'meeting', id: first });
      setError(importResultText(result));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  const dragging = useFileDrop((paths) => void importFiles(paths));
  const pickFiles = () =>
    window.textmeet
      .pickImportFiles()
      .then(importFiles)
      .catch((err: unknown) => setError(errorText(err)));
  const dialogId = recording.stopDialog?.meetingId ?? null;
  useEffect(() => {
    if (dialogId) setSelection({ kind: 'meeting', id: dialogId });
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
        key={entryId(selectedEntry)}
        entry={selectedEntry}
        progress={progress.get(entryId(selectedEntry)) ?? null}
        onError={setError}
        onDeleted={() => selectNeighbor(entryId(selectedEntry))}
      />
```

**на:**

```tsx
        key={entryId(selectedEntry)}
        entry={selectedEntry}
        progress={progress.get(entryId(selectedEntry)) ?? null}
        importing={imports.get(entryId(selectedEntry)) ?? null}
        onError={setError}
        onDeleted={() => selectNeighbor(entryId(selectedEntry))}
      />
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
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
```

**на:**

```tsx
              recording={recording}
              selectedId={selectedId}
              progress={progress}
              imports={imports}
              onSelect={(id) => setSelection({ kind: 'meeting', id })}
            />
          )}
          <div className="foot">
            <button type="button" className="btn grow" onClick={() => void pickFiles()}>
              <ImportIcon />
              Импорт файла
            </button>
            <button
              type="button"
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
        </aside>
        {pane}
        {recording.stopDialog && <StopDialog data={recording.stopDialog} onError={setError} />}
      </div>
    </SearchViewContext.Provider>
  );
```

**на:**

```tsx
        </aside>
        {pane}
        {recording.stopDialog && <StopDialog data={recording.stopDialog} onError={setError} />}
        {dragging && (
          <div className="shade drop-shade" aria-hidden="true">
            <div className="drop-frame">
              <ImportIcon />
              <b>Отпустите — файлы станут встречами</b>
              <span>Аудио или видео: mp3, m4a, wav, ogg, mp4, mov, mkv… Из видео берётся только звук.</span>
            </div>
          </div>
        )}
      </div>
    </SearchViewContext.Provider>
  );
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
import { entryId, type MeetingListEntry } from '../../shared/meeting';
import type { RecordingState } from '../../shared/recording';
import type { TranscriptionProgress } from '../../shared/transcription';
import { formatDurationShort } from '../../shared/format';
```

**на:**

```tsx
import { entryId, type MeetingListEntry } from '../../shared/meeting';
import type { ImportProgress } from '../../shared/import';
import type { RecordingState } from '../../shared/recording';
import type { TranscriptionProgress } from '../../shared/transcription';
import { formatDurationShort } from '../../shared/format';
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
  selectedId: string | null;
  /** Ход расшифровки по встречам. */
  progress: ReadonlyMap<string, TranscriptionProgress>;
  onSelect(id: string): void;
}
```

**на:**

```tsx
  selectedId: string | null;
  /** Ход расшифровки по встречам. */
  progress: ReadonlyMap<string, TranscriptionProgress>;
  /** Ход импорта по встречам. */
  imports: ReadonlyMap<string, ImportProgress>;
  onSelect(id: string): void;
}
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
  elapsed,
  selected,
  progress,
  onSelect,
}: {
  entry: MeetingListEntry;
```

**на:**

```tsx
  elapsed,
  selected,
  progress,
  importing,
  onSelect,
}: {
  entry: MeetingListEntry;
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
  elapsed: number;
  selected: boolean;
  progress: TranscriptionProgress | undefined;
  onSelect(): void;
}) {
  let title: string;
```

**на:**

```tsx
  elapsed: number;
  selected: boolean;
  progress: TranscriptionProgress | undefined;
  importing: ImportProgress | undefined;
  onSelect(): void;
}) {
  let title: string;
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
    meta = live
      ? formatTimeOfDay(entry.meeting.createdAt)
      : `${formatTimeOfDay(entry.meeting.createdAt)} · ${formatDurationShort(entry.meeting.durationSec)}`;
    note = live ? { text: `● идёт запись · ${formatClock(elapsed)}`, tone: 'live' } : meetingNote(entry.meeting, progress);
  } else if (entry.kind === 'creating') {
    title = 'Новая встреча';
    meta = '';
```

**на:**

```tsx
    meta = live
      ? formatTimeOfDay(entry.meeting.createdAt)
      : `${formatTimeOfDay(entry.meeting.createdAt)} · ${formatDurationShort(entry.meeting.durationSec)}`;
    note = live
      ? { text: `● идёт запись · ${formatClock(elapsed)}`, tone: 'live' }
      : meetingNote(entry.meeting, progress, importing);
  } else if (entry.kind === 'creating') {
    title = 'Новая встреча';
    meta = '';
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
}

/** Список встреч по дням, новые сверху. */
export function MeetingList({ entries, error, recording, selectedId, progress, onSelect }: Props) {
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
  const now = useNow(liveId !== null);
  const elapsed = recording.startedAt === null ? 0 : (now - recording.startedAt) / 1000;
```

**на:**

```tsx
}

/** Список встреч по дням, новые сверху. */
export function MeetingList({ entries, error, recording, selectedId, progress, imports, onSelect }: Props) {
  const liveId = recording.phase !== 'idle' ? recording.meetingId : null;
  const now = useNow(liveId !== null);
  const elapsed = recording.startedAt === null ? 0 : (now - recording.startedAt) / 1000;
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
      )}
      {entries?.length === 0 && (
        <p className="empty-list">
          Пока нет встреч. Нажмите «Начать запись» — встреча появится здесь.
        </p>
      )}
      {groupByDay(entries ?? [], new Date()).map((group) => (
```

**на:**

```tsx
      )}
      {entries?.length === 0 && (
        <p className="empty-list">
          Пока нет встреч. Нажмите «Начать запись» или перетащите сюда запись — встреча появится здесь.
        </p>
      )}
      {groupByDay(entries ?? [], new Date()).map((group) => (
```

**В `src/renderer/main/MeetingList.tsx` заменить:**

```tsx
                elapsed={elapsed}
                selected={id === selectedId}
                progress={progress.get(id)}
                onSelect={() => onSelect(id)}
              />
            );
```

**на:**

```tsx
                elapsed={elapsed}
                selected={id === selectedId}
                progress={progress.get(id)}
                importing={imports.get(id)}
                onSelect={() => onSelect(id)}
              />
            );
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
import type { Meeting } from '../../shared/meeting';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { deleteAudioText } from './format';
import { FolderIcon, MoreIcon, MuteIcon, TrashIcon } from './icons';
import { menuFocusStep } from './menu-keys';
```

**на:**

```tsx
import type { Meeting } from '../../shared/meeting';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { deleteAudioText, isImportFailure } from './format';
import { FolderIcon, MoreIcon, MuteIcon, TrashIcon } from './icons';
import { menuFocusStep } from './menu-keys';
```

**В `src/renderer/main/MeetingMenu.tsx` заменить:**

```tsx
            <span className="mi-label">Открыть папку встречи</span>
          </button>
          <div className="sep" role="separator" />
          {!meeting.audioDeleted && (
            <button
              type="button"
              className="mi"
```

**на:**

```tsx
            <span className="mi-label">Открыть папку встречи</span>
          </button>
          <div className="sep" role="separator" />
          {/* Звук из файла копируется или так и не скопировался — удалить можно только встречу целиком. */}
          {!meeting.audioDeleted && meeting.status !== 'importing' && !isImportFailure(meeting) && (
            <button
              type="button"
              className="mi"
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort, formatLongDate } from '../../shared/format';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import { hasManualChanges, isStaleEditMessage, type TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
import { segmentAt } from './playback';
```

**на:**

```tsx
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isAsrModelId } from '../../shared/asr-models';
import { formatDurationShort, formatLongDate } from '../../shared/format';
import type { ImportProgress } from '../../shared/import';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { transcriptModelTitle, type SpeakerId } from '../../shared/transcript';
import { hasManualChanges, isStaleEditMessage, type TranscriptEdit } from '../../shared/transcript-edit';
import type { TranscriptionProgress } from '../../shared/transcription';
import { errorText } from './errors';
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { importView } from './import-format';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
import { segmentAt } from './playback';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  entry: MeetingListEntry;
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  onError(message: string): void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
```

**на:**

```tsx
  entry: MeetingListEntry;
  /** Ход расшифровки этой встречи, если она в очереди или расшифровывается. */
  progress: TranscriptionProgress | null;
  /** Ход импорта этой встречи, если её звук ещё копируется. */
  importing: ImportProgress | null;
  onError(message: string): void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  );
}

function ProgressBar({ value, wide }: { value: number; wide?: boolean }) {
  return (
    <div
      className={wide ? 'prog wide' : 'prog'}
      role="progressbar"
      aria-label="Ход расшифровки"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
```

**на:**

```tsx
  );
}

function ProgressBar({ value, wide, label = 'Ход расшифровки' }: { value: number; wide?: boolean; label?: string }) {
  return (
    <div
      className={wide ? 'prog wide' : 'prog'}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  );
}

type BusyStatus = 'queued' | 'transcribing';

/** Текст встречи, связанный с плеером: звучащая реплика подсвечена, щелчок по времени — слушать с этого места. */
```

**на:**

```tsx
  );
}

/** Звук из файла ещё копируется — вместо текста ход импорта (лист 13 макета). */
function ImportBlock({ fileName, progress }: { fileName: string | null; progress: ImportProgress | null }) {
  const view = importView(fileName, progress);
  return (
    <div className="empty-note">
      <b role="status">{view.text}</b>
      <span>{view.note}</span>
      {view.value !== null && <ProgressBar value={view.value} wide label="Ход импорта" />}
      <span className="small">
        Видео не копируется, исходный файл остаётся на месте. Потом спросим, сколько человек на записи, и начнём
        расшифровку.
      </span>
    </div>
  );
}

type BusyStatus = 'queued' | 'transcribing';

/** Текст встречи, связанный с плеером: звучащая реплика подсвечена, щелчок по времени — слушать с этого места. */
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
function MeetingView({
  entry,
  progress,
  onError,
  onDeleted,
}: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
```

**на:**

```tsx
function MeetingView({
  entry,
  progress,
  importing,
  onError,
  onDeleted,
}: Props & { entry: Extract<MeetingListEntry, { kind: 'ok' }> }) {
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const canPlay = mixReady && !playback.failed;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
  if (meeting.audioDeleted) meta.push('аудио удалено');
  const hasAudio = meeting.tracks.length > 0;
```

**на:**

```tsx
  const canPlay = mixReady && !playback.failed;
  const meta = [formatLongDate(meeting.createdAt), formatDurationShort(meeting.durationSec)];
  if (meeting.participantsHint !== null) meta.push(participantsText(meeting.participantsHint));
  if (meeting.source === 'import') meta.push('из файла');
  if (load.kind === 'ready') meta.push(`Текст: ${transcriptModelTitle(load.transcript)}`);
  if (meeting.audioDeleted) meta.push('аудио удалено');
  const hasAudio = meeting.tracks.length > 0;
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
```

**на:**

```tsx
  // Текст уже есть (он виден, пока новый не готов) — в окне предупреждаем, что он заменится.
  const hasText = load.kind === 'ready';
  const transcribeError = meeting.status === 'error' && hasAudio;
  const importFailed = isImportFailure(meeting);
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>{transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>{meeting.errorMessage ?? 'Что-то пошло не так.'}</p>
            {transcribeError && (
              <div className="acts">
                <button type="button" className="btn" onClick={() => void retry()}>
```

**на:**

```tsx
        <div className="banner" role="alert">
          <WarnIcon />
          <div>
            <b>{importFailed ? 'Импорт прервался' : transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>
              {meeting.errorMessage ?? 'Что-то пошло не так.'}
              {importFailed && ' Эту встречу можно удалить: «…» → «Удалить встречу…».'}
            </p>
            {transcribeError && (
              <div className="acts">
                <button type="button" className="btn" onClick={() => void retry()}>
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
          </div>
        </div>
      )}
      <Body
        meeting={meeting}
        load={load}
        busy={busy}
        progress={progress}
        playback={playback}
        canPlay={canPlay}
        onEdit={edit}
        onError={onError}
        onTranscribe={actions.body ? () => setDialog(true) : null}
      />
      {mixReady ? (
        <Player meetingId={meeting.id} playback={playback} />
      ) : (
```

**на:**

```tsx
          </div>
        </div>
      )}
      {meeting.status === 'importing' ? (
        <ImportBlock fileName={meeting.sourceFileName} progress={importing} />
      ) : (
        <Body
          meeting={meeting}
          load={load}
          busy={busy}
          progress={progress}
          playback={playback}
          canPlay={canPlay}
          onEdit={edit}
          onError={onError}
          onTranscribe={actions.body ? () => setDialog(true) : null}
        />
      )}
      {mixReady ? (
        <Player meetingId={meeting.id} playback={playback} />
      ) : (
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
          replacesText={hasText}
          losesEdits={hasManualChanges(load.kind === 'ready' ? load.transcript : null, meeting.speakerNames)}
          participantsHint={meeting.participantsHint}
          onClose={() => setDialog(false)}
        />
      )}
```

**на:**

```tsx
          replacesText={hasText}
          losesEdits={hasManualChanges(load.kind === 'ready' ? load.transcript : null, meeting.speakerNames)}
          participantsHint={meeting.participantsHint}
          fromFile={meeting.source === 'import'}
          onClose={() => setDialog(false)}
        />
      )}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, onError, onDeleted }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
```

**на:**

```tsx
}

/** Выбранная встреча: создаётся, не прочиталась или прочитана. */
export function MeetingPane({ entry, progress, importing, onError, onDeleted }: Props) {
  if (entry.kind === 'creating') {
    return (
      <main className="pane" aria-label="Встреча">
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
      </main>
    );
  }
  return <MeetingView entry={entry} progress={progress} onError={onError} onDeleted={onDeleted} />;
}
```

**на:**

```tsx
      </main>
    );
  }
  return (
    <MeetingView entry={entry} progress={progress} importing={importing} onError={onError} onDeleted={onDeleted} />
  );
}
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
import { ChevronIcon, WarnIcon } from './icons';
import { modelChoiceLabel } from './model-catalog';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';

interface Props {
  meetingId: string;
```

**на:**

```tsx
import { ChevronIcon, WarnIcon } from './icons';
import { modelChoiceLabel } from './model-catalog';
import { choiceFor, readChoice } from './participants';
import { FILE_QUESTION, ParticipantsPicker } from './ParticipantsPicker';

interface Props {
  meetingId: string;
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
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

**на:**

```tsx
  losesEdits: boolean;
  /** Число участников, указанное раньше (выбрано заранее). */
  participantsHint: number | null;
  /** Встреча из файла: спрашиваем, сколько человек говорит на записи («Я» не выделяется). */
  fromFile: boolean;
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: модель (по умолчанию — из настроек), число участников и запуск. */
export function TranscribeDialog({
  meetingId,
  again,
  replacesText,
  losesEdits,
  participantsHint,
  fromFile,
  onClose,
}: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [models, setModels] = useState<ModelsState | null>(null);
  /** null — пока не выбрали сами: модель из настроек. */
```

**В `src/renderer/main/TranscribeDialog.tsx` заменить:**

```tsx
          </div>
        )}
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
            setParticipants(next);
```

**на:**

```tsx
          </div>
        )}
        <ParticipantsPicker
          question={fromFile ? FILE_QUESTION : undefined}
          value={participants}
          onChange={(next) => {
            setParticipants(next);
```

**В `src/renderer/main/format.ts` заменить:**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import { formatBytes, formatDurationShort, MONTHS_GENITIVE } from '../../shared/format';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';
```

**на:**

```ts
import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import { formatBytes, formatDurationShort, MONTHS_GENITIVE } from '../../shared/format';
import type { ImportProgress } from '../../shared/import';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';
```

**В `src/renderer/main/format.ts` заменить:**

```ts

/**
 * Пометка встречи в списке — только если есть о чём сказать. У готовой встречи пометки нет.
 * progress — ход расшифровки этой встречи (если она сейчас расшифровывается).
 */
export function meetingNote(meeting: Meeting, progress?: TranscriptionProgress): MeetingNote | null {
  switch (meeting.status) {
    case 'importing':
      return { text: 'импорт…', tone: 'accent' };
    case 'recording':
      return { text: 'идёт запись', tone: 'live' };
    case 'recorded':
```

**на:**

```ts

/**
 * Пометка встречи в списке — только если есть о чём сказать. У готовой встречи пометки нет.
 * progress — ход расшифровки этой встречи (если она сейчас расшифровывается), importing — ход её импорта.
 */
export function meetingNote(
  meeting: Meeting,
  progress?: TranscriptionProgress,
  importing?: ImportProgress,
): MeetingNote | null {
  switch (meeting.status) {
    case 'importing':
      if (importing?.waiting) return { text: 'ждёт импорта', tone: 'accent' };
      return importing?.fraction != null
        ? { text: `импорт ${percent(importing.fraction)}%`, tone: 'accent' }
        : { text: 'импорт…', tone: 'accent' };
    case 'recording':
      return { text: 'идёт запись', tone: 'live' };
    case 'recorded':
```

**В `src/renderer/main/format.ts` заменить:**

```ts
        ? { text: `расшифровка ${percent(progress.fraction)}%`, tone: 'accent' }
        : { text: 'расшифровка…', tone: 'accent' };
    case 'error':
      // С дорожками ошибка — у расшифровки (запись сохранилась); без них — у самой записи.
      return { text: meeting.tracks.length > 0 ? 'ошибка расшифровки' : 'ошибка', tone: 'error' };
    case 'done':
```

**на:**

```ts
        ? { text: `расшифровка ${percent(progress.fraction)}%`, tone: 'accent' }
        : { text: 'расшифровка…', tone: 'accent' };
    case 'error':
      if (isImportFailure(meeting)) return { text: 'импорт прервался', tone: 'error' };
      // С дорожками ошибка — у расшифровки (запись сохранилась); без них — у самой записи.
      return { text: meeting.tracks.length > 0 ? 'ошибка расшифровки' : 'ошибка', tone: 'error' };
    case 'done':
```

**В `src/renderer/main/format.ts` заменить:**

```ts
  }
}

/** Текст окна «Удалить аудио?»: «Запись (32 мин, 15 МБ) переместится в Корзину…»; размер — когда узнали. */
export function deleteAudioText(durationSec: number | null, bytes: number | null): string {
  const parts: string[] = [];
```

**на:**

```ts
  }
}

/** Встреча из файла, чей звук так и не скопировался (сбой программы или неудача, после которой папку не убрать). */
export const isImportFailure = (meeting: Meeting): boolean =>
  meeting.status === 'error' && meeting.source === 'import' && meeting.tracks.length === 0 && !meeting.audioDeleted;

/** Текст окна «Удалить аудио?»: «Запись (32 мин, 15 МБ) переместится в Корзину…»; размер — когда узнали. */
export function deleteAudioText(durationSec: number | null, bytes: number | null): string {
  const parts: string[] = [];
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
import { createContext, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { SearchResult } from '../../shared/search';
```

**на:**

```ts
import { createContext, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ImportProgress } from '../../shared/import';
import type { MeetingListEntry, MeetingStatus } from '../../shared/meeting';
import type { Peaks, RecordingState } from '../../shared/recording';
import type { SearchResult } from '../../shared/search';
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
  return new Map(list.map((p) => [p.meetingId, p]));
}

export type TranscriptLoad =
  | { kind: 'loading' }
  | { kind: 'none' }
```

**на:**

```ts
  return new Map(list.map((p) => [p.meetingId, p]));
}

/** Ход импорта по встречам: сначала запрос, дальше — события. */
export function useImportProgress(): ReadonlyMap<string, ImportProgress> {
  const [list, setList] = useState<ImportProgress[]>([]);
  useEffect(() => {
    let active = true;
    let gotEvent = false;
    const unsubscribe = window.textmeet.onImportProgress((next) => {
      gotEvent = true;
      setList(next);
    });
    window.textmeet
      .getImportProgress()
      .then((initial) => {
        if (active && !gotEvent) setList(initial);
      })
      .catch((err: unknown) => console.error('TextMeet: ход импорта не получен', errorText(err)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return new Map(list.map((p) => [p.meetingId, p]));
}

/**
 * Перетаскивание файлов в окно: true, пока над окном файлы (затемнение); отпустили — пути файлов. Счётчик входов:
 * над вложенными элементами dragenter и dragleave приходят парами, и затемнение не мигает. Перетаскивание текста
 * внутри окна (в нём нет файлов) не трогается.
 */
export function useFileDrop(onFiles: (paths: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const paths = files.map((file) => window.textmeet.pathForFile(file)).filter((path) => path !== '');
      if (paths.length > 0) latest.current(paths);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return dragging;
}

export type TranscriptLoad =
  | { kind: 'loading' }
  | { kind: 'none' }
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
```

**на:**

```tsx
  </Icon>
);

export const ImportIcon = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
```

**Создать `src/renderer/main/import-format.ts`:**

```ts
// Тексты импорта для окна (решения Плана 5, §2.1–2.2): чистые функции — проверяются модульными тестами.
import type { ImportFailure, ImportProgress, ImportResult } from '../../shared/import';
import { pluralize } from './format';
import { percent } from './transcription-format';

/** Сколько неудач перечислять по имени; остальные — «и ещё N». */
const LISTED_FAILURES = 3;

const failureText = (failure: ImportFailure): string => `«${failure.name}»: ${failure.reason}`;

/**
 * Итог добавления файлов для строки ошибки слева; null — всё добавилось. «Не удалось добавить «отчёт.pdf»: в файле
 * нет звука.»; если что-то добавилось — сначала «Добавлено 2 файла из 3.».
 */
export function importResultText(result: ImportResult): string | null {
  const { added, failed } = result;
  if (failed.length === 0) return null;
  const total = added.length + failed.length;
  const listed = failed.slice(0, LISTED_FAILURES).map(failureText).join('; ');
  const rest = failed.length - LISTED_FAILURES;
  const more = rest > 0 ? ` и ещё ${rest} ${pluralize(rest, 'файл', 'файла', 'файлов')}` : '';
  const files = `${added.length} ${pluralize(added.length, 'файл', 'файла', 'файлов')}`;
  const head = added.length > 0 ? `Добавлено ${files} из ${total}. ` : '';
  return `${head}Не удалось добавить ${listed}${more}.`;
}

/** Звук файла не скопировался (уже после создания встречи). */
export const importFailedText = (failure: ImportFailure): string => `Не удалось добавить ${failureText(failure)}.`;

export interface ImportView {
  text: string;
  note: string;
  /** Проценты для полоски; null — полоски нет (ждёт очереди или длительность неизвестна). */
  value: number | null;
}

/** Ход импорта во встрече: «Копируем звук из файла» · «Созвон.mp4 · 35%» или «Ждёт очереди». */
export function importView(fileName: string | null, progress: ImportProgress | null): ImportView {
  const name = `«${fileName ?? 'файл'}»`;
  if (progress?.waiting) {
    return { text: 'Ждёт очереди', note: `${name} — сначала копируются файлы, добавленные раньше`, value: null };
  }
  if (progress?.fraction == null) return { text: 'Копируем звук из файла', note: name, value: null };
  const value = percent(progress.fraction);
  return { text: 'Копируем звук из файла', note: `${name} · ${value}%`, value };
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
  outline: none;
}

/* ---- Ход расшифровки ---- */
.prog {
  display: block;
```

**на:**

```css
  outline: none;
}

/* ---- Перетаскивание файлов в окно (План 5, лист 12) ---- */
/* Затемнение одно для светлой и тёмной темы: светлый текст на нём читается в обеих. */
.drop-shade {
  padding: 28px;
  background: rgba(29, 27, 23, 0.72);
  z-index: 6;
  pointer-events: none;
}

.drop-frame {
  flex: 1;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 2px dashed #fffdf8;
  border-radius: 14px;
  color: #fffdf8;
  text-align: center;
}

.drop-frame .ic {
  width: 44px;
  height: 44px;
}

.drop-frame b {
  font-family: var(--f-text);
  font-size: 28px;
  font-weight: 600;
}

.drop-frame span {
  font-size: 14px;
  opacity: 0.85;
}

.empty-note .small {
  font-size: 12.5px;
  max-width: 460px;
}

/* ---- Ход расшифровки ---- */
.prog {
  display: block;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  919 passed (919)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `51 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: import in the window: the button, dragging files in, progress and errors"
```

### Task 11: «Экспорт» во встрече

**Files:**
- Create: `e2e/export.spec.ts`, `src/renderer/main/ExportMenu.tsx`
- Modify: `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/icons.tsx`, `src/renderer/main/styles.css`

`ExportMenu`: кнопка «Экспорт» между «Расшифровать заново» и «…» — меню «Скопировать всё», «Сохранить в Word
(.docx)…», «Сохранить как текст (.txt)…»; клавиатура и закрытие — как у «…». После копирования кнопка 2 с показывает
«Скопировано» (`aria-live`). Кнопки нет, пока в тексте встречи нет ни одной реплики. В сквозных тестах окно сохранения
подменяется в main, буфер обмена читается там же.

- [ ] **Step 1: Тесты**

**Создать `e2e/export.spec.ts`:**

```ts
// Экспорт (План 5): «Скопировать всё», «Сохранить в Word», «Сохранить как текст». Системное окно сохранения
// подменяется в main — в тестах его некому закрыть.
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
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
    { id: 'seg-2', start: 715, end: 718, speakerId: 's1', text: 'Подрядчиков отдельно.', edited: false },
    { id: 'seg-3', start: 724, end: 726, speakerId: 'me', text: 'Понял.', edited: false },
  ],
};
const EXPECTED_TEXT =
  'Созвон с Ириной\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
  'Ирина [11:48]\nСмотри, по бюджету. Подрядчиков отдельно.\n\nЯ [12:04]\nПонял.\n';

async function launchWithText(): Promise<LaunchedApp> {
  const app = await launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          createdAt,
          durationSec: 32 * 60 + 15,
          status: 'done',
          speakerNames: { s1: 'Ирина' },
        }),
      },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
  await app.page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(app.page.getByLabel('Текст встречи')).toContainText('Подрядчиков отдельно.');
  return app;
}

/** Окно сохранения «сохраняет» в этот файл и запоминает, что предлагала программа. */
async function saveTo(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const options = args.find((a) => typeof a === 'object' && a !== null && 'defaultPath' in a);
      (globalThis as { offered?: unknown }).offered = options;
      return { canceled: false, filePath: target };
    }) as typeof dialog.showSaveDialog;
  }, file);
}

const offered = (app: ElectronApplication): Promise<{ defaultPath: string }> =>
  app.evaluate(() => (globalThis as { offered?: { defaultPath: string } }).offered ?? { defaultPath: '' });

test('copies the whole text, plain and formatted', async () => {
  launched = await launchWithText();
  const { app, page } = launched;
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Скопировать всё' }).click();
  await expect(page.getByRole('button', { name: /Скопировано/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Экспорт/ })).toBeVisible({ timeout: 5_000 });

  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(text.replace(/\r\n/g, '\n')).toBe(EXPECTED_TEXT);
  const html = await app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    if (!item?.types.includes('text/html')) return '';
    return ((await item.getType('text/html')) as Blob).text();
  });
  expect(html).toContain('<b>Ирина</b>');
});

test('saves a Word file and a text file, starting the second time in the same folder', async () => {
  launched = await launchWithText();
  const { app, page, root, userDataDir } = launched;
  const docx = join(root, 'out', 'итоги.docx');
  await mkdir(dirname(docx), { recursive: true });

  await saveTo(app, docx);
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Сохранить в Word (.docx)…' }).click();
  await expect.poll(() => existsSync(docx)).toBe(true);
  expect((await readFile(docx)).subarray(0, 2).toString()).toBe('PK');
  expect((await offered(app)).defaultPath).toMatch(/Созвон с Ириной\.docx$/);

  const txt = join(root, 'out', 'итоги.txt');
  await saveTo(app, txt);
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Сохранить как текст (.txt)…' }).click();
  await expect.poll(() => existsSync(txt)).toBe(true);
  expect((await offered(app)).defaultPath).toBe(join(dirname(docx), 'Созвон с Ириной.txt'));
  const bytes = await readFile(txt);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes.toString('utf8').slice(1).replace(/\r\n/g, '\n')).toBe(EXPECTED_TEXT);
  expect(JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8'))).toMatchObject({
    exportDir: dirname(docx),
  });
});

test('there is nothing to export before the meeting has text', async () => {
  launched = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { title: 'Без текста', status: 'recorded' }) }],
  });
  const { page } = launched;
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Без текста/ }).click();
  await expect(page.getByRole('heading', { name: 'Без текста' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Экспорт/ })).toBeHidden();
});
```

- [ ] **Step 2: Тесты падают**

Сквозные тесты новой части падают до кода (нет кнопки «Экспорт») — проверяются после Step 4.

- [ ] **Step 3: Код**

**Создать `src/renderer/main/ExportMenu.tsx`:**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ExportFormat } from '../../shared/ipc';
import { errorText } from './errors';
import { CheckIcon, ChevronIcon, CopyIcon, ExportIcon, FileIcon } from './icons';
import { menuFocusStep } from './menu-keys';

interface Props {
  meetingId: string;
  onError(message: string): void;
}

/** Сколько кнопка показывает «Скопировано». */
const COPIED_MS = 2000;

/** Кнопка «Экспорт» в заголовке встречи: «Скопировать всё», «Сохранить в Word», «Сохранить как текст» (лист 15). */
export function ExportMenu({ meetingId, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Пункт выбран: меню закрывается, фокус — на «Экспорт» (пункт исчезает вместе с меню). */
  const close = () => {
    button.current?.focus();
    setOpen(false);
  };

  const copy = () => {
    close();
    window.textmeet
      .copyMeeting(meetingId)
      .then(() => setCopied(true))
      .catch((err: unknown) => onError(errorText(err)));
  };

  const save = (format: ExportFormat) => {
    close();
    window.textmeet.saveMeeting({ meetingId, format }).catch((err: unknown) => onError(errorText(err)));
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[menuFocusStep(at, items.length, event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={wrap} className="more-wrap">
      <button
        ref={button}
        type="button"
        className={open ? 'btn on' : 'btn'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {copied ? <CheckIcon /> : <ExportIcon />}
        <span aria-live="polite">{copied ? 'Скопировано' : 'Экспорт'}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="menu export-menu" role="menu" aria-label="Экспорт" onKeyDown={keys}>
          <button type="button" className="mi" role="menuitem" onClick={copy}>
            <CopyIcon />
            <span className="mi-label">Скопировать всё</span>
          </button>
          <div className="sep" role="separator" />
          <button type="button" className="mi" role="menuitem" onClick={() => save('docx')}>
            <FileIcon />
            <span className="mi-label">Сохранить в Word (.docx)…</span>
          </button>
          <button type="button" className="mi" role="menuitem" onClick={() => save('txt')}>
            <FileIcon />
            <span className="mi-label">Сохранить как текст (.txt)…</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { importView } from './import-format';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
```

**на:**

```tsx
import { isImportFailure, participantsText } from './format';
import { SearchViewContext, usePlayback, useTranscript, type Playback, type TranscriptLoad } from './hooks';
import { FolderIcon, TrashIcon, WarnIcon } from './icons';
import { ExportMenu } from './ExportMenu';
import { importView } from './import-format';
import { MeetingTitle } from './MeetingTitle';
import { Player } from './Player';
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
  const transcribeError = meeting.status === 'error' && hasAudio;
  const importFailed = isImportFailure(meeting);
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
```

**на:**

```tsx
  const transcribeError = meeting.status === 'error' && hasAudio;
  const importFailed = isImportFailure(meeting);
  const actions = transcribeActions(meeting.status, hasAudio, load.kind);
  // Выгружать есть что, только если в тексте есть хоть одна реплика (прежний текст — и во время расшифровки заново).
  const canExport = load.kind === 'ready' && load.transcript.segments.some((s) => s.text.trim() !== '');
  // «Повторить» — той же моделью, что не справилась (её id в meeting.json); неизвестная — из настроек.
  const retry = () =>
    window.textmeet
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
              {actions.header}
            </button>
          )}
          <MeetingMenu
            meeting={meeting}
            audioBlocked={audioBlocked}
```

**на:**

```tsx
              {actions.header}
            </button>
          )}
          {canExport && <ExportMenu meetingId={meeting.id} onError={onError} />}
          <MeetingMenu
            meeting={meeting}
            audioBlocked={audioBlocked}
```

**В `src/renderer/main/icons.tsx` заменить:**

```tsx
  </Icon>
);

export const ImportIcon = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
```

**на:**

```tsx
  </Icon>
);

export const ExportIcon = () => (
  <Icon>
    <path d="M12 15V4M7 9l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const FileIcon = () => (
  <Icon>
    <path d="M6 3h8l5 5v13H6z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

export const ImportIcon = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
```

**В `src/renderer/main/styles.css` заменить:**

```css
  background: transparent;
}

/* Меню «…» в заголовке встречи — справа под кнопкой. */
.more-wrap {
  position: relative;
```

**на:**

```css
  background: transparent;
}

/* Меню «Экспорт» — под кнопкой, шире обычного: в пунктах — формат файла. */
.export-menu {
  width: 290px;
}

.btn .ic + span + .ic {
  width: 13px;
  height: 13px;
  margin-left: -2px;
  color: var(--muted);
}

/* Меню «…» в заголовке встречи — справа под кнопкой. */
.more-wrap {
  position: relative;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  919 passed (919)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `54 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: «Экспорт» in the meeting: copy all, save as Word or text"
```

### Task 12: Доработки по ревью: окно

**Files:**
- Modify: `e2e/export.spec.ts`, `e2e/import.spec.ts`, `src/renderer/main/App.tsx`, `src/renderer/main/ExportMenu.tsx`, `src/renderer/main/MeetingPane.tsx`, `src/renderer/main/format.ts`, `src/renderer/main/hooks.ts`, `src/renderer/main/import-format.ts`, `src/renderer/main/styles.css`

Окно «Файл добавлен» не переключает выбранную встречу (импорт идёт в фоне — человек мог править другую
встречу или быть в Настройках); переключает только окно «Запись остановлена». Добавления файлов идут по очереди (файлы,
брошенные во время проверки прежних, ждут их); пока открыто окно выбора файлов, кнопка «Импорт файла» выключена. Удачный
импорт не стирает ошибку, которую успел показать другой. Затемнение не залипает: уход из окна (`relatedTarget` нет) и
потеря фокуса его снимают. Брошенные файлы без пути на диске (из архива, вложение письма) — понятное сообщение.
«Скопировано» повторяется при каждом копировании; для экранного диктора — отдельная строка `role="status"`; стрелка
кнопки — свой класс. Плашка прерванного импорта без текста ошибки — «Добавьте файл ещё раз.».

- [ ] **Step 1: Тесты**

**В `e2e/export.spec.ts` заменить:**

```ts
  });
});

test('there is nothing to export before the meeting has text', async () => {
  launched = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { title: 'Без текста', status: 'recorded' }) }],
```

**на:**

```ts
  });
});

test('the export menu works from the keyboard and gives the focus back', async () => {
  launched = await launchWithText();
  const { page } = launched;
  const exportButton = page.getByRole('button', { name: /Экспорт/ });
  await exportButton.click();
  await expect(page.getByRole('menuitem', { name: 'Скопировать всё' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Сохранить в Word (.docx)…' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Сохранить как текст (.txt)…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Экспорт' })).toBeHidden();
  await expect(exportButton).toBeFocused();
});

test('a cancelled save writes nothing and says nothing', async () => {
  launched = await launchWithText();
  const { app, page, userDataDir } = launched;
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as typeof dialog.showSaveDialog;
  });
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Сохранить как текст (.txt)…' }).click();
  await expect(page.getByRole('menu', { name: 'Экспорт' })).toBeHidden();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).exportDir ?? null).toBeNull();
});

test('there is nothing to export before the meeting has text', async () => {
  launched = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { title: 'Без текста', status: 'recorded' }) }],
```

**В `e2e/import.spec.ts` заменить:**

```ts
  expect(await meetingIds(libraryDir)).toHaveLength(1);
});

test('the window darkens while files are dragged over it and nothing happens without a real file', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  const drag = (type: 'dragenter' | 'dragleave' | 'drop') =>
    page.evaluate((eventType) => {
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
      document.body.dispatchEvent(new DragEvent(eventType, { dataTransfer: data, bubbles: true, cancelable: true }));
    }, type);

  const overlay = page.getByText('Отпустите — файлы станут встречами');
  await drag('dragenter');
  await expect(overlay).toBeVisible();
  await drag('dragleave');
  await expect(overlay).toBeHidden();
  await drag('dragenter');
  await drag('drop');
  await expect(overlay).toBeHidden();
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
});
```

**на:**

```ts
  expect(await meetingIds(libraryDir)).toHaveLength(1);
});

test('the window darkens while files are dragged over it, not for dragged text', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  /** Событие перетаскивания над списком встреч; inside — переход между элементами внутри окна. */
  const drag = (type: 'dragenter' | 'dragleave' | 'drop', what: 'file' | 'text' = 'file', inside = true) =>
    page.evaluate(
      ([eventType, kind, within]) => {
        const data = new DataTransfer();
        if (kind === 'file') data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
        else data.setData('text/plain', 'кусок текста');
        const target = document.querySelector('.list') ?? document.body;
        const relatedTarget = within ? document.body : null;
        target.dispatchEvent(new DragEvent(eventType, { dataTransfer: data, bubbles: true, cancelable: true, relatedTarget }));
      },
      [type, what, inside] as const,
    );

  const overlay = page.getByText('Отпустите — файлы станут встречами');
  await drag('dragenter', 'text');
  await expect(overlay).toBeHidden();
  await drag('dragenter');
  await drag('dragenter');
  await drag('dragleave');
  await expect(overlay).toBeVisible();
  // Ушли из окна — затемнение снимается, даже если пары событий не сошлись.
  await drag('dragleave', 'file', false);
  await expect(overlay).toBeHidden();
});

test('a dropped file without a path on disk is explained', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  await page.evaluate(() => {
    // Новые данные у каждого события — как при настоящем перетаскивании.
    for (const type of ['dragenter', 'drop']) {
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
    }
  });
  await expect(page.getByRole('alert')).toHaveText(
    'Не удалось получить путь к файлу — перетащите его из папки или нажмите «Импорт файла».',
  );
  await expect(page.getByText('Отпустите — файлы станут встречами')).toBeHidden();
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
});
```

- [ ] **Step 2: Тесты падают**

Сквозные тесты новой части падают до кода (новые сквозные проверки перетаскивания, клавиатуры меню и отменённого сохранения) — проверяются после Step 4.

- [ ] **Step 3: Код**

**В `src/renderer/main/App.tsx` заменить:**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
```

**на:**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { entryId } from '../../shared/meeting';
import { IDLE_RECORDING_STATE } from '../../shared/recording';
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

/** Один и тот же пустой список: новый [] перерисовывал бы каждую реплику открытой встречи. */
const NO_WORDS: readonly string[] = [];
```

**на:**

```tsx

type Selection = { kind: 'meeting'; id: string } | { kind: 'settings' } | null;

/** Бросили файлы без пути на диске (из архива, вложение письма). */
const NO_FILE_PATH = 'Не удалось получить путь к файлу — перетащите его из папки или нажмите «Импорт файла».';

/** Один и тот же пустой список: новый [] перерисовывал бы каждую реплику открытой встречи. */
const NO_WORDS: readonly string[] = [];
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
  // Звук файла не скопировался уже после того, как встреча появилась.
  useEffect(() => window.textmeet.onImportFailed((failure) => setError(importFailedText(failure))), []);

  /** Добавить файлы: первая новая встреча открывается, неудачи — строкой ошибки слева. */
  const importFiles = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setError(null);
    try {
      const result = await window.textmeet.importFiles(paths);
      const first = result.added[0];
      if (first) setSelection({ kind: 'meeting', id: first });
      setError(importResultText(result));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  const dragging = useFileDrop((paths) => void importFiles(paths));
  const pickFiles = () =>
    window.textmeet
      .pickImportFiles()
      .then(importFiles)
      .catch((err: unknown) => setError(errorText(err)));
  const dialogId = recording.stopDialog?.meetingId ?? null;
  useEffect(() => {
    if (dialogId) setSelection({ kind: 'meeting', id: dialogId });
  }, [dialogId]);

  const platform = info?.platform ?? 'win32';
  // Клавишу держит другая программа — не показываем её как способ начать и остановить запись.
```

**на:**

```tsx
  // Звук файла не скопировался уже после того, как встреча появилась.
  useEffect(() => window.textmeet.onImportFailed((failure) => setError(importFailedText(failure))), []);

  /**
   * Добавить файлы: первая новая встреча открывается, неудачи — строкой ошибки слева. Добавления идут по очереди: файлы,
   * брошенные, пока проверяются прежние, ждут их и не перемешиваются с ними.
   */
  const importChain = useRef<Promise<void>>(Promise.resolve());
  const importFiles = useCallback((paths: string[]) => {
    const run = async () => {
      setError(null);
      try {
        const result = await window.textmeet.importFiles(paths);
        const first = result.added[0];
        if (first) setSelection({ kind: 'meeting', id: first });
        // Всё добавилось — ошибку не трогаем: её мог успеть показать неудачный импорт другого файла.
        const text = importResultText(result);
        if (text) setError(text);
      } catch (err) {
        setError(errorText(err));
      }
    };
    importChain.current = importChain.current.then(run);
    return importChain.current;
  }, []);
  const dragging = useFileDrop((paths) => {
    if (paths.length > 0) void importFiles(paths);
    else setError(NO_FILE_PATH);
  });
  const [picking, setPicking] = useState(false);
  const pickFiles = () => {
    setPicking(true);
    window.textmeet
      .pickImportFiles()
      .then((paths) => (paths.length > 0 ? importFiles(paths) : undefined))
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setPicking(false));
  };
  // Окно «Запись остановлена» показывает свою встречу. Окно «Файл добавлен» встречу не переключает: импорт идёт в фоне,
  // и человек в это время может работать с другой встречей (первая добавленная и так открылась при добавлении).
  const recordingDialogId = recording.stopDialog?.kind === 'recording' ? recording.stopDialog.meetingId : null;
  useEffect(() => {
    if (recordingDialogId) setSelection({ kind: 'meeting', id: recordingDialogId });
  }, [recordingDialogId]);

  const platform = info?.platform ?? 'win32';
  // Клавишу держит другая программа — не показываем её как способ начать и остановить запись.
```

**В `src/renderer/main/App.tsx` заменить:**

```tsx
            />
          )}
          <div className="foot">
            <button type="button" className="btn grow" onClick={() => void pickFiles()}>
              <ImportIcon />
              Импорт файла
            </button>
```

**на:**

```tsx
            />
          )}
          <div className="foot">
            <button type="button" className="btn grow" disabled={picking} aria-busy={picking} onClick={pickFiles}>
              <ImportIcon />
              Импорт файла
            </button>
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
/** Кнопка «Экспорт» в заголовке встречи: «Скопировать всё», «Сохранить в Word», «Сохранить как текст» (лист 15). */
export function ExportMenu({ meetingId, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
```

**на:**

```tsx
/** Кнопка «Экспорт» в заголовке встречи: «Скопировать всё», «Сохранить в Word», «Сохранить как текст» (лист 15). */
export function ExportMenu({ meetingId, onError }: Props) {
  const [open, setOpen] = useState(false);
  /** Сколько раз скопировали: каждое копирование заново показывает «Скопировано» на 2 с. */
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Пункт выбран: меню закрывается, фокус — на «Экспорт» (пункт исчезает вместе с меню). */
  const close = () => {
```

**на:**

```tsx
  }, [open]);

  useEffect(() => {
    if (copies === 0) return;
    setCopied(true);
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copies]);

  /** Пункт выбран: меню закрывается, фокус — на «Экспорт» (пункт исчезает вместе с меню). */
  const close = () => {
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
    close();
    window.textmeet
      .copyMeeting(meetingId)
      .then(() => setCopied(true))
      .catch((err: unknown) => onError(errorText(err)));
  };
```

**на:**

```tsx
    close();
    window.textmeet
      .copyMeeting(meetingId)
      .then(() => setCopies((n) => n + 1))
      .catch((err: unknown) => onError(errorText(err)));
  };
```

**В `src/renderer/main/ExportMenu.tsx` заменить:**

```tsx
        onClick={() => setOpen(!open)}
      >
        {copied ? <CheckIcon /> : <ExportIcon />}
        <span aria-live="polite">{copied ? 'Скопировано' : 'Экспорт'}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="menu export-menu" role="menu" aria-label="Экспорт" onKeyDown={keys}>
          <button type="button" className="mi" role="menuitem" onClick={copy}>
```

**на:**

```tsx
        onClick={() => setOpen(!open)}
      >
        {copied ? <CheckIcon /> : <ExportIcon />}
        {copied ? 'Скопировано' : 'Экспорт'}
        <span className="chev">
          <ChevronIcon />
        </span>
      </button>
      {/* Экранному диктору — отдельно от названия кнопки. */}
      <span className="sr-only" role="status">
        {copied ? 'Текст встречи скопирован' : ''}
      </span>
      {open && (
        <div className="menu export-menu" role="menu" aria-label="Экспорт" onKeyDown={keys}>
          <button type="button" className="mi" role="menuitem" onClick={copy}>
```

**В `src/renderer/main/MeetingPane.tsx` заменить:**

```tsx
          <div>
            <b>{importFailed ? 'Импорт прервался' : transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>
              {meeting.errorMessage ?? 'Что-то пошло не так.'}
              {importFailed && ' Эту встречу можно удалить: «…» → «Удалить встречу…».'}
            </p>
            {transcribeError && (
```

**на:**

```tsx
          <div>
            <b>{importFailed ? 'Импорт прервался' : transcribeError ? 'Ошибка расшифровки' : 'Ошибка'}</b>
            <p>
              {meeting.errorMessage ?? (importFailed ? 'Добавьте файл ещё раз.' : 'Что-то пошло не так.')}
              {importFailed && ' Эту встречу можно удалить: «…» → «Удалить встречу…».'}
            </p>
            {transcribeError && (
```

**В `src/renderer/main/format.ts` заменить:**

```ts
  switch (meeting.status) {
    case 'importing':
      if (importing?.waiting) return { text: 'ждёт импорта', tone: 'accent' };
      return importing?.fraction != null
        ? { text: `импорт ${percent(importing.fraction)}%`, tone: 'accent' }
        : { text: 'импорт…', tone: 'accent' };
    case 'recording':
```

**на:**

```ts
  switch (meeting.status) {
    case 'importing':
      if (importing?.waiting) return { text: 'ждёт импорта', tone: 'accent' };
      return importing && importing.fraction !== null
        ? { text: `импорт ${percent(importing.fraction)}%`, tone: 'accent' }
        : { text: 'импорт…', tone: 'accent' };
    case 'recording':
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
}

/**
 * Перетаскивание файлов в окно: true, пока над окном файлы (затемнение); отпустили — пути файлов. Счётчик входов:
 * над вложенными элементами dragenter и dragleave приходят парами, и затемнение не мигает. Перетаскивание текста
 * внутри окна (в нём нет файлов) не трогается.
 */
export function useFileDrop(onFiles: (paths: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
```

**на:**

```ts
}

/**
 * Перетаскивание файлов в окно: true, пока над окном файлы (затемнение); отпустили — пути файлов (пусто — у брошенных
 * файлов нет пути на диске). Счётчик входов: над вложенными элементами dragenter и dragleave приходят парами, и
 * затемнение не мигает; уход из окна (relatedTarget нет) и потеря фокуса сбрасывают его, чтобы затемнение не залипло.
 * Перетаскивание текста внутри окна (в нём нет файлов) не трогается.
 */
export function useFileDrop(onFiles: (paths: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
```

**В `src/renderer/main/hooks.ts` заменить:**

```ts
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const paths = files.map((file) => window.textmeet.pathForFile(file)).filter((path) => path !== '');
      if (paths.length > 0) latest.current(paths);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
```

**на:**

```ts
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const reset = () => {
      depth = 0;
      setDragging(false);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = event.relatedTarget === null ? 0 : Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      reset();
      const files = [...(event.dataTransfer?.files ?? [])];
      const pathOf = (file: File): string => {
        try {
          return window.textmeet.pathForFile(file);
        } catch {
          return '';
        }
      };
      if (files.length > 0) latest.current(files.map(pathOf).filter((path) => path !== ''));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('blur', reset);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
```

**В `src/renderer/main/import-format.ts` заменить:**

```ts
  if (progress?.waiting) {
    return { text: 'Ждёт очереди', note: `${name} — сначала копируются файлы, добавленные раньше`, value: null };
  }
  if (progress?.fraction == null) return { text: 'Копируем звук из файла', note: name, value: null };
  const value = percent(progress.fraction);
  return { text: 'Копируем звук из файла', note: `${name} · ${value}%`, value };
}
```

**на:**

```ts
  if (progress?.waiting) {
    return { text: 'Ждёт очереди', note: `${name} — сначала копируются файлы, добавленные раньше`, value: null };
  }
  if (!progress || progress.fraction === null) return { text: 'Копируем звук из файла', note: name, value: null };
  const value = percent(progress.fraction);
  return { text: 'Копируем звук из файла', note: `${name} · ${value}%`, value };
}
```

**В `src/renderer/main/styles.css` заменить:**

```css
  width: 290px;
}

.btn .ic + span + .ic {
  width: 13px;
  height: 13px;
  margin-left: -2px;
  color: var(--muted);
}

/* Меню «…» в заголовке встречи — справа под кнопкой. */
.more-wrap {
  position: relative;
```

**на:**

```css
  width: 290px;
}

.btn .chev {
  display: inline-flex;
  margin-left: -2px;
}

.btn .chev .ic {
  width: 13px;
  height: 13px;
  color: var(--muted);
}

/* Только для экранного диктора. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Меню «…» в заголовке встречи — справа под кнопкой. */
.more-wrap {
  position: relative;
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  919 passed (919)`.
- [ ] **Сквозные тесты:** `npm run build`, затем `npx playwright test`. Ожидается: `57 passed`, `1 skipped` (проверка собранной программы — только с `TEXTMEET_PACKAGED_APP`; про `hotkey.spec.ts` на этом компьютере — см. «Факты»).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: review of the window: import dialog keeps the selection, imports one after another, drag overlay never sticks"
```

### Task 13: Доработки по ревью: main

**Files:**
- Modify: `src/main/export/export-meeting.ts`, `src/main/export/file-name.test.ts`, `src/main/export/file-name.ts`, `src/main/import/importer.test.ts`, `src/main/import/importer.ts`, `src/main/import/probe.test.ts`, `src/main/import/probe.ts`, `src/main/index.ts`, `src/main/recording/controller.ts`, `src/shared/export-doc.test.ts`, `src/shared/export-doc.ts`

Очередь импорта не встаёт ни от какой ошибки: сбой сообщения окну или сведению только пишется в журнал и не
удаляет встречу, чей звук уже скопирован. Отмена файла, который успел закончиться, не возвращает его в очередь (иначе он
копировался бы второй раз). Пока файлы проверяются, импорт считается идущим (папку библиотеки не сменить); файл,
проверенный уже после начала выхода, встречу не создаёт. Конец сеанса Windows только останавливает импорт (`stop`),
уборку делает следующий запуск; он же удаляет недописанную копию звука. Человеку показываются только известные причины
неудачи копирования, остальное — «файл повреждён или его формат не поддерживается». Имя файла выгрузки: обратная косая
черта тоже заменяется, имена устройств Windows проверяются до первой точки («con.report» → «_con.report»). Управляющие
символы в тексте (вставка из Word) не ломают .docx. Нулевая длительность файла — неизвестная. Ошибка сборки файла —
«Не удалось собрать файл», а не «файл занят».

- [ ] **Step 1: Тесты**

**В `src/main/export/file-name.test.ts` заменить:**

```ts

  it('replaces characters that Windows and macOS do not allow in names', () => {
    expect(exportFileName('План: Q4 / бюджет? "черновик" <v2>|*', 'txt')).toBe('План Q4 бюджет черновик v2.txt');
    expect(exportFileName('a\u0000b\tc\nd', 'txt')).toBe('a b c d.txt');
  });
```

**на:**

```ts

  it('replaces characters that Windows and macOS do not allow in names', () => {
    expect(exportFileName('План: Q4 / бюджет? "черновик" <v2>|*', 'txt')).toBe('План Q4 бюджет черновик v2.txt');
    expect(exportFileName('Отчёт\\итоги', 'docx')).toBe('Отчёт итоги.docx');
    expect(exportFileName('a\u0000b\tc\nd', 'txt')).toBe('a b c d.txt');
  });
```

**В `src/main/export/file-name.test.ts` заменить:**

```ts
  });

  it('keeps reserved Windows names from turning into devices', () => {
    expect(exportFileName('CON', 'txt')).toBe('CON_.txt');
    expect(exportFileName('com1', 'docx')).toBe('com1_.docx');
    expect(exportFileName('Console', 'txt')).toBe('Console.txt');
  });
```

**на:**

```ts
  });

  it('keeps reserved Windows names from turning into devices', () => {
    expect(exportFileName('CON', 'txt')).toBe('_CON.txt');
    expect(exportFileName('com1', 'docx')).toBe('_com1.docx');
    expect(exportFileName('con.report', 'docx')).toBe('_con.report.docx');
    expect(exportFileName('Console', 'txt')).toBe('Console.txt');
  });
```

**В `src/main/import/importer.test.ts` заменить:**

```ts
    expect(calls[2]?.source).toBe('a.mp4');
  });

  it('removes unfinished meetings when the app quits', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
```

**на:**

```ts
    expect(calls[2]?.source).toBe('a.mp4');
  });

  it('keeps working after a listener throws, and never deletes a meeting whose sound was copied', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({
      copy,
      examine: async () => goodFile(null),
      imported: () => {
        throw new Error('окно закрыто');
      },
      failed: () => {
        throw new Error('окно закрыто');
      },
    });
    const [first = '', second = '', third = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4', 'c.mp4'])).added;
    await until(() => calls.length === 1);
    calls[0]?.finish();
    await until(() => calls.length === 2);
    expect((await readMeeting(lib, first)).status).toBe('recorded');
    calls[1]?.fail(new Error(copyTexts.broken));
    await until(() => calls.length === 3);
    expect(existsSync(join(lib, second))).toBe(false);
    calls[2]?.finish();
    await until(() => !t.importer.isBusy());
    expect((await readMeeting(lib, third)).status).toBe('recorded');
  });

  it('shows only known copy reasons; anything else is a broken file', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    await t.importer.addFiles(lib, ['a.mp4']);
    await until(() => calls.length === 1);
    calls[0]?.fail(new Error("spawn C:\\Program Files\\TextMeet\\ffmpeg.exe ENOENT"));
    await until(() => t.failed.length === 1);
    expect(t.failed).toEqual([{ name: 'a.mp4', reason: copyTexts.broken }]);
  });

  it('a file that finished while it was being cancelled is not put back', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    let restore: (() => void) | null | undefined;
    const t = setup({
      copy,
      examine: async () => goodFile(null),
      // Удаление пришло, когда звук уже скопирован и встреча вот-вот станет «записано».
      imported: ({ libraryDir, meeting }) => {
        void t.importer.cancel(libraryDir, meeting.id).then((r) => {
          restore = r;
        });
      },
    });
    await t.importer.addFiles(lib, ['a.mp4']);
    await until(() => calls.length === 1);
    calls[0]?.finish();
    await until(() => restore !== undefined);
    expect(restore).toBeNull();
  });

  it('counts files being checked as a running import', async () => {
    const lib = makeTempDir('textmeet-import-');
    let release: () => void = () => undefined;
    const t = setup({
      copy: controlledCopy().copy,
      examine: () =>
        new Promise<Examined>((resolve) => {
          release = () => resolve({ ok: false, reason: probeTexts.noAudio });
        }),
    });
    const adding = t.importer.addFiles(lib, ['a.mp4']);
    await tick();
    expect(t.importer.isBusy()).toBe(true);
    release();
    await adding;
    expect(t.importer.isBusy()).toBe(false);
  });

  it('creates no meeting for a file checked while the app was closing', async () => {
    const lib = makeTempDir('textmeet-import-');
    let release: () => void = () => undefined;
    const t = setup({
      copy: controlledCopy().copy,
      examine: () =>
        new Promise<Examined>((resolve) => {
          release = () => resolve(goodFile(null));
        }),
    });
    const adding = t.importer.addFiles(lib, ['a.mp4']);
    await tick();
    await t.importer.disposeForQuit();
    release();
    expect(await adding).toEqual({ added: [], failed: [{ name: 'a.mp4', reason: importTexts.quitting }] });
    expect(await listMeetings(lib)).toEqual([]);
  });

  it('stopping for the end of a Windows session keeps the unfinished meetings for the next start', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const ids = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    await t.importer.stop();
    for (const id of ids) expect((await readMeeting(lib, id)).status).toBe('importing');
    expect(t.importer.isBusy()).toBe(false);
  });

  it('removes unfinished meetings when the app quits', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
```

**В `src/main/import/importer.test.ts` заменить:**

```ts
    const crashed = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'a.mp4' });
    const running = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'b.mp4' });
    const done = await createMeeting(lib, { source: 'import', status: 'done' });
    const recovered = await recoverInterruptedImports(lib, quiet(), (id) => id === running.id);
    expect(recovered).toEqual([crashed.id]);
    expect(await readMeeting(lib, crashed.id)).toMatchObject({
      status: 'error',
```

**на:**

```ts
    const crashed = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'a.mp4' });
    const running = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'b.mp4' });
    const done = await createMeeting(lib, { source: 'import', status: 'done' });
    writeFileSync(join(audioDir(lib, crashed.id), `${SOURCE_FILE}.part`), 'недописано');
    const recovered = await recoverInterruptedImports(lib, quiet(), (id) => id === running.id);
    expect(existsSync(join(audioDir(lib, crashed.id), `${SOURCE_FILE}.part`))).toBe(false);
    expect(recovered).toEqual([crashed.id]);
    expect(await readMeeting(lib, crashed.id)).toMatchObject({
      status: 'error',
```

**В `src/main/import/probe.test.ts` заменить:**

```ts
    expect(parseProbe(raw)).toEqual({ hasAudio: true, durationSec: null, creationTime: null });
  });

  it('not a media file', () => {
    expect(parseProbe('[in#0 @ 0x1] Error opening input: Invalid data found when processing input\n')).toBeNull();
    expect(parseProbe('')).toBeNull();
```

**на:**

```ts
    expect(parseProbe(raw)).toEqual({ hasAudio: true, durationSec: null, creationTime: null });
  });

  it('a zero duration means an unknown one', () => {
    expect(parseProbe(ZOOM.replace('Duration: 00:47:12.34', 'Duration: 00:00:00.00'))?.durationSec).toBeNull();
  });

  it('not a media file', () => {
    expect(parseProbe('[in#0 @ 0x1] Error opening input: Invalid data found when processing input\n')).toBeNull();
    expect(parseProbe('')).toBeNull();
```

**В `src/shared/export-doc.test.ts` заменить:**

```ts
    expect(doc.participantsLine).toBe('Участники: Ирина');
  });

  it('a meeting without replicas has no participants and no paragraphs', () => {
    const doc = buildExportDoc(meeting, { segments: [] });
    expect(doc.participantsLine).toBeNull();
```

**на:**

```ts
    expect(doc.participantsLine).toBe('Участники: Ирина');
  });

  it('drops control characters that would break a Word file', () => {
    const doc = buildExportDoc({ ...meeting, title: 'Со\u0001звон' }, {
      segments: [seg(1, 's1', 'Строка\u000bвторая\u0007.')],
    });
    expect(doc.title).toBe('Созвон');
    expect(doc.paragraphs[0]?.text).toBe('Строка\nвторая.');
  });

  it('a meeting without replicas has no participants and no paragraphs', () => {
    const doc = buildExportDoc(meeting, { segments: [] });
    expect(doc.participantsLine).toBeNull();
```

- [ ] **Step 2: Тесты падают**

Run: `npx vitest run src/main/export/file-name.test.ts src/main/import/importer.test.ts src/main/import/probe.test.ts src/shared/export-doc.test.ts`
Ожидается: FAIL — новые проверки очереди импорта, имени файла, управляющих символов и нулевой длительности.

- [ ] **Step 3: Код**

**В `src/main/export/export-meeting.ts` заменить:**

```ts
export const exportTexts = {
  noText: 'У встречи пока нет текста — выгружать нечего.',
  unreadable: 'Не удалось прочитать текст встречи.',
} as const;

export interface ExportDeps {
```

**на:**

```ts
export const exportTexts = {
  noText: 'У встречи пока нет текста — выгружать нечего.',
  unreadable: 'Не удалось прочитать текст встречи.',
  notBuilt: 'Не удалось собрать файл — подробности в журнале.',
} as const;

export interface ExportDeps {
```

**В `src/main/export/export-meeting.ts` заменить:**

```ts
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
  const path = extname(picked).toLowerCase() === `.${format}` ? picked : `${picked}.${format}`;
  try {
    await fsp.writeFile(path, await fileData(doc, format, deps.platform));
  } catch (err) {
    throw humanFsError('Не удалось сохранить файл', err);
  }
```

**на:**

```ts
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
  const path = extname(picked).toLowerCase() === `.${format}` ? picked : `${picked}.${format}`;
  let data: Uint8Array | string;
  try {
    data = await fileData(doc, format, deps.platform);
  } catch (err) {
    throw new Error(exportTexts.notBuilt, { cause: err });
  }
  try {
    await fsp.writeFile(path, data);
  } catch (err) {
    throw humanFsError('Не удалось сохранить файл', err);
  }
```

**Заменить всё содержимое `src/main/export/file-name.ts` на:**

```ts
// Имя файла выгрузки по названию встречи — такое, что его примут и Windows, и macOS.

/** Не больше стольких символов в имени без расширения: путь к «Документам» тоже занимает место. */
const MAX_NAME_CHARS = 120;
const FALLBACK_NAME = 'Встреча';
/** Запрещённые в именах файлов Windows (на macOS — «/» и «:») и управляющие символы. */
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
/** Имена устройств Windows: файл «CON.txt» или «con.report.docx» создать нельзя — важна часть до первой точки. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

const trimEnds = (name: string): string => name.replace(/^[.\s]+|[.\s]+$/g, '');

export function exportFileName(title: string, ext: 'docx' | 'txt'): string {
  let name = trimEnds(title.replace(FORBIDDEN, ' ').replace(/\s+/g, ' '));
  // По символам, а не по UTF-16: эмодзи не режется пополам.
  name = trimEnds(Array.from(name).slice(0, MAX_NAME_CHARS).join(''));
  if (name === '') name = FALLBACK_NAME;
  if (RESERVED.test(name)) name = `_${name}`;
  return `${name}.${ext}`;
}
```

**Заменить всё содержимое `src/main/import/importer.ts` на:**

```ts
// Очередь импорта (решения Плана 5, §4.3): файл проверяется, встреча создаётся сразу («импорт…»), звук копируется
// по одному файлу за раз. Electron сюда не подключается — окно, сведение и окно «Файл добавлен» внедряются.
import { promises as fsp } from 'node:fs';
import { basename, join } from 'node:path';
import { MAX_IMPORT_FILES, type ImportFailure, type ImportProgress, type ImportResult } from '../../shared/import';
import type { Meeting } from '../../shared/meeting';
import { knownFsReason } from '../fs/fs-errors';
import { audioDir, createMeeting, listMeetings, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { copySourceAudio, copyTexts, SOURCE_FILE } from './audio-copy';
import { fitLength, pickRecordedAt, titleFromFileName } from './naming';
import { examineFile, probeTexts } from './probe';

/** Имя исходного файла в meeting.json — не длиннее (столько же разрешают Windows и macOS). */
const MAX_FILE_NAME_LENGTH = 255;

export const importTexts = {
  tooMany: `за раз можно добавить до ${MAX_IMPORT_FILES} файлов`,
  notCreated: 'не удалось создать встречу',
  notSaved: 'не удалось сохранить встречу',
  quitting: 'программа закрывается',
  /** Под заголовком «Импорт прервался» во встрече. */
  interrupted: 'Добавьте файл ещё раз.',
} as const;

/** Причины неудачи копирования, которые можно показать человеку как есть; остальное — «файл повреждён…». */
const SHOWN_COPY_REASONS: readonly string[] = Object.values(copyTexts);

export interface ImporterDeps {
  ffmpegPath(): string;
  logger: Logger;
  now(): Date;
  /** Свободное место в папке, байт; null — неизвестно. */
  freeBytes(dir: string): Promise<number | null>;
  /** Встреча появилась, изменилась или убрана — окно перечитает список. */
  libraryChanged(): void;
  progressChanged(progress: ImportProgress[]): void;
  /** Звук скопирован: сведение и окно «Файл добавлен». */
  imported(event: { libraryDir: string; meeting: Meeting }): void;
  /** Звук не скопировался: недоделанная встреча убрана, окно покажет ошибку. */
  failed(failure: ImportFailure): void;
  examine?: typeof examineFile;
  copy?: typeof copySourceAudio;
}

interface ImportJob {
  /** Папка библиотеки на момент добавления: её могут сменить в настройках, пока файл ждёт очереди. */
  libraryDir: string;
  meetingId: string;
  source: string;
  durationSec: number | null;
}

/** Чем кончилась работа над файлом: готово, не вышло (встреча убрана или с ошибкой) или отменено. */
type Outcome = 'done' | 'failed' | 'cancelled';

interface CurrentJob {
  job: ImportJob;
  abort: AbortController;
  done: Promise<Outcome>;
  seconds: number | null;
}

const sameJob = (job: ImportJob, libraryDir: string, meetingId: string): boolean =>
  job.libraryDir === libraryDir && job.meetingId === meetingId;

export class Importer {
  private readonly queue: ImportJob[] = [];
  private current: CurrentJob | null = null;
  private running = false;
  private disposed = false;
  /** Идущие addFiles: пока файлы проверяются, импорт тоже идёт (папку библиотеки менять нельзя). */
  private adding = 0;

  constructor(private readonly deps: ImporterDeps) {}

  /** Проверить файлы, создать их встречи и поставить звук в очередь копирования. */
  async addFiles(libraryDir: string, paths: readonly string[]): Promise<ImportResult> {
    const result: ImportResult = { added: [], failed: [] };
    this.adding += 1;
    try {
      for (const [index, path] of paths.entries()) {
        const name = basename(path);
        const outcome =
          index < MAX_IMPORT_FILES ? await this.addFile(libraryDir, path, name) : { reason: importTexts.tooMany };
        if (typeof outcome === 'string') result.added.push(outcome);
        else result.failed.push({ name, reason: outcome.reason });
      }
    } finally {
      this.adding -= 1;
    }
    return result;
  }

  /** Встреча ждёт копирования или копируется. */
  isPending(libraryDir: string, meetingId: string): boolean {
    const current = this.current;
    return (
      this.queue.some((job) => sameJob(job, libraryDir, meetingId)) ||
      (current !== null && sameJob(current.job, libraryDir, meetingId))
    );
  }

  progress(): ImportProgress[] {
    const current = this.current;
    const list: ImportProgress[] = [];
    if (current) {
      const { durationSec } = current.job;
      const fraction =
        durationSec && durationSec > 0 ? Math.min(1, Math.max(0, (current.seconds ?? 0) / durationSec)) : null;
      list.push({ meetingId: current.job.meetingId, fraction, waiting: false });
    }
    for (const job of this.queue) list.push({ meetingId: job.meetingId, fraction: null, waiting: true });
    return list;
  }

  isBusy(): boolean {
    return this.adding > 0 || this.current !== null || this.queue.length > 0;
  }

  /**
   * Встречу удаляют: снять из очереди или остановить копирование и дождаться, пока ffmpeg отпустит файлы. Ответ —
   * как вернуть файл в очередь (первым), если удалить встречу не выйдет; null — возвращать нечего: встреча не
   * импортировалась или её импорт успел закончиться, пока его останавливали.
   */
  async cancel(libraryDir: string, meetingId: string): Promise<(() => void) | null> {
    const waiting = this.queue.findIndex((job) => sameJob(job, libraryDir, meetingId));
    if (waiting !== -1) {
      const job = this.queue[waiting]!;
      this.queue.splice(waiting, 1);
      this.report();
      return () => this.requeue(job);
    }
    const current = this.current;
    if (!current || !sameJob(current.job, libraryDir, meetingId)) return null;
    current.abort.abort();
    return (await current.done) === 'cancelled' ? () => this.requeue(current.job) : null;
  }

  /**
   * Windows завершает сеанс: остановить импорт (новые файлы не берутся, копирование прерывается) без уборки — на неё
   * нет времени, недоделанные встречи разберёт следующий запуск.
   */
  async stop(): Promise<void> {
    await this.halt();
  }

  /** Выход из программы: остановить копирование и убрать недоделанные встречи — исходные файлы на месте. */
  async disposeForQuit(): Promise<void> {
    for (const job of await this.halt()) {
      await removeMeetingDir(job.libraryDir, job.meetingId).catch((err: unknown) =>
        this.deps.logger.warn(`Недоделанная встреча ${job.meetingId} не убрана при выходе`, err),
      );
    }
  }

  /** Остановка; ответ — недоделанные файлы (законченный за время остановки файл в их число не входит). */
  private async halt(): Promise<ImportJob[]> {
    this.disposed = true;
    const jobs = [...this.queue];
    this.queue.length = 0;
    const current = this.current;
    if (current) {
      current.abort.abort();
      if ((await current.done) === 'cancelled') jobs.unshift(current.job);
    }
    return jobs;
  }

  /** id созданной встречи или причина отказа. */
  private async addFile(libraryDir: string, path: string, name: string): Promise<string | { reason: string }> {
    const examine = this.deps.examine ?? examineFile;
    let examined;
    try {
      examined = await examine(this.deps.ffmpegPath(), path);
    } catch (err) {
      this.deps.logger.error(`Не удалось прочитать сведения о файле ${name}`, err);
      return { reason: probeTexts.unreadable };
    }
    if (!examined.ok) {
      this.deps.logger.info(`Файл ${name} не добавлен: ${examined.reason}`);
      return { reason: examined.reason };
    }
    // Пока файл проверялся, программу начали закрывать: встречу уже не создаём.
    if (this.disposed) return { reason: importTexts.quitting };
    const recordedAt = pickRecordedAt(examined.info.creationTime, examined.modifiedAt, this.deps.now());
    let meeting: Meeting;
    try {
      meeting = await createMeeting(libraryDir, {
        source: 'import',
        status: 'importing',
        title: titleFromFileName(name, recordedAt),
        now: recordedAt,
        durationSec: examined.info.durationSec,
        sourceFileName: fitLength(name, MAX_FILE_NAME_LENGTH),
      });
    } catch (err) {
      this.deps.logger.error(`Не удалось создать встречу для файла ${name}`, err);
      return { reason: knownFsReason(err) ?? importTexts.notCreated };
    }
    if (this.disposed) {
      await removeMeetingDir(libraryDir, meeting.id).catch(() => undefined);
      return { reason: importTexts.quitting };
    }
    this.queue.push({ libraryDir, meetingId: meeting.id, source: path, durationSec: examined.info.durationSec });
    this.notify(() => this.deps.libraryChanged());
    this.report();
    this.kick();
    return meeting.id;
  }

  private requeue(job: ImportJob): void {
    if (this.disposed) return;
    this.queue.unshift(job);
    this.report();
    this.kick();
  }

  private kick(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    void this.drain();
  }

  /** Очередь не встаёт ни от какой ошибки: отказ одного файла — только запись в журнал. */
  private async drain(): Promise<void> {
    try {
      for (let job = this.queue.shift(); job !== undefined && !this.disposed; job = this.queue.shift()) {
        const abort = new AbortController();
        const current: CurrentJob = { job, abort, done: Promise.resolve<Outcome>('cancelled'), seconds: null };
        this.current = current;
        this.report();
        current.done = this.importOne(job, abort.signal, (seconds) => {
          current.seconds = seconds;
          this.report();
        }).catch((err: unknown) => {
          this.deps.logger.error(`Импорт встречи ${job.meetingId} закончился ошибкой`, err);
          return 'failed' as const;
        });
        await current.done;
        this.current = null;
        this.report();
      }
    } finally {
      this.current = null;
      this.running = false;
    }
  }

  private report(): void {
    this.notify(() => this.deps.progressChanged(this.progress()));
  }

  /** Сообщение наружу (окну, сведению): его сбой не должен ни остановить очередь, ни удалить готовую встречу. */
  private notify(send: () => void): void {
    try {
      send();
    } catch (err) {
      this.deps.logger.error('Сообщение об импорте не доставлено', err);
    }
  }

  private async importOne(job: ImportJob, signal: AbortSignal, onProgress: (seconds: number) => void): Promise<Outcome> {
    const { libraryDir, meetingId } = job;
    const copy = this.deps.copy ?? copySourceAudio;
    let result;
    try {
      result = await copy(this.deps.ffmpegPath(), job.source, audioDir(libraryDir, meetingId), {
        signal,
        onProgress,
        freeBytes: this.deps.freeBytes,
      });
    } catch (err) {
      if (signal.aborted) {
        this.deps.logger.info(`Импорт отменён: ${meetingId}`);
        return 'cancelled';
      }
      this.deps.logger.error(`Не удалось скопировать звук встречи ${meetingId}`, err);
      const message = err instanceof Error ? err.message : '';
      await this.discard(job, SHOWN_COPY_REASONS.includes(message) ? message : copyTexts.broken);
      return 'failed';
    }
    let meeting: Meeting;
    try {
      meeting = await updateMeeting(libraryDir, meetingId, (m) => ({
        ...m,
        status: 'recorded',
        tracks: [{ kind: 'file', file: SOURCE_FILE, startOffsetMs: 0 }],
        durationSec: m.durationSec ?? result.durationSec,
      }));
    } catch (err) {
      this.deps.logger.error(`Звук встречи ${meetingId} скопирован, но встреча не сохранилась`, err);
      await this.discard(job, knownFsReason(err) ?? importTexts.notSaved);
      return 'failed';
    }
    this.deps.logger.info(`Импорт готов: ${meetingId}${result.reencoded ? ' (звук перекодирован)' : ''}`);
    this.notify(() => this.deps.libraryChanged());
    this.notify(() => this.deps.imported({ libraryDir, meeting }));
    return 'done';
  }

  /** Неудача: папка недоделанной встречи убирается (в ней только наша неполная копия); не вышло — встреча с ошибкой. */
  private async discard(job: ImportJob, reason: string): Promise<void> {
    const { libraryDir, meetingId } = job;
    try {
      await removeMeetingDir(libraryDir, meetingId);
    } catch (err) {
      this.deps.logger.warn(`Недоделанная встреча ${meetingId} не убрана`, err);
      await updateMeeting(libraryDir, meetingId, (m) => ({
        ...m,
        status: 'error',
        tracks: [],
        errorMessage: `Не удалось добавить файл: ${reason}.`,
      })).catch((saveErr: unknown) => this.deps.logger.warn(`Ошибка импорта ${meetingId} не записана`, saveErr));
    }
    this.notify(() => this.deps.libraryChanged());
    this.notify(() => this.deps.failed({ name: basename(job.source), reason }));
  }
}

/**
 * При запуске: встречи «импорт…», которых нет в очереди, — импорт прервался сбоем. Встреча остаётся с понятной
 * ошибкой (её можно удалить и добавить файл ещё раз), недописанная копия звука удаляется — она бывает большой.
 */
export async function recoverInterruptedImports(
  libraryDir: string,
  logger: Logger,
  isPending: (meetingId: string) => boolean,
): Promise<string[]> {
  const recovered: string[] = [];
  for (const entry of await listMeetings(libraryDir)) {
    if (entry.kind !== 'ok' || entry.meeting.status !== 'importing' || isPending(entry.meeting.id)) continue;
    const id = entry.meeting.id;
    try {
      await updateMeeting(libraryDir, id, (m) =>
        m.status === 'importing' ? { ...m, status: 'error', tracks: [], errorMessage: importTexts.interrupted } : m,
      );
      recovered.push(id);
      logger.warn(`Импорт встречи ${id} прервался — встреча помечена ошибкой`);
      await fsp
        .rm(join(audioDir(libraryDir, id), `${SOURCE_FILE}.part`), { force: true })
        .catch((err: unknown) => logger.warn(`Недописанная копия звука встречи ${id} не удалена`, err));
    } catch (err) {
      logger.error(`Не удалось отметить прерванный импорт ${id}`, err);
    }
  }
  return recovered;
}
```

**В `src/main/import/probe.ts` заменить:**

```ts
  // Сведения самого файла — до первой дорожки; у дорожек свои creation_time.
  const head = firstStream === -1 ? input : input.slice(0, firstStream);
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(head);
  const durationSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null;
  const creation = /^\s*creation_time\s*:\s*(\S.*?)\s*$/m.exec(head);
  return {
    hasAudio: /^\s*Stream #0:\S*: Audio:/m.test(input),
```

**на:**

```ts
  // Сведения самого файла — до первой дорожки; у дорожек свои creation_time.
  const head = firstStream === -1 ? input : input.slice(0, firstStream);
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(head);
  const seconds = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
  // Нулевая длительность — ffmpeg её не знает (бывает у потоков без оглавления).
  const durationSec = seconds > 0 ? seconds : null;
  const creation = /^\s*creation_time\s*:\s*(\S.*?)\s*$/m.exec(head);
  return {
    hasAudio: /^\s*Stream #0:\S*: Audio:/m.test(input),
```

**В `src/main/index.ts` заменить:**

```ts
    // сама, и без dispose() очередь посчитала бы это сбоем. Остановленная очередь оставляет встречу
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    void importer?.disposeForQuit();
    onSystemEnding();
  });
  windowsCreated = true;
```

**на:**

```ts
    // сама, и без dispose() очередь посчитала бы это сбоем. Остановленная очередь оставляет встречу
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    void importer?.stop();
    onSystemEnding();
  });
  windowsCreated = true;
```

**В `src/main/recording/controller.ts` заменить:**

```ts
    this.deps.libraryChanged();
    this.deps
      .enqueueTranscription(libraryDir, answer.meetingId)
      .catch((err: unknown) => this.transcriptionNotQueued(libraryDir, answer.meetingId, err));
  }

  /** Встречу не удалось поставить в очередь. Её папку удалили — сказать нечего: это сделал сам человек. */
```

**на:**

```ts
    this.deps.libraryChanged();
    this.deps
      .enqueueTranscription(libraryDir, answer.meetingId)
      .catch((err: unknown) => this.transcriptionNotQueued(libraryDir, answer.meetingId, err))
      .catch((err: unknown) => this.deps.logger.error('Не удалось сообщить, что расшифровка не началась', err));
  }

  /** Встречу не удалось поставить в очередь. Её папку удалили — сказать нечего: это сделал сам человек. */
```

**В `src/shared/export-doc.ts` заменить:**

```ts
  paragraphs: ExportParagraph[];
}

/** Подряд идущие реплики одного спикера — один абзац; пустые реплики пропускаются. */
export function buildExportDoc(
  meeting: Pick<Meeting, 'title' | 'createdAt' | 'durationSec' | 'speakerNames'>,
```

**на:**

```ts
  paragraphs: ExportParagraph[];
}

/**
 * Управляющие символы недопустимы в XML — Word счёл бы файл повреждённым. Вертикальная табуляция (её даёт вставка из
 * Word) — перевод строки, остальное убирается; табуляция и переводы строк остаются.
 */
function cleanText(text: string): string {
  return text.replace(/\u000b/g, '\n').replace(/[\u0000-\u0008\u000c\u000e-\u001f\u007f]/g, '');
}

/** Подряд идущие реплики одного спикера — один абзац; пустые реплики пропускаются. */
export function buildExportDoc(
  meeting: Pick<Meeting, 'title' | 'createdAt' | 'durationSec' | 'speakerNames'>,
```

**В `src/shared/export-doc.ts` заменить:**

```ts
): ExportDoc {
  const paragraphs: (ExportParagraph & { speakerId: string })[] = [];
  for (const segment of transcript.segments) {
    const text = segment.text.trim();
    if (text === '') continue;
    const last = paragraphs.at(-1);
    if (last && last.speakerId === segment.speakerId) {
```

**на:**

```ts
): ExportDoc {
  const paragraphs: (ExportParagraph & { speakerId: string })[] = [];
  for (const segment of transcript.segments) {
    const text = cleanText(segment.text).trim();
    if (text === '') continue;
    const last = paragraphs.at(-1);
    if (last && last.speakerId === segment.speakerId) {
```

**В `src/shared/export-doc.ts` заменить:**

```ts
    }
    paragraphs.push({
      speakerId: segment.speakerId,
      speaker: speakerLabel(segment.speakerId, meeting.speakerNames),
      time: formatTimestamp(segment.start),
      text,
    });
```

**на:**

```ts
    }
    paragraphs.push({
      speakerId: segment.speakerId,
      speaker: cleanText(speakerLabel(segment.speakerId, meeting.speakerNames)),
      time: formatTimestamp(segment.start),
      text,
    });
```

**В `src/shared/export-doc.ts` заменить:**

```ts
  const meta = [formatLongDate(meeting.createdAt)];
  if (meeting.durationSec !== null) meta.push(formatDurationShort(meeting.durationSec));
  return {
    title: meeting.title,
    metaLine: meta.join(' · '),
    participantsLine: participants.length > 0 ? `Участники: ${participants.join(', ')}` : null,
    paragraphs: paragraphs.map(({ speaker, time, text }) => ({ speaker, time, text })),
```

**на:**

```ts
  const meta = [formatLongDate(meeting.createdAt)];
  if (meeting.durationSec !== null) meta.push(formatDurationShort(meeting.durationSec));
  return {
    title: cleanText(meeting.title),
    metaLine: meta.join(' · '),
    participantsLine: participants.length > 0 ? `Участники: ${participants.join(', ')}` : null,
    paragraphs: paragraphs.map(({ speaker, time, text }) => ({ speaker, time, text })),
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck`, затем `npx vitest run`
Ожидается: проверка типов без ошибок; `Tests  927 passed (927)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: review of main: the import queue survives failures, a finished file is not put back, safe export text and names"
```

### Task 14: Сборка на GitHub (Windows и Mac)

Отправка ветки — действие наружу: **спросить пользователя перед `git push`**.

- [ ] **Step 1: Отправить ветку** (после «да» пользователя)

```bash
git push -u origin plan-5-import-export
```

- [ ] **Step 2: Сборка** — `build.yml` есть на `main`, запускается на ветке:

```bash
gh workflow run build.yml --ref plan-5-import-export
gh run list -w build -L 1
gh run watch <id> --exit-status
```

Ожидается: оба задания (`windows-latest`, `macos-latest`) зелёные — модульные тесты (в том числе файлы, которые делает
ffmpeg этих сборок: mpeg4, aac, nellymoser), сквозные (`e2e/import.spec.ts`, `e2e/export.spec.ts`), проверка собранной
программы. Упало на Mac из-за кодера ffmpeg — заменить кодек в `src/test-support/media-files.ts` на встроенный, который
там есть (`ffmpeg -encoders`).

### Task 15: Ручная проверка на Windows и Mac (контрольная точка с пользователем)

Собранные программы — артефакты запуска `build.yml` из Task 14 (`TextMeet-windows`, `TextMeet-mac`). Дать пользователю
простой список и дождаться ответа. На каждой машине:

1. «Импорт файла» → выбрать настоящую запись созвона (mp4 из Zoom или Телемоста) — встреча появилась под датой созвона
   с «импорт N%», затем окно «Файл добавлен»: название — имя файла, вопрос «Сколько человек говорит на записи?»;
   «Расшифровать» — текст появился, спикеры «Спикер 1, 2…», в строке под названием — «из файла»; запись слушается.
2. Перетащить в окно запись диктофона телефона (m4a) — пока файл над окном, окно затемнено с надписью «Отпустите —
   файлы станут встречами»; дальше — как в п. 1.
3. Перетащить сразу два-три файла и, например, PDF — по встрече на каждый звуковой файл, окна «Файл добавлен» по
   очереди; слева «Добавлено 2 файла из 3. Не удалось добавить «….pdf»: …».
4. Во время импорта большого файла — «…» → «Удалить встречу…»: копирование остановилось, встречи нет.
5. «Экспорт» → «Скопировать всё» → вставить в Word (имена жирные, время серое) и в мессенджер (обычный текст).
6. «Экспорт» → «Сохранить в Word (.docx)…» — файл открывается в Word: название, дата, участники, абзацы по говорящим.
7. «Экспорт» → «Сохранить как текст (.txt)…» — файл открывается в Блокноте (TextEdit) без «кракозябр»; окно
   сохранения во второй раз открывается в той же папке.

Записать ответы (что прошло, что нет) — они нужны в Task 16.

### Task 16: Документы, память и слияние

- [ ] **Step 1: `docs/superpowers/plan-5-checks.md`** — как `plan-4-checks.md`: что проверено (Task 15 по пунктам на
  Windows и Mac, ссылка на запуск из Task 14), что исправлено по ревью сверх первой версии прототипа, и «Отложено»:
  пункты из раздела «Известные ограничения» в начале плана и всё, что найдёт Task 15.
- [ ] **Step 2: Спецификация** — §3.2: дата записи файла, название из имени файла, окно «Файл добавлен», несколько
  файлов, ошибки. §3.4: кнопка «Экспорт» и её меню, вид выгрузки (абзацы по говорящим). §5.6: `audio/source.mka`,
  `sourceFileName`, состояние `importing`, дорожка `file`, `exportDir` в настройках. §6: строки из §5 решений Плана 5.
  **Дорожная карта** — строка Плана 5: «выполнен» со ссылками на решения, план и проверки; следующий — План 6.
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: record plan 5 checks and mark plan 5 done"
```

- [ ] **Step 4: Слияние** (спросить пользователя перед `git push`)

```bash
git checkout main
git merge --no-ff plan-5-import-export -m "Merge plan 5: import and export"
npm ci
npm run typecheck
npm test
git push origin main
gh run list -w ci -L 1
```

Ожидается: `ci` на `main` зелёный (на Linux — ffmpeg 7, тесты импорта делают файлы и им).

- [ ] **Step 5: Память** — в `textmeet-project.md`: План 5 выполнен, дальше по дорожной карте — Планы 6 и 8.
