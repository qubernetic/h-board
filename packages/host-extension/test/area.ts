import type { LocalArea } from '@h-board/store';

/** A stand-in for `chrome.storage.local`: values go in and come out as JSON, as in the browser. */
export class FakeArea implements LocalArea {
  readonly items = new Map<string, string>();
  readonly onChanged = { addListener: (): void => undefined };

  get(keys: string[]): Promise<Record<string, unknown>> {
    const found: Record<string, unknown> = {};
    for (const key of keys) {
      const value = this.items.get(key);
      if (value !== undefined) found[key] = JSON.parse(value);
    }
    return Promise.resolve(found);
  }

  set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) this.items.set(key, JSON.stringify(value));
    return Promise.resolve();
  }

  read(key: string): unknown {
    const value = this.items.get(key);
    return value === undefined ? undefined : JSON.parse(value);
  }
}
