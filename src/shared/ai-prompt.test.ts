import { describe, expect, it } from 'vitest';
import { AI_PROMPT_MAX, AiPromptSchema, DEFAULT_AI_PROMPT, resolveAiPrompt, storedAiPrompt, withAiPrompt } from './ai-prompt';

describe('DEFAULT_AI_PROMPT', () => {
  it('explains who is who and asks for the summary parts', () => {
    expect(DEFAULT_AI_PROMPT).toContain('«Я» — это я');
    expect(DEFAULT_AI_PROMPT).toContain('«Спикер 2»');
    expect(DEFAULT_AI_PROMPT.split('\n')).toHaveLength(6);
    expect(DEFAULT_AI_PROMPT).toContain('— задачи: кто, что, к какому сроку;');
    expect(DEFAULT_AI_PROMPT.length).toBeLessThan(AI_PROMPT_MAX);
  });
});

describe('AiPromptSchema', () => {
  it('accepts null, an empty string and a text up to the limit', () => {
    expect(AiPromptSchema.parse(null)).toBeNull();
    expect(AiPromptSchema.parse('')).toBe('');
    expect(AiPromptSchema.parse('я'.repeat(AI_PROMPT_MAX))).toHaveLength(AI_PROMPT_MAX);
  });

  it('rejects a longer text and other types', () => {
    expect(AiPromptSchema.safeParse('я'.repeat(AI_PROMPT_MAX + 1)).success).toBe(false);
    expect(AiPromptSchema.safeParse(42).success).toBe(false);
    expect(AiPromptSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('storedAiPrompt', () => {
  it('stores the standard prompt as null', () => {
    expect(storedAiPrompt(null)).toBeNull();
    expect(storedAiPrompt(DEFAULT_AI_PROMPT)).toBeNull();
    expect(storedAiPrompt(DEFAULT_AI_PROMPT.replace(/\n/g, '\r\n'))).toBeNull();
  });

  it('keeps an own prompt and an empty one, with \n line breaks', () => {
    expect(storedAiPrompt('Кратко:\r\nо чём договорились?')).toBe('Кратко:\nо чём договорились?');
    expect(storedAiPrompt('')).toBe('');
  });
});

describe('resolveAiPrompt', () => {
  it('gives the standard prompt for null and the stored text otherwise', () => {
    expect(resolveAiPrompt(null)).toBe(DEFAULT_AI_PROMPT);
    expect(resolveAiPrompt('Свой')).toBe('Свой');
    expect(resolveAiPrompt('')).toBe('');
  });
});

describe('withAiPrompt', () => {
  it('puts the prompt, an empty line and the text', () => {
    expect(withAiPrompt('  Итоги, пожалуйста.\n', 'Встреча\nтекст\n')).toBe('Итоги, пожалуйста.\n\nВстреча\nтекст\n');
  });

  it('turns \r\n of the prompt into \n', () => {
    expect(withAiPrompt('а\r\nб', 'т')).toBe('а\nб\n\nт');
  });

  it('adds nothing for an empty or blank prompt', () => {
    expect(withAiPrompt('', 'текст')).toBe('текст');
    expect(withAiPrompt(' \n\t', 'текст')).toBe('текст');
  });
});
