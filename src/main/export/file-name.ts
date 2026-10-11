// Имя файла выгрузки по названию встречи — такое, что его примут и Windows, и macOS.

/** Не больше стольких символов в имени без расширения: путь к «Документам» тоже занимает место. */
const MAX_NAME_CHARS = 120;
/** macOS разрешает имя не длиннее 255 байт UTF-8 (с расширением): 120 эмодзи или иероглифов туда не влезают. */
const MAX_NAME_BYTES = 255;
const FALLBACK_NAME = 'Встреча';
/** Запрещённые в именах файлов Windows (на macOS — «/» и «:») и управляющие символы. */
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
/** Имена устройств Windows: файл «CON.txt» или «con.report.docx» создать нельзя — важна часть до первой точки. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

const trimEnds = (name: string): string => name.replace(/^[.\s]+|[.\s]+$/g, '');

/** Начало имени не длиннее max байт UTF-8 — по целым символам. */
function fitBytes(name: string, max: number): string {
  let out = '';
  let bytes = 0;
  for (const char of name) {
    bytes += Buffer.byteLength(char, 'utf8');
    if (bytes > max) break;
    out += char;
  }
  return out;
}

export function exportFileName(title: string, ext: 'docx' | 'txt'): string {
  let name = trimEnds(title.replace(FORBIDDEN, ' ').replace(/\s+/g, ' '));
  // По символам, а не по UTF-16: эмодзи не режется пополам.
  name = trimEnds(Array.from(name).slice(0, MAX_NAME_CHARS).join(''));
  if (name === '') name = FALLBACK_NAME;
  if (RESERVED.test(name)) name = `_${name}`;
  name = trimEnds(fitBytes(name, MAX_NAME_BYTES - Buffer.byteLength(`.${ext}`, 'utf8')));
  return `${name}.${ext}`;
}
