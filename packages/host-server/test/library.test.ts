import { MAX_FILE, emptyLibrary, sampleLibrary, writeLibraryFile } from '@h-board/core';
import type { History, Library } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { storeContract } from '../../store/test/contract';
import { SqliteStore, UserRemoved, migrate, openDatabase } from '../src/index';
import type { Database } from '../src/index';
import { server, setUp, userOf } from './support';
import type { Server } from './support';

/** A migrated database in memory with one user, `id` 1. */
function withUser(): Database {
  const db = openDatabase(':memory:');
  migrate(db);
  db.run("insert into users (id, name, password_hash, created_at) values (1, 'Ann', 'x', 0)");
  return db;
}

const ANN = { id: 1, createdAt: 0 };

storeContract('SqliteStore', (options) => new SqliteStore(withUser(), ANN, options));

describe('SqliteStore', () => {
  it('falls back to the newest snapshot when the kept library cannot be read, and says so once', async () => {
    const db = withUser();
    const store = new SqliteStore(db, ANN);
    await store.apply('group.add', { name: 'Work' });
    db.run("update libraries set library = 'not json'");
    const state = await new SqliteStore(db, ANN).load();
    expect(names(state.library)).toEqual(['Work']);
    expect(state.notice).toBe(
      'The library on the server could not be read (library: is missing or not an object). It was restored from the newest snapshot.',
    );
    expect((await new SqliteStore(db, ANN).load()).notice).toBeUndefined();
  });

  it('starts again when neither the library nor a snapshot can be read', async () => {
    const db = withUser();
    await new SqliteStore(db, ANN).apply('group.add', { name: 'Work' });
    db.run("update libraries set library = '{}', history = 'not json'");
    const state = await new SqliteStore(db, ANN).load();
    expect(state.library).toEqual(emptyLibrary());
    expect(state.notice).toMatch(/^The library on the server could not be read \(.+\)\. It started again; no snapshot could be read either\.$/);
  });

  it('reads and writes nothing once its user is removed and the id is given to a new user', async () => {
    const db = withUser();
    const ann = new SqliteStore(db, ANN);
    await ann.apply('group.add', { name: 'Ann only' });
    db.run('delete from users where id = 1');
    db.run("insert into users (id, name, password_hash, created_at) values (1, 'Bob', 'x', 5)");
    const bob = new SqliteStore(db, { id: 1, createdAt: 5 });
    await bob.apply('group.add', { name: 'Bob only' });
    await expect(ann.load()).rejects.toThrow(UserRemoved);
    await expect(ann.apply('group.add', { name: 'Ann late' })).rejects.toThrow(UserRemoved);
    await expect(ann.undo()).rejects.toThrow(UserRemoved);
    expect(names((await bob.load()).library)).toEqual(['Bob only']);
  });

  it('writes nothing when its user is removed between the read and the write', async () => {
    const db = withUser();
    const store = new SqliteStore(db, ANN, {
      now: () => {
        db.run('delete from users where id = 1');
        return 0;
      },
    });
    await expect(store.apply('group.add', { name: 'Ann late' })).rejects.toThrow(UserRemoved);
    expect(db.get('select count(*) as n from libraries')).toEqual({ n: 0 });
  });
});

interface Shown {
  readonly library: Library;
  readonly history: History;
}

const names = (library: Library): string[] => library.groups.map((group) => group.name);

async function shown(response: Response): Promise<Shown> {
  expect(response.status).toBe(200);
  return (await response.json()) as Shown;
}

describe('GET /api/library', () => {
  it('gives a new user the empty library and its starting point', async () => {
    const s = server();
    const { library, history } = await shown(await s.call('GET', '/api/library', undefined, await setUp(s)));
    expect(library).toEqual(emptyLibrary());
    expect(history.snapshots.map((snapshot) => [snapshot.cause, snapshot.at])).toEqual([['start', s.time]]);
  });
});

/** Runs the command `id` for the caller of `token`. */
function run(s: Server, token: string, id: string, body: unknown = {}): Promise<Response> {
  return s.call('POST', `/api/commands/${id}`, body, token);
}

describe('POST /api/commands/:id', () => {
  it('runs a command by id, keeps its library and answers its value', async () => {
    const s = server();
    const token = await setUp(s);
    const response = await run(s, token, 'group.add', { params: { name: 'Work' } });
    expect(response.status).toBe(200);
    const { value, library } = (await response.json()) as { value: string; library: Library };
    expect(names(library)).toEqual(['Work']);
    expect(library.groups[0]?.id).toBe(value);
    const kept = await shown(await s.call('GET', '/api/library', undefined, token));
    expect(names(kept.library)).toEqual(['Work']);
    expect(kept.history.snapshots.map((snapshot) => [snapshot.cause, snapshot.source])).toEqual([
      ['change', { kind: 'user' }],
      ['start', { kind: 'user' }],
    ]);
  });

  it('runs a command without parameters', async () => {
    const s = server();
    const response = await run(s, await setUp(s), 'library.export');
    expect(response.status).toBe(200);
    expect(((await response.json()) as { value: string }).value).toContain('"app": "h-board"');
  });

  it('keeps one snapshot for a burst, and a change of its own when asked to', async () => {
    const s = server();
    const token = await setUp(s);
    await run(s, token, 'group.add', { params: { name: 'Work' } });
    await run(s, token, 'group.add', { params: { name: 'Home' } });
    expect((await shown(await s.call('GET', '/api/library', undefined, token))).history.snapshots).toHaveLength(2);
    await run(s, token, 'group.add', { params: { name: 'News' }, alone: true });
    expect((await shown(await s.call('GET', '/api/library', undefined, token))).history.snapshots).toHaveLength(3);
  });

  it.each([
    ['an unknown command', 'group.explode', { params: {} }, 'id: is not a command'],
    ['a bad parameter', 'group.add', { params: { name: '' } }, 'name: must not be empty'],
    ['a missing parameter', 'group.add', {}, 'name: must be text'],
    ['a bad alone', 'group.add', { params: { name: 'Work' }, alone: 'yes' }, 'alone: must be true or false'],
  ])('answers 400 with the field named for %s, and changes nothing', async (_, id, body, error) => {
    const s = server();
    const token = await setUp(s);
    const response = await run(s, token, id, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect((await shown(await s.call('GET', '/api/library', undefined, token))).library).toEqual(emptyLibrary());
  });

  it('answers 404 with the field named for a group or site that is not there', async () => {
    const s = server();
    const response = await run(s, await setUp(s), 'site.remove', { params: { site: 'nope' } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'site: no site nope' });
  });

  it('answers 500 when the library cannot be kept, and logs no parameter', async () => {
    const s = server();
    const token = await setUp(s);
    s.db.exec('drop table libraries');
    const response = await run(s, token, 'group.add', { params: { name: 'Secret plans' } });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
    expect(s.lines.at(-1)).toBe('request failed: POST /api/commands/group.add: SqliteError');
  });

  it('reads only a JSON object', async () => {
    const s = server();
    const token = await setUp(s);
    expect((await run(s, token, 'group.add', '[1]')).status).toBe(400);
    const plain = await s.send('/api/commands/group.add', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: '{"params":{"name":"Work"}}',
    });
    expect(plain.status).toBe(415);
  });
});

describe('the request', () => {
  it('lets a command carry a library file far over 16 KB', async () => {
    const s = server();
    const token = await setUp(s);
    const text = writeLibraryFile(sampleLibrary());
    expect(text.length).toBeGreaterThan(16_384);
    const response = await run(s, token, 'library.import', { params: { text } });
    expect(response.status).toBe(200);
    expect((await library(s, token)).library).toEqual(sampleLibrary());
  });

  it('refuses a command body over the largest library file core reads, escaped as JSON', async () => {
    const s = server();
    const token = await setUp(s);
    const limit = 2 * MAX_FILE + 16_384;
    const response = await run(s, token, 'library.import', { params: { text: 'x'.repeat(limit) } });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: `body: must be at most ${limit} bytes` });
  });

  it('refuses a caller who is not signed in before reading any of a command body', async () => {
    const s = server();
    await setUp(s);
    const { body, pulls } = endless();
    const response = await s.send('/api/commands/library.import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(response.status).toBe(401);
    // The stream fills its queue once by itself; a read would ask for more.
    expect(pulls()).toBe(1);
  });

  it('refuses a signed-in command body sent in chunks once it passes the limit', async () => {
    const s = server();
    const token = await setUp(s);
    const { body } = endless();
    const response = await s.send('/api/commands/library.import', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: `body: must be at most ${2 * MAX_FILE + 16_384} bytes` });
  });

  it('keeps 16 KB for every other route', async () => {
    const s = server();
    const token = await setUp(s);
    const response = await s.call('POST', '/api/undo', { padding: 'x'.repeat(20_000) }, token);
    expect(response.status).toBe(413);
  });

  it('sends no CORS headers, also to a preflight', async () => {
    const s = server();
    const token = await setUp(s);
    const origin = { origin: 'https://example.com' };
    const get = await s.send('/api/library', { headers: { ...origin, authorization: `Bearer ${token}` } });
    const preflight = await s.send('/api/commands/group.add', {
      method: 'OPTIONS',
      headers: { ...origin, 'access-control-request-method': 'POST' },
    });
    for (const response of [get, preflight]) {
      expect([...response.headers.keys()].filter((name) => name.startsWith('access-control-'))).toEqual([]);
    }
    expect(preflight.status).toBe(404);
  });
});

describe('undo, redo and restore', () => {
  it('takes the last change back and brings it again', async () => {
    const s = server();
    const token = await setUp(s);
    await run(s, token, 'group.add', { params: { name: 'Work' } });
    const undone = await shown(await s.call('POST', '/api/undo', undefined, token));
    expect(names(undone.library)).toEqual([]);
    expect(undone.history.snapshots[0]?.cause).toBe('undo');
    expect(names((await library(s, token)).library)).toEqual([]);
    expect(names((await shown(await s.call('POST', '/api/redo', undefined, token))).library)).toEqual(['Work']);
  });

  it('answers 204 when there is nothing to take back or bring again', async () => {
    const s = server();
    const token = await setUp(s);
    expect((await s.call('POST', '/api/undo', undefined, token)).status).toBe(204);
    expect((await s.call('POST', '/api/redo', undefined, token)).status).toBe(204);
  });

  it('restores a snapshot in a way undo takes back', async () => {
    const s = server();
    const token = await setUp(s);
    const start = (await library(s, token)).history.snapshots[0]?.id;
    await run(s, token, 'group.add', { params: { name: 'Work' } });
    const restored = await shown(await s.call('POST', `/api/restore/${start}`, undefined, token));
    expect(restored.library).toEqual(emptyLibrary());
    expect(restored.history.snapshots[0]?.cause).toBe('restore');
    expect(names((await shown(await s.call('POST', '/api/undo', undefined, token))).library)).toEqual(['Work']);
  });

  it('answers 204 for a restore of the library as it is', async () => {
    const s = server();
    const token = await setUp(s);
    await run(s, token, 'group.add', { params: { name: 'Work' } });
    const newest = (await library(s, token)).history.snapshots[0]?.id;
    expect((await s.call('POST', `/api/restore/${newest}`, undefined, token)).status).toBe(204);
  });

  it.each([
    ['99', 'snapshot: no snapshot 99'],
    ['0', 'id: no such snapshot'],
    ['1e3', 'id: no such snapshot'],
    ['9999999999999999', 'id: no such snapshot'],
  ])('answers 404 for the snapshot %s', async (id, error) => {
    const s = server();
    const token = await setUp(s);
    const response = await s.call('POST', `/api/restore/${id}`, undefined, token);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error });
  });
});

describe('one user and another', () => {
  it("never reads or changes another user's library", async () => {
    const s = server();
    const ann = await setUp(s);
    const bob = (await userOf(s, ann, 'Bob')).token;
    await run(s, ann, 'group.add', { params: { name: 'Ann only' } });
    await run(s, ann, 'group.add', { params: { name: 'Later' }, alone: true });
    await run(s, ann, 'group.add', { params: { name: 'Last' }, alone: true });
    expect((await library(s, bob)).library).toEqual(emptyLibrary());

    await run(s, bob, 'group.add', { params: { name: 'Bob only' } });
    const annGroup = (await library(s, ann)).library.groups[1]?.id ?? '';
    expect((await run(s, bob, 'group.remove', { params: { group: annGroup } })).status).toBe(404);
    expect((await s.call('POST', '/api/undo', undefined, bob)).status).toBe(200);
    expect((await s.call('POST', '/api/undo', undefined, bob)).status).toBe(204);
    const annNewest = (await library(s, ann)).history.snapshots[0]?.id;
    expect((await s.call('POST', `/api/restore/${annNewest}`, undefined, bob)).status).toBe(404);

    expect(names((await library(s, ann)).library)).toEqual(['Ann only', 'Later', 'Last']);
    expect((await library(s, ann)).history.snapshots).toHaveLength(4);
    expect((await library(s, bob)).library).toEqual(emptyLibrary());
  });

  it("removes a removed user's library, and a new user starts from the empty one", async () => {
    const s = server();
    const ann = await setUp(s);
    const bob = await userOf(s, ann, 'Bob');
    await run(s, bob.token, 'group.add', { params: { name: 'Bob only' } });
    expect((await s.call('DELETE', `/api/users/${bob.id}`, undefined, ann)).status).toBe(204);
    expect(s.db.get('select count(*) as n from libraries where user_id = ?', bob.id)).toEqual({ n: 0 });
    const cid = await userOf(s, ann, 'Cid');
    expect(cid.id).toBe(bob.id);
    expect((await library(s, cid.token)).library).toEqual(emptyLibrary());
  });

  it("refuses a command whose user was removed, and the id given to a new user, while its body came in", async () => {
    const s = server();
    const ann = await setUp(s);
    const bob = await userOf(s, ann, 'Bob');
    const text = JSON.stringify({ params: { name: 'Bob late' } });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await held;
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    const pending = s.send('/api/commands/group.add', {
      method: 'POST',
      headers: { authorization: `Bearer ${bob.token}`, 'content-type': 'application/json', 'content-length': String(text.length) },
      body,
      duplex: 'half',
    } as RequestInit);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await s.call('DELETE', `/api/users/${bob.id}`, undefined, ann)).status).toBe(204);
    const cid = await userOf(s, ann, 'Cid');
    expect(cid.id).toBe(bob.id);
    await run(s, cid.token, 'group.add', { params: { name: 'Cid only' } });
    release();
    const response = await pending;
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('Cid only');
    expect(names((await library(s, cid.token)).library)).toEqual(['Cid only']);
  });
});

/** A body sent in chunks of 1 MB that never ends, and how often it was asked for more. */
function endless(): { body: ReadableStream<Uint8Array>; pulls: () => number } {
  let count = 0;
  const chunk = new TextEncoder().encode('x'.repeat(1_000_000));
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      count += 1;
      controller.enqueue(chunk);
    },
  });
  return { body, pulls: () => count };
}

async function library(s: Server, token: string): Promise<Shown> {
  return shown(await s.call('GET', '/api/library', undefined, token));
}
