const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The ISO 8601 week of a date: weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The hero's date line, the hours and minutes, and the seconds, in local time. */
export function clockParts(date: Date): { date: string; time: string; seconds: string } {
  const day = DAYS[date.getDay()] as string;
  const month = MONTHS[date.getMonth()] as string;
  return {
    date: `${day} · ${date.getDate()} ${month} ${date.getFullYear()} · week ${isoWeek(date)}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
    seconds: `:${pad2(date.getSeconds())}`,
  };
}
