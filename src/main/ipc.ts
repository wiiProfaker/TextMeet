import { promises as fsp } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  app,
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
import { AI_QUESTION_MAX } from '../shared/ai';
import { AiPromptSchema, storedAiPrompt } from '../shared/ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { LLM_MODEL_IDS, type AiModelsState } from '../shared/llm-models';
import { IMPORT_EXTENSIONS } from '../shared/import';
import { MeetingIdSchema, RecordedTrackKindSchema } from '../shared/meeting';
import { SpeakerIdSchema } from '../shared/transcript';
import type { CatalogModelId, ModelsState, TranscriptionProgress } from '../shared/transcription';
import { aiView, deleteQuestion } from './ai/ai-meeting';
import { currentAiModel } from './ai/ai-models';
import type { AiRunner } from './ai/ai-runner';
import { copyForAi, copyMeeting, saveMeeting, type ExportDeps } from './export/export-meeting';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import type { Importer } from './import/importer';
import { listMeetings, meetingDir } from './library/library';
import { audioSize, deleteAudio, deleteMeeting, type DeleteDeps } from './library/meeting-delete';
import { editTranscript, renameMeeting, renameSpeaker, TranscriptEditSchema } from './library/meeting-edits';
import type { SearchIndex } from './library/search-index';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildAiModelsState, buildModelsState, type CatalogDownloadsSnapshot } from './models/models-state';
import { TRANSCRIPTION_GROUP_IDS } from './models/registry';
import type { RecordingController } from './recording/controller';
import type { SettingsStore } from './settings/settings-store';
import { aiTexts, systemSettingsUrl, transcriptionTexts } from './texts';

export interface IpcDeps {
  settings: SettingsStore;
  logger: Logger;
  platform: string;
  hotkeys: HotkeyManager;
  controller: RecordingController;
  libraryDir(): string;
  /** Сведение этой встречи в этом запуске не удалось (очередь сведения). */
  mixFailed(libraryDir: string, meetingId: string): boolean;
  launchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice;
  applyLaunchAtLogin(enabled: boolean): void;
  mainContents(): WebContents | null;
  recorderContents(): WebContents | null;
  appInfo(): AppInfo;
  onRecorderReady(): void;
  /** Сердцебиение окна записи — сторожу зависания. */
  onRecorderAlive(): void;
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
  /** Встреча изменилась — окно перечитает список встреч. */
  libraryChanged(): void;
  search: Pick<SearchIndex, 'refresh' | 'invalidate' | 'remove' | 'search'>;
  deletion: DeleteDeps;
  exporting: ExportDeps;
  importer: Pick<Importer, 'addFiles' | 'progress' | 'isBusy'>;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
    isBusy(): boolean;
    stopIdleWorker(): void;
  };
  models: Pick<ModelStore, 'state' | 'remove'>;
  ai: Pick<AiRunner, 'state' | 'isBusy' | 'summarize' | 'ask' | 'stop' | 'dismiss' | 'forget' | 'withEngineStopped'>;
  downloads: {
    start(id: CatalogModelId): void;
    cancel(id: CatalogModelId): Promise<void>;
    snapshot(): CatalogDownloadsSnapshot;
    isBusy(): boolean;
  };
}

const StopDialogAnswerSchema = z.object({
  meetingId: MeetingIdSchema,
  title: z.string().max(200),
  participantsHint: z.number().int().min(1).max(50).nullable(),
});
const FailureSchema = z.object({ name: z.string().max(200), message: z.string().max(2000) });
/** Кусок дорожки — около секунды Opus (~8 КБ); куда больший — уже не кусок записи, а сбой или чужие данные. */
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const Bytes = z
  .custom<ArrayBuffer | Uint8Array>((v) => v instanceof ArrayBuffer || v instanceof Uint8Array)
  .refine((v) => v.byteLength <= MAX_CHUNK_BYTES, `кусок дорожки больше ${MAX_CHUNK_BYTES} байт`);
const LIBRARY_LOCKED = 'Во время записи папку библиотеки менять нельзя.';
// Ответ в окне «Запись остановлена» сохраняется в папку текущей библиотеки — до него папку не меняем.
const STOP_DIALOG_OPEN = 'Сначала ответьте в окне «Запись остановлена» или «Файл добавлен».';
// Встречи из файлов дописываются в ту библиотеку, где созданы, — а окно «Файл добавлен» сохраняет ответ в текущую.
const IMPORT_RUNNING = 'Папку библиотеки можно сменить, когда закончится импорт файлов.';
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';
const AI_PROMPT_NOT_SAVED = 'Не удалось сохранить запрос для ИИ';

const RenameMeetingSchema = z.object({ meetingId: MeetingIdSchema, title: z.string().max(200) });
const RenameSpeakerSchema = z.object({
  meetingId: MeetingIdSchema,
  speakerId: SpeakerIdSchema,
  name: z.string().max(100).nullable(),
});
const EditTranscriptSchema = z.object({
  meetingId: MeetingIdSchema,
  edit: TranscriptEditSchema,
  transcriptVersion: z.iso.datetime(),
});

const AskSchema = z.object({ meetingId: MeetingIdSchema, question: z.string().trim().min(1).max(AI_QUESTION_MAX) });
const DeleteQuestionSchema = z.object({ meetingId: MeetingIdSchema, questionId: z.string().min(1).max(100) });

const SaveMeetingSchema = z.object({ meetingId: MeetingIdSchema, format: z.enum(['docx', 'txt']) });
/** Пути файлов для импорта: полные, не больше 1000 (больше 100 программа отклонит с понятной причиной). */
const ImportPathsSchema = z
  .array(z.string().min(1).max(4096).refine((path) => isAbsolute(path), 'нужен полный путь к файлу'))
  .min(1)
  .max(1000);

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const LlmModelIdSchema = z.enum(LLM_MODEL_IDS);
/** «Выбрать» есть только у скачанной модели: не скачанную окно выбрать не просит. */
const AI_MODEL_NOT_DOWNLOADED = 'Эта модель не скачана — сначала скачайте её.';
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
  model: AsrModelIdSchema.nullable(),
});

/** Список лицензий (scripts/build-notices.mjs; electron-builder кладёт его в resources/). */
const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';

const RecorderSchemas = {
  [IPC.recorderReady]: z.undefined(),
  [IPC.recorderAlive]: z.undefined(),
  [IPC.recorderStarted]: z.object({
    meetingId: MeetingIdSchema,
    tracks: z.array(z.object({ kind: RecordedTrackKindSchema, startedAt: z.number().finite() })).min(1),
    micLabel: z.string().max(500),
    systemFailure: FailureSchema.nullable(),
  }),
  [IPC.recorderStartFailed]: z.object({ meetingId: MeetingIdSchema, failure: FailureSchema }),
  [IPC.recorderChunk]: z.object({ meetingId: MeetingIdSchema, kind: RecordedTrackKindSchema, data: Bytes }),
  [IPC.recorderPeaks]: z.object({
    meetingId: MeetingIdSchema,
    mic: z.number().finite(),
    system: z.number().finite().nullable(),
  }),
  [IPC.recorderTrackEnded]: z.object({ meetingId: MeetingIdSchema, kind: RecordedTrackKindSchema }),
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
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(`Не удалось открыть папку: ${failure}`);
  };

  /** Библиотеки может ещё не быть (ни одной записи) — создаём, чтобы было что открыть. */
  const openLibraryFolder = async (dir: string): Promise<void> => {
    try {
      await fsp.mkdir(dir, { recursive: true });
    } catch (err) {
      throw humanFsError('Не удалось открыть папку', err);
    }
    await openFolder(dir);
  };

  /** Папку встречи не создаём: пустая папка без meeting.json так и висела бы в списке. */
  const openMeetingFolder = async (dir: string): Promise<void> => {
    try {
      await fsp.stat(dir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error(MEETING_DIR_MISSING, { cause: err });
      throw humanFsError('Не удалось открыть папку', err);
    }
    await openFolder(dir);
  };

  handle(IPC.getSettings, () => settingsState());

  handle(IPC.setLaunchAtLogin, async (arg) => {
    const enabled = z.boolean().parse(arg);
    await deps.settings.update({ launchAtLogin: enabled });
    deps.applyLaunchAtLogin(enabled);
    return settingsState();
  });

  handle(IPC.chooseLibraryDir, async (_arg, event) => {
    if (deps.controller.getState().phase !== 'idle') throw new Error(LIBRARY_LOCKED);
    if (deps.controller.getState().stopDialog) throw new Error(STOP_DIALOG_OPEN);
    if (deps.importer.isBusy()) throw new Error(IMPORT_RUNNING);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Папка библиотеки TextMeet',
      defaultPath: deps.libraryDir(),
      properties: ['openDirectory', 'createDirectory'],
    };
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

  handle(IPC.setMicrophone, async (arg) => {
    await deps.settings.update({ microphoneId: z.string().min(1).max(500).nullable().parse(arg) });
    return settingsState();
  });

  handle(IPC.setRecordSounds, async (arg) => {
    await deps.settings.update({ recordSounds: z.boolean().parse(arg) });
    return settingsState();
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

  handle(IPC.openLibraryDir, () => openLibraryFolder(deps.libraryDir()));
  handle(IPC.openLicenses, async () => {
    // Собранная программа — рядом с app.asar (extraResources), разработка — корень приложения.
    const file = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), NOTICES_FILE);
    const failure = await shell.openPath(file);
    if (failure) throw new Error(`Не удалось открыть список лицензий: ${failure}`);
  });

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
    const meeting = await shown('Не удалось переименовать встречу', () =>
      renameMeeting(deps.libraryDir(), request.meetingId, request.title),
    )();
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
  });

  handle(IPC.renameSpeaker, async (arg) => {
    const request = RenameSpeakerSchema.parse(arg);
    const meeting = await shown('Не удалось переименовать спикера', () =>
      renameSpeaker(deps.libraryDir(), request.meetingId, request.speakerId, request.name),
    )();
    searchChanged(request.meetingId);
    deps.libraryChanged();
    return meeting;
  });

  handle(IPC.editTranscript, async (arg) => {
    const request = EditTranscriptSchema.parse(arg);
    const result = await shown('Не удалось сохранить правку', () =>
      editTranscript(deps.libraryDir(), request.meetingId, request.edit, request.transcriptVersion, new Date()),
    )();
    searchChanged(request.meetingId);
    if (result.meetingChanged) deps.libraryChanged();
    return { meeting: result.meeting, transcript: result.transcript };
  });

  handle(IPC.search, (arg) => deps.search.search(z.string().max(500).parse(arg)));

  handle(IPC.audioSize, (arg) => audioSize(deps.libraryDir(), MeetingIdSchema.parse(arg)));

  handle(IPC.deleteAudio, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    try {
      await shown('Не удалось удалить аудио', () => deleteAudio(deps.deletion, id))();
    } finally {
      // И при сбое: аудио могло уйти в Корзину, а запись о встрече — не обновиться.
      deps.libraryChanged();
    }
  });

  // Имя папки, а не только прочитанная встреча: удалить можно и папку, которую не удалось прочитать.
  handle(IPC.deleteMeeting, async (arg) => {
    const id = MeetingIdSchema.parse(arg);
    // Ответ модели по этой встрече останавливается без сохранения: папка уходит в Корзину.
    deps.ai.forget(id);
    try {
      await shown('Не удалось удалить встречу', () => deleteMeeting(deps.deletion, id))();
    } catch (err) {
      // Не вышло — отменённая расшифровка и сведение поставлены обратно: состояние встречи изменилось.
      deps.libraryChanged();
      throw err;
    }
    deps.search.remove(id);
    deps.libraryChanged();
  });

  handle(IPC.copyMeeting, (arg) => copyMeeting(deps.exporting, MeetingIdSchema.parse(arg)));

  handle(IPC.copyForAi, (arg) => copyForAi(deps.exporting, MeetingIdSchema.parse(arg)));

  handle(IPC.saveMeeting, (arg) => {
    const request = SaveMeetingSchema.parse(arg);
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

  handle(IPC.transcribe, async (arg) => {
    const request = TranscribeRequestSchema.parse(arg);
    const model = request.model ?? deps.settings.get().asrModel;
    await deps.transcription.enqueue(deps.libraryDir(), request.meetingId, request.participantsHint, model);
  });

  handle(IPC.getTranscript, (arg) => readTranscript(deps.libraryDir(), MeetingIdSchema.parse(arg)));

  handle(IPC.getTranscriptionProgress, () => deps.transcription.progress());

  const modelsState = async (): Promise<ModelsState> =>
    buildModelsState(
      await deps.models.state(),
      deps.settings.get().asrModel,
      deps.downloads.snapshot(),
      deps.transcription.isBusy(),
    );

  handle(IPC.getModels, () => modelsState());

  handle(IPC.deleteModels, async (arg) => {
    const group = z.enum(TRANSCRIPTION_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    deps.transcription.stopIdleWorker();
    try {
      await deps.models.remove(group);
    } catch (err) {
      // Исходная ошибка (cause) попадает в журнал вместе с этой.
      throw new Error(transcriptionTexts.deleteModels(err), { cause: err });
    }
    // Удалили выбранную модель — новые встречи пойдут на модель по умолчанию (она скачается при расшифровке).
    if (group === deps.settings.get().asrModel) await deps.settings.update({ asrModel: DEFAULT_ASR_MODEL });
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

  const aiModelsState = async (): Promise<AiModelsState> => {
    const { groups, selected } = await currentAiModel(deps);
    return buildAiModelsState(groups, selected, deps.downloads.snapshot(), deps.ai.isBusy());
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
  onRecorder(IPC.recorderAlive, () => deps.onRecorderAlive());
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
