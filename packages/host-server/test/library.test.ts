import { emptyLibrary } from '@h-board/core';
import type { History, Library } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { storeContract } from '../../store/test/contract';
import { SqliteStore, migrate, openDatabase } from '../src/index';
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

storeContract('SqliteStore', (options) => new SqliteStore(withUser(), 1, options));

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
});

async function library(s: Server, token: string): Promise<Shown> {
  return shown(await s.call('GET', '/api/library', undefined, token));
}
