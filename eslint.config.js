import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// core may use the language and these pure helpers; every other global of a browser, an extension, a worker or
// Node is I/O or a host, and refused.
const pureGlobals = new Set(['atob', 'btoa', 'structuredClone', 'TextDecoder', 'TextEncoder', 'URL', 'URLSearchParams']);
const hostGlobals = [
  ...new Set([
    ...Object.keys(globals.browser),
    ...Object.keys(globals.webextensions),
    ...Object.keys(globals.serviceworker),
    ...Object.keys(globals.node),
    'globalThis',
  ]),
].filter((name) => !pureGlobals.has(name));

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
        ...hostGlobals.map((name) => ({ name, message: 'core has no DOM, no host API and does no I/O.' })),
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
