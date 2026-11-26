import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import config from '../vite.config';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const publicDir = packageDir + 'public/';
const manifest = JSON.parse(readFileSync(publicDir + 'manifest.json', 'utf8')) as {
  manifest_version: number;
  version: string;
  version_name?: string;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: unknown;
  externally_connectable?: unknown;
  content_security_policy?: unknown;
  chrome_url_overrides: { newtab: string };
  options_ui: { page: string; open_in_tab: boolean };
  background: { service_worker: string; type: string };
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
  omnibox?: { keyword: string };
};

it('is a Manifest V3 extension that takes over the new tab', () => {
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.chrome_url_overrides.newtab).toBe('newtab.html');
});

it('asks for storage and offscreen, bookmarks, favicons and a server only when the user wants them', () => {
  expect(manifest.permissions).toEqual(['storage', 'offscreen']);
  expect(manifest.optional_permissions).toEqual(['bookmarks', 'favicon']);
  expect(manifest.host_permissions ?? []).toEqual([]);
  // the user's own server: any https address, or http on this computer only
  expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']);
});

it('runs no script in other pages, takes no messages from them and keeps the default content policy', () => {
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.externally_connectable).toBeUndefined();
  expect(manifest.content_security_policy).toBeUndefined();
});

it('names pages and a service worker the build makes', () => {
  const input = config.build?.rollupOptions?.input as Record<string, string>;
  expect(Object.values(input).filter((file) => !existsSync(packageDir + file))).toEqual([]);
  expect(input).toMatchObject({ newtab: 'newtab.html', settings: 'settings.html', theme: 'theme.html' });
  expect(manifest.options_ui).toEqual({ page: 'settings.html', open_in_tab: true });
  expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  expect(input['background']).toBe('src/background.ts');
});

it('names only icons that exist', () => {
  const icons = [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  expect(icons.length).toBeGreaterThan(0);
  expect(icons.filter((icon) => !existsSync(publicDir + icon))).toEqual([]);
});

it('uses only the local storage area, never the one that syncs to an account', () => {
  const sources = readdirSync(packageDir + 'src').map((file) => readFileSync(`${packageDir}src/${file}`, 'utf8'));
  expect(sources.filter((source) => /storage\s*\.\s*sync|\bsync\s*:/.test(source))).toEqual([]);
});

it('is the beta 0.1.0-beta.1, with a version Chromium accepts', () => {
  const pkg = JSON.parse(readFileSync(packageDir + 'package.json', 'utf8')) as { version: string };
  expect(manifest.version_name).toBe('0.1.0-beta.1');
  expect(pkg.version).toBe(manifest.version_name);
  // Chromium takes one to four dot-separated integers up to 65535 and nothing else; the beta number is the fourth.
  expect(manifest.version).toBe('0.1.0.1');
});

it('has an install guide for this version in Chrome, Brave, Edge and Helium', () => {
  const guide = readFileSync(packageDir + '../../INSTALL.md', 'utf8');
  expect(guide).toContain(`h-board-${manifest.version_name}.zip`);
  expect(guide).toContain(`version \`${manifest.version_name}\``);
  for (const page of ['chrome://extensions', 'brave://extensions', 'edge://extensions']) expect(guide).toContain(page);
  for (const browser of ['Chrome', 'Brave', 'Edge', 'Helium', 'Monknow']) expect(guide).toContain(browser);
});

it('zips the build under the name of its version', () => {
  const plugins = (config.plugins ?? []).flat() as { name?: string; version?: string }[];
  expect(plugins.find((plugin) => plugin.name === 'h-board-zip')?.version).toBe(manifest.version_name);
});

it('takes the address bar after the keyword h', () => {
  expect(manifest.omnibox).toEqual({ keyword: 'h' });
});
