/** The part of `chrome.action` the toolbar icon needs. */
export interface ActionApi {
  setIcon(details: { path: Record<number, string> }): Promise<void>;
}

/** The part of `chrome.offscreen` the toolbar icon needs. */
export interface OffscreenApi {
  hasDocument(): Promise<boolean>;
  createDocument(parameters: { url: string; reasons: string[]; justification: string }): Promise<void>;
}

/** What the offscreen page tells the service worker. */
export interface SchemeMessage {
  readonly type: 'scheme';
  readonly dark: boolean;
}

/** The toolbar icon has no background, so its ink is the one for the toolbar's colour. */
export function toolbarIcon(dark: boolean): Record<number, string> {
  const ink = dark ? 'on-dark' : 'on-light';
  return Object.fromEntries([16, 24, 32].map((size) => [size, `icons/toolbar-${ink}-${size}.png`]));
}

/** Sets the toolbar icon for a scheme message. Whether the message was one. */
export function followScheme(message: unknown, action: ActionApi): boolean {
  const scheme = message as Partial<SchemeMessage> | null;
  if (scheme?.type !== 'scheme' || typeof scheme.dark !== 'boolean') return false;
  void action.setIcon({ path: toolbarIcon(scheme.dark) });
  return true;
}

/**
 * The service worker cannot see the colour scheme, so an offscreen page (theme.html) watches it.
 * Opens that page unless it is open already.
 */
export async function watchScheme(offscreen: OffscreenApi): Promise<void> {
  if (await offscreen.hasDocument()) return;
  try {
    await offscreen.createDocument({
      url: 'theme.html',
      reasons: ['MATCH_MEDIA'],
      justification: 'Follow the colour scheme for the toolbar icon.',
    });
  } catch {
    // another start of the worker opened it in the meantime: there is only ever one
  }
}

/** The offscreen page's part: reports the scheme now and on every change. */
export function reportScheme(
  media: { readonly matches: boolean; addEventListener(type: 'change', listener: () => void): void },
  send: (message: SchemeMessage) => Promise<unknown>,
): void {
  const report = (): void => void send({ type: 'scheme', dark: media.matches });
  media.addEventListener('change', report);
  report();
}
