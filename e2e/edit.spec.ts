import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Editing on the board page: edit mode, the site dialog, moving, deleting and undo. Every change runs a command
// of core through the store, so undo takes it back.

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
}

const names = (page: Page) => page.locator('[data-part="grid"] .card:not(.add) .name');
const toast = (page: Page) => page.locator('[data-part="toast"]');

test('deletes a site in edit mode and brings it back with z', async ({ page }) => {
  await open(page);
  await page.keyboard.press('e');
  await expect(page.locator('[data-part="edit-note"]')).toBeVisible();
  const github = page.locator('.card.ed[aria-label="github"]');
  await github.hover();
  await github.getByRole('button', { name: 'Delete: github' }).click();
  await expect(names(page)).toHaveCount(28);
  await expect(toast(page)).toContainText('deleted: github');
  await page.keyboard.press('z');
  await expect(names(page)).toHaveCount(29);
  await expect(names(page).first()).toHaveText('github');
  await expect(toast(page)).toContainText('undone: +github in Development');
});

test('undoes a delete with the button in the toast and with Ctrl+Z', async ({ page }) => {
  await open(page);
  await page.keyboard.press('e');
  await page.locator('.card.ed[aria-label="claude"]').hover();
  await page.getByRole('button', { name: 'Delete: claude' }).click();
  await expect(names(page)).toHaveCount(28);
  await toast(page).getByRole('button', { name: 'undo · z' }).click();
  await expect(names(page).nth(1)).toHaveText('claude');
  await page.locator('.card.ed[aria-label="copia"]').hover();
  await page.getByRole('button', { name: 'Delete: copia' }).click();
  await expect(names(page)).toHaveCount(28);
  await page.keyboard.press('Control+z');
  await expect(names(page).nth(2)).toHaveText('copia');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-part="grid"] a.card')).toHaveCount(29);
});
