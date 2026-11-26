// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { MemoryStore, RemoteError } from '@h-board/store';
import type { By, State, Store } from '@h-board/store';
import { afterEach, describe, expect, it } from 'vitest';
import { mountBoard } from '../src/index';
import type { BoardOptions, ServerAccess } from '../src/index';
import { click, flush, mount, names, part, press } from './mount';

const AGENT: By = { kind: 'agent', key: 'claude-desktop', ownerScope: false };
const NOW = new Date(2026, 10, 23, 14, 32, 7);

const development = (library: Library): string => library.groups[1]?.id ?? '';
const toast = (): string => document.querySelector('[data-part="toast"]')?.textContent ?? '';

/** An agent adds a site to Development through the store, as the server does for a key. */
async function agentAdds(store: Store, library: Library, name = 'forgejo'): Promise<void> {
  await store.apply('site.add', { group: development(library), name, url: `https://${name}.example.com` }, { by: AGENT });
  await flush();
}

/** A board on `store`, which tests change from outside, with the clock at `NOW`. */
async function mountOn(store: Store, options: BoardOptions = {}): Promise<HTMLElement> {
  const main = document.createElement('main');
  document.body.append(main);
  const stop = await mountBoard(main, store, { now: () => NOW, viewport: () => ({ w: 1440, h: 900 }), systemReducedMotion: () => true, ...options });
  stops.push(stop);
  return main;
}
const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

describe('a change an agent makes', () => {
  it('shows at once, marked in the status bar with the key, until z takes it back', async () => {
    const library = sampleLibrary();
    const { main, store } = await mount(library);
    press('2');
    const mark = part(main, 'agent-change');
    expect(mark.hidden).toBe(true);
    await agentAdds(store, library);
    expect(names(main)).toContain('forgejo');
    expect(mark.hidden).toBe(false);
    expect(mark.textContent).toBe('claude-desktop: +forgejo in Development · z: undo');
    press('z');
    await flush();
    expect(names(main)).not.toContain('forgejo');
    expect(mark.hidden).toBe(true);
    expect(toast()).toContain('undone: -forgejo in Development');
  });

  it('stays marked until the next change of the user', async () => {
    const library = sampleLibrary();
    const { main, store } = await mount(library);
    await agentAdds(store, library);
    const mark = part(main, 'agent-change');
    expect(mark.hidden).toBe(false);
    await store.apply('group.add', { name: 'Later' });
    await flush();
    expect(mark.hidden).toBe(true);
  });

  it('is named by its key in the restore panel', async () => {
    const library = sampleLibrary();
    const { main, store } = await mount(library);
    await agentAdds(store, library);
    press('v');
    const [newest, start] = [...part(main, 'restore-list').querySelectorAll('button .l')].map((node) => node.textContent);
    expect(newest).toBe('claude-desktop: +forgejo in Development');
    expect(start).toBe('starting point');
  });
});

/** `store` with `synced` on every state, as a store on the user's server answers. */
function onServer(store: Store, synced: { at: number; offline: boolean }): Store {
  const tell = (state: State): State => ({ ...state, synced });
  return {
    load: async () => tell(await store.load()),
    apply: (id, params, options) => store.apply(id, params, options),
    undo: (options) => store.undo(options),
    redo: (options) => store.redo(options),
    restore: (id, options) => store.restore(id, options),
    subscribe: (listener) => store.subscribe((state) => listener(tell(state))),
  };
}

/** A store on a server that cannot be reached: it reads its kept copy and refuses every change. */
function offline(at: number): Store {
  const kept = new MemoryStore({ initial: sampleLibrary });
  const refuse = (): Promise<never> => Promise.reject(new RemoteError('offline', 'The server cannot be reached, so the library can be read but not changed.'));
  return { ...onServer(kept, { at, offline: true }), apply: refuse, undo: refuse, redo: refuse, restore: refuse };
}

describe('the sync line in the header', () => {
  it('is not there on a library kept in this browser', async () => {
    const { main } = await mount();
    expect(part(main, 'sync').hidden).toBe(true);
  });

  it('says when the library was last read from the server', async () => {
    const main = await mountOn(onServer(new MemoryStore({ initial: sampleLibrary }), { at: NOW.getTime() - 2 * 60_000, offline: false }));
    const sync = part(main, 'sync');
    expect(sync.hidden).toBe(false);
    expect(sync.textContent).toBe('synced · 2 min ago');
    expect(sync.classList.contains('offline')).toBe(false);
  });

  it('says the server is offline, and since when', async () => {
    const main = await mountOn(offline(NOW.getTime() - 12 * 60_000));
    const sync = part(main, 'sync');
    expect(sync.textContent).toBe('offline · last synced 12 min ago');
    expect(sync.classList.contains('offline')).toBe(true);
  });
});

/** A signed-in user's way to the server; it notes which lists the section reads. */
function signedIn(read: string[]): ServerAccess {
  const none = (): Promise<never> => Promise.reject(new Error('not in this test'));
  return {
    state: () => ({ stage: 'signed-in', address: 'https://hboard.example.com', user: { name: 'anna', admin: true } }),
    connect: none,
    setup: none,
    signIn: none,
    changePassword: none,
    send: none,
    skip: none,
    signOut: none,
    local: none,
    users: () => (read.push('users'), Promise.resolve([])),
    addUser: none,
    resetPassword: none,
    removeUser: none,
    keys: () => (read.push('keys'), Promise.resolve([])),
    makeKey: none,
    revokeKey: none,
    keyLog: none,
  };
}

describe('the Server section offline', () => {
  it('says the library is read only, offers to try again, and reads no list', async () => {
    const read: string[] = [];
    const kept = new Date(2026, 10, 23, 14, 20).getTime();
    const main = await mountOn(offline(kept), { server: signedIn(read), openSettings: true });
    const section = part(main, 'server');
    expect(part(section, 'server-status').textContent).toBe('offline · hboard.example.com');
    expect(part(section, 'server-status').classList.contains('offline')).toBe(true);
    const box = part(section, 'server-read-only');
    expect(box.dataset['tag']).toBe('read only');
    expect(box.textContent).toBe('The server cannot be reached. You see the copy saved at 14:20. Editing, users and keys need the server.');
    expect([...section.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Try again', 'Change password', 'New key…', 'Sign out']);
    expect(part(section, 'server-retry').classList.contains('primary')).toBe(true);
    await flush();
    expect(read).toEqual([]);
  });

  it('reads the library again with Try again, and shows the lists once the server answers', async () => {
    const read: string[] = [];
    const memory = new MemoryStore({ initial: sampleLibrary });
    let down = true;
    let loads = 0;
    const store: Store = {
      ...onServer(memory, { at: NOW.getTime(), offline: true }),
      load: async () => {
        loads += 1;
        return { ...(await memory.load()), synced: { at: NOW.getTime(), offline: down } };
      },
    };
    const main = await mountOn(store, { server: signedIn(read), openSettings: true });
    const section = part(main, 'server');
    part(section, 'server-retry').click();
    await flush();
    expect(loads).toBe(2);
    expect(part(main, 'sync').textContent).toBe('offline · last synced just now');
    expect(section.querySelector('[data-part="server-read-only"]')).not.toBeNull();
    down = false;
    part(section, 'server-retry').click();
    await flush();
    expect(part(main, 'sync').textContent).toBe('synced · just now');
    expect(section.querySelector('[data-part="server-read-only"]')).toBeNull();
    expect(part(section, 'server-status').textContent).toBe('anna · admin · hboard.example.com');
    expect(read).toEqual(['users', 'keys']);
  });
});

describe('offline', () => {
  it('refuses an edit, an undo and a restore with the notice, and the library stays as it is', async () => {
    const main = await mountOn(offline(NOW.getTime()));
    const before = names(main);
    press('e');
    click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
    await flush();
    expect(toast()).toBe('not saved: The server cannot be reached, so the library can be read but not changed.');
    press('Escape');
    press('z');
    await flush();
    expect(toast()).toBe('not undone: The server cannot be reached, so the library can be read but not changed.');
    expect(names(main)).toEqual(before);
  });
});
