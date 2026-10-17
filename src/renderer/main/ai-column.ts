// Колонка «Итоги встречи» справа от текста (решения Плана 8, §2.1): доля ширины области встречи, которую двигает
// ручка между колонками. Одна на всю программу и переживает перезапуск — хранится в localStorage окна (настройка
// окна, не библиотеки).

/** Доля ширины области встречи под колонку итогов. */
export const AI_SHARE_DEFAULT = 0.38;
export const AI_SHARE_MIN = 0.2;
export const AI_SHARE_MAX = 0.6;
/** Шаг стрелок ←/→ на ручке. */
export const AI_SHARE_STEP = 0.02;
export const AI_SHARE_KEY = 'textmeet.aiColumnShare';

export function clampShare(share: number): number {
  if (!Number.isFinite(share)) return AI_SHARE_DEFAULT;
  return Math.min(AI_SHARE_MAX, Math.max(AI_SHARE_MIN, share));
}

/** Доля по положению указателя: правая граница области минус X, делённое на ширину. */
export function shareFromPointer(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return AI_SHARE_DEFAULT;
  return clampShare((rect.left + rect.width - clientX) / rect.width);
}

/** Ошибки хранилища и мусор в нём — доля по умолчанию. */
export function loadShare(storage: Pick<Storage, 'getItem'> | null): number {
  try {
    const stored = storage?.getItem(AI_SHARE_KEY);
    return stored ? clampShare(Number(stored)) : AI_SHARE_DEFAULT;
  } catch {
    return AI_SHARE_DEFAULT;
  }
}

/** Не сохранилось (хранилище недоступно) — не страшно: ширина останется до перезапуска. */
export function saveShare(storage: Pick<Storage, 'setItem'> | null, share: number): void {
  try {
    storage?.setItem(AI_SHARE_KEY, String(clampShare(share)));
  } catch {
    // Ширина колонки — удобство, не данные.
  }
}
