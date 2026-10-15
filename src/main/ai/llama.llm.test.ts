// Настоящий движок и настоящая модель (npm run test:llm, только на своём компьютере): llama-server из vendor/llama
// (npm run fetch:llama) и Qwen3.5 9B из папки моделей TEXTMEET_LLM_MODELS_DIR (там лежит
// llm/qwen3.5-9b/Qwen3.5-9B-Q4_K_M.gguf) — без скачивания: модель весит 5,3 ГБ, в ci этот тест не входит.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { llmFilePath } from '../models/registry';
import { countTokens, streamChat } from './llm-client';
import { llamaDir, LlamaServer, llamaServerFile } from './llama-server';

const quiet = { info: () => undefined, error: () => undefined };

const MEETING = [
  'Ирина [0:05]',
  'Давай перенесём запуск на пятницу: дизайн ещё не готов.',
  '',
  'Я [0:12]',
  'Согласен, переносим на пятницу. Я предупрежу Олега.',
].join('\n');

describe('the real engine with Qwen3.5 9B', () => {
  it('counts the tokens of a meeting and answers a question about it in Russian', async () => {
    const root = process.env.TEXTMEET_LLM_MODELS_DIR;
    if (!root) {
      throw new Error('Укажите TEXTMEET_LLM_MODELS_DIR — папку моделей, где лежит llm/qwen3.5-9b/Qwen3.5-9B-Q4_K_M.gguf');
    }
    const dir = llamaDir({ packaged: false, resourcesPath: '', appPath: process.cwd() });
    const server = new LlamaServer({ command: () => ({ file: join(dir, llamaServerFile(process.platform)), args: [] }), logger: quiet });
    try {
      // Окно поменьше — модель загружается быстрее; встрече хватает.
      const endpoint = await server.ready({ path: llmFilePath(root, 'qwen3.5-9b'), contextTokens: 8192 });
      expect(await countTokens(endpoint, MEETING)).toBeGreaterThan(20);
      let answer = '';
      const result = await streamChat(
        endpoint,
        {
          messages: [
            { role: 'system', content: 'Отвечай по-русски, только по тексту встречи.' },
            { role: 'user', content: `Текст встречи:\n\n${MEETING}\n---\nНа какой день перенесли запуск? Ответь одним словом.` },
          ],
          maxTokens: 64,
        },
        { onText: (text) => (answer += text) },
      );
      expect(answer.toLowerCase()).toContain('пятниц');
      expect(result.finishReason).toBe('stop');
    } finally {
      await server.stop();
    }
  });
});
