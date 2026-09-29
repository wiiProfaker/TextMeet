import type { RecordingState } from '../../shared/recording';
import { errorText } from './errors';
import { formatClock } from './format';
import { useNow, usePeaks } from './hooks';
import { MicIcon, ScreenIcon } from './icons';
import { Meter } from './Meter';

interface Props {
  state: RecordingState;
  /** Пусто — клавиши нет (её держит другая программа). */
  hotkey: string;
  /** Какой микрофон будет писать (для строки под кнопкой). */
  micLabel: string;
  onError(message: string): void;
}

const run = (action: Promise<unknown>, onError: (message: string) => void) => {
  action.catch((err: unknown) => onError(errorText(err)));
};

/** Блок записи вверху боковой панели: всегда на виду, какую бы встречу ни открыли. */
export function RecordPanel({ state, hotkey, micLabel, onError }: Props) {
  const active = state.phase !== 'idle';
  const now = useNow(state.phase === 'recording');
  const peaks = usePeaks(state.phase === 'recording');
  const toggle = () => run(window.textmeet.toggleRecording(), onError);

  if (!active) {
    return (
      <section className="rec idle" aria-label="Запись">
        <button type="button" className="start" onClick={toggle}>
          <span className="rdot" />
          Начать запись
          {hotkey && <kbd>{hotkey}</kbd>}
        </button>
        <div className="tog">
          <button
            type="button"
            className="sw"
            role="switch"
            aria-checked={state.systemAudioNext}
            aria-label="Звук компьютера"
            onClick={() => run(window.textmeet.setSystemAudio(!state.systemAudioNext), onError)}
          >
            <i />
          </button>
          <div>
            <b>Звук компьютера</b>
            <small>Выключите для редкой встречи вживую — после записи включится сам</small>
          </div>
        </div>
        {state.startProblem && (
          <div className="problem" role="alert">
            <span>{state.startProblem.message}</span>
            <div className="problem-actions">
              {state.startProblem.settings && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => run(window.textmeet.openSystemSettings(state.startProblem!.settings!), onError)}
                >
                  Открыть настройки системы
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => run(window.textmeet.dismissStartProblem(), onError)}>
                Скрыть
              </button>
            </div>
          </div>
        )}
        <div className="micline" title={micLabel}>
          <MicIcon />
          <span>{micLabel}</span>
        </div>
      </section>
    );
  }

  const elapsed = state.startedAt === null ? 0 : (now - state.startedAt) / 1000;
  const label = state.phase === 'starting' ? 'Включаем…' : state.phase === 'stopping' ? 'Сохраняем…' : 'Идёт запись';
  const systemFlag =
    state.system === 'failed' ? 'не записывается' : state.system === 'off' ? 'выключен' : state.systemSilent ? 'не слышно' : null;

  return (
    <section className="rec" aria-label="Идёт запись">
      <div className="rec-top">
        <span className="dot" />
        <span className="rec-lbl">{label}</span>
        <span className="timer" data-testid="sidebar-timer">
          {formatClock(elapsed)}
        </span>
      </div>
      <div className="mrow">
        <MicIcon />
        <span>Микрофон</span>
        {state.micEnded && <span className="flag">отключён</span>}
      </div>
      <Meter peak={peaks.mic} label="Уровень микрофона" />
      <div className="mrow">
        <ScreenIcon />
        <span>Звук компьютера</span>
        {systemFlag && <span className="flag">{systemFlag}</span>}
      </div>
      <Meter peak={peaks.system} label="Уровень звука компьютера" />
      <button type="button" className="stop" onClick={toggle} disabled={state.phase !== 'recording'}>
        <span className="sq" />
        Остановить
        {hotkey && <kbd>{hotkey}</kbd>}
      </button>
    </section>
  );
}
