// «Сохранить в Word (.docx)»: та же раскладка, что у .txt и буфера обмена (shared/export-doc.ts), с оформлением.
import { Document, Packer, Paragraph, TextRun, type IRunOptions } from 'docx';
import type { ExportDoc } from '../../shared/export-doc';

/** Шрифт, который есть в Word и на Windows, и на Mac. */
const FONT = 'Calibri';
/** Размеры в Word — в половинах пункта. */
const BODY_SIZE = 22;
const TITLE_SIZE = 32;
const META_GREY = '7A7A7A';
const TIME_GREY = '8A8A8A';
/** Отступ перед абзацем говорящего — в двадцатых долях пункта (10 пт). */
const PARAGRAPH_GAP = 200;

/** Перевод строки внутри текста — разрыв строки в Word (как Shift+Enter). */
const lines = (text: string, options: Omit<IRunOptions, 'text' | 'break'> = {}): TextRun[] =>
  text.split(/\r\n?|\n/).map((line, i) => new TextRun({ ...options, text: line, ...(i > 0 && { break: 1 }) }));

export async function toDocx(doc: ExportDoc): Promise<Buffer> {
  const children = [
    new Paragraph({ children: lines(doc.title, { bold: true, size: TITLE_SIZE }), spacing: { after: 60 } }),
    new Paragraph({ children: lines(doc.metaLine, { color: META_GREY }) }),
  ];
  if (doc.participantsLine) children.push(new Paragraph({ children: lines(doc.participantsLine) }));
  for (const p of doc.paragraphs) {
    children.push(
      new Paragraph({
        spacing: { before: PARAGRAPH_GAP },
        // Имя не отрывается от своего текста на другую страницу.
        keepNext: true,
        children: [new TextRun({ text: p.speaker, bold: true }), new TextRun({ text: ` [${p.time}]`, color: TIME_GREY })],
      }),
      new Paragraph({ children: lines(p.text) }),
    );
  }
  const file = new Document({
    creator: 'TextMeet',
    title: doc.title,
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE, language: { value: 'ru-RU' } } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(file);
}
