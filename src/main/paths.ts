import { join } from 'node:path';

export const LIBRARY_FOLDER_NAME = 'TextMeet';

/** Папка библиотеки: из настроек или ~/TextMeet (вне облачных папок). */
export function resolveLibraryDir(fromSettings: string | null, homeDir: string): string {
  return fromSettings ?? join(homeDir, LIBRARY_FOLDER_NAME);
}
