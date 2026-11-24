import { emptyHistory, emptyLibrary, record } from '@h-board/core';
import type { History } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { previewLine, savedLine, whenOf } from '../src/restore';

const NOW = new Date(2026, 10, 23, 14, 32, 7);
const USER = { kind: 'user' } as const;

/** A history of `count` snapshots, the newest at `at`, each change a todo more. */
function history(count: number, at: number): History {
  let kept = emptyHistory();
  let library = emptyLibrary();
  for (let i = 0; i < count; i += 1) {
    if (i > 0) library = { ...library, todos: [...library.todos, { id: `t${i}`, text: `todo ${i}`, done: false }] };
    kept = record(kept, library, { source: USER, at: at - (count - 1 - i) * 60_000, alone: true });
  }
  return kept;
}

describe('whenOf', () => {
  it('names today, yesterday and an older day, with the time', () => {
    expect(whenOf(new Date(2026, 10, 23, 9, 5).getTime(), NOW)).toBe('today 09:05');
    expect(whenOf(new Date(2026, 10, 22, 23, 59).getTime(), NOW)).toBe('yesterday 23:59');
    expect(whenOf(new Date(2026, 10, 17, 8, 0).getTime(), NOW)).toBe('Nov 17 08:00');
    expect(whenOf(new Date(2025, 11, 31, 18, 30).getTime(), NOW)).toBe('Dec 31 18:30');
  });
});

describe('savedLine', () => {
  it('says when the newest snapshot was kept and how many there are', () => {
    expect(savedLine(history(3, NOW.getTime()))).toBe('saved · 14:32 · 3 snapshots');
    expect(savedLine(history(1, new Date(2026, 10, 23, 8, 4).getTime()))).toBe('saved · 08:04 · 1 snapshot');
  });

  it('says so when nothing is kept yet', () => {
    expect(savedLine(emptyHistory())).toBe('no snapshots');
  });
});

describe('previewLine', () => {
  it('lists every change a restore would make', () => {
    expect(previewLine(['+github in Development', 'theme: light'])).toBe(
      'If you restore it: +github in Development, theme: light.',
    );
  });

  it('says when the snapshot is the library as it is', () => {
    expect(previewLine([])).toBe('This is the library as it is now.');
  });
});
