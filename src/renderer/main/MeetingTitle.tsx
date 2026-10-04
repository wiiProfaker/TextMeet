import { useEffect, useRef, useState } from 'react';
import { errorText } from './errors';
import { PencilIcon } from './icons';

interface Props {
  meetingId: string;
  title: string;
  onError(message: string): void;
}

/** Название встречи; щелчок — поле на его месте. Enter или уход из поля — сохранить, Esc — отмена. */
export function MeetingTitle({ meetingId, title, onError }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(title);
    field.current?.select();
    // Только при входе в правку.
  }, [editing]);

  if (!editing) {
    return (
      <h1>
        <button type="button" className="title-btn" aria-description="Переименовать встречу" onClick={() => setEditing(true)}>
          {title}
          <PencilIcon />
        </button>
      </h1>
    );
  }

  const save = async () => {
    if (done.current) return;
    done.current = true;
    const next = draft.trim();
    setEditing(false);
    // Пустое или прежнее название не сохраняем — остаётся прежнее.
    if (next === '' || next === title) return;
    try {
      await window.textmeet.renameMeeting({ meetingId, title: next });
    } catch (err) {
      onError(errorText(err));
    }
  };

  return (
    <h1>
      <input
        ref={field}
        className="title-edit"
        aria-label="Название встречи"
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            setEditing(false);
          }
        }}
      />
    </h1>
  );
}
