import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The search line of the start page, as the mock's search behaves. The page opens what the user chooses in a new
// tab; here `window.open` only writes the address down, so no test leaves the computer.

const DRAWN_AT = new Date(2026, 10, 23, 14, 32, 7);

/** Every request to a host other than the preview server. The search must make none. */
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
    window.open = (url, target, features) => { window.__opened.push([url, target, features].join(' ')); return null; };
  `);
  await page.clock.setFixedTime(DRAWN_AT);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  return away;
}

const opened = (page: Page): Promise<unknown> => page.evaluate('window.__opened');
const line = (page: Page) => page.locator('[data-part="search-input"]');
const engine = (page: Page) => page.locator('[data-part="engine"]');
const list = (page: Page) => page.locator('[data-part="suggestions"]');
const rows = (page: Page) => list(page).locator('.row');
const selected = (page: Page) => list(page).locator('.row[aria-selected="true"] .t');

test('/ puts the focus into the line; the user\'s own sites come first and Enter opens one', async ({ page }) => {
  const away = await open(page);
  await page.keyboard.press('/');
  await expect(line(page)).toBeFocused();
  await expect(list(page)).toHaveText('no history · type a search or an address');
  await page.keyboard.type('twincat ads');
  await expect(rows(page).first()).toContainText('beckhoff infosys');
  await expect(rows(page).first()).toContainText('Development · own site');
  await expect(selected(page)).toHaveText('beckhoff infosys');
  await page.evaluate('document.fonts.ready');
  await page.screenshot({ path: 'test-results/screens/03-start-search.png' });
  await page.keyboard.press('ArrowDown');
  await expect(selected(page)).toHaveText('crates.io');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://infosys.beckhoff.com _blank noopener']);
  await expect(line(page)).toHaveValue('');
  await expect(list(page)).toBeHidden();
  expect(away).toEqual([]);
});

test('words go to the chosen engine and into the history; Tab turns the engine', async ({ page }) => {
  const away = await open(page);
  await line(page).click();
  await page.keyboard.type('lorem ipsum');
  await expect(rows(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(engine(page)).toHaveText('ddg');
  await page.keyboard.press('Tab');
  await expect(engine(page)).toHaveText('google');
  await expect(line(page)).toBeFocused();
  await page.keyboard.type('dolor');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual([
    'https://duckduckgo.com/?q=lorem%20ipsum _blank noopener',
    'https://www.google.com/search?q=dolor _blank noopener',
  ]);
  // after a search the line keeps the focus and the list closes; an arrow opens it again
  await expect(list(page)).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).locator('.t')).toHaveText(['dolor', 'lorem ipsum']);
  await expect(rows(page).locator('.m')).toHaveText(['history', 'history']);
  await expect(selected(page)).toHaveText('dolor');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toContain('https://www.google.com/search?q=lorem%20ipsum _blank noopener');
  await engine(page).click();
  await expect(engine(page)).toHaveText('startpage');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(line(page)).not.toBeFocused();
  // the engine is a setting: it stays after a redraw
  await page.keyboard.press('3');
  await expect(engine(page)).toHaveText('startpage');
  expect(away).toEqual([]);
});

test('an address opens as it is', async ({ page }) => {
  await open(page);
  await page.keyboard.press('/');
  await page.keyboard.type('example.org/a');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.org/a _blank noopener']);
});

test("a site's alias and a space search inside the site; Escape goes back with what was typed", async ({ page }) => {
  const away = await open(page);
  await page.keyboard.press('/');
  await page.keyboard.type('gh ');
  await expect(engine(page)).toHaveText('github');
  await expect(engine(page)).toHaveClass(/scoped/);
  await expect(line(page)).toHaveAttribute('placeholder', 'search here');
  await expect(list(page)).toHaveText('type what you are looking for on github.com');
  await page.keyboard.type('tokio select');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('search on github.com');
  await page.keyboard.press('Escape');
  await expect(engine(page)).toHaveText('ddg');
  await expect(line(page)).toHaveValue('tokio select');
  await line(page).fill('');
  await page.keyboard.type('rs ');
  await expect(engine(page)).toHaveText('docs.rs');
  await page.keyboard.type('serde');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://docs.rs/releases/search?query=serde _blank noopener']);
  await expect(engine(page)).toHaveText('ddg');
  expect(away).toEqual([]);
});

test("Tab on one of the user's sites searches inside it; Backspace and a click on the chip lift it", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('/');
  await page.keyboard.type('stack');
  await expect(selected(page)).toHaveText('stack overflow');
  await expect(rows(page).first().locator('.tabk')).toHaveText('tab: search here');
  await page.keyboard.press('Tab');
  await expect(engine(page)).toHaveText('stack overflow');
  await expect(line(page)).toHaveValue('');
  await page.keyboard.press('Backspace');
  await expect(engine(page)).toHaveText('ddg');
  await page.keyboard.type('inf ');
  await expect(engine(page)).toHaveText('beckhoff infosys');
  await engine(page).click();
  await expect(engine(page)).toHaveText('ddg');
  await expect(line(page)).toBeFocused();
  await page.keyboard.type('so ');
  await page.mouse.click(700, 800);
  await expect(line(page)).not.toBeFocused();
  await expect(engine(page)).toHaveText('ddg');
  await expect(list(page)).toBeHidden();
});

test('a row opens with a click', async ({ page }) => {
  await open(page);
  await page.keyboard.press('/');
  await page.keyboard.type('crates');
  await rows(page).first().click();
  expect(await opened(page)).toEqual(['https://crates.io _blank noopener']);
});
