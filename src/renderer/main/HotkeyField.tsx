import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { hotkeyFromKey } from '../../shared/hotkey';
import type { SettingsState } from '../../shared/ipc';
import { errorText } from './errors';
import { hotkeyKeys } from './format';
import { WarnIcon } from './icons';

interface Props {
  state: SettingsState;
  platform: string;
  onChange(next: SettingsState): void;
}

/** «Горячая клавиша записи»: показ, ввод новой комбинации, сброс. */
export function HotkeyField({ state, platform, onChange }: Props) {
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { hotkey } = state;

  // Пока ждём комбинацию, действующая снята (иначе нажатие Ctrl+Space начало бы запись).
  useEffect(() => {
    if (!capturing) return;
    box.current?.focus();
    void window.textmeet.suspendHotkey(true);
    return () => void window.textmeet.suspendHotkey(false);
  }, [capturing]);

  // Окно закрыли (оно прячется в трей), не закончив ввод: иначе действующая клавиша так и осталась бы снятой.
  useEffect(() => {
    if (!capturing) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      setCapturing(false);
      setMessage(null);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [capturing]);

  const apply = async (accelerator: string | null) => {
    try {
      const result = await window.textmeet.setHotkey(accelerator);
      onChange(result.state);
      if (result.ok) {
        setMessage(null);
        setCapturing(false);
      } else {
        setMessage(result.message);
      }
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!capturing) return;
    event.preventDefault();
    const result = hotkeyFromKey(event, platform);
    if (result.kind === 'pending') return;
    if (result.kind === 'cancel') {
      setCapturing(false);
      setMessage(null);
      return;
    }
    if (result.kind === 'rejected') setMessage(result.message);
    else void apply(result.accelerator);
  };

  return (
    <div className="ctl">
      <div className="hr">
        <div
          ref={box}
          className={`keybox${capturing ? ' cap' : ''}${message ? ' bad' : ''}`}
          tabIndex={capturing ? 0 : -1}
          role="textbox"
          aria-label="Горячая клавиша записи"
          aria-readonly={!capturing}
          data-testid="hotkey-box"
          onKeyDown={onKeyDown}
        >
          {capturing ? (
            'Нажмите новую комбинацию…'
          ) : (
            hotkeyKeys(hotkey.label, platform).map((key, i) => (
              <span key={`${key}-${i}`}>
                {i > 0 && platform !== 'darwin' ? '+' : ''}
                <kbd className="k">{key}</kbd>
              </span>
            ))
          )}
        </div>
        {capturing ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCapturing(false);
              setMessage(null);
            }}
          >
            Отмена
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setCapturing(true)}>
              Изменить
            </button>
            {!hotkey.isDefault && (
              <button type="button" className="btn ghost" onClick={() => void apply(null)}>
                Сбросить
              </button>
            )}
          </>
        )}
      </div>
      {capturing && !message && <small>Esc — отмена. Пока вы вводите комбинацию, прежняя не срабатывает.</small>}
      {message && (
        <p className="err" role="alert">
          {message}
        </p>
      )}
      {hotkey.busy && !capturing && (
        <p className="wrn" role="status">
          <WarnIcon />
          <span>
            Комбинация занята другой программой. Запись можно начать кнопкой в окне или из меню в{' '}
            {platform === 'darwin' ? 'строке меню' : 'трее'}.
          </span>
        </p>
      )}
      <small>
        Начинает и останавливает запись из любой программы, даже поверх созвона на весь экран. Пока TextMeet запущен,
        эта комбинация не доходит до других программ.
      </small>
    </div>
  );
}
