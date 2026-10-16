import { defineConfig } from 'vitest/config';

// Настоящий движок итогов и настоящая модель (npm run test:llm): только на своём компьютере — модель весит 5,3 ГБ и
// берётся из TEXTMEET_LLM_MODELS_DIR без скачивания (src/main/ai/llama.llm.test.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.llm.test.ts'],
    environment: 'node',
    testTimeout: 5 * 60_000,
  },
});
