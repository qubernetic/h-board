import { expect } from 'vitest';
import { createApp, openDatabase } from '../src/index';
import type { Database, ThrottleLimits } from '../src/index';
import { hashPassword } from '../src/secrets';

export const ADMIN = { name: 'Ann', password: 'ann-password-1' };

export function ignore(): void {
  // a log nobody reads
}

export interface Server {
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
export function server(limits?: ThrottleLimits, db: Database = openDatabase(':memory:')): Server {
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
        ...(limits === undefined ? {} : { limits }),
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

/** Makes the admin with the setup code and answers their token. */
export async function setUp(s: Server): Promise<string> {
  const response = await s.call('POST', '/api/setup', { code: s.code, ...ADMIN });
  expect(response.status).toBe(201);
  return ((await response.json()) as { token: string }).token;
}

export async function signIn(s: Server, name: string, password: string): Promise<Response> {
  return s.call('POST', '/api/session', { name, password });
}

export async function tokenOf(response: Response): Promise<string> {
  return ((await response.json()) as { token: string }).token;
}

/** Has the admin add `name`, who signs in with the temporary password and sets their own: their id and token. */
export async function userOf(s: Server, admin: string, name: string): Promise<{ id: number; token: string }> {
  const added = await s.call('POST', '/api/users', { name }, admin);
  expect(added.status).toBe(201);
  const { user, password } = (await added.json()) as { user: { id: number }; password: string };
  const token = await tokenOf(await signIn(s, name, password));
  const changed = await s.call('POST', '/api/password', { current: password, password: `${name}-password-1` }, token);
  expect(changed.status).toBe(204);
  return { id: user.id, token };
}

/** Sends 20 attempts at once and counts the answers by status; every 429 must say how long to wait. */
export async function atOnce(attempt: () => Promise<Response>): Promise<Record<number, number>> {
  const responses = await Promise.all(Array.from({ length: 20 }, attempt));
  const counts: Record<number, number> = {};
  for (const response of responses) {
    counts[response.status] = (counts[response.status] ?? 0) + 1;
    if (response.status === 429) expect(response.headers.get('retry-after')).toMatch(/^\d+$/);
  }
  return counts;
}
