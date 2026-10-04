import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withFileLock } from './file-lock';

const later = <T>(value: T, ms: number) => new Promise<T>((done) => setTimeout(() => done(value), ms));

describe('withFileLock', () => {
  it('runs the work of one file strictly in order', async () => {
    const order: string[] = [];
    await Promise.all([
      withFileLock('/lib/a.json', async () => order.push(await later('first', 20))),
      withFileLock('/lib/a.json', async () => order.push(await later('second', 1))),
      withFileLock(join('/lib', '.', 'a.json'), async () => order.push('third')),
    ]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('does not make different files wait for each other', async () => {
    const order: string[] = [];
    await Promise.all([
      withFileLock('/lib/a.json', async () => order.push(await later('slow', 20))),
      withFileLock('/lib/b.json', async () => order.push('fast')),
    ]);
    expect(order).toEqual(['fast', 'slow']);
  });

  it('reports a failed work and keeps serving the next ones', async () => {
    const failed = withFileLock('/lib/a.json', async () => {
      throw new Error('диск полон');
    });
    const next = withFileLock('/lib/a.json', async () => 'ok');
    await expect(failed).rejects.toThrow('диск полон');
    await expect(next).resolves.toBe('ok');
  });
});
