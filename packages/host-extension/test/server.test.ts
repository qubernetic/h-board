import { emptyLibrary, sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { createApp, openDatabase } from '@h-board/host-server';
import { describe, expect, it } from 'vitest';
import { ServerLink } from '../src/index';
import type { HostPermissions, ServerLinkOptions } from '../src/index';
import { FakeArea } from './area';

const SERVER = 'https://hboard.example.com';
const ANN = { name: 'anna', password: 'anna-password-1' };

/** A server on an in-memory database, reached through a fetch that can be cut off as a lost network would be. */
function server() {
  const db = openDatabase(':memory:');
  const lines: string[] = [];
  const app = createApp({ version: '1.2.3', db, log: (line) => lines.push(line), address: () => '192.0.2.1', heartbeat: 60_000 });
  const code = /setup code: (\S+)/.exec(lines.join('\n'))?.[1] ?? '';
  const s = {
    code,
    online: true,
    /** What the server answers instead, when set: a proxy in front of a server that is down. */
    status: 0,
    asked: [] as string[],
    fetch: (url: string, init: RequestInit = {}): Promise<Response> => {
      s.asked.push(`${init.method ?? 'GET'} ${url}`);
      if (!s.online) return Promise.reject(new TypeError('Failed to fetch'));
      if (s.status) return Promise.resolve(new Response('<html>bad gateway</html>', { status: s.status }));
      return Promise.resolve(app.request(url, init));
    },
    async call(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
      return app.request(`${SERVER}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    },
    /** Makes the admin through the API, as another browser would, and answers the session token. */
    async admin(): Promise<string> {
      const made = await s.call('POST', '/api/setup', { code, ...ANN });
      return ((await made.json()) as { token: string }).token;
    },
    async library(token: string): Promise<{ library: Library; history: { snapshots: { source: unknown }[] } }> {
      return (await s.call('GET', '/api/library', undefined, token)).json() as never;
    },
  };
  return s;
}

type Server = ReturnType<typeof server>;

/** The browser's permissions: what was asked for, what was given back, and whether the user allows it. */
function permissions(allow = true): HostPermissions & { granted: Set<string>; asked: string[]; removed: string[] } {
  const p = {
    granted: new Set<string>(),
    asked: [] as string[],
    removed: [] as string[],
    request({ origins }: { origins: string[] }): Promise<boolean> {
      p.asked.push(...origins);
      if (allow) for (const origin of origins) p.granted.add(origin);
      return Promise.resolve(allow);
    },
    remove({ origins }: { origins: string[] }): Promise<boolean> {
      p.removed.push(...origins);
      for (const origin of origins) p.granted.delete(origin);
      return Promise.resolve(true);
    },
  };
  return p;
}

/** A local area that tells its listeners of a change, as `chrome.storage.local` does in every page. */
class TellingArea extends FakeArea {
  readonly listeners: ((changes: Record<string, unknown>) => void)[] = [];
  override readonly onChanged = { addListener: (listener: (changes: Record<string, unknown>) => void): void => void this.listeners.push(listener) };

  override async set(items: Record<string, unknown>): Promise<void> {
    await super.set(items);
    for (const listener of this.listeners) listener(items);
  }
}

async function link(s: Server, extra: Partial<ServerLinkOptions> = {}) {
  const area = new FakeArea();
  const p = permissions();
  const made = await ServerLink.open({ area, permissions: p, fetch: s.fetch, library: () => Promise.resolve(sampleLibrary()), ...extra });
  return { link: made, area: (extra.area as FakeArea | undefined) ?? area, permissions: (extra.permissions as typeof p | undefined) ?? p };
}

/** A link signed in as the admin, past the offer. */
async function signedIn(s: Server) {
  const made = await link(s);
  await made.link.connect(SERVER);
  await made.link.setup(s.code, ANN.name, ANN.password);
  await made.link.skip();
  return made;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const sampleSites =sampleLibrary().groups.reduce((sum, group) => sum + group.sites.length, 0);

describe('ServerLink', () => {
  it('starts in local mode when no server is kept', async () => {
    const { link: l, area } = await link(server());
    expect(l.state()).toEqual({ stage: 'local' });
    expect(l.token()).toBeUndefined();
    expect(area.read('server')).toBeUndefined();
  });

  it('asks for the server in the click, then finds a server without accounts', async () => {
    const s = server();
    const { link: l, area, permissions: p } = await link(s);
    const connecting = l.connect(' https://HBoard.example.com/ ');
    // nothing is awaited before the request, so the browser still sees the click
    expect(p.asked).toEqual(['https://hboard.example.com/*']);
    await connecting;
    expect(l.state()).toEqual({ stage: 'setup', address: SERVER });
    expect(s.asked).toEqual([`GET ${SERVER}/api/setup`]);
    expect(area.read('server')).toEqual({ address: SERVER, setup: true });
  });

  it('asks for exactly the origin of a server on this computer, with its port', async () => {
    for (const [address, origin] of [
      ['http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
      ['http://localhost:8787/', 'http://localhost:8787'],
      ['http://[::1]:8787', 'http://[::1]:8787'],
    ] as const) {
      const s = server();
      const { link: l, permissions: p } = await link(s);
      await l.connect(address);
      expect(p.asked).toEqual([`${origin}/*`]);
      expect(s.asked).toEqual([`GET ${origin}/api/setup`]);
    }
  });

  it('keeps the path of a server behind a reverse proxy, and asks only for its origin', async () => {
    const s = server();
    const asked: string[] = [];
    const fetch = (url: string, init: RequestInit): Promise<Response> => {
      asked.push(url);
      return s.fetch(url.replace('/h-board/', '/'), init);
    };
    const { link: l, area, permissions: p } = await link(s, { fetch });
    await l.connect('https://example.org/h-board/');
    expect(p.asked).toEqual(['https://example.org/*']);
    expect(asked).toEqual(['https://example.org/h-board/api/setup']);
    expect(area.read('server')).toEqual({ address: 'https://example.org/h-board', setup: true });
    await l.local();
    expect(p.removed).toEqual(['https://example.org/*']);
  });

  it('refuses what checkServer refuses with its field error, and asks for nothing', async () => {
    for (const address of ['http://hboard.example.com', 'https://anna:secret@hboard.example.com', 'https://hboard.example.com/?a=1', '']) {
      const s = server();
      const { link: l, area, permissions: p } = await link(s);
      await expect(l.connect(address)).rejects.toThrow('server: must be an https address');
      expect(p.asked).toEqual([]);
      expect(s.asked).toEqual([]);
      expect(l.state()).toEqual({ stage: 'local' });
      expect(area.read('server')).toBeUndefined();
    }
  });

  it('refuses a loopback address the optional host permissions do not cover, before asking for it', async () => {
    for (const address of ['http://127.0.0.2:8787', 'http://127.1.2.3']) {
      const s = server();
      const { link: l, permissions: p } = await link(s);
      await expect(l.connect(address)).rejects.toThrow('server: over http, only localhost, 127.0.0.1 and [::1] can be allowed');
      expect(p.asked).toEqual([]);
      expect(s.asked).toEqual([]);
      expect(l.state()).toEqual({ stage: 'local' });
    }
  });

  it('stays local, without a server or a session token, when the browser does not allow the server', async () => {
    const s = server();
    const { link: l, area } = await link(s, { permissions: permissions(false) });
    await expect(l.connect(SERVER)).rejects.toThrow('The browser did not allow H-Board to reach https://hboard.example.com.');
    expect(s.asked).toEqual([]);
    expect(l.state()).toEqual({ stage: 'local' });
    expect(l.token()).toBeUndefined();
    expect(area.read('server')).toBeUndefined();
  });

  it('gives the permission back when the server cannot be reached, or is no H-Board server', async () => {
    const s = server();
    const { link: l, permissions: p } = await link(s);
    s.online = false;
    await expect(l.connect(SERVER)).rejects.toThrow('The server cannot be reached at https://hboard.example.com.');
    expect(p.granted.size).toBe(0);
    s.online = true;
    s.status = 503;
    await expect(l.connect(SERVER)).rejects.toThrow('The server cannot be reached at https://hboard.example.com.');
    s.status = 404;
    await expect(l.connect(SERVER)).rejects.toThrow('https://hboard.example.com does not answer as an H-Board server.');
    expect(p.granted.size).toBe(0);
    expect(l.state()).toEqual({ stage: 'local' });
  });

  it('makes the admin with the setup code and offers to send this browser library to the empty server', async () => {
    const s = server();
    const { link: l, area } = await link(s);
    await l.connect(SERVER);
    await l.setup(s.code, ANN.name, ANN.password);
    expect(l.state()).toEqual({
      stage: 'offer',
      address: SERVER,
      user: { name: 'anna', admin: true },
      local: { groups: sampleLibrary().groups.length, sites: sampleSites },
    });
    // the page still shows the local library until the offer is answered
    expect(l.token()).toBeUndefined();
    expect(JSON.stringify(area.read('server'))).not.toContain(ANN.password);
  });

  it('names a wrong setup code and a short password, as the server does', async () => {
    const s = server();
    const { link: l } = await link(s);
    await l.connect(SERVER);
    await expect(l.setup('AAAA-BBBB-CCCC', ANN.name, ANN.password)).rejects.toThrow('code: is wrong or already used');
    await expect(l.setup(s.code, ANN.name, 'short')).rejects.toThrow('password: must be at least');
    expect(l.state().stage).toBe('setup');
  });

  it('sends this browser library to the server as one import, in one snapshot', async () => {
    const s = server();
    const { link: l } = await link(s);
    await l.connect(SERVER);
    await l.setup(s.code, ANN.name, ANN.password);
    await l.send();
    expect(l.state()).toEqual({ stage: 'signed-in', address: SERVER, user: { name: 'anna', admin: true } });
    const token = l.token() as string;
    const { library, history } = await s.library(token);
    expect(library.groups.map((group) => group.name)).toEqual(sampleLibrary().groups.map((group) => group.name));
    // the server's first snapshot, and the import
    expect(history.snapshots).toHaveLength(2);
    expect(s.asked.filter((asked) => asked.includes('/api/commands/'))).toEqual([`POST ${SERVER}/api/commands/library.import`]);
  });

  it('keeps the server library empty when the offer is declined', async () => {
    const s = server();
    const { link: l } = await signedIn(s);
    expect(l.state().stage).toBe('signed-in');
    expect((await s.library(l.token() as string)).library.groups).toEqual([]);
  });

  it('offers nothing when this browser library is empty, or the server holds a library', async () => {
    const s = server();
    const empty = await link(s, { library: () => Promise.resolve(emptyLibrary()) });
    await empty.link.connect(SERVER);
    await empty.link.setup(s.code, ANN.name, ANN.password);
    expect(empty.link.state().stage).toBe('signed-in');
    await s.call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, empty.link.token());
    const { link: l } = await link(s);
    await l.connect(SERVER);
    expect(l.state()).toEqual({ stage: 'sign-in', address: SERVER });
    await l.signIn(ANN.name, ANN.password);
    expect(l.state().stage).toBe('signed-in');
  });

  it('says a wrong name or password the way the settings do, then the wait', async () => {
    const s = server();
    await s.admin();
    const { link: l } = await link(s);
    await l.connect(SERVER);
    for (let i = 0; i < 3; i += 1) {
      await expect(l.signIn(ANN.name, 'not-the-password')).rejects.toThrow('Wrong user name or password. Wait a moment before you try again.');
    }
    await expect(l.signIn(ANN.name, ANN.password)).rejects.toThrow(/^Too many failed attempts; try again in \d+ seconds\.$/);
    expect(l.state().stage).toBe('sign-in');
  });

  it('makes a user with a temporary password choose a new one before anything else', async () => {
    const s = server();
    const admin = await s.admin();
    const made = await s.call('POST', '/api/users', { name: 'paul' }, admin);
    const { password } = (await made.json()) as { password: string };
    const { link: l } = await link(s);
    await l.connect(SERVER);
    await l.signIn('paul', password);
    expect(l.state()).toEqual({ stage: 'forced', address: SERVER, user: { name: 'paul', admin: false } });
    expect(l.token()).toBeUndefined();
    await expect(l.changePassword(password, password)).rejects.toThrow('password: must differ from the temporary one');
    await l.changePassword(password, 'paul-own-password');
    expect(l.state()).toMatchObject({ stage: 'offer', user: { name: 'paul', admin: false } });
  });

  it('changes the password of a signed-in user and keeps the session', async () => {
    const s = server();
    const { link: l } = await signedIn(s);
    await expect(l.changePassword('wrong-password-1', 'anna-password-2')).rejects.toThrow('current: is not the password of this account');
    await l.changePassword(ANN.password, 'anna-password-2');
    expect(l.state().stage).toBe('signed-in');
    expect((await s.call('GET', '/api/session', undefined, l.token())).status).toBe(200);
  });

  it('signs out: the server forgets the session, the kept copy of its library goes, the server stays', async () => {
    const s = server();
    const { link: l, area, permissions: p } = await signedIn(s);
    const token = l.token() as string;
    await area.set({ remote: { server: SERVER, at: 0, library: emptyLibrary() } });
    await l.signOut();
    expect(l.state()).toEqual({ stage: 'sign-in', address: SERVER });
    expect(l.token()).toBeUndefined();
    expect((await s.call('GET', '/api/session', undefined, token)).status).toBe(401);
    expect(area.read('remote')).toBeNull();
    expect(area.read('server')).toEqual({ address: SERVER });
    expect(p.granted.has('https://hboard.example.com/*')).toBe(true);
  });

  it('signs out here even when the server cannot be reached', async () => {
    const s = server();
    const { link: l } = await signedIn(s);
    s.online = false;
    await l.signOut();
    expect(l.state()).toEqual({ stage: 'sign-in', address: SERVER });
  });

  it('goes back to local mode: forgets the server and gives its permission back', async () => {
    const s = server();
    const { link: l, area, permissions: p } = await signedIn(s);
    const token = l.token() as string;
    await l.local();
    expect(l.state()).toEqual({ stage: 'local' });
    expect(area.read('server')).toBeNull();
    expect(area.read('remote')).toBeNull();
    expect(p.removed).toEqual(['https://hboard.example.com/*']);
    expect((await s.call('GET', '/api/session', undefined, token)).status).toBe(401);
  });

  it('gives back exactly the origin it asked for, port and all', async () => {
    const s = server();
    const { link: l, permissions: p } = await link(s);
    await l.connect('http://localhost:8787');
    await l.local();
    expect(p.removed).toEqual(['http://localhost:8787/*']);
    expect(p.granted.size).toBe(0);
  });

  it('goes back to local mode when the browser cannot give the permission back', async () => {
    const s = server();
    const p = permissions();
    p.remove = () => Promise.reject(new Error('You cannot remove required permissions.'));
    const { link: l } = await link(s, { permissions: p });
    await l.connect(SERVER);
    await l.local();
    expect(l.state()).toEqual({ stage: 'local' });
  });

  it('asks the user to sign in again when the server no longer knows the session', async () => {
    const s = server();
    const { link: l } = await signedIn(s);
    await s.call('DELETE', '/api/session', undefined, l.token());
    await expect(l.changePassword(ANN.password, 'anna-password-2')).rejects.toThrow('The session has ended. Sign in again.');
    expect(l.state()).toEqual({ stage: 'sign-in', address: SERVER });
  });

  it('says what a server that fails answered, without its page', async () => {
    const s = server();
    const { link: l } = await link(s);
    await l.connect(SERVER);
    s.status = 500;
    await expect(l.signIn(ANN.name, ANN.password)).rejects.toThrow('The server could not do it (500).');
    s.status = 502;
    await expect(l.signIn(ANN.name, ANN.password)).rejects.toThrow('The server cannot be reached at https://hboard.example.com.');
  });

  it('reads the server it keeps when it opens again, and ignores what it cannot read', async () => {
    const s = server();
    const { area } = await signedIn(s);
    const again = await ServerLink.open({ area, fetch: s.fetch, library: () => Promise.resolve(sampleLibrary()) });
    expect(again.state()).toEqual({ stage: 'signed-in', address: SERVER, user: { name: 'anna', admin: true } });
    for (const kept of [null, 'https://hboard.example.com', { address: 'http://hboard.example.com' }, { address: SERVER, token: 7 }]) {
      await area.set({ server: kept });
      expect((await ServerLink.open({ area, fetch: s.fetch, library: () => Promise.resolve(null) })).state()).toEqual({ stage: 'local' });
    }
  });

  it('tells its listeners of its own changes and of those another page made', async () => {
    const s = server();
    const area = new TellingArea();
    const one = await ServerLink.open({ area, permissions: permissions(), fetch: s.fetch, library: () => Promise.resolve(sampleLibrary()) });
    const two = await ServerLink.open({ area, fetch: s.fetch, library: () => Promise.resolve(sampleLibrary()) });
    const heard: string[] = [];
    one.onChange(() => heard.push(`one ${one.state().stage}`));
    const stop = two.onChange(() => heard.push(`two ${two.state().stage}`));
    await one.connect(SERVER);
    await flush();
    expect(heard.sort()).toEqual(['one setup', 'two setup']);
    stop();
    await area.set({ group: 'g1' });
    await one.local();
    await flush();
    expect(heard).toEqual(['one setup', 'two setup', 'one local']);
    expect(two.state()).toEqual({ stage: 'local' });
  });

  it('works without the permissions API, as in the preview of the build', async () => {
    const s = server();
    const area = new FakeArea();
    const l = await ServerLink.open({ area, fetch: s.fetch, library: () => Promise.resolve(null) });
    await l.connect(SERVER);
    await l.setup(s.code, ANN.name, ANN.password);
    expect(l.state().stage).toBe('signed-in');
    await l.local();
    expect(l.state()).toEqual({ stage: 'local' });
  });
});
