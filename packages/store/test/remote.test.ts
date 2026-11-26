import { CommandError, emptyHistory, emptyLibrary, record } from '@h-board/core';
import type { Library } from '@h-board/core';
import { createApp, openDatabase } from '@h-board/host-server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteError, RemoteStore } from '../src/index';
import type { By, RemoteStoreOptions, State, StoreOptions } from '../src/index';
import { FakeLocalArea } from './chrome-storage';
import { clock, storeContract } from './contract';

const SERVER = 'https://board.example.org';
const ADMIN = { name: 'Ann', password: 'ann-password-1' };

const names = (library: Library): string[] => library.groups.map((group) => group.name);

/** A server on an in-memory database, reached through a fetch that can be cut off as a lost network would be. */
function server(options: StoreOptions = {}) {
  const db = openDatabase(':memory:');
  const lines: string[] = [];
  const app = createApp({
    version: '1.2.3',
    db,
    log: (line) => lines.push(line),
    address: () => '192.0.2.1',
    heartbeat: 60_000,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const code = /setup code: (\S+)/.exec(lines.join('\n'))?.[1] ?? '';
  const s = {
    online: true,
    /** Every request made, by method and path. */
    asked: [] as string[],
    /** The abort signal of every event stream opened. */
    streams: [] as AbortSignal[],
    fetch: (url: string, init: RequestInit = {}): Promise<Response> => {
      s.asked.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
      if (!s.online) return Promise.reject(new TypeError('Failed to fetch'));
      if (new URL(url).pathname === '/api/events' && init.signal) s.streams.push(init.signal);
      return Promise.resolve(app.request(url, init));
    },
    async call(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
      return app.request(`${SERVER}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    },
    /** The admin's session token, made at the first call; the library starts as `options.initial` when given. */
    session: undefined as Promise<string> | undefined,
    admin(): Promise<string> {
      s.session ??= (async () => {
        const made = await s.call('POST', '/api/setup', { code, ...ADMIN });
        const { token } = (await made.json()) as { token: string };
        if (options.initial) {
          const library = options.initial();
          const history = record(emptyHistory(), library, { source: { kind: 'user' }, at: (options.now ?? Date.now)() });
          db.run('insert into libraries (user_id, library, history, changed_at) values (1, ?, ?, 0)', JSON.stringify(library), JSON.stringify(history));
        }
        return token;
      })();
      return s.session;
    },
    keys: new Map<string, Promise<string>>(),
    /** An agent key of the admin's, made at its first use: the owner scope or the edit scope. */
    key(name: string, ownerScope: boolean): Promise<string> {
      const id = `${name}:${ownerScope}`;
      if (!s.keys.has(id)) {
        s.keys.set(
          id,
          (async () => {
            const made = await s.call('POST', '/api/keys', { name, scope: ownerScope ? 'owner' : 'edit' }, await s.admin());
            return ((await made.json()) as { secret: string }).secret;
          })(),
        );
      }
      return s.keys.get(id) as Promise<string>;
    },
    token(by: By): Promise<string> {
      return by.kind === 'user' ? s.admin() : s.key(by.key, by.ownerScope);
    },
    lines,
  };
  return s;
}

type Server = ReturnType<typeof server>;

function storeOf(s: Server, extra: Partial<RemoteStoreOptions> = {}): { store: RemoteStore; cache: FakeLocalArea } {
  const cache = new FakeLocalArea();
  const store = new RemoteStore({ server: SERVER, token: (by) => s.token(by), cache, fetch: s.fetch, ...extra });
  return { store, cache };
}

/** Waits until `check` holds, for a listener that hears of a change through the event stream. */
async function until(check: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(check()).toBe(true);
  });
}

storeContract('RemoteStore', (options) => {
  const s = server(options);
  return storeOf(s).store;
});

describe('RemoteStore', () => {
  let stops: (() => void)[] = [];
  afterEach(() => {
    for (const stop of stops) stop();
    stops = [];
  });

  it('keeps the last library it read in the cache, under a key of its own', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    await store.apply('group.add', { name: 'Work' });
    expect(cache.read('remote')).toMatchObject({ server: SERVER, library: { groups: [{ name: 'Work' }] } });
    expect(cache.read('library')).toBeUndefined();
    expect(cache.read('history')).toBeUndefined();
  });

  it('reads the cached library offline and says it is read-only', async () => {
    const time = clock();
    const s = server({ now: time.now });
    const { store } = storeOf(s, { now: time.now });
    await store.apply('group.add', { name: 'Work' });
    s.online = false;
    const state = await store.load();
    expect(names(state.library)).toEqual(['Work']);
    expect(state.history).toEqual(emptyHistory());
    expect(state.notice).toBe('The server cannot be reached. This is the library as it was at 2026-11-24 09:00 UTC; it can be read, not changed.');
  });

  it('says when it read the library from the server, and that the copy kept offline is older', async () => {
    const time = clock();
    const s = server({ now: time.now });
    const { store } = storeOf(s, { now: time.now });
    expect((await store.load()).synced).toEqual({ at: time.now(), offline: false });
    await store.apply('group.add', { name: 'Work' });
    const kept = time.now();
    time.pass(12 * 60_000);
    expect((await store.load()).synced).toEqual({ at: time.now(), offline: false });
    s.online = false;
    expect((await store.load()).synced).toEqual({ at: time.now(), offline: true });
    time.pass(60_000);
    const later = storeOf(s, { now: time.now });
    await later.cache.set({ remote: { server: SERVER, at: kept, library: emptyLibrary() } });
    expect((await later.store.load()).synced).toEqual({ at: kept, offline: true });
  });

  it('reads the cache another store of this browser kept for the same server', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    await store.apply('group.add', { name: 'Work' });
    s.online = false;
    const later = new RemoteStore({ server: `${SERVER}/`, token: (by) => s.token(by), cache, fetch: s.fetch });
    expect(names((await later.load()).library)).toEqual(['Work']);
  });

  it('does not read the cache of another server', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    await store.load();
    s.online = false;
    const other = new RemoteStore({ server: 'https://other.example.org', token: (by) => s.token(by), cache, fetch: s.fetch });
    await expect(other.load()).rejects.toMatchObject({ code: 'offline', message: 'The server cannot be reached, and no copy of the library is kept on this computer yet.' });
  });

  it('does not read a cached library that cannot be read', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    cache.put('remote', { server: SERVER, at: 0, library: { groups: 'many' } });
    s.online = false;
    await expect(store.load()).rejects.toMatchObject({ code: 'offline' });
  });

  it('refuses every change offline, with a readable error, and changes nothing', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    await store.apply('group.add', { name: 'Work' });
    const kept = cache.read('remote');
    s.online = false;
    const offline = { code: 'offline', message: 'The server cannot be reached, so the library can be read but not changed.' };
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toMatchObject(offline);
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toBeInstanceOf(RemoteError);
    await expect(store.undo()).rejects.toMatchObject(offline);
    await expect(store.redo()).rejects.toMatchObject(offline);
    await expect(store.restore(1)).rejects.toMatchObject(offline);
    expect(cache.read('remote')).toEqual(kept);
    s.online = true;
    expect(names((await store.load()).library)).toEqual(['Work']);
  });

  it('refuses every change signed out, asks nothing of the server, and changes nothing', async () => {
    const s = server();
    await s.admin();
    const cache = new FakeLocalArea();
    const store = new RemoteStore({ server: SERVER, token: () => undefined, cache, fetch: s.fetch });
    const signedOut = { code: 'signed-out', message: 'Sign in to the server to change the library.' };
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toMatchObject(signedOut);
    await expect(store.undo()).rejects.toMatchObject(signedOut);
    await expect(store.redo()).rejects.toMatchObject(signedOut);
    await expect(store.restore(1)).rejects.toMatchObject(signedOut);
    await expect(store.load()).rejects.toMatchObject({ code: 'signed-out', message: 'Sign in to the server to read the library.' });
    expect(s.asked).toEqual([]);
    expect(cache.items.size).toBe(0);
  });

  it('forgets the cache once the server says the session is gone, and refuses the change', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    await store.apply('group.add', { name: 'Work' });
    await s.call('DELETE', '/api/session', undefined, await s.admin());
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toMatchObject({ code: 'signed-out' });
    expect(cache.read('remote')).toBeNull();
    await expect(store.load()).rejects.toMatchObject({ code: 'signed-out' });
    s.online = false;
    await expect(store.load()).rejects.toMatchObject({ code: 'offline' });
  });

  it('never puts the token in an error', async () => {
    const s = server();
    const { store } = storeOf(s);
    const token = await s.admin();
    s.online = false;
    const errors = await Promise.all([store.load(), store.apply('group.add', { name: 'Work' })].map((p) => p.catch((error: unknown) => error)));
    for (const error of errors) expect(JSON.stringify([String(error), (error as Error).stack])).not.toContain(token);
  });

  it('answers a refused command with its CommandError, as the server words it', async () => {
    const s = server();
    const { store } = storeOf(s);
    await expect(store.apply('group.add', { name: '' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringMatching(/^name: /) });
    await expect(store.apply('nothing.here')).rejects.toMatchObject({ code: 'unknown', message: 'id: is not a command' });
    await expect(store.restore(999)).rejects.toMatchObject({ code: 'missing' });
    await expect(store.restore(999)).rejects.toBeInstanceOf(CommandError);
  });

  it('says so when the server fails', async () => {
    const { store } = storeOf(server(), { fetch: () => Promise.resolve(Response.json({ error: 'internal error' }, { status: 500 })) });
    await expect(store.apply('group.add', { name: 'Work' })).rejects.toMatchObject({ code: 'server', message: 'The server could not do it (500).' });
    await expect(store.load()).rejects.toMatchObject({ code: 'server' });
  });

  it('refuses what the server answers when it is not a library', async () => {
    const answer = { library: { ...emptyLibrary(), groups: 'many' }, history: emptyHistory(), value: 1 };
    const { store, cache } = storeOf(server(), { fetch: () => Promise.resolve(Response.json(answer)) });
    await expect(store.load()).rejects.toMatchObject({ code: 'server', message: expect.stringMatching(/^The server answered a library that could not be read \(groups/) });
    await expect(store.apply('group.add', { name: 'Work' })).rejects.toMatchObject({ code: 'server' });
    await expect(store.undo()).rejects.toMatchObject({ code: 'server' });
    const notJson = storeOf(server(), { fetch: () => Promise.resolve(new Response('<html>', { status: 200 })) }).store;
    await expect(notJson.load()).rejects.toMatchObject({ code: 'server' });
    expect(cache.items.size).toBe(0);
  });

  it('hears a change made elsewhere through the event stream', async () => {
    const s = server();
    const { store } = storeOf(s);
    await store.load();
    const seen: State[] = [];
    stops.push(store.subscribe((state) => seen.push(state)));
    stops.push(store.subscribe(() => undefined));
    await until(() => s.streams.length === 1);
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Agent' } }, await s.key('helper', false));
    await until(() => seen.length === 1);
    expect(names(seen[0]?.library ?? emptyLibrary())).toEqual(['Agent']);
    expect(seen[0]?.history.snapshots[0]?.source).toEqual({ kind: 'agent', key: 'helper' });
  });

  it('tells a change of its own once, though the event stream hears of it too', async () => {
    const s = server();
    const { store } = storeOf(s);
    const seen: State[] = [];
    stops.push(store.subscribe((state) => seen.push(state)));
    await until(() => s.streams.length === 1);
    await store.apply('group.add', { name: 'Work' });
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Home' } }, await s.admin());
    await until(() => seen.length === 2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.map((state) => names(state.library))).toEqual([['Work'], ['Work', 'Home']]);
  });

  it('closes the event stream when the last listener stops', async () => {
    const s = server();
    const { store } = storeOf(s);
    const first = store.subscribe(() => undefined);
    const second = store.subscribe(() => undefined);
    await until(() => s.streams.length === 1);
    first();
    expect(s.streams[0]?.aborted).toBe(false);
    second();
    second();
    expect(s.streams[0]?.aborted).toBe(true);
  });

  it('says once that the network is lost, connects again, and hears what it missed', async () => {
    const time = clock();
    const s = server({ now: time.now });
    const { store } = storeOf(s, { retry: 10, now: time.now });
    const read = time.now();
    await store.load();
    s.online = false;
    time.pass(60_000);
    const seen: State[] = [];
    stops.push(store.subscribe((state) => seen.push(state)));
    await until(() => s.asked.filter((asked) => asked === 'GET /api/events').length >= 3);
    expect(seen.map((state) => state.synced)).toEqual([{ at: read, offline: true }]);
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toMatchObject({ code: 'offline' });
    expect(seen).toHaveLength(1);
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, await s.admin());
    s.online = true;
    await until(() => seen.length === 2);
    expect(names(seen[1]?.library ?? emptyLibrary())).toEqual(['Work']);
    expect(seen[1]?.synced).toEqual({ at: time.now(), offline: false });
  });

  it('tells the listeners when the server is back, though the library did not change', async () => {
    const s = server();
    let down = false;
    const fetch = (url: string, init: RequestInit = {}): Promise<Response> =>
      down ? Promise.resolve(new Response('Bad Gateway', { status: 502 })) : s.fetch(url, init);
    const { store } = storeOf(s, { fetch, retry: 10 });
    await store.load();
    down = true;
    const seen: State[] = [];
    stops.push(store.subscribe((state) => seen.push(state)));
    await until(() => seen.length === 1);
    await expect(store.undo()).rejects.toMatchObject({ code: 'offline' });
    down = false;
    await until(() => seen.length === 2);
    expect(seen.map((state) => state.synced?.offline)).toEqual([true, false]);
    expect(seen[1]?.library).toEqual(seen[0]?.library);
  });

  it('tells the listeners when the server is back, though the page opened offline', async () => {
    const s = server();
    const { store } = storeOf(s, { retry: 10 });
    await store.apply('group.add', { name: 'Work' });
    s.online = false;
    expect((await store.load()).synced?.offline).toBe(true);
    const seen: State[] = [];
    stops.push(store.subscribe((state) => seen.push(state)));
    await until(() => s.asked.filter((asked) => asked === 'GET /api/events').length >= 2);
    expect(seen).toEqual([]);
    s.online = true;
    await until(() => seen.length === 1);
    expect(seen[0]?.synced?.offline).toBe(false);
    expect(names(seen[0]?.library ?? emptyLibrary())).toEqual(['Work']);
  });

  it('says nothing of a lost network before it knows a library', async () => {
    const s = server();
    s.online = false;
    const { store } = storeOf(s, { retry: 10 });
    const seen: State[] = [];
    stops.push(store.subscribe((state) => seen.push(state)));
    await until(() => s.asked.length >= 2);
    expect(seen).toEqual([]);
  });

  it('stops listening once the server ends the stream for a revoked session', async () => {
    const s = server();
    const { store, cache } = storeOf(s, { retry: 10 });
    await store.load();
    stops.push(store.subscribe(() => undefined));
    await until(() => s.streams.length === 1);
    await s.call('DELETE', '/api/session', undefined, await s.admin());
    await until(() => cache.read('remote') === null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.asked.filter((asked) => asked === 'GET /api/events')).toHaveLength(1);
  });

  it('connects again after a refused stream, a dropped one or an event too long to hold', async () => {
    const s = server();
    const answers = [
      () => Response.json({ error: 'too many event streams' }, { status: 429 }),
      () => new Response('x'.repeat(70_000), { headers: { 'content-type': 'text/event-stream' } }),
      () =>
        new Response(
          new ReadableStream({
            start: (controller) => {
              controller.error(new Error('connection reset'));
            },
          }),
        ),
    ];
    const fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
      const answer = new URL(url).pathname === '/api/events' ? answers.shift() : undefined;
      if (answer) s.asked.push('refused');
      return answer ? Promise.resolve(answer()) : s.fetch(url, init);
    };
    const { store } = storeOf(s, { fetch, retry: 10 });
    stops.push(store.subscribe(() => undefined));
    await until(() => s.streams.length === 1);
    expect(s.asked.filter((asked) => asked === 'refused')).toHaveLength(3);
  });

  it('reads the cache when a proxy says the server is down', async () => {
    const s = server();
    let down = false;
    const fetch = (url: string, init: RequestInit = {}): Promise<Response> =>
      down ? Promise.resolve(new Response('Bad Gateway', { status: 502 })) : s.fetch(url, init);
    const { store } = storeOf(s, { fetch });
    await store.apply('group.add', { name: 'Work' });
    down = true;
    expect(names((await store.load()).library)).toEqual(['Work']);
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toMatchObject({ code: 'offline' });
  });

  it('keeps a change the server made when the cache cannot take it', async () => {
    const s = server();
    const { store, cache } = storeOf(s);
    cache.failNext = new Error('QUOTA_BYTES quota exceeded');
    await store.apply('group.add', { name: 'Work' });
    expect(cache.read('remote')).toBeUndefined();
    expect(names((await store.load()).library)).toEqual(['Work']);
  });

  it('forgets the cache and stops when the server refuses the stream for a revoked session', async () => {
    const s = server();
    const { store, cache } = storeOf(s, { retry: 10 });
    await store.load();
    await s.call('DELETE', '/api/session', undefined, await s.admin());
    stops.push(store.subscribe(() => undefined));
    await until(() => cache.read('remote') === null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.asked.filter((asked) => asked === 'GET /api/events')).toHaveLength(1);
  });

  it('opens no event stream signed out', async () => {
    const s = server();
    const store = new RemoteStore({ server: SERVER, token: () => undefined, cache: new FakeLocalArea(), fetch: s.fetch, retry: 10 });
    stops.push(store.subscribe(() => undefined));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.asked).toEqual([]);
  });

  it('logs no token on the server it talks to', async () => {
    const s = server();
    const { store } = storeOf(s);
    await store.apply('group.add', { name: 'Work' });
    const token = await s.admin();
    expect(s.lines.join('\n')).not.toContain(token);
  });
});
