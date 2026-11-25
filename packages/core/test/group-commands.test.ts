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
    expect(errorOf('group.add', library, { iconMode: 'emoji' }).message).toBe(
      'name: must be text\niconMode: must be one of brand, favicon, phosphor, initial',
    );
  });

  it('wants its parameters as an object', () => {
    expect(errorOf('group.add', library, 'Reading').message).toBe('params: must be an object');
  });
});

describe('group.import', () => {
  const groups = [
    { name: ' Bookmarks bar ', sites: [{ name: 'Docs', url: 'https://docs.example.com/' }] },
    {
      name: 'News',
      sites: [
        { name: 'Paper', url: 'https://paper.example.com/' },
        { name: 'Radio', url: 'http://radio.example.com/live' },
      ],
    },
  ];

  it('appends the groups with their sites, each with the next id', () => {
    const outcome = run('group.import', library, { groups });
    expect(outcome.value).toEqual({ groups: 2, sites: 3 });
    expect(outcome.library.groups.slice(2)).toEqual([
      {
        id: 'g3',
        name: 'Bookmarks bar',
        iconMode: 'brand',
        sites: [
          { id: 's5', name: 'Docs', url: 'https://docs.example.com/', description: '', glyph: 'globe', brand: null, icon: null },
        ],
      },
      {
        id: 'g4',
        name: 'News',
        iconMode: 'brand',
        sites: [
          { id: 's6', name: 'Paper', url: 'https://paper.example.com/', description: '', glyph: 'globe', brand: null, icon: null },
          { id: 's7', name: 'Radio', url: 'http://radio.example.com/live', description: '', glyph: 'globe', brand: null, icon: null },
        ],
      },
    ]);
    expect(groupIds(library)).toEqual(['g1', 'g2']);
  });

  it('names every wrong field and adds nothing', () => {
    const error = errorOf('group.import', library, {
      groups: [{ name: '', sites: [{ name: 'Run', url: 'javascript:alert(1)' }] }, { name: 'Empty', sites: 'none' }],
    });
    expect(error.message).toBe(
      'groups[0].name: must not be empty\ngroups[0].sites[0].url: must be an http or https address\ngroups[1].sites: must be a list',
    );
  });

  it('wants at least one group', () => {
    expect(errorOf('group.import', library, { groups: [] }).message).toBe('groups: must hold at least one group');
  });

  it('wants every group and every site as an object', () => {
    const error = errorOf('group.import', library, { groups: ['News', { name: 'Tools', sites: ['https://tools.example.com/'] }] });
    expect(error.message.split('\n')).toEqual([
      'groups[0]: must be an object',
      'groups[0].name: must be text',
      'groups[0].sites: must be a list',
      'groups[1].sites[0]: must be an object',
      'groups[1].sites[0].name: must be text',
      'groups[1].sites[0].url: must be an http or https address',
    ]);
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

  it('takes a name of up to 200 characters and refuses a longer one', () => {
    expect(run('group.rename', library, { group: 'g2', name: 'a'.repeat(200) }).library.groups[1]?.name).toHaveLength(200);
    expect(errorOf('group.rename', library, { group: 'g2', name: 'a'.repeat(201) }).message).toBe(
      'name: must be at most 200 characters',
    );
  });

  it('refuses a group that is not an id', () => {
    expect(errorOf('group.rename', library, { group: 'g 2', name: 'Code' }).message).toBe(
      'group: must be an id of letters, digits, - and _',
    );
    expect(errorOf('group.rename', library, { group: 2, name: 'Code' }).message).toBe(
      'group: must be an id of letters, digits, - and _',
    );
  });
});

describe('group.setIconMode', () => {
  it('sets the icon mode of a group', () => {
    const outcome = run('group.setIconMode', library, { group: 'g1', iconMode: 'phosphor' });
    expect(outcome.library.groups[0]?.iconMode).toBe('phosphor');
  });

  it("takes the browser's favicons", () => {
    expect(run('group.setIconMode', library, { group: 'g1', iconMode: 'favicon' }).library.groups[0]?.iconMode).toBe(
      'favicon',
    );
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
