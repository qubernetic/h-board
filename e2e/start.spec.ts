import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The start page as the extension builds it, on the sample library. The screenshots go to test-results/screens/
// for the comparison with the English frames in docs/design/png/ (`ui-compare`, see the README).

/** The time the frames show: Monday, 23 November 2026, 14:32:07. */
const DRAWN_AT = new Date(2026, 10, 23, 14, 32, 7);

async function open(page: Page): Promise<void> {
  await page.clock.setFixedTime(DRAWN_AT);
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  await page.evaluate('document.fonts.ready');
}

const lens = (page: Page) => page.locator('[data-part="lens-name"]');

for (const [w, h, frame] of [
  [1440, 900, '01-start-dark'],
  [1920, 1000, '10-start-1920x1080'],
  [2560, 1360, '12-start-2560x1360'],
  [3440, 1360, '14-start-3440x1360'],
] as const) {
  test(`draws the start page at ${w} x ${h}, the size of ${frame}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await page.mouse.move(0, h - 1);
    await page.screenshot({ path: `test-results/screens/${frame}.png` });
    const box = await page.locator('[data-part="page"]').boundingBox();
    expect(box).toEqual({ x: 0, y: 0, width: w, height: h });
  });
}

test('has no horizontal scroll from 960 px width up', async ({ page }) => {
  for (const [w, h] of [
    [960, 640],
    [1024, 768],
    [1280, 720],
    [1440, 900],
    [1920, 1000],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    for (const density of ['normal', 'spacious', 'dense']) {
      const overflow = Number(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'));
      expect(overflow, `${w} x ${h}, ${density}`).toBeLessThanOrEqual(0);
      await page.keyboard.press(']');
    }
  }
});

test('switches groups with the keys 1 to 8, the arrows and the wheel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const names = ['Start', 'Development', 'Qubernetic', 'Automation', 'Media', 'Finance', 'Reading', 'Tools'];
  for (const [i, name] of names.entries()) {
    await page.keyboard.press(String(i + 1));
    await expect(lens(page)).toHaveText(name);
  }
  await page.keyboard.press('ArrowDown');
  await expect(lens(page)).toHaveText('Start');
  await page.keyboard.press('ArrowUp');
  await expect(lens(page)).toHaveText('Tools');
  await page.keyboard.press('3');
  await expect(page.locator('[data-part="grid"] a.card')).toHaveCount(7);

  await page.mouse.move(140, 450);
  await page.mouse.wheel(0, 100);
  await expect(lens(page)).toHaveText('Automation');
  await page.mouse.wheel(0, -100);
  await expect(lens(page)).toHaveText('Qubernetic');

  await page.keyboard.press('5');
  await expect(page.locator('[data-part="empty"] h2')).toHaveText('This group is still empty.');
  await page.locator('.ruler-mark[data-index="1"]').click();
  await expect(lens(page)).toHaveText('Development');
});

test('switches the theme and keeps it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  const pageRoot = page.locator('[data-part="page"]');
  await expect(pageRoot).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-part="theme"]').click();
  await expect(pageRoot).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-part="theme"]')).toContainText('Dark');
  await page.screenshot({ path: 'test-results/screens/02-start-light.png' });
});
