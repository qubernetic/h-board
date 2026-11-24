import { Problems, record, text } from './check';
import type { Fields } from './check';
import { CommandError, CommandRegistry } from './commands';
import type { Command } from './commands';
import { readLibraryFile, writeLibraryFile } from './library-file';

/** Checks the parameters of a command as an object, then lets `read` take its fields. */
function fieldsOf<P>(read: (fields: Fields, problems: Problems) => P): (params: unknown) => P {
  return (params) => {
    const problems = new Problems();
    const fields = record(params ?? {}, 'params', problems) ?? {};
    const parsed = read(fields, problems);
    problems.throwIfAny();
    return parsed;
  };
}

const none = fieldsOf(() => ({}));

/** Keeps a command's own types where it is written, and lets the registry hold it with the others. */
function define<P, R>(command: Command<P, R>): Command {
  return command as unknown as Command;
}

const libraryExport = define<object, string>({
  id: 'library.export',
  agentClass: 'safe',
  parse: none,
  run: (library) => ({ library, value: writeLibraryFile(library) }),
});

const libraryImport = define<{ text: string }, { groups: number; sites: number; todos: number }>({
  id: 'library.import',
  agentClass: 'owner',
  parse: fieldsOf((fields, problems) => ({ text: text(fields.text, 'text', problems) })),
  run: (_library, params) => {
    const { library, problems } = readLibraryFile(params.text);
    if (problems.length > 0) throw new CommandError('invalid', problems.join('\n'));
    const sites = library.groups.reduce((sum, group) => sum + group.sites.length, 0);
    return { library, value: { groups: library.groups.length, sites, todos: library.todos.length } };
  },
});

/** Every library command, in the order the documentation lists them. */
export const LIBRARY_COMMANDS: readonly Command[] = [libraryExport, libraryImport];

/** A registry with every library command in it. */
export function createCommands(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const command of LIBRARY_COMMANDS) registry.register(command);
  return registry;
}
