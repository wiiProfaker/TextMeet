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
