// @vitest-environment happy-dom
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import type { ImportGroup, Library } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { describe, expect, it, vi } from 'vitest';
import { mountBoard } from '../src/index';
import { click, flush, mount, part } from './mount';

/** One group, with nothing in it yet. */
const fresh: Library = {
  ...emptyLibrary(),
  groups: [{ id: 'g1', name: 'Start', iconMode: 'brand', sites: [] }],
  settings: { ...emptyLibrary().settings, activeGroup: 'g1' },
};

const folders: ImportGroup[] = [
  { name: 'Bookmarks bar', sites: [{ name: 'Mail', url: 'https://mail.example.com/' }] },
  {
    name: 'Work',
    sites: [
      { name: 'Tracker', url: 'https://tracker.example.com/' },
      { name: 'Wiki', url: 'https://wiki.example.com/' },
    ],
  },
];

const importButton = (main: HTMLElement): HTMLButtonElement =>
  part(main, 'empty').querySelector<HTMLButtonElement>('.btn.import') as HTMLButtonElement;

const toastText = (main: HTMLElement): string | null | undefined =>
  part(main, 'toast').querySelector('.msg')?.textContent;

describe('import from bookmarks', () => {
  it('is off when the host cannot read bookmarks', async () => {
    const { main } = await mount(fresh);
    expect(importButton(main).disabled).toBe(true);
    click(part(main, 'settings'));
    expect(main.querySelector('[data-part="bookmarks"]')).toBeNull();
  });

  it('turns every folder into a group from the empty group, shows the first, and undo takes it all back', async () => {
    const bookmarks = vi.fn(() => Promise.resolve(folders));
    const { main, store } = await mount(fresh, { bookmarks });
    expect(importButton(main).disabled).toBe(false);
    click(importButton(main));
    await flush();
    expect(bookmarks).toHaveBeenCalledTimes(1);
    const { library } = await store.load();
    expect(library.groups.map((group) => [group.name, group.sites.length])).toEqual([
      ['Start', 0],
      ['Bookmarks bar', 1],
      ['Work', 2],
    ]);
    expect(part(main, 'lens-name').textContent).toBe('Bookmarks bar');
    expect(toastText(main)).toBe('imported from bookmarks · 2 groups · 3 sites');

    click(part(main, 'toast').querySelector('button') as HTMLElement);
    await flush();
    expect((await store.load()).library.groups.map((group) => group.name)).toEqual(['Start']);
  });

  it('imports from the settings too, and closes them', async () => {
    const { main, store } = await mount(sampleLibrary(), { bookmarks: () => Promise.resolve(folders.slice(0, 1)) });
    click(part(main, 'settings'));
    click(part(main, 'bookmarks'));
    await flush();
    expect(part(main, 'settings-panel').hidden).toBe(true);
    expect((await store.load()).library.groups.at(-1)?.name).toBe('Bookmarks bar');
    expect(toastText(main)).toBe('imported from bookmarks · 1 group · 1 site');
  });

  it('changes nothing when the permission is refused, or there is nothing to import', async () => {
    const answers: (ImportGroup[] | undefined)[] = [undefined, []];
    const { main, store } = await mount(fresh, { bookmarks: () => Promise.resolve(answers.shift()) });
    click(importButton(main));
    await flush();
    expect(toastText(main)).toBe('bookmarks not imported: the browser did not allow it');
    click(importButton(main));
    await flush();
    expect(toastText(main)).toBe('no bookmarks to import: no folder holds a web address');
    expect((await store.load()).library).toEqual(fresh);
  });

  it('says why the bookmarks could not be read', async () => {
    const { main } = await mount(fresh, { bookmarks: () => Promise.reject(new Error('no access')) });
    click(importButton(main));
    await flush();
    expect(toastText(main)).toBe('bookmarks not imported: no access');
  });
});

describe('the store notice', () => {
  it('shows what the store had to recover, as text', async () => {
    const store = new MemoryStore({ initial: () => fresh });
    const load = store.load.bind(store);
    store.load = async () => ({ ...(await load()), notice: 'The stored library could not be read <b>.' });
    const main = document.createElement('main');
    document.body.append(main);
    const stop = await mountBoard(main, store, { viewport: () => ({ w: 1440, h: 900 }), systemReducedMotion: () => true });
    expect(toastText(main)).toBe('The stored library could not be read <b>.');
    stop();
    main.remove();
  });
});
