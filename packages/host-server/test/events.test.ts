import { afterEach, describe, expect, it } from 'vitest';
import { server, setUp, userOf } from './support';
import type { Extra, Server } from './support';

/** One event of a stream: its name and its data, read as JSON. */
interface Message {
  readonly event: string;
  readonly data: unknown;
}

/** Reads an event stream one event at a time, and every heartbeat line as it comes. */
class Listener {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly #decoder = new TextDecoder();
  #text = '';
  #pending: ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']> | undefined;
  heartbeats = 0;

  constructor(response: Response) {
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    if (response.body === null) throw new Error('an event stream has a body');
    this.#reader = response.body.getReader();
    open.push(this);
  }

  /** The next event; `undefined` when the stream has ended, `'quiet'` when nothing came within `ms`. */
  async next(ms = 1000): Promise<Message | 'quiet' | undefined> {
    for (;;) {
      const end = this.#text.indexOf('\n\n');
      if (end >= 0) {
        const block = this.#text.slice(0, end);
        this.#text = this.#text.slice(end + 2);
        if (block.startsWith(':')) {
          this.heartbeats += 1;
          continue;
        }
        const event = /^event: (.+)$/m.exec(block)?.[1] ?? '';
        const data = /^data: (.+)$/m.exec(block)?.[1] ?? 'null';
        return { event, data: JSON.parse(data) as unknown };
      }
      this.#pending ??= this.#reader.read();
      const quiet = new Promise<'quiet'>((resolve) => setTimeout(() => resolve('quiet'), ms));
      const read = await Promise.race([this.#pending, quiet]);
      if (read === 'quiet') return 'quiet';
      this.#pending = undefined;
      if (read.done) return undefined;
      this.#text += this.#decoder.decode(read.value, { stream: true });
    }
  }

  cancel(): Promise<void> {
    return this.#reader.cancel();
  }
}

const open: Listener[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((listener) => listener.cancel().catch(() => undefined)));
});

async function listen(s: Server, token: string): Promise<Listener> {
  return new Listener(await s.call('GET', '/api/events', undefined, token));
}

function run(s: Server, token: string, id: string, body: unknown = {}): Promise<Response> {
  return s.call('POST', `/api/commands/${id}`, body, token);
}

const USER = { kind: 'user' };
const ended = { event: 'end', data: { error: 'sign in first' } };

/** A server with Ann, the admin, and Bob, and their tokens. */
async function twoUsers(extra: Extra = {}): Promise<{ s: Server; ann: string; bob: string }> {
  const s = server(undefined, undefined, extra);
  const ann = await setUp(s);
  const { token: bob } = await userOf(s, ann, 'Bob');
  return { s, ann, bob };
}

describe('GET /api/events', () => {
  it('tells every stream of the user who changed the library, and no one else', async () => {
    const { s, ann, bob } = await twoUsers();
    // Bob's library is one snapshot ahead, so an event of Ann's would not pass for his.
    expect((await run(s, bob, 'group.add', { params: { name: 'Home' }, alone: true })).status).toBe(200);
    const first = await listen(s, ann);
    const second = await listen(s, ann);
    const third = await listen(s, bob);
    expect((await run(s, ann, 'group.add', { params: { name: 'Work' } })).status).toBe(200);
    const change = { event: 'change', data: { snapshot: 2, source: USER } };
    expect(await first.next()).toEqual(change);
    expect(await second.next()).toEqual(change);
    expect(await third.next(50)).toBe('quiet');
    expect((await run(s, bob, 'group.add', { params: { name: 'Play' }, alone: true })).status).toBe(200);
    expect(await third.next()).toEqual({ event: 'change', data: { snapshot: 3, source: USER } });
    expect(await first.next(50)).toBe('quiet');
  });

  it('tells of an undo, a redo and a restore with the snapshot each one adds', async () => {
    const { s, ann } = await twoUsers();
    const listener = await listen(s, ann);
    await run(s, ann, 'group.add', { params: { name: 'Work' } });
    expect((await listener.next()) as Message).toMatchObject({ data: { snapshot: 2 } });
    expect((await s.call('POST', '/api/undo', undefined, ann)).status).toBe(200);
    expect(await listener.next()).toEqual({ event: 'change', data: { snapshot: 3, source: USER } });
    expect((await s.call('POST', '/api/redo', undefined, ann)).status).toBe(200);
    expect(await listener.next()).toEqual({ event: 'change', data: { snapshot: 4, source: USER } });
    expect((await s.call('POST', '/api/restore/1', undefined, ann)).status).toBe(200);
    expect(await listener.next()).toEqual({ event: 'change', data: { snapshot: 5, source: USER } });
  });

  it('says nothing of a command that is refused', async () => {
    const { s, ann } = await twoUsers();
    const listener = await listen(s, ann);
    expect((await run(s, ann, 'group.rename', { params: {} })).status).toBe(400);
    expect(await listener.next(50)).toBe('quiet');
  });

  it('ends the stream of a session that signs out, and only that one', async () => {
    const { s, ann, bob } = await twoUsers();
    const mine = await listen(s, ann);
    const other = await listen(s, bob);
    expect((await s.call('DELETE', '/api/session', undefined, ann)).status).toBe(204);
    expect(await mine.next()).toEqual(ended);
    expect(await mine.next()).toBeUndefined();
    expect(await other.next(50)).toBe('quiet');
  });

  it('ends the other sessions of a user who changes the password', async () => {
    const s = server();
    const ann = await setUp(s);
    const { token: bob } = await userOf(s, ann, 'Bob');
    const other = await tokenFor(s, 'Bob', 'Bob-password-1');
    const kept = await listen(s, bob);
    const revoked = await listen(s, other);
    const changed = await s.call('POST', '/api/password', { current: 'Bob-password-1', password: 'Bob-password-2' }, bob);
    expect(changed.status).toBe(204);
    expect(await revoked.next()).toEqual(ended);
    expect(await kept.next(50)).toBe('quiet');
  });

  it('ends the streams of a user when the admin resets the password or removes the user', async () => {
    const s = server();
    const ann = await setUp(s);
    const bob = await userOf(s, ann, 'Bob');
    const carl = await userOf(s, ann, 'Carl');
    const bobs = await listen(s, bob.token);
    const carls = await listen(s, carl.token);
    expect((await s.call('POST', `/api/users/${bob.id}/password`, undefined, ann)).status).toBe(200);
    expect(await bobs.next()).toEqual(ended);
    expect(await carls.next(50)).toBe('quiet');
    expect((await s.call('DELETE', `/api/users/${carl.id}`, undefined, ann)).status).toBe(204);
    expect(await carls.next()).toEqual(ended);
  });

  it('sends a heartbeat line and ends at the next one once the session is gone', async () => {
    const { s, ann } = await twoUsers({ heartbeat: 10 });
    const listener = await listen(s, ann);
    await new Promise((resolve) => setTimeout(resolve, 50));
    s.db.run('delete from sessions');
    expect(await listener.next()).toEqual(ended);
    expect(listener.heartbeats).toBeGreaterThan(0);
    expect(await listener.next()).toBeUndefined();
  });

  it('stops listening when the caller goes away', async () => {
    const { s, ann } = await twoUsers({ streams: 1 });
    const first = await listen(s, ann);
    await first.cancel();
    const second = await listen(s, ann);
    await run(s, ann, 'group.add', { params: { name: 'Work' } });
    expect((await second.next()) as Message).toMatchObject({ event: 'change' });
  });

  it('stops listening when the request is aborted', async () => {
    const { s, ann } = await twoUsers({ streams: 1 });
    const controller = new AbortController();
    const aborted = await s.send('/api/events', { headers: { authorization: `Bearer ${ann}` }, signal: controller.signal });
    expect(aborted.status).toBe(200);
    controller.abort();
    // A caller that goes away may also cancel the stream; that stops nothing twice.
    await aborted.body?.cancel();
    await listen(s, ann);
  });

  it('answers a HEAD request with the headers alone, and opens no stream for it', async () => {
    const { s, ann } = await twoUsers({ streams: 1 });
    const head = await s.send('/api/events', { method: 'HEAD', headers: { authorization: `Bearer ${ann}` } });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('text/event-stream');
    expect(head.body).toBeNull();
    const listener = await listen(s, ann);
    await run(s, ann, 'group.add', { params: { name: 'Work' } });
    expect((await listener.next()) as Message).toMatchObject({ event: 'change' });
  });

  it('ends with an error a stream nobody reads once it holds its bound, and frees its place', async () => {
    const { s, ann } = await twoUsers({ streams: 1, queue: 400 });
    const unread = await s.call('GET', '/api/events', undefined, ann);
    expect(unread.status).toBe(200);
    for (let i = 0; i < 20; i += 1) await run(s, ann, 'group.add', { params: { name: `Group ${i}` } });
    if (unread.body === null) throw new Error('an event stream has a body');
    const reader = unread.body.getReader();
    let bytes = 0;
    const error = await (async () => {
      for (;;) {
        const read = await reader.read();
        if (read.done) return undefined;
        bytes += read.value.byteLength;
      }
    })().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(bytes).toBeLessThanOrEqual(400);
    const listener = await listen(s, ann);
    await run(s, ann, 'group.add', { params: { name: 'Work' } });
    expect((await listener.next()) as Message).toMatchObject({ event: 'change' });
  });

  it('ends with an error a stream whose heartbeat finds it full', async () => {
    const { s, ann } = await twoUsers({ heartbeat: 5, streams: 1, queue: 40 });
    const unread = await s.call('GET', '/api/events', undefined, ann);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(unread.body?.getReader().read()).rejects.toBeInstanceOf(Error);
    await listen(s, ann);
  });

  it('checks a streaming session without marking it used', async () => {
    const { s, ann, bob } = await twoUsers({ heartbeat: 10 });
    const used = (): unknown => s.db.get('select used_at from sessions where user_id = 1')?.['used_at'];
    const listener = await listen(s, ann);
    const before = used();
    s.time += 60_000;
    // Bob's sign-out checks every open stream, and the heartbeats check Ann's again.
    expect((await s.call('DELETE', '/api/session', undefined, bob)).status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(used()).toBe(before);
    await run(s, ann, 'group.add', { params: { name: 'Work' } });
    expect((await listener.next()) as Message).toMatchObject({ event: 'change' });
    expect(listener.heartbeats).toBeGreaterThan(0);
  });

  it('refuses a stream past the number each user may keep open', async () => {
    const { s, ann, bob } = await twoUsers({ streams: 2 });
    await listen(s, ann);
    await listen(s, ann);
    const refused = await s.call('GET', '/api/events', undefined, ann);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too many event streams; at most 2 for each user' });
    await listen(s, bob);
  });

  it('refuses a caller who is not signed in, or whose password is temporary', async () => {
    const s = server();
    const ann = await setUp(s);
    expect((await s.call('GET', '/api/events')).status).toBe(401);
    const added = await s.call('POST', '/api/users', { name: 'Bob' }, ann);
    const { password } = (await added.json()) as { password: string };
    const temporary = await tokenFor(s, 'Bob', password);
    expect((await s.call('GET', '/api/events', undefined, temporary)).status).toBe(403);
  });
});

async function tokenFor(s: Server, name: string, password: string): Promise<string> {
  const response = await s.call('POST', '/api/session', { name, password });
  expect(response.status).toBe(200);
  return ((await response.json()) as { token: string }).token;
}
