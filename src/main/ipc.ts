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
