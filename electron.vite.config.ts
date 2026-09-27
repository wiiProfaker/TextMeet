import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  // Один preload (src/preload/index.ts) на оба окна — см. «Факты» в плане.
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/main/index.html'),
          recorder: resolve(__dirname, 'src/renderer/recorder/index.html'),
        },
      },
    },
  },
});
