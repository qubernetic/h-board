import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const browserGlobals = Object.keys(globals.browser).filter((name) => !(name in globals['shared-node-browser']));

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      // The approved concept and the dev prototype: reference only, not part of the build.
      'mock/',
      'extension/',
      'docs/',
      'ideas/',
      'plan/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: ['scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // core is pure: no DOM, no I/O, no other package. It runs in the browser and on the server.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'core does no I/O: no node modules.' },
            { group: ['@h-board/*'], message: 'core depends on no other package.' },
            { regex: '^[^.]', message: 'core has no dependencies: import only its own files.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...browserGlobals.map((name) => ({ name, message: 'core has no DOM and no browser API.' })),
        { name: 'process', message: 'core does no I/O.' },
        { name: 'require', message: 'core does no I/O.' },
        { name: 'Buffer', message: 'core does no I/O.' },
      ],
    },
  },
  {
    // ui changes data only through the Store interface and the core commands.
    files: ['packages/ui/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', '@h-board/host-*'], message: 'ui knows no host and no node module.' }] },
      ],
    },
  },
);
