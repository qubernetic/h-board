import type { Library } from './model';
import { MAX_FILE, jsonBytes } from './size';

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

/** What a command leaves behind: the library after it, and its answer. */
export interface Outcome<R = unknown> {
  readonly library: Library;
  readonly value: R;
}

/**
 * One user action. The interface, the REST API and MCP all call it by `id`. It never changes the
 * library it gets; it returns the next one.
 */
export interface Command<P = unknown, R = unknown> {
  readonly id: string;
  readonly agentClass: AgentClass;
  /** Checks raw parameters, or throws a `CommandError` (`invalid`) that names the field. */
  parse(params: unknown): P;
  run(library: Library, params: P): Outcome<R>;
}

/** Who asks for a command to run. */
export type Actor =
  | { readonly kind: 'user' }
  | { readonly kind: 'agent'; readonly ownerScope: boolean };

export class CommandError extends Error {
  constructor(
    readonly code: 'unclassified' | 'duplicate' | 'unknown' | 'refused' | 'invalid' | 'missing',
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
    this.#commands.set(command.id, command as unknown as Command);
  }

  ids(): string[] {
    return [...this.#commands.keys()].sort();
  }

  agentClassOf(id: string): AgentClass | undefined {
    return this.#commands.get(id)?.agentClass;
  }

  /**
   * Runs a command on a library for an actor, or throws a `CommandError`. A command whose library
   * would be larger than `MAX_FILE` bytes as JSON is refused, unless it makes it no larger.
   */
  run(id: string, library: Library, params: unknown, actor: Actor): Outcome {
    const command = this.#commands.get(id);
    if (!command) {
      throw new CommandError('unknown', `no command ${id}`);
    }
    if (actor.kind === 'agent' && !agentMayRun(command.agentClass, actor.ownerScope)) {
      throw new CommandError('refused', `an agent may not run ${id} (${command.agentClass})`);
    }
    const outcome = command.run(library, command.parse(params));
    if (outcome.library !== library) {
      const bytes = jsonBytes(outcome.library);
      if (bytes > MAX_FILE && bytes > jsonBytes(library)) {
        throw new CommandError('invalid', `library: must be at most ${MAX_FILE} bytes`);
      }
    }
    return outcome;
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
