/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The corpus manifest is repo-level data, not frontend source. Aliased so
      // there is one copy of it rather than a duplicate under src/.
      '@corpus': fileURLToPath(new URL('../corpus', import.meta.url)),
      // The classification graph lives with the service that will walk it in
      // Phase 10. The frontend reads the same file rather than a copy.
      '@classification': fileURLToPath(
        new URL('../backend/app/services/classification', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Where the dev server forwards /api. Override with SAHAYAK_API_TARGET when
      // the backend is not on its default port — port 8000 is popular.
      '/api': {
        target: process.env.SAHAYAK_API_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
