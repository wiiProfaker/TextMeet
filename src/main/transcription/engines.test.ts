import { describe, expect, it, vi } from 'vitest';
import { enginesByModelsDir, latestByThreads } from './engines';
import { fakeEngines } from './fake-engines';

describe('enginesByModelsDir', () => {
  it('loads the engines once per models folder and again only when the folder changes', () => {
    const create = vi.fn((_modelsDir: string) => fakeEngines());
    const enginesFor = enginesByModelsDir(create);
    const first = enginesFor('M');
    expect(enginesFor('M')).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    const other = enginesFor('N');
    expect(other).not.toBe(first);
    expect(enginesFor('N')).toBe(other);
    expect(create.mock.calls.map(([dir]) => dir)).toEqual(['M', 'N']);
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
