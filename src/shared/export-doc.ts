// Выгрузка встречи: одна раскладка текста для «Скопировать всё», .txt и .docx (решения Плана 5, §2.3).
// Чистые функции без зависимостей: тексту в буфере обмена, в .txt и в Word не разойтись.
import { aiCaption, type AiSummary } from './ai';
import { inlineText, listMark, parseAiMarkdown, type AiInline, type AiMdBlock } from './ai-markdown';
import { formatDurationShort, formatLongDate, formatTimestamp } from './format';
import type { Meeting } from './meeting';
import { speakerLabel, type Transcript } from './transcript';

export interface ExportParagraph {
  /** Подпись спикера: имя из встречи, иначе «Я» / «Спикер N». */
  speaker: string;
  /** Начало первой реплики абзаца: «0:05», «11:48», «1:02:05». */
  time: string;
  /** Реплики подряд через пробел; перевод строки внутри реплики сохраняется. */
  text: string;
}

/** Итоги встречи в выгрузке (решения Плана 9, §2.3): в начале, перед текстом встречи. */
export interface ExportSummary {
  /** «Qwen3.5 9B · 27.09.2026, 16:55» (у остановленных — «· остановлено»). */
  caption: string;
  blocks: AiMdBlock[];
}

export interface ExportDoc {
  title: string;
  /** «27 сентября 2026, 16:20 · 32 мин»; длительность неизвестна — только дата. */
  metaLine: string;
  /** «Участники: Я, Ирина, Спикер 2» — в порядке первого появления; реплик нет — null. */
  participantsLine: string | null;
  paragraphs: ExportParagraph[];
  /** Итоги встречи; нет — раздела нет (и в «Скопировать для ИИ», и в том, что видит модель). */
  summary?: ExportSummary;
}

export const SUMMARY_HEADING = 'Итоги встречи';
export const TEXT_HEADING = 'Текст встречи';

/**
 * Управляющие символы недопустимы в XML — Word счёл бы файл повреждённым. Вертикальная табуляция (её даёт вставка из
 * Word) и одинокий \r — перевод строки, остальное убирается; табуляция и переводы строк остаются.
 */
function cleanText(text: string): string {
  return text.replace(/\r\n?|\u000b/g, '\n').replace(/[\u0000-\u0008\u000c\u000e-\u001f\u007f]/g, '');
}

/** Пустые строки внутри реплики (правка «Раз.⏎⏎Два.») — один перевод строки: в .txt они выглядели бы новым абзацем. */
const BLANK_LINES = /\n(?:[^\S\n]*\n)+/g;

/** Подряд идущие реплики одного спикера — один абзац; пустые реплики пропускаются. */
export function buildExportDoc(
  meeting: Pick<Meeting, 'title' | 'createdAt' | 'durationSec' | 'speakerNames'>,
  transcript: Pick<Transcript, 'segments'>,
  summary: AiSummary | null = null,
): ExportDoc {
  const paragraphs: (ExportParagraph & { speakerId: string })[] = [];
  for (const segment of transcript.segments) {
    const text = cleanText(segment.text).trim().replace(BLANK_LINES, '\n');
    if (text === '') continue;
    const last = paragraphs.at(-1);
    if (last && last.speakerId === segment.speakerId) {
      last.text = `${last.text} ${text}`;
      continue;
    }
    paragraphs.push({
      speakerId: segment.speakerId,
      speaker: cleanText(speakerLabel(segment.speakerId, meeting.speakerNames)),
      time: formatTimestamp(segment.start),
      text,
    });
  }
  const participants = [...new Set(paragraphs.map((p) => p.speaker))];
  const meta = [formatLongDate(meeting.createdAt)];
  if (meeting.durationSec !== null) meta.push(formatDurationShort(meeting.durationSec));
  return {
    title: cleanText(meeting.title),
    metaLine: meta.join(' · '),
    participantsLine: participants.length > 0 ? `Участники: ${participants.join(', ')}` : null,
    paragraphs: paragraphs.map(({ speaker, time, text }) => ({ speaker, time, text })),
    ...(summary && { summary: { caption: aiCaption(summary, true), blocks: parseAiMarkdown(cleanText(summary.text)) } }),
  };
}

/** Итоги простым текстом: заголовки и абзацы — строками, пункты — с «•» или номером. */
function summaryLines(summary: ExportSummary): string[] {
  const lines: string[] = [];
  for (const block of summary.blocks) {
    lines.push('');
    if (block.kind === 'list') {
      block.items.forEach((item, i) => lines.push(`${listMark(block, i)} ${inlineText(item)}`));
    } else {
      lines.push(inlineText(block.inline));
    }
  }
  return lines;
}

/** Обычный текст: шапка, пустая строка, абзацы «Имя [время]» + текст через пустую строку. */
export function toPlainText(doc: ExportDoc, eol = '\n'): string {
  const lines = [doc.title, doc.metaLine];
  if (doc.participantsLine) lines.push(doc.participantsLine);
  if (doc.summary) lines.push('', SUMMARY_HEADING, doc.summary.caption, ...summaryLines(doc.summary), '', TEXT_HEADING);
  for (const p of doc.paragraphs) lines.push('', `${p.speaker} [${p.time}]`, p.text);
  return lines.join('\n').replace(/\r\n?|\n/g, eol) + eol;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlLines = (text: string): string => escapeHtml(text).replace(/\r\n?|\n/g, '<br>');

const inlineHtml = (inline: readonly AiInline[]): string =>
  inline
    .map((piece) => {
      let html = htmlLines(piece.text);
      if (piece.italic) html = `<i>${html}</i>`;
      if (piece.bold) html = `<b>${html}</b>`;
      return html;
    })
    .join('');

function blockHtml(block: AiMdBlock): string {
  if (block.kind === 'heading') return `<p><b>${inlineHtml(block.inline)}</b></p>`;
  if (block.kind === 'paragraph') return `<p>${inlineHtml(block.inline)}</p>`;
  const tag = block.ordered ? 'ol' : 'ul';
  const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
  return `<${tag}${start}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`;
}

/** Оформленный текст для буфера обмена (вставка в Word, Google Docs): имена жирным, время серым. */
export function toHtml(doc: ExportDoc): string {
  const parts = [
    `<h1 style="font-size:16pt">${htmlLines(doc.title)}</h1>`,
    `<p style="color:#7a7a7a">${htmlLines(doc.metaLine)}</p>`,
  ];
  if (doc.participantsLine) parts.push(`<p>${htmlLines(doc.participantsLine)}</p>`);
  if (doc.summary) {
    parts.push(
      `<h2 style="font-size:13pt">${SUMMARY_HEADING}</h2>`,
      `<p style="color:#7a7a7a">${htmlLines(doc.summary.caption)}</p>`,
      ...doc.summary.blocks.map(blockHtml),
      `<h2 style="font-size:13pt">${TEXT_HEADING}</h2>`,
    );
  }
  for (const p of doc.paragraphs) {
    parts.push(
      `<p><b>${htmlLines(p.speaker)}</b> <span style="color:#8a8a8a">[${escapeHtml(p.time)}]</span><br>${htmlLines(p.text)}</p>`,
    );
  }
  return parts.join('\n');
}
