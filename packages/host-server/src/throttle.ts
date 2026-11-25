export interface ThrottleOptions {
  /** Failures allowed before the first wait. */
  readonly free?: number;
  /** The first wait in milliseconds; each further failure doubles it. */
  readonly base?: number;
  /** The longest wait in milliseconds. */
  readonly max?: number;
  /** How many keys it holds before it drops the ones quiet for an hour. */
  readonly limit?: number;
}

const QUIET = 3_600_000;

interface Entry {
  failures: number;
  last: number;
}

/**
 * Slows down guessing: after a few failures under one key (a name, an address) the next attempt
 * has to wait, twice as long after every further failure. It is kept in memory; a restart forgets it.
 */
export class Throttle {
  readonly #entries = new Map<string, Entry>();
  readonly #free: number;
  readonly #base: number;
  readonly #max: number;
  readonly #limit: number;

  constructor(options: ThrottleOptions = {}) {
    this.#free = options.free ?? 3;
    this.#base = options.base ?? 1000;
    this.#max = options.max ?? 300_000;
    this.#limit = options.limit ?? 10_000;
  }

  /** How many keys it holds. */
  get size(): number {
    return this.#entries.size;
  }

  /** How many milliseconds an attempt under these keys has to wait at `now`; 0 lets it through. */
  wait(keys: readonly string[], now: number): number {
    let longest = 0;
    for (const key of keys) {
      const entry = this.#entries.get(key);
      if (entry === undefined || now - entry.last >= QUIET || entry.failures < this.#free) continue;
      const delay = Math.min(this.#base * 2 ** (entry.failures - this.#free), this.#max);
      longest = Math.max(longest, entry.last + delay - now);
    }
    return longest;
  }

  /** Counts a failed attempt under each key. */
  fail(keys: readonly string[], now: number): void {
    if (this.#entries.size >= this.#limit) {
      for (const [key, entry] of this.#entries) if (now - entry.last >= QUIET) this.#entries.delete(key);
    }
    for (const key of keys) {
      const entry = this.#entries.get(key);
      const failures = entry === undefined || now - entry.last >= QUIET ? 1 : entry.failures + 1;
      this.#entries.set(key, { failures, last: now });
    }
  }

  /** Forgets the failures under a key. */
  clear(key: string): void {
    this.#entries.delete(key);
  }
}
