import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021, __APP_RELEASE__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // I file TypeScript hanno bisogno del loro parser, altrimenti ESLint li
    // ignora in silenzio e App.tsx resta fuori da ogni controllo.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Le regole che ci interessano davvero: nomi non definiti (il bug del
      // login) e violazioni delle regole degli hook di React.
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Rumore che non vogliamo bloccare: import inutilizzati e simili.
      'no-unused-vars': 'off',
      'no-empty': 'warn',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
    },
  },

  {
    // TypeScript: il parser dedicato serve a lintare anche .tsx (App.tsx era
    // ignorato). Qui no-undef e' spento di proposito: i nomi non definiti li
    // intercetta `tsc --noEmit` (npm run typecheck), che in CI gira insieme
    // al lint. In .js e .jsx invece resta attivo, perche' li' non c'e' tsc.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021, __APP_RELEASE__: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-undef': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'warn',
    },
  },
];
