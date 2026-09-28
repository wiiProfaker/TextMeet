import { promises as fsp } from 'node:fs';
import type { Peaks } from '../../shared/recording';

/** Тише −50 дБ — считаем тишиной. */
export const SILENCE_PEAK = 10 ** (-50 / 20);
export const SILENCE_REMINDER_MS = 10 * 60_000;
export const SYSTEM_SILENT_AFTER_MS = 10_000;
export const LOW_DISK_BEFORE_START_BYTES = 1024 ** 3;
export const LOW_DISK_DURING_BYTES = 500 * 1024 ** 2;
export const DISK_CHECK_INTERVAL_MS = 60_000;

/**
 * Обе дорожки молчат 10 минут подряд → одно напоминание «Запись всё ещё идёт».
 * Следующее — только после того, как звук появится и снова пропадёт на 10 минут.
 */
export class SilenceWatch {
  private quietSince: number;
  private reminded = false;

  constructor(startedAt: number) {
    this.quietSince = startedAt;
  }

  /** true — пора напомнить. */
  update(now: number, peaks: Peaks): boolean {
    const loud = peaks.mic >= SILENCE_PEAK || (peaks.system ?? 0) >= SILENCE_PEAK;
    if (loud) {
      this.quietSince = now;
      this.reminded = false;
      return false;
    }
    if (this.reminded || now - this.quietSince < SILENCE_REMINDER_MS) return false;
    this.reminded = true;
    return true;
  }
}

/**
 * Звук компьютера с начала записи ровно 0 дольше 10 с (на Mac так выглядит отозванное разрешение).
 * Проверяется только «с начала»: на Windows тишина посреди созвона — тоже ровный 0.
 */
export class SystemSilenceWatch {
  private heard = false;

  constructor(private readonly startedAt: number) {}

  /** true — показывать предупреждение «Звук компьютера пока не слышен». */
  update(now: number, systemPeak: number | null): boolean {
    if (this.heard || systemPeak === null) return false;
    if (systemPeak > 0) {
      this.heard = true;
      return false;
    }
    return now - this.startedAt >= SYSTEM_SILENT_AFTER_MS;
  }
}

/** Мало места во время записи → одно уведомление за запись. */
export class LowDiskWatch {
  private warned = false;

  /** true — пора предупредить. */
  update(freeBytes: number): boolean {
    if (this.warned || freeBytes >= LOW_DISK_DURING_BYTES) return false;
    this.warned = true;
    return true;
  }
}

/** Свободное место на диске, где лежит папка (байт, доступных программе). */
export async function freeDiskBytes(dir: string): Promise<number> {
  const stats = await fsp.statfs(dir);
  return stats.bavail * stats.bsize;
}
