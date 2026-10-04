import { defineConfig } from 'vitest/config';

// Все модели каталога на настоящих файлах (npm run test:catalog): первый прогон скачивает ~4,5 ГБ моделей.
// В обычные тесты и в npm run test:models не входит — CI гоняет его отдельным workflow models-check.
export default defineConfig({
  test: {
    include: ['src/**/*.catalog-test.ts'],
    environment: 'node',
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
    // По одной модели за раз: несколько больших моделей в памяти разом не нужны.
    fileParallelism: false,
  },
});
