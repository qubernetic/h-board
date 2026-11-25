import { CommandError, MAX_FILE } from '@h-board/core';
import type { State } from '@h-board/store';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Accounts } from './accounts';
import type { Added, Session, SignedIn, User } from './accounts';
import type { Database } from './db';
import { migrate } from './db';
import { Libraries } from './library';
import type { SqliteStore } from './library';
import { Problems, accountName, newPassword, secret, setupCode, typedName } from './fields';
import type { Body } from './fields';
import { Throttle } from './throttle';

export interface AppOptions {
  /** The server's version, shown by the health route. */
  readonly version: string;
  /** The database; it is migrated to the newest schema when the app is made. */
  readonly db: Database;
  /** Where the server's log lines go. A secret never goes here, except the setup code's one line. */
  readonly log: (line: string) => void;
  /** The clock, in milliseconds. */
  readonly now?: () => number;
  /** The caller's address, the second key of the slow-down after the name. */
  readonly address: (c: Context) => string;
  /** How a new password is hashed; only tests change it. */
  readonly hashPassword?: (password: string) => Promise<string>;
  /** How many keys each slow-down holds; only tests change it. */
  readonly limits?: ThrottleLimits;
}

/**
 * The key limits of the three slow-downs, kept apart so one cannot fill another: setup by address,
 * sign-in and password change by name and by address.
 */
export interface ThrottleLimits {
  readonly setup: number;
  readonly names: number;
  readonly addresses: number;
}

const LIMITS: ThrottleLimits = { setup: 10_000, names: 100_000, addresses: 10_000 };

/** One attempt's key in each slow-down it counts under. */
type Guard = readonly (readonly [Throttle, string])[];

/** Begins an attempt under every key of `guard`: the wait, or 0 when all of them let it through. */
function begin(guard: Guard, now: number): number {
  const ms = Math.max(...guard.map(([throttle, key]) => throttle.wait([key], now)));
  if (ms > 0) return ms;
  for (const [index, [throttle, key]] of guard.entries()) {
    const refused = throttle.begin([key], now);
    if (refused > 0) {
      end(guard.slice(0, index), now, true);
      return refused;
    }
  }
  return 0;
}

function end(guard: Guard, now: number, ok: boolean): void {
  for (const [throttle, key] of guard) throttle.end([key], now, ok);
}

/** The largest request body, in bytes. */
const MAX_BODY = 16384;

/**
 * The largest body of a command: room for the largest library file `library.import` reads, even
 * when JSON escapes every character of it to two bytes.
 */
const MAX_COMMAND_BODY = 2 * MAX_FILE + MAX_BODY;

interface Env {
  Variables: { session: Session };
}

function wait(c: Context, ms: number): Response {
  const seconds = Math.ceil(ms / 1000);
  c.header('Retry-After', String(seconds));
  return c.json({ error: `too many failed attempts; try again in ${seconds} seconds` }, 429);
}

/**
 * The request's JSON object, or the answer that refuses it. Only `application/json` is read, so a
 * cross-site form or `text/plain` post never reaches a check or the slow-down.
 */
async function bodyOf(c: Context): Promise<Body | Response> {
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') return c.json({ error: 'body: must be application/json' }, 415);
  const value: unknown = await c.req.json().catch(() => undefined);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Body;
  return c.json({ error: 'body: must be a JSON object' }, 400);
}

/** The status of each way a command refuses; every other error is the server's own. */
const REFUSED: Partial<Record<CommandError['code'], 400 | 403 | 404>> = { unknown: 400, invalid: 400, refused: 403, missing: 404 };

/** The answer to a command that refused: its message, which names the field. */
function refused(c: Context, error: unknown): Response {
  const status = error instanceof CommandError ? REFUSED[error.code] : undefined;
  if (!(error instanceof CommandError) || status === undefined) throw error;
  return c.json({ error: error.code === 'unknown' ? 'id: is not a command' : error.message }, status);
}

/** A user as the API shows them. */
function shown(user: User): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    admin: user.admin,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

function signedIn(c: Context, result: SignedIn, status: 200 | 201): Response {
  return c.json({ token: result.token, user: shown(result.user) }, status);
}

/** A user an admin added or reset, with the temporary password; the one answer that shows it. */
function added(c: Context, result: Added, status: 200 | 201): Response {
  return c.json({ user: shown(result.user), password: result.password }, status);
}

/**
 * The HTTP application. Everything the server answers lives under `/api`. Callers sign in with a
 * bearer token; there are no cookies and no CORS headers.
 */
export function createApp(options: AppOptions): Hono<Env> {
  const { db, log, address } = options;
  const now = options.now ?? Date.now;
  migrate(db);
  const accounts = new Accounts(db, options.hashPassword);
  const libraries = new Libraries(db, { now });
  const limits = options.limits ?? LIMITS;
  const setups = new Throttle({ limit: limits.setup });
  const names = new Throttle({ limit: limits.names });
  const addresses = new Throttle({ limit: limits.addresses });
  if (!accounts.hasUsers()) {
    log(`setup code: ${accounts.newSetupCode()} (it makes the first account, an admin, and works once)`);
  }

  const app = new Hono<Env>();
  app.onError((error, c) => {
    log(`request failed: ${c.req.method} ${c.req.path}: ${error.name}`);
    return c.json({ error: 'internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  const limit = (maxSize: number): MiddlewareHandler =>
    bodyLimit({ maxSize, onError: (c) => c.json({ error: `body: must be at most ${maxSize} bytes` }, 413) });
  const bodies = limit(MAX_BODY);
  const commandBodies = limit(MAX_COMMAND_BODY);
  app.use('/api/*', (c, next) => (c.req.path.startsWith('/api/commands/') ? commandBodies : bodies)(c, next));

  type Middleware = (c: Context<Env>, next: () => Promise<void>) => Promise<Response | undefined>;

  /**
   * Lets a signed-in caller through. The session of a temporary password reaches only the routes
   * made with `temporary`: its own session and the password change.
   */
  const signedInAs =
    (temporary: boolean): Middleware =>
    async (c, next) => {
      const match = /^Bearer ([\w-]+)$/i.exec(c.req.header('authorization') ?? '');
      const session = match?.[1] === undefined ? undefined : accounts.session(match[1], now());
      if (session === undefined) {
        c.header('WWW-Authenticate', 'Bearer');
        return c.json({ error: 'sign in first' }, 401);
      }
      if (session.user.mustChangePassword && !temporary) {
        return c.json({ error: 'password: is temporary; change it first' }, 403);
      }
      c.set('session', session);
      await next();
      return undefined;
    };
  const signedInOnly = signedInAs(false);
  const temporaryToo = signedInAs(true);

  const adminOnly: Middleware = async (c, next) => {
    if (!c.get('session').user.admin) return c.json({ error: 'only an admin manages users' }, 403);
    await next();
    return undefined;
  };

  /** The user of the path's `:id`, other than the caller, or the answer that refuses it. */
  const otherUser = (c: Context<Env>): User | Response => {
    const id = String(c.req.param('id'));
    const user = /^[1-9]\d{0,14}$/.test(id) ? accounts.user(Number(id)) : undefined;
    if (user === undefined) return c.json({ error: 'id: no such user' }, 404);
    if (user.id === c.get('session').user.id) {
      return c.json({ error: 'id: is your own account; change your password instead' }, 409);
    }
    return user;
  };

  const invalid = (c: Context, problems: Problems): Response => c.json({ error: problems.message }, 400);

  app.get('/api/health', (c) => c.json({ ok: true, version: options.version }));

  app.get('/api/setup', (c) => c.json({ needed: !accounts.hasUsers() }));

  app.post('/api/setup', async (c) => {
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const problems = new Problems();
    const code = setupCode(body, 'code', problems);
    const name = accountName(body, 'name', problems);
    const password = newPassword(body, 'password', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    const guard: Guard = [[setups, address(c)]];
    const ms = begin(guard, now());
    if (ms > 0) return wait(c, ms);
    let result: SignedIn | undefined;
    try {
      result = await accounts.setup(code, name, password, now());
    } finally {
      end(guard, now(), result !== undefined);
    }
    if (result === undefined) return c.json({ error: 'code: is wrong or already used' }, 403);
    log('setup done: the first account is made');
    return signedIn(c, result, 201);
  });

  app.post('/api/session', async (c) => {
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const problems = new Problems();
    const name = typedName(body, 'name', problems);
    const password = secret(body, 'password', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    const nameKey = name.toLowerCase();
    const guard: Guard = [
      [names, nameKey],
      [addresses, address(c)],
    ];
    const ms = begin(guard, now());
    if (ms > 0) return wait(c, ms);
    let result: SignedIn | undefined;
    try {
      result = await accounts.signIn(name, password, now());
    } finally {
      end(guard, now(), result !== undefined);
    }
    if (result === undefined) return c.json({ error: 'the name or the password is wrong' }, 401);
    names.clear(nameKey);
    return signedIn(c, result, 200);
  });

  app.get('/api/session', temporaryToo, (c) => c.json({ user: shown(c.get('session').user) }));

  app.delete('/api/session', temporaryToo, (c) => {
    accounts.signOut(c.get('session').id);
    return c.body(null, 204);
  });

  app.post('/api/password', temporaryToo, async (c) => {
    const session = c.get('session');
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const problems = new Problems();
    const current = secret(body, 'current', problems);
    const password = newPassword(body, 'password', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    // The admin has seen a temporary password, so it may not stay as the user's own.
    if (session.user.mustChangePassword && password === current) {
      return c.json({ error: 'password: must differ from the temporary one' }, 400);
    }
    const guard: Guard = [
      [names, session.user.name.toLowerCase()],
      [addresses, address(c)],
    ];
    const ms = begin(guard, now());
    if (ms > 0) return wait(c, ms);
    let right = false;
    try {
      right = await accounts.isPassword(session.user.id, current);
    } finally {
      end(guard, now(), right);
    }
    if (!right) return c.json({ error: 'current: is not the password of this account' }, 400);
    if (!(await accounts.changePassword(session, password))) return c.json({ error: 'sign in first' }, 401);
    return c.body(null, 204);
  });

  app.get('/api/users', signedInOnly, adminOnly, (c) => c.json({ users: accounts.users().map(shown) }));

  app.post('/api/users', signedInOnly, adminOnly, async (c) => {
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const problems = new Problems();
    const name = accountName(body, 'name', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    const result = await accounts.addUser(name, now());
    if (result === undefined) return c.json({ error: 'name: is taken' }, 409);
    return added(c, result, 201);
  });

  app.post('/api/users/:id/password', signedInOnly, adminOnly, async (c) => {
    const user = otherUser(c);
    if (user instanceof Response) return user;
    const result = await accounts.resetPassword(user.id);
    if (result === undefined) return c.json({ error: 'id: no such user' }, 404);
    return added(c, result, 200);
  });

  app.delete('/api/users/:id', signedInOnly, adminOnly, (c) => {
    const user = otherUser(c);
    if (user instanceof Response) return user;
    accounts.removeUser(user.id);
    libraries.forget(user.id);
    return c.body(null, 204);
  });

  /** The caller's own store; a route never names a user, so no one reaches another's library. */
  const own = (c: Context<Env>): SqliteStore => libraries.of(c.get('session').user.id);

  app.get('/api/library', signedInOnly, async (c) => c.json(await own(c).load()));

  app.post('/api/commands/:id', signedInOnly, async (c) => {
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const alone = body['alone'] ?? false;
    if (typeof alone !== 'boolean') return c.json({ error: 'alone: must be true or false' }, 400);
    try {
      const outcome = await own(c).apply(String(c.req.param('id')),body['params'], { alone });
      return c.json({ value: outcome.value, library: outcome.library });
    } catch (error) {
      return refused(c, error);
    }
  });

  /** The library after an undo, redo or restore; 204 when there was nothing to change. */
  const stepped = (c: Context, state: State | undefined): Response => (state === undefined ? c.body(null, 204) : c.json(state));

  app.post('/api/undo', signedInOnly, async (c) => stepped(c, await own(c).undo()));

  app.post('/api/redo', signedInOnly, async (c) => stepped(c, await own(c).redo()));

  app.post('/api/restore/:id', signedInOnly, async (c) => {
    const id = String(c.req.param('id'));
    if (!/^[1-9]\d{0,14}$/.test(id)) return c.json({ error: 'id: no such snapshot' }, 404);
    try {
      return stepped(c, await own(c).restore(Number(id)));
    } catch (error) {
      return refused(c, error);
    }
  });

  return app;
}
