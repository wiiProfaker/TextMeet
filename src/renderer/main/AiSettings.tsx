import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AI_PROMPT_MAX, DEFAULT_AI_PROMPT, pasteCut, resolveAiPrompt } from '../../shared/ai-prompt';
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
 * Вкладка настроек «ИИ» (решения Плана 6, §2.2): «Запрос для ИИ». Кнопки «Сохранить» нет: текст уходит в main через
 * полсекунды после последней набранной буквы, при уходе из поля и при уходе с вкладки или из настроек. Не сохранилось —
 * текст остаётся в поле, и следующий уход из поля пробует снова.
 */
export function AiSettings({ aiPrompt, save, onSaved, onError, onErrorAfterLeave }: Props) {
  const [text, setText] = useState(() => resolveAiPrompt(aiPrompt));
  /** Последняя вставка не поместилась — поле обрезало её (подсказка до следующей правки). */
  const [cut, setCut] = useState(false);
  const pastedCut = useRef(false);
  const hintId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  /** Набранное (или «Вернуть стандартный» — null), но ещё не отправленное. */
  const pending = useRef<{ value: string | null } | null>(null);
  /** Сколько сохранений ещё не ответило. */
  const inFlight = useRef(0);
  /** Номер последнего отправленного сохранения: ответ на более раннее не решает, что в поле и что показать. */
  const lastSent = useRef(0);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const props = useRef({ save, onSaved, onError, onErrorAfterLeave });
  props.current = { save, onSaved, onError, onErrorAfterLeave };

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const send = useCallback((value: string | null) => {
    const sent = ++lastSent.current;
    inFlight.current += 1;
    props.current.save(value).then(
      (next) => {
        inFlight.current -= 1;
        props.current.onSaved(next);
        if (sent === lastSent.current && mounted.current) props.current.onError(null);
      },
      (err: unknown) => {
        inFlight.current -= 1;
        // Уже отправлен более новый текст (или «Вернуть стандартный»): он отвечает за себя сам, а этот, более
        // ранний, снова не отправляется.
        if (sent !== lastSent.current) return;
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
    // Подсказка «Обрезано…» — до следующей правки после той вставки.
    if (pastedCut.current) pastedCut.current = false;
    else setCut(false);
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
          onPaste={(e) => {
            const area = e.currentTarget;
            const cut = pasteCut({
              length: area.value.length,
              selected: area.selectionEnd - area.selectionStart,
              pasted: e.clipboardData.getData('text').length,
            });
            pastedCut.current = cut;
            setCut(cut);
          }}
          onBlur={flush}
        />
        {cut && (
          <small className="cut" role="status">
            Обрезано до {AI_PROMPT_MAX} знаков.
          </small>
        )}
        <small id={hintId}>
          Используется для «Итогов встречи» и добавляется перед текстом, когда вы нажимаете «Скопировать для ИИ».
        </small>
        {text !== DEFAULT_AI_PROMPT && (
          <button type="button" className="lnk" onClick={reset}>
            Вернуть стандартный
          </button>
        )}
      </div>
    </div>
  );
}
