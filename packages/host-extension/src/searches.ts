import { HISTORY_SIZE } from '@h-board/core';
import type { LocalArea } from '@h-board/store';
import { memoryHistory } from '@h-board/ui';
import type { SearchHistory } from '@h-board/ui';

const KEY = 'searches';

/**
 * The search line's last searches, kept in the extension's local storage on this computer, next to
 * the library. Read once when the page starts; every save writes them back.
 */
export async function storedSearches(area: Pick<LocalArea, 'get' | 'set'>): Promise<SearchHistory> {
  const { [KEY]: kept } = await area.get([KEY]);
  const initial = Array.isArray(kept) ? kept.filter((item): item is string => typeof item === 'string') : [];
  const history = memoryHistory(initial.slice(0, HISTORY_SIZE));
  return {
    load: () => history.load(),
    save: (searches) => {
      history.save(searches);
      void area.set({ [KEY]: [...searches] });
    },
  };
}
