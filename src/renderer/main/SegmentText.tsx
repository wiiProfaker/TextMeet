import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { errorText } from './errors';

interface Props {
  text: string;
  /** Можно править (не идёт расшифровка заново). */
  editable: boolean;
  editing: boolean;
  /** Щелчок по тексту: начать правку; caret — где поставить курсор. */
  onStartEditing(): void;
  onStopEditing(): void;
  /** Сохранить; пустой текст удаляет реплику. Ошибка — исключением (её покажем под полем). */
  onSave(text: string): Promise<void>;
}

/** Где в тексте щёлкнули: туда же встанет курсор в поле правки. */
function caretOffset(event: MouseEvent<HTMLElement>): number | null {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || !event.currentTarget.contains(selection.anchorNode)) return null;
  return selection.anchorOffset;
}

/**
 * Текст реплики. Щелчок — поле правки того же шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc —
 * отменить, уход из поля — сохранить. Выделение мышью (чтобы скопировать) правку не начинает.
 */
export function SegmentText({ text, editable, editing, onStartEditing, onStopEditing, onSave }: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  /** Сохранение уже идёт или правка закончена: уход из поля после Enter второй раз не сохраняет. */
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(text);
    setError(null);
    const el = field.current;
    if (!el) return;
    el.focus();
    const at = Math.min(caret.current ?? text.length, text.length);
    el.setSelectionRange(at, at);
    // Только при входе в правку: текст во время правки снаружи не меняется — правят только здесь.
  }, [editing]);

  if (!editing) {
    if (!editable) return <div className="say">{text}</div>;
    return (
      <div
        className="say editable"
        role="button"
        tabIndex={0}
        aria-description="Щёлкните, чтобы исправить текст"
        onClick={(e) => {
          // Человек выделил кусок, чтобы скопировать, — это не просьба править.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          caret.current = caretOffset(e);
          onStartEditing();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          caret.current = null;
          onStartEditing();
        }}
      >
        {text}
      </div>
    );
  }

  const save = async () => {
    if (done.current) return;
    done.current = true;
    if (draft.trim() === text) {
      onStopEditing();
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      onStopEditing();
    } catch (err) {
      done.current = false;
      setError(errorText(err));
      setSaving(false);
      field.current?.focus();
    }
  };

  return (
    <div>
      <textarea
        ref={field}
        className="say-edit"
        aria-label="Текст реплики"
        value={draft}
        maxLength={20_000}
        readOnly={saving}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            onStopEditing();
          }
        }}
      />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : (
        <div className="edit-hint">Enter — сохранить · Esc — отменить · Shift+Enter — новая строка</div>
      )}
    </div>
  );
}
