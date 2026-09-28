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
