// The service worker: wiring only. The toolbar button opens the settings, and the toolbar icon
// follows the colour scheme the offscreen page reports (see toolbar.ts).
import { followScheme, watchScheme } from './toolbar';
import type { ActionApi, OffscreenApi } from './toolbar';

interface Event<T extends (...args: never[]) => unknown> {
  addListener(listener: T): void;
}

declare const chrome: {
  action: ActionApi & { onClicked: Event<() => void> };
  offscreen: OffscreenApi;
  runtime: {
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
