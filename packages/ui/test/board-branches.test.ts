// @vitest-environment happy-dom
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import type { Library, Outcome, Site } from '@h-board/core';
import { describe, expect, it, vi } from 'vitest';
import { FieldView } from '../src/field-view';
import type { Rect } from '../src/field';
import type { FaviconSource } from '../src/index';
import { click, fakeFrames, flush, mount, names, part, press } from './mount';

const toastText = (main: HTMLElement): string | null | undefined => part(main, 'toast').querySelector('.msg')?.textContent;
const toastOn = (main: HTMLElement): boolean => part(main, 'toast').dataset['on'] !== undefined;
const lens = (main: HTMLElement): string | null => part(main, 'lens-name').textContent;
const onStandby = (main: HTMLElement): boolean => part(main, 'page').hasAttribute('data-standby');
/** Lets the page's quarter-second timer run once. */
const tickOnce = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 300));

const site = (id: string, name: string): Site => ({
  id,
  name,
  url: `https://${name}.example.com/`,
  description: '',
  glyph: 'globe',
  brand: null,
  icon: null,
});

/** A group of two sites in the favicon mode, then an empty group. */
const faviconLibrary = (): Library => ({
  ...emptyLibrary(),
  groups: [
    { id: 'g1', name: 'Start', iconMode: 'favicon', sites: [site('s1', 'mail'), site('s2', 'news')] },
    { id: 'g2', name: 'Later', iconMode: 'brand', sites: [] },
  ],
  settings: { ...emptyLibrary().settings, activeGroup: 'g1' },
});

/** One empty group. */
const fresh = (): Library => ({
  ...emptyLibrary(),
  groups: [{ id: 'g1', name: 'Start', iconMode: 'brand', sites: [] }],
  settings: { ...emptyLibrary().settings, activeGroup: 'g1' },
});

/** A favicon source that answers only when told to. */
function lateSource(): FaviconSource & { answer(): void } {
  const waiting: (() => void)[] = [];
  return {
    allow: () => Promise.resolve(true),
    find: (url) =>
      new Promise((resolve) => {
        waiting.push(() => resolve(`chrome-extension://id/_favicon/?pageUrl=${url}`));
      }),
    answer: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

const drag = (type: string, target: Element, at: { clientX?: number; clientY?: number; dataTransfer?: unknown } = {}): void => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: 0, clientY: 0, dataTransfer: null, ...at });
  target.dispatchEvent(event);
};

describe('the start page when idle', () => {
  it('counts a pointer movement on the start page as input, so the idle time starts again', async () => {
    const frames = fakeFrames();
    const { main } = await mount(sampleLibrary(), { frames, idleMs: 1000 });
    frames.advance(900);
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true }));
    frames.advance(900);
    await tickOnce();
    expect(onStandby(main)).toBe(false);
    frames.advance(200);
    await tickOnce();
    expect(onStandby(main)).toBe(true);
  });

  it('stays on the start page while the site dialog is open, however long the user waits', async () => {
    const frames = fakeFrames();
    const { main } = await mount(sampleLibrary(), { frames, idleMs: 1000 });
    click(part(main, 'add-site'));
    expect((part(main, 'site-dialog') as HTMLDialogElement).open).toBe(true);
    frames.advance(2000);
    await tickOnce();
    expect(onStandby(main)).toBe(false);
  });

  it('takes the focus off the start page on the way into standby', async () => {
    const { main } = await mount();
    const row = part(main, 'rail').querySelector<HTMLElement>('.drum-row[aria-current]') as HTMLElement;
    row.focus();
    expect(document.activeElement).toBe(row);
    press('s');
    expect(onStandby(main)).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it('lays the page out again during the movement into standby without breaking it', async () => {
    const library = sampleLibrary();
    const frames = fakeFrames();
    const { main } = await mount(
      { ...library, settings: { ...library.settings, motion: 'full' } },
      { frames, systemReducedMotion: () => false, random: () => 0.5 },
    );
    const page = part(main, 'page');
    press('s');
    frames.advance(300);
    expect(page.hasAttribute('data-sb-anim')).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(page.hasAttribute('data-sb-anim')).toBe(true);
    frames.advance(700);
    expect(page.hasAttribute('data-sb-anim')).toBe(false);
    expect(onStandby(main)).toBe(true);
  });
});

describe('the fonts', () => {
  it('draws the page again once the fonts have loaded', async () => {
    let loaded = (): void => undefined;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true });
    const layout = vi.spyOn(FieldView.prototype, 'layout');
    try {
      await mount();
      const before = layout.mock.calls.length;
      loaded();
      await flush();
      expect(layout.mock.calls.length).toBe(before + 1);
    } finally {
      layout.mockRestore();
      delete (document as { fonts?: unknown }).fonts;
    }
  });

  it('draws at once where the browser cannot say when the fonts are ready', async () => {
    Object.defineProperty(document, 'fonts', { value: {}, configurable: true });
    try {
      const { main } = await mount();
      expect(lens(main)).toBe('Development');
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});

describe('clicks beside the controls', () => {
  it('ignores a click on the rail between its buttons', async () => {
    const { main } = await mount();
    click(part(main, 'rail'));
    expect(lens(main)).toBe('Development');
    expect((part(main, 'group-dialog') as HTMLDialogElement).open).toBe(false);
  });

  it('ignores a click in the to-do list beside its buttons', async () => {
    const { main, store } = await mount();
    click(part(main, 'todo-head'));
    click(part(main, 'todo').querySelector('li .txt'));
    await flush();
    expect((await store.load()).library.todos).toEqual(sampleLibrary().todos);
    expect(toastOn(main)).toBe(false);
  });

  it('ignores a click on the edit note beside the group buttons', async () => {
    const { main, store } = await mount();
    press('e');
    click(part(main, 'edit-note').querySelector('span'));
    await flush();
    expect((part(main, 'group-dialog') as HTMLDialogElement).open).toBe(false);
    expect((await store.load()).library.groups).toHaveLength(8);
  });

  it('ignores a click on the grid between the cards in edit mode', async () => {
    const { main } = await mount();
    press('e');
    click(part(main, 'grid'));
    await flush();
    expect((part(main, 'site-dialog') as HTMLDialogElement).open).toBe(false);
    expect(names(main)).toHaveLength(29);
  });

  it('opens no site dialog from the hidden grid once another page removed every group', async () => {
    const { main, store } = await mount();
    const grid = part(main, 'grid');
    for (const group of sampleLibrary().groups) await store.apply('group.remove', { group: group.id });
    expect(grid.hidden).toBe(true);
    click(grid.querySelector('[data-part="add-site"]'));
    expect((part(main, 'site-dialog') as HTMLDialogElement).open).toBe(false);
  });

  it('leaves the scroll marks hidden when an empty group is in view', async () => {
    const { main } = await mount();
    press('5');
    const grid = part(main, 'grid');
    expect(grid.hidden).toBe(true);
    grid.dispatchEvent(new Event('scroll'));
    expect(part(main, 'more').hidden).toBe(true);
  });
});

describe('the settings', () => {
  it('steps the column count down by one while more than four are set', async () => {
    const library = sampleLibrary();
    const { main, store } = await mount({ ...library, settings: { ...library.settings, columns: 6 } });
    click(part(main, 'settings'));
    click(part(main, 'columns-down'));
    await flush();
    expect((await store.load()).library.settings.columns).toBe(5);
    expect(part(main, 'columns').textContent).toBe('5');
  });

  it('goes back from a chosen theme to the one of the system', async () => {
    const library = sampleLibrary();
    const { main, store } = await mount(
      { ...library, settings: { ...library.settings, theme: 'light' } },
      { systemDark: () => true },
    );
    expect(part(main, 'page').dataset['theme']).toBe('light');
    click(part(main, 'settings'));
    const system = part(main, 'theme-system') as HTMLButtonElement;
    expect(system.disabled).toBe(false);
    click(system);
    await flush();
    expect((await store.load()).library.settings.theme).toBe('system');
    expect(part(main, 'page').dataset['theme']).toBe('dark');
    expect((part(main, 'theme-system') as HTMLButtonElement).disabled).toBe(true);
  });

  it('imports bookmarks from the button in the settings, which close', async () => {
    const bookmarks = vi.fn(() => Promise.resolve([{ name: 'Work', sites: [{ name: 'Wiki', url: 'https://wiki.example.com/' }] }]));
    const { main, store } = await mount(fresh(), { bookmarks });
    click(part(main, 'settings'));
    click(part(main, 'bookmarks'));
    await flush();
    expect(bookmarks).toHaveBeenCalledTimes(1);
    expect(part(main, 'settings-panel').hidden).toBe(true);
    expect((await store.load()).library.groups.map((group) => group.name)).toEqual(['Start', 'Work']);
    expect(toastText(main)).toBe('imported from bookmarks · 1 group · 1 site');
  });

  it('shows no icon choice when there is no group', async () => {
    const { main } = await mount(emptyLibrary());
    click(part(main, 'settings'));
    const panel = part(main, 'settings-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('[data-part="icons-label"]')).toBeNull();
    expect(panel.querySelector('[data-icon-mode]')).toBeNull();
  });

  it('changes the density while an empty group is in view', async () => {
    const { main, store } = await mount();
    press('5');
    press(']');
    await flush();
    expect((await store.load()).library.settings.density).toBe('spacious');
    expect(part(main, 'empty').hidden).toBe(false);
  });

  it('saves the export through a download when the host gives no other way', async () => {
    const made = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:h-board');
    const freed = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let clicked: HTMLAnchorElement | undefined;
    const onClick = (event: Event): void => {
      if (event.target instanceof HTMLAnchorElement && event.target.download) {
        clicked = event.target;
        event.preventDefault();
      }
    };
    document.addEventListener('click', onClick);
    try {
      const { main } = await mount();
      click(part(main, 'settings'));
      click(part(main, 'export'));
      await flush();
      expect(made).toHaveBeenCalledTimes(1);
      expect(clicked?.download).toBe('h-board-2026-11-23.json');
      expect(toastText(main)).toBe('exported: h-board-2026-11-23.json');
    } finally {
      document.removeEventListener('click', onClick);
      made.mockRestore();
      freed.mockRestore();
    }
  });

  it('keeps an import that failed while the settings were closed, and shows it when they open', async () => {
    const { main, store } = await mount();
    const apply = store.apply.bind(store);
    store.apply = (id, params, options) => (id === 'library.import' ? Promise.reject('disk full') : apply(id, params, options));
    const input = part(main, 'import-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['{}'], 'backup.json')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await flush();
    expect(part(main, 'settings-panel').hidden).toBe(true);
    click(part(main, 'settings'));
    expect(part(main, 'import-error').hidden).toBe(false);
    expect(part(main, 'import-error').textContent).toBe('backup.json cannot be imported:\ndisk full');
  });
});

describe('moving sites in edit mode', () => {
  it('leaves the cards alone on Shift and a key that is no arrow', async () => {
    const { main } = await mount();
    press('e');
    const first = part(main, 'grid').querySelector<HTMLElement>('.card.ed') as HTMLElement;
    first.focus();
    press('a', { shiftKey: true }, first);
    await flush();
    expect(names(main).slice(0, 2)).toEqual(['github', 'claude']);
  });

  it('drops a card above or below another in the compact layout, by the height of the drop', async () => {
    const library = sampleLibrary();
    const { main } = await mount({ ...library, settings: { ...library.settings, layout: 'compact' } });
    press('e');
    const cards = (): HTMLElement[] => [...part(main, 'grid').querySelectorAll<HTMLElement>('.card.ed')];
    drag('dragstart', cards()[0] as HTMLElement);
    // sideways means nothing in a column of rows
    drag('dragover', cards()[2] as HTMLElement, { clientX: 10, clientY: -10 });
    expect(cards()[2]?.classList.contains('drop-before')).toBe(true);
    drag('dragover', cards()[2] as HTMLElement, { clientX: -10, clientY: 10 });
    expect(cards()[2]?.classList.contains('drop-after')).toBe(true);
    drag('drop', cards()[2] as HTMLElement, { clientY: 10 });
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['claude', 'copia', 'github']);
  });

  it('lets the browser show a move while a card is dragged', async () => {
    const { main } = await mount();
    press('e');
    const dataTransfer = { effectAllowed: 'all' };
    const card = part(main, 'grid').querySelector('.card.ed') as HTMLElement;
    drag('dragstart', card, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(card.classList.contains('dragging')).toBe(true);
  });

  it('ignores a drop that lands after another page emptied the library', async () => {
    const { main, store } = await mount();
    press('e');
    const grid = part(main, 'grid');
    drag('dragstart', grid.querySelector('.card.ed') as HTMLElement);
    for (const group of sampleLibrary().groups) await store.apply('group.remove', { group: group.id });
    expect(grid.hidden).toBe(true);
    // the hidden grid still holds the cards it drew last
    drag('drop', grid.querySelectorAll('.card.ed')[2] as HTMLElement, { clientX: 10 });
    await flush();
    expect((await store.load()).library.groups).toEqual([]);
    expect(toastOn(main)).toBe(false);
  });
});

describe('a command the store refuses', () => {
  it('says why in a toast, for an error and for a bare reason', async () => {
    const { main, store } = await mount();
    const reasons: unknown[] = [new Error('the store is full'), 'offline'];
    store.apply = () => Promise.reject(reasons.shift());
    const form = main.querySelector('form.todo-add') as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    input.value = 'one more';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(toastText(main)).toBe('not saved: the store is full');
    input.value = 'one more';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(toastText(main)).toBe('not saved: offline');
  });
});

describe('favicons', () => {
  it('says why when asking for the permission fails, for an error and for a bare reason', async () => {
    const reasons: unknown[] = [new Error('no permissions API'), 'blocked by policy'];
    const favicons: FaviconSource = {
      allow: () => Promise.reject(reasons.shift()),
      find: () => Promise.resolve(undefined),
    };
    const library = faviconLibrary();
    const { main, store } = await mount(
      { ...library, groups: library.groups.map((group) => ({ ...group, iconMode: 'phosphor' as const })) },
      { favicons },
    );
    click(part(main, 'settings'));
    const favicon = (): HTMLElement => part(main, 'settings-panel').querySelector('[data-icon-mode="favicon"]') as HTMLElement;
    click(favicon());
    await flush();
    expect(toastText(main)).toBe('favicons not shown: no permissions API');
    click(favicon());
    await flush();
    expect(toastText(main)).toBe('favicons not shown: blocked by policy');
    expect((await store.load()).library.groups[0]?.iconMode).toBe('phosphor');
  });

  it('keeps an empty group in view when favicons arrive for the group the user left', async () => {
    const favicons = lateSource();
    const { main } = await mount(faviconLibrary(), { favicons });
    press('2');
    expect(part(main, 'empty').hidden).toBe(false);
    favicons.answer();
    await flush();
    expect(part(main, 'empty').hidden).toBe(false);
    expect(part(main, 'grid').hidden).toBe(true);
    press('1');
    expect(part(main, 'grid').querySelectorAll('.card:not(.add) .tile img')).toHaveLength(2);
  });

  it('draws nothing when favicons arrive after another page removed every group', async () => {
    const favicons = lateSource();
    const { main, store } = await mount(faviconLibrary(), { favicons });
    await store.apply('group.remove', { group: 'g1' });
    await store.apply('group.remove', { group: 'g2' });
    favicons.answer();
    await flush();
    expect(part(main, 'empty').querySelector('h2')?.textContent).toBe('No groups yet.');
  });
});

describe('bookmarks', () => {
  it('names a reason that is no error when reading the bookmarks fails', async () => {
    const { main } = await mount(fresh(), { bookmarks: () => Promise.reject('no access') });
    click(part(main, 'empty').querySelector('.btn.import'));
    await flush();
    expect(toastText(main)).toBe('bookmarks not imported: no access');
  });

  it('keeps the group in view when the store answers before the imported groups reach the page', async () => {
    const bookmarks = (): Promise<{ name: string; sites: { name: string; url: string }[] }[]> =>
      Promise.resolve([{ name: 'Work', sites: [{ name: 'Wiki', url: 'https://wiki.example.com/' }] }]);
    const { main, store } = await mount(emptyLibrary(), { bookmarks });
    // a store whose change reaches the page later than its answer, as a remote one may
    store.apply = () => Promise.resolve({ library: emptyLibrary(), value: { groups: 1, sites: 1 } } as Outcome);
    click(part(main, 'empty').querySelector('.btn.import'));
    await flush();
    expect(toastText(main)).toBe('imported from bookmarks · 1 group · 1 site');
    expect(lens(main)).toBe('');
    expect(part(main, 'empty').querySelector('h2')?.textContent).toBe('No groups yet.');
  });
});

describe('restore', () => {
  /** Deletes a site, so that there is a snapshot to go back to, and picks the oldest one. */
  async function pickOldest(main: HTMLElement): Promise<void> {
    press('e');
    click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
    await flush();
    press('Escape');
    press('v');
    click([...part(main, 'restore-list').querySelectorAll('button')].at(-1));
  }

  it('says nothing when the snapshot turns out to be the library as it is', async () => {
    const { main, store } = await mount();
    await pickOldest(main);
    store.restore = () => Promise.resolve(undefined);
    click(part(main, 'restore-go'));
    await flush();
    expect(part(main, 'restore').hidden).toBe(true);
    // the toast still says what the delete did
    expect(toastText(main)).toBe('deleted: github');
    expect(names(main)).toHaveLength(28);
  });

  it('names a reason that is no error when the restore fails', async () => {
    const { main, store } = await mount();
    await pickOldest(main);
    store.restore = () => Promise.reject('the server is away');
    click(part(main, 'restore-go'));
    await flush();
    expect(toastText(main)).toBe('not restored: the server is away');
  });
});

describe('the field round the start page', () => {
  it('is quieted by the visible blocks and by the cards inside the grid, not by a card scrolled out of it', async () => {
    const { main } = await mount();
    const grid = part(main, 'grid');
    const rect = (left: number, top: number, right: number, bottom: number): DOMRect =>
      ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top }) as DOMRect;
    const boxes = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === grid) return rect(300, 300, 1400, 800);
      if (this.parentElement === grid && this.dataset['index'] === '0') return rect(320, 280, 520, 400);
      if (this.parentElement === grid && this.dataset['index'] === '20') return rect(320, 900, 520, 1000);
      if (this.dataset['part'] === 'time') return rect(330, 100, 600, 190);
      return rect(0, 0, 0, 0);
    });
    const layout = vi.spyOn(FieldView.prototype, 'layout');
    try {
      window.dispatchEvent(new Event('resize'));
      const blocks = layout.mock.calls.at(-1)?.[1] as readonly Rect[];
      expect(blocks).toEqual([
        { left: 330, top: 100, right: 600, bottom: 190 },
        { left: 320, top: 300, right: 520, bottom: 400 },
      ]);
    } finally {
      layout.mockRestore();
      boxes.mockRestore();
    }
  });
});
