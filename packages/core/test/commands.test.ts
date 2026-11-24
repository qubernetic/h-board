import { describe, expect, it } from 'vitest';
import { CommandError, CommandRegistry, emptyLibrary, isAgentClass } from '../src/index';
import type { Actor, Command, Library } from '../src/index';

const user: Actor = { kind: 'user' };
const agent: Actor = { kind: 'agent', ownerScope: false };
const ownerAgent: Actor = { kind: 'agent', ownerScope: true };
const library = emptyLibrary();

function fixed(id: string, agentClass: Command['agentClass'], value: string): Command<unknown, string> {
  return { id, agentClass, parse: (params) => params, run: (lib) => ({ library: lib, value }) };
}

function registry(): CommandRegistry {
  const commands = new CommandRegistry();
  commands.register(fixed('site.add', 'safe', 'added'));
  commands.register(fixed('site.remove', 'owner', 'removed'));
  commands.register(fixed('key.create', 'never', 'created'));
  return commands;
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof CommandError) return error.code;
    throw error;
  }
  return undefined;
}

describe('CommandRegistry', () => {
  it('refuses a command without an agent class', () => {
    const commands = new CommandRegistry();
    const unclassified = { id: 'site.add', parse: () => null, run: () => null } as unknown as Command;
    expect(codeOf(() => commands.register(unclassified))).toBe('unclassified');
    expect(commands.ids()).toEqual([]);
  });

  it('refuses a command with an unknown agent class', () => {
    const commands = new CommandRegistry();
    const wrong = { ...fixed('site.add', 'safe', ''), agentClass: 'anyone' } as unknown as Command;
    expect(codeOf(() => commands.register(wrong))).toBe('unclassified');
  });

  it('refuses a second command with the same id', () => {
    const commands = registry();
    expect(codeOf(() => commands.register(fixed('site.add', 'safe', '')))).toBe('duplicate');
  });

  it('lists the ids in order', () => {
    expect(registry().ids()).toEqual(['key.create', 'site.add', 'site.remove']);
  });

  it('tells the agent class of a command', () => {
    expect(registry().agentClassOf('site.remove')).toBe('owner');
    expect(registry().agentClassOf('site.fly')).toBeUndefined();
  });

  it('runs every class for the user', () => {
    const commands = registry();
    expect(commands.run('site.add', library, {}, user).value).toBe('added');
    expect(commands.run('site.remove', library, {}, user).value).toBe('removed');
    expect(commands.run('key.create', library, {}, user).value).toBe('created');
  });

  it('lets an agent run only safe commands', () => {
    const commands = registry();
    expect(commands.run('site.add', library, {}, agent).value).toBe('added');
    expect(codeOf(() => commands.run('site.remove', library, {}, agent))).toBe('refused');
    expect(codeOf(() => commands.run('key.create', library, {}, agent))).toBe('refused');
  });

  it('lets an agent with the owner scope run owner commands, never the never class', () => {
    const commands = registry();
    expect(commands.run('site.remove', library, {}, ownerAgent).value).toBe('removed');
    expect(codeOf(() => commands.run('key.create', library, {}, ownerAgent))).toBe('refused');
  });

  it('reports an unknown command', () => {
    expect(codeOf(() => registry().run('site.fly', library, {}, user))).toBe('unknown');
  });

  it('parses the parameters before it runs the command', () => {
    const commands = new CommandRegistry();
    const seen: unknown[] = [];
    commands.register<number, Library>({
      id: 'count',
      agentClass: 'safe',
      parse: (params) => {
        if (typeof params !== 'number') throw new CommandError('invalid', 'count: must be a number');
        return params * 2;
      },
      run: (lib, params) => {
        seen.push(params);
        return { library: lib, value: lib };
      },
    });
    expect(codeOf(() => commands.run('count', library, 'two', user))).toBe('invalid');
    commands.run('count', library, 2, user);
    expect(seen).toEqual([4]);
  });
});

describe('isAgentClass', () => {
  it('accepts the three classes only', () => {
    expect(['safe', 'owner', 'never'].every(isAgentClass)).toBe(true);
    expect([undefined, null, '', 'SAFE', 1].some(isAgentClass)).toBe(false);
  });
});
