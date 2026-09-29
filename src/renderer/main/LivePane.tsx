import { formatBytes } from '../../shared/format';
import type { RecordingState } from '../../shared/recording';
import { errorText } from './errors';
import { formatClock, formatTimeOfDay } from './format';
import { useNow, usePeaks } from './hooks';
import { WarnIcon } from './icons';
import { Meter } from './Meter';

interface Props {
  state: RecordingState;
  title: string;
  /** Пусто — клавиши нет (её держит другая программа). */
  hotkey: string;
  platform: string;
  onError(message: string): void;
}

function Banner({ title, text, onOpenSettings }: { title: string; text: string; onOpenSettings?: () => void }) {
  return (
    <div className="banner" role="status">
      <WarnIcon />
      <div>
        <b>{title}</b>
        <p>{text}</p>
        {onOpenSettings && (
          <div className="acts">
            <button type="button" className="btn pri" onClick={onOpenSettings}>
              Открыть настройки системы
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function systemLabel(state: RecordingState): string {
  if (state.system === 'off') return 'выключен для этой записи';
  if (state.system === 'failed') return 'не записывается';
  return 'весь звук, кроме самого TextMeet';
}

/** Идущая запись в правой части: крупный таймер, уровни, «Остановить». */
export function LivePane({ state, title, hotkey, platform, onError }: Props) {
  const now = useNow(state.phase === 'recording');
  const peaks = usePeaks(state.phase === 'recording');
  const elapsed = state.startedAt === null ? 0 : (now - state.startedAt) / 1000;
  const isMac = platform === 'darwin';
  const openSettings = () =>
    window.textmeet.openSystemSettings('system-audio').catch((err: unknown) => onError(errorText(err)));
  const phaseText =
    state.phase === 'starting' ? 'Включаем микрофон…' : state.phase === 'stopping' ? 'Сохраняем запись…' : 'Идёт запись';

  return (
    <main className="pane" aria-label="Идёт запись">
      <header className="head">
        <h1>{title}</h1>
        <div className="meta">
          {state.startedAt === null
            ? 'Запись начинается…'
            : `Запись идёт с ${formatTimeOfDay(new Date(state.startedAt).toISOString())} · сохраняется на диск каждую секунду`}
        </div>
      </header>
      {state.system === 'failed' && state.systemProblem && (
        <Banner
          title="Звук компьютера не записывается"
          text={state.systemProblem}
          onOpenSettings={isMac ? openSettings : undefined}
        />
      )}
      {state.systemSilent && (
        <Banner
          title="Звук компьютера пока не слышен"
          text={
            isMac
              ? 'Скорее всего, у TextMeet нет разрешения «Запись системного звука». Микрофон при этом записывается как обычно.'
              : 'Если созвон уже идёт, проверьте, что его звук идёт через этот компьютер. Микрофон записывается как обычно.'
          }
          onOpenSettings={isMac ? openSettings : undefined}
        />
      )}
      {state.micEnded && (
        <Banner title="Микрофон отключился" text="Звук компьютера продолжает записываться." />
      )}
      <div className="live">
        <div className="live-state">
          <span className="dot" />
          {phaseText}
        </div>
        <div className="big-timer" data-testid="live-timer">
          {formatClock(elapsed)}
        </div>
        <div className="bms">
          <div>
            <div className="bm-head">
              <b>Микрофон</b>
              <span>{state.micLabel ?? ''}</span>
            </div>
            <Meter big peak={peaks.mic} label="Уровень микрофона" />
          </div>
          <div>
            <div className="bm-head">
              <b>Звук компьютера</b>
              <span>{systemLabel(state)}</span>
              {state.systemSilent && <span className="flag">не слышно</span>}
            </div>
            <Meter big peak={peaks.system} label="Уровень звука компьютера" />
          </div>
        </div>
        <button
          type="button"
          className="stop big"
          disabled={state.phase !== 'recording'}
          onClick={() => window.textmeet.toggleRecording().catch((err: unknown) => onError(errorText(err)))}
        >
          <span className="sq" />
          Остановить запись
          {hotkey && <kbd>{hotkey}</kbd>}
        </button>
        <p className="hint">
          {hotkey && (
            <>
              Клавиша работает из любой программы, даже поверх созвона на весь экран.
              <br />
            </>
          )}
          Окно можно закрыть — запись продолжится, а у значка в {isMac ? 'строке меню' : 'трее'} появится отметка записи.
        </p>
      </div>
      <footer className="live-foot">
        <span>{state.freeBytes === null ? '' : `Свободно на диске: ${formatBytes(state.freeBytes)}`}</span>
        <span>Если программа закроется со сбоем, запись восстановится при следующем запуске</span>
      </footer>
    </main>
  );
}
