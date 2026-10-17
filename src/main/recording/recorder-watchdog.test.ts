import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDER_BEAT_MS, RECORDER_HUNG_MS, RecorderWatchdog } from './recorder-watchdog';

describe('RecorderWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a hung recorder once when beats stop for 15 s', () => {
    const onHung = vi.fn();
    const dog = new RecorderWatchdog({ onHung });
    dog.start();
    dog.beat();
    vi.advanceTimersByTime(RECORDER_BEAT_MS);
    dog.beat();
    vi.advanceTimersByTime(16_000);
    expect(onHung).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(onHung).toHaveBeenCalledTimes(1);
    dog.stop();
  });

  it('regular beats keep it quiet', () => {
    const onHung = vi.fn();
    const dog = new RecorderWatchdog({ onHung });
    dog.start();
    for (let t = 0; t < 60_000; t += RECORDER_BEAT_MS) {
      dog.beat();
      vi.advanceTimersByTime(RECORDER_BEAT_MS);
    }
    expect(onHung).not.toHaveBeenCalled();
    dog.stop();
  });

  it('waits for the first beat the whole limit after start', () => {
    const onHung = vi.fn();
    const dog = new RecorderWatchdog({ onHung });
    dog.start();
    vi.advanceTimersByTime(RECORDER_HUNG_MS - 1000);
    expect(onHung).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onHung).toHaveBeenCalledTimes(1);
    dog.stop();
  });

  it('stop() silences it', () => {
    const onHung = vi.fn();
    const dog = new RecorderWatchdog({ onHung });
    dog.start();
    dog.stop();
    vi.advanceTimersByTime(60_000);
    expect(onHung).not.toHaveBeenCalled();
  });

  it('takes a shorter limit (tests of the app)', () => {
    const onHung = vi.fn();
    const dog = new RecorderWatchdog({ onHung, hungMs: 1500 });
    dog.start();
    vi.advanceTimersByTime(2500);
    expect(onHung).toHaveBeenCalledTimes(1);
    dog.stop();
  });
});
