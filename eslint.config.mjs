import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'reports/**', 'test-results/**', 'contracts/__snapshots__/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // Fail loudly on accidental debugging leftovers - the framework has a
      // structured logger, so raw console access is never the right answer.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Read configuration through src/config/env.ts so defaults and validation stay in one place.',
        },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      complexity: ['warn', 12],
      'max-depth': ['warn', 3],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // The config layer is the one place allowed to touch process.env.
  {
    files: ['src/config/env.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // Reporters legitimately write to stdout.
  {
    files: ['reporters/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/expect-expect': [
        'error',
        {
          // The framework's assertion helpers count as assertions, so a test
          // built entirely from them is not flagged as assertion-free.
          assertFunctionNames: [
            'expect',
            'assertResponseEnvelope',
            'assertOkJson',
            'assertValidCart',
            'assertValidLineItem',
            'assertProductsAreInCatalogue',
            'assertEchoesPayload',
            'assertSortedById',
            'assertAllBelongToUser',
            'assertUniqueIds',
          ],
        },
      ],
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
    },
  },

  prettier,
);
