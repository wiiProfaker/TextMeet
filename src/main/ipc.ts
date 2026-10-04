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
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL, type AsrModelId } from '../shared/asr-models';
import { MeetingIdSchema, TrackKindSchema } from '../shared/meeting';
import type { ModelsState, TranscriptionProgress } from '../shared/transcription';
import { humanFsError } from './fs/fs-errors';
import type { HotkeyManager } from './hotkey-manager';
import { listMeetings, meetingDir } from './library/library';
import { readTranscript } from './library/transcript-store';
import type { Logger } from './logger';
import type { ModelStore } from './models/model-manager';
import { buildModelsState, type CatalogDownloadsSnapshot } from './models/models-state';
import { MODEL_GROUP_IDS } from './models/registry';
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
  /** Сведение этой встречи в этом запуске не удалось (очередь сведения). */
  mixFailed(libraryDir: string, meetingId: string): boolean;
  launchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice;
  applyLaunchAtLogin(enabled: boolean): void;
  mainContents(): WebContents | null;
  recorderContents(): WebContents | null;
  appInfo(): AppInfo;
  onRecorderReady(): void;
  /** Горячая клавиша сменилась — обновить подсказку в меню трея. */
  hotkeyChanged(): void;
  transcription: {
    enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null, model?: AsrModelId): Promise<void>;
    progress(): TranscriptionProgress[];
    isBusy(): boolean;
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
const STOP_DIALOG_OPEN = 'Сначала ответьте в окне «Запись остановлена».';
const MEETING_DIR_MISSING = 'Папка встречи не найдена — возможно, её удалили.';
const MODELS_BUSY = 'Модели нельзя удалить, пока идёт расшифровка.';
const MODELS_DOWNLOADING = 'Модели нельзя удалить, пока скачивается модель.';

const AsrModelIdSchema = z.enum(ASR_MODEL_IDS);
const TranscribeRequestSchema = z.object({
  meetingId: MeetingIdSchema,
  participantsHint: z.number().int().min(1).max(50).nullable(),
  model: AsrModelIdSchema.nullable(),
});

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
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Папка библиотеки TextMeet',
      defaultPath: deps.libraryDir(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return settingsState();
    // Пока было открыто окно выбора, запись могли начать клавишей или из трея.
    if (deps.controller.getState().phase !== 'idle') throw new Error(LIBRARY_LOCKED);
    if (deps.controller.getState().stopDialog) throw new Error(STOP_DIALOG_OPEN);
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

  handle(IPC.openMeetingDir, (arg) => openMeetingFolder(meetingDir(deps.libraryDir(), MeetingIdSchema.parse(arg))));

  handle(IPC.listMeetings, () => {
    const libraryDir = deps.libraryDir();
    return listMeetings(libraryDir, (id) => deps.mixFailed(libraryDir, id));
  });

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
    const group = z.enum(MODEL_GROUP_IDS).parse(arg);
    if (deps.transcription.isBusy()) throw new Error(MODELS_BUSY);
    if (deps.downloads.isBusy()) throw new Error(MODELS_DOWNLOADING);
    deps.transcription.stopIdleWorker();
    try {
      await deps.models.remove(group);
    } catch (err) {
      throw humanFsError('Не удалось удалить модели', err);
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
