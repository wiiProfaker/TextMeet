import { useEffect, useId, useRef, useState } from 'react';
import { errorText } from './errors';
import { keepFocusInside } from './focus';
import { choiceFor, readChoice } from './participants';
import { ParticipantsPicker } from './ParticipantsPicker';

interface Props {
  meetingId: string;
  /** Уже расшифрована: текст заменится, когда новая расшифровка закончится. */
  again: boolean;
  /** Число участников, указанное раньше (выбрано заранее). */
  participantsHint: number | null;
  onClose(): void;
}

/** «Расшифровать» / «Расшифровать заново»: число участников и запуск. */
export function TranscribeDialog({ meetingId, again, participantsHint, onClose }: Props) {
  const [participants, setParticipants] = useState(() => choiceFor(participantsHint));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Окно закрылось — фокус возвращается на кнопку, которая его открыла.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => opener?.focus();
  }, []);

  const confirm = async () => {
    const n = readChoice(participants);
    if (n === 'invalid') {
      setError('Введите число от 1 до 50.');
      return;
    }
    setSaving(true);
    try {
      await window.textmeet.transcribe({ meetingId, participantsHint: n });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  const title = again ? 'Расшифровать заново' : 'Расшифровать';
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
          if (e.key === 'Escape' && !saving) onClose();
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {again && <div className="meta">Текст заменится, когда новая расшифровка закончится.</div>}
        <ParticipantsPicker
          value={participants}
          onChange={(next) => {
            setParticipants(next);
            setError(null);
          }}
        />
        <p className="note">Если не выбрать, программа определит число собеседников сама.</p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn pri" disabled={saving} onClick={() => void confirm()}>
            Расшифровать
          </button>
        </div>
      </div>
    </div>
  );
}
