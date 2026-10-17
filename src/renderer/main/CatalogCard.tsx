import { percent } from './transcription-format';

/** Пять делений: «точность», «качество» или «скорость». */
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

export interface CatalogCardProps {
  title: string;
  author: string;
  /** Пометка у названия: «Рекомендуется» или «оценка» (полоски примерные — пунктирная рамка). */
  tag: { text: string; estimate: boolean } | null;
  bars: { label: string; value: number }[];
  description: string;
  /** Предупреждение цветом под описанием. */
  warning: string | null;
  languages: string;
  /** Размер: «671 МБ», «скачана · 5,3 ГБ». */
  sizeText: string;
  installed: boolean;
  selected: boolean;
  /** Скачивается эта модель: подпись и доля 0…1; cancellable: false — качает очередь расшифровки, «Отменить» нет. */
  download: { text: string; fraction: number; cancellable?: boolean } | null;
  /** Последнее скачивание не удалось — причина. */
  error: string | null;
  /** «Скачать» — после сбоя «Повторить»; имя для экранного диктора. */
  downloadButton: { text: string; label: string };
  /** Скачивается другая модель — «Скачать» ждёт. */
  otherDownload: boolean;
  /** «Удалить» недоступна: модели заняты (расшифровка, ответ модели, скачивание). */
  deleteDisabled: boolean;
  /** Мелкая строка под карточкой. */
  note: string | null;
  onSelect(): void;
  onDownload(): void;
  onCancel(): void;
  onDelete(): void;
}

/**
 * Карточка модели в каталоге (расшифровки или для итогов): название, автор, полоски, описание, языки, размер и
 * действия по состоянию.
 */
export function CatalogCard(props: CatalogCardProps) {
  const { title, download, error, installed, selected } = props;
  const value = download ? percent(download.fraction) : 0;
  return (
    <article className={selected ? 'mcard on' : 'mcard'} aria-label={title}>
      <div className="mcard-top">
        <div className="mcard-name">
          <b>{title}</b>
          <span className="by">{props.author}</span>
          {props.tag && <span className={props.tag.estimate ? 'tag est' : 'tag'}>{props.tag.text}</span>}
        </div>
        <div className="mcard-bars">
          {props.bars.map((bar) => (
            <Pips key={bar.label} label={bar.label} value={bar.value} />
          ))}
        </div>
      </div>
      <p className="mcard-desc">{props.description}</p>
      {props.warning && <p className="mcard-warn">{props.warning}</p>}
      {download && (
        <div className="mcard-progress">
          {/* Без role="status": счётчик меняется дважды в секунду, диктору хватает полоски ниже. */}
          <span>{download.text}</span>
          <span
            className="prog"
            role="progressbar"
            aria-label={`Скачивание: ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <i style={{ width: `${value}%` }} />
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <div className="mcard-foot">
        <span>{props.languages}</span>
        <span>{props.sizeText}</span>
        <div className="mcard-acts">
          {download ? (
            download.cancellable !== false && (
              <button type="button" className="btn" onClick={props.onCancel}>
                Отменить
              </button>
            )
          ) : (
            <>
              {!installed && (
                <button
                  type="button"
                  className="btn"
                  disabled={props.otherDownload}
                  aria-label={props.downloadButton.label}
                  onClick={props.onDownload}
                >
                  {props.downloadButton.text}
                </button>
              )}
              {installed && !selected && (
                <button type="button" className="btn" aria-label={`Выбрать: ${title}`} onClick={props.onSelect}>
                  Выбрать
                </button>
              )}
              {installed && (
                <button
                  type="button"
                  className="lnk"
                  disabled={props.deleteDisabled}
                  aria-label={`Удалить: ${title}`}
                  onClick={props.onDelete}
                >
                  Удалить
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {props.note && <small className="mcard-note">{props.note}</small>}
    </article>
  );
}
