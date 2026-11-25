// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import { SCHEMA } from '@h-board/store';
import { afterEach, describe, expect, it } from 'vitest';
import { startBoard } from '../src/index';
import type { BookmarkNode, ExtensionApi } from '../src/index';
import { FakeArea } from './area';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const part = (root: ParentNode, name: string): HTMLElement => {
  const node = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!node) throw new Error(`no ${name}`);
  return node;
};

let stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.body.replaceChildren();
});

async function start(chrome: ExtensionApi | undefined, settings = false): Promise<HTMLElement> {
  const root = document.createElement('main');
  document.body.append(root);
  stops.push(await startBoard(root, chrome, { settings, options: { viewport: () => ({ w: 1440, h: 900 }), systemReducedMotion: () => true } }));
  return root;
}

const tree: BookmarkNode[] = [{ title: '', children: [{ title: 'Bookmarks bar', children: [{ title: 'Mail', url: 'https://mail.example.com/' }] }] }];

describe('startBoard', () => {
  it('keeps the library in the local area, starting from the sample library', async () => {
    const area = new FakeArea();
    const root = await start({ storage: { local: area } });
    expect(area.read('library')).toBeUndefined();
    click(part(root, 'theme'));
    await flush();
    expect(area.read('schema')).toBe(SCHEMA);
    const library = area.read('library') as ReturnType<typeof sampleLibrary>;
    expect(library.groups).toEqual(sampleLibrary().groups);
    expect(library.settings.theme).not.toBe(sampleLibrary().settings.theme);
  });

  it('keeps the group in view in the local area, for the codes of the address bar', async () => {
    const area = new FakeArea();
    await start({ storage: { local: area } });
    expect(area.read('group')).toBe(sampleLibrary().settings.activeGroup);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(area.read('group')).toBe(sampleLibrary().groups[2]?.id);
  });

  it('goes on when the local area refuses the group in view', async () => {
    const area = new FakeArea();
    area.set = (items) => ('group' in items ? Promise.reject(new Error('QUOTA_BYTES quota exceeded')) : FakeArea.prototype.set.call(area, items));
    const root = await start({ storage: { local: area } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    await flush();
    expect(area.read('group')).toBeUndefined();
    expect(part(root, 'status-left').textContent).toContain('8 groups');
  });

  it('runs on a store in memory outside the extension, without bookmarks', async () => {
    const root = await start(undefined);
    expect(part(root, 'status-left').textContent).toContain('8 groups');
    click(part(root, 'settings'));
    expect(root.querySelector('[data-part="bookmarks"]')).toBeNull();
  });

  it('opens the settings on the settings page', async () => {
    const root = await start({ storage: { local: new FakeArea() } }, true);
    expect(part(root, 'settings-panel').hidden).toBe(false);
  });

  it('asks for the bookmarks permission in the click, then imports the folders', async () => {
    const area = new FakeArea();
    const asked: unknown[] = [];
    const chrome: ExtensionApi = {
      storage: { local: area },
      permissions: {
        request: (permissions) => {
          asked.push(permissions);
          // the browser adds the API once the user allows it
          chrome.bookmarks = { getTree: () => Promise.resolve(tree) };
          return Promise.resolve(true);
        },
        contains: () => Promise.resolve(false),
      },
    };
    const root = await start(chrome);
    click(part(root, 'settings'));
    click(part(root, 'bookmarks'));
    expect(asked).toEqual([{ permissions: ['bookmarks'] }]);
    await flush();
    const library = area.read('library') as ReturnType<typeof sampleLibrary>;
    expect(library.groups.at(-1)?.name).toBe('Bookmarks bar');
  });

  it('says so when the bookmarks API is missing after all', async () => {
    const root = await start({
      storage: { local: new FakeArea() },
      permissions: { request: () => Promise.resolve(true), contains: () => Promise.resolve(false) },
    });
    click(part(root, 'settings'));
    click(part(root, 'bookmarks'));
    await flush();
    expect(part(root, 'toast').textContent).toContain('bookmarks not imported: the bookmarks cannot be read');
  });

  it('opens a tab behind this one through the tabs API', async () => {
    const created: unknown[] = [];
    const root = await start({
      storage: { local: new FakeArea() },
      tabs: {
        create: (properties) => {
          created.push(properties);
          return Promise.resolve();
        },
      },
    });
    expect(root.isConnected).toBe(true);
    press(document, '3');
    press(document, 'f');
    press(document, 'A', { shiftKey: true });
    expect(created).toEqual([{ url: sampleLibrary().groups[2]?.sites[0]?.url, active: false }]);
  });

  it('asks for the favicon permission only in the click that switches to favicons, and keeps the mode on a refusal', async () => {
    const area = new FakeArea();
    const asked: unknown[] = [];
    const answers = [false, true];
    let granted = false;
    const chrome: ExtensionApi = {
      storage: { local: area },
      runtime: { getURL: (path) => `chrome-extension://abc/${path}` },
      permissions: {
        request: (permissions) => {
          asked.push(permissions);
          granted = answers.shift() ?? false;
          return Promise.resolve(granted);
        },
        contains: () => Promise.resolve(granted),
      },
    };
    // the browser has the favicon of github.com only; every other page gets the default globe
    const pixels = (url: string): Promise<Uint8ClampedArray> =>
      Promise.resolve(new Uint8ClampedArray(url.includes('github.com') ? [9, 9, 9, 255] : [1, 2, 3, 255]));
    const root = document.createElement('main');
    document.body.append(root);
    stops.push(
      await startBoard(root, chrome, { pixels, options: { viewport: () => ({ w: 1440, h: 900 }), systemReducedMotion: () => true } }),
    );
    const mode = (name: string): HTMLElement => part(root, 'settings-panel').querySelector(`[data-icon-mode="${name}"]`) as HTMLElement;
    const stored = (): string | undefined =>
      (area.read('library') as ReturnType<typeof sampleLibrary> | undefined)?.groups.find((group) => group.name === 'Development')?.iconMode;

    click(part(root, 'settings'));
    click(mode('phosphor'));
    await flush();
    expect(asked).toEqual([]);
    expect(stored()).toBe('phosphor');

    click(mode('favicon'));
    expect(asked).toEqual([{ permissions: ['favicon'] }]);
    await flush();
    expect(stored()).toBe('phosphor');
    expect(part(root, 'toast').textContent).toContain('favicons not shown: the browser did not allow it');

    click(mode('favicon'));
    await flush();
    expect(asked).toHaveLength(2);
    expect(stored()).toBe('favicon');
    const images = [...part(root, 'grid').querySelectorAll('.tile img')].map((img) => img.getAttribute('src'));
    expect(images).toEqual(['chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fgithub.com&size=32']);
  });

  it("reads the favicons through the page's own images when it is given no reader", async () => {
    const chrome: ExtensionApi = {
      storage: { local: new FakeArea() },
      runtime: { getURL: (path) => `chrome-extension://abc/${path}` },
      permissions: { request: () => Promise.resolve(true), contains: () => Promise.resolve(true) },
    };
    const root = await start(chrome);
    click(part(root, 'settings'));
    click(part(root, 'settings-panel').querySelector('[data-icon-mode="favicon"]') as HTMLElement);
    await flush();
    // this document draws no image, so no favicon can be read and every tile keeps its icon
    expect(part(root, 'grid').querySelector('.tile img')).toBeNull();
    expect(part(root, 'grid').querySelectorAll('.tile').length).toBeGreaterThan(0);
  });

  it('offers no favicons outside the extension', async () => {
    const root = await start({ storage: { local: new FakeArea() }, permissions: { request: () => Promise.resolve(true), contains: () => Promise.resolve(true) } });
    click(part(root, 'settings'));
    click(part(root, 'settings-panel').querySelector('[data-icon-mode="favicon"]') as HTMLElement);
    await flush();
    expect(part(root, 'grid').querySelector('.tile img')).toBeNull();
  });

  it('keeps the searches in the local area', async () => {
    const area = new FakeArea();
    await area.set({ searches: ['weather'] });
    const root = await start({ storage: { local: area } });
    press(document.body, '/');
    expect(part(root, 'suggestions').textContent).toContain('weather');
  });
});

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function click(node: HTMLElement): void {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
