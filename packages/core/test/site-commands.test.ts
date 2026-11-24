import { describe, expect, it } from 'vitest';
import { errorOf, library, run, site, siteIds } from './support';

describe('site.add', () => {
  it('appends a site to a group with the next id', () => {
    const outcome = run('site.add', library, { group: 'g2', name: 'docs.rs', url: 'https://docs.rs' });
    expect(outcome.value).toBe('s5');
    expect(outcome.library.groups[1]?.sites[2]).toEqual({
      id: 's5',
      name: 'docs.rs',
      url: 'https://docs.rs',
      description: '',
      glyph: 'globe',
      brand: null,
      icon: null,
    });
  });

  it('takes a description, a glyph, a brand, an icon and a place', () => {
    const outcome = run('site.add', library, {
      group: 'g1',
      name: 'github',
      url: 'https://github.com',
      description: 'Repos and pull requests.',
      glyph: 'github-logo',
      brand: 'github',
      icon: 'brand',
      at: 0,
    });
    expect(siteIds(outcome.library)[0]).toEqual(['s5', 's1', 's2']);
    expect(outcome.library.groups[0]?.sites[0]).toMatchObject({ glyph: 'github-logo', brand: 'github', icon: 'brand' });
  });

  it('names every wrong field', () => {
    expect(errorOf('site.add', library, { group: 'g1', name: '', url: 'ftp://x', brand: 'Git Hub' }).message).toBe(
      [
        'name: must not be empty',
        'url: must be an http or https address',
        'brand: must be null or a slug of lower-case letters and digits',
      ].join('\n'),
    );
  });

  it('wants a name and an address', () => {
    expect(errorOf('site.add', library, { group: 'g1' }).message).toBe(
      'name: must be text\nurl: must be an http or https address',
    );
  });

  it('refuses a place past the end of the group', () => {
    expect(errorOf('site.add', library, { group: 'g1', name: 'x', url: 'https://x.example.com', at: 3 }).message).toBe(
      'at: must be a whole number from 0 to 2',
    );
  });

  it('names a group that is not there', () => {
    expect(errorOf('site.add', library, { group: 'g9', name: 'x', url: 'https://x.example.com' }).code).toBe(
      'missing',
    );
  });
});

describe('site.update', () => {
  it('changes only the fields it gets', () => {
    const outcome = run('site.update', library, { site: 's3', name: 'GitHub', icon: null, description: 'Code.' });
    expect(outcome.library.groups[1]?.sites[0]).toEqual({ ...site('s3'), name: 'GitHub', description: 'Code.' });
    expect(outcome.library.groups[0]).toBe(library.groups[0]);
  });

  it('wants at least one field to change', () => {
    expect(errorOf('site.update', library, { site: 's3' }).message).toBe(
      'site.update: give at least one of name, url, description, glyph, brand, icon',
    );
  });

  it('takes an address up to 2048 characters and refuses a longer one', () => {
    const at = (length: number) => 'https://x.example.com/' + 'a'.repeat(length - 22);
    expect(run('site.update', library, { site: 's3', url: at(2048) }).library.groups[1]?.sites[0]?.url).toBe(at(2048));
    expect(errorOf('site.update', library, { site: 's3', url: at(2049) }).message).toBe(
      'url: must be at most 2048 characters',
    );
  });

  it('names a site that is not there', () => {
    const error = errorOf('site.update', library, { site: 's9', name: 'x' });
    expect(error.code).toBe('missing');
    expect(error.message).toBe('site: no site s9');
  });
});

describe('site.move', () => {
  it('moves a site inside its group', () => {
    expect(siteIds(run('site.move', library, { site: 's2', to: 0 }).library)).toEqual([
      ['s2', 's1'],
      ['s3', 's4'],
    ]);
  });

  it('moves a site to another group', () => {
    expect(siteIds(run('site.move', library, { site: 's1', group: 'g2', to: 2 }).library)).toEqual([
      ['s2'],
      ['s3', 's4', 's1'],
    ]);
  });

  it('refuses a place outside the target group', () => {
    expect(errorOf('site.move', library, { site: 's1', group: 'g2', to: 3 }).message).toBe(
      'to: must be a whole number from 0 to 2',
    );
    expect(errorOf('site.move', library, { site: 's1', to: 2 }).message).toBe('to: must be a whole number from 0 to 1');
  });
});

describe('site.remove', () => {
  it('removes a site', () => {
    expect(siteIds(run('site.remove', library, { site: 's3' }).library)).toEqual([['s1', 's2'], ['s4']]);
  });

  it('names a site that is not there', () => {
    expect(errorOf('site.remove', library, { site: 's9' }).code).toBe('missing');
  });
});
