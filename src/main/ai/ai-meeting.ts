// Итоги и вопросы встречи для окна (решения Плана 9, §2.2): ai.json и пометка «Текст встречи меняли после итогов».
import type { AiMeetingView } from '../../shared/ai';
import { loadExportDoc } from '../export/export-meeting';
import type { Logger } from '../logger';
import { sourceHash } from './ai-messages';
import { readAi, updateAi } from './ai-store';

export async function aiView(libraryDir: string, meetingId: string): Promise<AiMeetingView> {
  const { doc, broken } = await readAi(libraryDir, meetingId);
  let stale = false;
  if (doc.summary) {
    // Текста нет или он не читается — сравнивать не с чем: пометку не показываем.
    const current = await loadExportDoc(libraryDir, meetingId).catch(() => null);
    stale = current !== null && sourceHash(current) !== doc.summary.sourceHash;
  }
  return { doc, broken, stale };
}

/** «Удалить» у своего вопроса — без подтверждения. */
export async function deleteQuestion(
  libraryDir: string,
  meetingId: string,
  questionId: string,
  logger: Pick<Logger, 'warn'>,
): Promise<AiMeetingView> {
  await updateAi(
    libraryDir,
    meetingId,
    (doc) =>
      doc.questions.some((q) => q.id === questionId)
        ? { ...doc, questions: doc.questions.filter((q) => q.id !== questionId) }
        : doc,
    logger,
  );
  return aiView(libraryDir, meetingId);
}
