import { pad2 } from './dom';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How many calendar days on this computer's clock lie between `then` and `now`: 0 today, 1 yesterday. */
function daysBack(then: Date, now: Date): number {
  const midnight = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(now) - midnight(then)) / 86_400_000);
}

const hhmm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** `17 Nov` in this year, `3 Jan 2025` in another. */
function date(d: Date, now: Date): string {
  const day = `${d.getDate()} ${MONTHS[d.getMonth()] as string}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** How long ago `at` was: `just now`, `2 min ago`, `today, 09:15`, `yesterday, 23:59`, `Mon 09:15`, `17 Nov`. */
export function ago(at: number, now: Date): string {
  const then = new Date(at);
  const minutes = Math.floor((now.getTime() - at) / 60_000);
  const back = daysBack(then, now);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (back === 0) return `today, ${hhmm(then)}`;
  if (back === 1) return `yesterday, ${hhmm(then)}`;
  if (back < 7) return `${DAYS[then.getDay()] as string} ${hhmm(then)}`;
  return date(then, now);
}

/** When an agent key was last used, as its row in the key list says it: `last used 2 min ago`, `never used`. */
export function lastUsed(at: number | null, now: Date): string {
  return at === null ? 'never used' : `last used ${ago(at, now)}`;
}

/** When a copy was kept, as the offline notice says it: `14:20` today, `17 Nov 14:20` before. */
export function keptAt(at: number, now: Date): string {
  const then = new Date(at);
  return daysBack(then, now) === 0 ? hhmm(then) : `${date(then, now)} ${hhmm(then)}`;
}

/** The time column of the key log: `11:42:07` today, `Mon 09:15` in the last week, a date before. */
export function logTime(at: number, now: Date): string {
  const then = new Date(at);
  const back = daysBack(then, now);
  if (back === 0) return `${hhmm(then)}:${pad2(then.getSeconds())}`;
  if (back < 7) return `${DAYS[then.getDay()] as string} ${hhmm(then)}`;
  return date(then, now);
}
