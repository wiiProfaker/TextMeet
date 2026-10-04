import { useEffect, useRef, useState } from 'react';
import type { AsrModelId } from '../../shared/asr-models';
import { formatMegabytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';
import { catalogErrorsAfter, catalogErrorText, catalogSections, NO_CATALOG_ERRORS } from './model-catalog';
import { ModelCard, type ModelCardActions } from './ModelCard';

/** Настройки → «Расшифровка»: каталог моделей (решения Плана 7, §2) и общие модели голосов. */
export function TranscriptionSettings() {
  const [models, setModels] = useState<ModelsState | null>(null);
  const [errors, setErrors] = useState(NO_CATALOG_ERRORS);
  // Запросы могут наложиться и ответить не по порядку — показываем только ответ на последний.
  const latestRequest = useRef(0);

  useEffect(() => {
    const load = () => {
      const request = ++latestRequest.current;
      return window.textmeet
        .getModels()
        .then((state) => {
          if (request !== latestRequest.current) return;
          setModels(state);
          setErrors((prev) => catalogErrorsAfter(prev, 'load', null));
        })
        .catch((err: unknown) => {
          if (request === latestRequest.current) setErrors((prev) => catalogErrorsAfter(prev, 'load', errorText(err)));
        });
    };
    void load();
    // Скачивание из каталога продвинулось или закончилось — перечитать.
    const unsubscribeModels = window.textmeet.onModelsChanged(() => void load());
    // Расшифровка началась или закончилась (и модели могли скачаться) — перечитать.
    let busy: boolean | null = null;
    const unsubscribeProgress = window.textmeet.onTranscriptionProgress((list) => {
      const nowBusy = list.length > 0;
      if (nowBusy !== busy) void load();
      busy = nowBusy;
    });
    return () => {
      // Ответы после закрытия настроек не нужны.
      latestRequest.current += 1;
      unsubscribeModels();
      unsubscribeProgress();
    };
  }, []);

  /** Действие с ответом-состоянием; его ошибку показываем всегда — это ответ на нажатие. */
  const run = async (action: () => Promise<ModelsState>) => {
    const request = ++latestRequest.current;
    try {
      const state = await action();
      setErrors((prev) => catalogErrorsAfter(prev, 'action', null));
      if (request === latestRequest.current) setModels(state);
    } catch (err) {
      setErrors((prev) => catalogErrorsAfter(prev, 'action', errorText(err)));
    }
  };

  const actions: ModelCardActions = {
    onSelect: (id: AsrModelId) => void run(() => window.textmeet.selectModel(id)),
    onDownload: (id: AsrModelId) => void run(() => window.textmeet.downloadModel(id)),
    onCancel: (id: AsrModelId) => void run(() => window.textmeet.cancelModelDownload(id)),
    onDelete: (id: ModelGroupId) => void run(() => window.textmeet.deleteModels(id)),
  };

  const sections = models && catalogSections(models);
  const error = catalogErrorText(errors);
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
    <section className="sec">
      <h2>Расшифровка</h2>
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
    </section>
  );
}
