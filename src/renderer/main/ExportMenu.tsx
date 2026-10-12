import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ExportFormat } from '../../shared/ipc';
import { errorText } from './errors';
import { useCopiedFlag } from './hooks';
import { CheckIcon, ChevronIcon, CopyIcon, ExportIcon, FileIcon } from './icons';
import { menuFocusStep } from './menu-keys';

interface Props {
  meetingId: string;
  onError(message: string): void;
}

/** Кнопка «Экспорт» в заголовке встречи: «Скопировать всё», «Сохранить в Word», «Сохранить как текст» (лист 15). */
export function ExportMenu({ meetingId, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, markCopied] = useCopiedFlag();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /** Пункт выбран: меню закрывается, фокус — на «Экспорт» (пункт исчезает вместе с меню). */
  const close = () => {
    button.current?.focus();
    setOpen(false);
  };

  const copy = () => {
    close();
    window.textmeet
      .copyMeeting(meetingId)
      .then(markCopied)
      .catch((err: unknown) => onError(errorText(err)));
  };

  const save = (format: ExportFormat) => {
    close();
    window.textmeet.saveMeeting({ meetingId, format }).catch((err: unknown) => onError(errorText(err)));
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[menuFocusStep(at, items.length, event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={wrap} className="more-wrap">
      <button
        ref={button}
        type="button"
        className={open ? 'btn on' : 'btn'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {copied ? <CheckIcon /> : <ExportIcon />}
        {copied ? 'Скопировано' : 'Экспорт'}
        <span className="chev">
          <ChevronIcon />
        </span>
      </button>
      {/* Экранному диктору — отдельно от названия кнопки. */}
      <span className="sr-only" role="status">
        {copied ? 'Текст встречи скопирован' : ''}
      </span>
      {open && (
        <div className="menu export-menu" role="menu" aria-label="Экспорт" onKeyDown={keys}>
          <button type="button" className="mi" role="menuitem" onClick={copy}>
            <CopyIcon />
            <span className="mi-label">Скопировать всё</span>
          </button>
          <div className="sep" role="separator" />
          <button type="button" className="mi" role="menuitem" onClick={() => save('docx')}>
            <FileIcon />
            <span className="mi-label">Сохранить в Word (.docx)…</span>
          </button>
          <button type="button" className="mi" role="menuitem" onClick={() => save('txt')}>
            <FileIcon />
            <span className="mi-label">Сохранить как текст (.txt)…</span>
          </button>
        </div>
      )}
    </div>
  );
}
