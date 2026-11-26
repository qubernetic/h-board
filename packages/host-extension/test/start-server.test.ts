// @vitest-environment happy-dom
import { createApp, openDatabase } from '@h-board/host-server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBoard } from '../src/index';
import type { ExtensionApi } from '../src/index';
import { FakeArea } from './area';

// The board on the user's own server: which library it shows in which stage, and the way back to local.

const SERVER = 'https://hboard.example.com';
const ANN = { name: 'anna', password: 'anna-password-1' };

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const part = (root: ParentNode, name: string): HTMLElement => {
  const node = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!node) throw new Error(`no ${name}`);
  return node;
};

let stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.body.replaceChildren();
});

/** A server on an in-memory database, with the admin made and a library of one group. */
async function server() {
  const db = openDatabase(':memory:');
  const lines: string[] = [];
  const app = createApp({ version: '1.2.3', db, log: (line) => lines.push(line), address: () => '192.0.2.1', heartbeat: 60_000 });
  const code = /setup code: (\S+)/.exec(lines.join('\n'))?.[1] ?? '';
  const call = async (method: string, path: string, body?: unknown, token?: string): Promise<Response> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
    return app.request(`${SERVER}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  };
  const { token } = (await (await call('POST', '/api/setup', { code, ...ANN })).json()) as { token: string };
  await call('POST', '/api/commands/group.add', { params: { name: 'Work' } }, token);
  const s = {
    token,
    online: true,
    asked: [] as string[],
    fetch: (url: string, init: RequestInit = {}): Promise<Response> => {
      s.asked.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
      if (!s.online) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(app.request(url, init));
    },
    call,
  };
  return s;
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

const signedIn = (token: string) => ({ address: SERVER, token, user: { name: 'anna', admin: true, mustChangePassword: false } });

async function start(chrome: ExtensionApi, fetch: (url: string, init: RequestInit) => Promise<Response>, settings = false): Promise<HTMLElement> {
  const root = document.createElement('main');
  document.body.append(root);
  stops.push(
    await startBoard(root, chrome, { settings, fetch, options: { viewport: () => ({ w: 1440, h: 900 }), systemReducedMotion: () => true } }),
  );
  return root;
}

const groups = (root: HTMLElement): string | null => part(root, 'status-left').textContent;

describe('startBoard with a server', () => {
  it('shows the Server section in the settings, in local mode', async () => {
    const s = await server();
    const root = await start({ storage: { local: new FakeArea() } }, s.fetch, true);
    expect(part(root, 'server').querySelector('.head')?.textContent).toBe('Server');
    expect(groups(root)).toContain('8 groups');
    expect(s.asked).toEqual([]);
  });

  it("shows the server's library once signed in, and this browser's again after the sign-out", async () => {
    const s = await server();
    const area = new FakeArea();
    await area.set({ server: signedIn(s.token) });
    const root = await start({ storage: { local: area } }, s.fetch, true);
    expect(groups(root)).toContain('1 group');
    part(root, 'server-sign-out').click();
    await vi.waitFor(() => {
      expect(groups(root)).toContain('8 groups');
    });
    // the settings stay open on the sign-in, and the local library was never touched
    expect(part(root, 'settings-panel').hidden).toBe(false);
    expect(part(root, 'server').querySelector('.head')?.textContent).toBe('Server · sign in');
    expect(area.read('library')).toBeUndefined();
  });

  it('keeps the settings closed on the board when another page switched the mode', async () => {
    const s = await server();
    const area = new TellingArea();
    const root = await start({ storage: { local: area } }, s.fetch);
    expect(groups(root)).toContain('8 groups');
    await area.set({ server: signedIn(s.token) });
    await vi.waitFor(() => {
      expect(groups(root)).toContain('1 group');
    });
    expect(part(root, 'settings-panel').hidden).toBe(true);
  });

  it('asks for the server in the connect click and gives it back on the way to local mode', async () => {
    const s = await server();
    const asked: unknown[] = [];
    const removed: unknown[] = [];
    const chrome: ExtensionApi = {
      storage: { local: new FakeArea() },
      permissions: {
        request: (permissions) => {
          asked.push(permissions);
          return Promise.resolve(true);
        },
        contains: () => Promise.resolve(false),
        remove: (permissions) => {
          removed.push(permissions);
          return Promise.resolve(true);
        },
      },
    };
    const root = await start(chrome, s.fetch, true);
    part(root, 'server-mode-server').click();
    (part(root, 'server-address') as HTMLInputElement).value = SERVER;
    part(root, 'server').querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(asked).toEqual([{ origins: ['https://hboard.example.com/*'] }]);
    await vi.waitFor(() => {
      expect(part(root, 'server').querySelector('.head')?.textContent).toBe('Server · sign in');
    });
    part(root, 'server-local').click();
    await vi.waitFor(() => {
      expect(removed).toEqual([{ origins: ['https://hboard.example.com/*'] }]);
    });
  });

  it("shows this browser's library with a notice when the server's cannot be read", async () => {
    const s = await server();
    const area = new FakeArea();
    await area.set({ server: signedIn(s.token) });
    s.online = false;
    const root = await start({ storage: { local: area } }, s.fetch);
    expect(groups(root)).toContain('8 groups');
    expect(part(root, 'toast').textContent).toContain(
      "The server's library cannot be read: The server cannot be reached, and no copy of the library is kept on this computer yet. This is this browser's library.",
    );
  });

  it('goes back to the sign-in when the server no longer knows the session', async () => {
    const s = await server();
    const area = new FakeArea();
    await area.set({ server: signedIn('not-a-session') });
    const root = await start({ storage: { local: area } }, s.fetch);
    await flush();
    expect(groups(root)).toContain('8 groups');
    expect(area.read('server')).toEqual({ address: SERVER });
  });

  it('stops listening to the server when it stops', async () => {
    const s = await server();
    const area = new TellingArea();
    const root = await start({ storage: { local: area } }, s.fetch);
    for (const stop of stops.splice(0)) stop();
    await area.set({ server: signedIn(s.token) });
    await flush();
    expect(groups(root)).toContain('8 groups');
  });
});
