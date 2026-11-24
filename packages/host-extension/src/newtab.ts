// The new tab page: wiring only. It hands the tab over to board.html (see focus.ts).
import { handOver } from './focus';
import type { TabsApi } from './focus';

const extension = (globalThis as { chrome?: { tabs?: TabsApi } }).chrome;

void handOver(extension?.tabs, new URL('board.html', location.href).href, (url) => {
  location.replace(url);
});
