import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Только модули без Electron; склейку с Electron проверяют сквозные тесты (e2e/).
      include: [
        'src/shared/**/*.ts',
        'src/main/fs/**/*.ts',
        'src/main/library/**/*.ts',
        'src/main/settings/**/*.ts',
        'src/main/icons/**/*.ts',
        'src/main/logger.ts',
        'src/main/paths.ts',
        'src/main/startup.ts',
        'src/main/tray-menu.ts',
        'src/renderer/main/format.ts',
        'src/renderer/main/errors.ts',
      ],
      exclude: ['**/*.test.ts', 'src/shared/ipc.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
