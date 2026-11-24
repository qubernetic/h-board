import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const manifest = JSON.parse(readFileSync(publicDir + 'manifest.json', 'utf8')) as {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  chrome_url_overrides: { newtab: string };
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
};

it('is a Manifest V3 extension that takes over the new tab', () => {
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.chrome_url_overrides.newtab).toBe('newtab.html');
});

it('asks for no permissions and no hosts', () => {
  expect(manifest.permissions ?? []).toEqual([]);
  expect(manifest.host_permissions ?? []).toEqual([]);
});

it('names only icons that exist', () => {
  const icons = [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  expect(icons.length).toBeGreaterThan(0);
  expect(icons.filter((icon) => !existsSync(publicDir + icon))).toEqual([]);
});
