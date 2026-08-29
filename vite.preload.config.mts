import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      output: { entryFileNames: 'preload.js' },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
    },
  },
});
