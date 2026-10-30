import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: [
      'packages/**/*.ts',
      'packages/**/*.tsx',
      'apps/**/*.ts',
      'apps/**/*.tsx',
      'tools/**/*.ts',
    ],
    ignores: ['**/*.config.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
      },
      globals: { ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['strict-type-checked']?.rules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['*.ts', '*.config.ts', '**/*.config.ts', '*.config.mjs', '*.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      parser: tsparser,
      globals: { ...globals.node },
    },
  },
  prettier,
  {
    ignores: ['**/dist/**', '**/build/**', 'art/vendor/**', 'art/build/**'],
  },
];
