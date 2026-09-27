import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // Один экземпляр Electron за раз: так проще и стабильнее.
  workers: 1,
  reporter: 'list',
});
