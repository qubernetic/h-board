import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Worker } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The unpacked build, loaded into headless Chromium as a user would load it from chrome://extensions.
const dist = fileURLToPath(new URL('../packages/host-extension/dist', import.meta.url));

let context: BrowserContext;
let worker: Worker;
let profile: string;

test.beforeAll(async () => {
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
});

const base = (): string => new URL('.', worker.url()).href;

test('a new tab hands over to the board, and keys reach the page without a click', async () => {
  const tabOpens = context.waitForEvent('page', (page) => page.url().endsWith('/newtab.html'));
  const boardOpens = context.waitForEvent('page', (page) => page.url().endsWith('/board.html'));
  // a tab without an address is the browser's new tab, as Ctrl+T opens it
  await worker.evaluate('chrome.tabs.create({})');
  const [tab, board] = await Promise.all([tabOpens, boardOpens]);
  await expect(board.locator('[data-part="lens-name"]')).toHaveText('Development');
  await expect.poll(() => tab.isClosed()).toBe(true);
  expect(await board.evaluate('document.hasFocus()')).toBe(true);

  await board.keyboard.press('1');
  await expect(board.locator('[data-part="lens-name"]')).not.toHaveText('Development');
  await board.close();
});

test('keeps the library in the extension storage across pages', async () => {
  const page = await context.newPage();
  await page.goto(`${base()}board.html`);
  const theme = await page.locator('[data-part="page"]').getAttribute('data-theme');
  await page.locator('[data-part="theme"]').click();
  await expect(page.locator('[data-part="page"]')).not.toHaveAttribute('data-theme', theme ?? '');
  const stored = await worker.evaluate('chrome.storage.local.get("library").then((items) => items.library.settings.theme)');
  expect(stored).not.toBe('system');
  const again = await context.newPage();
  await again.goto(`${base()}board.html`);
  await expect(again.locator('[data-part="page"]')).not.toHaveAttribute('data-theme', theme ?? '');
  await page.close();
  await again.close();
});

test('the settings page opens with the settings shown and offers the bookmark import', async () => {
  const page = await context.newPage();
  await page.goto(`${base()}settings.html`);
  await expect(page.locator('[data-part="settings-panel"]')).toBeVisible();
  await expect(page.locator('[data-part="bookmarks"]')).toHaveText('Import bookmarks');
  await page.close();
});

test('the offscreen page watches the colour scheme, and the extension holds no bookmarks permission yet', async () => {
  await expect.poll(() => worker.evaluate('chrome.offscreen.hasDocument()')).toBe(true);
  // Chrome counts the new tab override as a permission of its own
  expect(await worker.evaluate('chrome.permissions.getAll().then((all) => all.permissions.sort())')).toEqual([
    'newTabPageOverride',
    'offscreen',
    'storage',
  ]);
});
