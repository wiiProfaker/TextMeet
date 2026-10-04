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
}

/**
 * Окно подтверждения (объединить спикеров, удалить аудио, удалить встречу): «Отмена» / действие. Рисуется поверх
 * всего окна программы, откуда бы его ни открыли.
 */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Окно закрылось — фокус возвращается туда, откуда его открыли.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>('.btn.pri')?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

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
          if (e.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, e);
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
