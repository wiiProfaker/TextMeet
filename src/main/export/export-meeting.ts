// «Скопировать всё» и «Сохранить…» (решения Плана 5, §2.3, §4.6) и «Скопировать для ИИ» (решения Плана 6, §3.2): текст
// берётся из файлов встречи на диске — с правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import type { AiSummary } from '../../shared/ai';
import { resolveAiPrompt, withAiPrompt } from '../../shared/ai-prompt';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { readAi } from '../ai/ai-store';
import { writeFileAtomic, type RenameFn } from '../fs/atomic-write';
import { FILE_BUSY_REASON, humanFsError } from '../fs/fs-errors';
import { readMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import { toDocx } from './docx';
import { exportFileName } from './file-name';

export const exportTexts = {
  noText: 'У встречи пока нет текста — выгружать нечего.',
  unreadable: 'Не удалось прочитать текст встречи.',
  notBuilt: 'Не удалось собрать файл — подробности в журнале.',
} as const;

export interface ExportDeps {
  libraryDir(): string;
  /** Окно сохранения системы; null — человек передумал. */
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и (если есть) оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html?: string }): Promise<void>;
  /**
   * «Запрос для ИИ» из настроек (null — стандартный, '' — без запроса) — после уже начатых сохранений настроек:
   * запрос, набранный перед уходом из настроек, успевает попасть в копию.
   */
  aiPrompt(): Promise<string | null>;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
  /** Файл с дописанным расширением уже есть: заменить? (окно сохранения спрашивало про имя без расширения). */
  confirmReplace(path: string): Promise<boolean>;
  /** Переименование временного файла поверх выгрузки (в тестах — сбой); по умолчанию — системное. */
  rename?: RenameFn;
  documentsDir(): string;
  platform: string;
  logger: Pick<Logger, 'warn'>;
}

/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

/** Итоги для выгрузки; файла нет или он не читается — выгрузка без итогов (текст встречи важнее). */
async function summaryOf(libraryDir: string, meetingId: string, logger?: Pick<Logger, 'warn'>): Promise<AiSummary | null> {
  try {
    return (await readAi(libraryDir, meetingId)).doc.summary;
  } catch (err) {
    logger?.warn('Итоги встречи не прочитались — выгрузка без них', err);
    return null;
  }
}

/**
 * Встреча для выгрузки и для модели итогов: текст с правками и именами спикеров; нет текста — понятная ошибка.
 * withSummary — с итогами в начале (Word, .txt, «Скопировать всё»); модели и «Скопировать для ИИ» — без них.
 */
export async function loadExportDoc(
  libraryDir: string,
  meetingId: string,
  withSummary = false,
  logger?: Pick<Logger, 'warn'>,
): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
    const transcript = await readTranscript(libraryDir, meetingId);
    const summary = withSummary ? await summaryOf(libraryDir, meetingId, logger) : null;
    doc = transcript ? buildExportDoc(meeting, transcript, summary) : null;
  } catch (err) {
    throw new Error(exportTexts.unreadable, { cause: err });
  }
  if (!doc || doc.paragraphs.length === 0) throw new Error(exportTexts.noText);
  return doc;
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId, true, deps.logger);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

/** «Скопировать для ИИ»: запрос и текст встречи — только простым текстом (чаты вставляют его без лишнего оформления). */
export async function copyForAi(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId);
  const prompt = resolveAiPrompt(await deps.aiPrompt());
  await deps.writeClipboard({ text: withAiPrompt(prompt, toPlainText(doc)) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
  if (format === 'docx') return toDocx(doc);
  return BOM + toPlainText(doc, platform === 'win32' ? '\r\n' : '\n');
}

/** Папка последнего сохранения, если она ещё есть; иначе (удалена, отключённый диск) — «Документы». */
async function startDir(deps: ExportDeps): Promise<string> {
  const last = deps.exportDir();
  const isFolder = last !== null && (await fsp.stat(last).then((stat) => stat.isDirectory(), () => false));
  return isFolder ? last : deps.documentsDir();
}

const exists = (path: string): Promise<boolean> => fsp.stat(path).then(() => true, () => false);

/**
 * Окно сохранения → файл. Окно спросило про замену только того имени, которое вернуло: если расширение дописали мы и
 * такой файл уже есть — спрашиваем сами. Запись атомарная (временный файл → переименование): при сбое прежний файл
 * цел, полуфайла нет.
 */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadExportDoc(deps.libraryDir(), meetingId, true, deps.logger);
  const dir = await startDir(deps);
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
  const appended = extname(picked).toLowerCase() !== `.${format}`;
  const path = appended ? `${picked}.${format}` : picked;
  if (appended && (await exists(path)) && !(await deps.confirmReplace(path))) return { saved: false };
  let data: Uint8Array | string;
  try {
    data = await fileData(doc, format, deps.platform);
  } catch (err) {
    throw new Error(exportTexts.notBuilt, { cause: err });
  }
  try {
    await writeFileAtomic(path, data, deps.rename);
  } catch (err) {
    // Временный файл рядом записался, а заменить им прежний не дали — прежний открыт в другой программе (Word).
    const code = (err as NodeJS.ErrnoException).code;
    if ((code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') && (await exists(path))) {
      throw new Error(`Не удалось сохранить файл: ${FILE_BUSY_REASON}`, { cause: err });
    }
    throw humanFsError('Не удалось сохранить файл', err);
  }
  // Файл уже сохранён — неудача с настройками только в журнал.
  await deps
    .rememberExportDir(dirname(path))
    .catch((err: unknown) => deps.logger.warn('Папка выгрузки не запомнилась', err));
  return { saved: true };
}
