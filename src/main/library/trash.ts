import { promises as fsp } from 'node:fs';
import { basename, join } from 'node:path';
import { knownFsReason } from '../fs/fs-errors';

/** Переносит файл или папку в Корзину системы (в программе — shell.trashItem). */
export type Trash = (path: string) => Promise<void>;

export const TRASH_ATTEMPTS = 3;
export const TRASH_RETRY_MS = 300;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * В Корзину — с повторами: OneDrive, антивирус и только что закрытый плеер ненадолго держат файлы. Не вышло —
 * ничего не удаляется насовсем, ошибка с понятной причиной.
 */
export async function moveToTrash(path: string, trash: Trash, retryMs = TRASH_RETRY_MS): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await trash(path);
      return;
    } catch (err) {
      if (attempt >= TRASH_ATTEMPTS) {
        // Текст системы может содержать путь — он остаётся в журнале (cause), человеку — понятная причина.
        const reason = knownFsReason(err) ?? 'файл занят другой программой или Корзина недоступна';
        throw new Error(`Не удалось переместить в Корзину: ${reason}`, { cause: err });
      }
      await wait(retryMs);
    }
  }
}

/**
 * «Корзина» автотестов (TEXTMEET_TEST_TRASH): перенос в обычную папку. На машинах CI настоящей Корзины может
 * не быть, а тестовые файлы в Корзине разработчика не нужны.
 */
export function folderTrash(dir: string): Trash {
  let counter = 0;
  return async (path) => {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(path, join(dir, `${++counter}-${basename(path)}`));
  };
}
