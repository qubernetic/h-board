import { make } from './dom';

/** A button in a toast. */
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

/** How long a toast stays: with an action it waits for the user longer. */
export const TOAST_MS = 2600;
export const TOAST_ACTION_MS = 6000;

/** The short message at the foot of the page, with one action at most. Its text goes in as text. */
export class Toast {
  readonly node: HTMLElement;
  private action: ToastAction | null = null;
  private timer = 0;

  constructor(
    private readonly doc: Document,
    private readonly win: Window,
  ) {
    this.node = make(doc, 'div', 'hb-toast');
    this.node.dataset['part'] = 'toast';
    this.node.setAttribute('role', 'status');
    this.node.setAttribute('aria-live', 'polite');
    this.node.addEventListener('click', (event) => {
      const action = this.action;
      if (!action || !(event.target as Element).closest('button')) return;
      this.hide();
      action.run();
    });
  }

  show(message: string, action?: ToastAction): void {
    this.action = action ?? null;
    const parts: HTMLElement[] = [make(this.doc, 'span', 'msg', message)];
    if (action) {
      const button = make(this.doc, 'button', '', action.label);
      button.type = 'button';
      // the time left for the action; the style sheet leaves it out when there is no motion
      const bar = make(this.doc, 'span', 'bar');
      bar.style.animationDuration = `${TOAST_ACTION_MS}ms`;
      parts.push(button, bar);
    }
    this.node.replaceChildren(...parts);
    this.node.dataset['on'] = '';
    this.win.clearTimeout(this.timer);
    this.timer = this.win.setTimeout(() => this.hide(), action ? TOAST_ACTION_MS : TOAST_MS);
  }

  hide(): void {
    this.win.clearTimeout(this.timer);
    this.action = null;
    delete this.node.dataset['on'];
  }
}
