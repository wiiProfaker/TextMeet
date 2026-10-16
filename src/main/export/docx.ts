// «Сохранить в Word (.docx)»: та же раскладка, что у .txt и буфера обмена (shared/export-doc.ts), с оформлением.
import { Document, Packer, Paragraph, TextRun, type IRunOptions } from 'docx';
import { listMark, type AiInline, type AiMdBlock } from '../../shared/ai-markdown';
import { SUMMARY_HEADING, TEXT_HEADING, type ExportDoc, type ExportSummary } from '../../shared/export-doc';

/** Шрифт, который есть в Word и на Windows, и на Mac. */
const FONT = 'Calibri';
/** Размеры в Word — в половинах пункта. */
const BODY_SIZE = 22;
const TITLE_SIZE = 32;
/** Заголовки разделов «Итоги встречи» и «Текст встречи». */
const SECTION_SIZE = 26;
const META_GREY = '7A7A7A';
const TIME_GREY = '8A8A8A';
/** Отступ перед абзацем говорящего — в двадцатых долях пункта (10 пт). */
const PARAGRAPH_GAP = 200;

/** Перевод строки внутри текста — разрыв строки в Word (как Shift+Enter). */
const lines = (text: string, options: Omit<IRunOptions, 'text' | 'break'> = {}): TextRun[] =>
  text.split(/\r\n?|\n/).map((line, i) => new TextRun({ ...options, text: line, ...(i > 0 && { break: 1 }) }));

/** Кусок итогов с жирным и курсивом (allBold — весь кусок жирным: заголовок); переводы строк — разрывы строк. */
const inlineRuns = (inline: readonly AiInline[], allBold = false): TextRun[] =>
  inline.flatMap((piece) =>
    lines(piece.text, { ...((piece.bold || allBold) && { bold: true }), ...(piece.italic && { italics: true }) }),
  );

/** Блок итогов: заголовок раздела — жирным, пункты списка — с «•» или номером и отступом. */
function blockParagraphs(block: AiMdBlock): Paragraph[] {
  if (block.kind === 'heading') {
    return [new Paragraph({ spacing: { before: 120 }, keepNext: true, children: inlineRuns(block.inline, true) })];
  }
  if (block.kind === 'paragraph') return [new Paragraph({ children: inlineRuns(block.inline) })];
  return block.items.map(
    (item, i) =>
      new Paragraph({
        indent: { left: 360, hanging: 360 },
        children: [new TextRun({ text: `${listMark(block, i)} ` }), ...inlineRuns(item)],
      }),
  );
}

/** Заголовок раздела: «Итоги встречи», «Текст встречи». */
function section(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 60 },
    keepNext: true,
    children: [new TextRun({ text: title, bold: true, size: SECTION_SIZE })],
  });
}

function summaryParagraphs(summary: ExportSummary): Paragraph[] {
  return [
    section(SUMMARY_HEADING),
    new Paragraph({ children: lines(summary.caption, { color: META_GREY }) }),
    ...summary.blocks.flatMap(blockParagraphs),
    section(TEXT_HEADING),
  ];
}

export async function toDocx(doc: ExportDoc): Promise<Buffer> {
  const children = [
    new Paragraph({ children: lines(doc.title, { bold: true, size: TITLE_SIZE }), spacing: { after: 60 } }),
    new Paragraph({ children: lines(doc.metaLine, { color: META_GREY }) }),
  ];
  if (doc.participantsLine) children.push(new Paragraph({ children: lines(doc.participantsLine) }));
  if (doc.summary) children.push(...summaryParagraphs(doc.summary));
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
