// Модель для итогов: какая выбрана и скачана (решения Плана 9, §2.1). Выбор, который сделала сама программа (первая
// скачанная модель, замена удалённой), запоминается в настройках.
import { effectiveAiModel, isLlmModelId, type LlmModelId } from '../../shared/llm-models';
import type { ModelGroupState } from '../../shared/transcription';
import type { Logger } from '../logger';
import type { ModelStore } from '../models/model-manager';
import type { ModelGroupId } from '../models/registry';
import type { SettingsStore } from '../settings/settings-store';

export interface AiModelDeps {
  models: Pick<ModelStore, 'state'>;
  settings: Pick<SettingsStore, 'get' | 'update'>;
  logger: Pick<Logger, 'warn'>;
}

export interface AiModelChoice {
  /** Все группы моделей с диска — для каталога. */
  groups: (ModelGroupState & { id: ModelGroupId })[];
  /** Модель для итогов; null — ни одной не скачано. */
  selected: LlmModelId | null;
}

/** Скачанные модели и модель для итогов; новый выбор программы — в настройки (не записался — только в журнал). */
export async function currentAiModel(deps: AiModelDeps): Promise<AiModelChoice> {
  const groups = await deps.models.state();
  const installed = groups.flatMap((g) => (g.installed && isLlmModelId(g.id) ? [g.id] : []));
  const stored = deps.settings.get().aiModel;
  const selected = effectiveAiModel(stored, installed);
  if (selected !== stored) {
    await deps.settings
      .update({ aiModel: selected })
      .catch((err: unknown) => deps.logger.warn('Модель для итогов не запомнилась в настройках', err));
  }
  return { groups, selected };
}
