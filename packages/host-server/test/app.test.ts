import { describe, expect, it } from 'vitest';
import { createApp, openDatabase } from '../src/index';
import type { Database } from '../src/index';
import { hashPassword } from '../src/secrets';

const ADMIN = { name: 'Ann', password: 'ann-password-1' };

function ignore(): void {
  // a log nobody reads
}

interface Server {
  readonly db: Database;
  /** Every line the server logged. */
  readonly lines: string[];
  /** Every response body the server sent. */
  readonly bodies: string[];
  /** The setup code of the last start, read from the log. */
  code: string;
  /** How many passwords the server has hashed. */
  hashes: number;
  time: number;
  address: string;
  start(): void;
  call(method: string, path: string, body?: unknown, token?: string): Promise<Response>;
  send(path: string, init: RequestInit): Promise<Response>;
}

/** A server on an in-memory database, with its log, its clock and the caller's address in hand. */
function server(db: Database = openDatabase(':memory:')): Server {
  let app: ReturnType<typeof createApp> | undefined;
  const s: Server = {
    db,
    lines: [],
    bodies: [],
    code: '',
    hashes: 0,
    time: 1_000_000,
    address: '192.0.2.1',
    start() {
      app = createApp({
        version: '1.2.3',
        db,
        log: (line) => s.lines.push(line),
        now: () => s.time,
        address: () => s.address,
        hashPassword: (password) => {
          s.hashes += 1;
          return hashPassword(password, 1024);
        },
      });
      const line = s.lines.findLast((text) => text.startsWith('setup code: '));
      s.code = line === undefined ? '' : (/setup code: (\S+)/.exec(line)?.[1] ?? '');
    },
    async call(method, path, body, token) {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
      return s.send(path, init);
    },
    async send(path, init) {
      if (app === undefined) throw new Error('start the server first');
      const response = await app.request(path, init);
      s.bodies.push(await response.clone().text());
      return response;
    },
  };
  s.start();
  return s;
}

async function setUp(s: Server): Promise<string> {
  const response = await s.call('POST', '/api/setup', { code: s.code, ...ADMIN });
  expect(response.status).toBe(201);
  return ((await response.json()) as { token: string }).token;
}

async function signIn(s: Server, name: string, password: string): Promise<Response> {
  return s.call('POST', '/api/session', { name, password });
}

async function tokenOf(response: Response): Promise<string> {
  return ((await response.json()) as { token: string }).token;
}

/** Sends 20 attempts at once and counts the answers by status; every 429 must say how long to wait. */
async function atOnce(attempt: () => Promise<Response>): Promise<Record<number, number>> {
  const responses = await Promise.all(Array.from({ length: 20 }, attempt));
  const counts: Record<number, number> = {};
  for (const response of responses) {
    counts[response.status] = (counts[response.status] ?? 0) + 1;
    if (response.status === 429) expect(response.headers.get('retry-after')).toMatch(/^\d+$/);
  }
  return counts;
}

describe('GET /api/health', () => {
  it('answers ok with the version', async () => {
    const response = await server().call('GET', '/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: '1.2.3' });
  });
});

describe('an unknown path', () => {
  it('is not found', async () => {
    const response = await server().call('GET', '/api/nothing');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not found' });
  });
});

describe('the setup code', () => {
  it('is written to the log once at a start with no account', async () => {
    const s = server();
    expect(s.lines.filter((line) => line.includes(s.code))).toHaveLength(1);
    expect(s.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
    expect(await (await s.call('GET', '/api/setup')).json()).toEqual({ needed: true });
  });

  it('is kept only as a hash', () => {
    const s = server();
    const stored = JSON.stringify(s.db.all('select * from setup'));
    expect(stored).not.toContain(s.code);
    expect(stored).not.toContain(s.code.replace(/-/g, ''));
  });

  it('is replaced by a new one at the next start while there is no account', async () => {
    const s = server();
    const first = s.code;
    s.start();
    expect(s.code).not.toBe(first);
    const old = await s.call('POST', '/api/setup', { code: first, ...ADMIN });
    expect(old.status).toBe(403);
    await setUp(s);
  });

  it('is not written once there is an account', async () => {
    const s = server();
    await setUp(s);
    const before = s.lines.length;
    s.start();
    expect(s.lines.slice(before).join('\n')).not.toMatch(/setup code/);
    expect(await (await s.call('GET', '/api/setup')).json()).toEqual({ needed: false });
  });
});

describe('POST /api/setup', () => {
  it('makes the admin, signs them in and burns the code', async () => {
    const s = server();
    const response = await s.call('POST', '/api/setup', { code: s.code.toLowerCase(), ...ADMIN });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { token: string; user: unknown };
    expect(body.user).toEqual({ name: 'Ann', admin: true });
    expect(await (await s.call('GET', '/api/session', undefined, body.token)).json()).toEqual({
      user: { name: 'Ann', admin: true },
    });
    expect(s.db.all('select * from setup')).toEqual([]);
    expect(s.lines.at(-1)).toBe('setup done: the first account is made');
  });

  it('works once only: the same code is refused afterwards', async () => {
    const s = server();
    await setUp(s);
    const again = await s.call('POST', '/api/setup', { code: s.code, name: 'Bob', password: 'bob-password-1' });
    expect(again.status).toBe(403);
    expect(await again.json()).toEqual({ error: 'code: is wrong or already used' });
    expect(s.db.all('select name from users')).toEqual([{ name: 'Ann' }]);
  });

  it('refuses a wrong code and keeps the right one usable', async () => {
    const s = server();
    const wrong = await s.call('POST', '/api/setup', { code: 'AAAA-BBBB-CCCC-DDDD-EEEE', ...ADMIN });
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: 'code: is wrong or already used' });
    expect(s.db.all('select * from users')).toEqual([]);
    await setUp(s);
  });

  it('hashes no password for a wrong code or once the first account exists', async () => {
    const s = server();
    expect((await s.call('POST', '/api/setup', { code: 'AAAA-BBBB-CCCC-DDDD-EEEE', ...ADMIN })).status).toBe(403);
    expect(s.hashes).toBe(0);
    await setUp(s);
    expect(s.hashes).toBe(1);
    s.address = '192.0.2.2';
    expect((await s.call('POST', '/api/setup', { code: s.code, ...ADMIN })).status).toBe(403);
    expect(s.hashes).toBe(1);
  });

  it('makes one account when the right code comes twice at once', async () => {
    const s = server();
    const answers = await Promise.all([
      s.call('POST', '/api/setup', { code: s.code, ...ADMIN }),
      s.call('POST', '/api/setup', { code: s.code, name: 'Bob', password: 'bob-password-1' }),
    ]);
    expect(answers.map((response) => response.status).sort()).toEqual([201, 403]);
    expect(s.db.all('select * from users')).toHaveLength(1);
  });

  it('names every wrong field', async () => {
    const s = server();
    const response = await s.call('POST', '/api/setup', { code: 7, name: ' ', password: 'short' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: ['code: must be text', 'name: must not be empty', 'password: must be at least 10 characters'].join('\n'),
    });
  });

  it('checks the name and the password', async () => {
    const s = server();
    const cases: [unknown, unknown, string][] = [
      ['a'.repeat(65), ADMIN.password, 'name: must be at most 64 characters'],
      ['tab\there', ADMIN.password, 'name: must not contain control characters'],
      [ADMIN.name, 'x'.repeat(1025), 'password: must be at most 1024 characters'],
      [null, null, 'name: must be text\npassword: must be text'],
    ];
    for (const [name, password, error] of cases) {
      const response = await s.call('POST', '/api/setup', { code: s.code, name, password });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
  });

  it('refuses a body that is not a JSON object', async () => {
    const s = server();
    for (const body of ['not json', '[]', '"text"']) {
      const response = await s.call('POST', '/api/setup', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'body: must be a JSON object' });
    }
  });

  it('refuses a body over 16 KB', async () => {
    const s = server();
    const response = await s.call('POST', '/api/setup', { code: s.code, ...ADMIN, padding: 'x'.repeat(20_000) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'body: must be at most 16384 bytes' });
  });

  it('slows down guessing from one address', async () => {
    const s = server();
    for (let n = 0; n < 3; n += 1) {
      expect((await s.call('POST', '/api/setup', { code: 'nope', ...ADMIN })).status).toBe(403);
    }
    const slowed = await s.call('POST', '/api/setup', { code: s.code, ...ADMIN });
    expect(slowed.status).toBe(429);
    expect(slowed.headers.get('retry-after')).toBe('1');
    s.address = '192.0.2.2';
    await setUp(s);
  });

  it('slows down guesses sent at once from one address', async () => {
    const s = server();
    expect(await atOnce(() => s.call('POST', '/api/setup', { code: 'nope', ...ADMIN }))).toEqual({ 403: 3, 429: 17 });
  });
});

describe('POST /api/session (sign in)', () => {
  it('gives a token for the right name and password, the name in any case', async () => {
    const s = server();
    await setUp(s);
    const response = await signIn(s, 'ANN', ADMIN.password);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; user: unknown };
    expect(body.user).toEqual({ name: 'Ann', admin: true });
    expect((await s.call('GET', '/api/session', undefined, body.token)).status).toBe(200);
  });

  it('refuses a wrong password and an unknown name with one message', async () => {
    const s = server();
    await setUp(s);
    const wrong = await signIn(s, 'Ann', 'not-the-password');
    const unknown = await signIn(s, 'Nobody', ADMIN.password);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'the name or the password is wrong' });
    expect(await unknown.json()).toEqual({ error: 'the name or the password is wrong' });
  });

  it('names a wrong field', async () => {
    const s = server();
    const response = await s.call('POST', '/api/session', { name: 1 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name: must be text\npassword: must be text' });
    const long = await s.call('POST', '/api/session', { name: 'a'.repeat(65), password: 'x' });
    expect(long.status).toBe(400);
    expect(await long.json()).toEqual({ error: 'name: must be at most 64 characters' });
    expect(s.hashes).toBe(0);
    const notJson = await s.call('POST', '/api/session', 'not json');
    expect(await notJson.json()).toEqual({ error: 'body: must be a JSON object' });
  });

  it('slows down failed sign-ins per name', async () => {
    const s = server();
    await setUp(s);
    for (let n = 0; n < 3; n += 1) {
      s.address = `192.0.2.${10 + n}`;
      expect((await signIn(s, 'Ann', 'wrong-password')).status).toBe(401);
    }
    s.address = '192.0.2.99';
    const slowed = await signIn(s, 'ann', ADMIN.password);
    expect(slowed.status).toBe(429);
    expect(slowed.headers.get('retry-after')).toBe('1');
    expect(await slowed.json()).toEqual({ error: 'too many failed attempts; try again in 1 seconds' });
    s.time += 1000;
    expect((await signIn(s, 'Ann', 'wrong-password')).status).toBe(401);
    expect((await signIn(s, 'Ann', ADMIN.password)).headers.get('retry-after')).toBe('2');
    s.time += 2000;
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
    // the sign-in forgot the name's failures
    expect((await signIn(s, 'Ann', 'wrong-password')).status).toBe(401);
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
  });

  it('slows down failed sign-ins per address, whatever the name', async () => {
    const s = server();
    await setUp(s);
    for (const name of ['Bob', 'Cid', 'Dan']) expect((await signIn(s, name, 'wrong-password')).status).toBe(401);
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(429);
    s.address = '192.0.2.2';
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
  });

  it('refuses a body that is not sent as application/json and counts no failure', async () => {
    const s = server();
    await setUp(s);
    const wrong = JSON.stringify({ name: 'Ann', password: 'wrong-password' });
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', '']) {
      const headers: Record<string, string> = type === '' ? {} : { 'content-type': type };
      const response = await s.send('/api/session', { method: 'POST', body: wrong, headers });
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: 'body: must be application/json' });
    }
    const typed = await s.send('/api/session', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ann', password: ADMIN.password }),
      headers: { 'content-type': 'Application/JSON; charset=utf-8' },
    });
    expect(typed.status).toBe(200);
  });

  it('slows down wrong sign-ins sent at once for one name', async () => {
    const s = server();
    await setUp(s);
    expect(await atOnce(() => signIn(s, 'Ann', 'wrong-password'))).toEqual({ 401: 3, 429: 17 });
  });
});

describe('the session token', () => {
  it('is needed on GET /api/session', async () => {
    const s = server();
    await setUp(s);
    for (const authorization of [undefined, 'Bearer', 'Basic abc', 'Bearer not-a-token']) {
      const headers: Record<string, string> = authorization === undefined ? {} : { authorization };
      const response = await createApp({ version: '1', db: s.db, log: ignore, address: () => '192.0.2.1' }).request('/api/session', {
        headers,
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      expect(await response.json()).toEqual({ error: 'sign in first' });
    }
  });

  it('is kept only as a hash', async () => {
    const s = server();
    const token = await setUp(s);
    expect(JSON.stringify(s.db.all('select * from sessions'))).not.toContain(token);
  });

  it('records when it was last used', async () => {
    const s = server();
    const token = await setUp(s);
    s.time += 5000;
    await s.call('GET', '/api/session', undefined, token);
    expect(s.db.get('select created_at, used_at from sessions')).toEqual({
      created_at: 1_000_000,
      used_at: 1_005_000,
    });
  });
});

describe('DELETE /api/session (sign out)', () => {
  it('revokes the token and only that one', async () => {
    const s = server();
    const first = await setUp(s);
    const second = await tokenOf(await signIn(s, 'Ann', ADMIN.password));
    expect((await s.call('DELETE', '/api/session', undefined, first)).status).toBe(204);
    expect((await s.call('GET', '/api/session', undefined, first)).status).toBe(401);
    expect((await s.call('DELETE', '/api/session', undefined, first)).status).toBe(401);
    expect((await s.call('GET', '/api/session', undefined, second)).status).toBe(200);
  });
});

describe('POST /api/password', () => {
  it('changes the password and revokes the other sessions', async () => {
    const s = server();
    const current = await setUp(s);
    const other = await tokenOf(await signIn(s, 'Ann', ADMIN.password));
    const response = await s.call(
      'POST',
      '/api/password',
      { current: ADMIN.password, password: 'the-new-password' },
      current,
    );
    expect(response.status).toBe(204);
    expect((await s.call('GET', '/api/session', undefined, current)).status).toBe(200);
    expect((await s.call('GET', '/api/session', undefined, other)).status).toBe(401);
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(401);
    expect((await signIn(s, 'Ann', 'the-new-password')).status).toBe(200);
  });

  it('refuses a wrong current password and a short new one', async () => {
    const s = server();
    const token = await setUp(s);
    const wrong = await s.call('POST', '/api/password', { current: 'wrong-password', password: 'the-new-password' }, token);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'current: is not the password of this account' });
    const short = await s.call('POST', '/api/password', { current: ADMIN.password, password: 'short' }, token);
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: 'password: must be at least 10 characters' });
    expect((await signIn(s, 'Ann', ADMIN.password)).status).toBe(200);
  });

  it('slows down guessing the current password', async () => {
    const s = server();
    const token = await setUp(s);
    for (let n = 0; n < 3; n += 1) {
      await s.call('POST', '/api/password', { current: 'wrong-password', password: 'the-new-password' }, token);
    }
    const slowed = await s.call('POST', '/api/password', { current: ADMIN.password, password: 'the-new-password' }, token);
    expect(slowed.status).toBe(429);
  });

  it('slows down guesses of the current password sent at once', async () => {
    const s = server();
    const token = await setUp(s);
    const guess = { current: 'wrong-password', password: 'the-new-password' };
    expect(await atOnce(() => s.call('POST', '/api/password', guess, token))).toEqual({ 400: 3, 429: 17 });
  });

  it('refuses a body that is not a JSON object', async () => {
    const s = server();
    const token = await setUp(s);
    const response = await s.call('POST', '/api/password', '[]', token);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'body: must be a JSON object' });
  });

  it('needs a session', async () => {
    const s = server();
    await setUp(s);
    const response = await s.call('POST', '/api/password', { current: ADMIN.password, password: 'the-new-password' });
    expect(response.status).toBe(401);
  });
});

describe('CORS', () => {
  it('sends no CORS header, not even to a preflight', async () => {
    const s = server();
    const responses = [
      await createApp({ version: '1', db: s.db, log: ignore, address: () => '192.0.2.1' }).request('/api/session', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      }),
      await createApp({ version: '1', db: s.db, log: ignore, address: () => '192.0.2.1' }).request('/api/health', {
        headers: { origin: 'https://evil.example' },
      }),
    ];
    for (const response of responses) {
      expect([...response.headers.keys()].filter((key) => key.startsWith('access-control-'))).toEqual([]);
    }
  });
});

describe('secrets', () => {
  it('never appear in a log line or a response, except the setup code in its one line', async () => {
    const s = server();
    const code = s.code;
    const first = await setUp(s);
    await signIn(s, 'Ann', 'a-wrong-password');
    const second = await tokenOf(await signIn(s, 'Ann', ADMIN.password));
    await s.call('POST', '/api/password', { current: 'another-wrong-one', password: 'the-new-password' }, second);
    await s.call('POST', '/api/password', { current: ADMIN.password, password: 'the-new-password' }, second);
    await s.call('POST', '/api/setup', { code, name: 'Bob', password: 'bob-password-1' });
    await s.call('DELETE', '/api/session', undefined, second);
    await s.call('GET', '/api/session', undefined, first);
    const secrets = [
      ADMIN.password,
      'a-wrong-password',
      'another-wrong-one',
      'the-new-password',
      'bob-password-1',
      first,
      second,
    ];
    const logs = s.lines.join('\n');
    for (const secret of secrets) {
      expect(logs).not.toContain(secret);
      expect(s.bodies.filter((body) => body.includes(secret)).length).toBe(secret === first || secret === second ? 1 : 0);
    }
    expect(s.lines.filter((line) => line.includes(code))).toHaveLength(1);
    expect(s.bodies.join('\n')).not.toContain(code);
    const stored = JSON.stringify([s.db.all('select * from users'), s.db.all('select * from sessions')]);
    for (const secret of secrets) expect(stored).not.toContain(secret);
  });

  it('are not in the answer or the log line of an internal error', async () => {
    const s = server();
    await setUp(s);
    s.db.close();
    const response = await signIn(s, 'Ann', ADMIN.password);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
    expect(s.lines.at(-1)).toBe('request failed: POST /api/session: TypeError');
    expect(s.lines.join('\n')).not.toContain(ADMIN.password);
  });
});
