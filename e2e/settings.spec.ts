import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The settings panel on the built board page: every control stays inside the panel and no label wraps, in both
// themes, with every row the extension shows (Import bookmarks too).

/** Every element that reaches past the panel's content box, and every button whose label takes more than one line. */
const PROBLEMS = `(() => {
  const panel = document.querySelector('[data-part="settings-panel"]');
  // the panel's content box: inside the border and the padding
  const outer = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const inset = (side) => parseFloat(style['border' + side + 'Width']) + parseFloat(style['padding' + side]);
  const box = {
    left: outer.left + inset('Left'),
    top: outer.top + inset('Top'),
    right: outer.right - inset('Right'),
    bottom: outer.bottom - inset('Bottom'),
  };
  const name = (node) => (node.dataset.part || node.dataset.density || node.dataset.motion || node.dataset.iconMode
    || node.textContent.trim().slice(0, 24) || node.tagName.toLowerCase());
  const out = [];
  for (const node of panel.querySelectorAll('*')) {
    const r = node.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.left < box.left || r.top < box.top || r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5) {
      out.push('outside: ' + name(node));
    }
  }
  for (const button of panel.querySelectorAll('button')) {
    const range = document.createRange();
    range.selectNodeContents(button);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    if (lines.size > 1) out.push('wraps: ' + name(button));
  }
  return out;
})()`;

async function open(page: Page, w: number, h: number, scheme: 'light' | 'dark'): Promise<void> {
  // the extension's permissions API, so the panel offers the bookmark import as the new tab does
  await page.addInitScript('globalThis.chrome = { permissions: { request: async () => false } }');
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto('/board.html');
  await expect(page.locator('[data-part="lens-name"]')).toHaveText('Development');
  await page.evaluate('document.fonts.ready');
  await page.locator('[data-part="settings"]').click();
  await expect(page.locator('[data-part="settings-panel"]')).toBeVisible();
  await expect(page.locator('[data-part="bookmarks"]')).toBeVisible();
}

for (const [w, h] of [
  [1440, 900],
  [1920, 1000],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`keeps every settings control inside the panel at ${w} x ${h}, ${scheme}`, async ({ page }) => {
      await open(page, w, h, scheme);
      expect(await page.evaluate<string[]>(PROBLEMS)).toEqual([]);
      await page.screenshot({ path: `test-results/screens/settings-${w}-${scheme}.png` });
    });
  }
}
