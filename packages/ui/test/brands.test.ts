// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { BRANDS, brandMark, guessBrand } from '../src/brands';
import { mount, part } from './mount';

describe('the bundled brand marks', () => {
  it('lists the Simple Icons marks with their titles, by slug', () => {
    expect(BRANDS.length).toBe(43);
    expect(BRANDS.find((brand) => brand.slug === 'github')?.title).toBe('GitHub');
    expect(BRANDS.map((brand) => brand.slug)).toEqual([...BRANDS.map((brand) => brand.slug)].sort());
  });

  it('draws a mark as an SVG path, and nothing for a slug it lacks', () => {
    const mark = brandMark(document, 'github');
    expect(mark?.tagName.toLowerCase()).toBe('svg');
    expect(mark?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(mark?.querySelector('path')?.getAttribute('d')).toMatch(/^M12/);
    expect(brandMark(document, 'nosuchbrand')).toBeNull();
  });

  it('guesses the mark of an address from its host', () => {
    expect(guessBrand('https://github.com/qubernetic')).toBe('github');
    expect(guessBrand('https://www.youtube.com')).toBe('youtube');
    expect(guessBrand('https://music.youtube.com')).toBe('youtube');
    expect(guessBrand('https://cloud.example.com')).toBeNull();
    expect(guessBrand('not an address')).toBeNull();
  });
});

describe('a card in brand mode', () => {
  const withBrand = (brand: string | null, icon: Library['groups'][number]['iconMode'] | null = null): Library => {
    const library = sampleLibrary();
    const groups = library.groups.map((group, g) =>
      g === 1 ? { ...group, sites: group.sites.map((site, i) => (i === 0 ? { ...site, brand, icon } : site)) } : group,
    );
    return { ...library, groups };
  };

  it("shows the site's mark where the site has one, and its glyph otherwise", async () => {
    const { main } = await mount(withBrand('github'));
    const tiles = part(main, 'grid').querySelectorAll('.card .tile');
    expect(tiles[0]?.querySelector('svg.brand')).not.toBeNull();
    expect(tiles[1]?.querySelector('svg')).toBeNull();
    expect(tiles[1]?.querySelector('.ph')).not.toBeNull();
  });

  it("follows the site's own icon mode over the group's", async () => {
    const { main } = await mount(withBrand('github', 'phosphor'));
    expect(part(main, 'grid').querySelector('.card .tile svg')).toBeNull();
  });
});
