import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AI_PROMPT_MAX, DEFAULT_AI_PROMPT, resolveAiPrompt } from '../../shared/ai-prompt';
import type { SettingsState } from '../../shared/ipc';
import { errorText } from './errors';

/** Пауза набора перед сохранением запроса. */
const SAVE_DELAY_MS = 500;

interface Props {
  /** Значение из настроек: null — стандартный запрос, '' — без запроса. */
  aiPrompt: string | null;
  /** Отправить в main; ответ — новые настройки. */
  save(prompt: string | null): Promise<SettingsState>;
  onSaved(next: SettingsState): void;
  /** Ошибка (null — убрать) на странице настроек, пока она открыта. */
  onError(message: string | null): void;
  /** Сохранение не удалось, когда со страницы настроек уже ушли: показывает строка ошибки слева. */
  onErrorAfterLeave(message: string): void;
}

/**
 * Настройки → «ИИ» (решения Плана 6, §2.2): «Запрос для ИИ». Кнопки «Сохранить» нет: текст уходит в main через
 * полсекунды после последней набранной буквы, при уходе из поля и при уходе со страницы настроек. Не сохранилось —
 * текст остаётся в поле, и следующий уход из поля пробует снова.
 */
export function AiSettings({ aiPrompt, save, onSaved, onError, onErrorAfterLeave }: Props) {
  const [text, setText] = useState(() => resolveAiPrompt(aiPrompt));
  const hintId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  /** Набранное (или «Вернуть стандартный» — null), но ещё не отправленное. */
  const pending = useRef<{ value: string | null } | null>(null);
  /** Сколько сохранений ещё не ответило. */
  const inFlight = useRef(0);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const props = useRef({ save, onSaved, onError, onErrorAfterLeave });
  props.current = { save, onSaved, onError, onErrorAfterLeave };

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const send = useCallback((value: string | null) => {
    inFlight.current += 1;
    props.current.save(value).then(
      (next) => {
        inFlight.current -= 1;
        props.current.onSaved(next);
        if (mounted.current) props.current.onError(null);
      },
      (err: unknown) => {
        inFlight.current -= 1;
        const message = errorText(err);
        if (!mounted.current) {
          props.current.onErrorAfterLeave(message);
          return;
        }
        // Если после этого ничего не набрали, следующий уход из поля отправит этот текст снова.
        pending.current ??= { value };
        props.current.onError(message);
      },
    );
  }, []);

  const flush = useCallback(() => {
    cancelTimer();
    const next = pending.current;
    pending.current = null;
    if (next) send(next.value);
  }, [send]);

  // Ответ main не трогает поле, пока в нём печатают, есть неотправленный текст или ждём ответа на сохранение:
  // иначе ответ на более раннее сохранение на миг вернул бы старый текст.
  useEffect(() => {
    if (document.activeElement === field.current || pending.current || inFlight.current > 0) return;
    setText(resolveAiPrompt(aiPrompt));
  }, [aiPrompt]);

  // Ушли со страницы настроек — набранное отправляется сразу.
  useEffect(() => {
    mounted.current = true;
    return () => {
      flush();
      mounted.current = false;
    };
  }, [flush]);

  const change = (value: string) => {
    setText(value);
    pending.current = { value };
    cancelTimer();
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const reset = () => {
    cancelTimer();
    pending.current = null;
    setText(DEFAULT_AI_PROMPT);
    send(null);
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
            aria-describedby={hintId}
            rows={8}
            maxLength={AI_PROMPT_MAX}
            value={text}
            onChange={(e) => change(e.currentTarget.value)}
            onBlur={flush}
          />
          <small id={hintId}>
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
