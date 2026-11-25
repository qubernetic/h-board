import { describe, expect, it } from 'vitest';
import { Accounts, createApp, migrate, openDatabase } from '../src/index';
import type { Database } from '../src/index';
import { hashPassword } from '../src/secrets';
import { ADMIN, ignore, server, setUp, signIn, tokenOf } from './support';
import type { Server } from './support';

interface Added {
  readonly user: { readonly id: number; readonly name: string; readonly mustChangePassword: boolean };
  readonly password: string;
}

const TEMPORARY = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/;

async function add(s: Server, token: string, name: string): Promise<Added> {
  const response = await s.call('POST', '/api/users', { name }, token);
  expect(response.status).toBe(201);
  return (await response.json()) as Added;
}

/** Adds Bob, signs him in with the temporary password and sets his own: his token. */
async function bob(s: Server, admin: string): Promise<{ id: number; token: string }> {
  const added = await add(s, admin, 'Bob');
  const first = await tokenOf(await signIn(s, 'Bob', added.password));
  const changed = await s.call('POST', '/api/password', { current: added.password, password: 'bob-password-1' }, first);
  expect(changed.status).toBe(204);
  return { id: added.user.id, token: first };
}

/** Every user route, as a call by the caller of `token` on the user `id`. */
const ROUTES: [string, (s: Server, token: string, id: number) => Promise<Response>][] = [
  ['GET /api/users', (s, token) => s.call('GET', '/api/users', undefined, token)],
  ['POST /api/users', (s, token) => s.call('POST', '/api/users', { name: 'Cid' }, token)],
  ['POST /api/users/:id/password', (s, token, id) => s.call('POST', `/api/users/${id}/password`, undefined, token)],
  ['DELETE /api/users/:id', (s, token, id) => s.call('DELETE', `/api/users/${id}`, undefined, token)],
];

describe('the user routes', () => {
  it.each(ROUTES)('%s refuses a user who is not an admin', async (_, route) => {
    const s = server();
    const admin = await setUp(s);
    const { token } = await bob(s, admin);
    const response = await route(s, token, 1);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'only an admin manages users' });
    expect(s.db.all('select name from users order by id')).toEqual([{ name: 'Ann' }, { name: 'Bob' }]);
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
  });

  it.each(ROUTES)('%s needs a session', async (_, route) => {
    const s = server();
    await setUp(s);
    const response = await route(s, 'not-a-token', 1);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'sign in first' });
  });
});

/** The routes anyone may call, without a token. */
const PUBLIC = ['GET /api/health', 'GET /api/setup', 'POST /api/setup', 'POST /api/session'];

describe('every route', () => {
  /** Each method and path the app answers, once, with `:id` as the second user. */
  function routes(): string[] {
    const app = createApp({ version: '1', db: openDatabase(':memory:'), log: ignore, address: () => '192.0.2.1' });
    const all = app.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} ${route.path}`);
    return [...new Set(all)].sort();
  }

  async function reached(s: Server, route: string, token?: string): Promise<Response> {
    const [method = '', path = ''] = route.split(' ');
    return s.call(method, path.replace(':id', '2'), method === 'GET' ? undefined : {}, token);
  }

  it('lets a temporary password reach only its session and the password change', async () => {
    const reach: string[] = [];
    for (const route of routes()) {
      const s = server();
      const { password } = await add(s, await setUp(s), 'Bob');
      const response = await reached(s, route, await tokenOf(await signIn(s, 'Bob', password)));
      if (!(await response.text()).includes('password: is temporary; change it first')) reach.push(route);
    }
    expect(reach).toEqual([...PUBLIC, 'GET /api/session', 'DELETE /api/session', 'POST /api/password'].sort());
  });

  it('lets a caller without a token reach only the public routes', async () => {
    const reach: string[] = [];
    for (const route of routes()) {
      const response = await reached(server(), route);
      if (response.status !== 401) reach.push(route);
    }
    expect(reach).toEqual([...PUBLIC].sort());
  });
});

describe('GET /api/users', () => {
  it('lists every account, the oldest first, without a password', async () => {
    const s = server();
    const admin = await setUp(s);
    const added = await add(s, admin, 'Bob');
    s.time += 1000;
    await add(s, admin, 'Cid');
    const response = await s.call('GET', '/api/users', undefined, admin);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [
        { id: 1, name: 'Ann', admin: true, mustChangePassword: false, createdAt: 1_000_000 },
        { id: 2, name: 'Bob', admin: false, mustChangePassword: true, createdAt: 1_000_000 },
        { id: 3, name: 'Cid', admin: false, mustChangePassword: true, createdAt: 1_001_000 },
      ],
    });
    expect(s.bodies.at(-1)).not.toContain(added.password);
  });
});

describe('POST /api/users', () => {
  it('adds a user who is not an admin, with a temporary password shown once', async () => {
    const s = server();
    const admin = await setUp(s);
    const response = await s.call('POST', '/api/users', { name: ' Bob ' }, admin);
    expect(response.status).toBe(201);
    const body = (await response.json()) as Added;
    expect(body.user).toEqual({ id: 2, name: 'Bob', admin: false, mustChangePassword: true, createdAt: 1_000_000 });
    expect(body.password).toMatch(TEMPORARY);
    expect(JSON.stringify(s.db.all('select * from users'))).not.toContain(body.password);
  });

  it('refuses a name that is taken, in any case, without hashing', async () => {
    const s = server();
    const admin = await setUp(s);
    await add(s, admin, 'Bob');
    const hashes = s.hashes;
    for (const name of ['bob', 'ANN']) {
      const response = await s.call('POST', '/api/users', { name }, admin);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'name: is taken' });
    }
    expect(s.hashes).toBe(hashes);
  });

  it('names a wrong field and refuses a body that is not a JSON object', async () => {
    const s = server();
    const admin = await setUp(s);
    const cases: [unknown, string][] = [
      [{ name: ' ' }, 'name: must not be empty'],
      [{ name: 'a'.repeat(65) }, 'name: must be at most 64 characters'],
      [{ name: 'tab\there' }, 'name: must not contain control characters'],
      [{}, 'name: must be text'],
      ['[]', 'body: must be a JSON object'],
    ];
    for (const [body, error] of cases) {
      const response = await s.call('POST', '/api/users', body, admin);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect(s.db.all('select name from users')).toEqual([{ name: 'Ann' }]);
  });
});

describe('a temporary password', () => {
  it('signs in once, and that session may only change it', async () => {
    const s = server();
    const admin = await setUp(s);
    const { password } = await add(s, admin, 'Bob');
    const response = await signIn(s, 'Bob', password);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; user: { mustChangePassword: boolean } };
    expect(body.user.mustChangePassword).toBe(true);
    const session = await s.call('GET', '/api/session', undefined, body.token);
    expect(await session.json()).toMatchObject({ user: { name: 'Bob', mustChangePassword: true } });
    const gated = await s.call('GET', '/api/users', undefined, body.token);
    expect(gated.status).toBe(403);
    expect(await gated.json()).toEqual({ error: 'password: is temporary; change it first' });
    const again = await signIn(s, 'Bob', password);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: 'the name or the password is wrong' });
  });

  it('is replaced by the user, who then signs in with their own', async () => {
    const s = server();
    const admin = await setUp(s);
    const { password } = await add(s, admin, 'Bob');
    const token = await tokenOf(await signIn(s, 'Bob', password));
    const short = await s.call('POST', '/api/password', { current: password, password: 'short' }, token);
    expect(short.status).toBe(400);
    const changed = await s.call('POST', '/api/password', { current: password, password: 'bob-password-1' }, token);
    expect(changed.status).toBe(204);
    expect(await (await s.call('GET', '/api/session', undefined, token)).json()).toMatchObject({
      user: { mustChangePassword: false },
    });
    expect((await signIn(s, 'Bob', password)).status).toBe(401);
    expect((await signIn(s, 'Bob', 'bob-password-1')).status).toBe(200);
    expect((await signIn(s, 'Bob', 'bob-password-1')).status).toBe(200);
  });

  it('is not kept as the new password, since the admin has seen it', async () => {
    const s = server();
    const admin = await setUp(s);
    const { user, password } = await add(s, admin, 'Bob');
    const token = await tokenOf(await signIn(s, 'Bob', password));
    const same = await s.call('POST', '/api/password', { current: password, password }, token);
    expect(same.status).toBe(400);
    expect(await same.json()).toEqual({ error: 'password: must differ from the temporary one' });
    expect(s.db.get('select temporary from users where id = ?', user.id)).toEqual({ temporary: 1 });
    expect((await signIn(s, 'Bob', password)).status).toBe(401);
  });

  it('signs in once when it comes twice at once', async () => {
    const s = server();
    const admin = await setUp(s);
    const { password } = await add(s, admin, 'Bob');
    const answers = await Promise.all([signIn(s, 'Bob', password), signIn(s, 'Bob', password)]);
    expect(answers.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  it('lets its session sign out', async () => {
    const s = server();
    const admin = await setUp(s);
    const { password } = await add(s, admin, 'Bob');
    const token = await tokenOf(await signIn(s, 'Bob', password));
    expect((await s.call('DELETE', '/api/session', undefined, token)).status).toBe(204);
    expect((await s.call('GET', '/api/session', undefined, token)).status).toBe(401);
  });
});

describe('POST /api/users/:id/password', () => {
  it('gives a new temporary password and signs the user out everywhere', async () => {
    const s = server();
    const admin = await setUp(s);
    const { id, token } = await bob(s, admin);
    const response = await s.call('POST', `/api/users/${id}/password`, undefined, admin);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Added;
    expect(body.password).toMatch(TEMPORARY);
    expect(body.user).toMatchObject({ id, name: 'Bob', mustChangePassword: true });
    expect((await s.call('GET', '/api/session', undefined, token)).status).toBe(401);
    expect(s.db.all('select * from sessions where user_id = ?', id)).toEqual([]);
    expect((await signIn(s, 'Bob', 'bob-password-1')).status).toBe(401);
    const fresh = await tokenOf(await signIn(s, 'Bob', body.password));
    expect((await s.call('GET', '/api/users', undefined, fresh)).status).toBe(403);
  });

  it('refuses the account of the caller and an unknown user', async () => {
    const s = server();
    const admin = await setUp(s);
    const own = await s.call('POST', '/api/users/1/password', undefined, admin);
    expect(own.status).toBe(409);
    expect(await own.json()).toEqual({ error: 'id: is your own account; change your password instead' });
    for (const id of ['2', '0', 'x', '01', '9999999999999999']) {
      const response = await s.call('POST', `/api/users/${id}/password`, undefined, admin);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'id: no such user' });
    }
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
  });

  it('gives no password when the user is removed while it is hashed', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    const admin = await setUp(s);
    const { id } = (await add(s, admin, 'Bob')).user;
    let removing = false;
    const app = createApp({
      version: '1',
      db,
      log: ignore,
      address: () => '192.0.2.1',
      hashPassword: (password) => {
        if (removing) db.run('delete from users where id = ?', id);
        return hashPassword(password, 1024);
      },
    });
    removing = true;
    const response = await app.request(`/api/users/${id}/password`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'id: no such user' });
  });
});

describe('DELETE /api/users/:id', () => {
  it('removes the user with their sessions', async () => {
    const s = server();
    const admin = await setUp(s);
    const { id, token } = await bob(s, admin);
    const other = await tokenOf(await signIn(s, 'Bob', 'bob-password-1'));
    expect(s.db.all('select id from sessions where user_id = ?', id)).toHaveLength(2);
    expect((await s.call('DELETE', `/api/users/${id}`, undefined, admin)).status).toBe(204);
    expect(s.db.all('select * from sessions where user_id = ?', id)).toEqual([]);
    for (const t of [token, other]) expect((await s.call('GET', '/api/session', undefined, t)).status).toBe(401);
    expect((await signIn(s, 'Bob', 'bob-password-1')).status).toBe(401);
    expect(await (await s.call('GET', '/api/users', undefined, admin)).json()).toMatchObject({ users: [{ name: 'Ann' }] });
    expect((await s.call('DELETE', `/api/users/${id}`, undefined, admin)).status).toBe(404);
  });

  it('refuses the account of the caller', async () => {
    const s = server();
    const admin = await setUp(s);
    const response = await s.call('DELETE', '/api/users/1', undefined, admin);
    expect(response.status).toBe(409);
    expect((await s.call('GET', '/api/session', undefined, admin)).status).toBe(200);
  });

  it('frees the name for a new user', async () => {
    const s = server();
    const admin = await setUp(s);
    const { id } = await bob(s, admin);
    await s.call('DELETE', `/api/users/${id}`, undefined, admin);
    expect((await add(s, admin, 'bob')).user.name).toBe('bob');
  });
});

describe('Accounts', () => {
  it('adds no user when another took the name while the password was hashed', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    await setUp(s);
    const accounts = new Accounts(db, (password) => {
      db.run("insert into users (name, password_hash, created_at) values ('Bob', 'x', 0)");
      return hashPassword(password, 1024);
    });
    expect(await accounts.addUser('bob', 0)).toBeUndefined();
    expect(db.all('select name from users order by id')).toEqual([{ name: 'Ann' }, { name: 'Bob' }]);
  });

  it('changes no password when the session was revoked while it was hashed', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    const token = await setUp(s);
    const accounts = new Accounts(db, (password) => {
      db.run('delete from sessions');
      return hashPassword(password, 1024);
    });
    const session = accounts.session(token, 0);
    expect(session).toBeDefined();
    if (session === undefined) return;
    expect(await accounts.changePassword(session, 'the-new-password')).toBe(false);
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
  });

  it('starts no session when the password is changed while a sign-in checks it', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    await setUp(s);
    const fresh = await hashPassword('the-new-password', 1024);
    const accounts = new Accounts(db, () => Promise.resolve(fresh));
    const own = accounts.session(await tokenOf(await signIn(s, 'Ann', ADMIN.password)), 0);
    expect(own).toBeDefined();
    if (own === undefined) return;
    const leaked = accounts.signIn('Ann', ADMIN.password, 0);
    expect(await accounts.changePassword(own, 'the-new-password')).toBe(true);
    expect(await leaked).toBeUndefined();
    expect(db.all('select id from sessions where user_id = 1')).toEqual([{ id: own.id }]);
  });

  it('starts no session when the password is reset while a sign-in checks it', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    const { id } = await bob(s, await setUp(s));
    const fresh = await hashPassword('a-temporary-one', 1024);
    const accounts = new Accounts(db, () => Promise.resolve(fresh));
    const leaked = accounts.signIn('Bob', 'bob-password-1', 0);
    expect(await accounts.resetPassword(id)).toBeDefined();
    expect(await leaked).toBeUndefined();
    expect(db.all('select id from sessions where user_id = ?', id)).toEqual([]);
  });

  it('starts no session when the user is removed while a sign-in checks the password', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    const { id } = await bob(s, await setUp(s));
    const accounts = new Accounts(db);
    const leaked = accounts.signIn('Bob', 'bob-password-1', 0);
    expect(accounts.removeUser(id)).toBe(true);
    expect(await leaked).toBeUndefined();
    expect(db.all('select id from sessions where user_id = ?', id)).toEqual([]);
  });

  it('resets no password of a new user who took the id while it was hashed', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    const { id } = await bob(s, await setUp(s));
    const accounts = new Accounts(db, (password) => {
      db.run('delete from users where id = ?', id);
      db.run("insert into users (name, password_hash, created_at) values ('Cid', 'cid-hash', 5)");
      return hashPassword(password, 1024);
    });
    expect(await accounts.resetPassword(id)).toBeUndefined();
    expect(db.get('select id, password_hash, temporary from users where name = ?', 'Cid')).toEqual({
      id,
      password_hash: 'cid-hash',
      temporary: 0,
    });
  });

  it('resets no password of an unknown user', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const accounts = new Accounts(db);
    expect(await accounts.resetPassword(7)).toBeUndefined();
  });
});

describe('POST /api/password', () => {
  it('changes nothing when an admin reset the password while the new one was hashed', async () => {
    const db = openDatabase(':memory:');
    const s = server(undefined, db);
    const admin = await setUp(s);
    const { user, password } = await add(s, admin, 'Bob');
    const token = await tokenOf(await signIn(s, 'Bob', password));
    let resetting = false;
    const app = createApp({
      version: '1',
      db,
      log: ignore,
      address: () => '192.0.2.1',
      hashPassword: (typed) => {
        if (resetting) db.run('delete from sessions where user_id = ?', user.id);
        return hashPassword(typed, 1024);
      },
    });
    resetting = true;
    const response = await app.request('/api/password', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ current: password, password: 'bob-password-1' }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'sign in first' });
    expect(db.get('select temporary from users where id = ?', user.id)).toEqual({ temporary: 1 });
  });
});

describe('POST /api/session', () => {
  it('refuses a user removed while the password was checked', async () => {
    const real = openDatabase(':memory:');
    let remove: (() => void) | undefined;
    // Removes the user right after the sign-in has read their row, before the password is checked.
    const db: Database = {
      ...real,
      get: (sql, ...params) => {
        const row = real.get(sql, ...params);
        if (remove !== undefined && sql.includes('where name = ?')) {
          remove();
          remove = undefined;
        }
        return row;
      },
    };
    const s = server(undefined, db);
    const { id } = await bob(s, await setUp(s));
    remove = () => real.run('delete from users where id = ?', id);
    const response = await signIn(s, 'Bob', 'bob-password-1');
    expect(remove).toBeUndefined();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'the name or the password is wrong' });
  });
});

describe('the temporary passwords', () => {
  it('never appear in a log line, and in one answer each', async () => {
    const s = server();
    const admin = await setUp(s);
    const { id, password } = await add(s, admin, 'Bob').then((a) => ({ id: a.user.id, password: a.password }));
    const reset = (await (await s.call('POST', `/api/users/${id}/password`, undefined, admin)).json()) as Added;
    await signIn(s, 'Bob', password);
    const token = await tokenOf(await signIn(s, 'Bob', reset.password));
    await s.call('POST', '/api/password', { current: reset.password, password: 'bob-password-1' }, token);
    await s.call('GET', '/api/users', undefined, admin);
    for (const secret of [password, reset.password]) {
      expect(s.lines.join('\n')).not.toContain(secret);
      expect(s.bodies.filter((body) => body.includes(secret))).toHaveLength(1);
    }
  });
});
