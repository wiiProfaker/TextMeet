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
  const shown = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  /** Закончили клавишей — фокус возвращается на название. */
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing) {
      if (refocus.current) shown.current?.focus();
      refocus.current = false;
      return;
    }
    done.current = false;
    setDraft(title);
    field.current?.select();
    // Только при входе в правку и выходе из неё.
  }, [editing]);

  if (!editing) {
    return (
      <h1>
        <button
          ref={shown}
          type="button"
          className="title-btn"
          aria-description="Переименовать встречу"
          onClick={() => setEditing(true)}
        >
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
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            refocus.current = true;
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            refocus.current = true;
            setEditing(false);
          }
        }}
      />
    </h1>
  );
}
