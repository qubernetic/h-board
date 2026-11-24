// The board page of the extension: wiring only. The store in memory, with the sample library, is a placeholder
// until the extension keeps the library in its own storage.
import { sampleLibrary } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { mountBoard } from '@h-board/ui';

/** The part of `chrome.tabs` the board needs: a tab behind this one, for Shift and a jump code. */
interface Tabs {
  create(properties: { url: string; active: boolean }): Promise<unknown>;
}

const tabs = (globalThis as { chrome?: { tabs?: Tabs } }).chrome?.tabs;
const root = document.getElementById('board');
if (root) {
  void mountBoard(
    root,
    new MemoryStore({ initial: sampleLibrary }),
    tabs ? { openBehind: (url) => void tabs.create({ url, active: false }) } : {},
  );
}
