import { make } from './dom';
import { ServerDialog } from './server-dialog';
import type { ServerAsk, ServerList } from './server-dialog';
import { keyLog, keysList, usersList } from './server-lists';
import { keptAt } from './when';

/**
 * Where the page stands with the user's own server:
 * - `local`: no server; the library is kept in this browser only.
 * - `setup`: connected to a server with no account yet; the setup code makes the admin.
 * - `sign-in`: connected, signed out.
 * - `forced`: signed in with a temporary password, which must be replaced before anything else.
 * - `offer`: signed in to a server whose library is empty; this browser's library can be sent to it.
 * - `signed-in`: signed in; the page shows the server's library.
 */
export type ServerStage = 'local' | 'setup' | 'sign-in' | 'forced' | 'offer' | 'signed-in';

export interface ServerState {
  readonly stage: ServerStage;
  /** The server's origin, such as `https://hboard.example.com`; there in every stage but `local`. */
  readonly address?: string;
  /** The signed-in user; there in `forced`, `offer` and `signed-in`. */
  readonly user?: { readonly name: string; readonly admin: boolean };
  /** In `offer`: what this browser's library holds. */
  readonly local?: { readonly groups: number; readonly sites: number };
}

/** An account as the admin's users list shows it. */
export interface ServerUser {
  readonly id: number;
  readonly name: string;
  readonly admin: boolean;
  /** The user still has the temporary password the admin gave. */
  readonly temporary: boolean;
  /** How many sites the user's library holds. */
  readonly sites: number;
}

/** What an agent key may do: `read` only reads, `edit` also changes, `owner` may also delete, restore and import. */
export type KeyScope = 'read' | 'edit' | 'owner';

/** An agent key as the keys list shows it; the key itself is shown only once, when it is made. */
export interface AgentKey {
  readonly id: number;
  readonly name: string;
  readonly scope: KeyScope;
  /** When it was last used, in milliseconds; null when never. */
  readonly usedAt: number | null;
}

/** One use of a key in the key log. */
export interface KeyUse {
  readonly at: number;
  /** The key's name. */
  readonly key: string;
  readonly scope: KeyScope;
  /** The command's id; null when the id named no command. */
  readonly command: string | null;
  /** How it ended, the server's fixed word: `done`, `read-only`, `needs-owner` and so on. */
  readonly outcome: string;
}

/**
 * The host's way to the user's own server, for the settings' Server section. Every method answers once the server
 * has; a refusal rejects with an `Error` whose message the page shows as text. `connect` is called in the click, so
 * that the host can ask for the permission to reach the server.
 */
export interface ServerAccess {
  state(): ServerState;
  connect(address: string): Promise<void>;
  setup(code: string, name: string, password: string): Promise<void>;
  signIn(name: string, password: string): Promise<void>;
  changePassword(current: string, password: string): Promise<void>;
  /** In `offer`: sends this browser's library to the server, as one import. */
  send(): Promise<void>;
  /** In `offer`: keeps the server's library as it is. */
  skip(): Promise<void>;
  signOut(): Promise<void>;
  /** Forgets the server and gives back the permission to reach it: the page shows this browser's library. */
  local(): Promise<void>;
  /** For an admin: every account. */
  users(): Promise<ServerUser[]>;
  /** For an admin: adds a user; answers the temporary password, shown once. */
  addUser(name: string): Promise<string>;
  /** For an admin: gives another user a new temporary password, shown once. */
  resetPassword(id: number): Promise<string>;
  /** For an admin: removes another user with their library and keys. */
  removeUser(id: number): Promise<void>;
  /** The signed-in user's agent keys. */
  keys(): Promise<AgentKey[]>;
  /** Makes an agent key; answers the key, shown once. */
  makeKey(name: string, scope: KeyScope): Promise<string>;
  revokeKey(id: number): Promise<void>;
  /** The newest uses of the user's keys, newest first. */
  keyLog(): Promise<KeyUse[]>;
}

/**
 * What the section shows besides the stage: the address form of local mode, or, when signed in, the password form or
 * the key log.
 */
type Form = 'none' | 'connect' | 'password' | 'log';

const LOCAL_HINT = 'Local keeps the library in this browser only. Nothing is sent anywhere.';
const DIFFER = 'The two passwords are not the same.';

const count = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/** The server's host and port, as the status line shows it. */
const hostOf = (address: string): string => new URL(address).host;

/**
 * The Server section of the settings, after the "Server" frames of docs/design/h-board.figcraft: local or server
 * mode, the address, the first sign-in with the setup code, the sign-in, the password change and the offer to send
 * this browser's library. It draws itself again only when the stage changes, so what is typed stays when the panel
 * around it is drawn again. Everything the server says is shown as text.
 */
export class ServerSection {
  readonly node: HTMLElement;
  /** The dialog that makes users and keys and asks before a reset, a remove or a revoke; the page holds it. */
  readonly dialog: ServerDialog;
  #form: Form = 'none';
  /** The stage last drawn, with its server and user. */
  #drawn = '';
  #busy = false;
  /** Where the lists the server answers go, while they are drawn. */
  #users: HTMLElement | undefined;
  #keys: HTMLElement | undefined;
  #log: HTMLElement | undefined;
  /** When the library shown was last read from the server, while the server cannot be reached; undefined online. */
  offline: number | undefined;

  /** `retry` reads the library again from the server, for Try again offline. */
  constructor(
    private readonly doc: Document,
    private readonly access: ServerAccess,
    private readonly now: () => Date = () => new Date(),
    private readonly retry: () => Promise<void> = () => Promise.resolve(),
  ) {
    this.node = make(doc, 'div', 'server');
    this.node.dataset['part'] = 'server';
    this.dialog = new ServerDialog(doc, access, (list) => this.#load(list));
  }

  get dialogOpen(): boolean {
    return this.dialog.open;
  }

  /** Draws the section again when the stage moved since it was drawn last, as in another page. */
  refresh(): void {
    if (this.#key() !== this.#drawn) this.#draw();
  }

  /** Reads the lists again, when the section stands as it was drawn; a section that will be drawn again reads them then. */
  reload(): void {
    if (this.#key() === this.#drawn) this.#load();
  }

  #key(): string {
    return JSON.stringify([this.access.state(), this.#form, this.offline]);
  }

  #draw(): void {
    const state = this.access.state();
    if (state.stage !== 'local' && this.#form === 'connect') this.#form = 'none';
    if (state.stage !== 'signed-in' && (this.#form === 'password' || this.#form === 'log')) this.#form = 'none';
    this.#drawn = this.#key();
    this.#busy = false;
    this.#users = this.#keys = this.#log = undefined;
    if (state.stage !== 'signed-in') this.dialog.close();
    const address = state.address ?? '';
    const who = state.user ? `${state.user.name} · ${state.user.admin ? 'admin · ' : ''}` : '';
    switch (state.stage) {
      case 'local':
        return this.#show(this.#local());
      case 'setup':
        return this.#show([
          this.#head('Server · first sign-in'),
          this.#status(hostOf(address)),
          this.#hint("This server has no users yet. Enter the setup code from the server's log to create the admin account."),
          this.#fields(
            [
              ['code', 'Setup code', 'text', 'one-time-code'],
              ['name', 'Admin name', 'text', 'username'],
              ['password', 'Password', 'password', 'new-password'],
              ['repeat', 'Repeat password', 'password', 'new-password'],
            ],
            'Create admin and sign in',
            (v) => (v['password'] === v['repeat'] ? this.access.setup(v['code'] ?? '', v['name'] ?? '', v['password'] ?? '') : DIFFER),
          ),
          this.#hint('The code works once. Choose a password you do not use anywhere else.'),
          this.#button('server-local', 'Use local mode', () => this.access.local()),
        ]);
      case 'sign-in':
        return this.#show([
          this.#head('Server · sign in'),
          this.#status(hostOf(address)),
          this.#fields(
            [
              ['name', 'User name', 'text', 'username'],
              ['password', 'Password', 'password', 'current-password'],
            ],
            'Sign in',
            (v) => this.access.signIn(v['name'] ?? '', v['password'] ?? ''),
          ),
          this.#button('server-local', 'Use local mode', () => this.access.local()),
        ]);
      case 'forced':
        return this.#show([
          this.#head('Server · new password'),
          this.#status(`${who}${hostOf(address)}`),
          this.#box('notice', 'Your password is temporary. Choose your own to go on.'),
          this.#passwordForm('Temporary password', 'Set password and sign in'),
          this.#button('server-sign-out', 'Sign out', () => this.access.signOut()),
        ]);
      case 'offer': {
        const { groups, sites } = state.local ?? { groups: 0, sites: 0 };
        return this.#show([
          this.#head('Server · library'),
          this.#status(`${who}${hostOf(address)}`),
          this.#box(
            'notice',
            `The library on this server is empty. Send this browser's library to it: ${count(groups, 'group')}, ${count(sites, 'site')}?`,
          ),
          this.#error(),
          this.#button('server-send', 'Send this library', () => this.access.send(), true),
          this.#button('server-skip', 'Start empty', () => this.access.skip()),
          this.#hint("This browser's library stays as it is; local mode shows it again."),
        ]);
      }
      case 'signed-in':
        if (this.offline !== undefined && this.#form === 'none') {
          const status = this.#status(`offline · ${hostOf(address)}`);
          status.classList.add('offline');
          const readOnly = this.#box(
            'read only',
            `The server cannot be reached. You see the copy saved at ${keptAt(this.offline, this.now())}. Editing, users and keys need the server.`,
          );
          readOnly.dataset['part'] = 'server-read-only';
          return this.#show([
            this.#head('Server'),
            status,
            readOnly,
            this.#button('server-retry', 'Try again', () => this.retry(), true),
            this.#button('server-change-password', 'Change password', () => this.#open('password')),
            this.#button('new-key', 'New key…', () => this.dialog.show({ kind: 'key' })),
            this.#button('server-sign-out', 'Sign out', () => this.access.signOut()),
          ]);
        }
        if (this.#form === 'password') {
          return this.#show([
            this.#head('Server · password'),
            this.#status(`${who}${hostOf(address)}`),
            this.#passwordForm('Current password', 'Change password'),
            this.#button('server-cancel', 'Cancel', () => this.#open('none')),
            this.#hint('Your other signed-in browsers are signed out when it changes.'),
          ]);
        }
        if (this.#form === 'log') {
          this.#log = this.#part();
          this.#show([
            this.#head('Agent keys · log'),
            this.#button('key-log-back', '‹ Back to the keys', () => this.#open('none')),
            this.#log,
            this.#hint('The last 100 uses of all your keys, newest first.'),
          ]);
          return this.#load();
        }
        if (state.user?.admin) this.#users = this.#part();
        this.#keys = this.#part();
        this.#show([
          this.#head('Server'),
          this.#status(`${who}${hostOf(address)}`),
          this.#button('server-change-password', 'Change password', () => this.#open('password')),
          this.#button('server-sign-out', 'Sign out', () => this.access.signOut()),
          ...(this.#users ? [this.#users] : []),
          this.#keys,
        ]);
        return this.#load();
    }
  }

  /** A place in the section for what the server answers; it lays out as the section's own rows. */
  #part(): HTMLElement {
    return make(this.doc, 'div', 'part');
  }

  /** Reads the lists drawn now, or only `only`, from the server and draws them where they go. */
  #load(only?: ServerList): void {
    const doc = this.doc;
    const ask = (asked: ServerAsk): void => this.dialog.show(asked);
    const self = this.access.state().user?.name ?? '';
    if (only !== 'keys') this.#fill(this.#users, 'Users', () => this.access.users().then((users) => usersList(doc, users, self, ask)));
    if (only !== 'users') {
      this.#fill(this.#keys, 'Agent keys', () =>
        this.access.keys().then((keys) => keysList(doc, keys, this.now(), ask, () => this.#open('log'))),
      );
    }
    if (only === undefined) this.#fill(this.#log, undefined, () => this.access.keyLog().then((uses) => keyLog(doc, uses, this.now())));
  }

  /** Draws what `read` answers into `place`, while it is still drawn; a refusal is named under `head`. */
  #fill(place: HTMLElement | undefined, head: string | undefined, read: () => Promise<HTMLElement[]>): void {
    if (place === undefined) return;
    const drawn = (): boolean => place === this.#users || place === this.#keys || place === this.#log;
    read().then(
      (nodes) => {
        if (drawn()) place.replaceChildren(...nodes);
      },
      (reason: unknown) => {
        if (!drawn()) return;
        const error = this.#box('error', reason instanceof Error ? reason.message : String(reason));
        error.setAttribute('role', 'alert');
        place.replaceChildren(...(head ? [this.#head(head)] : []), error);
      },
    );
  }

  #show(nodes: HTMLElement[]): void {
    this.node.replaceChildren(...nodes);
  }

  #open(form: Form): void {
    this.#form = form;
    this.#draw();
  }

  /** Local mode, with the address form while the server option is pressed. */
  #local(): HTMLElement[] {
    const doc = this.doc;
    const connect = this.#form === 'connect';
    const seg = make(doc, 'div', 'seg');
    seg.dataset['part'] = 'server-mode';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Mode');
    for (const [mode, pressed] of [
      ['local', !connect],
      ['server', connect],
    ] as const) {
      const button = make(doc, 'button', '', mode);
      button.type = 'button';
      button.dataset['part'] = `server-mode-${mode}`;
      button.setAttribute('aria-pressed', String(pressed));
      button.addEventListener('click', () => this.#open(mode === 'server' ? 'connect' : 'none'));
      seg.append(button);
    }
    const row = make(doc, 'div', 'row');
    row.append(make(doc, 'span', '', 'mode'), seg);
    if (!connect) return [this.#head('Server'), row, this.#hint(LOCAL_HINT)];
    return [
      this.#head('Server'),
      row,
      this.#fields(
        [['address', 'Server address', 'url', 'url']],
        'Connect',
        (v) => this.access.connect(v['address'] ?? ''),
        this.#hint('https only. http works for localhost and 127.0.0.1. Your browser asks you to allow this address when you connect.'),
      ),
      this.#hint(LOCAL_HINT),
    ];
  }

  #passwordForm(current: string, submit: string): HTMLElement {
    return this.#fields(
      [
        ['current', current, 'password', 'current-password'],
        ['password', 'New password', 'password', 'new-password'],
        ['repeat', 'Repeat new password', 'password', 'new-password'],
      ],
      submit,
      (v) => {
        if (v['password'] !== v['repeat']) return DIFFER;
        return this.access.changePassword(v['current'] ?? '', v['password'] ?? '').then(() => {
          this.#form = 'none';
        });
      },
    );
  }

  /**
   * A form of text fields, the error box and its primary button. `run` answers a promise of the server's answer, or
   * the sentence of what is wrong before anything is asked. It is called in the submit itself, so that the host can
   * ask for a permission in it.
   */
  #fields(
    fields: readonly (readonly [name: string, label: string, type: string, autocomplete: string])[],
    submit: string,
    run: (values: Record<string, string>) => Promise<void> | string,
    after?: HTMLElement,
  ): HTMLElement {
    const doc = this.doc;
    const form = make(doc, 'form');
    form.noValidate = true;
    const inputs = fields.map(([name, text, type, autocomplete]) => {
      const label = make(doc, 'label', 'field');
      const input = make(doc, 'input');
      input.type = type;
      input.name = name;
      input.autocomplete = autocomplete as AutoFill;
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'off');
      input.dataset['part'] = `server-${name}`;
      label.append(make(doc, 'span', '', text), input);
      return { label, input };
    });
    const error = this.#error();
    const button = make(doc, 'button', 'wide primary', submit);
    button.type = 'submit';
    button.dataset['part'] = 'server-submit';
    form.append(...inputs.map(({ label }) => label), ...(after ? [after] : []), error, button);
    form.addEventListener('input', () => {
      error.hidden = true;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.#busy) return;
      const values = Object.fromEntries(inputs.map(({ input }) => [input.name, input.value]));
      const answer = run(values);
      if (typeof answer === 'string') return this.#fail(error, answer);
      this.#wait(answer, error, button, () => {
        // a refused secret is typed again, never kept in the page
        for (const { input } of inputs) if (input.type === 'password') input.value = '';
      });
    });
    return form;
  }

  /** A button that asks the server, or, when `run` answers nothing, only changes what the section shows. */
  #button(part: string, text: string, run: () => Promise<void> | void, primary = false): HTMLButtonElement {
    const button = make(this.doc, 'button', primary ? 'wide primary' : 'wide', text);
    button.type = 'button';
    button.dataset['part'] = part;
    button.addEventListener('click', () => {
      if (this.#busy) return;
      const answer = run();
      if (answer) this.#wait(answer, this.node.querySelector<HTMLElement>('[data-part="server-error"]'), button);
    });
    return button;
  }

  /** Waits for the server's answer with `button` off: the new stage is drawn, a refusal is named in `error`. */
  #wait(answer: Promise<void>, error: HTMLElement | null, button: HTMLButtonElement, refused?: () => void): void {
    this.#busy = true;
    button.disabled = true;
    answer.then(
      // a section drawn again meanwhile, as after Try again, stays as it is drawn
      () => {
        if (button.isConnected) this.#draw();
      },
      (reason: unknown) => {
        this.#busy = false;
        button.disabled = false;
        refused?.();
        if (error) this.#fail(error, reason instanceof Error ? reason.message : String(reason));
      },
    );
  }

  #fail(error: HTMLElement, message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  #head(text: string): HTMLElement {
    return make(this.doc, 'div', 'head', text);
  }

  #hint(text: string): HTMLElement {
    return make(this.doc, 'div', 'hint', text);
  }

  /** The dot of the page's sync mark, then who is signed in where. */
  #status(text: string): HTMLElement {
    const status = make(this.doc, 'div', 'status', text);
    status.dataset['part'] = 'server-status';
    return status;
  }

  /** The panel's box: a tag over a sentence, as the design's error and notice. */
  #box(tag: string, text = ''): HTMLElement {
    const box = make(this.doc, 'div', 'box', text);
    box.dataset['tag'] = tag;
    return box;
  }

  #error(): HTMLElement {
    const error = this.#box('error');
    error.dataset['part'] = 'server-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    return error;
  }
}
