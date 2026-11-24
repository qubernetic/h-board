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

test('moves a site by dragging it and by Shift+arrow, and z takes the move back', async ({ page }) => {
  await open(page);
  await page.keyboard.press('e');
  const card = (name: string) => page.locator(`.card.ed[aria-label="${name}"]`);
  const box = await card('copia').boundingBox();
  if (!box) throw new Error('no copia card');
  await card('github').dragTo(card('copia'), { targetPosition: { x: box.width - 10, y: box.height / 2 } });
  await expect(names(page).nth(0)).toHaveText('claude');
  await expect(names(page).nth(2)).toHaveText('github');
  await page.keyboard.press('z');
  await expect(names(page).nth(0)).toHaveText('github');
  await card('github').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(names(page).nth(1)).toHaveText('github');
  await expect(card('github')).toBeFocused();
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
});

test('adds a site through the dialog, and z takes it back', async ({ page }) => {
  await open(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('[data-part="add-site"]').click();
  const dialog = page.getByRole('dialog', { name: 'New site · Development' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Address')).toBeFocused();
  await page.keyboard.type('https://grafana.example.local');
  await expect(dialog.getByLabel('Name')).toHaveValue('grafana');
  await dialog.getByLabel('Description').fill('Cameras, inference times and error rate in real time.');
  await dialog.getByText('Phosphor', { exact: true }).click();
  await dialog.getByRole('button', { name: 'chart-line-up' }).click();
  await page.mouse.move(0, 899);
  await page.screenshot({ path: 'test-results/screens/04-new-site.png' });
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog).toBeHidden();
  await expect(names(page)).toHaveCount(30);
  await expect(names(page).last()).toHaveText('grafana');
  await expect(toast(page)).toContainText('added: grafana');
  await page.keyboard.press('z');
  await expect(names(page)).toHaveCount(29);
});

test('edits a site through the dialog, and z takes the edit back', async ({ page }) => {
  await open(page);
  await page.keyboard.press('e');
  await page.locator('.card.ed[aria-label="github"]').hover();
  await page.getByRole('button', { name: 'Edit: github' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit site · Development' });
  await expect(dialog.getByLabel('Address')).toHaveValue('https://github.com');
  await dialog.getByLabel('Name').fill('GitHub');
  await dialog.getByText('initial', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(names(page).first()).toHaveText('GitHub');
  await expect(page.locator('.card.ed[aria-label="GitHub"] .tile .initial')).toHaveText('g');
  await expect(toast(page)).toContainText('saved: GitHub');
  await page.keyboard.press('z');
  await expect(names(page).first()).toHaveText('github');
  await page.locator('.card.ed[aria-label="github"]').hover();
  await page.getByRole('button', { name: 'Edit: github' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-part="edit-note"]')).toBeVisible();
});

test('adds, renames and deletes a group, and undo brings the group back', async ({ page }) => {
  await open(page);
  const lens = page.locator('[data-part="lens-name"]');
  await page.getByRole('button', { name: '+ new group' }).click();
  const added = page.getByRole('dialog', { name: 'New group' });
  await added.getByLabel('Name').fill('Reading list');
  await page.keyboard.press('Enter');
  await expect(lens).toHaveText('Reading list');
  await expect(page.locator('[data-part="rail-head"]')).toHaveText('Groups · 9');
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'rename group' }).click();
  const renamed = page.getByRole('dialog', { name: 'Rename group · Reading list' });
  await renamed.getByLabel('Name').fill('Later');
  await renamed.getByRole('button', { name: 'Save' }).click();
  await expect(lens).toHaveText('Later');
  await page.getByRole('button', { name: 'delete group' }).click();
  await expect(page.locator('[data-part="rail-head"]')).toHaveText('Groups · 8');
  await expect(toast(page)).toContainText('deleted group: Later · 0 sites');
  await page.keyboard.press('z');
  await expect(page.locator('[data-part="rail-head"]')).toHaveText('Groups · 9');
});

test('sets the icon mode of the group in view in the settings', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Icons of Development' }).getByRole('button', { name: 'initial' }).click();
  await expect(page.locator('[data-part="grid"] .card .tile .initial').first()).toHaveText('g');
  await page.keyboard.press('Escape');
  await page.keyboard.press('z');
  await expect(page.locator('[data-part="grid"] .card .tile .initial')).toHaveCount(0);
});
