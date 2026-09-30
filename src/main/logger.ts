import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';

// Правило: в журнал не пишем текст встреч и ключи API — только события и ошибки.
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string): void;
  warn(message: string, err?: unknown): void;
  error(message: string, err?: unknown): void;
  /** Дожидается записи всех строк (для тестов и перед выходом). */
  flush(): Promise<void>;
}

export const MAX_LOG_BYTES = 5 * 1024 * 1024;

/** Глубже причины не разворачиваются: цепочка может замыкаться сама на себя. */
const MAX_CAUSES = 5;

/**
 * Ошибка для журнала вместе с причинами (cause): человеку показывают понятный текст, а исходная системная
 * ошибка (код, путь) остаётся здесь.
 */
export function describeError(err: unknown): string {
  const lines: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth <= MAX_CAUSES; depth++) {
    const text = current instanceof Error ? (current.stack ?? `${current.name}: ${current.message}`) : String(current);
    lines.push(depth === 0 ? text : `Причина: ${text}`);
    if (!(current instanceof Error) || current.cause === undefined) break;
    current = current.cause;
  }
  return lines.join('\n');
}

export function formatLogLine(level: LogLevel, message: string, err: unknown, now: Date): string {
  const detail = err === undefined ? '' : ` | ${describeError(err)}`;
  return `${now.toISOString()} ${level} ${message}${detail}\n`;
}

export interface LoggerOptions {
  maxBytes?: number;
  now?: () => Date;
}

export function createLogger(file: string, options: LoggerOptions = {}): Logger {
  const maxBytes = options.maxBytes ?? MAX_LOG_BYTES;
  const now = options.now ?? (() => new Date());
  let queue: Promise<void> = Promise.resolve();

  const write = (level: LogLevel, message: string, err?: unknown): void => {
    const line = formatLogLine(level, message, err, now());
    queue = queue
      .then(() => appendWithRotation(file, line, maxBytes))
      .catch((writeErr: unknown) => {
        // Журнал не должен ронять программу; сообщить об ошибке журнала больше некуда.
        console.error('TextMeet: не удалось записать журнал', writeErr);
      });
  };

  return {
    info: (message) => write('INFO', message),
    warn: (message, err) => write('WARN', message, err),
    error: (message, err) => write('ERROR', message, err),
    flush: () => queue,
  };
}

async function appendWithRotation(file: string, line: string, maxBytes: number): Promise<void> {
  await fsp.mkdir(dirname(file), { recursive: true });
  const size = await fsp.stat(file).then(
    (stat) => stat.size,
    () => 0,
  );
  if (size > 0 && size + Buffer.byteLength(line) > maxBytes) {
    // Файл может ненадолго держать антивирус или OneDrive: тогда пишем дальше в тот же файл,
    // а повернуть журнал попробуем при следующей строке.
    await rotate(file).catch((err: unknown) => console.error('TextMeet: не удалось повернуть журнал', err));
  }
  await fsp.appendFile(file, line, 'utf8');
}

async function rotate(file: string): Promise<void> {
  await fsp.rm(`${file}.1`, { force: true });
  await fsp.rename(file, `${file}.1`);
}
