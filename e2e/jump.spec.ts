import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Jump codes: f shows a letter on every card, the letter opens it. `window.open` and the extension's
// `chrome.tabs.create` only write the address down here, so no test leaves the computer.

const DRAWN_AT = new Date(2026, 10, 23, 14, 32, 7);

/** Every request to a host other than the preview server. The codes must make none. */
async function open(page: Page): Promise<string[]> {
  const away: string[] = [];
  await page.route(
    (url) => url.host !== '127.0.0.1:4173',
    (route) => {
      away.push(route.request().url());
      return route.abort();
    },
  );
  await page.addInitScript(`
    window.__opened = [];
    window.open = (url) => { window.__opened.push('front ' + url); return null; };
    window.chrome = { tabs: { create: (p) => { window.__opened.push((p.active ? 'front ' : 'behind ') + p.url); return Promise.resolve(); } } };
  `);
  await page.clock.setFixedTime(DRAWN_AT);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  return away;
}

const opened = (page: Page): Promise<string[]> => page.evaluate('window.__opened') as Promise<string[]>;
const codes = (page: Page) => page.locator('[data-part="grid"] .card .hk');
const keys = (page: Page) => page.locator('[data-part="keys"]');

test('f and a letter open a card of the group in view', async ({ page }) => {
  const away = await open(page);
  await page.keyboard.press('3');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Qubernetic');
  await expect(codes(page).first()).toBeHidden();
  await page.keyboard.press('f');
  await expect(codes(page)).toHaveText(['a', 's', 'd', 'f', 'g', 'h', 'j']);
  await expect(codes(page).first()).toBeVisible();
  await expect(keys(page)).toHaveText('letter: open   shift: background tab   1–8: other group   esc: cancel');
  await page.evaluate('document.fonts.ready');
  await page.screenshot({ path: 'test-results/screens/jump-codes.png' });
  await page.keyboard.press('s');
  const second = await page.locator('[data-part="grid"] .card').nth(1).getAttribute('href');
  expect(await opened(page)).toEqual([`front ${second}`]);
  await expect(codes(page).first()).toBeHidden();
  await expect(keys(page)).toContainText('f: jump code');
  expect(away).toEqual([]);
});

test('f and two letters open a card of a group with more cards than letters', async ({ page }) => {
  await open(page);
  await page.keyboard.press('f');
  await expect(codes(page).first()).toHaveText('aa');
  await page.keyboard.press('s');
  await expect(keys(page)).toContainText('s…');
  await expect(page.locator('[data-part="grid"] .card.off')).toHaveCount(26);
  await page.keyboard.press('d');
  expect(await opened(page)).toEqual([`front ${await page.locator('[data-part="grid"] .card').nth(28).getAttribute('href')}`]);
});

test('f, a group number and a letter open a card of another group', async ({ page }) => {
  await open(page);
  await page.keyboard.press('f');
  await page.keyboard.press('3');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Qubernetic');
  await expect(codes(page).first()).toBeVisible();
  await page.keyboard.press('a');
  expect(await opened(page)).toEqual([`front ${await page.locator('[data-part="grid"] .card').first().getAttribute('href')}`]);
});

test('Shift with the letter opens the card in a tab behind this one', async ({ page }) => {
  await open(page);
  await page.keyboard.press('f');
  await page.keyboard.press('3');
  await page.keyboard.press('Shift+D');
  const third = await page.locator('[data-part="grid"] .card').nth(2).getAttribute('href');
  expect(await opened(page)).toEqual([`behind ${third}`]);
});

test('Escape and a letter no card has put the codes away and open nothing', async ({ page }) => {
  await open(page);
  await page.keyboard.press('3');
  await page.keyboard.press('f');
  await expect(codes(page).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(codes(page).first()).toBeHidden();
  await page.keyboard.press('f');
  await page.keyboard.press('m');
  await expect(codes(page).first()).toBeHidden();
  // the next key is the page's own again
  await page.keyboard.press('e');
  await expect(page.locator('[data-part="edit-note"]')).toBeVisible();
  expect(await opened(page)).toEqual([]);
});
