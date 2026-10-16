import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_AI_DOC, type AiDoc } from '../../shared/ai';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting } from '../library/library';
import { aiPath, readAi, updateAi } from './ai-store';

const summary = {
  text: '- Главное',
  model: 'qwen3.5-9b',
  modelTitle: 'Qwen3.5 9B',
  createdAt: '2026-10-14T10:00:00.000Z',
  status: 'done' as const,
  sourceHash: 'abc',
};

async function meeting(): Promise<{ lib: string; id: string }> {
  const lib = makeTempDir('textmeet-ai-');
  const created = await createMeeting(lib, { source: 'recording', status: 'done', title: 'Встреча', now: new Date(2026, 9, 14) });
  return { lib, id: created.id };
}

describe('ai.json', () => {
  it('is empty while there is no file', async () => {
    const { lib, id } = await meeting();
    expect(await readAi(lib, id)).toEqual({ doc: EMPTY_AI_DOC, broken: false });
  });

  it('writes and reads summaries and questions', async () => {
    const { lib, id } = await meeting();
    const logger = { warn: vi.fn() };
    await updateAi(lib, id, (doc) => ({ ...doc, summary }), logger);
    const question = { id: 'q1', question: 'Сроки?', answer: 'Пятница.', model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: summary.createdAt, status: 'stopped' as const };
    await updateAi(lib, id, (doc) => ({ ...doc, questions: [...doc.questions, question] }), logger);
    expect(await readAi(lib, id)).toEqual({ doc: { version: 1, summary, questions: [question] }, broken: false });
  });

  it('reads an older file without the status as a finished answer', async () => {
    const { lib, id } = await meeting();
    const { status: _status, ...old } = summary;
    writeFileSync(aiPath(lib, id), JSON.stringify({ version: 1, summary: old }));
    const { doc } = await readAi(lib, id);
    expect(doc.summary?.status).toBe('done');
    expect(doc.questions).toEqual([]);
  });

  it('shows nothing for a broken file and keeps it until something new is saved', async () => {
    const { lib, id } = await meeting();
    writeFileSync(aiPath(lib, id), '{ сломано');
    expect(await readAi(lib, id)).toEqual({ doc: EMPTY_AI_DOC, broken: true });
    // Ничего не изменилось — файл не перезаписан.
    const logger = { warn: vi.fn() };
    await updateAi(lib, id, (doc) => doc, logger);
    expect(readFileSync(aiPath(lib, id), 'utf8')).toBe('{ сломано');
    await updateAi(lib, id, (doc): AiDoc => ({ ...doc, summary }), logger);
    expect((await readAi(lib, id)).doc.summary).toEqual(summary);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('файл заменяется новыми'));
  });

  it('treats a file of a newer version as broken', async () => {
    const { lib, id } = await meeting();
    writeFileSync(aiPath(lib, id), JSON.stringify({ version: 2, summary: null, questions: [] }));
    expect((await readAi(lib, id)).broken).toBe(true);
  });

  it('applies changes one after another', async () => {
    const { lib, id } = await meeting();
    const logger = { warn: vi.fn() };
    const add = (n: number) =>
      updateAi(lib, id, (doc) => ({ ...doc, questions: [...doc.questions, { ...summary, id: `q${n}`, question: `${n}`, answer: '' }] }), logger);
    await Promise.all([add(1), add(2), add(3)]);
    expect((await readAi(lib, id)).doc.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});
