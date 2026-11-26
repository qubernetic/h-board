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
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')) as { host_permissions?: string[] };
  manifest.host_permissions = ['http://127.0.0.1/*'];
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
  // the head of the section at the top of the panel, as in the frame
  await page.evaluate(`(() => {
    const node = document.querySelector('[data-part="server"]');
    const panel = node.closest('.hb-panel');
    panel.scrollTop += node.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
  })()`);
  const box = await page.locator('[data-part="server"]').boundingBox();
  if (!box) throw new Error('the Server section is not shown');
  await page.screenshot({ path: `${screens}server-${name}.png`, clip: { x: box.x - 56, y: box.y - 56, width: 400, height: box.height + 112 } });
}

const section = (page: Page): Locator => page.locator('[data-part="server"]');
const head = (page: Page): Locator => section(page).locator('.head');
const groups = (page: Page): Locator => page.locator('[data-part="status-left"]');

test('connects, sets up, sends the library, signs in, and goes back to the local library', async () => {
  const page = await context.newPage();
  await page.goto(new URL('settings.html', worker.url()).href);
  await expect(groups(page)).toContainText('8 groups');
  await expect(head(page)).toHaveText('Server');
  await page.locator('[data-part="server-mode-server"]').click();
  const address = page.locator('[data-part="server-address"]');

  // a plain http address to another host is refused before anything is asked
  await address.fill('http://192.168.1.20:8787');
  await page.locator('[data-part="server-submit"]').click();
  await expect(page.locator('[data-part="server-error"]')).toHaveText('address: must be https, or http for localhost and 127.0.0.1');

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
  await expect(head(page)).toHaveText('Server');
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
  await expect(head(page)).toHaveText('Server · sign in');
  await expect(groups(page)).toContainText('8 groups');
  await page.locator('[data-part="server-name"]').fill(ANN.name);
  await page.locator('[data-part="server-password"]').fill('not-the-password');
  await page.locator('[data-part="server-submit"]').click();
  await expect(page.locator('[data-part="server-error"]')).toHaveText('Wrong user name or password. Wait a moment before you try again.');
  await screen(page, 'sign-in');
  await page.locator('[data-part="server-password"]').fill(ANN.password);
  await page.locator('[data-part="server-submit"]').click();
  await expect(head(page)).toHaveText('Server');
  await expect(groups(page)).toContainText('9 groups');

  // back to local mode: the server and its permission are given up, the local library shows
  await page.locator('[data-part="server-sign-out"]').click();
  await page.locator('[data-part="server-local"]').click();
  await expect(page.locator('[data-part="server-mode-local"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(groups(page)).toContainText('8 groups');
  expect(await worker.evaluate('chrome.storage.local.get(["server", "remote"])')).toEqual({ server: null, remote: null });
  await page.close();
});
