// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { ServerAccess, ServerState } from '../src/index';
import { flush, mount, part } from './mount';

const SERVER = 'https://hboard.example.com';

/** A server the test drives: every call is noted, and `next` says what the next call does. */
function fakeServer(initial: ServerState) {
  const f = {
    state: initial,
    calls: [] as string[][],
    /** The state the next call moves to, or the message it fails with; it changes nothing when left out. */
    next: undefined as ServerState | string | undefined,
    /** Holds the next call until `release()`. */
    hold: false,
    release: (): void => undefined,
  };
  const act =
    (name: string) =>
    (...args: string[]): Promise<void> => {
      f.calls.push([name, ...args]);
      const { next } = f;
      f.next = undefined;
      const settle = (): Promise<void> => {
        if (typeof next === 'string') return Promise.reject(new Error(next));
        if (next) f.state = next;
        return Promise.resolve();
      };
      if (!f.hold) return settle();
      f.hold = false;
      return new Promise<void>((resolve, reject) => {
        f.release = () => void settle().then(resolve, reject);
      });
    };
  const access: ServerAccess = {
    state: () => f.state,
    connect: act('connect'),
    setup: act('setup'),
    signIn: act('signIn'),
    changePassword: act('changePassword'),
    send: act('send'),
    skip: act('skip'),
    signOut: act('signOut'),
    local: act('local'),
    // the lists of the signed-in section: server-lists.test.ts drives them
    users: () => Promise.resolve([]),
    addUser: () => Promise.resolve(''),
    resetPassword: () => Promise.resolve(''),
    removeUser: () => Promise.resolve(),
    keys: () => Promise.resolve([]),
    makeKey: () => Promise.resolve(''),
    revokeKey: () => Promise.resolve(),
    keyLog: () => Promise.resolve([]),
  };
  return { f, access };
}

async function open(state: ServerState) {
  const { f, access } = fakeServer(state);
  const { main } = await mount(undefined, { server: access, openSettings: true });
  return { f, main, section: part(main, 'server') };
}

const type = (root: ParentNode, name: string, value: string): void => {
  (part(root, name) as HTMLInputElement).value = value;
};

const submit = (section: HTMLElement): void => {
  section.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

const click = (root: ParentNode, name: string): void => part(root, name).click();

const head = (section: HTMLElement): string | null | undefined => section.querySelector('.head')?.textContent;

const shown = (section: HTMLElement, name: string): string | null => part(section, name).textContent;

describe('the Server section', () => {
  it('is not there when the host has no server to offer', async () => {
    const { main } = await mount(undefined, { openSettings: true });
    expect(main.querySelector('[data-part="server"]')).toBeNull();
  });

  it('shows local mode, and the address form when the server option is pressed', async () => {
    const { section } = await open({ stage: 'local' });
    expect(head(section)).toBe('Server');
    expect(part(section, 'server-mode').querySelector('[aria-pressed="true"]')?.textContent).toBe('local');
    expect(section.querySelector('[data-part="server-address"]')).toBeNull();
    expect(section.querySelector('.hint')?.textContent).toBe('Local keeps the library in this browser only. Nothing is sent anywhere.');
    click(section, 'server-mode-server');
    expect(part(section, 'server-mode').querySelector('[aria-pressed="true"]')?.textContent).toBe('server');
    expect(section.querySelector('label')?.textContent).toBe('Server address');
    expect([...section.querySelectorAll('.hint')].map((hint) => hint.textContent)).toEqual([
      'https only. http works for localhost and 127.0.0.1. Your browser asks you to allow this address when you connect.',
      'Local keeps the library in this browser only. Nothing is sent anywhere.',
    ]);
    expect(shown(section, 'server-submit')).toBe('Connect');
    click(section, 'server-mode-local');
    expect(section.querySelector('[data-part="server-address"]')).toBeNull();
  });

  it('connects in the click, and shows the first sign-in of a server without accounts', async () => {
    const { f, section } = await open({ stage: 'local' });
    click(section, 'server-mode-server');
    type(section, 'server-address', 'https://hboard.example.com');
    f.next = { stage: 'setup', address: SERVER };
    submit(section);
    // called in the submit itself, before anything is awaited, so that the host can ask for the permission
    expect(f.calls).toEqual([['connect', 'https://hboard.example.com']]);
    await flush();
    expect(head(section)).toBe('Server · first sign-in');
    expect(shown(section, 'server-status')).toBe('hboard.example.com');
    expect([...section.querySelectorAll('label')].map((label) => label.firstChild?.textContent)).toEqual([
      'Setup code',
      'Admin name',
      'Password',
      'Repeat password',
    ]);
    expect(shown(section, 'server-submit')).toBe('Create admin and sign in');
  });

  it('names what is wrong with the address and keeps what was typed', async () => {
    const { f, section } = await open({ stage: 'local' });
    click(section, 'server-mode-server');
    type(section, 'server-address', 'http://hboard.example.com');
    f.next = 'address: must be https, or http for localhost and 127.0.0.1';
    submit(section);
    await flush();
    const error = part(section, 'server-error');
    expect(error.hidden).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.dataset['tag']).toBe('error');
    expect(error.textContent).toBe('address: must be https, or http for localhost and 127.0.0.1');
    expect((part(section, 'server-address') as HTMLInputElement).value).toBe('http://hboard.example.com');
    expect((part(section, 'server-submit') as HTMLButtonElement).disabled).toBe(false);
    // typing again puts the error away
    part(section, 'server-address').dispatchEvent(new Event('input', { bubbles: true }));
    expect(error.hidden).toBe(true);
  });

  it('keeps what was typed when the settings close and open again', async () => {
    const { main, section } = await open({ stage: 'local' });
    click(section, 'server-mode-server');
    type(section, 'server-address', 'https://hboard');
    click(main, 'settings');
    click(main, 'settings');
    expect((part(main, 'server-address') as HTMLInputElement).value).toBe('https://hboard');
  });

  it('makes the admin with the setup code, once the two passwords agree', async () => {
    const { f, section } = await open({ stage: 'setup', address: SERVER });
    type(section, 'server-code', 'K7QD-4M2X-9TRW');
    type(section, 'server-name', 'anna');
    type(section, 'server-password', 'anna-password-1');
    type(section, 'server-repeat', 'anna-password-2');
    submit(section);
    expect(f.calls).toEqual([]);
    expect(shown(section, 'server-error')).toBe('The two passwords are not the same.');
    type(section, 'server-repeat', 'anna-password-1');
    f.next = { stage: 'offer', address: SERVER, user: { name: 'anna', admin: true }, local: { groups: 5, sites: 84 } };
    submit(section);
    expect(f.calls).toEqual([['setup', 'K7QD-4M2X-9TRW', 'anna', 'anna-password-1']]);
    await flush();
    expect(head(section)).toBe('Server · library');
  });

  it('signs in, says a wrong password as the server answered it, and goes back to local mode', async () => {
    const { f, section } = await open({ stage: 'sign-in', address: SERVER });
    expect(head(section)).toBe('Server · sign in');
    type(section, 'server-name', 'mari');
    type(section, 'server-password', 'not-the-password');
    f.next = 'Wrong user name or password. Wait a moment before you try again.';
    submit(section);
    await flush();
    expect(shown(section, 'server-error')).toBe('Wrong user name or password. Wait a moment before you try again.');
    expect((part(section, 'server-password') as HTMLInputElement).value).toBe('');
    type(section, 'server-password', 'mari-password-1');
    submit(section);
    expect(f.calls.at(-1)).toEqual(['signIn', 'mari', 'mari-password-1']);
    await flush();
    f.next = { stage: 'local' };
    click(section, 'server-local');
    await flush();
    expect(f.calls.at(-1)).toEqual(['local']);
    expect(head(section)).toBe('Server');
  });

  it('turns the button off while the server answers', async () => {
    const { f, section } = await open({ stage: 'sign-in', address: SERVER });
    type(section, 'server-name', 'mari');
    type(section, 'server-password', 'mari-password-1');
    f.hold = true;
    f.next = { stage: 'signed-in', address: SERVER, user: { name: 'mari', admin: false } };
    submit(section);
    submit(section);
    expect((part(section, 'server-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(f.calls).toHaveLength(1);
    f.release();
    await flush();
    expect(head(section)).toBe('Server');
    expect(shown(section, 'server-status')).toBe('mari · hboard.example.com');
  });

  it('makes a temporary password be replaced, or signs out', async () => {
    const { f, section } = await open({ stage: 'forced', address: SERVER, user: { name: 'paul', admin: false } });
    expect(head(section)).toBe('Server · new password');
    expect(shown(section, 'server-status')).toBe('paul · hboard.example.com');
    const notice = section.querySelector<HTMLElement>('.box:not([data-part="server-error"])');
    expect(notice?.dataset['tag']).toBe('notice');
    expect(notice?.textContent).toBe('Your password is temporary. Choose your own to go on.');
    type(section, 'server-current', 'tulip-brisk-ember-92');
    type(section, 'server-password', 'paul-own-password');
    type(section, 'server-repeat', 'paul-own-password');
    submit(section);
    expect(f.calls).toEqual([['changePassword', 'tulip-brisk-ember-92', 'paul-own-password']]);
    await flush();
    click(section, 'server-sign-out');
    expect(f.calls.at(-1)).toEqual(['signOut']);
  });

  it('offers to send this browser library to an empty server, or to keep it empty', async () => {
    const offer: ServerState = { stage: 'offer', address: SERVER, user: { name: 'anna', admin: true }, local: { groups: 5, sites: 84 } };
    const { f, section } = await open(offer);
    expect(shown(section, 'server-status')).toBe('anna · admin · hboard.example.com');
    expect(section.querySelector('.box')?.textContent).toBe(
      "The library on this server is empty. Send this browser's library to it: 5 groups, 84 sites?",
    );
    expect(section.querySelector('.hint')?.textContent).toBe("This browser's library stays as it is; local mode shows it again.");
    f.next = 'The server cannot be reached at https://hboard.example.com.';
    click(section, 'server-send');
    await flush();
    expect(shown(section, 'server-error')).toBe('The server cannot be reached at https://hboard.example.com.');
    click(section, 'server-send');
    // one answer at a time
    click(section, 'server-skip');
    await flush();
    click(section, 'server-skip');
    await flush();
    expect(f.calls).toEqual([['send'], ['send'], ['skip']]);
  });

  it('says one group and one site in the singular', async () => {
    const { section } = await open({ stage: 'offer', address: SERVER, user: { name: 'anna', admin: false }, local: { groups: 1, sites: 1 } });
    expect(section.querySelector('.box')?.textContent).toBe("The library on this server is empty. Send this browser's library to it: 1 group, 1 site?");
  });

  it('changes the password of a signed-in user, or cancels, and signs out', async () => {
    const { f, section } = await open({ stage: 'signed-in', address: 'http://127.0.0.1:8787', user: { name: 'mari', admin: false } });
    expect(shown(section, 'server-status')).toBe('mari · 127.0.0.1:8787');
    click(section, 'server-change-password');
    expect(head(section)).toBe('Server · password');
    expect(section.querySelector('.hint')?.textContent).toBe('Your other signed-in browsers are signed out when it changes.');
    click(section, 'server-cancel');
    expect(head(section)).toBe('Server');
    click(section, 'server-change-password');
    type(section, 'server-current', 'mari-password-1');
    type(section, 'server-password', 'mari-password-2');
    type(section, 'server-repeat', 'mari-password-3');
    submit(section);
    expect(shown(section, 'server-error')).toBe('The two passwords are not the same.');
    type(section, 'server-repeat', 'mari-password-2');
    submit(section);
    await flush();
    expect(f.calls).toEqual([['changePassword', 'mari-password-1', 'mari-password-2']]);
    expect(head(section)).toBe('Server');
    f.next = { stage: 'sign-in', address: 'http://127.0.0.1:8787' };
    click(section, 'server-sign-out');
    await flush();
    expect(head(section)).toBe('Server · sign in');
  });

  it('shows a name from the server as text, never as markup', async () => {
    const { section } = await open({ stage: 'signed-in', address: SERVER, user: { name: '<img src=x onerror=alert(1)>', admin: false } });
    expect(shown(section, 'server-status')).toBe('<img src=x onerror=alert(1)> · hboard.example.com');
    expect(section.querySelector('img')).toBeNull();
  });

  it('shows a stage another page reached when the settings open again', async () => {
    const { f, main, section } = await open({ stage: 'local' });
    click(main, 'settings');
    f.state = { stage: 'sign-in', address: SERVER };
    click(main, 'settings');
    expect(head(section)).toBe('Server · sign in');
  });
});
