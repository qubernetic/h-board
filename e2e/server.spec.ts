import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, openDatabase } from '../packages/host-server/src/index';

// The extension on the user's own server: the unpacked build in headless Chromium, and the server in this process
// on an in-memory database. The browser's permission prompt cannot be clicked in headless Chromium, so this copy of
// the build has the host 127.0.0.1 from the start; the build itself lists it only as optional (manifest.test.ts).
const built = fileURLToPath(new URL('../packages/host-extension/dist', import.meta.url));
const screens = fileURLToPath(new URL('../test-results/screens/', import.meta.url));

const ANN = { name: 'anna', password: 'anna-password-1' };

let context: BrowserContext;
let worker: Worker;
let dist: string;
let profile: string;
let server: ServerType;
let origin: string;
let code: string;

test.beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'h-board-dist-'));
  cpSync(built, dist, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')) as { host_permissions?: string[]; permissions?: string[] };
  manifest.host_permissions = ['http://127.0.0.1/*'];
  // only so that the test can read back what Copy put on the clipboard; the build does not ask for it
  manifest.permissions = [...(manifest.permissions ?? []), 'clipboardRead'];
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));

  const lines: string[] = [];
  const app = createApp({ version: 'e2e', db: openDatabase(':memory:'), log: (line) => lines.push(line), address: () => '127.0.0.1' });
  code = /setup code: (\S+)/.exec(lines.join('\n'))?.[1] ?? '';
  server = await new Promise<ServerType>((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(started));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

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
  // the event streams of the board stay open until their connections are closed
  (server as unknown as { closeAllConnections(): void }).closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(profile, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
});

/** Asks the server as another browser would. */
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
  return fetch(`${origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** The Server section at the size of its design frame: the panel's 16 px padding and the frame's 40 px margin. */
async function screen(page: Page, name: string): Promise<void> {
  await scrollToSection(page);
  const box = await page.locator('[data-part="server"]').boundingBox();
  if (!box) throw new Error('the Server section is not shown');
  await page.screenshot({ path: `${screens}server-${name}.png`, clip: { x: box.x - 56, y: box.y - 56, width: 400, height: box.height + 112 } });
}

const section = (page: Page): Locator => page.locator('[data-part="server"]');
const head = (page: Page): Locator => section(page).locator('.head');
const first = (page: Page): Locator => head(page).first();
const groups = (page: Page): Locator => page.locator('[data-part="status-left"]');

test('connects, sets up, sends the library, signs in, and goes back to the local library', async () => {
  const page = await context.newPage();
  await page.goto(new URL('settings.html', worker.url()).href);
  await expect(groups(page)).toContainText('8 groups');
  await expect(first(page)).toHaveText('Server');
  await page.locator('[data-part="server-mode-server"]').click();
  const address = page.locator('[data-part="server-address"]');

  // a plain http address to another host is refused before anything is asked
  await address.fill('http://192.168.1.20:8787');
  await page.locator('[data-part="server-submit"]').click();
  await expect(page.locator('[data-part="server-error"]')).toHaveText('server: must be an https address');

  await address.fill(origin);
  await screen(page, 'connect');
  await page.locator('[data-part="server-submit"]').click();
  await expect(head(page)).toHaveText('Server · first sign-in');
  await page.locator('[data-part="server-code"]').fill(code);
  await page.locator('[data-part="server-name"]').fill(ANN.name);
  await page.locator('[data-part="server-password"]').fill(ANN.password);
  await page.locator('[data-part="server-repeat"]').fill(ANN.password);
  await screen(page, 'first-sign-in');
  await page.locator('[data-part="server-submit"]').click();

  // the server's library is empty: the offer to send this browser's
  await expect(head(page)).toHaveText('Server · library');
  await page.locator('[data-part="server-send"]').click();
  await expect(first(page)).toHaveText('Server');
  await expect(page.locator('[data-part="server-status"]')).toHaveText(`anna · admin · ${new URL(origin).host}`);
  await screen(page, 'signed-in');
  await expect(groups(page)).toContainText('8 groups');

  // the server keeps it as one import, in one snapshot; another browser adds a group there
  const { token } = (await (await call('POST', '/api/session', ANN)).json()) as { token: string };
  const kept = (await (await call('GET', '/api/library', undefined, token)).json()) as { library: { groups: unknown[] }; history: { snapshots: unknown[] } };
  expect(kept.library.groups).toHaveLength(8);
  expect(kept.history.snapshots).toHaveLength(2);
  await call('POST', '/api/commands/group.add', { params: { name: 'On the server' } }, token);
  await page.reload();
  await expect(groups(page)).toContainText('9 groups');

  // signed out, the page shows this browser's library, untouched
  await page.locator('[data-part="server-sign-out"]').click();
  await expect(first(page)).toHaveText('Server · sign in');
  await expect(groups(page)).toContainText('8 groups');
  await page.locator('[data-part="server-name"]').fill(ANN.name);
  await page.locator('[data-part="server-password"]').fill('not-the-password');
  await page.locator('[data-part="server-submit"]').click();
  await expect(page.locator('[data-part="server-error"]')).toHaveText('Wrong user name or password. Wait a moment before you try again.');
  await screen(page, 'sign-in');
  await page.locator('[data-part="server-password"]').fill(ANN.password);
  await page.locator('[data-part="server-submit"]').click();
  await expect(first(page)).toHaveText('Server');
  await expect(groups(page)).toContainText('9 groups');

  // back to local mode: the server and its permission are given up, the local library shows
  await page.locator('[data-part="server-sign-out"]').click();
  await page.locator('[data-part="server-local"]').click();
  await expect(page.locator('[data-part="server-mode-local"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(groups(page)).toContainText('8 groups');
  expect(await worker.evaluate('chrome.storage.local.get(["server", "remote"])')).toEqual({ server: null, remote: null });
  await page.close();
});

/** The admin's session token; the admin is made first when the server has no account yet. */
async function admin(): Promise<string> {
  const { needed } = (await (await call('GET', '/api/setup')).json()) as { needed: boolean };
  if (needed) await call('POST', '/api/setup', { code, ...ANN });
  return ((await (await call('POST', '/api/session', ANN)).json()) as { token: string }).token;
}

/** Puts the head of the section at the top of the panel, as in the frame. */
async function scrollToSection(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const node = document.querySelector('[data-part="server"]');
    const panel = node.closest('.hb-panel');
    panel.scrollTop += node.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
  })()`);
}

/** The section from its head down to `last`, at the width of its design frame, as `screen` takes it. */
async function screenTo(page: Page, name: string, last: Locator): Promise<void> {
  await scrollToSection(page);
  const top = await section(page).boundingBox();
  const bottom = await last.boundingBox();
  if (!top || !bottom) throw new Error('the Server section is not shown');
  const height = bottom.y + bottom.height - top.y;
  await page.screenshot({ path: `${screens}server-${name}.png`, clip: { x: top.x - 56, y: top.y - 56, width: 400, height: height + 112 } });
}

test('adds a user, makes a key shown once, copies it, logs its use and revokes it', async () => {
  const token = await admin();
  for (const name of ['mari', 'paul']) await call('POST', '/api/users', { name }, token);
  const page = await context.newPage();
  await page.goto(new URL('settings.html', worker.url()).href);
  await page.locator('[data-part="server-mode-server"]').click();
  await page.locator('[data-part="server-address"]').fill(origin);
  await page.locator('[data-part="server-submit"]').click();
  await expect(first(page)).toHaveText('Server · sign in');
  await page.locator('[data-part="server-name"]').fill(ANN.name);
  await page.locator('[data-part="server-password"]').fill(ANN.password);
  await page.locator('[data-part="server-submit"]').click();
  // the offer comes when this test runs alone, on a server whose library is still empty
  await expect(first(page)).toHaveText(/^Server( · library)?$/);
  if ((await first(page).textContent()) === 'Server · library') await page.locator('[data-part="server-skip"]').click();
  await expect(head(page)).toHaveText(['Server', 'Users · 3', 'Agent keys · 0']);
  const users = section(page).locator('[data-part="user"]');
  await expect(users.locator('.name')).toHaveText(['anna', 'mari', 'paul']);
  await expect(users.locator('.detail')).toHaveText([/^own library · \d+ sites?$/, 'temporary password', 'temporary password']);
  await screenTo(page, 'users', section(page).locator('.hint').first());

  // a new user, with the temporary password shown once
  const dialog = page.locator('[data-part="server-dialog"]');
  await page.locator('[data-part="new-user"]').click();
  await expect(dialog.locator('.txt')).toHaveText('New user');
  await dialog.locator('[data-part="dialog-name"]').fill('lena');
  await dialog.locator('[data-part="dialog-ok"]').click();
  await expect(dialog.locator('.txt')).toHaveText('New user · created');
  const password = await dialog.locator('[data-part="dialog-secret"]').inputValue();
  expect((await call('POST', '/api/session', { name: 'lena', password })).status).toBe(200);
  await page.screenshot({ path: `${screens}server-new-user.png` });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(head(page)).toHaveText(['Server', 'Users · 4', 'Agent keys · 0']);
  expect(await page.content()).not.toContain(password);

  // a new key, copied, used once by an agent, and gone from the page once the dialog closes
  await page.locator('[data-part="new-key"]').click();
  await expect(dialog.locator('.txt')).toHaveText('New agent key');
  await dialog.locator('[data-part="dialog-name"]').fill('claude-desktop');
  await dialog.locator('.scope label', { hasText: 'edit' }).click();
  await dialog.locator('[data-part="dialog-ok"]').click();
  await expect(dialog.locator('.txt')).toHaveText('New agent key · created');
  const key = await dialog.locator('[data-part="dialog-secret"]').inputValue();
  expect(key).toMatch(/^hbk_/);
  await page.screenshot({ path: `${screens}server-new-key.png` });
  await dialog.locator('[data-part="dialog-copy"]').click();
  await expect(dialog.locator('[data-part="dialog-copy"]')).toContainText('Copied');
  expect(await page.evaluate('navigator.clipboard.readText()')).toBe(key);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.content()).not.toContain(key);
  const keys = section(page).locator('[data-part="key"]');
  await expect(keys.locator('.name')).toHaveText(['claude-desktop']);
  await expect(keys.locator('.tag')).toHaveText(['edit']);
  await expect(keys.locator('.detail')).toHaveText(['never used']);
  expect((await call('GET', '/api/library', undefined, key)).status).toBe(200);

  // the settings read the lists again when they open
  await page.keyboard.press('Escape');
  await page.locator('[data-part="settings"]').click();
  await expect(keys.locator('.detail')).toHaveText(['last used just now']);
  await page.locator('[data-part="key-log"]').click();
  await expect(head(page)).toHaveText(['Agent keys · log']);
  await expect(section(page).locator('[data-part="use"] .command')).toHaveText(['library.read']);
  await expect(section(page).locator('[data-part="use"] .detail')).toHaveText(['claude-desktop · edit · done']);
  await screenTo(page, 'key-log', section(page).locator('.hint').last());
  await page.locator('[data-part="key-log-back"]').click();

  // revoked after asking: the key no longer opens anything
  await keys.getByRole('button', { name: 'Revoke' }).click();
  await expect(dialog.locator('.txt')).toHaveText('Revoke key · claude-desktop');
  await dialog.locator('[data-part="dialog-ok"]').click();
  await expect(dialog).toBeHidden();
  await expect(head(page)).toHaveText(['Server', 'Users · 4', 'Agent keys · 0']);
  expect((await call('GET', '/api/library', undefined, key)).status).toBe(401);

  // a reset gives paul a new temporary password; lena is removed after asking
  await users.filter({ hasText: 'paul' }).getByRole('button', { name: 'Reset' }).click();
  await dialog.locator('[data-part="dialog-ok"]').click();
  await expect(dialog.locator('.txt')).toHaveText('Password reset');
  const reset = await dialog.locator('[data-part="dialog-secret"]').inputValue();
  await page.screenshot({ path: `${screens}server-password-reset.png` });
  await dialog.getByRole('button', { name: 'Done' }).click();
  expect((await call('POST', '/api/session', { name: 'paul', password: reset })).status).toBe(200);
  await users.filter({ hasText: 'lena' }).getByRole('button', { name: 'Remove' }).click();
  await dialog.locator('[data-part="dialog-ok"]').click();
  await expect(dialog).toBeHidden();
  await expect(users.locator('.name')).toHaveText(['anna', 'mari', 'paul']);

  await page.locator('[data-part="server-sign-out"]').click();
  await page.locator('[data-part="server-local"]').click();
  await page.close();
});
