import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    reporters: ['default', ['junit', { outputFile: 'test-results/junit.xml' }]],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts'],
      // Entry points: wiring only, run by the e2e smoke test and the image job, not by unit tests.
      // The same list is in codecov.yml.
      exclude: [
        'packages/host-extension/src/background.ts',
        'packages/host-extension/src/board.ts',
        'packages/host-extension/src/newtab.ts',
        // reads image pixels through a canvas, which only a real browser draws; run by the e2e favicon test
        'packages/host-extension/src/pixels.ts',
        'packages/host-extension/src/settings.ts',
        'packages/host-extension/src/theme.ts',
        'packages/host-server/src/main.ts',
        'packages/ui/src/dev.ts',
      ],
      thresholds: { lines: 80 },
    },
  },
});
