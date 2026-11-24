import { describe, expect, it } from 'vitest';
import { CommandError, CommandRegistry, isAgentClass } from '../src/index';
import type { Actor, Command } from '../src/index';

const user: Actor = { kind: 'user' };
const agent: Actor = { kind: 'agent', ownerScope: false };
const ownerAgent: Actor = { kind: 'agent', ownerScope: true };

function registry(): CommandRegistry {
  const commands = new CommandRegistry();
  commands.register({ id: 'site.add', agentClass: 'safe', run: () => 'added' });
  commands.register({ id: 'site.remove', agentClass: 'owner', run: () => 'removed' });
  commands.register({ id: 'key.create', agentClass: 'never', run: () => 'created' });
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
    const unclassified = { id: 'site.add', run: () => null } as unknown as Command;
    expect(codeOf(() => commands.register(unclassified))).toBe('unclassified');
    expect(commands.ids()).toEqual([]);
  });

  it('refuses a command with an unknown agent class', () => {
    const commands = new CommandRegistry();
    const wrong = { id: 'site.add', agentClass: 'anyone', run: () => null } as unknown as Command;
    expect(codeOf(() => commands.register(wrong))).toBe('unclassified');
  });

  it('refuses a second command with the same id', () => {
    const commands = registry();
    expect(codeOf(() => commands.register({ id: 'site.add', agentClass: 'safe', run: () => null }))).toBe(
      'duplicate',
    );
  });

  it('lists the ids in order', () => {
    expect(registry().ids()).toEqual(['key.create', 'site.add', 'site.remove']);
  });

  it('runs every class for the user', () => {
    const commands = registry();
    expect(commands.run('site.add', {}, user)).toBe('added');
    expect(commands.run('site.remove', {}, user)).toBe('removed');
    expect(commands.run('key.create', {}, user)).toBe('created');
  });

  it('lets an agent run only safe commands', () => {
    const commands = registry();
    expect(commands.run('site.add', {}, agent)).toBe('added');
    expect(codeOf(() => commands.run('site.remove', {}, agent))).toBe('refused');
    expect(codeOf(() => commands.run('key.create', {}, agent))).toBe('refused');
  });

  it('lets an agent with the owner scope run owner commands, never the never class', () => {
    const commands = registry();
    expect(commands.run('site.remove', {}, ownerAgent)).toBe('removed');
    expect(codeOf(() => commands.run('key.create', {}, ownerAgent))).toBe('refused');
  });

  it('reports an unknown command', () => {
    expect(codeOf(() => registry().run('site.fly', {}, user))).toBe('unknown');
  });
});

describe('isAgentClass', () => {
  it('accepts the three classes only', () => {
    expect(['safe', 'owner', 'never'].every(isAgentClass)).toBe(true);
    expect([undefined, null, '', 'SAFE', 1].some(isAgentClass)).toBe(false);
  });
});
