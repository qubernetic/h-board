// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentKey, KeyUse, ServerAccess, ServerState, ServerUser } from '../src/index';
import { flush, mount, part, press } from './mount';

const SERVER = 'https://hboard.example.com';
const ADMIN: ServerState = { stage: 'signed-in', address: SERVER, user: { name: 'anna', admin: true } };
const USER: ServerState = { stage: 'signed-in', address: SERVER, user: { name: 'mari', admin: false } };

/** Monday 23 November 2026, 14:32:07, the clock `mount` gives the board. */
const at = (day: number, hours: number, minutes: number, seconds = 0): number => new Date(2026, 10, day, hours, minutes, seconds).getTime();

const USERS: ServerUser[] = [
  { id: 1, name: 'anna', admin: true, temporary: false, sites: 84 },
  { id: 2, name: 'mari', admin: false, temporary: false, sites: 1 },
  { id: 3, name: 'paul', admin: false, temporary: true, sites: 0 },
];

const KEYS: AgentKey[] = [
  { id: 4, name: 'claude-desktop', scope: 'edit', usedAt: at(23, 14, 30) },
  { id: 7, name: 'n8n-nightly', scope: 'read', usedAt: at(22, 2, 0) },
  { id: 9, name: 'old-laptop', scope: 'owner', usedAt: null },
];

const LOG: KeyUse[] = [
  { at: at(23, 11, 42, 7), key: 'claude-desktop', scope: 'edit', command: 'site.add', outcome: 'done' },
  { at: at(23, 2, 0, 2), key: 'n8n-nightly', scope: 'read', command: 'site.add', outcome: 'read-only' },
  { at: at(23, 1, 0, 0), key: 'n8n-nightly', scope: 'read', command: null, outcome: 'unknown' },
  { at: at(23, 0, 30, 0), key: 'old-laptop', scope: 'owner', command: 'site.remove', outcome: 'missing' },
  { at: at(23, 0, 20, 0), key: 'old-laptop', scope: 'owner', command: 'site.add', outcome: 'surprise' },
  { at: at(23, 0, 10, 0), key: 'old-laptop', scope: 'owner', command: 'library.read', outcome: 'unchanged' },
  { at: at(17, 9, 15), key: 'claude-desktop', scope: 'edit', command: 'group.remove', outcome: 'needs-owner' },
];

/** A signed-in server the test drives: lists it answers, every call noted, and a refusal when `refuse` is set. */
function fakeServer(state: ServerState) {
  const f = {
    state,
    users: [...USERS],
    keys: [...KEYS],
    log: [...LOG],
    calls: [] as unknown[][],
    /** The message the next call fails with. */
    refuse: undefined as string | undefined,
  };
  const answer = <T>(name: string, value: () => T, ...args: unknown[]): Promise<T> => {
    f.calls.push([name, ...args]);
    const { refuse } = f;
    f.refuse = undefined;
    return refuse === undefined ? Promise.resolve(value()) : Promise.reject(new Error(refuse));
  };
  const none = (): Promise<void> => Promise.resolve();
  const access: ServerAccess = {
    state: () => f.state,
    connect: none,
    setup: none,
    signIn: none,
    changePassword: none,
    send: none,
    skip: none,
    signOut: none,
    local: none,
    users: () => answer('users', () => f.users),
    addUser: (name) => answer('addUser', () => 'tulip-brisk-ember-92', name),
    resetPassword: (id) => answer('resetPassword', () => 'otter-plain-coast-17', id),
    removeUser: (id) => answer('removeUser', () => undefined, id),
    keys: () => answer('keys', () => f.keys),
    makeKey: (name, scope) => answer('makeKey', () => 'hbk_3f9a1c7e5b2d4a60b8c1e97d2f4a6b03', name, scope),
    revokeKey: (id) => answer('revokeKey', () => undefined, id),
    keyLog: () => answer('keyLog', () => f.log),
  };
  return { f, access };
}

async function open(state: ServerState) {
  const { f, access } = fakeServer(state);
  const { main } = await mount(undefined, { server: access, openSettings: true });
  await flush();
  return { f, main, section: part(main, 'server'), dialog: part(main, 'server-dialog') as HTMLDialogElement };
}

const texts = (root: ParentNode, selector: string): (string | null)[] => [...root.querySelectorAll(selector)].map((node) => node.textContent);

const row = (section: HTMLElement, part: string, name: string): HTMLElement => {
  const found = [...section.querySelectorAll<HTMLElement>(`[data-part="${part}"]`)].find((node) => node.dataset['name'] === name);
  if (!found) throw new Error(`no ${part} ${name}`);
  return found;
};

const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === text);
  if (!found) throw new Error(`no button ${text}`);
  return found;
};

const type = (root: ParentNode, name: string, value: string): void => {
  (part(root, name) as HTMLInputElement).value = value;
};

const submit = (dialog: HTMLElement): void => {
  dialog.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

/** The dialog's title, without its `[ + ]`. */
const title = (dialog: HTMLElement): string | null | undefined => dialog.querySelector('.txt')?.textContent;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the users list', () => {
  it('lists every user for the admin, with what the server knows of each, and the own row without buttons', async () => {
    const { section } = await open(ADMIN);
    expect(texts(section, '.head')).toEqual(['Server', 'Users · 3', 'Agent keys · 3']);
    expect(texts(section, '[data-part="user"] .name')).toEqual(['anna', 'mari', 'paul']);
    expect(texts(section, '[data-part="user"] .tag')).toEqual(['admin', 'user', 'user']);
    expect(texts(section, '[data-part="user"] .detail')).toEqual(['own library · 84 sites', 'own library · 1 site', 'temporary password']);
    expect(texts(row(section, 'user', 'anna'), 'button')).toEqual([]);
    expect(texts(row(section, 'user', 'mari'), 'button')).toEqual(['Reset', 'Remove']);
    expect(part(section, 'new-user').firstChild?.textContent).toBe('New user…');
    expect(texts(section, '.hint')).toContain('Everyone has an own library and own agent keys.');
  });

  it('is not there for a user who is not an admin', async () => {
    const { f, section } = await open(USER);
    expect(texts(section, '.head')).toEqual(['Server', 'Agent keys · 3']);
    expect(section.querySelector('[data-part="new-user"]')).toBeNull();
    expect(f.calls.map(([name]) => name)).toEqual(['keys']);
  });

  it('shows a name from the server as text', async () => {
    const { f, access } = fakeServer(ADMIN);
    f.users = [...USERS, { id: 5, name: '<img src=x onerror=alert(1)>', admin: false, temporary: false, sites: 2 }];
    const { main } = await mount(undefined, { server: access, openSettings: true });
    await flush();
    const section = part(main, 'server');
    expect(section.querySelector('img')).toBeNull();
    expect(texts(section, '[data-part="user"] .name')).toContain('<img src=x onerror=alert(1)>');
  });

  it('says why a list cannot be read', async () => {
    const { access } = fakeServer(ADMIN);
    const users = vi.fn(() => Promise.reject(new Error('The server cannot be reached at https://hboard.example.com.')));
    const { main } = await mount(undefined, { server: { ...access, users }, openSettings: true });
    await flush();
    const section = part(main, 'server');
    expect(texts(section, '.box')).toContain('The server cannot be reached at https://hboard.example.com.');
    expect(texts(section, '.head')).toEqual(['Server', 'Users', 'Agent keys · 3']);
  });

  it('reads the lists again each time the settings open', async () => {
    const { f, main } = await open(ADMIN);
    f.calls = [];
    part(main, 'settings').click();
    part(main, 'settings').click();
    await flush();
    expect(f.calls.map(([name]) => name).sort()).toEqual(['keys', 'users']);
  });

  it('adds a user and shows the temporary password once', async () => {
    const { f, section, dialog } = await open(ADMIN);
    part(section, 'new-user').click();
    expect(dialog.open).toBe(true);
    expect(title(dialog)).toBe('New user');
    type(dialog, 'dialog-name', 'paul');
    f.users = [...USERS];
    submit(dialog);
    await flush();
    expect(f.calls).toContainEqual(['addUser', 'paul']);
    expect(title(dialog)).toBe('New user · created');
    const secret = part(dialog, 'dialog-secret') as HTMLInputElement;
    expect(secret.value).toBe('tulip-brisk-ember-92');
    expect(secret.readOnly).toBe(true);
    expect((part(dialog, 'dialog-name') as HTMLInputElement).readOnly).toBe(true);
    expect(texts(dialog, '.say')).toEqual([
      'Shown once. Give it to paul in person; the server keeps only a hash of it.',
      'paul replaces it at the first sign-in and can do nothing else before that.',
    ]);
    expect(texts(dialog, '.acts button')).toEqual(['Done']);
    f.calls = [];
    button(dialog, 'Done').click();
    await flush();
    expect(dialog.open).toBe(false);
    expect(dialog.innerHTML).not.toContain('tulip-brisk-ember-92');
    expect(f.calls).toEqual([['users']]);
  });

  it('names a refused name in the dialog and stays on it', async () => {
    const { f, section, dialog } = await open(ADMIN);
    part(section, 'new-user').click();
    type(dialog, 'dialog-name', 'mari');
    f.refuse = 'name: is taken';
    submit(dialog);
    await flush();
    expect(title(dialog)).toBe('New user');
    expect(part(dialog, 'dialog-error').textContent).toBe('name: is taken');
    expect(dialog.querySelector('[data-part="dialog-secret"]')).toBeNull();
  });

  it('asks nothing for an empty name', async () => {
    const { f, section, dialog } = await open(ADMIN);
    part(section, 'new-user').click();
    f.calls = [];
    submit(dialog);
    await flush();
    expect(f.calls).toEqual([]);
    expect(dialog.open).toBe(true);
  });

  it('resets a password after asking, and shows the new temporary password once', async () => {
    const { f, section, dialog } = await open(ADMIN);
    button(row(section, 'user', 'paul'), 'Reset').click();
    expect(title(dialog)).toBe('Password reset · paul');
    expect(f.calls.some(([name]) => name === 'resetPassword')).toBe(false);
    expect(texts(dialog, '.acts button')).toEqual(['Cancel', 'Reset']);
    submit(dialog);
    await flush();
    expect(f.calls).toContainEqual(['resetPassword', 3]);
    expect(title(dialog)).toBe('Password reset');
    expect((part(dialog, 'dialog-name') as HTMLInputElement).value).toBe('paul');
    expect((part(dialog, 'dialog-secret') as HTMLInputElement).value).toBe('otter-plain-coast-17');
  });

  it('removes a user after asking, and not when the question is cancelled', async () => {
    const { f, section, dialog } = await open(ADMIN);
    button(row(section, 'user', 'mari'), 'Remove').click();
    expect(title(dialog)).toBe('Remove user · mari');
    button(dialog, 'Cancel').click();
    expect(dialog.open).toBe(false);
    expect(f.calls.some(([name]) => name === 'removeUser')).toBe(false);
    button(row(section, 'user', 'mari'), 'Remove').click();
    f.users = USERS.filter((user) => user.id !== 2);
    submit(dialog);
    await flush();
    expect(f.calls).toContainEqual(['removeUser', 2]);
    expect(dialog.open).toBe(false);
    expect(texts(section, '[data-part="user"] .name')).toEqual(['anna', 'paul']);
  });

  it('keeps the dialog open with the refusal when a remove fails', async () => {
    const { f, section, dialog } = await open(ADMIN);
    button(row(section, 'user', 'mari'), 'Remove').click();
    f.refuse = 'id: no such user';
    submit(dialog);
    await flush();
    expect(dialog.open).toBe(true);
    expect(part(dialog, 'dialog-error').textContent).toBe('id: no such user');
  });
});

describe('the agent keys list', () => {
  it('lists the keys with their scope and last use', async () => {
    const { section } = await open(USER);
    expect(texts(section, '[data-part="key"] .name')).toEqual(['claude-desktop', 'n8n-nightly', 'old-laptop']);
    expect(texts(section, '[data-part="key"] .tag')).toEqual(['edit', 'read', 'owner']);
    expect(row(section, 'key', 'old-laptop').querySelector('.tag')?.classList.contains('hot')).toBe(true);
    expect(row(section, 'key', 'n8n-nightly').querySelector('.tag')?.classList.contains('hot')).toBe(false);
    expect(texts(section, '[data-part="key"] .detail')).toEqual(['last used 2 min ago', 'last used yesterday, 02:00', 'never used']);
    expect(texts(row(section, 'key', 'old-laptop'), 'button')).toEqual(['Revoke']);
    expect(part(section, 'new-key').firstChild?.textContent).toBe('New key…');
    expect(part(section, 'key-log').textContent).toBe('Key log…');
    expect(texts(section, '.hint')).toEqual(['A key acts as you, within its scope. Every change it makes is kept as a snapshot under its name.']);
  });

  it('makes a key with a name and a scope, copies it, and forgets it when the dialog closes', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { f, section, dialog } = await open(USER);
    part(section, 'new-key').click();
    expect(title(dialog)).toBe('New agent key');
    expect(texts(dialog, '.scope .opt')).toEqual(['read', 'edit', 'owner']);
    expect(texts(dialog, '.scope .sub')).toEqual(['reads the library', 'reads and changes it', 'may also delete, restore, import']);
    // the least a key may do, unless the user chooses more
    expect(dialog.querySelector<HTMLInputElement>('input[name="scope"]:checked')?.value).toBe('read');
    type(dialog, 'dialog-name', 'claude-desktop');
    (dialog.querySelector('input[name="scope"][value="edit"]') as HTMLInputElement).checked = true;
    submit(dialog);
    await flush();
    expect(f.calls).toContainEqual(['makeKey', 'claude-desktop', 'edit']);
    expect(title(dialog)).toBe('New agent key · created');
    expect([...dialog.querySelectorAll<HTMLInputElement>('input[name="scope"]')].every((input) => input.disabled)).toBe(true);
    expect((part(dialog, 'dialog-secret') as HTMLInputElement).value).toBe('hbk_3f9a1c7e5b2d4a60b8c1e97d2f4a6b03');
    expect(texts(dialog, '.say')).toEqual([
      'Shown once. Copy it now and keep it as you keep a password; the server keeps only a hash.',
      'Revoke it any time in the key list. Everything it changes is kept as a snapshot under its name.',
    ]);
    part(dialog, 'dialog-copy').click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('hbk_3f9a1c7e5b2d4a60b8c1e97d2f4a6b03');
    expect(part(dialog, 'dialog-copy').lastChild?.textContent).toBe('Copied');
    dialog.close();
    await flush();
    expect(dialog.innerHTML).not.toContain('hbk_3f9a');
    expect(f.calls.at(-1)).toEqual(['keys']);
  });

  it('says when the browser does not let the key be copied', async () => {
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true });
    const { section, dialog } = await open(USER);
    part(section, 'new-key').click();
    type(dialog, 'dialog-name', 'cli');
    submit(dialog);
    await flush();
    part(dialog, 'dialog-copy').click();
    await flush();
    expect(part(dialog, 'dialog-error').textContent).toBe('The browser did not let H-Board copy it. Select it and copy it yourself.');
  });

  it('revokes a key after asking', async () => {
    const { f, section, dialog } = await open(USER);
    button(row(section, 'key', 'n8n-nightly'), 'Revoke').click();
    expect(title(dialog)).toBe('Revoke key · n8n-nightly');
    f.keys = KEYS.filter((key) => key.id !== 7);
    submit(dialog);
    await flush();
    expect(f.calls).toContainEqual(['revokeKey', 7]);
    expect(dialog.open).toBe(false);
    expect(texts(section, '[data-part="key"] .name')).toEqual(['claude-desktop', 'old-laptop']);
  });

  it('shows the key log, newest first, and goes back to the keys', async () => {
    const { section } = await open(USER);
    part(section, 'key-log').click();
    await flush();
    expect(texts(section, '.head')).toEqual(['Agent keys · log']);
    expect(part(section, 'key-log-back').textContent).toBe('‹ Back to the keys');
    expect(texts(section, '[data-part="use"] .when')).toEqual(['11:42:07', '02:00:02', '01:00:00', '00:30:00', '00:20:00', '00:10:00', 'Tue 09:15']);
    expect(texts(section, '[data-part="use"] .command')).toEqual([
      'site.add',
      'site.add',
      'no such command',
      'site.remove',
      'site.add',
      'library.read',
      'group.remove',
    ]);
    expect(texts(section, '[data-part="use"] .detail')).toEqual([
      'claude-desktop · edit · done',
      'n8n-nightly · read · refused, the read scope only reads',
      'n8n-nightly · read · refused',
      'old-laptop · owner · failed, no such group, site or snapshot',
      'old-laptop · owner · failed',
      'old-laptop · owner · nothing changed',
      'claude-desktop · edit · refused, needs the owner scope',
    ]);
    expect([...section.querySelectorAll('[data-part="use"]')].map((use) => use.classList.contains('refused'))).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      true,
    ]);
    expect(texts(section, '.hint')).toEqual(['The last 100 uses of all your keys, newest first.']);
    part(section, 'key-log-back').click();
    await flush();
    expect(texts(section, '.head')).toEqual(['Server', 'Agent keys · 3']);
  });

  it('says so when no key was used yet', async () => {
    const { f, access } = fakeServer(USER);
    f.log = [];
    const { main } = await mount(undefined, { server: access, openSettings: true });
    await flush();
    const section = part(main, 'server');
    part(section, 'key-log').click();
    await flush();
    expect(texts(section, '.hint')).toEqual(['No key was used yet.', 'The last 100 uses of all your keys, newest first.']);
  });
});

/** A promise the test settles when it chooses. */
function later<T>() {
  const settle: { resolve?: (value: T) => void; reject?: (error: Error) => void } = {};
  const promise = new Promise<T>((resolve, reject) => {
    Object.assign(settle, { resolve, reject });
  });
  return {
    promise,
    resolve: (value: T): void => settle.resolve?.(value),
    reject: (error: Error): void => settle.reject?.(error),
  };
}

describe('answers that come late', () => {
  it('draws no list into a section that moved on', async () => {
    const { access } = fakeServer(ADMIN);
    const users = later<ServerUser[]>();
    const keys = later<AgentKey[]>();
    const lists = { ...access, users: () => users.promise, keys: vi.fn(access.keys).mockReturnValueOnce(keys.promise) };
    const { main } = await mount(undefined, { server: lists, openSettings: true });
    await flush();
    const section = part(main, 'server');
    // the first read of the keys is still out when the settings open again and read them once more
    expect(section.querySelector('[data-part="key"]')).toBeNull();
    part(main, 'settings').click();
    part(main, 'settings').click();
    await flush();
    expect(texts(section, '[data-part="key"] .name')).toEqual(['claude-desktop', 'n8n-nightly', 'old-laptop']);
    part(section, 'key-log').click();
    await flush();
    users.resolve(USERS);
    keys.reject(new Error('too late'));
    await flush();
    expect(texts(section, '.head')).toEqual(['Agent keys · log']);
    expect(section.querySelector('[data-part="user"]')).toBeNull();
    expect(section.textContent).not.toContain('too late');
  });

  it('shows no secret in a dialog closed before it came', async () => {
    const { access } = fakeServer(ADMIN);
    const password = later<string>();
    const refused = later<string>();
    const addUser = vi.fn(access.addUser).mockReturnValueOnce(password.promise).mockReturnValueOnce(refused.promise);
    const { main } = await mount(undefined, { server: { ...access, addUser }, openSettings: true });
    await flush();
    const dialog = part(main, 'server-dialog') as HTMLDialogElement;
    for (const settle of [() => password.resolve('tulip-brisk-ember-92'), () => refused.reject(new Error('name: is taken'))]) {
      part(main, 'new-user').click();
      type(dialog, 'dialog-name', 'paul');
      submit(dialog);
      expect((part(dialog, 'dialog-ok') as HTMLButtonElement).disabled).toBe(true);
      // a second submit while the server answers asks nothing more
      submit(dialog);
      part(dialog, 'dialog-close').click();
      settle();
      await flush();
      expect(dialog.open).toBe(false);
      expect(dialog.innerHTML).toBe('<form novalidate=""></form>');
    }
    expect(addUser).toHaveBeenCalledTimes(2);
  });

  it('closes the dialog when the session ends under it', async () => {
    const { f, main, section, dialog } = await open(ADMIN);
    part(section, 'new-user').click();
    f.state = { stage: 'sign-in', address: SERVER };
    part(main, 'settings').click();
    part(main, 'settings').click();
    expect(dialog.open).toBe(false);
    expect(texts(section, '.head')).toEqual(['Server · sign in']);
  });
});

describe('the dialog in the settings', () => {
  it('keeps the settings open behind it, and Escape closes only the dialog', async () => {
    const { main, section, dialog } = await open(USER);
    part(section, 'new-key').click();
    dialog.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(part(main, 'settings-panel').hidden).toBe(false);
    press('Escape');
    expect(part(main, 'settings-panel').hidden).toBe(false);
  });

  it('closes with its cross', async () => {
    const { section, dialog } = await open(USER);
    part(section, 'new-key').click();
    part(dialog, 'dialog-close').click();
    expect(dialog.open).toBe(false);
  });
});
