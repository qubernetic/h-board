/** The part of a browser tab the hand-over needs. */
export interface TabInfo {
  readonly id?: number | undefined;
  readonly index: number;
  readonly windowId: number;
}

/** The part of `chrome.tabs` the hand-over needs. */
export interface TabsApi {
  getCurrent(): Promise<TabInfo | undefined>;
  create(properties: { url: string; index: number; windowId: number; active: boolean }): Promise<unknown>;
  remove(tabId: number): Promise<void>;
}

/**
 * Hands the new tab over to the board page with the keyboard focus in the page.
 *
 * A new tab keeps the focus in the address bar, and navigating it in place does not move it. A tab
 * the extension opens with a url gets the page focus, so open one in this tab's place and close
 * this one. Without the tabs API (the page opened outside an extension) fall back to `navigate`.
 */
export async function handOver(
  tabs: TabsApi | undefined,
  url: string,
  navigate: (url: string) => void,
): Promise<'replaced' | 'navigated'> {
  const tab = await tabs?.getCurrent();
  if (!tabs || tab?.id === undefined) {
    navigate(url);
    return 'navigated';
  }
  await tabs.create({ url, index: tab.index, windowId: tab.windowId, active: true });
  await tabs.remove(tab.id);
  return 'replaced';
}
