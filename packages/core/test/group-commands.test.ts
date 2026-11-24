import { describe, expect, it } from 'vitest';
import { errorOf, groupIds, library, run } from './support';

describe('group.add', () => {
  it('appends a group with the next id and brand icons', () => {
    const outcome = run('group.add', library, { name: '  Reading ' });
    expect(outcome.value).toBe('g3');
    expect(outcome.library.groups[2]).toEqual({ id: 'g3', name: 'Reading', iconMode: 'brand', sites: [] });
  });

  it('takes an icon mode', () => {
    expect(run('group.add', library, { name: 'Tools', iconMode: 'initial' }).library.groups[2]?.iconMode).toBe(
      'initial',
    );
  });

  it('leaves the library it got as it was', () => {
    run('group.add', library, { name: 'Reading' });
    expect(groupIds(library)).toEqual(['g1', 'g2']);
  });

  it('names a missing name and a wrong icon mode', () => {
    expect(errorOf('group.add', library, { iconMode: 'favicon' }).message).toBe(
      'name: must be text\niconMode: must be one of brand, phosphor, initial',
    );
  });

  it('wants its parameters as an object', () => {
    expect(errorOf('group.add', library, 'Reading').message).toBe('params: must be an object');
  });
});

describe('group.rename', () => {
  it('renames a group', () => {
    const outcome = run('group.rename', library, { group: 'g2', name: 'Code' });
    expect(outcome.library.groups.map((group) => group.name)).toEqual(['Start', 'Code']);
  });

  it('names a group that is not there', () => {
    const error = errorOf('group.rename', library, { group: 'g9', name: 'Code' });
    expect(error.code).toBe('missing');
    expect(error.message).toBe('group: no group g9');
  });
});

describe('group.setIconMode', () => {
  it('sets the icon mode of a group', () => {
    const outcome = run('group.setIconMode', library, { group: 'g1', iconMode: 'phosphor' });
    expect(outcome.library.groups[0]?.iconMode).toBe('phosphor');
  });
});

describe('group.move', () => {
  it('moves a group to a place', () => {
    expect(groupIds(run('group.move', library, { group: 'g2', to: 0 }).library)).toEqual(['g2', 'g1']);
  });

  it('refuses a place outside the list', () => {
    expect(errorOf('group.move', library, { group: 'g2', to: 2 }).message).toBe(
      'to: must be a whole number from 0 to 1',
    );
  });
});

describe('group.remove', () => {
  it('removes a group with its sites', () => {
    const outcome = run('group.remove', library, { group: 'g1' });
    expect(groupIds(outcome.library)).toEqual(['g2']);
    expect(outcome.library.settings.activeGroup).toBe('g2');
  });

  it('opens on the neighbour when the active group goes', () => {
    expect(run('group.remove', library, { group: 'g2' }).library.settings.activeGroup).toBe('g1');
  });

  it('opens on no group when the last one goes', () => {
    const one = run('group.remove', library, { group: 'g1' }).library;
    expect(run('group.remove', one, { group: 'g2' }).library.settings.activeGroup).toBeNull();
  });
});
