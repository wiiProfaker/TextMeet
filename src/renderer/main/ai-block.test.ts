import { describe, expect, it } from 'vitest';
import { EMPTY_AI_DOC, type AiFailure, type AiJob, type AiMeetingView } from '../../shared/ai';
import { aiBlockVisible, aiBusyText, aiCaption, aiFinishedText, aiStageText } from './ai-block';

const job = (over: Partial<AiJob> = {}): AiJob => ({
  meetingId: 'm',
  meetingTitle: 'Планёрка с дизайнерами',
  kind: 'summary',
  question: null,
  modelTitle: 'Qwen3.5 9B',
  stage: 'writing',
  text: '',
  ...over,
});

const failure: AiFailure = { meetingId: 'm', kind: 'summary', question: null, failure: 'engine', message: 'x', text: null };
const empty: AiMeetingView = { doc: EMPTY_AI_DOC, broken: false, stale: false };

describe('AI block texts', () => {
  it('shows how the model is doing before the first word', () => {
    expect(aiStageText('loading')).toBe('Готовим модель…');
    expect(aiStageText('reading')).toBe('Читаем встречу…');
    expect(aiStageText('writing')).toBeNull();
  });

  it('signs the summary with the model and the time, and marks a stopped one', () => {
    const createdAt = new Date(2026, 8, 27, 16, 55).toISOString();
    expect(aiCaption({ modelTitle: 'Qwen3.5 9B', createdAt, status: 'done' })).toBe('Qwen3.5 9B · 27.09, 16:55');
    expect(aiCaption({ modelTitle: 'Qwen3.5 9B', createdAt, status: 'stopped' }, true)).toBe(
      'Qwen3.5 9B · 27.09.2026, 16:55 · остановлено',
    );
  });

  it('names the meeting the model is busy with', () => {
    expect(aiBusyText(job())).toBe('Модель сейчас пишет итоги встречи «Планёрка с дизайнерами».');
    expect(aiBusyText(job({ kind: 'question' }))).toBe('Модель сейчас отвечает на вопрос по встрече «Планёрка с дизайнерами».');
  });
});

describe('aiBlockVisible', () => {
  const shown = { view: empty, job: null, failure: null, opened: false, collapsed: false };

  it('hides an empty block until it is opened', () => {
    expect(aiBlockVisible(shown)).toBe(false);
    expect(aiBlockVisible({ ...shown, opened: true })).toBe(true);
  });

  it('shows the block with a summary, questions, a request or a failure — unless it is collapsed', () => {
    const summary = { text: '-', model: 'q', modelTitle: 'Q', createdAt: '2026-10-14T10:00:00.000Z', status: 'done' as const, sourceHash: 'h' };
    expect(aiBlockVisible({ ...shown, view: { ...empty, doc: { ...EMPTY_AI_DOC, summary } } })).toBe(true);
    expect(aiBlockVisible({ ...shown, job: job() })).toBe(true);
    expect(aiBlockVisible({ ...shown, failure })).toBe(true);
    expect(aiBlockVisible({ ...shown, job: job(), collapsed: true })).toBe(false);
  });
});

describe('aiFinishedText', () => {
  it('announces a finished summary or answer, but not a failure or a request still going', () => {
    expect(aiFinishedText(job(), null, null)).toBe('Итоги готовы');
    expect(aiFinishedText(job({ kind: 'question' }), null, null)).toBe('Ответ готов');
    expect(aiFinishedText(job(), null, failure)).toBeNull();
    expect(aiFinishedText(job(), job(), null)).toBeNull();
    expect(aiFinishedText(null, null, null)).toBeNull();
  });
});
