import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
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
];
