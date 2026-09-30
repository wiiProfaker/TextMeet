import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger, describeError, formatLogLine } from './logger';
import { makeTempDir } from '../test-support/temp-dir';

const fixedNow = () => new Date('2026-09-27T10:00:00.000Z');
const logFile = () => join(makeTempDir('textmeet-log-'), 'logs', 'textmeet.log');

describe('formatLogLine', () => {
  it('formats time, level and message', () => {
    expect(formatLogLine('INFO', 'запуск', undefined, fixedNow())).toBe('2026-09-27T10:00:00.000Z INFO запуск\n');
  });

  it('appends error details', () => {
    const line = formatLogLine('ERROR', 'сбой', 'plain text', fixedNow());
    expect(line).toBe('2026-09-27T10:00:00.000Z ERROR сбой | plain text\n');
  });
});

describe('describeError', () => {
  it('uses the stack for Error objects', () => {
    const err = new Error('boom');
    expect(describeError(err)).toContain('boom');
  });

  it('adds the causes: the raw reason behind a message for people stays in the log', () => {
    const path = String.raw`C:\m\verified.json`;
    const raw = Object.assign(new Error(`EPERM: operation not permitted, open '${path}'`), { code: 'EPERM' });
    const text = describeError(new Error('Не удалось сохранить модель', { cause: new Error('обёртка', { cause: raw }) }));
    expect(text).toContain('Не удалось сохранить модель');
    expect(text).toContain('Причина: Error: обёртка');
    expect(text).toContain(`Причина: Error: EPERM: operation not permitted, open '${path}'`);
    expect(describeError(new Error('сбой процесса', { cause: 'ffmpeg: Invalid data' }))).toContain('Причина: ffmpeg: Invalid data');
  });

  it('stops at a cause that refers back to itself', () => {
    const err = new Error('петля');
    (err as { cause?: unknown }).cause = err;
    expect(describeError(err).match(/Причина/g)?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it('falls back to name and message when there is no stack', () => {
    const err = new Error('boom');
    err.stack = undefined;
    expect(describeError(err)).toBe('Error: boom');
  });
});

describe('createLogger', () => {
  it('creates the folder and appends lines in order', async () => {
    const file = logFile();
    const logger = createLogger(file, { now: fixedNow });
    logger.info('один');
    logger.warn('два');
    logger.error('три', new Error('x'));
    await logger.flush();
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines[0]).toBe('2026-09-27T10:00:00.000Z INFO один');
    expect(lines[1]).toBe('2026-09-27T10:00:00.000Z WARN два');
    expect(lines[2]).toMatch(/^2026-09-27T10:00:00.000Z ERROR три \| Error: x/);
  });

  it('rotates the file when it grows past the limit', async () => {
    const file = logFile();
    const logger = createLogger(file, { now: fixedNow, maxBytes: 80 });
    logger.info('первая строка журнала');
    logger.info('вторая строка журнала');
    await logger.flush();
    expect(readFileSync(`${file}.1`, 'utf8')).toContain('первая');
    expect(readFileSync(file, 'utf8')).toContain('вторая');
    expect(readFileSync(file, 'utf8')).not.toContain('первая');
  });

  it('keeps writing to the same file when rotation fails', async () => {
    const file = logFile();
    const logger = createLogger(file, { now: fixedNow, maxBytes: 80 });
    logger.info('первая строка журнала');
    await logger.flush();
    // Место для копии занято непустой папкой — как будто файл держит антивирус.
    mkdirSync(`${file}.1`);
    writeFileSync(join(`${file}.1`, 'keep'), 'x');
    logger.info('вторая строка журнала');
    await logger.flush();
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('первая');
    expect(text).toContain('вторая');
  });

  it('keeps working when the log cannot be written', async () => {
    const dir = makeTempDir('textmeet-log-');
    // Путь проходит «через» файл — mkdir упадёт, логгер должен проглотить ошибку.
    const blocker = join(dir, 'blocker');
    const logger = createLogger(blocker, { now: fixedNow });
    logger.info('создаёт файл blocker');
    await logger.flush();
    const broken = createLogger(join(blocker, 'nested', 'x.log'), { now: fixedNow });
    broken.info('не запишется');
    await expect(broken.flush()).resolves.toBeUndefined();
    expect(existsSync(join(blocker, 'nested'))).toBe(false);
  });
});
