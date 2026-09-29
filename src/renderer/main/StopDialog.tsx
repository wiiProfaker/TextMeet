import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { StopDialogData } from '../../shared/recording';
import { errorText } from './errors';
import { formatDurationWithSeconds, parseParticipants } from './format';

const CHOICES = [2, 3, 4, 5, 6] as const;

/** Tab и Shift+Tab ходят по кругу внутри окна: кнопки за ним (например, «Начать запись») недоступны. */
function keepFocusInside(dialog: HTMLElement, event: KeyboardEvent<HTMLDivElement>): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** «Запись остановлена»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data, onError }: { data: StopDialogData; onError(message: string): void }) {
  const [title, setTitle] = useState(data.title);
  const [choice, setChoice] = useState<number | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(data.title);
    setChoice(null);
    setOther('');
    setError(null);
    dialog.current?.focus();
  }, [data.meetingId, data.title]);

  const finish = async (participantsHint: number | null) => {
    setSaving(true);
    try {
      await window.textmeet.finishStopDialog({ meetingId: data.meetingId, title, participantsHint });
    } catch (err) {
      // «Пропустить» и Esc закрывают окно и при ошибке (main уже убрал его) — ошибку показывает боковая панель.
      if (participantsHint === null) onError(errorText(err));
      else setError(errorText(err));
      setSaving(false);
    }
  };

  const confirm = () => {
    if (other.trim() !== '') {
      const n = parseParticipants(other);
      if (n === null) {
        setError('Введите число от 1 до 50.');
        return;
      }
      void finish(n);
      return;
    }
    if (choice === null) {
      setError('Выберите, сколько было человек, или нажмите «Пропустить».');
      return;
    }
    void finish(choice);
  };

  return (
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stop-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !saving) void finish(null);
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id="stop-title">Запись остановлена</h2>
        <div className="meta">{formatDurationWithSeconds(data.durationSec)} · уже сохранена в библиотеке</div>
        <label className="lab">
          Название
          <input className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <div className="q" id="participants-question">
          Сколько человек было на встрече, включая вас?
        </div>
        <div className="nums" role="group" aria-labelledby="participants-question">
          {CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              className="num"
              aria-pressed={choice === n && other === ''}
              onClick={() => {
                setChoice(n);
                setOther('');
                setError(null);
              }}
            >
              {n}
            </button>
          ))}
          <input
            className="other"
            inputMode="numeric"
            placeholder="другое"
            aria-label="Другое число участников"
            value={other}
            onChange={(e) => {
              setOther(e.currentTarget.value);
              setError(null);
            }}
          />
        </div>
        <p className="note">
          Так расшифровка точнее разделит голоса. Если не знаете — пропустите, программа попробует определить сама.
        </p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={saving} onClick={() => void finish(null)}>
            Пропустить
          </button>
          <button type="button" className="btn pri" disabled={saving} onClick={confirm}>
            Расшифровать
          </button>
        </div>
      </div>
    </div>
  );
}
