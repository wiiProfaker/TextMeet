import { describe, expect, it } from 'vitest';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from './export-doc';
import type { TranscriptSegment } from './transcript';

const createdAt = new Date(2026, 8, 27, 16, 20).toISOString();
const meeting = { title: 'Созвон с Ириной', createdAt, durationSec: 32 * 60 + 15, speakerNames: { s1: 'Ирина' } };

let n = 0;
const seg = (start: number, speakerId: string, text: string): TranscriptSegment => ({
  id: `seg-${++n}`,
  start,
  end: start + 3,
  speakerId,
  text,
  edited: false,
});

describe('buildExportDoc', () => {
  it('joins replicas of one speaker in a row into a paragraph with the time of the first', () => {
    const doc = buildExportDoc(meeting, {
      segments: [
        seg(708, 's1', 'Смотри, по бюджету на октябрь у нас остаётся примерно половина.'),
        seg(715, 's1', 'Подрядчиков считаем отдельно.'),
        seg(724, 'me', 'Понял. А что с дизайном?'),
        seg(730, 's2', 'Ответ нужен до пятницы.'),
        seg(735, 'me', 'Хорошо.'),
      ],
    });
    expect(doc).toEqual({
      title: 'Созвон с Ириной',
      metaLine: '27 сентября 2026, 16:20 · 32 мин',
      participantsLine: 'Участники: Ирина, Я, Спикер 2',
      paragraphs: [
        {
          speaker: 'Ирина',
          time: '11:48',
          text: 'Смотри, по бюджету на октябрь у нас остаётся примерно половина. Подрядчиков считаем отдельно.',
        },
        { speaker: 'Я', time: '12:04', text: 'Понял. А что с дизайном?' },
        { speaker: 'Спикер 2', time: '12:10', text: 'Ответ нужен до пятницы.' },
        { speaker: 'Я', time: '12:15', text: 'Хорошо.' },
      ],
    });
  });

  it('writes hours for a long meeting and leaves out an unknown duration', () => {
    const doc = buildExportDoc({ ...meeting, durationSec: null }, { segments: [seg(3725, 'me', 'Итак.')] });
    expect(doc.metaLine).toBe('27 сентября 2026, 16:20');
    expect(doc.paragraphs[0]?.time).toBe('1:02:05');
  });

  it('skips empty replicas and joins the ones around them', () => {
    const doc = buildExportDoc(meeting, {
      segments: [seg(1, 's1', 'Раз.'), seg(2, 'me', '   '), seg(3, 's1', 'Два.')],
    });
    expect(doc.paragraphs).toEqual([{ speaker: 'Ирина', time: '0:01', text: 'Раз. Два.' }]);
    expect(doc.participantsLine).toBe('Участники: Ирина');
  });

  it('drops control characters that would break a Word file', () => {
    const doc = buildExportDoc({ ...meeting, title: 'Со\u0001звон' }, {
      segments: [seg(1, 's1', 'Строка\u000bвторая\u0007.')],
    });
    expect(doc.title).toBe('Созвон');
    expect(doc.paragraphs[0]?.text).toBe('Строка\nвторая.');
  });

  it('keeps one line break where an edited replica has blank lines, so it does not look like a new paragraph', () => {
    const doc = buildExportDoc(meeting, {
      segments: [seg(1, 's1', 'Раз.\n\nДва.\r\n \r\n\rТри.\rЧетыре.')],
    });
    expect(doc.paragraphs[0]?.text).toBe('Раз.\nДва.\nТри.\nЧетыре.');
  });

  it('a meeting without replicas has no participants and no paragraphs', () => {
    const doc = buildExportDoc(meeting, { segments: [] });
    expect(doc.participantsLine).toBeNull();
    expect(doc.paragraphs).toEqual([]);
  });

  it('names a speaker once even if two ids carry the same name', () => {
    const doc = buildExportDoc({ ...meeting, speakerNames: { s1: 'Ирина', s2: 'Ирина' } }, {
      segments: [seg(1, 's1', 'Раз.'), seg(2, 's2', 'Два.')],
    });
    expect(doc.participantsLine).toBe('Участники: Ирина');
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['Раз.', 'Два.']);
  });
});

const doc: ExportDoc = {
  title: 'Созвон с Ириной',
  metaLine: '27 сентября 2026, 16:20 · 32 мин',
  participantsLine: 'Участники: Ирина, Я',
  paragraphs: [
    { speaker: 'Ирина', time: '11:48', text: 'Смотри.' },
    { speaker: 'Я', time: '12:04', text: 'Понял.\nА что с дизайном?' },
  ],
};

describe('toPlainText', () => {
  it('writes the title, the date, the participants and the paragraphs', () => {
    expect(toPlainText(doc)).toBe(
      [
        'Созвон с Ириной',
        '27 сентября 2026, 16:20 · 32 мин',
        'Участники: Ирина, Я',
        '',
        'Ирина [11:48]',
        'Смотри.',
        '',
        'Я [12:04]',
        'Понял.',
        'А что с дизайном?',
        '',
      ].join('\n'),
    );
  });

  it('uses the line ending it is given, also inside a replica', () => {
    const text = toPlainText(doc, '\r\n');
    expect(text).toContain('Понял.\r\nА что с дизайном?\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('turns a lone carriage return into the line ending too', () => {
    const lone: ExportDoc = { ...doc, title: 'Созвон\rитоги', paragraphs: [{ speaker: 'Я', time: '0:01', text: 'Раз.\rДва.' }] };
    const text = toPlainText(lone, '\r\n');
    expect(text).toContain('Созвон\r\nитоги\r\n');
    expect(text).toContain('Раз.\r\nДва.\r\n');
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(toHtml(lone)).toContain('Раз.<br>Два.');
  });

  it('a meeting without replicas is just the title and the date', () => {
    expect(toPlainText({ ...doc, participantsLine: null, paragraphs: [] })).toBe(
      'Созвон с Ириной\n27 сентября 2026, 16:20 · 32 мин\n',
    );
  });
});

describe('toHtml', () => {
  it('makes names bold and times grey', () => {
    const html = toHtml(doc);
    expect(html).toContain('<b>Ирина</b> <span style="color:#8a8a8a">[11:48]</span>');
    expect(html).toContain('Понял.<br>А что с дизайном?');
    expect(html.indexOf('Созвон с Ириной')).toBeLessThan(html.indexOf('Участники'));
  });

  it('escapes everything that came from people', () => {
    const html = toHtml({
      title: '<script>alert(1)</script>',
      metaLine: 'a & b',
      participantsLine: 'Участники: "Q"',
      paragraphs: [{ speaker: '<i>Ира</i>', time: '0:01', text: '1 < 2 & 3 > 2' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('&quot;Q&quot;');
    expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2');
  });
});
