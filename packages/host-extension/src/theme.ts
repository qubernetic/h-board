// The offscreen page: wiring only. It watches the colour scheme for the toolbar icon (see toolbar.ts).
import { reportScheme } from './toolbar';
import type { SchemeMessage } from './toolbar';

declare const chrome: { runtime: { sendMessage(message: SchemeMessage): Promise<unknown> } };

reportScheme(matchMedia('(prefers-color-scheme: dark)'), (message) => chrome.runtime.sendMessage(message));
