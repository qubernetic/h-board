// @vitest-environment happy-dom
import { drum, sampleLibrary } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { wheel } from '../src/parts';

describe('the wheel of groups', () => {
  it('leaves out the rows that would run into the head or the foot of a short rail', () => {
    const groups = sampleLibrary().groups;
    const h = 320;
    const rows = drum(0, groups.map((group) => group.name), 280, h);
    const hidden = rows.filter((row) => !row.visible);
    expect(hidden.length).toBeGreaterThan(0);
    const buttons = wheel(document, groups, 0, 280, h).filter((node) => node.classList.contains('drum-row'));
    expect(buttons.map((button) => Number(button.dataset['index']))).toEqual(
      rows.filter((row) => row.visible).map((row) => row.index),
    );
  });
});
