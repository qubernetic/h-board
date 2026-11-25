import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Accounts } from './accounts';
import type { Session, SignedIn } from './accounts';
import type { Database } from './db';
import { migrate } from './db';
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
}

/** The largest request body, in bytes. */
const MAX_BODY = 16384;

interface Env {
  Variables: { session: Session };
}

function wait(c: Context, ms: number): Response {
  const seconds = Math.ceil(ms / 1000);
  c.header('Retry-After', String(seconds));
  return c.json({ error: `too many failed attempts; try again in ${seconds} seconds` }, 429);
}

async function bodyOf(c: Context): Promise<Body | undefined> {
  const value: unknown = await c.req.json().catch(() => undefined);
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Body) : undefined;
}

function signedIn(c: Context, result: SignedIn, status: 200 | 201): Response {
  return c.json({ token: result.token, user: { name: result.user.name, admin: result.user.admin } }, status);
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
  const throttle = new Throttle();
  if (!accounts.hasUsers()) {
    log(`setup code: ${accounts.newSetupCode()} (it makes the first account, an admin, and works once)`);
  }

  const app = new Hono<Env>();
  app.onError((error, c) => {
    log(`request failed: ${c.req.method} ${c.req.path}: ${error.name}`);
    return c.json({ error: 'internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.use(
    '/api/*',
    bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: `body: must be at most ${MAX_BODY} bytes` }, 413) }),
  );

  const signedInOnly = async (c: Context<Env>, next: () => Promise<void>): Promise<Response | undefined> => {
    const match = /^Bearer ([\w-]+)$/i.exec(c.req.header('authorization') ?? '');
    const session = match?.[1] === undefined ? undefined : accounts.session(match[1], now());
    if (session === undefined) {
      c.header('WWW-Authenticate', 'Bearer');
      return c.json({ error: 'sign in first' }, 401);
    }
    c.set('session', session);
    await next();
    return undefined;
  };

  const notAnObject = (c: Context): Response => c.json({ error: 'body: must be a JSON object' }, 400);
  const invalid = (c: Context, problems: Problems): Response => c.json({ error: problems.message }, 400);

  app.get('/api/health', (c) => c.json({ ok: true, version: options.version }));

  app.get('/api/setup', (c) => c.json({ needed: !accounts.hasUsers() }));

  app.post('/api/setup', async (c) => {
    const body = await bodyOf(c);
    if (body === undefined) return notAnObject(c);
    const problems = new Problems();
    const code = setupCode(body, 'code', problems);
    const name = accountName(body, 'name', problems);
    const password = newPassword(body, 'password', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    const keys = [`address:${address(c)}`];
    const ms = throttle.begin(keys, now());
    if (ms > 0) return wait(c, ms);
    let result: SignedIn | undefined;
    try {
      result = await accounts.setup(code, name, password, now());
    } finally {
      throttle.end(keys, now(), result !== undefined);
    }
    if (result === undefined) return c.json({ error: 'code: is wrong or already used' }, 403);
    log('setup done: the first account is made');
    return signedIn(c, result, 201);
  });

  app.post('/api/session', async (c) => {
    const body = await bodyOf(c);
    if (body === undefined) return notAnObject(c);
    const problems = new Problems();
    const name = typedName(body, 'name', problems);
    const password = secret(body, 'password', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    const nameKey = `name:${name.toLowerCase()}`;
    const keys = [nameKey, `address:${address(c)}`];
    const ms = throttle.begin(keys, now());
    if (ms > 0) return wait(c, ms);
    let result: SignedIn | undefined;
    try {
      result = await accounts.signIn(name, password, now());
    } finally {
      throttle.end(keys, now(), result !== undefined);
    }
    if (result === undefined) return c.json({ error: 'the name or the password is wrong' }, 401);
    throttle.clear(nameKey);
    return signedIn(c, result, 200);
  });

  app.get('/api/session', signedInOnly, (c) => {
    const { user } = c.get('session');
    return c.json({ user: { name: user.name, admin: user.admin } });
  });

  app.delete('/api/session', signedInOnly, (c) => {
    accounts.signOut(c.get('session').id);
    return c.body(null, 204);
  });

  app.post('/api/password', signedInOnly, async (c) => {
    const session = c.get('session');
    const body = await bodyOf(c);
    if (body === undefined) return notAnObject(c);
    const problems = new Problems();
    const current = secret(body, 'current', problems);
    const password = newPassword(body, 'password', problems);
    if (problems.list.length > 0) return invalid(c, problems);
    const keys = [`name:${session.user.name.toLowerCase()}`, `address:${address(c)}`];
    const ms = throttle.begin(keys, now());
    if (ms > 0) return wait(c, ms);
    let right = false;
    try {
      right = await accounts.isPassword(session.user.id, current);
    } finally {
      throttle.end(keys, now(), right);
    }
    if (!right) return c.json({ error: 'current: is not the password of this account' }, 400);
    await accounts.changePassword(session, password);
    return c.body(null, 204);
  });

  return app;
}
