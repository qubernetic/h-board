// The service worker: wiring only. The toolbar button opens the settings, the toolbar icon
// follows the colour scheme the offscreen page reports (see toolbar.ts), and the keyword h routes
// the address bar (see omnibox.ts).
import { sampleLibrary } from '@h-board/core';
import { ExtStore } from '@h-board/store';
import type { LocalArea } from '@h-board/store';
import { routeTyped, watchOmnibox } from './omnibox';
import type { OmniboxApi, OmniboxTabs } from './omnibox';
import { followScheme, watchScheme } from './toolbar';
import type { ActionApi, OffscreenApi } from './toolbar';

interface Event<T extends (...args: never[]) => unknown> {
  addListener(listener: T): void;
}

declare const chrome: {
  action: ActionApi & { onClicked: Event<() => void> };
  offscreen: OffscreenApi;
  omnibox: OmniboxApi;
  tabs: OmniboxTabs;
  storage: { local: LocalArea };
  runtime: {
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
    onMessage: Event<(message: unknown) => void>;
    onStartup: Event<() => void>;
    onInstalled: Event<() => void>;
  };
};

chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((message) => void followScheme(message, chrome.action));
const watch = (): void => void watchScheme(chrome.offscreen);
chrome.runtime.onStartup.addListener(watch);
chrome.runtime.onInstalled.addListener(watch);
watch();

const area = chrome.storage.local;
const store = new ExtStore(area, { initial: sampleLibrary });
watchOmnibox({
  omnibox: chrome.omnibox,
  tabs: chrome.tabs,
  board: chrome.runtime.getURL('newtab.html'),
  where: (text) => routeTyped(store, area, text),
});
