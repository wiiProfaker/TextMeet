// Оформление ответа модели (решения Плана 9, §2.2): из разметки Markdown, которую пишет модель, берутся только
// заголовки разделов, списки, жирный и курсив; остальное — простым текстом (ссылки и HTML не оживают). Одна раскладка
// для блока итогов в окне и для выгрузки (Word, .txt, «Скопировать всё»). Чистые функции.

export interface AiInline {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type AiMdBlock =
  | { kind: 'heading'; inline: AiInline[] }
  | { kind: 'list'; ordered: boolean; items: AiInline[][] }
  /** Строки абзаца — через перевод строки внутри текста. */
  | { kind: 'paragraph'; inline: AiInline[] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
/** Черта «---», «***» — разделитель разделов, в тексте не нужна. */
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
/**
 * Жирный и курсив: ***оба***, **жирный**, __жирный__, *курсив*, _курсив_ (подчёркивания — только на границе слова:
 * имена_файлов остаются как есть). Незакрытая пометка (ответ ещё пишется) — простой текст.
 */
const EMPHASIS =
  /\*\*\*([^*\n]+?)\*\*\*|\*\*([^*\n]+?)\*\*|(?<![\p{L}\p{N}])__([^_\n]+?)__(?![\p{L}\p{N}])|\*([^*\s][^*\n]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}])/gu;

export function parseInline(text: string): AiInline[] {
  const out: AiInline[] = [];
  const push = (piece: string, bold: boolean, italic: boolean) => {
    if (piece === '') return;
    const last = out.at(-1);
    if (last && last.bold === bold && last.italic === italic) last.text += piece;
    else out.push({ text: piece, bold, italic });
  };
  let at = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    push(text.slice(at, match.index), false, false);
    const [, both, bold, boldUnderscore, italic, italicUnderscore] = match;
    if (both !== undefined) push(both, true, true);
    else if (bold !== undefined || boldUnderscore !== undefined) push(bold ?? boldUnderscore ?? '', true, false);
    else push(italic ?? italicUnderscore ?? '', false, true);
    at = match.index + match[0].length;
  }
  push(text.slice(at), false, false);
  return out;
}

export function parseAiMarkdown(text: string): AiMdBlock[] {
  const blocks: AiMdBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '' || RULE.test(line)) {
      flushParagraph();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = heading ? null : BULLET.exec(line);
    const ordered = heading || bullet ? null : ORDERED.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', inline: parseInline(heading[1] ?? '') });
    } else if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      const item = parseInline((bullet ?? ordered)?.[1] ?? '');
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered === isOrdered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered: isOrdered, items: [item] });
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}

export const inlineText = (inline: readonly AiInline[]): string => inline.map((piece) => piece.text).join('');

/** Простым текстом (выгрузка в .txt, буфер обмена): маркеры «•» и номера вместо разметки, блоки — через пустую строку. */
export function aiPlainText(text: string): string {
  return parseAiMarkdown(text)
    .map((block) => {
      if (block.kind === 'list') {
        return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '•'} ${inlineText(item)}`).join('\n');
      }
      return inlineText(block.inline);
    })
    .join('\n\n');
}
