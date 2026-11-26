import { CommandError, emptyHistory } from '@h-board/core';
import type { Library, Outcome } from '@h-board/core';
import type { LocalArea } from './ext';
import { checkServer } from './server';
import type { ApplyOptions, By, State, StepBy, Store } from './store';
import { readStoredHistory, readStoredLibrary } from './stored';

/** Why a `RemoteStore` could not reach the library: no network, no session, or a server that failed. */
export type RemoteErrorCode = 'offline' | 'signed-out' | 'server';

/** A change or a read the server did not take, with a message the page shows as text. */
export class RemoteError extends Error {
  constructor(
    readonly code: RemoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

export interface RemoteStoreOptions {
  /** The server's address, such as `https://board.example.org`. */
  readonly server: string;
  /**
   * The bearer token to ask with: the session token for the user, an agent's key for an agent.
   * `undefined` when there is none, as after a sign-out; then nothing is asked of the server.
   */
  readonly token: (by: By) => string | undefined | Promise<string | undefined>;
  /** Where the last library read is kept for reading offline: the extension passes `chrome.storage.local`. */
  readonly cache: Pick<LocalArea, 'get' | 'set'>;
  /** `fetch` when left out. */
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since the epoch. `Date.now` when left out. */
  readonly now?: () => number;
  /** Milliseconds to wait before the event stream connects again after it was lost. 5 seconds when left out. */
  readonly retry?: number;
}

/** The cache's one key, apart from the keys of `ExtStore`, so that the local library stays as it was. */
const CACHE = 'remote';

/** The largest part of an event the stream holds before the end of the event; the server's events are far smaller. */
const MAX_EVENT = 65_536;

const USER: By = { kind: 'user' };

/** A proxy in front of a server that is down answers these: the server cannot be reached. */
const UNREACHABLE = new Set([502, 503, 504]);

/** The way a command refuses, by the status the server answers it with. */
const REFUSED: Partial<Record<number, CommandError['code']>> = { 400: 'invalid', 403: 'refused', 404: 'missing', 413: 'invalid' };

const CANNOT_CHANGE = 'The server cannot be reached, so the library can be read but not changed.';
const NOTHING_KEPT = 'The server cannot be reached, and no copy of the library is kept on this computer yet.';
const SIGN_IN_TO_CHANGE = 'Sign in to the server to change the library.';
const SIGN_IN_TO_READ = 'Sign in to the server to read the library.';

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const minute = (at: number): string => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function ignore(): void {
  // a failure nobody waits for
}

/** The library of a server's answer, checked by the same rules as an imported file. */
function libraryOf(answer: unknown): Library {
  const { library, problems } = readStoredLibrary(isRecord(answer) ? answer.library : undefined);
  if (library) return library;
  throw new RemoteError('server', `The server answered a library that could not be read (${String(problems[0])}).`);
}

function stateOf(answer: unknown, at: number): State {
  return {
    library: libraryOf(answer),
    history: readStoredHistory(isRecord(answer) ? answer.history : undefined),
    synced: { at, offline: false },
  };
}

/** What tells two states apart, without the libraries of every snapshot. */
const markOf = (state: State): string =>
  JSON.stringify([state.history.next, state.history.undo, state.history.redo, state.library]);

/**
 * A `Store` on the user's own server, over its REST routes and its event stream. Every change is
 * the server's: offline or signed out, `apply`, `undo`, `redo` and `restore` reject with a
 * `RemoteError` and change nothing. The last library read is kept in the cache, so that offline
 * `load` still answers it, read only, with a `notice` that says so. A sign-out the server reports
 * forgets the cache.
 */
export class RemoteStore implements Store {
  readonly #server: string;
  readonly #token: RemoteStoreOptions['token'];
  readonly #cache: RemoteStoreOptions['cache'];
  readonly #fetch: NonNullable<RemoteStoreOptions['fetch']>;
  readonly #now: () => number;
  readonly #retry: number;
  readonly #listeners = new Set<(state: State) => void>();
  #queue: Promise<unknown> = Promise.resolve();
  /** The mark of the state last read or told; empty when it is not known. */
  #told = '';
  /** The state last read or told, while it is known. */
  #last: State | undefined;
  /** The listeners were told that the server cannot be reached, and not yet that it can. */
  #offline = false;
  #stream: AbortController | undefined;
  #again: ReturnType<typeof setTimeout> | undefined;

  constructor(options: RemoteStoreOptions) {
    this.#server = checkServer(options.server);
    this.#token = options.token;
    this.#cache = options.cache;
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#now = options.now ?? Date.now;
    this.#retry = options.retry ?? 5000;
  }

  load(): Promise<State> {
    return this.#inTurn(async () => {
      try {
        const state = await this.#read();
        this.#told = markOf(state);
        this.#last = state;
        return state;
      } catch (error) {
        if (!(error instanceof RemoteError) || error.code !== 'offline') throw error;
        const kept = await this.#cached();
        // The page now says it is read only, so the next read the server answers is news.
        this.#offline = true;
        return kept;
      }
    });
  }

  apply(id: string, params?: unknown, options: ApplyOptions = {}): Promise<Outcome> {
    return this.#inTurn(async () => {
      const answer = await this.#ask('POST', `/api/commands/${encodeURIComponent(id)}`, options.by ?? USER, true, {
        params,
        alone: options.alone ?? false,
      });
      const outcome: Outcome = { library: libraryOf(answer), value: isRecord(answer) ? answer.value : undefined };
      await this.#keep(outcome.library);
      // The answer has no snapshots, so the listeners get the whole state, read again. Without
      // listeners the state is no longer known.
      if (this.#listeners.size === 0) this.#told = '';
      else await this.#refresh(false).catch(ignore);
      return outcome;
    });
  }

  undo(options: StepBy = {}): Promise<State | undefined> {
    return this.#step('/api/undo', options);
  }

  redo(options: StepBy = {}): Promise<State | undefined> {
    return this.#step('/api/redo', options);
  }

  restore(id: number, options: StepBy = {}): Promise<State | undefined> {
    return this.#step(`/api/restore/${encodeURIComponent(String(id))}`, options);
  }

  /** The first listener opens the server's event stream, the last one to stop closes it. */
  subscribe(listener: (state: State) => void): () => void {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#listen();
    return () => {
      if (this.#listeners.delete(listener) && this.#listeners.size === 0) this.#stopListening();
    };
  }

  /** Runs `work` after everything asked for before it, whether that worked or not. */
  #inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = this.#queue.then(work);
    this.#queue = turn.catch(() => undefined);
    return turn;
  }

  /**
   * Asks the server, with the token of `by`, and answers the JSON body; `undefined` for 204. A
   * refused command rejects with its `CommandError`, everything else with a `RemoteError`.
   */
  async #ask(method: string, path: string, by: By, change: boolean, body?: unknown): Promise<unknown> {
    const token = await this.#token(by);
    if (token === undefined) throw new RemoteError('signed-out', change ? SIGN_IN_TO_CHANGE : SIGN_IN_TO_READ);
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.#fetch(`${this.#server}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw this.#lost();
    }
    if (UNREACHABLE.has(response.status)) throw this.#lost();
    if (response.status === 401) {
      await this.#forget();
      throw new RemoteError('signed-out', change ? SIGN_IN_TO_CHANGE : SIGN_IN_TO_READ);
    }
    if (response.status === 204) return undefined;
    const answer: unknown = await response.json().catch(() => undefined);
    if (response.ok && answer !== undefined) return answer;
    const message = isRecord(answer) && typeof answer.error === 'string' ? answer.error : undefined;
    const code = REFUSED[response.status];
    if (code !== undefined && message !== undefined) {
      throw new CommandError(message === 'id: is not a command' ? 'unknown' : code, message);
    }
    throw new RemoteError('server', `The server could not do it (${response.status}).`);
  }

  /** The user's library and its snapshots, read from the server and kept in the cache. */
  async #read(): Promise<State> {
    const state = stateOf(await this.#ask('GET', '/api/library', USER, false), this.#now());
    await this.#keep(state.library);
    return state;
  }

  async #step(path: string, options: StepBy): Promise<State | undefined> {
    return this.#inTurn(async () => {
      const answer = await this.#ask('POST', path, options.by ?? USER, true);
      if (answer === undefined) return undefined;
      const state = stateOf(answer, this.#now());
      await this.#keep(state.library);
      this.#heard(state, false);
      return state;
    });
  }

  /** The library kept for this server, read only. */
  async #cached(): Promise<State> {
    const { [CACHE]: kept } = await this.#cache.get([CACHE]);
    const library = isRecord(kept) && kept.server === this.#server ? readStoredLibrary(kept.library).library : undefined;
    if (!isRecord(kept) || library === undefined || !Number.isSafeInteger(kept.at)) throw new RemoteError('offline', NOTHING_KEPT);
    const notice = `The server cannot be reached. This is the library as it was at ${minute(kept.at as number)}; it can be read, not changed.`;
    return { library, history: emptyHistory(), notice, synced: { at: kept.at as number, offline: true } };
  }

  /** Keeps `library` for reading offline. A cache that cannot take it does not undo a change the server made. */
  async #keep(library: Library): Promise<void> {
    await this.#cache.set({ [CACHE]: { server: this.#server, at: this.#now(), library } }).catch(ignore);
  }

  /**
   * The server cannot be reached: the listeners hear it once, with the library they have, so that the page says it is
   * read only. Answers the error a change is refused with.
   */
  #lost(): RemoteError {
    const last = this.#last;
    if (!this.#offline && last?.synced && this.#listeners.size > 0) {
      this.#offline = true;
      const state: State = { ...last, synced: { at: last.synced.at, offline: true } };
      for (const listener of [...this.#listeners]) listener(state);
    }
    return new RemoteError('offline', CANNOT_CHANGE);
  }

  async #forget(): Promise<void> {
    this.#told = '';
    this.#last = undefined;
    await this.#cache.set({ [CACHE]: null }).catch(ignore);
  }

  /** Reads the state and tells the listeners if it moved; `quiet` tells nothing when the last state is not known. */
  async #refresh(quiet: boolean): Promise<void> {
    if (this.#listeners.size === 0) return;
    this.#heard(await this.#read(), quiet);
  }

  #heard(state: State, quiet: boolean): void {
    const mark = markOf(state);
    const news = this.#offline || (mark !== this.#told && !(quiet && this.#told === ''));
    this.#told = mark;
    this.#last = state;
    this.#offline = false;
    if (news) for (const listener of [...this.#listeners]) listener(state);
  }

  #listen(): void {
    const control = new AbortController();
    this.#stream = control;
    void this.#follow(control.signal).then((again) => {
      if (again && !control.signal.aborted) this.#again = setTimeout(() => this.#listen(), this.#retry);
    });
  }

  #stopListening(): void {
    this.#stream?.abort();
    this.#stream = undefined;
    clearTimeout(this.#again);
  }

  /**
   * Follows the event stream until it ends: true when it should connect again, false after a
   * sign-out. Each `change` event reads the state; so does each connect, for what it missed.
   */
  async #follow(signal: AbortSignal): Promise<boolean> {
    const token = await Promise.resolve(this.#token(USER)).catch(() => undefined);
    if (token === undefined || signal.aborted) return false;
    let response: Response;
    try {
      response = await this.#fetch(`${this.#server}/api/events`, {
        headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
        signal,
      });
    } catch {
      this.#lost();
      return true;
    }
    if (UNREACHABLE.has(response.status)) this.#lost();
    if (response.status === 401) {
      await this.#forget();
      return false;
    }
    if (!response.ok || response.body === null) return true;
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const cancel = (): void => void reader.cancel().catch(ignore);
    signal.addEventListener('abort', cancel);
    void this.#inTurn(() => this.#refresh(true)).catch(ignore);
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return true;
        buffer += value.replace(/\r\n?/g, '\n');
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          const event = /^event: ?(.*)$/m.exec(buffer.slice(0, end))?.[1];
          buffer = buffer.slice(end + 2);
          if (event === 'end') {
            cancel();
            await this.#forget();
            return false;
          }
          if (event === 'change') void this.#inTurn(() => this.#refresh(false)).catch(ignore);
        }
        if (buffer.length > MAX_EVENT) {
          cancel();
          return true;
        }
      }
    } catch {
      return true;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
}
