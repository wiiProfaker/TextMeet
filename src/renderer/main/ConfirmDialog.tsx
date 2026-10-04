import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { errorText } from './errors';
import { keepFocusInside } from './focus';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Ошибка — исключением: окно остаётся открытым и показывает её. */
  onConfirm(): Promise<void>;
  onCancel(): void;
  /**
   * Куда вернуть фокус при закрытии, если открывший элемент уже исчез (поле имени спикера заменяется чипом).
   * null — вернуть туда, где фокус был при открытии.
   */
  restoreFocus?(): HTMLElement | null;
}

/**
 * Окно подтверждения (объединить спикеров, удалить аудио, удалить встречу): «Отмена» / действие. Рисуется поверх
 * всего окна программы, откуда бы его ни открыли.
 */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, restoreFocus }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const wasBusy = useRef(false);
  // Последний restoreFocus: подписка ставится один раз, а нужный элемент может появиться позже.
  const restore = useRef(restoreFocus);
  restore.current = restoreFocus;

  useEffect(() => {
    // Окно закрылось — фокус возвращается туда, откуда его открыли.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>('.btn.pri')?.focus();
    return () => {
      const target = restore.current?.() ?? (opener?.isConnected ? opener : null);
      target?.focus();
    };
  }, []);

  // Пока идёт действие, кнопки выключены — фокус остаётся в окне (Tab и Esc продолжают работать); не получилось —
  // он возвращается на главную кнопку.
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      dialog.current?.focus();
    } else if (wasBusy.current) {
      wasBusy.current = false;
      dialog.current?.querySelector<HTMLButtonElement>('.btn.pri')?.focus();
    }
  }, [busy]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="shade">
      <div
        ref={dialog}
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === 'Tab' && dialog.current) {
            // Пока идёт действие, кнопки выключены: Tab некуда вести, а наружу фокус отпускать нельзя.
            if (busy) e.preventDefault();
            else keepFocusInside(dialog.current, e);
          }
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="note body">{children}</p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-foot">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
