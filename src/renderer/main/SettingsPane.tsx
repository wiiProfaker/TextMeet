import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { AppInfo, SettingsState } from '../../shared/ipc';
import { AiModelSettings } from './AiModelSettings';
import { AiSettings } from './AiSettings';
import { errorText } from './errors';
import { launchAtLoginNoticeText } from './format';
import { HotkeyField } from './HotkeyField';
import { useMicrophones } from './hooks';
import { ChevronIcon } from './icons';
import { SETTINGS_TABS, tabAfterKey, type SettingsTab } from './settings-tabs';
import { TranscriptionSettings } from './TranscriptionSettings';

interface Props {
  state: SettingsState;
  info: AppInfo | null;
  onChange(next: SettingsState): void;
  /** Строка ошибки слева: для ошибок, которые пришли, когда со страницы настроек уже ушли. */
  onError(message: string): void;
  /** Открытая вкладка: её помнит App, пока программа запущена. */
  tab: SettingsTab;
  onTabChange(tab: SettingsTab): void;
}

const tabId = (tab: SettingsTab): string => `settings-tab-${tab}`;
const panelId = (tab: SettingsTab): string => `settings-panel-${tab}`;

/**
 * Вкладка настроек. На странице все четыре, видна одна: набранный запрос, каталог моделей и сообщения в нём не
 * теряются при переключении.
 */
function Panel({ id, current, children }: { id: SettingsTab; current: SettingsTab; children: ReactNode }) {
  return (
    <section className="sec tab-panel" id={panelId(id)} role="tabpanel" aria-labelledby={tabId(id)} hidden={id !== current}>
      {children}
    </section>
  );
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

/** Настройки по вкладкам: «Запись», «Расшифровка», «ИИ», «Общие»; видна одна. */
export function SettingsPane({ state, info, onChange, onError, tab, onTabChange }: Props) {
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

  /** ←/→, Home, End в строке вкладок: вкладка открывается сразу, фокус — на ней. */
  const tabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = tabAfterKey(tab, event.key, { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey });
    if (!next) return;
    event.preventDefault();
    onTabChange(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <main className="pane" aria-label="Настройки">
      <div className="set">
        <h1>Настройки</h1>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}

        <div className="tabs" role="tablist" aria-label="Разделы настроек" onKeyDown={tabKeys}>
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              id={tabId(t.id)}
              type="button"
              className="tab"
              role="tab"
              aria-selected={t.id === tab}
              aria-controls={panelId(t.id)}
              tabIndex={t.id === tab ? 0 : -1}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Panel id="record" current={tab}>
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
            <HotkeyField state={state} platform={platform} active={tab === 'record'} onChange={onChange} />
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
        </Panel>

        <Panel id="transcription" current={tab}>
          <TranscriptionSettings />
        </Panel>

        <Panel id="ai" current={tab}>
          <AiSettings
            aiPrompt={settings.aiPrompt}
            save={(prompt) => window.textmeet.setAiPrompt(prompt)}
            onSaved={onChange}
            onError={setError}
            onErrorAfterLeave={onError}
          />
          <AiModelSettings />
        </Panel>

        <Panel id="general" current={tab}>
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
          {info && (
            <footer className="about">
              TextMeet {info.version} · журнал ошибок: {info.logFile}
            </footer>
          )}
        </Panel>
      </div>
    </main>
  );
}
