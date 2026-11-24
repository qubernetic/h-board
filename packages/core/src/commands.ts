/**
 * What an agent may do with a command.
 *
 * - `safe`: an agent key may run it.
 * - `owner`: an agent key needs the owner scope.
 * - `never`: no agent key may run it; only the user can.
 */
export const AGENT_CLASSES = ['safe', 'owner', 'never'] as const;

export type AgentClass = (typeof AGENT_CLASSES)[number];

export function isAgentClass(value: unknown): value is AgentClass {
  return typeof value === 'string' && (AGENT_CLASSES as readonly string[]).includes(value);
}

/** One user action. The interface, the REST API and MCP all call it by `id`. */
export interface Command<P = unknown, R = unknown> {
  readonly id: string;
  readonly agentClass: AgentClass;
  run(params: P): R;
}

/** Who asks for a command to run. */
export type Actor =
  | { readonly kind: 'user' }
  | { readonly kind: 'agent'; readonly ownerScope: boolean };

export class CommandError extends Error {
  constructor(
    readonly code: 'unclassified' | 'duplicate' | 'unknown' | 'refused',
    message: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export class CommandRegistry {
  readonly #commands = new Map<string, Command>();

  /** Adds a command. A command without a valid agent class is refused. */
  register<P, R>(command: Command<P, R>): void {
    const agentClass: unknown = command.agentClass;
    if (!isAgentClass(agentClass)) {
      throw new CommandError('unclassified', `command ${command.id} has no agent class`);
    }
    if (this.#commands.has(command.id)) {
      throw new CommandError('duplicate', `command ${command.id} is already registered`);
    }
    this.#commands.set(command.id, command as Command);
  }

  ids(): string[] {
    return [...this.#commands.keys()].sort();
  }

  /** Runs a command for an actor, or throws a `CommandError`. */
  run(id: string, params: unknown, actor: Actor): unknown {
    const command = this.#commands.get(id);
    if (!command) {
      throw new CommandError('unknown', `no command ${id}`);
    }
    if (actor.kind === 'agent' && !agentMayRun(command.agentClass, actor.ownerScope)) {
      throw new CommandError('refused', `an agent may not run ${id} (${command.agentClass})`);
    }
    return command.run(params);
  }
}

function agentMayRun(agentClass: AgentClass, ownerScope: boolean): boolean {
  switch (agentClass) {
    case 'safe':
      return true;
    case 'owner':
      return ownerScope;
    case 'never':
      return false;
  }
}
