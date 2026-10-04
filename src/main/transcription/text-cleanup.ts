// Защита от «галлюцинаций» моделей (решения Плана 7, §4.3): на шуме Whisper и Qwen3 дописывают фразы из субтитров
// и зацикливаются. Применяется только к их тексту (asrModel(id).hallucinates): у других моделей «Продолжение
// следует» или «нет нет нет нет» — настоящая речь.

/** Кусок, целиком совпадающий с одной из фраз (без регистра, «ё» и знаков), — выдумка модели. */
const KNOWN_PHRASES = [
  'продолжение следует',
  'спасибо за просмотр',
  'подписывайтесь на канал',
  'ставьте лайки',
  'thank you for watching',
  'thanks for watching',
  'please subscribe',
];
/** Кусок, начинающийся с этих слов, — подпись из субтитров («Субтитры сделал DimaTorzok»). */
const KNOWN_PREFIXES = ['субтитры сделал', 'субтитры делал', 'субтитры создавал', 'субтитры подготовил', 'редактор субтитров'];
/** Одна и та же фраза из 2–8 слов подряд больше трёх раз — модель зациклилась; одно слово — больше шести раз. */
const MAX_PHRASE_WORDS = 8;
const MAX_REPEATS = 3;
const MAX_WORD_REPEATS = 6;
/** Одна буква подряд столько раз и больше («Эээээээээ») сокращается до трёх. */
const LETTER_RUN = 6;

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function isKnownPhrase(text: string): boolean {
  const plain = normalize(text);
  return KNOWN_PHRASES.includes(plain) || KNOWN_PREFIXES.some((prefix) => plain.startsWith(prefix));
}

/** Слова i…i+n и j…j+n совпадают (без регистра и знаков). */
function samePhrase(words: readonly string[], i: number, j: number, n: number): boolean {
  for (let k = 0; k < n; k++) if (normalize(words[i + k] ?? '') !== normalize(words[j + k] ?? '')) return false;
  return true;
}

/** Повторы фразы из n слов подряд больше MAX_REPEATS раз — одна фраза. */
function collapsePhrases(words: readonly string[], n: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < words.length) {
    let count = 1;
    while (i + (count + 1) * n <= words.length && samePhrase(words, i, i + count * n, n)) count += 1;
    if (count > (n === 1 ? MAX_WORD_REPEATS : MAX_REPEATS)) {
      result.push(...words.slice(i, i + n));
      i += count * n;
    } else {
      result.push(words[i]!);
      i += 1;
    }
  }
  return result;
}

/** Без учёта регистра: «Эээээ» — тоже одна буква подряд; остаются первые три (с прежним регистром). */
const shortenLetterRuns = (word: string): string =>
  word.replace(new RegExp(`(\\p{L})\\1{${LETTER_RUN - 1},}`, 'giu'), (run: string) => [...run].slice(0, 3).join(''));

/** Текст куска без выдуманных фраз и зацикливаний; пустая строка — кусок выбрасывается. */
export function cleanRecognizedText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '' || isKnownPhrase(trimmed)) return '';
  let words = trimmed.split(/\s+/).map(shortenLetterRuns);
  for (let n = 1; n <= MAX_PHRASE_WORDS; n++) words = collapsePhrases(words, n);
  return words.join(' ');
}
