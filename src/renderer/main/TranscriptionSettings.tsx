import type { AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { useModelCatalog } from './hooks';
import { catalogSections } from './model-catalog';
import { ModelCard, type ModelCardActions } from './ModelCard';

/** Перечитывать каталог: скачивание продвинулось или закончилось, расшифровка началась или закончилась. */
function watchModels(reload: () => void): () => void {
  const unsubscribeModels = window.textmeet.onModelsChanged(reload);
  // Расшифровка началась или закончилась (и модели могли скачаться) — перечитать.
  let busy: boolean | null = null;
  const unsubscribeProgress = window.textmeet.onTranscriptionProgress((list) => {
    const nowBusy = list.length > 0;
    if (nowBusy !== busy) reload();
    busy = nowBusy;
  });
  return () => {
    unsubscribeModels();
    unsubscribeProgress();
  };
}

/** Вкладка настроек «Расшифровка»: каталог моделей (решения Плана 7, §2) и общие модели голосов. */
export function TranscriptionSettings() {
  const { state: models, error, run } = useModelCatalog<ModelsState>(() => window.textmeet.getModels(), watchModels);

  const actions: ModelCardActions = {
    onSelect: (id: AsrModelId) => run(() => window.textmeet.selectModel(id)),
    onDownload: (id: AsrModelId) => run(() => window.textmeet.downloadModel(id)),
    onCancel: (id: AsrModelId) => run(() => window.textmeet.cancelModelDownload(id)),
    onDelete: (id: ModelGroupId) => run(() => window.textmeet.deleteModels(id)),
  };

  const sections = models && catalogSections(models);
  const group = (title: string, ids: AsrModelId[]) =>
    models &&
    ids.length > 0 && (
      <div className="mgroup" role="group" aria-label={title}>
        <h3>{title}</h3>
        {ids.map((id) => (
          <ModelCard key={id} id={id} state={models} actions={actions} />
        ))}
      </div>
    );

  return (
    <>
      <div className="fld">
        <div className="lb">Модель</div>
        <div className="ctl">
          {error && (
            <p role="alert" className="err">
              {error}
            </p>
          )}
          {models && sections && (
            <div className="catalog">
              {group('Выбрана', [sections.selected])}
              {group('Скачанные', sections.downloaded)}
              {group('Понимают русский', sections.russian)}
              {group('Только английский', sections.english)}
            </div>
          )}
          <small>
            {models?.busy
              ? 'Пока идёт расшифровка, модели удалить нельзя.'
              : 'Скачанные модели работают без интернета. Удалённую модель можно скачать снова.'}
          </small>
        </div>
      </div>
      {models?.voices.installed && (
        <div className="fld">
          <div className="lb">Общие модели</div>
          <div className="ctl">
            <div className="mlist" role="list" aria-label="Общие модели">
              <div role="listitem">
                Разделение по голосам и поиск речи
                <span>{formatMegabytes(models.voices.sizeBytes)}</span>
                <button
                  type="button"
                  className="lnk"
                  disabled={models.busy || models.download !== null}
                  aria-label="Удалить: Разделение по голосам и поиск речи"
                  onClick={() => actions.onDelete('voices')}
                >
                  Удалить
                </button>
              </div>
            </div>
            <small>Нужны любой модели расшифровки; удалённые скачаются заново при следующей расшифровке.</small>
          </div>
        </div>
      )}
    </>
  );
}
