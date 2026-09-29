import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStartCommand, RecordingState } from '../../shared/recording';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, MEETING_FILE, meetingDir, readMeeting } from '../library/library';
import type { Logger } from '../logger';
import { MIC_ACCESS_DENIED, notificationTexts, RECORDER_NOT_READY, RECORDER_TIMEOUT } from '../texts';
import { RecordingController, type ControllerDeps } from './controller';
import { DISK_CHECK_INTERVAL_MS, LOW_DISK_BEFORE_START_BYTES, SILENCE_REMINDER_MS, SYSTEM_SILENT_AFTER_MS } from './monitors';

const GB = 1024 ** 3;
const fakeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });
const bytes = (...values: number[]) => new Uint8Array(values);
const saveFailedText = expect.objectContaining({
  title: 'Запись остановлена',
  body: expect.stringMatching(/^Не удалось сохранить сведения о записи: .+ Звук сохранён/),
});
/** meeting.json, который не прочитать: так же не сохранится и конец записи. */
const breakMeetingFile = (lib: string, meetingId: string) =>
  writeFileSync(join(meetingDir(lib, meetingId), MEETING_FILE), 'не json');

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

  it('does not start when the recorder window restarted during the questions before the start', async () => {
    const h: ReturnType<typeof harness> = harness({
      ensureMicAccess: async () => {
        h.setReady(false);
        return true;
      },
    });
    await h.controller.toggle();
    expect(h.recorder.start).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({ phase: 'idle', meetingId: null, startProblem: RECORDER_NOT_READY });
    expect(readdirSync(h.lib)).toEqual([]);
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

  it('closes the track files that opened only after the start gave up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let releaseOpen: () => void = () => undefined;
    const close = vi.fn(async () => undefined);
    const h = harness({
      openTracks: () =>
        new Promise((resolve) => {
          releaseOpen = () => resolve({ append: vi.fn(), close, bytesWritten: () => 0 });
        }),
    });
    const { command, starting } = await h.begin();
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    // Окно записи ответило, но файлы открываются дольше, чем ждёт старт.
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());

    releaseOpen();
    await starting;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(close).toHaveBeenCalled();
    expect(h.state()).toMatchObject({ phase: 'idle', meetingId: null, startProblem: RECORDER_TIMEOUT });
    expect(vi.getTimerCount()).toBe(0);
    expect(readdirSync(h.lib)).toEqual([]);
    expect(h.deps.notify).not.toHaveBeenCalledWith(notificationTexts.started('Ctrl+Space'), true);
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

  it('stops when the computer sound ends after the microphone was unplugged', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onTrackEnded({ meetingId: command.meetingId, kind: 'mic' });
    h.controller.onTrackEnded({ meetingId: command.meetingId, kind: 'system' });
    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());
    h.controller.onStopped({ meetingId: command.meetingId });
    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.micEnded());
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

  it('stops when the disk fails while the chunks kept during the start are written', async () => {
    const h = harness({
      openTracks: async (_dir, _kinds, onError) => ({
        append: () => onError(Object.assign(new Error('io'), { code: 'EIO' })),
        close: async () => undefined,
        bytesWritten: () => 0,
      }),
    });
    const { command, starting } = await h.begin();
    h.controller.onChunk(command.meetingId, 'mic', bytes(1));
    h.controller.onStarted({ meetingId: command.meetingId, tracks: [{ kind: 'mic', startedAt: 1 }], micLabel: 'Mic', systemFailure: null });
    await starting;

    await vi.waitFor(() => expect(h.recorder.stop).toHaveBeenCalled());
    expect(h.deps.notify).toHaveBeenCalledWith(notificationTexts.stoppedByDisk('ошибка чтения или записи диска'));
    h.controller.onStopped({ meetingId: command.meetingId });
    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect((await readMeeting(h.lib, command.meetingId)).status).toBe('recorded');
  });

  it('tells the user when the end of the recording could not be saved', async () => {
    const h = harness();
    const command = await h.startRecording();
    breakMeetingFile(h.lib, command.meetingId);
    vi.mocked(h.deps.libraryChanged).mockClear();

    await h.stopRecording(command.meetingId);

    expect(h.state()).toMatchObject({ phase: 'idle', meetingId: null });
    expect(h.deps.notify).toHaveBeenCalledWith(saveFailedText);
    expect(h.deps.libraryChanged).toHaveBeenCalled();
    expect(h.deps.logger.error).toHaveBeenCalled();
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

  it('logs that the end of the audio may be missing when the stop was not confirmed', async () => {
    const h = harness();
    await h.startRecording();
    await h.controller.toggle();
    expect(h.deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('не подтвердило остановку'));
  });

  it('does not warn about a stop the recorder window confirmed', async () => {
    const h = harness();
    const command = await h.startRecording();
    await h.stopRecording(command.meetingId);
    expect(h.deps.logger.warn).not.toHaveBeenCalled();
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

  it('ignores toggles while a crashed recording is being saved', async () => {
    const h = harness();
    const command = await h.startRecording();
    h.controller.onChunk(command.meetingId, 'mic', bytes(1));

    h.controller.onRecorderGone();
    expect(h.state().phase).toBe('stopping');
    await h.controller.toggle();

    expect(h.recorder.stop).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect(await readMeeting(h.lib, command.meetingId)).toMatchObject({ status: 'recorded', recovered: true });
  });

  it('keeps the next recording going when the hotkey was pressed while a crashed one was being saved', async () => {
    const h = harness({ timeouts: { startMs: 300, stopMs: 400 } });
    const first = await h.startRecording();
    h.controller.onRecorderGone();
    void h.controller.toggle();
    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));

    h.recorder.start.mockClear();
    const second = await h.startRecording();
    // Дольше, чем ждала бы ответа «лишняя» остановка первой записи.
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(second.meetingId).not.toBe(first.meetingId);
    expect(h.state()).toMatchObject({ phase: 'recording', meetingId: second.meetingId });
    await h.stopRecording(second.meetingId);
    expect((await readMeeting(h.lib, second.meetingId)).status).toBe('recorded');
  });

  it('tells the user when a crashed recording could not be saved', async () => {
    const h = harness();
    const command = await h.startRecording();
    breakMeetingFile(h.lib, command.meetingId);
    vi.mocked(h.deps.libraryChanged).mockClear();

    h.controller.onRecorderGone();

    await vi.waitFor(() => expect(h.state().phase).toBe('idle'));
    expect(h.deps.notify).toHaveBeenCalledWith(saveFailedText);
    expect(h.deps.libraryChanged).toHaveBeenCalled();
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
