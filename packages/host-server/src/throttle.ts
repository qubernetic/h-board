export interface ThrottleOptions {
  /** Failures allowed before the first wait. */
  readonly free?: number;
  /** The first wait in milliseconds; each further failure doubles it. */
  readonly base?: number;
  /** The longest wait in milliseconds. */
  readonly max?: number;
  /** How many keys it holds at most. */
  readonly limit?: number;
}

const QUIET = 3_600_000;

interface Entry {
  failures: number;
  /** When the last failure was counted. */
  last: number;
  /** Attempts that have begun and not yet ended. */
  pending: number;
  /** When the last of them began. */
  started: number;
}

/**
 * Slows down guessing: after a few failures under one key (a name, an address) the next attempt
 * has to wait, twice as long after every further failure. An attempt that has begun counts like a
 * failure until it ends, so attempts sent at once cannot all slip through while the first ones are
 * still being checked. It is kept in memory; a restart forgets it.
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
      if (entry === undefined) continue;
      const count = (now - entry.last >= QUIET ? 0 : entry.failures) + entry.pending;
      if (count < this.#free) continue;
      const delay = Math.min(this.#base * 2 ** (count - this.#free), this.#max);
      const since = entry.pending > 0 ? Math.max(entry.last, entry.started) : entry.last;
      longest = Math.max(longest, since + delay - now);
    }
    return longest;
  }

  /**
   * Begins an attempt under these keys: answers how many milliseconds it has to wait, or 0 and
   * counts it like a failure until `end`.
   */
  begin(keys: readonly string[], now: number): number {
    const ms = this.wait(keys, now);
    if (ms > 0) return ms;
    for (const key of keys) {
      const entry = this.#entry(key, now);
      if (entry === undefined) continue;
      entry.pending += 1;
      entry.started = now;
    }
    return 0;
  }

  /** Ends an attempt `begin` let through: a failure is counted, a success only ends it. */
  end(keys: readonly string[], now: number, ok: boolean): void {
    for (const key of keys) {
      const entry = this.#entries.get(key);
      if (entry !== undefined && entry.pending > 0) entry.pending -= 1;
      if (!ok) this.fail([key], now);
      else if (entry?.pending === 0 && entry.failures === 0) this.#entries.delete(key);
    }
  }

  /** Counts a failed attempt under each key. */
  fail(keys: readonly string[], now: number): void {
    for (const key of keys) {
      const entry = this.#entry(key, now);
      if (entry === undefined) continue;
      entry.failures += 1;
      entry.last = now;
    }
  }

  /** Forgets the failures under a key. */
  clear(key: string): void {
    this.#entries.delete(key);
  }

  /**
   * The entry of a key, made when it is missing; failures quiet for an hour are forgotten. When it
   * is full it drops the quiet keys, then keys below the free count, never one that imposes a wait;
   * when there is still no room it answers undefined and the key goes uncounted.
   */
  #entry(key: string, now: number): Entry | undefined {
    const entry = this.#entries.get(key);
    if (entry !== undefined) {
      if (now - entry.last >= QUIET) entry.failures = 0;
      return entry;
    }
    if (this.#entries.size >= this.#limit) {
      for (const [old, kept] of this.#entries) {
        if (kept.pending === 0 && now - kept.last >= QUIET) this.#entries.delete(old);
      }
      for (const [old, kept] of this.#entries) {
        if (this.#entries.size < this.#limit) break;
        if (kept.pending === 0 && kept.failures < this.#free) this.#entries.delete(old);
      }
      if (this.#entries.size >= this.#limit) return undefined;
    }
    const fresh: Entry = { failures: 0, last: now, pending: 0, started: now };
    this.#entries.set(key, fresh);
    return fresh;
  }
}
