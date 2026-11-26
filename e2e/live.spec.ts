import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, openDatabase } from '../packages/host-server/src/index';

// An open board on the user's own server follows it: a change an agent makes through REST shows without a reload,
// marked with the key's name, and z takes it back; once the server is gone the page says it is read only. As in
// server.spec.ts, the server runs in this process and this copy of the build has the host 127.0.0.1 from the start.
const built = fileURLToPath(new URL('../packages/host-extension/dist', import.meta.url));
const screens = fileURLToPath(new URL('../test-results/screens/', import.meta.url));

const ANN = { name: 'anna', password: 'anna-password-1' };
const OFFLINE = 'The server cannot be reached, so the library can be read but not changed.';

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

/** Stops the server; the board's event stream ends with it. */
async function stopServer(): Promise<void> {
  if (!server.listening) return;
  (server as unknown as { closeAllConnections(): void }).closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test.afterAll(async () => {
  await context.close();
  await stopServer();
  rmSync(profile, { recursive: true, force: true });
  rmSync(dist, { recursive: true, force: true });
});

/** Asks the server as another program would: the user's other browser, or an agent with its key. */
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
  return fetch(`${origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Connects the board to the server, makes the admin there, and sends this browser's library to it. */
async function signIn(page: Page): Promise<void> {
  await page.goto(new URL('settings.html', worker.url()).href);
  await page.locator('[data-part="server-mode-server"]').click();
  await page.locator('[data-part="server-address"]').fill(origin);
  await page.locator('[data-part="server-submit"]').click();
  await page.locator('[data-part="server-code"]').fill(code);
  await page.locator('[data-part="server-name"]').fill(ANN.name);
  await page.locator('[data-part="server-password"]').fill(ANN.password);
  await page.locator('[data-part="server-repeat"]').fill(ANN.password);
  await page.locator('[data-part="server-submit"]').click();
  await page.locator('[data-part="server-send"]').click();
  await expect(page.locator('[data-part="server-status"]')).toHaveText(`anna · admin · ${new URL(origin).host}`);
}

const names = (page: Page) => page.locator('[data-part="grid"] .card:not(.add) .name');

test('shows an agent change at once, marked with its key, takes it back with z, and is read only offline', async () => {
  const page = await context.newPage();
  await signIn(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-part="sync"]')).toHaveText('synced · just now');

  const { token } = (await (await call('POST', '/api/session', ANN)).json()) as { token: string };
  const { secret } = (await (await call('POST', '/api/keys', { name: 'claude-desktop', scope: 'edit' }, token)).json()) as { secret: string };
  const { library } = (await (await call('GET', '/api/library', undefined, token)).json()) as {
    library: { groups: { id: string; name: string }[]; settings: { activeGroup: string | null } };
  };
  const shown = library.groups.find((group) => group.id === library.settings.activeGroup) ?? library.groups[0];
  if (!shown) throw new Error('the library has no group');

  // the agent adds a site through REST; the open board shows it without a reload, marked with the key
  const added = await call('POST', '/api/commands/site.add', { params: { group: shown.id, name: 'forgejo', url: 'https://forgejo.example.com' } }, secret);
  expect(added.status).toBe(200);
  await expect(names(page)).toContainText(['forgejo']);
  const mark = page.locator('[data-part="agent-change"]');
  await expect(mark).toHaveText(`claude-desktop: +forgejo in ${shown.name} · z: undo`);
  await page.screenshot({ path: `${screens}server-agent-change.png` });

  // the restore panel names the key as the source
  await page.keyboard.press('v');
  await expect(page.locator('[data-part="restore-list"] button .l').first()).toHaveText(`claude-desktop: +forgejo in ${shown.name}`);
  await page.keyboard.press('Escape');

  // z takes the agent's change back, and the mark goes with it
  await page.keyboard.press('z');
  await expect(names(page)).not.toContainText(['forgejo']);
  await expect(mark).toBeHidden();

  // the server goes away: the page says it is read only, and an edit is refused with the notice
  await stopServer();
  await expect(page.locator('[data-part="sync"]')).toHaveText(/^offline · last synced /, { timeout: 15_000 });
  await page.locator('[data-part="settings"]').click();
  await expect(page.locator('[data-part="server-read-only"]')).toContainText('The server cannot be reached. You see the copy saved at');
  await expect(page.locator('[data-part="server-status"]')).toHaveText(`offline · ${new URL(origin).host}`);
  // the head of the section at the top of the panel, as in the frame
  await page.evaluate(`(() => {
    const node = document.querySelector('[data-part="server"]');
    const panel = node.closest('.hb-panel');
    panel.scrollTop += node.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
  })()`);
  await page.screenshot({ path: `${screens}server-offline.png` });
  await page.keyboard.press('Escape');

  const before = await names(page).allTextContents();
  await page.keyboard.press('e');
  await page.locator('[data-part="grid"] .card.ed [data-act="delete"]').first().click();
  await expect(page.locator('[data-part="toast"]')).toHaveText(`not saved: ${OFFLINE}`);
  await page.keyboard.press('Escape');
  await expect(names(page)).toHaveText(before);
  await page.keyboard.press('z');
  await expect(page.locator('[data-part="toast"]')).toHaveText(`not undone: ${OFFLINE}`);
  await page.close();
});
