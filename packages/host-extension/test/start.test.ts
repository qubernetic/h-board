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
    const root = await start({ storage: { local: new FakeArea() }, permissions: { request: () => Promise.resolve(true) } });
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
