import { createContext } from 'react';

/**
 * Место для строки спикеров в шапке встречи — под названием (решения Плана 8, §2.2). Нет места (null) — спикеры
 * показываются над текстом, как раньше. Отдельный модуль: шапка (MeetingPane) и текст (TranscriptView) иначе
 * импортировали бы друг друга.
 */
export const SpeakerSlotContext = createContext<HTMLElement | null>(null);
