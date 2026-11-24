import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkLibraryFile, sampleLibrary, writeLibraryFile } from '../src/index';

/** The sample data of the English drawing, read from `docs/design/gen/build.py` as it is. */
function drawing(): { groups: string[]; counts: number[]; active: number; sites: string[][] } {
  const source = readFileSync(new URL('../../../docs/design/gen/build.py', import.meta.url), 'utf8');
  const constant = (name: string): string => {
    const match = new RegExp(`^${name} = (.+)$`, 'm').exec(source);
    if (!match?.[1]) throw new Error(`build.py has no ${name}`);
    return match[1];
  };
  const block = /^SITES = \[\n([\s\S]*?)\n\]$/m.exec(source)?.[1] ?? '';
  const sites = block.split('\n').map((line) => JSON.parse(line.trim().replace(/^\((.*)\),$/, '[$1]')) as string[]);
  const active = Number(constant('ACTIVE'));
  const counts = JSON.parse(constant('COUNTS')) as number[];
  // build.py: COUNTS[ACTIVE] = len(SITES), the wheel and the status bar read the same numbers.
  expect(source).toContain('COUNTS[ACTIVE] = len(SITES)');
  counts[active] = sites.length;
  return { groups: JSON.parse(constant('GROUPS')) as string[], counts, active, sites };
}

const glyphs = JSON.parse(
  readFileSync(new URL('../../../docs/design/gen/phosphor-map.json', import.meta.url), 'utf8'),
) as { regular: Record<string, string> };

describe('sampleLibrary', () => {
  const sample = sampleLibrary();
  const design = drawing();

  it('has the groups of the drawing, in its order', () => {
    expect(sample.groups.map((group) => group.name)).toEqual(design.groups);
  });

  it('has as many sites in each group as the drawing counts', () => {
    expect(sample.groups.map((group) => group.sites.length)).toEqual(design.counts);
  });

  it('opens on the active group of the drawing', () => {
    expect(sample.settings.activeGroup).toBe(sample.groups[design.active]?.id);
  });

  it('has the sites of the drawing in the active group, as they are', () => {
    const active = sample.groups[design.active]?.sites ?? [];
    expect(active.map((site) => [site.name, site.glyph, site.description, site.url])).toEqual(
      design.sites.map(([name, glyph, description, host]) => [name, glyph, description, `https://${host}`]),
    );
  });

  it('gives the sites the drawing only counts example.com addresses', () => {
    const others = sample.groups.filter((_, i) => i !== design.active).flatMap((group) => group.sites);
    expect(others.length).toBeGreaterThan(0);
    for (const site of others) expect(site.url).toMatch(/^https:\/\/([a-z0-9-]+\.)*example\.com(\/|$)/);
  });

  it('uses only glyphs of the bundled Phosphor set', () => {
    const missing = sample.groups.flatMap((group) => group.sites).filter((site) => !(site.glyph in glyphs.regular));
    expect(missing).toEqual([]);
  });

  it('gives the sites of the active group the brand marks the mock gives them', () => {
    // mock/app.js: the Simple Icons slug of every site whose mark is bundled; the made-up sites have none
    const brands = (sample.groups[design.active]?.sites ?? []).flatMap((site) =>
      site.brand ? [[site.name, site.brand]] : [],
    );
    expect(brands).toEqual([
      ['github', 'github'],
      ['claude', 'claude'],
      ['docs.rs', 'docsdotrs'],
      ['mdn', 'mdnwebdocs'],
      ['flathub', 'flathub'],
      ['nextcloud', 'nextcloud'],
      ['hetzner', 'hetzner'],
      ['gitlab', 'gitlab'],
      ['codeberg', 'codeberg'],
      ['grafana', 'grafana'],
      ['home assistant', 'homeassistant'],
      ['stack overflow', 'stackoverflow'],
    ]);
    const others = sample.groups.filter((_, i) => i !== design.active).flatMap((group) => group.sites);
    expect(others.filter((site) => site.brand !== null)).toEqual([]);
  });

  it('has the todos of the drawing', () => {
    expect(sample.todos.map((todo) => [todo.text, todo.done])).toEqual([
      ['Client: review the quote', false],
      ['Code review: PR #41', false],
      ['Brand repo v2.3 tag', true],
    ]);
  });

  it('is a valid library', () => {
    expect(checkLibraryFile(writeLibraryFile(sample))).toEqual([]);
  });

  it('gives a new copy every time', () => {
    expect(sampleLibrary()).not.toBe(sample);
    expect(sampleLibrary()).toEqual(sample);
  });
});
