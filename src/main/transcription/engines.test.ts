import { describe, expect, it, vi } from 'vitest';
import { enginesByModel, latestByThreads } from './engines';
import { fakeEngines } from './fake-engines';

describe('enginesByModel', () => {
  it('loads the engines once per models folder and model, and again only when one of them changes', () => {
    const create = vi.fn((_modelsDir: string, _model: string) => fakeEngines());
    const enginesFor = enginesByModel(create);
    const first = enginesFor('M', 'gigaam-v3-e2e-rnnt');
    expect(enginesFor('M', 'gigaam-v3-e2e-rnnt')).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    const otherDir = enginesFor('N', 'gigaam-v3-e2e-rnnt');
    expect(otherDir).not.toBe(first);
    const otherModel = enginesFor('N', 't-one');
    expect(otherModel).not.toBe(otherDir);
    expect(enginesFor('N', 't-one')).toBe(otherModel);
    expect(create.mock.calls).toEqual([
      ['M', 'gigaam-v3-e2e-rnnt'],
      ['N', 'gigaam-v3-e2e-rnnt'],
      ['N', 't-one'],
    ]);
  });
});

describe('latestByThreads', () => {
  it('reuses the engine while the number of threads is the same and keeps only the latest one', () => {
    const create = vi.fn((threads: number) => ({ threads }));
    const engineFor = latestByThreads(create);
    const full = engineFor(7);
    expect(engineFor(7)).toBe(full);
    const recording = engineFor(2);
    expect(recording).toEqual({ threads: 2 });
    // Прежний движок не хранится: после записи он создаётся заново, а не лежит в памяти второй копией.
    const again = engineFor(7);
    expect(again).not.toBe(full);
    expect(engineFor(7)).toBe(again);
    expect(create.mock.calls.map(([threads]) => threads)).toEqual([7, 2, 7]);
  });
});
