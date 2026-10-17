import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AI_QUESTION_MAX,
  aiCaption,
  type AiFailure,
  type AiFinished,
  type AiJob,
  type AiMeetingView,
  type AiQuestion,
  type AiStartResult,
} from '../../shared/ai';
import { aiPlainText } from '../../shared/ai-markdown';
import {
  AI_FOOT,
  aiAnnouncement,
  aiBlockVisible,
  aiBusyText,
  aiStageText,
  AI_BUSY_TEXT,
  ASK_PLACEHOLDER,
  ASK_PLACEHOLDER_WAIT,
  NO_MODEL_TEXT,
  summaryAction,
} from './ai-block';
import { AiMarkdown } from './AiMarkdown';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText } from './errors';
import { useAiMeeting, useAiState, useCopiedFlag } from './hooks';
import { SparkIcon } from './icons';

/** Свёрнутые блоки итогов: встреча помнит «Свернуть», пока программа запущена. */
const collapsedMeetings = new Set<string>();

export interface AiPanel {
  meetingId: string;
  view: AiMeetingView | null;
  /** Запрос по этой встрече. */
  job: AiJob | null;
  /** Модель занята другой встречей. */
  other: AiJob | null;
  failure: AiFailure | null;
  /** Последний сохранённый ответ (для экранного диктора). */
  finished: AiFinished | null;
  visible: boolean;
  /** «Модель не скачана» — после нажатия «Итоги встречи» или «Спросить». */
  noModel: boolean;
  /** «Модель сейчас занята» — main ответил «busy» (модель удаляется, готовится другой запрос, программа закрывается). */
  busyNotice: boolean;
  /** «Итоги встречи» в шапке: итоги есть — развернуть блок; нет — начать. */
  openSummary(): void;
  /** «Обновить» (после «Заменить») и «Повторить». */
  summarize(): void;
  ask(question: string): Promise<boolean>;
  stop(): void;
  collapse(): void;
  /** «Закрыть» у «Модель не скачана». */
  close(): void;
  /** «Закрыть» у «Модель сейчас занята». */
  closeBusy(): void;
  /** Развернуть блок и показать его (переход из найденного). */
  reveal(): void;
  /** Растёт с каждым reveal(): блок прокручивается в поле зрения. */
  revealed: number;
  deleteQuestion(questionId: string): void;
}

/**
 * Состояние блока итогов встречи: ai.json, работа модели, открыт ли блок. textKey — текст встречи (меняется — пометка
 * «текст меняли» пересчитывается).
 */
export function useAiPanel(meetingId: string, textKey: unknown, onError: (message: string) => void): AiPanel {
  const [view, setView] = useAiMeeting(meetingId, textKey, onError);
  const state = useAiState();
  const [opened, setOpened] = useState(false);
  const [noModel, setNoModel] = useState(false);
  const [busyNotice, setBusyNotice] = useState(false);
  const [collapsed, setCollapsed] = useState(() => collapsedMeetings.has(meetingId));
  const [revealed, setRevealed] = useState(0);
  const job = state.job?.meetingId === meetingId ? state.job : null;
  const other = state.job && state.job.meetingId !== meetingId ? state.job : null;
  const failure = state.failures.find((f) => f.meetingId === meetingId) ?? null;

  // Ушли со встречи — её прошлая неудача (и несохранённый ответ) больше не показывается.
  useEffect(
    () => () => {
      window.textmeet.dismissAiFailure(meetingId).catch(() => undefined);
    },
    [meetingId],
  );

  const expand = useCallback(() => {
    collapsedMeetings.delete(meetingId);
    setCollapsed(false);
    setOpened(true);
  }, [meetingId]);
  const reveal = useCallback(() => {
    expand();
    setRevealed((n) => n + 1);
  }, [expand]);

  const start = async (run: () => Promise<AiStartResult>): Promise<boolean> => {
    expand();
    try {
      const result = await run();
      setNoModel(result === 'no-model');
      setBusyNotice(result === 'busy');
      return result === 'started';
    } catch (err) {
      onError(errorText(err));
      return false;
    }
  };

  const summarize = () => void start(() => window.textmeet.summarize(meetingId));

  return {
    meetingId,
    view,
    job,
    other,
    failure,
    finished: state.finished,
    noModel,
    busyNotice,
    visible: aiBlockVisible({ view, job, failure, opened: opened || noModel || busyNotice, collapsed }),
    openSummary: () => {
      const action = summaryAction(view, other);
      if (action === 'open') expand();
      else if (action === 'summarize') summarize();
      else {
        window.textmeet
          .getAi(meetingId)
          .then((loaded) => {
            setView(loaded);
            if (loaded.doc.summary) expand();
            else summarize();
          })
          .catch((err: unknown) => onError(errorText(err)));
      }
    },
    summarize,
    ask: (question) => start(() => window.textmeet.askAi({ meetingId, question })),
    stop: () => void window.textmeet.stopAi().catch((err: unknown) => onError(errorText(err))),
    collapse: () => {
      collapsedMeetings.add(meetingId);
      setCollapsed(true);
    },
    close: () => {
      setNoModel(false);
      setOpened(false);
    },
    closeBusy: () => {
      setBusyNotice(false);
      setOpened(false);
    },
    reveal,
    revealed,
    deleteQuestion: (questionId) => {
      window.textmeet
        .deleteAiQuestion({ meetingId, questionId })
        .then(setView)
        .catch((err: unknown) => onError(errorText(err)));
    },
  };
}

/** «Итоги встречи» в шапке встречи — слева от «Скопировать для ИИ». */
export function AiSummaryButton({ panel }: { panel: AiPanel }) {
  return (
    <button type="button" className="btn pri" disabled={panel.job !== null} onClick={panel.openSummary}>
      <SparkIcon />
      Итоги встречи
    </button>
  );
}

function CopyLink({ text, label, onError }: { text: string; label: string; onError(message: string): void }) {
  const [copied, markCopied] = useCopiedFlag();
  return (
    <button
      type="button"
      className="lnk"
      aria-label={label}
      onClick={() =>
        navigator.clipboard
          .writeText(aiPlainText(text))
          .then(markCopied)
          .catch((err: unknown) => onError(errorText(err)))
      }
    >
      {copied ? 'Скопировано' : 'Скопировать'}
    </button>
  );
}

/** Ход работы до первого слова — с вращающимся значком. */
function Waiting({ text }: { text: string }) {
  return (
    <div className="ai-wait">
      <span className="spin" aria-hidden="true" />
      {text}
    </div>
  );
}

/** Пишется сейчас: ход работы или текст с курсором. */
function Writing({ job }: { job: AiJob }) {
  const stage = aiStageText(job.stage);
  return stage ? <Waiting text={stage} /> : <AiMarkdown text={job.text} caret />;
}

function FailureView({ failure, onRetry }: { failure: AiFailure; onRetry(): void }) {
  if (failure.failure === 'too-long') return <div className="ai-warn">{failure.message}</div>;
  return (
    <>
      <p className="err" role="alert">
        {failure.message}
      </p>
      {failure.failure === 'engine' && (
        <div className="ai-row">
          <button type="button" className="btn" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
      {failure.text !== null && failure.kind === 'summary' && <AiMarkdown text={failure.text} />}
    </>
  );
}

function QuestionItem({
  item,
  onDelete,
  onError,
}: {
  item: AiQuestion;
  onDelete(): void;
  onError(message: string): void;
}) {
  return (
    <div className="qa-i">
      <div className="qa-q">
        {item.question}
        {item.status === 'stopped' && <span className="qa-note">остановлено</span>}
        <span className="lnks">
          <CopyLink text={item.answer} label={`Скопировать ответ: ${item.question}`} onError={onError} />
          <button type="button" className="lnk" aria-label={`Удалить вопрос: ${item.question}`} onClick={onDelete}>
            Удалить
          </button>
        </span>
      </div>
      <div className="qa-a">
        <AiMarkdown text={item.answer} />
      </div>
    </div>
  );
}

interface BlockProps {
  panel: AiPanel;
  /** «Открыть настройки ИИ». */
  onOpenSettings(): void;
  /** «Перейти» к встрече, которой занята модель. */
  onOpenMeeting(meetingId: string): void;
  onError(message: string): void;
}

/** Блок «Итоги встречи» над текстом встречи (решения Плана 9, §2.2). */
export function AiBlock({ panel, onOpenSettings, onOpenMeeting, onError }: BlockProps) {
  const [question, setQuestion] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousJob = useRef<AiJob | null>(null);
  const section = useRef<HTMLElement>(null);
  const { view, job, other, failure, finished } = panel;

  // Ответ дописан и сохранён — «Итоги готовы» / «Ответ готов» экранному диктору (поток текста ему не читается).
  useEffect(() => {
    const previous = previousJob.current;
    previousJob.current = job;
    setAnnouncement((current) => aiAnnouncement(current, previous, job, finished));
  }, [job, finished]);

  // Перешли из найденного — блок прокручивается в поле зрения.
  useEffect(() => {
    if (panel.revealed > 0) section.current?.scrollIntoView({ block: 'nearest' });
  }, [panel.revealed]);

  const live = (
    <span className="sr-only" role="status">
      {announcement}
    </span>
  );
  // Свёрнутый блок всё равно говорит экранному диктору «Итоги готовы» / «Ответ готов».
  if (!panel.visible) return live;
  const summary = view?.doc.summary ?? null;
  const questions = view?.doc.questions ?? [];
  const summaryJob = job?.kind === 'summary' ? job : null;
  const questionJob = job?.kind === 'question' ? job : null;
  const busy = job !== null || other !== null;
  const summaryFailure = failure?.kind === 'summary' ? failure : null;
  const questionFailure = failure?.kind === 'question' ? failure : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    void panel.ask(text).then((started) => {
      if (started) setQuestion('');
    });
  };

  let caption: string | null = null;
  if (summaryJob) caption = `${summaryJob.modelTitle} · пишет…`;
  else if (summary) caption = aiCaption(summary);

  return (
    <section ref={section} className="ai" aria-label="Итоги встречи" aria-busy={job ? true : undefined}>
      <div className="ai-h">
        <b>Итоги встречи</b>
        {caption && <span>{caption}</span>}
        <span className="lnks">
          {summaryJob ? (
            <>
              <button type="button" className="btn" onClick={panel.stop}>
                Остановить
              </button>
              <button type="button" className="lnk" onClick={panel.collapse}>
                Свернуть
              </button>
            </>
          ) : panel.noModel && !summary ? (
            <button type="button" className="lnk" onClick={panel.close}>
              Закрыть
            </button>
          ) : (
            <>
              {summary && <CopyLink text={summary.text} label="Скопировать итоги" onError={onError} />}
              {summary && (
                <button type="button" className="lnk" disabled={busy} onClick={() => setConfirm(true)}>
                  Обновить
                </button>
              )}
              <button type="button" className="lnk" onClick={panel.collapse}>
                Свернуть
              </button>
            </>
          )}
        </span>
      </div>

      {other && (
        <p>
          {aiBusyText(other)}{' '}
          <button type="button" className="lnk" onClick={() => onOpenMeeting(other.meetingId)}>
            Перейти
          </button>
        </p>
      )}

      {panel.busyNotice && !job && !other && (
        <p>
          {AI_BUSY_TEXT}{' '}
          <button type="button" className="lnk" onClick={panel.closeBusy}>
            Закрыть
          </button>
        </p>
      )}

      {panel.noModel && (
        <>
          <p>{NO_MODEL_TEXT}</p>
          <div className="ai-row">
            <button type="button" className="btn pri" onClick={onOpenSettings}>
              Открыть настройки ИИ
            </button>
          </div>
        </>
      )}

      {summaryJob && <Writing job={summaryJob} />}
      {!summaryJob && summary && (
        <>
          {view?.stale && (
            <div className="ai-warn">
              Текст встречи меняли после итогов.{' '}
              <button type="button" className="lnk" disabled={busy} onClick={() => setConfirm(true)}>
                Обновить итоги
              </button>
            </div>
          )}
          <AiMarkdown text={summary.text} />
        </>
      )}
      {summaryFailure && <FailureView failure={summaryFailure} onRetry={panel.summarize} />}

      {(questions.length > 0 || questionJob || questionFailure) && (
        <div className="qa">
          {questions.map((item) => (
            <QuestionItem key={item.id} item={item} onDelete={() => panel.deleteQuestion(item.id)} onError={onError} />
          ))}
          {questionJob && (
            <div className="qa-i" aria-busy="true">
              <div className="qa-q">
                {questionJob.question}
                <span className="lnks">
                  <button type="button" className="lnk" onClick={panel.stop}>
                    Остановить
                  </button>
                </span>
              </div>
              <div className="qa-a">
                <Writing job={questionJob} />
              </div>
            </div>
          )}
          {questionFailure && (
            <div className="qa-i">
              <div className="qa-q">{questionFailure.question}</div>
              <FailureView failure={questionFailure} onRetry={() => void panel.ask(questionFailure.question ?? '')} />
              {questionFailure.text !== null && (
                <div className="qa-a">
                  <AiMarkdown text={questionFailure.text} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!panel.noModel && (
        <form className={busy ? 'ask off' : 'ask'} onSubmit={submit}>
          <input
            type="text"
            aria-label="Свой вопрос к встрече"
            placeholder={summaryJob ? ASK_PLACEHOLDER_WAIT : ASK_PLACEHOLDER}
            maxLength={AI_QUESTION_MAX}
            value={question}
            disabled={busy}
            onChange={(e) => setQuestion(e.currentTarget.value)}
          />
          <button type="submit" className="btn" disabled={busy || question.trim() === ''}>
            Спросить
          </button>
        </form>
      )}
      {(summary || questions.length > 0 || job) && <p className="ai-foot">{AI_FOOT}</p>}
      {live}

      {confirm && (
        <ConfirmDialog
          title="Заменить итоги?"
          confirmLabel="Заменить"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            panel.summarize();
          }}
        >
          Модель напишет итоги заново, нынешние пропадут. Ваши вопросы и ответы останутся.
        </ConfirmDialog>
      )}
    </section>
  );
}
