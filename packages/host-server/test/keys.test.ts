import { CommandError, createCommands } from '@h-board/core';
import type { CommandRegistry } from '@h-board/core';
import type { History, Library } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { createApp, openDatabase } from '../src/index';
import { ignore, server, setUp, signIn, tokenOf, userOf } from './support';
import type { Server } from './support';

type Scope = 'read' | 'edit' | 'owner';

interface Key {
  readonly id: number;
  readonly name: string;
  readonly scope: Scope;
  readonly createdAt: number;
  readonly usedAt: number | null;
}

interface Entry {
  readonly at: number;
  readonly key: string;
  readonly scope: Scope;
  readonly command: string | null;
  readonly outcome: string;
}

interface Shown {
  readonly library: Library;
  readonly history: History;
}

const KEY = /^hbk_[\w-]{43}$/;

/** Makes a key for the caller of `token`: the key as listed and its secret, shown this once. */
async function make(s: Server, token: string, name: string, scope: Scope): Promise<{ key: Key; secret: string }> {
  const response = await s.call('POST', '/api/keys', { name, scope }, token);
  expect(response.status).toBe(201);
  return (await response.json()) as { key: Key; secret: string };
}

async function keys(s: Server, token: string): Promise<Key[]> {
  const response = await s.call('GET', '/api/keys', undefined, token);
  expect(response.status).toBe(200);
  return ((await response.json()) as { keys: Key[] }).keys;
}

async function log(s: Server, token: string): Promise<Entry[]> {
  const response = await s.call('GET', '/api/keys/log', undefined, token);
  expect(response.status).toBe(200);
  return ((await response.json()) as { entries: Entry[] }).entries;
}

async function library(s: Server, token: string): Promise<Shown> {
  const response = await s.call('GET', '/api/library', undefined, token);
  expect(response.status).toBe(200);
  return (await response.json()) as Shown;
}

const names = (shown: Shown): string[] => shown.library.groups.map((group) => group.name);

/** A server with the admin, Ann, signed in: the server and her session token. */
async function withAnn(extra: Parameters<typeof server>[2] = {}): Promise<{ s: Server; ann: string }> {
  const s = server(undefined, undefined, extra);
  return { s, ann: await setUp(s) };
}

describe('the key routes', () => {
  it('makes a key, shows it once and lists it without the secret', async () => {
    const { s, ann } = await withAnn();
    s.time = 2_000_000;
    const { key, secret } = await make(s, ann, ' claude-desktop ', 'edit');
    expect(secret).toMatch(KEY);
    expect(key).toEqual({ id: key.id, name: 'claude-desktop', scope: 'edit', createdAt: 2_000_000, usedAt: null });
    expect(await keys(s, ann)).toEqual([key]);
    expect(s.bodies.filter((body) => body.includes(secret))).toHaveLength(1);
    expect(JSON.stringify(s.db.all('select * from agent_keys'))).not.toContain(secret);
    expect(s.lines.join('\n')).not.toContain(secret);
  });

  it('notes the last use of a key', async () => {
    const { s, ann } = await withAnn();
    const { secret } = await make(s, ann, 'reader', 'read');
    s.time = 3_000_000;
    await library(s, secret);
    expect((await keys(s, ann))[0]?.usedAt).toBe(3_000_000);
  });

  it('checks the name and the scope field by field', async () => {
    const { s, ann } = await withAnn();
    const response = await s.call('POST', '/api/keys', { name: '', scope: 'admin' }, ann);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name: must not be empty\nscope: must be read, edit or owner' });
    const missing = await s.call('POST', '/api/keys', {}, ann);
    expect(await missing.json()).toEqual({ error: 'name: must be text\nscope: must be read, edit or owner' });
    const form = await s.call('POST', '/api/keys', 'name=helper&scope=owner', ann);
    expect(form.status).toBe(400);
  });

  it('refuses a name the user already has, in any case', async () => {
    const { s, ann } = await withAnn();
    await make(s, ann, 'helper', 'read');
    const response = await s.call('POST', '/api/keys', { name: 'Helper', scope: 'edit' }, ann);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'name: is taken' });
  });

  it('keeps at most 100 keys for each user', async () => {
    const { s, ann } = await withAnn();
    for (let n = 0; n < 100; n += 1) await make(s, ann, `key-${n}`, 'read');
    const response = await s.call('POST', '/api/keys', { name: 'one more', scope: 'read' }, ann);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'name: at most 100 keys; revoke one first' });
  });

  it('refuses a revoked key at once', async () => {
    const { s, ann } = await withAnn();
    const { key, secret } = await make(s, ann, 'helper', 'edit');
    expect((await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, secret)).status).toBe(200);
    expect((await s.call('DELETE', `/api/keys/${key.id}`, undefined, ann)).status).toBe(204);
    const response = await s.call('POST', '/api/commands/group.add', { params: { name: 'Late' } }, secret);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'sign in first' });
    expect((await s.call('GET', '/api/library', undefined, secret)).status).toBe(401);
    expect(await keys(s, ann)).toEqual([]);
    expect(names(await library(s, ann))).toEqual(['Work']);
  });

  it('refuses a key revoked while its command came in', async () => {
    const { s, ann } = await withAnn();
    const { key, secret } = await make(s, ann, 'helper', 'edit');
    const text = JSON.stringify({ params: { name: 'Late' } });
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
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', 'content-length': String(text.length) },
      body,
      duplex: 'half',
    } as RequestInit);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await s.call('DELETE', `/api/keys/${key.id}`, undefined, ann)).status).toBe(204);
    release();
    const response = await pending;
    expect(response.status).toBe(401);
    expect(names(await library(s, ann))).toEqual([]);
  });

  it('says so when the key to revoke is not there', async () => {
    const { s, ann } = await withAnn();
    for (const id of ['7', 'x', '0']) {
      const response = await s.call('DELETE', `/api/keys/${id}`, undefined, ann);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'id: no such key' });
    }
  });

});

/** The routes a key may reach: the library routes, and those anyone may call without a token. */
const FOR_A_KEY = [
  'GET /api/library',
  'POST /api/commands/:id',
  'POST /api/undo',
  'POST /api/redo',
  'POST /api/restore/:id',
  'POST /mcp',
  'GET /api/health',
  'GET /api/setup',
  'POST /api/setup',
  'POST /api/session',
];

describe('every other route', () => {
  /** Each method and path the app answers, once. */
  function routes(): string[] {
    const app = createApp({ version: '1', db: openDatabase(':memory:'), log: ignore, address: () => '192.0.2.1' });
    const all = app.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} ${route.path}`);
    return [...new Set(all)].sort();
  }

  it('is for a signed-in user only, never for a key', async () => {
    const { s, ann } = await withAnn();
    const bob = await userOf(s, ann, 'Bob');
    const { key, secret } = await make(s, ann, 'owner', 'owner');
    const others = routes().filter((route) => !FOR_A_KEY.includes(route));
    expect(others).toContain('GET /api/keys');
    for (const route of others) {
      const [method = '', path = ''] = route.split(' ');
      const id = path.startsWith('/api/keys/') ? key.id : bob.id;
      const response = await s.call(method, path.replace(':id', String(id)), method === 'GET' ? undefined : {}, secret);
      expect(response.status, route).toBe(401);
    }
    expect(await keys(s, ann)).toEqual([{ ...key, usedAt: null }]);
    expect((await s.call('GET', '/api/session', undefined, bob.token)).status).toBe(200);
  });
});

describe('a key of one user', () => {
  it("reaches only that user's library, keys and log", async () => {
    const { s, ann } = await withAnn();
    const bob = await userOf(s, ann, 'Bob');
    const annKey = await make(s, ann, 'helper', 'owner');
    const bobKey = await make(s, bob.token, 'helper', 'owner');
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Ann only' } }, annKey.secret);
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Bob only' } }, bobKey.secret);
    expect(names(await library(s, ann))).toEqual(['Ann only']);
    expect(names(await library(s, bob.token))).toEqual(['Bob only']);
    expect(names(await library(s, bobKey.secret))).toEqual(['Bob only']);
    expect(await keys(s, bob.token)).toEqual([expect.objectContaining({ id: bobKey.key.id })]);
    expect((await s.call('DELETE', `/api/keys/${annKey.key.id}`, undefined, bob.token)).status).toBe(404);
    expect((await keys(s, ann)).map((key) => key.id)).toEqual([annKey.key.id]);
    expect((await log(s, bob.token)).map((entry) => entry.command)).toEqual(['library.read', 'group.add']);
  });

  it('goes with the user', async () => {
    const { s, ann } = await withAnn();
    const bob = await userOf(s, ann, 'Bob');
    const { secret } = await make(s, bob.token, 'helper', 'edit');
    expect((await s.call('DELETE', `/api/users/${bob.id}`, undefined, ann)).status).toBe(204);
    expect((await s.call('GET', '/api/library', undefined, secret)).status).toBe(401);
    expect(s.db.all('select * from agent_keys')).toEqual([]);
    expect(s.db.all('select * from key_log')).toEqual([]);
  });

  it("is refused while the user's password is a temporary one", async () => {
    const { s, ann } = await withAnn();
    const bob = await userOf(s, ann, 'Bob');
    const { secret } = await make(s, bob.token, 'helper', 'edit');
    // A reset revokes the keys too, so this holds only if a password ever turns temporary another way.
    s.db.run('update users set temporary = 1 where id = ?', bob.id);
    const response = await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, secret);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'password: is temporary; change it first' });
    expect(s.db.all('select command, outcome from key_log')).toEqual([{ command: 'group.add', outcome: 'temporary-password' }]);
  });

  it('is revoked by a reset of the password, and stays so once the user sets a new one', async () => {
    const { s, ann } = await withAnn();
    const bob = await userOf(s, ann, 'Bob');
    const { secret } = await make(s, bob.token, 'helper', 'owner');
    const reset = await s.call('POST', `/api/users/${bob.id}/password`, undefined, ann);
    expect(reset.status).toBe(200);
    const { password } = (await reset.json()) as { password: string };
    const token = await tokenOf(await signIn(s, 'Bob', password));
    expect((await s.call('POST', '/api/password', { current: password, password: 'bob-password-2' }, token)).status).toBe(204);
    expect((await s.call('GET', '/api/library', undefined, secret)).status).toBe(401);
    expect((await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, secret)).status).toBe(401);
    expect(await keys(s, token)).toEqual([]);
  });

  it("outlasts the user's own change of the password", async () => {
    const { s, ann } = await withAnn();
    const bob = await userOf(s, ann, 'Bob');
    const { secret } = await make(s, bob.token, 'helper', 'read');
    const changed = await s.call('POST', '/api/password', { current: 'Bob-password-1', password: 'bob-password-2' }, bob.token);
    expect(changed.status).toBe(204);
    expect((await s.call('GET', '/api/library', undefined, secret)).status).toBe(200);
  });
});

/** What a key of each scope gets for a command of each agent class: undefined when it runs. */
const REFUSALS: Record<Scope, Record<string, [string, string] | undefined>> = {
  read: {
    safe: ['read-only', 'scope: a read key only reads'],
    owner: ['read-only', 'scope: a read key only reads'],
    never: ['never', 'id: no agent key may run it'],
  },
  edit: { safe: undefined, owner: ['needs-owner', 'scope: needs a key with the owner scope'], never: ['never', 'id: no agent key may run it'] },
  owner: { safe: undefined, owner: undefined, never: ['never', 'id: no agent key may run it'] },
};

/** Every library command of core, and one of each class only a test registers. */
function commands(): CommandRegistry {
  const registry = createCommands();
  for (const agentClass of ['safe', 'owner', 'never'] as const) {
    registry.register({
      id: `test.${agentClass}`,
      agentClass,
      parse: () => undefined,
      run: (library) => ({ library, value: agentClass }),
    });
  }
  return registry;
}

const SCOPES: readonly Scope[] = ['read', 'edit', 'owner'];
const TABLE = commands()
  .ids()
  .flatMap((id) => SCOPES.map((scope) => [scope, id, commands().agentClassOf(id) ?? 'never'] as const));

describe('the scope of a key against the agent class of a command', () => {
  it.each(TABLE)('a %s key with %s (%s)', async (scope, id, agentClass) => {
    const { s, ann } = await withAnn({ commands: commands() });
    const { secret } = await make(s, ann, 'helper', scope);
    const refusal = REFUSALS[scope][agentClass];
    const response = await s.call('POST', `/api/commands/${id}`, { params: {} }, secret);
    const [entry] = await log(s, ann);
    expect(entry?.command).toBe(id);
    if (refusal === undefined) {
      expect(response.status).not.toBe(403);
      expect(entry?.outcome).toMatch(/^(done|invalid|missing)$/);
    } else {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: refusal[1] });
      expect(entry?.outcome).toBe(refusal[0]);
    }
  });

  it.each([
    ['read', 'test.safe', 'read-only'],
    ['owner', 'test.never', 'never'],
    ['owner', 'no.such.command', 'unknown'],
    ['edit', 'test.owner', 'needs-owner'],
  ] as const)('refuses a key of scope %s with %s before its body is read',async (scope, id, outcome) => {
    const { s, ann } = await withAnn({ commands: commands() });
    const { secret } = await make(s, ann, 'helper', scope);
    let read = 0;
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        read += 1;
        if (read > 1) await held;
        controller.enqueue(new TextEncoder().encode(`{"params":"${'x'.repeat(20_000)}`));
      },
    });
    const pending = s.send(`/api/commands/${id}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    const response = await Promise.race([pending, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 200))]);
    release();
    expect(response?.status).toBe(outcome === 'unknown' ? 400 : 403);
    expect(read).toBeLessThanOrEqual(1);
    expect((await log(s, ann)).map((entry) => entry.outcome)).toEqual([outcome]);
  });

  it('covers every library command of core', () => {
    const ids = new Set(TABLE.map(([, id]) => id));
    for (const id of createCommands().ids()) expect(ids.has(id)).toBe(true);
  });
});

describe('a change by a key', () => {
  it("is kept in a snapshot with the key's name as the source", async () => {
    const { s, ann } = await withAnn();
    const { secret } = await make(s, ann, 'claude-desktop', 'edit');
    const response = await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, secret);
    expect(response.status).toBe(200);
    const [newest] = (await library(s, ann)).history.snapshots;
    expect(newest?.source).toEqual({ kind: 'agent', key: 'claude-desktop' });
  });

  it('is taken back, brought again and restored only by an owner key, under its name', async () => {
    const { s, ann } = await withAnn();
    const edit = await make(s, ann, 'editor', 'edit');
    const owner = await make(s, ann, 'boss', 'owner');
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, edit.secret);
    for (const path of ['/api/undo', '/api/redo', '/api/restore/1']) {
      const response = await s.call('POST', path, undefined, edit.secret);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'scope: needs a key with the owner scope' });
    }
    expect(names((await (await s.call('POST', '/api/undo', undefined, owner.secret)).json()) as Shown)).toEqual([]);
    expect((await s.call('POST', '/api/undo', undefined, owner.secret)).status).toBe(204);
    expect((await s.call('POST', '/api/redo', undefined, owner.secret)).status).toBe(200);
    const start = (await library(s, ann)).history.snapshots.at(-1)?.id;
    expect((await s.call('POST', `/api/restore/${start}`, undefined, owner.secret)).status).toBe(200);
    expect((await s.call('POST', '/api/restore/999', undefined, owner.secret)).status).toBe(404);
    const sources = (await library(s, ann)).history.snapshots.slice(0, 3).map((snapshot) => [snapshot.cause, snapshot.source]);
    expect(sources).toEqual([
      ['restore', { kind: 'agent', key: 'boss' }],
      ['redo', { kind: 'agent', key: 'boss' }],
      ['undo', { kind: 'agent', key: 'boss' }],
    ]);
    expect((await log(s, ann)).map((entry) => [entry.key, entry.command, entry.outcome])).toEqual([
      ['boss', 'history.restore', 'missing'],
      ['boss', 'history.restore', 'done'],
      ['boss', 'history.redo', 'done'],
      ['boss', 'history.undo', 'unchanged'],
      ['boss', 'history.undo', 'done'],
      ['editor', 'history.restore', 'needs-owner'],
      ['editor', 'history.redo', 'needs-owner'],
      ['editor', 'history.undo', 'needs-owner'],
      ['editor', 'group.add', 'done'],
    ]);
  });
});

describe('the key log', () => {
  it('holds the time, the key, its scope, the command and the outcome, newest first', async () => {
    const { s, ann } = await withAnn();
    const { secret } = await make(s, ann, 'helper', 'edit');
    s.time = 5_000_000;
    await s.call('POST', '/api/commands/site.add', { params: { group: 'g999', name: 'x', url: 'https://example.org/' } }, secret);
    s.time = 6_000_000;
    await s.call('POST', '/api/commands/no.such.command', { params: {} }, secret);
    s.time = 7_000_000;
    await s.call('POST', '/api/commands/group.remove', { params: { group: 'g1' } }, secret);
    expect(await log(s, ann)).toEqual([
      { at: 7_000_000, key: 'helper', scope: 'edit', command: 'group.remove', outcome: 'needs-owner' },
      { at: 6_000_000, key: 'helper', scope: 'edit', command: null, outcome: 'unknown' },
      { at: 5_000_000, key: 'helper', scope: 'edit', command: 'site.add', outcome: 'missing' },
    ]);
  });

  it('holds no parameter value and no page text', async () => {
    const registry = commands();
    registry.register({
      id: 'test.refuse',
      agentClass: 'safe',
      parse: () => undefined,
      run: () => {
        throw new CommandError('refused', 'Mark-Refused-47');
      },
    });
    const { s, ann } = await withAnn({ commands: registry });
    const bob = await userOf(s, ann, 'Bob');
    const { secret } = await make(s, ann, 'helper', 'owner');
    const reader = await make(s, ann, 'reader', 'read');
    const editor = await make(s, ann, 'editor', 'edit');
    const temporary = await make(s, bob.token, 'helper', 'owner');
    s.db.run('update users set temporary = 1 where id = ?', bob.id);
    const marks = ['Mark-Group-41', 'https://mark-42.example/', 'Mark-Site-43', 'Mark-Todo-44', 'Mark-Missing-45'] as const;
    const run = async (id: string, params: unknown, status: number, key = secret): Promise<void> => {
      expect((await s.call('POST', `/api/commands/${encodeURIComponent(id)}`, { params }, key)).status).toBe(status);
    };
    await run('group.add', { name: marks[0] }, 200);
    const group = (await library(s, ann)).library.groups[0]?.id;
    await run('site.add', { group, name: marks[2], url: marks[1] }, 200);
    await run('site.add', { group, name: marks[2], url: 'javascript:Mark' }, 400);
    await run('site.add', { group: marks[4], name: marks[2], url: marks[1] }, 404);
    await run('todo.add', { text: marks[3] }, 200);
    await run(marks[0], {}, 400);
    await run('test.refuse', { name: 'Mark-Param-49' }, 403);
    expect((await s.call('POST', '/api/restore/Mark-Restore-48', undefined, secret)).status).toBe(404);
    await run('group.add', { name: 'Mark-Read-50' }, 403, reader.secret);
    await run('group.remove', { group: 'Mark-Owner-51' }, 403, editor.secret);
    await run('test.never', { name: 'Mark-Never-52' }, 403);
    await run('group.add', { name: 'Mark-Temporary-53' }, 403, temporary.secret);
    expect((await log(s, ann)).map((entry) => entry.outcome)).toEqual([
      'never',
      'needs-owner',
      'read-only',
      'missing',
      'error',
      'unknown',
      'done',
      'missing',
      'invalid',
      'done',
      'done',
    ]);
    s.db.run('update users set temporary = 0 where id = ?', bob.id);
    expect((await log(s, bob.token)).map((entry) => entry.outcome)).toEqual(['temporary-password']);
    const kept = JSON.stringify(s.db.all('select * from key_log'));
    const shown = JSON.stringify([await log(s, ann), await log(s, bob.token), await keys(s, ann), await keys(s, bob.token)]);
    for (const mark of [...marks, 'Mark']) {
      expect(kept).not.toContain(mark);
      expect(shown).not.toContain(mark);
    }
    expect(s.lines.join('\n')).not.toContain('Mark');
    expect(s.lines.join('\n')).not.toContain(secret);
  });

  it('keeps the newest 100 uses of each user', async () => {
    const { s, ann } = await withAnn();
    const { secret } = await make(s, ann, 'reader', 'read');
    for (let n = 0; n < 105; n += 1) {
      s.time += 1;
      await library(s, secret);
    }
    const entries = await log(s, ann);
    expect(entries).toHaveLength(100);
    expect(entries[0]?.at).toBe(s.time);
    expect(s.db.get('select count(*) as n from key_log')).toEqual({ n: 100 });
  });

  it('keeps the uses of a revoked key', async () => {
    const { s, ann } = await withAnn();
    const { key, secret } = await make(s, ann, 'reader', 'read');
    await library(s, secret);
    await s.call('DELETE', `/api/keys/${key.id}`, undefined, ann);
    expect((await log(s, ann)).map((entry) => [entry.key, entry.command, entry.outcome])).toEqual([['reader', 'library.read', 'done']]);
  });
});

describe('a command of a key that fails', () => {
  /** A registry with one more `safe` command, which runs `run`. */
  function failing(run: () => void): CommandRegistry {
    const registry = createCommands();
    registry.register({
      id: 'test.fail',
      agentClass: 'safe',
      parse: () => undefined,
      run: (library) => {
        run();
        return { library: { ...library, todos: [...library.todos, { id: 't9', text: 'later', done: false }] }, value: null };
      },
    });
    return registry;
  }

  it('is logged as an error, without its message', async () => {
    const { s, ann } = await withAnn({
      commands: failing(() => {
        throw new Error('Mark-Error-46');
      }),
    });
    const { secret } = await make(s, ann, 'helper', 'edit');
    const response = await s.call('POST', '/api/commands/test.fail', { params: {} }, secret);
    expect(response.status).toBe(500);
    expect((await log(s, ann)).map((entry) => entry.outcome)).toEqual(['error']);
    expect(JSON.stringify(s.db.all('select * from key_log'))).not.toContain('Mark');
    expect(s.lines.join('\n')).not.toContain('Mark');
  });

  it('is logged as an error when the command refuses for a reason of its own', async () => {
    const { s, ann } = await withAnn({
      commands: failing(() => {
        throw new CommandError('refused', 'Mark-Refused-47');
      }),
    });
    const { secret } = await make(s, ann, 'helper', 'edit');
    expect((await s.call('POST', '/api/commands/test.fail', { params: {} }, secret)).status).toBe(403);
    expect((await log(s, ann)).map((entry) => entry.outcome)).toEqual(['error']);
  });

  it('is refused when the user is removed while it runs', async () => {
    let remove = (): void => undefined;
    const { s, ann } = await withAnn({ commands: failing(() => remove()) });
    const bob = await userOf(s, ann, 'Bob');
    const { secret } = await make(s, bob.token, 'helper', 'edit');
    remove = () => {
      s.db.run('delete from users where id = ?', bob.id);
    };
    const response = await s.call('POST', '/api/commands/test.fail', { params: {} }, secret);
    expect(response.status).toBe(401);
    expect(s.db.all('select * from key_log')).toEqual([]);
  });

  it('of the user, not a key, is refused too when the user is removed while it runs', async () => {
    let remove = (): void => undefined;
    const { s, ann } = await withAnn({ commands: failing(() => remove()) });
    const bob = await userOf(s, ann, 'Bob');
    remove = () => {
      s.db.run('delete from users where id = ?', bob.id);
    };
    expect((await s.call('POST', '/api/commands/test.fail', { params: {} }, bob.token)).status).toBe(401);
  });
});
