import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * I test unitari girano su jsdom e non devono raccogliere gli spec Playwright,
 * che hanno bisogno di un browser vero (li lancia `npm run test:e2e`).
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
