import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Worker } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The favicon mode in the unpacked build, with the optional favicon permission given. The browser's prompt cannot
// be clicked in headless Chromium, so this copy of the build lists `favicon` as a permission it has from the start;
// the build itself keeps it optional (manifest.test.ts).
const built = fileURLToPath(new URL('../packages/host-extension/dist', import.meta.url));

let context: BrowserContext;
let worker: Worker;
let dist: string;
let profile: string;

test.beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'h-board-dist-'));
  cpSync(built, dist, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')) as { permissions: string[] };
  manifest.permissions.push('favicon');
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));
  profile = mkdtempSync(join(tmpdir(), 'h-board-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
});

test('shows favicon mode with no request leaving the browser, and the Phosphor icon where none is stored', async () => {
  const base = new URL('.', worker.url()).href;
  const page = await context.newPage();
  await page.goto(`${base}board.html`);
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  await page.locator('[data-part="settings"]').click();
  await page.locator('[data-icon-mode="favicon"]').click();
  await expect(page.locator('[data-icon-mode="favicon"]')).toHaveAttribute('aria-pressed', 'true');

  // from here on, every request the browser makes, of any page or worker
  const requests: string[] = [];
  context.on('request', (request) => requests.push(request.url()));
  await page.reload();
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  await page.locator('[data-part="settings"]').click();
  // a fresh profile has stored no favicon: every card shows its Phosphor icon, none shows Chrome's default globe
  await expect(page.locator('[data-part="icons-hint"]')).toHaveText('Per group. Favicons: 0 / 29, the rest show their Phosphor icon.');
  await expect.poll(() => requests.filter((url) => url.includes('/_favicon/')).length).toBeGreaterThan(29);
  await expect(page.locator('[data-part="grid"] .card:not(.add) .tile .ph')).toHaveCount(29);
  await expect(page.locator('[data-part="grid"] .tile img')).toHaveCount(0);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => !url.startsWith('chrome-extension://'))).toEqual([]);
  await page.close();
});
