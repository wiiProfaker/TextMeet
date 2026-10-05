import { useEffect, useId, useRef, useState } from 'react';
import type { StopDialogData } from '../../shared/recording';
import { errorText } from './errors';
import { formatDurationWithSeconds } from './format';
import { keepFocusInside } from './focus';
import { EMPTY_CHOICE, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';

/** «Запись остановлена»: название и число участников (подсказка для разделения по голосам). */
export function StopDialog({ data, onError }: { data: StopDialogData; onError(message: string): void }) {
  const [title, setTitle] = useState(data.title);
  const [participants, setParticipants] = useState(EMPTY_CHOICE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setTitle(data.title);
    setParticipants(EMPTY_CHOICE);
    setError(null);
    // Следующее окно из очереди приходит в тот же компонент — после «Расшифровать» кнопки не должны остаться выключенными.
    setSaving(false);
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
    const n = readChoice(participants);
    if (n === 'invalid') {
      setError('Введите число от 1 до 50.');
      return;
    }
    if (n === null) {
      setError('Выберите, сколько было человек, или нажмите «Пропустить».');
      return;
    }
    void finish(n);
  };

  return (
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !saving) void finish(null);
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id={titleId}>Запись остановлена</h2>
        <div className="meta">{formatDurationWithSeconds(data.durationSec)} · уже сохранена в библиотеке</div>
        <label className="lab">
          Название
          <input className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
            setParticipants(next);
            setError(null);
          }}
        />
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
