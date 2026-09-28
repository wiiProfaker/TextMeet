import { join } from 'node:path';

export const LIBRARY_FOLDER_NAME = 'TextMeet';
/** Версия для разработки держит данные и библиотеку отдельно от установленной программы. */
export const DEV_FOLDER_NAME = 'TextMeet-dev';

/** Папка библиотеки: из настроек или ~/TextMeet (вне облачных папок). */
export function resolveLibraryDir(
  fromSettings: string | null,
  homeDir: string,
  defaultFolderName: string = LIBRARY_FOLDER_NAME,
): string {
  return fromSettings ?? join(homeDir, defaultFolderName);
}
