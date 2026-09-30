import { describe, expect, it, vi } from 'vitest';
import { enginesByModelsDir } from './engines';
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
