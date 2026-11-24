import { describe, expect, it } from 'vitest';
import { handOver } from '../src/index';
import type { TabInfo, TabsApi } from '../src/index';

function fakeTabs(current: TabInfo | undefined): { tabs: TabsApi; calls: unknown[] } {
  const calls: unknown[] = [];
  const tabs: TabsApi = {
    getCurrent: () => Promise.resolve(current),
    create: (properties) => {
      calls.push(['create', properties]);
      return Promise.resolve();
    },
    remove: (tabId) => {
      calls.push(['remove', tabId]);
      return Promise.resolve();
    },
  };
  return { tabs, calls };
}

const url = 'chrome-extension://abc/board.html';

describe('handOver', () => {
  it('opens the board in the place of the new tab, then closes the new tab', async () => {
    const { tabs, calls } = fakeTabs({ id: 7, index: 3, windowId: 2 });
    const navigated: string[] = [];
    expect(await handOver(tabs, url, (to) => navigated.push(to))).toBe('replaced');
    expect(calls).toEqual([
      ['create', { url, index: 3, windowId: 2, active: true }],
      ['remove', 7],
    ]);
    expect(navigated).toEqual([]);
  });

  it('navigates in place when the page is not in a tab the extension knows', async () => {
    const { tabs, calls } = fakeTabs(undefined);
    const navigated: string[] = [];
    expect(await handOver(tabs, url, (to) => navigated.push(to))).toBe('navigated');
    expect(calls).toEqual([]);
    expect(navigated).toEqual([url]);
  });

  it('navigates in place without the tabs API', async () => {
    const navigated: string[] = [];
    expect(await handOver(undefined, url, (to) => navigated.push(to))).toBe('navigated');
    expect(navigated).toEqual([url]);
  });
});

