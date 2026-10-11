// Тексты импорта для окна (решения Плана 5, §2.1–2.2): чистые функции — проверяются модульными тестами.
import type { ImportFailedEvent, ImportFailure, ImportProgress, ImportResult } from '../../shared/import';
import { pluralize } from './format';
import { percent } from './transcription-format';

/** Сколько неудач перечислять по имени; остальные — «и ещё N». */
const LISTED_FAILURES = 3;

const failureText = (failure: ImportFailure): string => `«${failure.name}»: ${failure.reason}`;

/**
 * Итог добавления файлов для строки ошибки слева; null — всё добавилось. «Не удалось добавить «отчёт.pdf»: в файле
 * нет звука.»; если что-то добавилось — сначала «Добавлено 2 файла из 3.» («Добавлен 1 файл из 2.»).
 */
export function importResultText(result: ImportResult): string | null {
  const { added, failed } = result;
  if (failed.length === 0) return null;
  const total = added.length + failed.length;
  const listed = failed.slice(0, LISTED_FAILURES).map(failureText).join('; ');
  const rest = failed.length - LISTED_FAILURES;
  const more = rest > 0 ? ` и ещё ${rest} ${pluralize(rest, 'файл', 'файла', 'файлов')}` : '';
  const files = `${added.length} ${pluralize(added.length, 'файл', 'файла', 'файлов')}`;
  const verb = pluralize(added.length, 'Добавлен', 'Добавлено', 'Добавлено');
  const head = added.length > 0 ? `${verb} ${files} из ${total}. ` : '';
  return `${head}Не удалось добавить ${listed}${more}.`;
}

/** Звук файла не скопировался (уже после создания встречи). */
export const importFailedText = (failure: ImportFailure): string => `Не удалось добавить ${failureText(failure)}.`;

/**
 * Что строка ошибки говорит об импорте: итог последнего добавления с отказами и все сообщения о нескопированном звуке
 * после него (копирование идёт в фоне и может не выйти и до итога, и после). failedIds — встречи, чей звук не
 * скопировался (main их уже убрал).
 */
export interface ImportNotes {
  result: string | null;
  failedIds: ReadonlySet<string>;
  copyFailures: readonly string[];
}

export const NO_IMPORT_NOTES: ImportNotes = { result: null, failedIds: new Set(), copyFailures: [] };

export const importNotesText = (notes: ImportNotes): string =>
  [notes.result, ...notes.copyFailures].filter((text) => text !== null).join(' ');

/** Звук ещё одного файла не скопировался: его сообщение — к прежним, а не вместо них. */
export const withCopyFailure = (notes: ImportNotes, failure: ImportFailedEvent): ImportNotes => ({
  ...notes,
  failedIds: new Set([...notes.failedIds, failure.meetingId]),
  copyFailures: [...notes.copyFailures, importFailedText(failure)],
});

export interface ImportOutcome {
  /** Какую встречу открыть; null — никакую. */
  open: string | null;
  notes: ImportNotes;
  /** Строка ошибки; null — не трогать (отказов нет). */
  message: string | null;
}

/** Итог добавления для окна: открыть первую добавленную встречу, которая ещё есть; отказы — к сообщениям о звуке. */
export function importOutcome(result: ImportResult, notes: ImportNotes): ImportOutcome {
  const open = result.added.find((id) => !notes.failedIds.has(id)) ?? null;
  const text = importResultText(result);
  if (!text) return { open, notes, message: null };
  const next = { ...notes, result: text };
  return { open, notes: next, message: importNotesText(next) };
}

export interface ImportView {
  text: string;
  note: string;
  /** Проценты для полоски; null — полоски нет (ждёт очереди или длительность неизвестна). */
  value: number | null;
}

/** Ход импорта во встрече: «Копируем звук из файла» · «Созвон.mp4 · 35%» или «Ждёт очереди». */
export function importView(fileName: string | null, progress: ImportProgress | null): ImportView {
  const name = `«${fileName ?? 'файл'}»`;
  if (progress?.waiting) {
    return { text: 'Ждёт очереди', note: `${name} — сначала копируются файлы, добавленные раньше`, value: null };
  }
  if (!progress || progress.fraction === null) return { text: 'Копируем звук из файла', note: name, value: null };
  const value = percent(progress.fraction);
  return { text: 'Копируем звук из файла', note: `${name} · ${value}%`, value };
}
