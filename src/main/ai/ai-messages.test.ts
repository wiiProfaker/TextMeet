import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { ExportDoc } from '../../shared/export-doc';
import { AI_RULES, aiMessages, fitsWindow, meetingText, sourceHash, stripPreamble, summaryTask } from './ai-messages';

const doc: ExportDoc = {
  title: 'Созвон',
  metaLine: '27 сентября 2026, 16:20 · 32 мин',
  participantsLine: 'Участники: Я, Ирина',
  paragraphs: [{ speaker: 'Ирина', time: '0:05', text: 'Переносим на пятницу.' }],
};

describe('stripPreamble', () => {
  it('stripPreamble drops an introduction line and keeps the rest', () => {
    expect(stripPreamble('На основе предоставленного текста встречи, вот итоги:\n\n**Главное**\n1. …')).toBe('**Главное**\n1. …');
    expect(stripPreamble('Вот итоги встречи:\n- пункт')).toBe('- пункт');
    expect(stripPreamble('Исходя из расшифровки:\nТекст')).toBe('Текст');
  });

  it('stripPreamble keeps answers that start with the content', () => {
    expect(stripPreamble('**Главное**\nНа основе опроса решили…')).toBe('**Главное**\nНа основе опроса решили…');
    expect(stripPreamble('Вот так: да.')).toBe('Вот так: да.'); // одна строка — не трогаем
    expect(stripPreamble('Вот итоги:\n')).toBe('Вот итоги:\n'); // за вступлением пока ничего — не трогаем
    expect(stripPreamble('Вотум доверия обсуждали:\nТекст')).toBe('Вотум доверия обсуждали:\nТекст');
  });

  it('AI_RULES ask to start with the content and keep headings short', () => {
    expect(AI_RULES).toContain('без вступлений');
    expect(AI_RULES).toContain('«Главное», «Решения», «Задачи», «Открытые вопросы»');
  });
});

describe('aiMessages', () => {
  it('puts the hidden rules first, then the meeting, then the task', () => {
    const messages = aiMessages(meetingText(doc), 'Что решили?');
    expect(messages).toEqual([
      { role: 'system', content: AI_RULES },
      {
        role: 'user',
        content:
          'Текст встречи:\n\nСозвон\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Я, Ирина\n\nИрина [0:05]\nПереносим на пятницу.\n---\nЧто решили?',
      },
    ]);
    expect(AI_RULES).toContain('не придумывай');
    expect(AI_RULES).toContain('Рекламные вставки не учитывай');
  });

  it('keeps the same beginning for a summary and a question: the engine does not read the meeting again', () => {
    const summary = aiMessages(meetingText(doc), summaryTask(null))[1]?.content ?? '';
    const question = aiMessages(meetingText(doc), 'Кто такой Олег?')[1]?.content ?? '';
    const common = 'Текст встречи:\n\n' + meetingText(doc) + '---\n';
    expect(summary.startsWith(common) && question.startsWith(common)).toBe(true);
  });
});

describe('summaryTask', () => {
  it('takes the prompt from the settings, and the standard one when the prompt is empty', () => {
    expect(summaryTask('Перечисли задачи')).toBe('Перечисли задачи');
    expect(summaryTask(null)).toBe(DEFAULT_AI_PROMPT);
    expect(summaryTask('')).toBe(DEFAULT_AI_PROMPT);
  });
});

describe('sourceHash', () => {
  it('changes with the text and the speaker names, but not with the title, the date or the duration', () => {
    const base = sourceHash(doc);
    expect(sourceHash({ ...doc, title: 'Новое название', metaLine: '27 сентября 2026, 17:20 · 33 мин' })).toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ирина', time: '0:05', text: 'Переносим на четверг.' }] })).not.toBe(base);
    expect(sourceHash({ ...doc, paragraphs: [{ speaker: 'Ира', time: '0:05', text: 'Переносим на пятницу.' }] })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('fitsWindow', () => {
  it('leaves 2048 tokens for the answer', () => {
    expect(fitsWindow(65_536 - 2048, 65_536)).toBe(true);
    expect(fitsWindow(65_536 - 2047, 65_536)).toBe(false);
  });
});
