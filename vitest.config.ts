import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Считаем все модули src/. Исключения — только склейка с Electron и DOM (её проверяют сквозные
      // тесты в e2e/) и React-компоненты; новый модуль с логикой сюда не добавлять.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        'src/test-support/**',
        'src/shared/ipc.ts',
        'src/preload/**',
        'src/main/index.ts',
        'src/main/ipc.ts',
        'src/main/windows.ts',
        'src/main/tray.ts',
        'src/main/notifications.ts',
        'src/main/autostart.ts',
        'src/renderer/env.d.ts',
        'src/renderer/**/*.tsx',
        'src/renderer/main/hooks.ts',
        'src/renderer/recorder/recorder.ts',
        'src/renderer/recorder/capture.ts',
        'src/renderer/recorder/levels.ts',
        'src/renderer/recorder/sounds.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
