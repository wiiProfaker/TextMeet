import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findRanges, normalize } from '../../shared/search-text';
import { errorText } from './errors';
import { Marked } from './SearchResults';

interface Props {
  text: string;
  /** Слова поиска — подсветить в тексте. */
  words: readonly string[];
  /** Можно править (не идёт расшифровка заново). */
  editable: boolean;
  editing: boolean;
  /** Щелчок по тексту: начать правку. */
  onStartEditing(): void;
  onStopEditing(): void;
  /** Сохранить; пустой текст удаляет реплику. Ошибка — исключением (её покажем под полем). */
  onSave(text: string): Promise<void>;
  /** Сохранение не удалось, когда правят уже другую реплику: показать ошибку там, где её увидят. */
  onLostError(message: string): void;
}

/** Где в тексте щёлкнули — туда же встанет курсор в поле правки (с подсветкой поиска текст разбит на куски). */
function caretOffset(element: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) return null;
  const range = document.createRange();
  range.setStart(element, 0);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

/**
 * Текст реплики. Щелчок — поле правки того же шрифта: Enter — сохранить, Shift+Enter — новая строка, Esc —
 * отменить, уход из поля — сохранить (но не уход в другую программу). Выделение мышью (чтобы скопировать) правку
 * не начинает.
 */
export function SegmentText({
  text,
  words,
  editable,
  editing,
  onStartEditing,
  onStopEditing,
  onSave,
  onLostError,
}: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const shownText = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  /** Сохранение уже идёт или правка закончена: уход из поля после Enter второй раз не сохраняет. */
  const done = useRef(false);
  /** Правку закончили клавишей — фокус возвращается на текст реплики. */
  const refocus = useRef(false);
  const editingNow = useRef(editing);
  editingNow.current = editing;

  // До отрисовки поля: без мелькания прежнего черновика и с курсором там, где щёлкнули.
  useLayoutEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(text);
    setError(null);
    setSaving(false);
    // Только при входе в правку: текст во время правки снаружи не меняется — правят только здесь.
  }, [editing]);

  useEffect(() => {
    if (editing) {
      const el = field.current;
      if (!el) return;
      el.focus();
      const at = Math.min(caret.current ?? el.value.length, el.value.length);
      el.setSelectionRange(at, at);
      return;
    }
    if (refocus.current) {
      refocus.current = false;
      shownText.current?.focus();
    }
  }, [editing]);

  if (!editing) {
    const shown = words.length > 0 ? <Marked text={text} ranges={findRanges(normalize(text), words)} /> : text;
    if (!editable) return <div className="say">{shown}</div>;
    return (
      <div
        ref={shownText}
        className="say editable"
        role="button"
        tabIndex={0}
        aria-description="Щёлкните, чтобы исправить текст"
        onClick={(e) => {
          // Человек выделил кусок, чтобы скопировать, — это не просьба править.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          caret.current = caretOffset(e.currentTarget);
          onStartEditing();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          caret.current = null;
          onStartEditing();
        }}
      >
        {shown}
      </div>
    );
  }

  const save = async (byKey: boolean) => {
    if (done.current) return;
    done.current = true;
    refocus.current = byKey;
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
      refocus.current = false;
      setSaving(false);
      // Пока сохранялось, человек ушёл править другую реплику — показываем ошибку в боковой панели.
      if (!editingNow.current) {
        onLostError(errorText(err));
        return;
      }
      setError(errorText(err));
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
        onBlur={() => {
          // Ушли в другую программу (Alt+Tab) — правка остаётся открытой, а не сохраняется на полуслове.
          if (document.hasFocus()) void save(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            refocus.current = true;
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
