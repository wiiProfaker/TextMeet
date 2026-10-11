// Выгрузка встречи: одна раскладка текста для «Скопировать всё», .txt и .docx (решения Плана 5, §2.3).
// Чистые функции без зависимостей: тексту в буфере обмена, в .txt и в Word не разойтись.
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

export interface ExportDoc {
  title: string;
  /** «27 сентября 2026, 16:20 · 32 мин»; длительность неизвестна — только дата. */
  metaLine: string;
  /** «Участники: Я, Ирина, Спикер 2» — в порядке первого появления; реплик нет — null. */
  participantsLine: string | null;
  paragraphs: ExportParagraph[];
}

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
  };
}

/** Обычный текст: шапка, пустая строка, абзацы «Имя [время]» + текст через пустую строку. */
export function toPlainText(doc: ExportDoc, eol = '\n'): string {
  const lines = [doc.title, doc.metaLine];
  if (doc.participantsLine) lines.push(doc.participantsLine);
  for (const p of doc.paragraphs) lines.push('', `${p.speaker} [${p.time}]`, p.text);
  return lines.join('\n').replace(/\r\n?|\n/g, eol) + eol;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlLines = (text: string): string => escapeHtml(text).replace(/\r\n?|\n/g, '<br>');

/** Оформленный текст для буфера обмена (вставка в Word, Google Docs): имена жирным, время серым. */
export function toHtml(doc: ExportDoc): string {
  const parts = [
    `<h1 style="font-size:16pt">${htmlLines(doc.title)}</h1>`,
    `<p style="color:#7a7a7a">${htmlLines(doc.metaLine)}</p>`,
  ];
  if (doc.participantsLine) parts.push(`<p>${htmlLines(doc.participantsLine)}</p>`);
  for (const p of doc.paragraphs) {
    parts.push(
      `<p><b>${htmlLines(p.speaker)}</b> <span style="color:#8a8a8a">[${escapeHtml(p.time)}]</span><br>${htmlLines(p.text)}</p>`,
    );
  }
  return parts.join('\n');
}
