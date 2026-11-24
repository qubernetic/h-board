// The settings page of the extension: the board with its settings shown. Wiring only (see start.ts).
import { startBoard } from './start';
import type { ExtensionApi } from './start';

const root = document.getElementById('board');
if (root) void startBoard(root, (globalThis as { chrome?: ExtensionApi }).chrome, { settings: true });
