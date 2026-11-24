import type { LocalArea } from '../src/index';

/**
 * A stand-in for `chrome.storage.local`, shared by every page of one extension: values go in and
 * come out as JSON, as in the browser, and every page hears of every write.
 */
export class FakeLocalArea implements LocalArea {
  readonly items = new Map<string, string>();
  readonly #listeners: ((changes: Record<string, unknown>) => void)[] = [];
  /** The next `set` fails with this, once, as a full storage would. */
  failNext: Error | undefined;

  readonly onChanged = {
    addListener: (listener: (changes: Record<string, unknown>) => void): void => {
      this.#listeners.push(listener);
    },
  };

  get(keys: string[]): Promise<Record<string, unknown>> {
    const found: Record<string, unknown> = {};
    for (const key of keys) {
      const value = this.items.get(key);
      if (value !== undefined) found[key] = JSON.parse(value);
    }
    return Promise.resolve(found);
  }

  set(items: Record<string, unknown>): Promise<void> {
    const error = this.failNext;
    this.failNext = undefined;
    if (error) return Promise.reject(error);
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(items)) {
      this.items.set(key, JSON.stringify(value));
      changes[key] = { newValue: value };
    }
    // The browser tells the listeners after the write, not inside it.
    setTimeout(() => {
      for (const listener of this.#listeners) listener(changes);
    }, 0);
    return Promise.resolve();
  }

  /** What is kept under `key`, read back. */
  read(key: string): unknown {
    const value = this.items.get(key);
    return value === undefined ? undefined : JSON.parse(value);
  }

  /** Puts `value` under `key` without telling anyone, as an older version or a broken write would. */
  put(key: string, value: unknown): void {
    this.items.set(key, JSON.stringify(value));
  }
}
