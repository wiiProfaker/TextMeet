// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiFailure, AiFinished, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';

export const ASK_PLACEHOLDER = 'Свой вопрос к встрече — например, что решили по срокам?';
/** Пока пишутся итоги этой встречи, спросить нельзя. */
export const ASK_PLACEHOLDER_WAIT = 'Свой вопрос к встрече — можно задать, когда итоги допишутся';
export const AI_FOOT = 'Отвечает модель на вашем компьютере — важное проверяйте по тексту встречи.';
export const NO_MODEL_TEXT =
  'Итоги делает модель на вашем компьютере. Скачайте её один раз (около 6 ГБ) — дальше всё работает без интернета.';

/** Ход работы до первого слова: «Готовим модель…» (загрузка в память), «Читаем встречу…»; пишет — null. */
export function aiStageText(stage: AiJobStage): string | null {
  if (stage === 'loading') return 'Готовим модель…';
  if (stage === 'reading') return 'Читаем встречу…';
  return null;
}

/** Модель занята другой встречей: блок называет её. */
export function aiBusyText(job: AiJob): string {
  return job.kind === 'summary'
    ? `Модель сейчас пишет итоги встречи «${job.meetingTitle}».`
    : `Модель сейчас отвечает на вопрос по встрече «${job.meetingTitle}».`;
}

export interface AiBlockShown {
  view: AiMeetingView | null;
  /** Запрос по этой встрече. */
  job: AiJob | null;
  failure: AiFailure | null;
  /** Человек открыл блок кнопкой «Итоги встречи». */
  opened: boolean;
  /** «Свернуть». */
  collapsed: boolean;
}

/** Блок виден, если не свёрнут и в нём есть что показать (или его открыли кнопкой). */
export function aiBlockVisible(input: AiBlockShown): boolean {
  if (input.collapsed) return false;
  const doc = input.view?.doc;
  return input.opened || input.job !== null || input.failure !== null || !!doc?.summary || (doc?.questions.length ?? 0) > 0;
}

/**
 * Ответ по встрече дописан и сохранён — что сказать экранному диктору: «Итоги готовы» / «Ответ готов». Остановленный,
 * несохранённый и неудачный — ничего.
 */
export function aiFinishedText(previous: AiJob | null, current: AiJob | null, finished: AiFinished | null): string | null {
  if (!previous || current || !finished) return null;
  if (finished.meetingId !== previous.meetingId || finished.kind !== previous.kind || finished.status !== 'done') return null;
  return previous.kind === 'summary' ? 'Итоги готовы' : 'Ответ готов';
}

/**
 * Что сказать экранному диктору после смены состояния: пока запрос идёт — ничего (так следующий «Ответ готов» снова
 * будет новым текстом и прозвучит), ответ дописан и сохранён — «Итоги готовы» / «Ответ готов», иначе — прежнее.
 */
export function aiAnnouncement(
  current: string,
  previous: AiJob | null,
  job: AiJob | null,
  finished: AiFinished | null,
): string {
  if (job) return '';
  return aiFinishedText(previous, job, finished) ?? current;
}

/**
 * «Итоги встречи» в шапке: есть итоги (или модель занята другой встречей) — показать блок, нет — сделать итоги;
 * ai.json ещё читается — сначала узнать, есть ли итоги (иначе сохранённые заменились бы без «Заменить итоги?»).
 */
export function summaryAction(view: AiMeetingView | null, other: AiJob | null): 'open' | 'summarize' | 'load' {
  if (view?.doc.summary || other) return 'open';
  return view ? 'summarize' : 'load';
}
