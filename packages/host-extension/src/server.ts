import { writeLibraryFile } from '@h-board/core';
import type { Library } from '@h-board/core';
import { checkServer } from '@h-board/store';
import type { LocalArea } from '@h-board/store';
import type { ServerAccess, ServerState } from '@h-board/ui';

/**
 * The hosts on this computer the manifest's optional host permissions cover over plain http. `checkServer` takes all
 * of `127.0.0.0/8`, but a match pattern cannot name a range, so the rest of it cannot be allowed.
 */
const ALLOWED_HTTP = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Where the server and the session are kept in the local area; `remote` is `RemoteStore`'s copy of its library. */
const KEY = 'server';
const CACHE = 'remote';

/** A proxy in front of a server that is down answers these: the server cannot be reached. */
const UNREACHABLE = new Set([502, 503, 504]);

/** What the settings say to a wrong name or password, as the design file has it. */
const WRONG = 'Wrong user name or password. Wait a moment before you try again.';
const ENDED = 'The session has ended. Sign in again.';

/**
 * The address of the user's own server from what the user typed, as `checkServer` takes it, and only one the
 * browser can allow. Throws an `Error` that names the field and never repeats the value.
 */
function serverAddress(typed: string): string {
  const address = checkServer(typed.trim());
  const url = new URL(address);
  if (url.protocol === 'http:' && !ALLOWED_HTTP.has(url.hostname)) {
    throw new Error('server: over http, only localhost, 127.0.0.1 and [::1] can be allowed');
  }
  return address;
}

/** The host permission of a server: exactly its origin, port and all, never its path. */
const patternOf = (address: string): string => `${new URL(address).origin}/*`;

/** The part of `chrome.permissions` the link uses: a server's origin, asked for in the click and given back. */
export interface HostPermissions {
  request(permissions: { origins: string[] }): Promise<boolean>;
  remove(permissions: { origins: string[] }): Promise<boolean>;
}

export interface ServerLinkOptions {
  /** Where the server and the session token are kept: `chrome.storage.local`, never the area that syncs. */
  readonly area: LocalArea;
  /** Asks for the server's origin and gives it back. Left out outside the extension. */
  readonly permissions?: HostPermissions;
  /** `fetch` when left out. */
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** This browser's library, for the offer to send it to an empty server; `null` when it cannot be read. */
  readonly library: () => Promise<Library | null>;
}

interface User {
  readonly name: string;
  readonly admin: boolean;
  readonly mustChangePassword: boolean;
}

/** What is kept of the server: its address and, once signed in, the session token and the user. */
interface Kept {
  readonly address: string;
  /** The server has no account yet. */
  readonly setup?: true;
  readonly token?: string;
  readonly user?: User;
  /** The server's library was empty at the sign-in: what this browser's library holds, to offer sending it. */
  readonly offer?: { readonly groups: number; readonly sites: number };
}

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

function userOf(value: unknown): User | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.admin !== 'boolean') return undefined;
  if (typeof value.mustChangePassword !== 'boolean') return undefined;
  return { name: value.name, admin: value.admin, mustChangePassword: value.mustChangePassword };
}

function isAddress(value: unknown): value is string {
  try {
    return typeof value === 'string' && serverAddress(value) === value;
  } catch {
    return false;
  }
}

/** What was kept, when it can be read; anything else counts as no server. */
function keptOf(value: unknown): Kept | undefined {
  if (!isRecord(value) || !isAddress(value.address)) return undefined;
  if (value.token === undefined) return { address: value.address, ...(value.setup === true && { setup: true }) };
  const user = userOf(value.user);
  if (typeof value.token !== 'string' || user === undefined) return undefined;
  const { offer } = value;
  const offered = isRecord(offer) && Number.isSafeInteger(offer.groups) && Number.isSafeInteger(offer.sites);
  return {
    address: value.address,
    token: value.token,
    user,
    ...(offered && { offer: { groups: offer.groups as number, sites: offer.sites as number } }),
  };
}

function ignore(): void {
  // a failure nobody waits for
}

/**
 * The extension's way to the user's own server, behind the settings' Server section: connect, set up, sign in,
 * change the password, sign out, and back to local. It keeps the server and the session token in the local area
 * only, and tells its listeners of every change, also one another page made.
 */
export class ServerLink implements ServerAccess {
  readonly #area: LocalArea;
  readonly #permissions: HostPermissions | undefined;
  readonly #fetch: NonNullable<ServerLinkOptions['fetch']>;
  readonly #library: ServerLinkOptions['library'];
  readonly #listeners = new Set<() => void>();
  #kept: Kept | undefined;

  private constructor(options: ServerLinkOptions, kept: Kept | undefined) {
    this.#area = options.area;
    this.#permissions = options.permissions;
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#library = options.library;
    this.#kept = kept;
    this.#area.onChanged.addListener((changes) => {
      if (KEY in changes) void this.#reread().catch(ignore);
    });
  }

  /** A link on what `area` keeps. */
  static async open(options: ServerLinkOptions): Promise<ServerLink> {
    const { [KEY]: kept } = await options.area.get([KEY]);
    return new ServerLink(options, keptOf(kept));
  }

  state(): ServerState {
    const kept = this.#kept;
    if (kept === undefined) return { stage: 'local' };
    const { address, user, offer } = kept;
    if (kept.token === undefined || user === undefined) return { stage: kept.setup ? 'setup' : 'sign-in', address };
    const shown = { name: user.name, admin: user.admin };
    if (user.mustChangePassword) return { stage: 'forced', address, user: shown };
    if (offer) return { stage: 'offer', address, user: shown, local: offer };
    return { stage: 'signed-in', address, user: shown };
  }

  /** The session token while the page shows the server's library; `undefined` in every other stage. */
  token(): string | undefined {
    return this.state().stage === 'signed-in' ? this.#kept?.token : undefined;
  }

  /** Calls `listener` after every change of the stage, the server or the user. Returns the function that stops it. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  connect(typed: string): Promise<void> {
    let address: string;
    try {
      address = serverAddress(typed);
    } catch (error) {
      return Promise.reject(error as Error);
    }
    // asked before anything is awaited, so that the browser still counts it as part of the click
    const allowed = this.#permissions ? this.#permissions.request({ origins: [patternOf(address)] }) : Promise.resolve(true);
    return (async () => {
      if (!(await allowed)) throw new Error(`The browser did not allow H-Board to reach ${address}.`);
      try {
        const { status, answer } = await this.#ask(address, 'GET', '/api/setup');
        if (status !== 200 || !isRecord(answer) || typeof answer.needed !== 'boolean') {
          throw new Error(`${address} does not answer as an H-Board server.`);
        }
        await this.#keep({ address, ...(answer.needed && { setup: true }) });
      } catch (error) {
        await this.#giveBack(address);
        throw error;
      }
    })();
  }

  async setup(code: string, name: string, password: string): Promise<void> {
    const address = this.#address();
    const { status, answer } = await this.#ask(address, 'POST', '/api/setup', { body: { code, name, password } });
    if (status !== 201) throw this.#refusal(status, answer);
    await this.#signedIn(address, answer);
  }

  async signIn(name: string, password: string): Promise<void> {
    const address = this.#address();
    const { status, answer } = await this.#ask(address, 'POST', '/api/session', { body: { name, password } });
    if (status === 401) throw new Error(WRONG);
    if (status !== 200) throw this.#refusal(status, answer);
    await this.#signedIn(address, answer);
  }

  async changePassword(current: string, password: string): Promise<void> {
    const { address, token, user } = this.#session();
    const changed = await this.#ask(address, 'POST', '/api/password', { token, body: { current, password } });
    if (changed.status !== 204) throw await this.#ended(changed.status, changed.answer);
    if (!user.mustChangePassword) return;
    const { status, answer } = await this.#ask(address, 'GET', '/api/session', { token });
    if (status !== 200) throw await this.#ended(status, answer);
    await this.#signedIn(address, { token, user: isRecord(answer) ? answer.user : undefined });
  }

  async send(): Promise<void> {
    const { address, token, user } = this.#session();
    const library = await this.#library();
    if (library === null) throw new Error("This browser's library cannot be read, so it cannot be sent.");
    const params = { text: writeLibraryFile(library) };
    const { status, answer } = await this.#ask(address, 'POST', '/api/commands/library.import', { token, body: { params, alone: true } });
    if (status !== 200) throw await this.#ended(status, answer);
    await this.#keep({ address, token, user });
  }

  async skip(): Promise<void> {
    const { address, token, user } = this.#session();
    await this.#keep({ address, token, user });
  }

  async signOut(): Promise<void> {
    const kept = this.#kept;
    if (kept === undefined) return;
    await this.#end(kept);
    await this.#keep({ address: kept.address });
  }

  async local(): Promise<void> {
    const kept = this.#kept;
    if (kept === undefined) return;
    await this.#end(kept);
    await this.#keep(undefined);
    await this.#giveBack(kept.address);
  }

  #address(): string {
    if (this.#kept === undefined) throw new Error('Connect to a server first.');
    return this.#kept.address;
  }

  #session(): { address: string; token: string; user: User } {
    const kept = this.#kept;
    if (kept?.token === undefined || kept.user === undefined) throw new Error('Sign in to the server first.');
    return { address: kept.address, token: kept.token, user: kept.user };
  }

  /** Asks the server; a lost network or a proxy in front of a server that is down rejects with a sentence. */
  async #ask(
    address: string,
    method: string,
    path: string,
    { token, body }: { token?: string; body?: unknown } = {},
  ): Promise<{ status: number; answer: unknown }> {
    const headers: Record<string, string> = {};
    if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.#fetch(`${address}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error(`The server cannot be reached at ${address}.`);
    }
    if (UNREACHABLE.has(response.status)) throw new Error(`The server cannot be reached at ${address}.`);
    const answer: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    return { status: response.status, answer };
  }

  /** What the server said, as a sentence of its own: its field-by-field message, or the wait after failed attempts. */
  #refusal(status: number, answer: unknown): Error {
    const message = isRecord(answer) && typeof answer.error === 'string' ? answer.error : undefined;
    if (message === undefined) return new Error(`The server could not do it (${status}).`);
    if (status === 429) return new Error(`${message.charAt(0).toUpperCase()}${message.slice(1)}.`);
    return new Error(message);
  }

  /** The refusal of a call with the session token; a session the server no longer knows goes back to the sign-in. */
  async #ended(status: number, answer: unknown): Promise<Error> {
    if (status !== 401 || this.#kept === undefined) return this.#refusal(status, answer);
    await this.#keep({ address: this.#kept.address });
    return new Error(ENDED);
  }

  /** Keeps the session a setup or a sign-in gave, with the offer when the server's library is empty. */
  async #signedIn(address: string, answer: unknown): Promise<void> {
    const token = isRecord(answer) && typeof answer.token === 'string' ? answer.token : undefined;
    const user = userOf(isRecord(answer) ? answer.user : undefined);
    if (token === undefined || user === undefined) throw new Error('The server answered a sign-in that could not be read.');
    const offer = user.mustChangePassword ? undefined : await this.#offer(address, token);
    await this.#keep({ address, token, user, ...(offer && { offer }) });
  }

  /** What this browser's library holds, when the server's library is empty and this one is not. */
  async #offer(address: string, token: string): Promise<Kept['offer']> {
    const { status, answer } = await this.#ask(address, 'GET', '/api/library', { token });
    const library = isRecord(answer) && isRecord(answer.library) ? answer.library : undefined;
    if (status !== 200 || !Array.isArray(library?.groups) || library.groups.length > 0) return undefined;
    const local = await this.#library();
    if (local === null || local.groups.length === 0) return undefined;
    return { groups: local.groups.length, sites: local.groups.reduce((sum, group) => sum + group.sites.length, 0) };
  }

  /** Signs the session out on the server, when it can be reached, and forgets the copy of the server's library. */
  async #end(kept: Kept): Promise<void> {
    if (kept.token !== undefined) await this.#ask(kept.address, 'DELETE', '/api/session', { token: kept.token }).catch(ignore);
    await this.#area.set({ [CACHE]: null });
  }

  async #keep(kept: Kept | undefined): Promise<void> {
    this.#kept = kept;
    await this.#area.set({ [KEY]: kept ?? null });
    this.#tell();
  }

  async #giveBack(address: string): Promise<void> {
    await this.#permissions?.remove({ origins: [patternOf(address)] }).catch(ignore);
  }

  /** Reads what another page kept, and tells the listeners when it differs from what this link knows. */
  async #reread(): Promise<void> {
    const { [KEY]: value } = await this.#area.get([KEY]);
    const kept = keptOf(value);
    if (JSON.stringify(kept) === JSON.stringify(this.#kept)) return;
    this.#kept = kept;
    this.#tell();
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}
