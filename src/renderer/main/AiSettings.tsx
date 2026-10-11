import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_PROMPT_MAX, DEFAULT_AI_PROMPT, resolveAiPrompt } from '../../shared/ai-prompt';

/** Пауза набора перед сохранением запроса. */
const SAVE_DELAY_MS = 500;

interface Props {
  /** Значение из настроек: null — стандартный запрос, '' — без запроса. */
  aiPrompt: string | null;
  /** Отправить в main; ошибку показывает страница настроек, набранный текст остаётся в поле. */
  save(prompt: string | null): void;
}

/**
 * Настройки → «ИИ» (решения Плана 6, §2.2): «Запрос для ИИ». Кнопки «Сохранить» нет: текст уходит в main через
 * полсекунды после последней набранной буквы, при уходе из поля и при уходе со страницы настроек.
 */
export function AiSettings({ aiPrompt, save }: Props) {
  const [text, setText] = useState(() => resolveAiPrompt(aiPrompt));
  const field = useRef<HTMLTextAreaElement>(null);
  /** Набранный, но ещё не отправленный текст. */
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSave = useRef(save);
  latestSave.current = save;

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const flush = useCallback(() => {
    cancelTimer();
    const value = pending.current;
    pending.current = null;
    if (value !== null) latestSave.current(value);
  }, []);

  // Пока поле в фокусе, ответ main не перезаписывает набираемый текст.
  useEffect(() => {
    if (document.activeElement !== field.current) setText(resolveAiPrompt(aiPrompt));
  }, [aiPrompt]);

  // Ушли со страницы настроек — набранное отправляется сразу.
  useEffect(() => flush, [flush]);

  const change = (value: string) => {
    setText(value);
    pending.current = value;
    cancelTimer();
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const reset = () => {
    cancelTimer();
    pending.current = null;
    setText(DEFAULT_AI_PROMPT);
    latestSave.current(null);
    // Ссылка исчезает — фокус в поле.
    field.current?.focus();
  };

  return (
    <section className="sec">
      <h2>ИИ</h2>
      <div className="fld">
        <div className="lb">Запрос для ИИ</div>
        <div className="ctl">
          <textarea
            ref={field}
            className="ta"
            aria-label="Запрос для ИИ"
            rows={8}
            maxLength={AI_PROMPT_MAX}
            value={text}
            onChange={(e) => change(e.currentTarget.value)}
            onBlur={flush}
          />
          <small>
            Добавляется перед текстом встречи, когда вы нажимаете «Скопировать для ИИ». Вставьте скопированное в
            Claude, ChatGPT или другой чат.
          </small>
          {text !== DEFAULT_AI_PROMPT && (
            <button type="button" className="lnk" onClick={reset}>
              Вернуть стандартный
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
