import { describe, expect, it } from 'vitest';
import { aiPlainText, inlineText, parseAiMarkdown, parseInline } from './ai-markdown';

const plain = (text: string) => ({ text, bold: false, italic: false });

describe('parseInline', () => {
  it('finds bold and italic, with stars and underscores', () => {
    expect(parseInline('**Я** — написать *сегодня*, __потом__ _отчёт_ и ***срочно***')).toEqual([
      { text: 'Я', bold: true, italic: false },
      plain(' — написать '),
      { text: 'сегодня', bold: false, italic: true },
      plain(', '),
      { text: 'потом', bold: true, italic: false },
      plain(' '),
      { text: 'отчёт', bold: false, italic: true },
      plain(' и '),
      { text: 'срочно', bold: true, italic: true },
    ]);
  });

  it('leaves unfinished marks, names with underscores and arithmetic as they are', () => {
    expect(parseInline('Итоги **пишутся')).toEqual([plain('Итоги **пишутся')]);
    expect(parseInline('файл my_report_final.docx')).toEqual([plain('файл my_report_final.docx')]);
    expect(parseInline('2 * 3 = 6')).toEqual([plain('2 * 3 = 6')]);
  });

  it('keeps links and HTML as plain text', () => {
    expect(parseInline('[сайт](https://example.com) <b>x</b>')).toEqual([plain('[сайт](https://example.com) <b>x</b>')]);
  });
});

describe('parseAiMarkdown', () => {
  it('reads headings, lists and paragraphs the model writes', () => {
    const text = '### Главное\n- Бюджет — **половина**.\n* Дизайн до пятницы.\n\nВ целом спокойно.\nБез споров.\n\n## Задачи\n1. Написать Олегу.\n2) Сравнить сроки.';
    expect(parseAiMarkdown(text)).toEqual([
      { kind: 'heading', inline: [plain('Главное')] },
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: [[plain('Бюджет — '), { text: 'половина', bold: true, italic: false }, plain('.')], [plain('Дизайн до пятницы.')]],
      },
      { kind: 'paragraph', inline: [plain('В целом спокойно.\nБез споров.')] },
      { kind: 'heading', inline: [plain('Задачи')] },
      { kind: 'list', ordered: true, start: 1, items: [[plain('Написать Олегу.')], [plain('Сравнить сроки.')]] },
    ]);
  });

  it('drops horizontal rules and Windows line ends, and splits lists of different kinds', () => {
    const blocks = parseAiMarkdown('- раз\r\n---\r\n1. два');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'list']);
    expect(blocks[1]).toMatchObject({ ordered: true });
  });

  it('keeps the numbers of a numbered list broken by nested points or continuation lines', () => {
    const blocks = parseAiMarkdown('1. **Бюджет**\n   - половина\n2. Дизайн\n   до пятницы\n3. Сроки');
    expect(blocks.map((b) => (b.kind === 'list' ? `${b.ordered ? 'ol' : 'ul'}${b.start}` : b.kind))).toEqual([
      'ol1',
      'ul1',
      'ol2',
      'paragraph',
      'ol3',
    ]);
    expect(aiPlainText('1. Бюджет\n   - половина\n2. Дизайн')).toBe('1. Бюджет\n\n• половина\n\n2. Дизайн');
  });

  it('shows text that is still being written', () => {
    expect(parseAiMarkdown('### Гла')).toEqual([{ kind: 'heading', inline: [plain('Гла')] }]);
    expect(parseAiMarkdown('')).toEqual([]);
  });
});

describe('aiPlainText', () => {
  it('turns the markup into plain text with bullets and numbers', () => {
    expect(aiPlainText('### Главное\n- **Бюджет**: половина\n- Дизайн\n\n## Задачи\n1. Написать')).toBe(
      'Главное\n\n• Бюджет: половина\n• Дизайн\n\nЗадачи\n\n1. Написать',
    );
    expect(inlineText(parseInline('*а* **б**'))).toBe('а б');
  });
});
