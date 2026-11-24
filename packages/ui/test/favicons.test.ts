// @vitest-environment happy-dom
import { emptyLibrary } from '@h-board/core';
import type { IconMode, Library, Site } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import type { FaviconSource } from '../src/index';
import { click, flush, mount, part, press } from './mount';

const site = (id: string, name: string, url: string, glyph: string, icon: IconMode | null = null): Site => ({
  id,
  name,
  url,
  description: '',
  glyph,
  brand: null,
  icon,
});

/** One group of three: a site the browser has a favicon for, one it has none for, one without a Phosphor icon. */
function board(iconMode: IconMode): Library {
  return {
    ...emptyLibrary(),
    groups: [
      {
        id: 'g1',
        name: 'Start',
        iconMode,
        sites: [
          site('s1', 'Mail', 'https://mail.example.com/', 'envelope-simple'),
          site('s2', 'News', 'https://news.example.org/', 'newspaper'),
          site('s3', 'Wiki', 'https://wiki.example.net/', ''),
        ],
      },
    ],
    settings: { ...emptyLibrary().settings, activeGroup: 'g1' },
  };
}

/** A source that has the favicon of mail.example.com only, and counts the permission prompts. */
function source(allowed: boolean[] = []): FaviconSource & { asked: number; found: string[] } {
  const fake = {
    asked: 0,
    found: [] as string[],
    allow: () => {
      fake.asked += 1;
      return Promise.resolve(allowed.shift() ?? true);
    },
    find: (url: string) => {
      fake.found.push(url);
      return Promise.resolve(url.includes('mail.example.com') ? `chrome-extension://id/_favicon/?pageUrl=${url}` : undefined);
    },
  };
  return fake;
}

/** What each card's tile shows: `img` with its address, `ph`, `initial` or `brand`. */
const tiles = (main: HTMLElement): string[] =>
  [...part(main, 'grid').querySelectorAll('.card:not(.add) .tile')].map((tile) => {
    const img = tile.querySelector('img');
    if (img) return `img ${img.getAttribute('src') ?? ''}`;
    return (tile.firstElementChild as Element).classList.contains('ph') ? 'ph' : (tile.firstElementChild as Element).getAttribute('class') ?? '';
  });

const modeButton = (main: HTMLElement, mode: IconMode): HTMLElement =>
  part(main, 'settings-panel').querySelector<HTMLElement>(`[data-icon-mode="${mode}"]`) as HTMLElement;

const toastText = (main: HTMLElement): string | null | undefined => part(main, 'toast').querySelector('.msg')?.textContent;

describe('the favicon icon mode', () => {
  it('shows the Phosphor icon without a favicon source, and the initial for a site without one', async () => {
    const { main } = await mount(board('favicon'));
    expect(tiles(main)).toEqual(['ph', 'ph', 'initial']);
  });

  it("shows the browser's stored favicon, and the Phosphor icon where the browser has none", async () => {
    const favicons = source();
    const { main } = await mount(board('favicon'), { favicons });
    await flush();
    expect(tiles(main)).toEqual(['img chrome-extension://id/_favicon/?pageUrl=https://mail.example.com/', 'ph', 'initial']);
    // nothing is asked for on the way: the permission is a question of the click
    expect(favicons.asked).toBe(0);
  });

  it('shows the Phosphor icon when the source fails', async () => {
    const favicons: FaviconSource = { allow: () => Promise.resolve(true), find: () => Promise.reject(new Error('no image')) };
    const { main } = await mount(board('favicon'), { favicons });
    await flush();
    expect(tiles(main)).toEqual(['ph', 'ph', 'initial']);
  });

  it('looks up a favicon only for the sites that show one', async () => {
    const favicons = source();
    const library = board('phosphor');
    const group = library.groups[0] as Library['groups'][number];
    const own = { ...library, groups: [{ ...group, sites: [{ ...group.sites[0], icon: 'favicon' }, group.sites[1]] }] } as Library;
    const { main } = await mount(own, { favicons });
    await flush();
    expect(favicons.found).toEqual(['https://mail.example.com/']);
    expect(tiles(main)[0]).toMatch(/^img /);
    expect(tiles(main)[1]).toBe('ph');
  });

  it('asks for the permission only when a group is switched to favicons', async () => {
    const favicons = source();
    const { main, store } = await mount(board('brand'), { favicons });
    click(part(main, 'settings'));
    click(modeButton(main, 'phosphor'));
    click(modeButton(main, 'initial'));
    await flush();
    expect(favicons.asked).toBe(0);
    click(modeButton(main, 'favicon'));
    expect(favicons.asked).toBe(1);
    await flush();
    expect((await store.load()).library.groups[0]?.iconMode).toBe('favicon');
    expect(tiles(main)[0]).toMatch(/^img /);
  });

  it('keeps the previous mode when the browser refuses, and says why', async () => {
    const favicons = source([false]);
    const { main, store } = await mount(board('phosphor'), { favicons });
    click(part(main, 'settings'));
    click(modeButton(main, 'favicon'));
    await flush();
    expect((await store.load()).library.groups[0]?.iconMode).toBe('phosphor');
    expect(modeButton(main, 'phosphor').getAttribute('aria-pressed')).toBe('true');
    expect(toastText(main)).toBe('favicons not shown: the browser did not allow it, Start stays on phosphor');
    expect(favicons.found).toEqual([]);
  });

  it('asks again for the favicons the browser had none for, once it allows them', async () => {
    const favicons = source();
    const { main } = await mount(board('favicon'), { favicons });
    await flush();
    expect(favicons.found.filter((url) => url.includes('news'))).toHaveLength(1);
    click(part(main, 'settings'));
    click(modeButton(main, 'phosphor'));
    await flush();
    click(modeButton(main, 'favicon'));
    await flush();
    expect(favicons.asked).toBe(1);
    expect(favicons.found.filter((url) => url.includes('news'))).toHaveLength(2);
    // the favicon the browser had is kept and not asked for again
    expect(favicons.found.filter((url) => url.includes('mail'))).toHaveLength(1);
  });

  it('switches to favicons without asking where the host has no source', async () => {
    const { main, store } = await mount(board('brand'));
    click(part(main, 'settings'));
    click(modeButton(main, 'favicon'));
    await flush();
    expect((await store.load()).library.groups[0]?.iconMode).toBe('favicon');
  });

  it('counts the favicons in the settings, the rest show their Phosphor icon', async () => {
    const { main } = await mount(board('favicon'), { favicons: source() });
    click(part(main, 'settings'));
    await flush();
    expect(part(main, 'icons-hint').textContent).toBe('Per group. Favicons: 1 / 3, the rest show their Phosphor icon.');
  });
});

describe('the favicon choice of a site', () => {
  const openEdit = (main: HTMLElement): HTMLDialogElement => {
    press('e');
    click(part(main, 'grid').querySelector('[data-act="edit"]'));
    return part(main, 'site-dialog') as HTMLDialogElement;
  };
  const choose = (dialog: HTMLElement, mode: IconMode): void => {
    const radio = dialog.querySelector<HTMLInputElement>(`input[name="icon"][value="${mode}"]`) as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const checked = (dialog: HTMLElement): string | undefined =>
    dialog.querySelector<HTMLInputElement>('input[name="icon"]:checked')?.value;

  it('asks for the permission when a site is switched to its favicon, and saves the choice', async () => {
    const favicons = source();
    const { main, store } = await mount(board('phosphor'), { favicons });
    const dialog = openEdit(main);
    choose(dialog, 'initial');
    expect(favicons.asked).toBe(0);
    choose(dialog, 'favicon');
    expect(favicons.asked).toBe(1);
    await flush();
    expect(checked(dialog)).toBe('favicon');
    expect(part(dialog, 'preview-favicon').querySelector('img')?.getAttribute('src')).toBe(
      'chrome-extension://id/_favicon/?pageUrl=https://mail.example.com/',
    );
    click(part(dialog, 'dialog-ok'));
    await flush();
    expect((await store.load()).library.groups[0]?.sites[0]?.icon).toBe('favicon');
  });

  it('goes back to the previous choice when the browser refuses, and says why', async () => {
    const { main } = await mount(board('phosphor'), { favicons: source([false]) });
    const dialog = openEdit(main);
    choose(dialog, 'favicon');
    await flush();
    expect(checked(dialog)).toBe('phosphor');
    expect(part(dialog, 'favicon-refused').hidden).toBe(false);
    expect(part(dialog, 'favicon-refused').textContent).toBe('The browser did not allow favicons; the icon stays as it was.');
    choose(dialog, 'brand');
    expect(part(dialog, 'favicon-refused').hidden).toBe(true);
  });

  it('previews the Phosphor icon where there is no favicon to show', async () => {
    const { main } = await mount(board('phosphor'));
    const dialog = openEdit(main);
    expect(part(dialog, 'preview-favicon').querySelector('.ph')).not.toBeNull();
  });
});
