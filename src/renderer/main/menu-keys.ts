/**
 * Куда перейти стрелкой в меню: по кругу; если ни один пункт не в фокусе — на первый (вниз) или последний (вверх).
 * at — номер пункта в фокусе (-1 — никакой), count — сколько пунктов, step — 1 вниз, -1 вверх.
 */
export function menuFocusStep(at: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (at < 0) return step === 1 ? 0 : count - 1;
  return (at + step + count) % count;
}
