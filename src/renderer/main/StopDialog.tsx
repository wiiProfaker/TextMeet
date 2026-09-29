import { useEffect, useRef, useState } from 'react';
import type { StopDialogData } from '../../shared/recording';
import { errorText } from './errors';
import { formatDurationWithSeconds, parseParticipants } from './format';

const CHOICES = [2, 3, 4, 5, 6] as const;

/** «Запись остановлена»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data }: { data: StopDialogData }) {
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
      setError(errorText(err));
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
