// «Скопировать всё» и «Сохранить…» (решения Плана 5, §2.3, §4.6): текст берётся из файлов встречи на диске — с
// правками и именами спикеров.
import { promises as fsp } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { buildExportDoc, toHtml, toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ExportFormat } from '../../shared/ipc';
import { humanFsError } from '../fs/fs-errors';
import { readMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import { toDocx } from './docx';
import { exportFileName } from './file-name';

export const exportTexts = {
  noText: 'У встречи пока нет текста — выгружать нечего.',
  unreadable: 'Не удалось прочитать текст встречи.',
} as const;

export interface ExportDeps {
  libraryDir(): string;
  /** Окно сохранения системы; null — человек передумал. */
  chooseSavePath(defaultPath: string, format: ExportFormat): Promise<string | null>;
  /** Обычный и оформленный текст — в буфер обмена одной записью. */
  writeClipboard(data: { text: string; html: string }): Promise<void>;
  /** Папка последнего сохранения (настройки); null — ещё не сохраняли. */
  exportDir(): string | null;
  rememberExportDir(dir: string): Promise<unknown>;
  documentsDir(): string;
  platform: string;
  logger: Pick<Logger, 'warn'>;
}

/** Метка BOM: старый Блокнот и другие программы Windows узнают по ней UTF-8 (кириллицу). */
const BOM = '﻿';

async function loadDoc(libraryDir: string, meetingId: string): Promise<ExportDoc> {
  let doc: ExportDoc | null;
  try {
    const meeting = await readMeeting(libraryDir, meetingId);
    const transcript = await readTranscript(libraryDir, meetingId);
    doc = transcript ? buildExportDoc(meeting, transcript) : null;
  } catch (err) {
    throw new Error(exportTexts.unreadable, { cause: err });
  }
  if (!doc || doc.paragraphs.length === 0) throw new Error(exportTexts.noText);
  return doc;
}

export async function copyMeeting(deps: ExportDeps, meetingId: string): Promise<void> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  await deps.writeClipboard({ text: toPlainText(doc), html: toHtml(doc) });
}

async function fileData(doc: ExportDoc, format: ExportFormat, platform: string): Promise<Uint8Array | string> {
  if (format === 'docx') return toDocx(doc);
  return BOM + toPlainText(doc, platform === 'win32' ? '\r\n' : '\n');
}

/** Окно сохранения → файл. Не атомарно: файл, открытый в Word, даёт понятное «файл занят другой программой». */
export async function saveMeeting(deps: ExportDeps, meetingId: string, format: ExportFormat): Promise<{ saved: boolean }> {
  const doc = await loadDoc(deps.libraryDir(), meetingId);
  const dir = deps.exportDir() ?? deps.documentsDir();
  const picked = await deps.chooseSavePath(join(dir, exportFileName(doc.title, format)), format);
  if (picked === null) return { saved: false };
  const path = extname(picked).toLowerCase() === `.${format}` ? picked : `${picked}.${format}`;
  try {
    await fsp.writeFile(path, await fileData(doc, format, deps.platform));
  } catch (err) {
    throw humanFsError('Не удалось сохранить файл', err);
  }
  // Файл уже сохранён — неудача с настройками только в журнал.
  await deps
    .rememberExportDir(dirname(path))
    .catch((err: unknown) => deps.logger.warn('Папка выгрузки не запомнилась', err));
  return { saved: true };
}
