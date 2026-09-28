import { useEffect, useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';

export function SettingsScreen() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([window.textmeet.getSettings(), window.textmeet.getAppInfo()])
      .then(([settings, appInfo]) => {
        setState(settings);
        setInfo(appInfo);
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  /** rollback — что вернуть на экран, если main откажет (для мгновенно показанных изменений). */
  const run = async (action: () => Promise<SettingsState>, rollback?: SettingsState) => {
    try {
      setState(await action());
      setError(null);
    } catch (err) {
      if (rollback) setState(rollback);
      setError(errorText(err));
    }
  };

  const openFolder = () => {
    window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)));
  };

  if (state === null) {
    return error ? (
      <p role="alert" className="error pad">
        {error}
      </p>
    ) : (
      <p className="muted pad">Загрузка…</p>
    );
  }

  const notice = launchAtLoginNoticeText(state.launchAtLoginNotice);

  return (
    <section className="settings">
      <h1>Настройки</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="setting">
        <h2>Папка библиотеки</h2>
        <p className="path" data-testid="library-dir">
          {state.libraryDir}
        </p>
        <div className="row">
          <button type="button" onClick={() => void run(() => window.textmeet.chooseLibraryDir())}>
            Изменить…
          </button>
          <button type="button" onClick={openFolder}>
            Открыть папку
          </button>
        </div>
      </div>

      <div className="setting">
        <label className="toggle">
          <input
            type="checkbox"
            checked={state.settings.launchAtLogin}
            onChange={(e) => {
              const enabled = e.target.checked;
              // Галочку показываем сразу, не дожидаясь записи на диск.
              setState({ ...state, settings: { ...state.settings, launchAtLogin: enabled } });
              void run(() => window.textmeet.setLaunchAtLogin(enabled), state);
            }}
          />
          Запускать TextMeet при входе в систему
        </label>
        <p className="muted">Программа стартует свёрнутой в трей, чтобы запись можно было начать сразу.</p>
        {notice && (
          <p className="notice" data-testid="launch-notice">
            {notice}
          </p>
        )}
      </div>

      {info && (
        <footer className="muted about">
          Версия {info.version} · журнал ошибок: {info.logFile}
        </footer>
      )}
    </section>
  );
}
