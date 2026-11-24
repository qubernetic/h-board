import { expect, test } from '@playwright/test';

test('the new tab page hands over to the board', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/newtab.html');
  await expect(page).toHaveURL(/\/board\.html$/);
  await expect(page.getByRole('heading', { level: 1, name: 'H-Board' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the built extension carries its manifest', async ({ request }) => {
  const response = await request.get('/manifest.json');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ manifest_version: 3, chrome_url_overrides: { newtab: 'newtab.html' } });
});
