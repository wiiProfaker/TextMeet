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
    let meter: LevelMeter;
    try {
      meter = new LevelMeter(capture.streams);
    } catch (err) {
      // Устройства уже включены — выключаем, иначе микрофон остался бы занятым до перезапуска.
      await capture.stop().catch(() => undefined);
      throw err;
    }
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
  try {
    await current.capture.stop();
    await current.meter.close().catch(() => undefined);
  } finally {
    // main ждёт «остановлено», чтобы дописать файлы, — сообщаем и после ошибки.
    window.recorder.stopped({ meetingId: current.meetingId });
  }
}

window.recorder.onStart((command) => enqueue(() => start(command)));
window.recorder.onStop(() => enqueue(stop));
window.recorder.onPlaySound((kind) => playSound(kind));
window.recorder.ready();
