// Блок «Итоги встречи» (решения Плана 9, §2.2; листы 18–20 макета): подписи и когда блок виден. Чистые функции —
// проверяются модульными тестами.
import type { AiAnswerStatus, AiFailure, AiJob, AiJobStage, AiMeetingView } from '../../shared/ai';
import { formatStamp } from '../../shared/format';

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

/** Подпись итогов или ответа: «Qwen3.5 9B · 27.09, 16:55»; остановленный — с «· остановлено». */
export function aiCaption(record: { modelTitle: string; createdAt: string; status: AiAnswerStatus }, withYear = false): string {
  const parts = [record.modelTitle, formatStamp(record.createdAt, withYear)];
  if (record.status === 'stopped') parts.push('остановлено');
  return parts.join(' · ');
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

/** Ответ по встрече закончился (не сбой) — что сказать экранному диктору: «Итоги готовы» / «Ответ готов». */
export function aiFinishedText(previous: AiJob | null, current: AiJob | null, failure: AiFailure | null): string | null {
  if (!previous || current || failure) return null;
  return previous.kind === 'summary' ? 'Итоги готовы' : 'Ответ готов';
}
