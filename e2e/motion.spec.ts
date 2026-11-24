import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The character field, home · standby and the motion levels of packages/ui/MOTION.md, on the built board page.

const DRAWN_AT = new Date(2026, 10, 23, 14, 32, 7);

async function open(page: Page, w = 1440, h = 900): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.clock.setFixedTime(DRAWN_AT);
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  await page.evaluate('document.fonts.ready');
}

/** Picks a motion level in the settings. */
async function pick(page: Page, level: 'full' | 'reduced' | 'none'): Promise<void> {
  await page.locator('[data-part="settings"]').click();
  await page.locator(`[data-motion="${level}"]`).click();
  await page.keyboard.press('Escape');
  await expect(root(page)).toHaveAttribute('data-motion', level);
}

const root = (page: Page) => page.locator('[data-part="page"]');
const lens = (page: Page) => page.locator('[data-part="lens-name"]');

/** Where the page stands: standby, start, or between the two. */
const SIDE = `(() => {
  const node = document.querySelector('[data-part="page"]');
  return node.hasAttribute('data-sb-anim') ? 'moving' : node.hasAttribute('data-standby') ? 'standby' : 'start';
})()`;
const side = (page: Page): Promise<string> => page.evaluate<string>(SIDE);

test('draws home · standby with the mark, the size of 05-home-standby', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(root(page)).toHaveAttribute('data-motion', 'none');
  await page.mouse.move(1439, 899);
  await page.keyboard.press('s');
  expect(await side(page)).toBe('standby');
  await expect(page.locator('[data-part="standby-time"]')).toHaveText('14:32');
  await expect(page.locator('[data-part="standby-next"]')).toHaveText('next: Client: review the quote');
  await page.screenshot({ path: 'test-results/screens/05-home-standby.png' });
  await page.keyboard.press('x');
  expect(await side(page)).toBe('start');
});

test('none: prefers-reduced-motion changes at once, until the user picks a level', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('canvas.hb-field')).toHaveAttribute('data-live', 'false');
  await page.keyboard.press('s');
  expect(await side(page)).toBe('standby');
  await page.keyboard.press('x');
  expect(await side(page)).toBe('start');
  await pick(page, 'reduced');
  await page.keyboard.press('s');
  expect(await side(page)).toBe('moving');
});

test('reduced, the default: a 150 ms crossfade, the trail only on standby', async ({ page }) => {
  await open(page);
  await expect(root(page)).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('canvas.hb-field')).toHaveAttribute('data-live', 'false');
  // how long the way into standby takes, measured in the page
  const took = await page.evaluate<number>(`new Promise((resolve) => {
    const node = document.querySelector('[data-part="page"]');
    const t0 = performance.now();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    const check = () => {
      if (node.hasAttribute('data-standby') && !node.hasAttribute('data-sb-anim')) resolve(performance.now() - t0);
      else requestAnimationFrame(check);
    };
    check();
  })`);
  expect(took).toBeGreaterThanOrEqual(140);
  expect(took).toBeLessThan(400);
  await expect(page.locator('canvas.hb-field')).toHaveAttribute('data-live', 'true');
});

test('full: the trail on the start page, 920 ms into standby', async ({ page }) => {
  await open(page);
  await pick(page, 'full');
  await expect(page.locator('canvas.hb-field')).toHaveAttribute('data-live', 'true');
  await page.keyboard.press('s');
  expect(await side(page)).toBe('moving');
  await page.waitForTimeout(500);
  expect(await side(page)).toBe('moving');
  await expect.poll(() => side(page)).toBe('standby');
});

test('a key during a movement acts at once', async ({ page }) => {
  await open(page);
  await pick(page, 'full');
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  await page.keyboard.press('x');
  expect(await side(page)).toBe('start');
  await page.keyboard.press('s');
  await expect.poll(() => side(page)).toBe('standby');
  await page.keyboard.press('x');
  expect(await side(page)).toBe('moving');
  await page.keyboard.press('3');
  expect(await side(page)).toBe('start');
  await expect(lens(page)).toHaveText('Qubernetic');
});

test('smooth on a 1920 frame: at most 5% of the frames over 34 ms', async ({ page }) => {
  await open(page, 1920, 1000);
  await pick(page, 'full');
  // every frame's time, as the trace has them
  await page.evaluate(`(() => {
    const times = [];
    window.frameTimes = times;
    const frame = (now) => {
      times.push(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })()`);
  // the pointer crosses the cards with its trail, then the page goes to standby and back
  for (let i = 0; i <= 60; i += 1) {
    await page.mouse.move(400 + i * 20, 300 + Math.sin(i / 6) * 200);
  }
  await page.keyboard.press('s');
  await expect.poll(() => side(page)).toBe('standby');
  for (let i = 0; i <= 30; i += 1) await page.mouse.move(400 + i * 4, 400 + i * 3);
  await page.mouse.move(1700, 900);
  await expect.poll(() => side(page)).toBe('start');
  const times = await page.evaluate<number[]>('window.frameTimes');
  const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
  const slow = gaps.filter((gap) => gap > 34).length;
  test.info().annotations.push({ type: 'frames', description: `${slow} of ${gaps.length} over 34 ms` });
  expect(gaps.length).toBeGreaterThan(60);
  expect(slow / gaps.length).toBeLessThanOrEqual(0.05);
});
