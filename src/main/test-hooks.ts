// Тестовые подмены (переменные окружения TEXTMEET_*): поддельные движки, свои папки данных, поддельный микрофон.
// Действуют только в разработке и в тестовой копии сборки — в выпуске, который получают люди, случайно заданная
// переменная ничего не меняет (решения Плана 8, §5.1).
import { join } from 'node:path';

/** Файл-признак тестовой копии сборки (кладёт scripts/make-test-copy.mjs в resources/). */
export const TEST_BUILD_MARKER = 'textmeet-test-build';

const TEST_PREFIX = 'TEXTMEET_';

export interface TestHooksContext {
  packaged: boolean;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
  exists(path: string): boolean;
}

/** Подмены разрешены: разработка (не собранная программа) или тестовая копия сборки (есть признак). */
export function testHooksAllowed(ctx: TestHooksContext): boolean {
  return !ctx.packaged || ctx.exists(join(ctx.resourcesPath, TEST_BUILD_MARKER));
}

/** Только переменные TEXTMEET_* и только если подмены разрешены; иначе — пустой объект. */
export function testEnv(ctx: TestHooksContext): Readonly<Record<string, string>> {
  if (!testHooksAllowed(ctx)) return {};
  return Object.fromEntries(
    Object.entries(ctx.env).filter(
      (entry): entry is [string, string] => entry[0].startsWith(TEST_PREFIX) && entry[1] !== undefined,
    ),
  );
}
