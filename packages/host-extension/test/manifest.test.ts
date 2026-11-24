import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import config from '../vite.config';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const publicDir = packageDir + 'public/';
const manifest = JSON.parse(readFileSync(publicDir + 'manifest.json', 'utf8')) as {
  manifest_version: number;
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

it('asks for storage and offscreen, bookmarks only when the user imports them, and no hosts', () => {
  expect(manifest.permissions).toEqual(['storage', 'offscreen']);
  expect(manifest.optional_permissions).toEqual(['bookmarks']);
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.optional_host_permissions ?? []).toEqual([]);
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

it('takes the address bar after the keyword h', () => {
  expect(manifest.omnibox).toEqual({ keyword: 'h' });
});
