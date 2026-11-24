import { defineConfig, devices } from '@playwright/test';

// The smoke test loads the built extension's pages as plain pages from a static server.
// Build first: `npm run build` (the `e2e` recipe of the justfile does).
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  forbidOnly: !!process.env['CI'],
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview --workspace @h-board/host-extension -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/board.html',
    reuseExistingServer: !process.env['CI'],
  },
});
