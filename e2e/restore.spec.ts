import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Snapshots, export and import on the board page: the restore panel goes back to a snapshot, and an exported file
// brings the library back. Every way goes through the store, so undo takes it back.

/** The time the frames show: Monday, 23 November 2026, 14:32:07. */
const DRAWN_AT = new Date(2026, 10, 23, 14, 32, 7);

async function open(page: Page): Promise<void> {
  await page.clock.setFixedTime(DRAWN_AT);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
}

const names = (page: Page) => page.locator('[data-part="grid"] .card:not(.add) .name');
const toast = (page: Page) => page.locator('[data-part="toast"] .msg');
const sign = (page: Page) => page.locator('[data-part="saved"]');

/** Deletes the site `name` of the group in view in edit mode, and leaves edit mode. */
async function remove(page: Page, name: string): Promise<void> {
  await page.keyboard.press('e');
  const card = page.locator(`.card.ed[aria-label="${name}"]`);
  await card.hover();
  await card.getByRole('button', { name: `Delete: ${name}` }).click();
  await expect(toast(page)).toHaveText(`deleted: ${name}`);
  await page.keyboard.press('Escape');
}

test('restores a snapshot from the panel, and z takes the restore back', async ({ page }) => {
  await open(page);
  await expect(sign(page)).toHaveText('saved · 14:32 · 1 snapshot');
  await remove(page, 'github');
  await remove(page, 'claude');
  await expect(names(page)).toHaveCount(27);
  await expect(sign(page)).toHaveText('saved · 14:32 · 3 snapshots');

  await page.keyboard.press('v');
  const panel = page.locator('[data-part="restore"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-part="restore-title"]')).toHaveText('Restore · 3 snapshots');
  const rows = panel.locator('[data-part="restore-list"] button');
  await expect(rows).toHaveText([
    'today 14:32-claude in Development82 sites',
    'today 14:32-github in Development83 sites',
    'today 14:32starting point84 sites',
  ]);
  await expect(panel.locator('[data-part="restore-preview"]')).toHaveText('This is the library as it is now.');
  await expect(panel.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(2)).toBeFocused();
  await expect(panel.locator('[data-part="restore-preview"]')).toHaveText(
    'If you restore it: +2 sites in Development.',
  );
  // the arrows walked the list, not the groups
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(names(page)).toHaveCount(29);
  await expect(toast(page)).toHaveText('restored: +2 sites in Development');
  await expect(sign(page)).toHaveText('saved · 14:32 · 4 snapshots');

  await page.keyboard.press('z');
  await expect(names(page)).toHaveCount(27);
});

test('opens the panel from the status bar sign and from the settings', async ({ page }) => {
  await open(page);
  const panel = page.locator('[data-part="restore"]');
  await sign(page).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.locator('[data-part="settings"]').click();
  await page.getByRole('button', { name: 'Restore… (v)' }).click();
  await expect(page.locator('[data-part="settings-panel"]')).toBeHidden();
  await expect(panel).toBeVisible();
});

test('exports the library and imports the file back', async ({ page }) => {
  await open(page);
  await page.locator('[data-part="settings"]').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('h-board-2026-11-23.json');
  const saved = await file.path();
  const text = await readFile(saved, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ app: 'h-board', schema: 1 });
  await expect(toast(page)).toHaveText('exported: h-board-2026-11-23.json');

  await page.keyboard.press('Escape');
  await remove(page, 'github');
  await expect(names(page)).toHaveCount(28);

  await page.locator('[data-part="settings"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles(saved);
  await expect(page.locator('[data-part="settings-panel"]')).toBeHidden();
  await expect(names(page)).toHaveCount(29);
  await expect(names(page).first()).toHaveText('github');
  await expect(toast(page)).toHaveText(/^imported: .+ · 8 groups · 84 sites$/);
});

test('shows a wrong file inline in the settings and keeps the library', async ({ page }) => {
  await open(page);
  await page.locator('[data-part="settings"]').click();
  await page.locator('[data-part="import-file"]').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app": "something else"}'),
  });
  const error = page.locator('[data-part="import-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveText('notes.json cannot be imported:\napp: must be "h-board"\nschema: must be 1');
  await expect(page.getByRole('alert')).toContainText('app: must be "h-board"');
  await expect(names(page)).toHaveCount(29);
  await expect(sign(page)).toHaveText('saved · 14:32 · 1 snapshot');
});
