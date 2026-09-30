import type { KeyboardEvent } from 'react';

/** Tab и Shift+Tab ходят по кругу внутри окна: кнопки за ним (например, «Начать запись») недоступны. */
export function keepFocusInside(dialog: HTMLElement, event: KeyboardEvent<HTMLElement>): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
