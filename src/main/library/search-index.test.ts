import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_HITS_PER_MEETING, SEARCH_MAX_MEETINGS } from '../../shared/search';
import { makeTempDir } from '../../test-support/temp-dir';
import type { Logger } from '../logger';
import { SearchIndex } from './search-index';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };

afterEach(() => {
  vi.clearAllMocks();
});

const idOf = (n: number) => `2026-09-${String(n).padStart(2, '0')}_1000_a1b2c3`;

function writeMeeting(
  lib: string,
  n: number,
  title: string,
  segments: { text: string; speakerId?: string }[] | null,
  speakerNames: Record<string, string> = {},
): string {
  const id = idOf(n);
  mkdirSync(join(lib, id), { recursive: true });
  writeFileSync(
    join(lib, id, 'meeting.json'),
    JSON.stringify({
      schemaVersion: 1,
      id,
      title,
      createdAt: `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`,
      durationSec: 60,
      source: 'recording',
      participantsHint: null,
      model: 'gigaam-v3-e2e-rnnt',
      status: 'done',
      errorMessage: null,
      speakerNames,
    }),
  );
  if (segments) {
    writeFileSync(
      join(lib, id, 'transcript.json'),
      JSON.stringify({
        schemaVersion: 1,
        model: 'gigaam-v3-e2e-rnnt',
        createdAt: '2026-09-30T10:00:00.000Z',
        speakers: [{ id: 'me', kind: 'me' }],
        segments: segments.map((s, i) => ({
          id: `seg-${i + 1}`,
          start: i * 10,
          end: i * 10 + 5,
          speakerId: s.speakerId ?? 'me',
          text: s.text,
          edited: false,
        })),
      }),
    );
  }
  return id;
}

function setup() {
  let lib = makeTempDir('textmeet-search-');
  const index = new SearchIndex({ libraryDir: () => lib, logger });
  return {
    lib: () => lib,
    setLibrary: (dir: string) => {
      lib = dir;
    },
    index,
  };
}

describe('SearchIndex', () => {
  it('finds segments in every meeting, newest meeting first, with speaker labels and marked snippets', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Планёрка', [{ text: 'Бюджет на иллюстрации пока не утверждён.', speakerId: 's1' }]);
    const irina = writeMeeting(
      t.lib(),
      3,
      'Созвон с Ириной',
      [{ text: 'По бюджету на октябрь осталась половина.', speakerId: 's1' }, { text: 'Без подрядчиков?' }],
      { s1: 'Ирина' },
    );
    writeMeeting(t.lib(), 2, 'Про отпуск', [{ text: 'Ничего про деньги.' }]);
    await t.index.refresh();

    const result = await t.index.search('Бюджет');

    expect(result.truncated).toBe(false);
    expect(result.meetings.map((m) => m.title)).toEqual(['Созвон с Ириной', 'Планёрка']);
    expect(result.meetings[0]).toEqual({
      meetingId: irina,
      title: 'Созвон с Ириной',
      titleRanges: [],
      createdAt: '2026-09-03T10:00:00.000Z',
      total: 1,
      hits: [
        {
          segmentId: 'seg-1',
          start: 0,
          speakerId: 's1',
          speaker: 'Ирина',
          text: 'По бюджету на октябрь осталась половина.',
          ranges: [{ start: 3, end: 9 }],
        },
      ],
    });
  });

  it('needs every word of the query in one segment and ignores «ё»', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Встреча', [{ text: 'Семён про бюджет' }, { text: 'Октябрь и бюджет' }]);
    await t.index.refresh();
    const result = await t.index.search('бюджет семен');
    expect(result.meetings[0]?.hits.map((h) => h.segmentId)).toEqual(['seg-1']);
  });

  it('finds a meeting by its title and marks it', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет 2027', [{ text: 'Начнём.' }]);
    await t.index.refresh();
    const [meeting] = (await t.index.search('бюджет')).meetings;
    expect(meeting).toMatchObject({ title: 'Бюджет 2027', titleRanges: [{ start: 0, end: 6 }], total: 0, hits: [] });
  });

  it('shows only the first hits of a meeting and counts all of them', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Встреча', Array.from({ length: 7 }, (_, i) => ({ text: `бюджет ${i}` })));
    await t.index.refresh();
    const [meeting] = (await t.index.search('бюджет')).meetings;
    expect(meeting?.total).toBe(7);
    expect(meeting?.hits).toHaveLength(SEARCH_HITS_PER_MEETING);
  });

  it('returns nothing for a query that is too short', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', [{ text: 'бюджет' }]);
    await t.index.refresh();
    expect(await t.index.search(' б ')).toEqual({ query: ' б ', meetings: [], truncated: false });
  });

  it('stops after the maximum number of meetings', async () => {
    const t = setup();
    const index = t.index as unknown as { entries: Map<string, unknown> };
    for (let i = 0; i <= SEARCH_MAX_MEETINGS; i++) {
      index.entries.set(`m${i}`, {
        stamp: 'x',
        meeting: { id: `m${i}`, title: 'Бюджет', titleNorm: 'бюджет', createdAt: '2026-09-01', speakerNames: {}, segments: [] },
      });
    }
    // Папка совпадает — обновлять индекс поиску незачем.
    (t.index as unknown as { dir: string }).dir = t.lib();
    const result = await t.index.search('бюджет');
    expect(result.meetings).toHaveLength(SEARCH_MAX_MEETINGS);
    expect(result.truncated).toBe(true);
  });

  it('rereads only changed meetings and forgets removed folders', async () => {
    const t = setup();
    const a = writeMeeting(t.lib(), 1, 'Первая', [{ text: 'старый текст' }]);
    const b = writeMeeting(t.lib(), 2, 'Вторая', [{ text: 'бюджет' }]);
    await t.index.refresh();

    writeMeeting(t.lib(), 1, 'Первая', [{ text: 'новый бюджет' }]);
    // Время изменения другое — встреча перечитывается.
    utimesSync(join(t.lib(), a, 'transcript.json'), new Date(), new Date(Date.now() + 5000));
    rmSync(join(t.lib(), b), { recursive: true });
    await t.index.refresh();

    const result = await t.index.search('бюджет');
    expect(result.meetings.map((m) => m.meetingId)).toEqual([a]);
  });

  it('rereads a meeting the app changed itself, even with the same file time', async () => {
    const t = setup();
    const a = writeMeeting(t.lib(), 1, 'Встреча', [{ text: 'старый текст' }]);
    const time = new Date('2026-10-01T10:00:00.000Z');
    const sameTime = () => {
      for (const file of ['meeting.json', 'transcript.json']) utimesSync(join(t.lib(), a, file), time, time);
    };
    sameTime();
    await t.index.refresh();
    // То же время изменения и тот же размер (текст той же длины) — по отпечатку изменение не видно.
    writeMeeting(t.lib(), 1, 'Встреча', [{ text: 'свежий текст' }]);
    sameTime();

    await t.index.refresh();
    expect((await t.index.search('свежий')).meetings).toHaveLength(0);
    t.index.invalidate(a);
    await t.index.refresh();
    expect((await t.index.search('свежий')).meetings).toHaveLength(1);
  });

  it('forgets a removed meeting at once', async () => {
    const t = setup();
    const a = writeMeeting(t.lib(), 1, 'Бюджет', null);
    await t.index.refresh();
    t.index.remove(a);
    expect((await t.index.search('бюджет')).meetings).toHaveLength(0);
  });

  it('skips broken meetings, finds a meeting with a broken text by its title, and logs once per change', async () => {
    const t = setup();
    const broken = idOf(1);
    mkdirSync(join(t.lib(), broken));
    writeFileSync(join(t.lib(), broken, 'meeting.json'), '{ не json');
    const damaged = writeMeeting(t.lib(), 2, 'Бюджет', null);
    writeFileSync(join(t.lib(), damaged, 'transcript.json'), '{"schemaVersion": 7}');
    // Папка без meeting.json — встреча создаётся: не ошибка.
    mkdirSync(join(t.lib(), idOf(3)));
    await t.index.refresh();
    await t.index.refresh();

    expect((await t.index.search('бюджет')).meetings.map((m) => m.meetingId)).toEqual([damaged]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('merges refreshes requested while one is running', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', null);
    const first = t.index.refresh();
    const second = t.index.refresh();
    const third = t.index.refresh();
    expect(third).toBe(second);
    await Promise.all([first, second, third]);
    expect((await t.index.search('бюджет')).meetings).toHaveLength(1);
  });

  it('waits for a running refresh before searching', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', null);
    await t.index.refresh();
    writeMeeting(t.lib(), 2, 'Бюджет второй', null);
    void t.index.refresh();
    expect((await t.index.search('бюджет')).meetings).toHaveLength(2);
  });

  it('starts over in a new library folder and treats a missing folder as empty', async () => {
    const t = setup();
    writeMeeting(t.lib(), 1, 'Бюджет', null);
    await t.index.refresh();
    t.setLibrary(join(makeTempDir('textmeet-search-'), 'missing'));
    expect((await t.index.search('бюджет')).meetings).toHaveLength(0);
  });

  it('reports a library folder it cannot read', async () => {
    const t = setup();
    const file = join(makeTempDir('textmeet-search-'), 'file');
    writeFileSync(file, 'x');
    t.setLibrary(file);
    await expect(t.index.refresh()).rejects.toThrow('Не удалось прочитать библиотеку');
  });
});
