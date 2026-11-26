import { make } from './dom';
import { icon } from './parts';
import type { AgentKey, KeyScope, ServerAccess, ServerUser } from './server';

/** What the dialog is asked to do: make a user or a key, or reset, remove or revoke one after asking. */
export type ServerAsk =
  | { readonly kind: 'user' }
  | { readonly kind: 'key' }
  | { readonly kind: 'reset'; readonly user: ServerUser }
  | { readonly kind: 'remove'; readonly user: ServerUser }
  | { readonly kind: 'revoke'; readonly key: AgentKey };

/** Which list a closed dialog may have changed. */
export type ServerList = 'users' | 'keys';

const SCOPES: readonly (readonly [KeyScope, string])[] = [
  ['read', 'reads the library'],
  ['edit', 'reads and changes it'],
  ['owner', 'may also delete, restore, import'],
];

const NO_COPY = 'The browser did not let H-Board copy it. Select it and copy it yourself.';

/** The question before a change, per kind: the title, what the change does, and its button. */
function question(ask: ServerAsk): { title: string; name: string; say: string; ok: string } {
  switch (ask.kind) {
    case 'user':
      return { title: 'New user', name: '', say: '', ok: 'Add' };
    case 'key':
      return { title: 'New agent key', name: '', say: '', ok: 'Make key' };
    case 'reset':
      return {
        title: `Password reset · ${ask.user.name}`,
        name: ask.user.name,
        say: `${ask.user.name} gets a new temporary password and is signed out everywhere; their agent keys are revoked.`,
        ok: 'Reset',
      };
    case 'remove':
      return {
        title: `Remove user · ${ask.user.name}`,
        name: ask.user.name,
        say: `The account of ${ask.user.name} is removed with its library and its agent keys. This cannot be undone.`,
        ok: 'Remove',
      };
    case 'revoke':
      return {
        title: `Revoke key · ${ask.key.name}`,
        name: ask.key.name,
        say: 'An agent that uses this key can do nothing more with it. This cannot be undone.',
        ok: 'Revoke',
      };
  }
}

/**
 * The dialog of the users and agent keys lists, after the "Server · new user", "Server · new key" and "Server ·
 * password reset" frames of docs/design/h-board.figcraft, in the site dialog's frame. A new password or key is shown
 * once, with a copy button, and is gone from the page when the dialog closes. Names from the server are shown as text.
 */
export class ServerDialog {
  readonly node: HTMLDialogElement;
  readonly #form: HTMLFormElement;
  #ask: ServerAsk = { kind: 'user' };
  #busy = false;

  constructor(
    private readonly doc: Document,
    private readonly access: ServerAccess,
    closed: (list: ServerList) => void,
  ) {
    this.node = make(doc, 'dialog', 'hb-dialog server-dialog');
    this.node.dataset['part'] = 'server-dialog';
    this.node.setAttribute('aria-labelledby', 'hb-server-dialog-title');
    this.#form = make(doc, 'form');
    this.#form.noValidate = true;
    this.node.append(this.#form);
    this.node.addEventListener('click', (event) => {
      if (event.target === this.node) this.close(); // the backdrop
    });
    this.node.addEventListener('close', () => {
      // the secret leaves the page with the dialog
      this.#form.replaceChildren();
      this.#busy = false;
      const { kind } = this.#ask;
      closed(kind === 'user' || kind === 'reset' || kind === 'remove' ? 'users' : 'keys');
    });
    this.#form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit();
    });
  }

  get open(): boolean {
    return this.node.open;
  }

  show(ask: ServerAsk): void {
    this.#ask = ask;
    this.#busy = false;
    const { title, name, say, ok } = question(ask);
    const doc = this.doc;
    const editable = ask.kind === 'user' || ask.kind === 'key';
    const parts = [this.#name(ask.kind === 'user' || ask.kind === 'reset' || ask.kind === 'remove' ? 'User name' : 'Name', name, !editable)];
    if (ask.kind === 'key') parts.push(this.#scopes());
    if (say) parts.push(make(doc, 'p', 'say', say));
    const cancel = make(doc, 'button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const submit = make(doc, 'button', 'btn primary', ok);
    submit.type = 'submit';
    submit.dataset['part'] = 'dialog-ok';
    this.#draw(title, [...parts, this.#error()], [cancel, submit]);
    if (!this.node.open) this.node.showModal();
    const input = this.#form.querySelector<HTMLInputElement>('[data-part="dialog-name"]');
    if (editable) input?.focus();
    else this.#form.querySelector<HTMLButtonElement>('[data-part="dialog-ok"]')?.focus();
  }

  close(): void {
    if (this.node.open) this.node.close();
  }

  #draw(title: string, parts: HTMLElement[], buttons: HTMLButtonElement[]): void {
    const doc = this.doc;
    const head = make(doc, 'h2', 'label');
    head.id = 'hb-server-dialog-title';
    head.append(make(doc, 'span', 'idx', '[ + ]'), make(doc, 'span', 'txt', title));
    const x = make(doc, 'button', 'x');
    x.type = 'button';
    x.dataset['part'] = 'dialog-close';
    x.setAttribute('aria-label', 'Close');
    x.append(icon(doc, 'x'));
    x.addEventListener('click', () => this.close());
    const acts = make(doc, 'div', 'acts');
    acts.append(...buttons);
    this.#form.replaceChildren(make(doc, 'div', 'top'), head, x, ...parts, acts);
  }

  /** The name field: typed for a new user or key, shown only for the one asked about. */
  #name(label: string, value: string, readOnly: boolean): HTMLElement {
    const doc = this.doc;
    const input = make(doc, 'input');
    input.type = 'text';
    input.name = 'name';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = value;
    input.readOnly = readOnly;
    input.dataset['part'] = 'dialog-name';
    const field = make(doc, 'label', 'fld');
    field.append(make(doc, 'span', 'cap', label), input);
    return field;
  }

  /** The three scopes of a key, the least chosen. */
  #scopes(): HTMLElement {
    const doc = this.doc;
    const set = make(doc, 'fieldset', 'scope');
    set.append(make(doc, 'legend', 'cap', 'Scope'));
    const options = make(doc, 'div', 'opts');
    for (const [scope, sub] of SCOPES) {
      const option = make(doc, 'label');
      const radio = make(doc, 'input');
      radio.type = 'radio';
      radio.name = 'scope';
      radio.value = scope;
      radio.checked = scope === 'read';
      const box = make(doc, 'span', 'box');
      box.append(make(doc, 'span', 'opt', scope), make(doc, 'span', 'sub', sub));
      option.append(radio, box);
      options.append(option);
    }
    set.append(options);
    return set;
  }

  #error(): HTMLElement {
    const error = make(this.doc, 'p', 'fail');
    error.dataset['part'] = 'dialog-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    return error;
  }

  #fail(message: string): void {
    const error = this.#form.querySelector<HTMLElement>('[data-part="dialog-error"]');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  #submit(): void {
    const ask = this.#ask;
    const ok = this.#form.querySelector<HTMLButtonElement>('[data-part="dialog-ok"]');
    // a dialog that shows a secret has only Done
    if (!ok) return this.close();
    if (this.#busy) return;
    const input = this.#form.querySelector<HTMLInputElement>('[data-part="dialog-name"]') as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return input.focus();
    const scope = (this.#form.querySelector<HTMLInputElement>('input[name="scope"]:checked')?.value ?? 'read') as KeyScope;
    // a secret to show, or nothing once the change is done
    const done = (change: Promise<void>): Promise<undefined> => change.then(() => undefined);
    const answer: Promise<string | undefined> =
      ask.kind === 'user'
        ? this.access.addUser(name)
        : ask.kind === 'key'
          ? this.access.makeKey(name, scope)
          : ask.kind === 'reset'
            ? this.access.resetPassword(ask.user.id)
            : ask.kind === 'remove'
              ? done(this.access.removeUser(ask.user.id))
              : done(this.access.revokeKey(ask.key.id));
    this.#busy = true;
    ok.disabled = true;
    answer.then(
      (secret) => {
        if (ask !== this.#ask || !this.node.open) return;
        if (typeof secret === 'string') this.#created(name, secret);
        else this.close();
      },
      (reason: unknown) => {
        if (ask !== this.#ask || !this.node.open) return;
        this.#busy = false;
        ok.disabled = false;
        this.#fail(reason instanceof Error ? reason.message : String(reason));
      },
    );
  }

  /** The new password or key, shown this once, with what to do with it. */
  #created(name: string, secret: string): void {
    const doc = this.doc;
    const key = this.#ask.kind === 'key';
    const title = key ? 'New agent key · created' : this.#ask.kind === 'reset' ? 'Password reset' : 'New user · created';
    const parts = [this.#name(key ? 'Name' : 'User name', name, true)];
    const scopes = this.#form.querySelector('.scope');
    if (scopes) {
      for (const radio of scopes.querySelectorAll('input')) radio.disabled = true;
      parts.push(scopes as HTMLElement);
    }
    const field = make(doc, 'div', 'fld');
    const label = make(doc, 'label', 'cap', key ? 'Key' : 'Temporary password');
    label.htmlFor = 'hb-server-secret';
    const row = make(doc, 'div', 'secret');
    const input = make(doc, 'input');
    input.id = 'hb-server-secret';
    input.type = 'text';
    input.readOnly = true;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = secret;
    input.dataset['part'] = 'dialog-secret';
    const copy = make(doc, 'button', 'btn copy');
    copy.type = 'button';
    copy.dataset['part'] = 'dialog-copy';
    const copyText = make(doc, 'span', '', 'Copy');
    copy.append(icon(doc, 'copy'), copyText);
    copy.addEventListener('click', () => {
      const clipboard = doc.defaultView?.navigator.clipboard;
      const copied = clipboard ? clipboard.writeText(input.value) : Promise.reject(new Error(NO_COPY));
      copied.then(
        () => {
          copyText.textContent = 'Copied';
        },
        () => this.#fail(NO_COPY),
      );
    });
    row.append(input, copy);
    field.append(label, row);
    const says = key
      ? [
          'Shown once. Copy it now and keep it as you keep a password; the server keeps only a hash.',
          'Revoke it any time in the key list. Everything it changes is kept as a snapshot under its name.',
        ]
      : [
          `Shown once. Give it to ${name} in person; the server keeps only a hash of it.`,
          `${name} replaces it at the first sign-in and can do nothing else before that.`,
        ];
    const done = make(doc, 'button', 'btn primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => this.close());
    this.#draw(title, [...parts, field, make(doc, 'p', 'say', says[0]), make(doc, 'p', 'say more', says[1]), this.#error()], [done]);
    input.focus();
  }
}
