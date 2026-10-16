import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings';
import type { ModelGroupState } from '../../shared/transcription';
import type { ModelGroupId } from '../models/registry';
import { currentAiModel } from './ai-models';

function setup(installed: ModelGroupId[], aiModel: Settings['aiModel'], failSave = false) {
  let settings: Settings = { ...DEFAULT_SETTINGS, aiModel };
  const groups: (ModelGroupState & { id: ModelGroupId })[] = installed.map((id) => ({ id, sizeBytes: 1, installed: true }));
  const deps = {
    models: { state: async () => groups },
    settings: {
      get: () => settings,
      update: vi.fn(async (patch: Partial<Settings>) => {
        if (failSave) throw new Error('EBUSY');
        settings = { ...settings, ...patch };
        return settings;
      }),
    },
    logger: { warn: vi.fn() },
  };
  return { deps, settings: () => settings };
}

describe('currentAiModel', () => {
  it('selects the first downloaded model by itself and remembers it', async () => {
    const t = setup(['gigaam-v3-e2e-rnnt', 'qwen3.5-4b'], null);
    expect((await currentAiModel(t.deps)).selected).toBe('qwen3.5-4b');
    expect(t.settings().aiModel).toBe('qwen3.5-4b');
  });

  it('keeps the chosen model without writing the settings again', async () => {
    const t = setup(['qwen3.5-9b', 'qwen3.5-4b'], 'qwen3.5-4b');
    expect((await currentAiModel(t.deps)).selected).toBe('qwen3.5-4b');
    expect(t.deps.settings.update).not.toHaveBeenCalled();
  });

  it('forgets a deleted model: another downloaded one, or none', async () => {
    const other = setup(['t-lite-it-2.1'], 'qwen3.5-9b');
    expect((await currentAiModel(other.deps)).selected).toBe('t-lite-it-2.1');
    const none = setup([], 'qwen3.5-9b');
    expect((await currentAiModel(none.deps)).selected).toBeNull();
    expect(none.settings().aiModel).toBeNull();
  });

  it('still answers when the settings cannot be saved', async () => {
    const t = setup(['qwen3.5-9b'], null, true);
    const choice = await currentAiModel(t.deps);
    expect(choice.selected).toBe('qwen3.5-9b');
    expect(choice.groups).toHaveLength(1);
    expect(t.deps.logger.warn).toHaveBeenCalled();
  });
});
