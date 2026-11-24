import type { Group } from '@h-board/core';
import { make } from './dom';
import { icon } from './parts';

/**
 * The dialog that names a group: a new one, or the group to rename. It changes nothing itself; `save` gets the name
 * and the group it renames, `null` for a new one. It looks like the site dialog.
 */
export class GroupDialog {
  readonly node: HTMLDialogElement;
  private readonly form: HTMLFormElement;
  private readonly title: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly ok: HTMLButtonElement;
  private group: Group | null = null;

  constructor(
    private readonly doc: Document,
    private readonly save: (name: string, group: Group | null) => void,
  ) {
    this.node = make(doc, 'dialog', 'hb-dialog');
    this.node.dataset['part'] = 'group-dialog';
    this.node.setAttribute('aria-labelledby', 'hb-group-dialog-title');
    this.form = make(doc, 'form');
    this.form.noValidate = true;
    this.title = make(doc, 'h2', 'label');
    this.title.id = 'hb-group-dialog-title';
    this.title.dataset['part'] = 'group-dialog-title';
    const close = make(doc, 'button', 'x');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.append(icon(doc, 'x'));
    this.name = make(doc, 'input');
    this.name.name = 'name';
    this.name.type = 'text';
    this.name.autocomplete = 'off';
    this.name.spellcheck = false;
    const field = make(doc, 'label', 'fld');
    field.append(make(doc, 'span', 'cap', 'Name'), this.name);
    const actions = make(doc, 'div', 'acts');
    const cancel = make(doc, 'button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.dataset['part'] = 'group-dialog-cancel';
    this.ok = make(doc, 'button', 'btn primary');
    this.ok.type = 'submit';
    actions.append(cancel, this.ok);
    this.form.append(make(doc, 'div', 'top'), this.title, close, field, actions);
    this.node.append(this.form);

    for (const button of [close, cancel]) button.addEventListener('click', () => this.node.close());
    this.node.addEventListener('click', (event) => {
      if (event.target === this.node) this.node.close(); // the backdrop
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.name.value.trim();
      if (!name) {
        this.name.focus();
        return;
      }
      this.node.close();
      this.save(name, this.group);
    });
  }

  get open(): boolean {
    return this.node.open;
  }

  /** Opens the dialog for a new group, or for `group` to rename. */
  show(group: Group | null = null): void {
    this.group = group;
    this.title.replaceChildren(
      make(this.doc, 'span', 'idx', group ? '[ ✎ ]' : '[ + ]'),
      make(this.doc, 'span', 'txt', group ? `Rename group · ${group.name}` : 'New group'),
    );
    this.ok.textContent = group ? 'Save' : 'Add';
    this.name.value = group?.name ?? '';
    this.node.showModal();
    this.name.focus();
  }
}
