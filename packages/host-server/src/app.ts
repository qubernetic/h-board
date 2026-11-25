import { CommandError, MAX_FILE, createCommands } from '@h-board/core';
import type { CommandRegistry } from '@h-board/core';
import type { By, State } from '@h-board/store';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Accounts } from './accounts';
import type { Added, Session, SignedIn, User } from './accounts';
import type { Database } from './db';
import { migrate } from './db';
import { Events } from './events';
import { Keys, MAX_KEYS, isScope, outcomeOf, refusal } from './keys';
import type { AgentKey, KeyUse, Need } from './keys';
import { Libraries, UserRemoved } from './library';
import { Mcp } from './mcp';
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
  /** Milliseconds between two heartbeat lines of an event stream; only tests change it. */
  readonly heartbeat?: number;
  /** How many event streams one user may keep open; only tests change it. */
  readonly streams?: number;
  /** How many bytes an event stream may hold for a caller who does not read them; only tests change it. */
  readonly queue?: number;
  /** The commands a library runs; every library command of core when left out. Only tests change it. */
  readonly commands?: CommandRegistry;
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
  /** A library route's caller has either a session or, as an agent, a key. */
  Variables: { session: Session; token: string; agent: KeyUse | undefined };
}

function signInFirst(c: Context): Response {
  c.header('WWW-Authenticate', 'Bearer');
  return c.json({ error: 'sign in first' }, 401);
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

/** The answer to a key that may not do what it asks, for each reason. */
const NOT_ALLOWED: Record<'read-only' | 'needs-owner' | 'never', string> = {
  'read-only': 'scope: a read key only reads',
  'needs-owner': 'scope: needs a key with the owner scope',
  never: 'id: no agent key may run it',
};

const USER_BY: By = { kind: 'user' };

/** A key as the API shows it. */
function shownKey(key: AgentKey): Record<string, unknown> {
  return { id: key.id, name: key.name, scope: key.scope, createdAt: key.createdAt, usedAt: key.usedAt };
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
  const commands = options.commands ?? createCommands();
  const libraries = new Libraries(db, { now, commands });
  const keys = new Keys(db);
  const streams = options.streams ?? 32;
  const events = new Events({ heartbeat: options.heartbeat ?? 15_000, streams, queue: options.queue ?? 65_536 });
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
  // A command's larger limit comes on its route after the sign-in, so no one is read further than
  // 16 KB before the token is checked.
  const commandBodies = limit(MAX_COMMAND_BODY);
  app.use('/api/*', async (c, next) => (c.req.path.startsWith('/api/commands/') ? next() : bodies(c, next)));

  type Middleware = (c: Context<Env>, next: () => Promise<void>) => Promise<Response | undefined>;

  /**
   * Lets a signed-in caller through. The session of a temporary password reaches only the routes
   * made with `temporary`: its own session and the password change.
   */
  const signedInAs =
    (temporary: boolean): Middleware =>
    async (c, next) => {
      const token = /^Bearer ([\w-]+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
      const session = token === undefined ? undefined : accounts.session(token, now());
      if (token === undefined || session === undefined) return signInFirst(c);
      if (session.user.mustChangePassword && !temporary) {
        return c.json({ error: 'password: is temporary; change it first' }, 403);
      }
      c.set('session', session);
      c.set('token', token);
      await next();
      return undefined;
    };
  const signedInOnly = signedInAs(false);
  const temporaryToo = signedInAs(true);

  /**
   * Lets a signed-in caller or an agent key through, on the library routes only. What a key may do
   * there is checked by `mine`, which also logs every use of it.
   */
  const signedInOrKey: Middleware = async (c, next) => {
    const token = /^Bearer ([\w-]+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    const agent = token === undefined || accounts.session(token, now()) !== undefined ? undefined : keys.use(token, now());
    if (agent === undefined) return signedInOnly(c, next);
    c.set('agent', agent);
    c.set('token', String(token));
    await next();
    return undefined;
  };

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
    events.recheck();
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
    events.recheck();
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
    events.recheck();
    return added(c, result, 200);
  });

  app.delete('/api/users/:id', signedInOnly, adminOnly, (c) => {
    const user = otherUser(c);
    if (user instanceof Response) return user;
    accounts.removeUser(user.id);
    libraries.forget(user.id);
    events.recheck();
    return c.body(null, 204);
  });

  /**
   * The answer that refuses what a key asks, noted in its log; undefined when the key may do it.
   * `command` is what the log notes of the use (null for an id that is no command) and `need` what
   * the key's scope must allow.
   */
  const keyRefused = (c: Context<Env>, use: KeyUse, command: string | null, need: Need): Response | undefined => {
    const why = use.user.mustChangePassword ? 'temporary-password' : command === null ? 'unknown' : refusal(use.key.scope, need);
    if (why === undefined) return undefined;
    keys.note(use, command, why, now());
    if (why === 'temporary-password') return c.json({ error: 'password: is temporary; change it first' }, 403);
    if (why === 'unknown') return c.json({ error: 'id: is not a command' }, 400);
    return c.json({ error: NOT_ALLOWED[why] }, 403);
  };

  /**
   * Runs `work` on the caller's own store, for the user or for an agent by its key; a route never
   * names a user, so no one reaches another's library. The session or the key is checked again
   * first, since a command's body may have taken a while to come in, and the key may have been
   * revoked, or the user removed and the id given to a new user, meanwhile; the store itself
   * refuses a removed user too. For a key, `command` and `need` are as for `keyRefused`.
   */
  const mine = async (
    c: Context<Env>,
    command: string | null,
    need: Need,
    work: (store: SqliteStore, by: By) => Promise<Response>,
  ): Promise<Response> => {
    const agent = c.get('agent');
    if (agent === undefined) {
      const session = accounts.session(c.get('token'), now());
      if (session?.id !== c.get('session').id) return signInFirst(c);
      try {
        return await work(libraries.of(session.user), USER_BY);
      } catch (error) {
        return error instanceof UserRemoved ? signInFirst(c) : refused(c, error);
      }
    }
    const use = keys.stands(c.get('token'), agent.key.id);
    if (use === undefined) return signInFirst(c);
    const refusedKey = keyRefused(c, use, command, need);
    if (refusedKey !== undefined) return refusedKey;
    const by: By = { kind: 'agent', key: use.key.name, ownerScope: use.key.scope === 'owner' };
    try {
      const response = await work(libraries.of(use.user), by);
      keys.note(use, command, response.status === 204 ? 'unchanged' : 'done', now());
      return response;
    } catch (error) {
      keys.note(use, command, outcomeOf(error), now());
      return error instanceof UserRemoved ? signInFirst(c) : refused(c, error);
    }
  };

  app.get('/api/library', signedInOrKey, (c) => mine(c, 'library.read', 'read', async (store) => c.json(await store.load())));

  /** The command of the path's `:id` as a key's log notes it, and what the key's scope must allow. */
  const commandOf = (c: Context): [string | null, Need] => {
    const id = String(c.req.param('id'));
    const agentClass = commands.agentClassOf(id);
    return agentClass === undefined ? [null, 'never'] : [id, agentClass];
  };

  // A key that may not run the command is refused before its body is read, so only a command the
  // key may run gets the larger limit.
  const keyMayRun: Middleware = async (c, next) => {
    const agent = c.get('agent');
    const refusedKey = agent === undefined ? undefined : keyRefused(c, agent, ...commandOf(c));
    if (refusedKey !== undefined) return refusedKey;
    await next();
    return undefined;
  };

  app.post('/api/commands/:id', signedInOrKey, keyMayRun, commandBodies, async (c) => {
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const alone = body['alone'] ?? false;
    if (typeof alone !== 'boolean') return c.json({ error: 'alone: must be true or false' }, 400);
    const id = String(c.req.param('id'));
    return mine(c, ...commandOf(c), async (store, by) => {
      const outcome = await store.apply(id, body['params'], { alone, by });
      return c.json({ value: outcome.value, library: outcome.library });
    });
  });

  /** The library after an undo, redo or restore; 204 when there was nothing to change. */
  const stepped = (c: Context, state: State | undefined): Response => (state === undefined ? c.body(null, 204) : c.json(state));

  // An undo, a redo or a restore may take back the user's own changes, so a key needs the owner scope.
  app.post('/api/undo', signedInOrKey, (c) =>
    mine(c, 'history.undo', 'owner', async (store, by) => stepped(c, await store.undo({ by }))),
  );

  app.post('/api/redo', signedInOrKey, (c) =>
    mine(c, 'history.redo', 'owner', async (store, by) => stepped(c, await store.redo({ by }))),
  );

  app.post('/api/restore/:id', signedInOrKey, (c) => {
    const id = String(c.req.param('id'));
    return mine(c, 'history.restore', 'owner', async (store, by) => {
      if (!/^[1-9]\d{0,14}$/.test(id)) throw new CommandError('missing', 'id: no such snapshot');
      return stepped(c, await store.restore(Number(id), { by }));
    });
  });

  app.get('/api/keys', signedInOnly, (c) => c.json({ keys: keys.list(c.get('session').user.id).map(shownKey) }));

  /** Makes a key; the one answer that shows it. */
  app.post('/api/keys', signedInOnly, async (c) => {
    const body = await bodyOf(c);
    if (body instanceof Response) return body;
    const problems = new Problems();
    const name = accountName(body, 'name', problems);
    const scope = body['scope'];
    if (!isScope(scope)) problems.add('scope', 'must be read, edit or owner');
    if (!isScope(scope) || problems.list.length > 0) return invalid(c, problems);
    const made = keys.make(c.get('session').user.id, name, scope, now());
    if (made === 'taken') return c.json({ error: 'name: is taken' }, 409);
    if (made === 'full') return c.json({ error: `name: at most ${MAX_KEYS} keys; revoke one first` }, 409);
    return c.json({ key: shownKey(made.key), secret: made.secret }, 201);
  });

  app.delete('/api/keys/:id', signedInOnly, (c) => {
    const id = String(c.req.param('id'));
    const revoked = /^[1-9]\d{0,14}$/.test(id) && keys.revoke(c.get('session').user.id, Number(id));
    return revoked ? c.body(null, 204) : c.json({ error: 'id: no such key' }, 404);
  });

  /** The newest uses of the caller's keys: the time, the key, its scope, the command and the outcome. */
  app.get('/api/keys/log', signedInOnly, (c) => c.json({ entries: keys.log(c.get('session').user.id) }));

  /**
   * Server-sent events of the caller's library: a `change` event with the snapshot id and its
   * source after every change, a heartbeat line, and an `end` event once the session is revoked.
   */
  app.get('/api/events', signedInOnly, (c) => {
    const headers = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' };
    // Hono answers HEAD through this route and drops the body unread, so a stream would never end.
    if (c.req.method === 'HEAD') return new Response(null, { headers });
    const session = c.get('session');
    const token = c.get('token');
    const stream = events.open(
      { user: session.user.id, store: libraries.of(session.user), live: () => accounts.stands(token, session.id) },
      c.req.raw.signal,
    );
    if (stream === undefined) return c.json({ error: `too many event streams; at most ${streams} for each user` }, 429);
    return new Response(stream, { headers });
  });

  const mcp = new Mcp({ keys, libraries, commands, version: options.version, now });

  /**
   * Lets an agent key through, and nothing else: `/mcp` is for agents. A browser names the page
   * that calls in `Origin`, and no web page may call it.
   */
  const keyOnly: Middleware = async (c, next) => {
    if (c.req.header('origin') !== undefined) return c.json({ error: 'origin: a web page may not call /mcp' }, 403);
    const token = /^Bearer ([\w-]+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    const agent = token === undefined ? undefined : keys.use(token, now());
    if (agent === undefined) return signInFirst(c);
    c.set('agent', agent);
    c.set('token', String(token));
    await next();
    return undefined;
  };

  // A read key only reads, so it is read no further than 16 KB; another may send a library file.
  const mcpBodies: MiddlewareHandler<Env> = (c, next) => (c.get('agent')?.key.scope === 'read' ? bodies : commandBodies)(c, next);

  /** MCP over Streamable HTTP: one JSON-RPC message a request, answered with one JSON body. */
  app.post('/mcp', keyOnly, mcpBodies, async (c) => {
    const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json') return c.json({ error: 'body: must be application/json' }, 415);
    const reply = await mcp.answer(await c.req.text(), c.get('token'), c.get('agent') as KeyUse, c.req.header('mcp-protocol-version'));
    if (reply.status === 401) return signInFirst(c);
    return reply.status === 202 ? c.body(null, 202) : c.json(reply.body, reply.status);
  });

  // No event stream to open and no session to end: the server keeps no MCP session.
  app.all('/mcp', (c) => {
    c.header('Allow', 'POST');
    return c.json({ error: 'method: /mcp answers POST only' }, 405);
  });

  return app;
}
