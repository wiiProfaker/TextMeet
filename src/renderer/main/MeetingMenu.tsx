import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Meeting } from '../../shared/meeting';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { deleteAudioText } from './format';
import { FolderIcon, MoreIcon, MuteIcon, TrashIcon } from './icons';

interface Props {
  meeting: Meeting;
  /** Почему аудио сейчас не удалить (идёт расшифровка, готовится запись); null — можно. */
  audioBlocked: string | null;
  /** Перед удалением: плеер отпускает файл записи; ответ — «вернуть», если удалить не вышло. */
  releaseAudio(): () => void;
  /** Встречу удалили — выбрать соседнюю. */
  onDeleted(): void;
  onError(message: string): void;
}

type Confirm = 'audio' | 'meeting' | null;

/** Кнопка «…» в заголовке встречи: папка встречи, «Удалить аудио…», «Удалить встречу…» (лист 11 макета). */
export function MeetingMenu({ meeting, audioBlocked, releaseAudio, onDeleted, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [audioBytes, setAudioBytes] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (confirm !== 'audio') return;
    let active = true;
    window.textmeet
      .audioSize(meeting.id)
      .then((bytes) => {
        if (active) setAudioBytes(bytes);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [confirm, meeting.id]);

  const withReleasedAudio = async (remove: () => Promise<void>) => {
    const restore = releaseAudio();
    try {
      await remove();
    } catch (err) {
      restore();
      throw err;
    }
  };

  const pick = (next: Confirm) => {
    setOpen(false);
    setConfirm(next);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} className="more-wrap">
      <button
        type="button"
        className="btn sq-btn"
        aria-label="Ещё"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="menu right" role="menu" aria-label="Ещё" onKeyDown={keys}>
          <button
            type="button"
            className="mi"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.textmeet.openMeetingDir(meeting.id).catch((err: unknown) => onError(errorText(err)));
            }}
          >
            <FolderIcon />
            <span className="mi-label">Открыть папку встречи</span>
          </button>
          <div className="sep" role="separator" />
          {!meeting.audioDeleted && (
            <button
              type="button"
              className="mi"
              role="menuitem"
              disabled={audioBlocked !== null}
              title={audioBlocked ?? undefined}
              onClick={() => pick('audio')}
            >
              <MuteIcon />
              <span className="mi-label">Удалить аудио…</span>
            </button>
          )}
          <button type="button" className="mi danger" role="menuitem" onClick={() => pick('meeting')}>
            <TrashIcon />
            <span className="mi-label">Удалить встречу…</span>
          </button>
        </div>
      )}
      {confirm === 'audio' && (
        <ConfirmDialog
          title="Удалить аудио?"
          confirmLabel="Удалить аудио"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await withReleasedAudio(() => window.textmeet.deleteAudio(meeting.id));
            setConfirm(null);
          }}
        >
          {deleteAudioText(meeting.durationSec, audioBytes)}
        </ConfirmDialog>
      )}
      {confirm === 'meeting' && (
        <ConfirmDialog
          title={`Удалить встречу «${meeting.title}»?`}
          confirmLabel="Удалить встречу"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await withReleasedAudio(() => window.textmeet.deleteMeeting(meeting.id));
            onDeleted();
          }}
        >
          Папка встречи — запись и текст — переместится в Корзину. Вернуть её можно оттуда.
        </ConfirmDialog>
      )}
    </div>
  );
}
