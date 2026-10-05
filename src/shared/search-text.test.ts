import { describe, expect, it } from 'vitest';
import { findRanges, isSearchable, matchesAll, normalize, queryWords, snippet, splitByRanges } from './search-text';

const marked = (text: string, ranges: { start: number; end: number }[]) =>
  splitByRanges(text, ranges)
    .map((p) => (p.mark ? `[${p.text}]` : p.text))
    .join('');

describe('normalize', () => {
  it('ignores case and «ё»', () => {
    expect(normalize('Ёлка ЁЖ Бюджет')).toBe('елка еж бюджет');
  });

  it('keeps the length, so positions match the original text', () => {
    // «İ» в нижнем регистре — два символа: такой символ не меняется.
    const text = 'İstanbul Ёж 🙂 ok';
    expect(normalize(text)).toHaveLength(text.length);
    expect(normalize(text)).toBe('İstanbul еж 🙂 ok');
  });

  it('gives the same result on a text without length-changing letters', () => {
    expect(normalize('ПРИВЕТ Ёж 🙂 OK')).toBe('привет еж 🙂 ok');
  });
});

describe('queryWords', () => {
  it('splits, normalizes, drops punctuation at the edges and repeats', () => {
    expect(queryWords('  Бюджет, на   «октябрь» бюджет ')).toEqual(['бюджет', 'на', 'октябрь']);
  });

  it('keeps punctuation inside a word', () => {
    expect(queryWords('e-mail 3.5')).toEqual(['e-mail', '3.5']);
  });

  it('gives nothing for a query of punctuation only', () => {
    expect(queryWords(' ?! — ')).toEqual([]);
  });
});

describe('isSearchable', () => {
  it('needs a word of at least two letters', () => {
    expect(isSearchable('б')).toBe(false);
    expect(isSearchable(' б, ')).toBe(false);
    expect(isSearchable('а б')).toBe(false);
    expect(isSearchable('бю')).toBe(true);
    expect(isSearchable('в бюджет')).toBe(true);
  });
});

describe('matchesAll', () => {
  it('needs every word, as a part of a word, in any order', () => {
    const text = normalize('По бюджету на октябрь осталась половина.');
    expect(matchesAll(text, queryWords('октябрь бюджет'))).toBe(true);
    expect(matchesAll(text, queryWords('бюдж'))).toBe(true);
    expect(matchesAll(text, queryWords('бюджет ноябрь'))).toBe(false);
  });

  it('finds nothing for no words', () => {
    expect(matchesAll('текст', [])).toBe(false);
  });
});

describe('findRanges', () => {
  it('skips an empty word instead of looping forever', () => {
    expect(findRanges('абв', ['', 'б'])).toEqual([{ start: 1, end: 2 }]);
  });

  it('finds every occurrence of every word in the original positions', () => {
    const text = 'Бюджет и ещё раз бюджет. Ёлки!';
    const ranges = findRanges(normalize(text), queryWords('бюджет елки'));
    expect(marked(text, ranges)).toBe('[Бюджет] и ещё раз [бюджет]. [Ёлки]!');
  });

  it('merges overlapping and adjacent matches', () => {
    expect(findRanges('абвгд', ['абв', 'бвг', 'д'])).toEqual([{ start: 0, end: 5 }]);
  });
});

describe('splitByRanges', () => {
  it('returns the whole text when nothing is marked', () => {
    expect(splitByRanges('текст', [])).toEqual([{ text: 'текст', mark: false }]);
  });

  it('ignores ranges outside the text', () => {
    expect(marked('абв', [{ start: 1, end: 9 }, { start: 5, end: 6 }])).toBe('а[бв]');
  });
});

describe('snippet', () => {
  it('returns a short text as it is', () => {
    expect(snippet('Короткий бюджет.', [{ start: 9, end: 15 }])).toEqual({
      text: 'Короткий бюджет.',
      ranges: [{ start: 9, end: 15 }],
    });
  });

  it('cuts a long text around the first match without cutting words', () => {
    const text =
      'Сначала мы долго обсуждали отпуск и погоду, потом наконец перешли к делу: по бюджету на октябрь у нас ' +
      'остаётся примерно половина от того, что планировали, а подрядчики считаются отдельно.';
    const ranges = findRanges(normalize(text), ['бюджет']);
    const cut = snippet(text, ranges, 80);
    expect(cut.text.startsWith('…')).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(82);
    expect(marked(cut.text, cut.ranges)).toContain('по [бюджет]у на октябрь');
    // Слова не разрезаны: после «…» — начало слова, перед «…» — конец слова.
    const words = text.split(/\s+/);
    const inner = cut.text.slice(1, -1).split(' ');
    expect(words).toContain(inner[0]);
    expect(words).toContain(inner.at(-1));
  });

  it('starts at the beginning when the match is near it', () => {
    const text = `Бюджет ${'и ещё немного слов '.repeat(10)}конец.`;
    const cut = snippet(text, [{ start: 0, end: 6 }], 40);
    expect(cut.text.startsWith('Бюджет')).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.ranges).toEqual([{ start: 0, end: 6 }]);
  });

  it('ends at the end when the match is near it', () => {
    const text = `${'слово и ещё слово '.repeat(10)}про бюджет`;
    const at = text.indexOf('бюджет');
    const cut = snippet(text, [{ start: at, end: at + 6 }], 40);
    expect(cut.text.endsWith('про бюджет')).toBe(true);
    expect(marked(cut.text, cut.ranges).endsWith('[бюджет]')).toBe(true);
  });

  it('cuts from the beginning when there is no match (a title match only)', () => {
    const cut = snippet('слово '.repeat(30), [], 20);
    expect(cut.text.startsWith('слово')).toBe(true);
    expect(cut.ranges).toEqual([]);
  });
});
