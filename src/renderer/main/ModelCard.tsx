import { asrModel, DEFAULT_ASR_MODEL, type AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { CatalogCard } from './CatalogCard';
import { downloadButton, downloadText, modelBars, modelState } from './model-catalog';

export interface ModelCardActions {
  onSelect(id: AsrModelId): void;
  onDownload(id: AsrModelId): void;
  onCancel(id: AsrModelId): void;
  onDelete(id: ModelGroupId): void;
}

/** Карточка модели расшифровки (решения Плана 7, §2). */
export function ModelCard({ id, state, actions }: { id: AsrModelId; state: ModelsState; actions: ModelCardActions }) {
  const info = asrModel(id);
  const { installed, sizeBytes } = modelState(state, id);
  const selected = state.selected === id;
  const download = state.download?.id === id ? state.download : null;
  const bars = modelBars(id);
  return (
    <CatalogCard
      title={info.title}
      author={info.author}
      tag={id === DEFAULT_ASR_MODEL ? { text: 'Рекомендуется', estimate: false } : null}
      bars={[
        { label: 'точность', value: bars.accuracy },
        { label: 'скорость', value: bars.speed },
      ]}
      description={info.description}
      warning={info.group === 'en' ? 'Только английский — русская речь распознаётся неверно.' : null}
      languages={info.languages}
      sizeText={installed ? `скачана · ${formatMegabytes(sizeBytes)}` : formatMegabytes(sizeBytes)}
      installed={installed}
      selected={selected}
      download={
        download && {
          text: downloadText(download.done, download.total),
          fraction: download.total > 0 ? download.done / download.total : 0,
        }
      }
      error={state.downloadError?.id === id ? state.downloadError.message : null}
      downloadButton={downloadButton(info.title, state.downloadError?.id === id)}
      otherDownload={state.download !== null && !download}
      deleteDisabled={state.busy || state.download !== null}
      note={selected && !installed && !download ? 'Скачается при первой расшифровке.' : null}
      onSelect={() => actions.onSelect(id)}
      onDownload={() => actions.onDownload(id)}
      onCancel={() => actions.onCancel(id)}
      onDelete={() => actions.onDelete(id)}
    />
  );
}
