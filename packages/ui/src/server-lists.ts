import { make } from './dom';
import { icon, sitesLabel } from './parts';
import type { AgentKey, KeyUse, ServerUser } from './server';
import type { ServerAsk } from './server-dialog';
import { lastUsed, logTime } from './when';

// The users list, the agent keys list and the key log of the Server section, after the "Server · users", "Server ·
// agent keys" and "Server · key log" frames of docs/design/h-board.figcraft. Every name, command and word from the
// server goes in as text.

/** How a use of a key ended, as the log says it; a word the page does not know is a failure. */
const OUTCOMES: Readonly<Record<string, string>> = {
  done: 'done',
  unchanged: 'nothing changed',
  'read-only': 'refused, the read scope only reads',
  'needs-owner': 'refused, needs the owner scope',
  never: 'refused, no agent key may run it',
  'temporary-password': 'refused, the password is temporary',
  unknown: 'refused',
  invalid: 'failed, a parameter was wrong',
  missing: 'failed, no such group, site or snapshot',
};

/** The outcomes that changed or read what was asked; every other is drawn as refused. */
const WENT = new Set(['done', 'unchanged']);

function small(doc: Document, text: string, run: () => void): HTMLButtonElement {
  const button = make(doc, 'button', '', text);
  button.type = 'button';
  button.addEventListener('click', run);
  return button;
}

/** A list row: the name and its tag on the first line, the detail and the small buttons on the second. */
function item(doc: Document, part: string, name: string, tag: string, detail: string, buttons: HTMLButtonElement[], hot = false): HTMLElement {
  const node = make(doc, 'div', 'item');
  node.dataset['part'] = part;
  node.dataset['name'] = name;
  const acts = make(doc, 'span', 'acts');
  acts.append(...buttons);
  node.append(make(doc, 'span', 'name', name), make(doc, 'span', hot ? 'tag hot' : 'tag', tag), make(doc, 'span', 'detail', detail), acts);
  return node;
}

/** A wide button with the plus at its end, as "New user…". */
export function addButton(doc: Document, part: string, text: string, run: () => void): HTMLButtonElement {
  const button = make(doc, 'button', 'wide add');
  button.type = 'button';
  button.dataset['part'] = part;
  button.append(make(doc, 'span', '', text), icon(doc, 'plus'));
  button.addEventListener('click', run);
  return button;
}

/** The admin's users list: every account, with Reset and Remove on every row but the admin's own. */
export function usersList(doc: Document, users: readonly ServerUser[], self: string, ask: (ask: ServerAsk) => void): HTMLElement[] {
  return [
    make(doc, 'div', 'head', `Users · ${users.length}`),
    ...users.map((user) =>
      item(
        doc,
        'user',
        user.name,
        user.admin ? 'admin' : 'user',
        user.temporary ? 'temporary password' : `own library · ${sitesLabel(user.sites)}`,
        user.name === self
          ? []
          : [small(doc, 'Reset', () => ask({ kind: 'reset', user })), small(doc, 'Remove', () => ask({ kind: 'remove', user }))],
      ),
    ),
    addButton(doc, 'new-user', 'New user…', () => ask({ kind: 'user' })),
    make(doc, 'div', 'hint', 'Everyone has an own library and own agent keys.'),
  ];
}

/** The user's agent keys, each with its scope, its last use and Revoke. */
export function keysList(doc: Document, keys: readonly AgentKey[], now: Date, ask: (ask: ServerAsk) => void, log: () => void): HTMLElement[] {
  const keyLog = make(doc, 'button', 'wide', 'Key log…');
  keyLog.type = 'button';
  keyLog.dataset['part'] = 'key-log';
  keyLog.addEventListener('click', log);
  return [
    make(doc, 'div', 'head', `Agent keys · ${keys.length}`),
    ...keys.map((key) =>
      item(doc, 'key', key.name, key.scope, lastUsed(key.usedAt, now), [small(doc, 'Revoke', () => ask({ kind: 'revoke', key }))], key.scope === 'owner'),
    ),
    addButton(doc, 'new-key', 'New key…', () => ask({ kind: 'key' })),
    keyLog,
    make(doc, 'div', 'hint', 'A key acts as you, within its scope. Every change it makes is kept as a snapshot under its name.'),
  ];
}

/** The uses of the user's keys, newest first: the time, the command, and the key, its scope and how it ended. */
export function keyLog(doc: Document, uses: readonly KeyUse[], now: Date): HTMLElement[] {
  const rows = uses.map((use) => {
    const node = make(doc, 'div', WENT.has(use.outcome) ? 'use' : 'use refused');
    node.dataset['part'] = 'use';
    const detail = `${use.key} · ${use.scope} · ${OUTCOMES[use.outcome] ?? 'failed'}`;
    node.append(
      make(doc, 'span', 'when', logTime(use.at, now)),
      make(doc, 'span', 'command', use.command ?? 'no such command'),
      make(doc, 'span', 'detail', detail),
    );
    return node;
  });
  return rows.length > 0 ? rows : [make(doc, 'div', 'hint', 'No key was used yet.')];
}
