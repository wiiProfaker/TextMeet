import { defineConfig } from 'vitest/config';

// Интеграционные тесты на настоящих моделях (npm run test:models): первый прогон скачивает ~360 МБ моделей.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 10 * 60_000,
    hookTimeout: 30 * 60_000,
  },
});
