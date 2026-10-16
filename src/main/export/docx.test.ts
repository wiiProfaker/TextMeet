import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ExportDoc } from '../../shared/export-doc';
import { toDocx } from './docx';

const doc: ExportDoc = {
  title: 'Созвон с Ириной',
  metaLine: '27 сентября 2026, 16:20 · 32 мин',
  participantsLine: 'Участники: Ирина, Я',
  paragraphs: [
    { speaker: 'Ирина', time: '11:48', text: 'Смотри, по бюджету.' },
    { speaker: 'Я', time: '12:04', text: 'Понял.\nА что с дизайном?' },
  ],
};

async function unpack(buffer: Buffer): Promise<{ document: string; styles: string; core: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const read = (name: string): Promise<string> => {
    const file = zip.file(name);
    if (!file) throw new Error(`в .docx нет ${name}`);
    return file.async('string');
  };
  return { document: await read('word/document.xml'), styles: await read('word/styles.xml'), core: await read('docProps/core.xml') };
}

describe('toDocx', () => {
  it('makes a Word file with the title, the date and every paragraph', async () => {
    const { document, core } = await unpack(await toDocx(doc));
    for (const text of ['Созвон с Ириной', '27 сентября 2026, 16:20 · 32 мин', 'Участники: Ирина, Я', 'Смотри, по бюджету.']) {
      expect(document).toContain(text);
    }
    expect(core).toContain('Созвон с Ириной');
  });

  it('writes names in bold and times in grey', async () => {
    const { document } = await unpack(await toDocx(doc));
    expect(document).toMatch(/<w:r><w:rPr><w:b\/>(?:(?!<\/w:r>).)*<w:t[^>]*>Ирина<\/w:t><\/w:r>/s);
    expect(document).toMatch(/<w:color w:val="8A8A8A"\/>(?:(?!<\/w:r>).)*<w:t[^>]*> \[11:48\]<\/w:t>/s);
  });

  it('keeps a line break inside a replica', async () => {
    const { document } = await unpack(await toDocx(doc));
    expect(document).toMatch(/Понял\.<\/w:t><\/w:r><w:r>(?:(?!<\/w:r>).)*<w:br\/>(?:(?!<\/w:r>).)*А что с дизайном\?/s);
  });

  it('uses Calibri and Russian for spelling', async () => {
    const { styles } = await unpack(await toDocx(doc));
    expect(styles).toContain('Calibri');
    expect(styles).toContain('ru-RU');
  });

  it('a meeting without replicas is just the title and the date', async () => {
    const { document } = await unpack(await toDocx({ ...doc, participantsLine: null, paragraphs: [] }));
    expect(document).toContain('Созвон с Ириной');
    expect(document).not.toContain('Участники');
  });
});

describe('toDocx with a summary', () => {
  it('puts the summary with its heading and bullets before the text of the meeting', async () => {
    const withSummary: ExportDoc = {
      ...doc,
      summary: {
        caption: 'Qwen3.5 9B · 27.09.2026, 16:55',
        blocks: [
          { kind: 'heading', inline: [{ text: 'Главное', bold: false, italic: false }] },
          { kind: 'list', ordered: false, start: 1, items: [[{ text: 'Бюджет', bold: true, italic: false }]] },
          { kind: 'list', ordered: true, start: 2, items: [[{ text: 'Дизайн', bold: false, italic: false }]] },
        ],
      },
    };
    const { document } = await unpack(await toDocx(withSummary));
    for (const text of ['Итоги встречи', 'Qwen3.5 9B · 27.09.2026, 16:55', 'Главное', '• ', 'Бюджет', '2. ', 'Дизайн', 'Текст встречи']) {
      expect(document).toContain(text);
    }
    expect(document.indexOf('Итоги встречи')).toBeLessThan(document.indexOf('Текст встречи'));
    expect(document.indexOf('Текст встречи')).toBeLessThan(document.indexOf('Смотри, по бюджету.'));
  });
});
