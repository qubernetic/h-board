import { describe, expect, it } from 'vitest';
import { CommandError, LIBRARY_COMMANDS, createCommands } from '../src/index';
import { library } from './support';

/** Every library command and its agent class. A new command gets a row here and a test of its own. */
const CLASSES = {
  'group.add': 'safe',
  'group.move': 'safe',
  'group.remove': 'owner',
  'group.rename': 'safe',
  'group.setIconMode': 'safe',
  'library.export': 'safe',
  'library.import': 'owner',
  'settings.set': 'safe',
  'site.add': 'safe',
  'site.move': 'safe',
  'site.remove': 'owner',
  'site.update': 'safe',
  'todo.add': 'safe',
  'todo.remove': 'owner',
  'todo.toggle': 'safe',
};

describe('the library commands', () => {
  const commands = createCommands();

  it('are all registered, each with its agent class', () => {
    expect(Object.fromEntries(commands.ids().map((id) => [id, commands.agentClassOf(id)]))).toEqual(CLASSES);
    expect(LIBRARY_COMMANDS).toHaveLength(Object.keys(CLASSES).length);
  });

  it('refuse an agent without the owner scope a removal or an import', () => {
    const agent = { kind: 'agent', ownerScope: false } as const;
    for (const [id, params] of [
      ['group.remove', { group: 'g1' }],
      ['site.remove', { site: 's1' }],
      ['todo.remove', { todo: 't1' }],
      ['library.import', { text: '{}' }],
    ] as const) {
      expect(() => commands.run(id, library, params, agent)).toThrow(new CommandError('refused', `an agent may not run ${id} (owner)`));
    }
    expect(commands.run('todo.toggle', library, { todo: 't1' }, agent).value).toBe(true);
  });
});
