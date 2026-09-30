import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../../shared/format';
import type { ModelGroupId, ModelsState } from '../../shared/transcription';
import { errorText } from './errors';

/** Настройки → «Расшифровка» (лист 6 макета; Whisper появится в Плане 7). */
export function TranscriptionSettings() {
  const [models, setModels] = useState<ModelsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Запросы могут наложиться и ответить не по порядку — показываем только ответ на последний.
  const latestRequest = useRef(0);

  useEffect(() => {
    const load = () => {
      const request = ++latestRequest.current;
      return window.textmeet
        .getModels()
        .then((state) => {
          if (request === latestRequest.current) setModels(state);
        })
        .catch((err: unknown) => {
          if (request === latestRequest.current) setError(errorText(err));
        });
    };
    void load();
    // Расшифровка началась или закончилась (и модели могли скачаться) — перечитать.
    let busy: boolean | null = null;
    const unsubscribe = window.textmeet.onTranscriptionProgress((list) => {
      const nowBusy = list.length > 0;
      if (nowBusy !== busy) void load();
      busy = nowBusy;
    });
    return () => {
      // Ответы после закрытия настроек не нужны.
      latestRequest.current += 1;
      unsubscribe();
    };
  }, []);

  const remove = async (group: ModelGroupId) => {
    const request = ++latestRequest.current;
    try {
      const state = await window.textmeet.deleteModels(group);
      if (request !== latestRequest.current) return;
      setModels(state);
      setError(null);
    } catch (err) {
      // Ошибку удаления показываем всегда: это ответ на нажатие, перечитанный список её не отменяет.
      setError(errorText(err));
    }
  };

  const gigaam = models?.groups.find((g) => g.id === 'gigaam');
  const installed = models?.groups.filter((g) => g.installed) ?? [];
  return (
    <section className="sec">
      <h2>Расшифровка</h2>
      <div className="fld">
        <div className="lb">Модель</div>
        <div className="ctl">
          <div className="opts">
            <div className="opt on">
              <span className="radio">
                <i />
              </span>
              <span className="opt-text">
                <b>GigaAM v3</b>
                <small>Русский язык, с пунктуацией. Быстро работает на процессоре. Английские слова пишет русскими буквами.</small>
                {gigaam && !gigaam.installed && <small>Скачается при первой расшифровке.</small>}
              </span>
              {gigaam?.installed && <span className="side-note">скачана · {formatBytes(gigaam.sizeBytes)}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="fld">
        <div className="lb">Скачанные модели</div>
        <div className="ctl">
          {installed.length === 0 ? (
            <small>Пока ничего не скачано.</small>
          ) : (
            <div className="mlist" role="list" aria-label="Скачанные модели">
              {installed.map((group) => (
                <div key={group.id} role="listitem">
                  {group.title}
                  <span>{formatBytes(group.sizeBytes)}</span>
                  <button
                    type="button"
                    className="lnk"
                    disabled={models?.busy}
                    aria-label={`Удалить: ${group.title}`}
                    onClick={() => void remove(group.id)}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
          <small>
            {models?.busy
              ? 'Пока идёт расшифровка, модели удалить нельзя.'
              : 'Удалённая модель скачается заново при следующей расшифровке.'}
          </small>
          {error && (
            <p role="alert" className="err">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
