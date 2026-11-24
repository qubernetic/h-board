import { expect, it } from 'vitest';
import { emptyLibrary } from '../src/index';

it('starts with an empty library of schema 1', () => {
  expect(emptyLibrary()).toEqual({ schema: 1, groups: [] });
});
