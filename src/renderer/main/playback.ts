// Прослушивание встречи и текст: какая реплика звучит, когда текст идёт за звуком. Чистые функции.

export const SPEEDS = [1, 1.5, 2] as const;

export const speedLabel = (speed: number): string => `${String(speed).replace('.', ',')}×`;

export const nextSpeed = (speed: number): number =>
  SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1;

/**
 * Звучащая реплика — последняя, чьё начало не позже места записи; до первой реплики — -1.
 * starts — начала реплик по возрастанию (так их пишет расшифровка и правки).
 */
export function segmentAt(starts: readonly number[], position: number): number {
  let low = 0;
  let high = starts.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((starts[middle] ?? Infinity) <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Человек сам листал текст недавно — за звуком его не прокручиваем, чтобы не вырывать из рук. */
export const MANUAL_SCROLL_PAUSE_MS = 5000;

export function shouldFollow(state: { playing: boolean; editing: boolean; now: number; lastManualScroll: number }): boolean {
  return state.playing && !state.editing && state.now - state.lastManualScroll >= MANUAL_SCROLL_PAUSE_MS;
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** Где нажата клавиша в тексте встречи: поле правки, кнопка времени реплики, другая кнопка, остальное. */
export type ScrollKeyTarget = 'field' | 'time' | 'button' | 'other';

/**
 * Клавиша в тексте встречи — это человек листает сам (текст на время перестаёт идти за звуком)? В поле клавиши
 * двигают курсор, Пробел на кнопке нажимает её, стрелки на кнопке времени — переход между репликами, не листание.
 */
export function isManualScrollKey(key: string, target: ScrollKeyTarget): boolean {
  if (!SCROLL_KEYS.has(key) || target === 'field' || target === 'time') return false;
  return !(key === ' ' && target === 'button');
}
