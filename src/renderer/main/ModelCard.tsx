import { asrModel, DEFAULT_ASR_MODEL, type AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { downloadButton, downloadText, modelBars, modelState } from './model-catalog';
import { percent } from './transcription-format';

/** Пять делений: «точность» или «скорость». */
function Pips({ label, value }: { label: string; value: number }) {
  return (
    <div className="pips-row">
      <span>{label}</span>
      <span className="pips" role="meter" aria-label={label} aria-valuemin={1} aria-valuemax={5} aria-valuenow={value}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= value ? 'on' : undefined} />
        ))}
      </span>
    </div>
  );
}

export interface ModelCardActions {
  onSelect(id: AsrModelId): void;
  onDownload(id: AsrModelId): void;
  onCancel(id: AsrModelId): void;
  onDelete(id: ModelGroupId): void;
}

/** Карточка модели в каталоге: название, автор, описание, полоски, языки, размер и действия по состоянию. */
export function ModelCard({ id, state, actions }: { id: AsrModelId; state: ModelsState; actions: ModelCardActions }) {
  const info = asrModel(id);
  const { installed, sizeBytes } = modelState(state, id);
  const selected = state.selected === id;
  const download = state.download?.id === id ? state.download : null;
  const error = state.downloadError?.id === id ? state.downloadError.message : null;
  const bars = modelBars(id);
  const otherDownload = state.download !== null && !download;
  const downloadBtn = downloadButton(info.title, error !== null);

  return (
    <article className={selected ? 'mcard on' : 'mcard'} aria-label={info.title}>
      <div className="mcard-top">
        <div className="mcard-name">
          <b>{info.title}</b>
          <span className="by">{info.author}</span>
          {id === DEFAULT_ASR_MODEL && <span className="tag">Рекомендуется</span>}
        </div>
        <div className="mcard-bars">
          <Pips label="точность" value={bars.accuracy} />
          <Pips label="скорость" value={bars.speed} />
        </div>
      </div>
      <p className="mcard-desc">{info.description}</p>
      {info.group === 'en' && <p className="mcard-warn">Только английский — русская речь распознаётся неверно.</p>}
      {download && (
        <div className="mcard-progress">
          <span role="status">{downloadText(download.done, download.total)}</span>
          <span
            className="prog"
            role="progressbar"
            aria-label={`Скачивание: ${info.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent(download.total > 0 ? download.done / download.total : 0)}
          >
            <i style={{ width: `${percent(download.total > 0 ? download.done / download.total : 0)}%` }} />
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <div className="mcard-foot">
        <span>{info.languages}</span>
        <span>{installed ? `скачана · ${formatMegabytes(sizeBytes)}` : formatMegabytes(sizeBytes)}</span>
        <div className="mcard-acts">
          {download ? (
            <button type="button" className="btn" onClick={() => actions.onCancel(id)}>
              Отменить
            </button>
          ) : (
            <>
              {!installed && (
                <button
                  type="button"
                  className="btn"
                  disabled={otherDownload}
                  aria-label={downloadBtn.label}
                  onClick={() => actions.onDownload(id)}
                >
                  {downloadBtn.text}
                </button>
              )}
              {installed && !selected && (
                <button type="button" className="btn" aria-label={`Выбрать: ${info.title}`} onClick={() => actions.onSelect(id)}>
                  Выбрать
                </button>
              )}
              {installed && (
                <button
                  type="button"
                  className="lnk"
                  disabled={state.busy || state.download !== null}
                  aria-label={`Удалить: ${info.title}`}
                  onClick={() => actions.onDelete(id)}
                >
                  Удалить
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {selected && !installed && !download && <small className="mcard-note">Скачается при первой расшифровке.</small>}
    </article>
  );
}
