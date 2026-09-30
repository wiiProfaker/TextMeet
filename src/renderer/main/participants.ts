import { parseParticipants } from './format';

/** Кнопки быстрого выбора; остальное — в поле «другое». */
export const CHOICES = [2, 3, 4, 5, 6] as const;

/** Выбор в блоке «Сколько человек было…»: кнопка 2–6 или своё число в поле «другое». */
export interface ParticipantsChoice {
  choice: number | null;
  other: string;
}

export const EMPTY_CHOICE: ParticipantsChoice = { choice: null, other: '' };

/** Выбор из уже известного числа: 2–6 — кнопкой, остальное — в поле «другое». */
export function choiceFor(hint: number | null): ParticipantsChoice {
  if (hint === null) return EMPTY_CHOICE;
  return (CHOICES as readonly number[]).includes(hint) ? { choice: hint, other: '' } : { choice: null, other: String(hint) };
}

/** Что выбрано: число; null — ничего не выбрано; 'invalid' — в поле «другое» не число от 1 до 50. */
export function readChoice(value: ParticipantsChoice): number | null | 'invalid' {
  if (value.other.trim() !== '') return parseParticipants(value.other) ?? 'invalid';
  return value.choice;
}
