import { useState } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { AiSettings } from './AiSettings';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
import { HotkeyField } from './HotkeyField';
import { useMicrophones } from './hooks';
import { ChevronIcon } from './icons';
import { TranscriptionSettings } from './TranscriptionSettings';

interface Props {
  state: SettingsState;
  info: AppInfo | null;
  onChange(next: SettingsState): void;
}

function Toggle({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange(value: boolean): void;
}) {
  return (
    <div className="tog">
      <button type="button" className="sw" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <i />
      </button>
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

/** Настройки: запись, расшифровка, ИИ и общие. */
export function SettingsPane({ state, info, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const microphones = useMicrophones();
  const platform = info?.platform ?? 'win32';
  const { settings } = state;

  /** rollback — что вернуть на экран, если main откажет (для мгновенно показанных изменений). */
  const run = async (action: () => Promise<SettingsState>, rollback?: SettingsState) => {
    try {
      onChange(await action());
      setError(null);
    } catch (err) {
      if (rollback) onChange(rollback);
      setError(errorText(err));
    }
  };

  const setInstantly = (patch: Partial<SettingsState['settings']>, action: () => Promise<SettingsState>) => {
    onChange({ ...state, settings: { ...settings, ...patch } });
    void run(action, state);
  };

  const savedMissing =
    settings.microphoneId !== null && !microphones.devices.some((d) => d.deviceId === settings.microphoneId);
  const notice = launchAtLoginNoticeText(state.launchAtLoginNotice);

  return (
    <main className="pane" aria-label="Настройки">
      <div className="set">
        <h1>Настройки</h1>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}

        <section className="sec">
          <h2>Запись</h2>
          <div className="fld">
            <div className="lb">Микрофон</div>
            <div className="ctl">
              <span className="selw">
                <select
                  aria-label="Микрофон"
                  value={settings.microphoneId ?? ''}
                  onChange={(e) => {
                    const deviceId = e.currentTarget.value || null;
                    setInstantly({ microphoneId: deviceId }, () => window.textmeet.setMicrophone(deviceId));
                  }}
                >
                  <option value="">
                    Как в системе{microphones.defaultLabel ? ` — ${microphones.defaultLabel}` : ''}
                  </option>
                  {microphones.devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                  {savedMissing && <option value={settings.microphoneId ?? ''}>Выбранный микрофон (не подключён)</option>}
                </select>
                <ChevronIcon />
              </span>
              <small>
                {savedMissing
                  ? 'Выбранный микрофон сейчас не подключён — запись пойдёт с микрофона, выбранного в системе.'
                  : 'Если сменить микрофон в системе, TextMeet возьмёт новый со следующей записи.'}
              </small>
            </div>
          </div>
          <div className="fld">
            <div className="lb">Горячая клавиша записи</div>
            <HotkeyField state={state} platform={platform} onChange={onChange} />
          </div>
          <div className="fld tight">
            <div className="lb">Звуковой сигнал</div>
            <div className="ctl">
              <Toggle
                checked={settings.recordSounds}
                label="Короткий звук при начале и остановке записи"
                onChange={(value) => setInstantly({ recordSounds: value }, () => window.textmeet.setRecordSounds(value))}
              />
            </div>
          </div>
        </section>

        <TranscriptionSettings />

        <AiSettings
          aiPrompt={settings.aiPrompt}
          save={(prompt) => void run(() => window.textmeet.setAiPrompt(prompt))}
        />

        <section className="sec">
          <h2>Общие</h2>
          <div className="fld">
            <div className="lb">Папка библиотеки</div>
            <div className="ctl">
              <span className="path" data-testid="library-dir">
                {state.libraryDir}
              </span>
              <div className="hr">
                <button type="button" className="btn" onClick={() => void run(() => window.textmeet.chooseLibraryDir())}>
                  Изменить…
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.textmeet.openLibraryDir().catch((err: unknown) => setError(errorText(err)))}
                >
                  Открыть папку
                </button>
              </div>
            </div>
          </div>
          <div className="fld tight">
            <div className="lb">Автозапуск</div>
            <div className="ctl">
              <Toggle
                checked={settings.launchAtLogin}
                label="Запускать TextMeet при входе в систему"
                hint="Программа стартует свёрнутой в трей, чтобы горячая клавиша работала сразу."
                onChange={(value) =>
                  setInstantly({ launchAtLogin: value }, () => window.textmeet.setLaunchAtLogin(value))
                }
              />
              {notice && (
                <p className="notice" data-testid="launch-notice">
                  {notice}
                </p>
              )}
            </div>
          </div>
        </section>

        {info && (
          <footer className="about">
            TextMeet {info.version} · журнал ошибок: {info.logFile}
          </footer>
        )}
      </div>
    </main>
  );
}
