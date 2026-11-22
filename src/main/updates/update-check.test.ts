import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNewer, parseVersion, UpdateChecker, updateFromRelease, visibleUpdate, type AvailableUpdate } from './update-check';

const release = (over = {}) => ({
  tag_name: 'v1.1.0',
  html_url: 'https://github.com/wiiProfaker/TextMeet/releases/tag/v1.1.0',
  draft: false,
  prerelease: false,
  ...over,
});

describe('versions', () => {
  it('parseVersion and isNewer compare versions as numbers', () => {
    expect(parseVersion('v1.10.0')).toEqual([1, 10, 0]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.1.0-beta')).toBeNull();
    expect(parseVersion('1.1')).toBeNull();
    expect(isNewer('1.10.0', '1.9.3')).toBe(true);
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
    expect(isNewer('мусор', '1.0.0')).toBe(false);
  });
});

describe('updateFromRelease', () => {
  it('updateFromRelease returns a newer release', () => {
    expect(updateFromRelease(release(), '1.0.0')).toEqual({ version: '1.1.0', url: release().html_url });
  });

  it('updateFromRelease ignores prereleases, bad tags and foreign links', () => {
    expect(updateFromRelease(release({ prerelease: true }), '1.0.0')).toBeNull();
    expect(updateFromRelease(release({ draft: true }), '1.0.0')).toBeNull();
    expect(updateFromRelease(release({ tag_name: 'v1.1.0-beta' }), '1.0.0')).toBeNull();
    expect(updateFromRelease(release({ html_url: 'https://evil.example/x' }), '1.0.0')).toBeNull();
    expect(updateFromRelease(release({ html_url: 'https://github.com/wiiProfaker/TextMeet/releases/../../evil' }), '1.0.0')).toBeNull();
    expect(updateFromRelease('<html>', '1.0.0')).toBeNull();
    expect(updateFromRelease(null, '1.0.0')).toBeNull();
    expect(updateFromRelease(release({ tag_name: 'v0.9.0' }), '1.0.0')).toBeNull();
  });
});

describe('UpdateChecker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (over: { fetchJson?: (url: string) => Promise<unknown>; enabled?: () => boolean } = {}) => {
    const found: (AvailableUpdate | null)[] = [];
    const logger = { info: vi.fn(), warn: vi.fn() };
    const fetchJson = vi.fn(over.fetchJson ?? (async () => release()));
    const checker = new UpdateChecker({
      current: '1.0.0',
      url: 'https://api.github.com/repos/wiiProfaker/TextMeet/releases/latest',
      fetchJson,
      enabled: over.enabled ?? (() => true),
      onFound: (update) => found.push(update),
      logger,
      firstDelayMs: 60_000,
      everyMs: 24 * 60 * 60_000,
    });
    return { checker, found, logger, fetchJson };
  };

  it('checker stays silent on fetch errors', async () => {
    const t = setup({
      fetchJson: async () => {
        throw new Error('GitHub ответил 404');
      },
    });
    t.checker.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.found).toEqual([]);
    expect(t.logger.warn).toHaveBeenCalledTimes(1);
    expect(t.checker.found()).toBeNull();
    t.checker.stop();
  });

  it('checker asks after the first delay and then once a day, and not at all when disabled', async () => {
    const t = setup();
    t.checker.start();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(t.fetchJson).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(t.fetchJson).toHaveBeenCalledTimes(1);
    expect(t.found).toEqual([{ version: '1.1.0', url: release().html_url }]);
    expect(t.checker.found()).toEqual({ version: '1.1.0', url: release().html_url });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(t.fetchJson).toHaveBeenCalledTimes(2);
    t.checker.stop();

    const off = setup({ enabled: () => false });
    off.checker.start();
    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60_000);
    expect(off.fetchJson).not.toHaveBeenCalled();
    off.checker.stop();
  });

  it('a later answer without a newer version clears what was found', async () => {
    let answer: unknown = release();
    const t = setup({ fetchJson: async () => answer });
    t.checker.start();
    await vi.advanceTimersByTimeAsync(60_000);
    answer = release({ tag_name: 'v1.0.0' });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(t.checker.found()).toBeNull();
    expect(t.found.at(-1)).toBeNull();
    t.checker.stop();
  });
});

describe('visibleUpdate', () => {
  const update = { version: '1.1.0', url: release().html_url };
  it('shows a found update unless it was dismissed or checks are off', () => {
    expect(visibleUpdate(update, { checkUpdates: true, dismissedUpdate: null })).toEqual(update);
    expect(visibleUpdate(update, { checkUpdates: true, dismissedUpdate: '1.1.0' })).toBeNull();
    expect(visibleUpdate(update, { checkUpdates: true, dismissedUpdate: '1.0.5' })).toEqual(update);
    expect(visibleUpdate(update, { checkUpdates: false, dismissedUpdate: null })).toBeNull();
    expect(visibleUpdate(null, { checkUpdates: true, dismissedUpdate: null })).toBeNull();
  });
});
