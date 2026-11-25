import { describe, expect, it } from 'vitest';
import { diffLibraries, summarise } from '../src/index';
import type { Library } from '../src/index';
import { library, run, site } from './support';

/** Runs commands one after the other as the user. */
function after(lib: Library, ...steps: [string, unknown][]): Library {
  return steps.reduce((current, [id, params]) => run(id, current, params).library, lib);
}

describe('diffLibraries', () => {
  it('finds nothing between a library and itself', () => {
    expect(diffLibraries(library, library)).toEqual([]);
    expect(diffLibraries(library, structuredClone(library))).toEqual([]);
  });

  it('names one added or removed site, and counts more', () => {
    const one = after(library, ['site.add', { group: 'g2', name: 'GitLab', url: 'https://gitlab.com' }]);
    expect(diffLibraries(library, one)).toEqual(['+GitLab in Development']);
    const two = after(one, ['site.add', { group: 'g2', name: 'Codeberg', url: 'https://codeberg.org' }]);
    expect(diffLibraries(library, two)).toEqual(['+2 sites in Development']);
    expect(diffLibraries(two, library)).toEqual(['-2 sites in Development']);
    expect(diffLibraries(one, library)).toEqual(['-GitLab in Development']);
  });

  it('says where a site moved, and when a group is reordered', () => {
    expect(diffLibraries(library, after(library, ['site.move', { site: 's1', group: 'g2', to: 0 }]))).toEqual([
      'moved s1 from Start to Development',
    ]);
    expect(diffLibraries(library, after(library, ['site.move', { site: 's3', to: 1 }]))).toEqual(['reordered Development']);
  });

  it('names an edited site', () => {
    expect(diffLibraries(library, after(library, ['site.update', { site: 's3', name: 'Grafana' }]))).toEqual([
      'edited Grafana in Development',
    ]);
  });

  it('names added, removed, renamed and reordered groups and icon modes', () => {
    expect(diffLibraries(library, after(library, ['group.add', { name: 'Reading' }]))).toEqual(['+group Reading']);
    expect(diffLibraries(library, after(library, ['group.remove', { group: 'g1' }]))).toEqual(['-group Start (2 sites)']);
    expect(diffLibraries(library, after(library, ['group.rename', { group: 'g1', name: 'Home' }]))).toEqual([
      'renamed Start to Home',
    ]);
    expect(diffLibraries(library, after(library, ['group.move', { group: 'g2', to: 0 }]))).toEqual(['groups reordered']);
    expect(diffLibraries(library, after(library, ['group.setIconMode', { group: 'g1', iconMode: 'initial' }]))).toEqual([
      'icons: initial in Start',
    ]);
  });

  it('names every todo change', () => {
    expect(diffLibraries(library, after(library, ['todo.add', { text: 'Call the client' }]))).toEqual([
      '+todo Call the client',
    ]);
    expect(diffLibraries(library, after(library, ['todo.remove', { todo: 't1' }]))).toEqual(['-todo Code review: PR #41']);
    const done = after(library, ['todo.toggle', { todo: 't1' }]);
    expect(diffLibraries(library, done)).toEqual(['done: Code review: PR #41']);
    expect(diffLibraries(done, library)).toEqual(['reopened: Code review: PR #41']);
    const edited: Library = { ...library, todos: [{ id: 't1', text: 'Code review: PR #42', done: false }] };
    expect(diffLibraries(library, edited)).toEqual(['edited todo Code review: PR #42']);
    const two = after(library, ['todo.add', { text: 'Call the client' }]);
    expect(diffLibraries(two, { ...two, todos: [...two.todos].reverse() })).toEqual(['todos reordered']);
  });

  it('counts the sites of a group that comes back', () => {
    const removed = after(library, ['group.remove', { group: 'g1' }]);
    expect(diffLibraries(removed, library)).toEqual(['+group Start (2 sites)']);
  });

  it('names every setting that changes, with its new value', () => {
    const changed = after(library, [
      'settings.set',
      { theme: 'light', density: 'dense', columns: 6, layout: 'compact', engine: 'google', motion: 'none', activeGroup: 'g1' },
    ]);
    expect(diffLibraries(library, changed)).toEqual([
      'theme: light',
      'density: dense',
      'columns: 6',
      'layout: compact',
      'search engine: Google',
      'motion: none',
      'opens on: Start',
    ]);
    expect(diffLibraries(changed, after(changed, ['settings.set', { columns: 0, activeGroup: null }]))).toEqual([
      'columns: as many as fit',
      'opens on: the first group',
    ]);
  });

  it('names the active group by its id when the library has no such group', () => {
    const lost = { ...library, settings: { ...library.settings, activeGroup: 'g9' } };
    expect(diffLibraries(library, lost)).toEqual(['opens on: g9']);
  });

  it('lists the changes of several groups in the order of the library they lead to', () => {
    const next = after(
      library,
      ['site.add', { group: 'g2', name: 'GitLab', url: 'https://gitlab.com' }],
      ['site.add', { group: 'g2', name: 'Codeberg', url: 'https://codeberg.org' }],
      ['site.remove', { site: 's1' }],
      ['settings.set', { theme: 'light' }],
    );
    expect(diffLibraries(library, next)).toEqual(['-s1 in Start', '+2 sites in Development', 'theme: light']);
  });

  it('shows site names as they are typed', () => {
    const start = { id: 'g1', name: 'Start', iconMode: 'brand', sites: [site('s1', '<b>x</b>')] } as const;
    const named: Library = { ...library, groups: [start, ...library.groups.slice(1)] };
    expect(diffLibraries(library, named)).toContain('-s2 in Start');
    expect(diffLibraries(library, named)).toContain('edited <b>x</b> in Start');
  });
});

describe('summarise', () => {
  it('joins up to three changes and counts the rest', () => {
    expect(summarise([])).toBe('no change');
    expect(summarise(['+2 sites in Development', 'theme: light'])).toBe('+2 sites in Development, theme: light');
    expect(summarise(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c and 2 more');
  });
});
