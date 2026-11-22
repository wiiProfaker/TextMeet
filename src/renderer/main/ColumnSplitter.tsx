import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { AI_SHARE_MAX, AI_SHARE_MIN, AI_SHARE_STEP, clampShare, saveShare, shareFromPointer } from './ai-column';

/** localStorage окна; недоступен (запрещён) — null: ширина просто не запомнится. */
function windowStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Ручка между текстом встречи и колонкой итогов (решения Плана 8, §2.1): тянуть мышью или стрелками ←/→ с фокусом.
 * Ширина запоминается по отпусканию и после клавиш.
 */
export function ColumnSplitter({
  share,
  onChange,
  areaRef,
}: {
  share: number;
  onChange(share: number): void;
  /** Область встречи: от её правой границы меряется ширина итогов. */
  areaRef: RefObject<HTMLElement | null>;
}) {
  const latest = useRef(share);
  latest.current = share;

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const area = areaRef.current;
    if (!area || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = shareFromPointer(event.clientX, area.getBoundingClientRect());
    latest.current = next;
    onChange(next);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    // Ручка двигается вместе со стрелкой: влево — итоги шире, вправо — уже.
    const step = event.key === 'ArrowLeft' ? AI_SHARE_STEP : event.key === 'ArrowRight' ? -AI_SHARE_STEP : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = clampShare(share + step);
    onChange(next);
    saveShare(windowStorage(), next);
  };

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина итогов"
      aria-valuemin={Math.round(AI_SHARE_MIN * 100)}
      aria-valuemax={Math.round(AI_SHARE_MAX * 100)}
      aria-valuenow={Math.round(share * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        saveShare(windowStorage(), latest.current);
      }}
      onKeyDown={keys}
    />
  );
}
