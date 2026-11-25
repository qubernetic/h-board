import type { SnapshotSource } from '@h-board/core';
import type { State, Store } from '@h-board/store';

/** What a change event says: the snapshot the change made or joined, and who made it. Nothing of the library itself. */
export interface Change {
  readonly snapshot: number;
  readonly source: SnapshotSource;
}

/** One stream to open: whose it is, the store it listens to, and whether its session still stands. */
export interface Listening {
  readonly user: number;
  readonly store: Store;
  readonly live: () => boolean;
}

export interface EventsOptions {
  /** Milliseconds between two heartbeat lines; each one checks the session too. */
  readonly heartbeat: number;
  /** How many streams one user may keep open. */
  readonly streams: number;
}

const encoder = new TextEncoder();

function message(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** The change of the newest snapshot, which every change makes or joins. */
function changesOf(state: State): Change[] {
  return state.history.snapshots.slice(0, 1).map((newest) => ({ snapshot: newest.id, source: newest.source }));
}

/**
 * The open event streams, by user. A stream hears every change of its user's library, from any
 * source, since every change goes through the user's one store. It ends with an `end` event once
 * its session is revoked: at the next heartbeat, or at once after `recheck`.
 */
export class Events {
  readonly #options: EventsOptions;
  /** The session check of every open stream, by user; a failed check ends its stream. */
  readonly #checks = new Map<number, Set<() => void>>();

  constructor(options: EventsOptions) {
    this.#options = options;
  }

  /** A new stream, or `undefined` when the user already keeps as many open as allowed. */
  open(listening: Listening, signal: AbortSignal): ReadableStream<Uint8Array> | undefined {
    const { user, store, live } = listening;
    const checks = this.#checks.get(user) ?? new Set();
    if (checks.size >= this.#options.streams) return undefined;
    let stopped = false;
    // Set by `start`, which the stream runs at once.
    let stop: () => void;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send = (text: string): void => {
          controller.enqueue(encoder.encode(text));
        };
        // Runs only while the stream is open: `stop` takes it out of `checks` and ends the timer.
        const check = (): boolean => {
          if (live()) return true;
          send(message('end', { error: 'sign in first' }));
          controller.close();
          stop();
          return false;
        };
        const unsubscribe = store.subscribe((state) => {
          for (const change of changesOf(state)) send(message('change', change));
        });
        const timer = setInterval(() => {
          if (check()) send(': heartbeat\n\n');
        }, this.#options.heartbeat);
        stop = () => {
          if (stopped) return;
          stopped = true;
          unsubscribe();
          clearInterval(timer);
          signal.removeEventListener('abort', stop);
          checks.delete(check);
          if (checks.size === 0) this.#checks.delete(user);
        };
        checks.add(check);
        this.#checks.set(user, checks);
        signal.addEventListener('abort', stop);
      },
      cancel: () => {
        stop();
      },
    });
  }

  /** Ends every stream whose session no longer stands; called after a route that may revoke one. */
  recheck(): void {
    for (const checks of [...this.#checks.values()]) for (const check of [...checks]) check();
  }
}
