import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * I test unitari girano su jsdom e non devono raccogliere gli spec Playwright,
 * che hanno bisogno di un browser vero (li lancia `npm run test:e2e`).
 */
export default defineConfig({
  // Lo stesso plugin del build: senza, i componenti .jsx scritti per il
  // runtime automatico (senza `import React`) esplodono con "React is not
  // defined" nei test e non nell'app.
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
