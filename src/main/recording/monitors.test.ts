import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import {
  freeDiskBytes,
  LOW_DISK_DURING_BYTES,
  LowDiskWatch,
  SILENCE_PEAK,
  SILENCE_REMINDER_MS,
  SilenceWatch,
  SYSTEM_SILENT_AFTER_MS,
  SystemSilenceWatch,
} from './monitors';

const quiet = { mic: SILENCE_PEAK / 2, system: 0 };
const loud = { mic: 0.3, system: 0 };

describe('SilenceWatch', () => {
  it('reminds once after 10 minutes of silence on both tracks', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS - 1, quiet)).toBe(false);
    expect(watch.update(SILENCE_REMINDER_MS, quiet)).toBe(true);
    expect(watch.update(SILENCE_REMINDER_MS * 3, quiet)).toBe(false);
  });

  it('counts sound on the computer track as sound', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS, { mic: 0, system: 0.2 })).toBe(false);
  });

  it('starts over after sound and reminds again after a new silence', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS, quiet)).toBe(true);
    expect(watch.update(SILENCE_REMINDER_MS + 1000, loud)).toBe(false);
    expect(watch.update(2 * SILENCE_REMINDER_MS, quiet)).toBe(false);
    expect(watch.update(2 * SILENCE_REMINDER_MS + 1000, quiet)).toBe(true);
  });

  it('works without a computer track', () => {
    const watch = new SilenceWatch(0);
    expect(watch.update(SILENCE_REMINDER_MS, { mic: 0, system: null })).toBe(true);
  });
});

describe('SystemSilenceWatch', () => {
  it('warns when the computer track is exactly 0 for 10 s from the start', () => {
    const watch = new SystemSilenceWatch(1000);
    expect(watch.update(1000 + SYSTEM_SILENT_AFTER_MS - 1, 0)).toBe(false);
    expect(watch.update(1000 + SYSTEM_SILENT_AFTER_MS, 0)).toBe(true);
  });

  it('stops warning for good once any sound was heard', () => {
    const watch = new SystemSilenceWatch(0);
    expect(watch.update(SYSTEM_SILENT_AFTER_MS, 0)).toBe(true);
    expect(watch.update(SYSTEM_SILENT_AFTER_MS + 100, 0.0001)).toBe(false);
    expect(watch.update(SYSTEM_SILENT_AFTER_MS * 10, 0)).toBe(false);
  });

  it('ignores recordings without a computer track', () => {
    expect(new SystemSilenceWatch(0).update(SYSTEM_SILENT_AFTER_MS * 2, null)).toBe(false);
  });
});

describe('LowDiskWatch', () => {
  it('warns once when free space drops below the limit', () => {
    const watch = new LowDiskWatch();
    expect(watch.update(LOW_DISK_DURING_BYTES)).toBe(false);
    expect(watch.update(LOW_DISK_DURING_BYTES - 1)).toBe(true);
    expect(watch.update(1)).toBe(false);
  });
});

describe('freeDiskBytes', () => {
  it('returns a positive number of bytes for an existing folder', async () => {
    expect(await freeDiskBytes(makeTempDir())).toBeGreaterThan(0);
  });
});
