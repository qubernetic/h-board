import { emptyHistory, previewRestore } from '@h-board/core';
import type { History, Snapshot } from '@h-board/core';
import { make, pad2 } from './dom';
import { sitesLabel } from './parts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

const hhmm = (date: Date): string => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/** When a snapshot was kept, as the list shows it: `today 09:05`, `yesterday 23:59`, `Nov 17 08:00`. */
export function whenOf(at: number, now: Date): string {
  const date = new Date(at);
  const days = Math.round(
    (new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY_MS,
  );
  const day = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${MONTHS[date.getMonth()] as string} ${date.getDate()}`;
  return `${day} ${hhmm(date)}`;
}

const snapshots = (n: number): string => `${n} ${n === 1 ? 'snapshot' : 'snapshots'}`;

/** The status bar's sign: when the newest snapshot was kept, and how many there are. */
export function savedLine(history: History): string {
  const [newest] = history.snapshots;
  return newest ? `saved · ${hhmm(new Date(newest.at))} · ${snapshots(history.snapshots.length)}` : 'no snapshots';
}

/** What changed in a snapshot, with the key's name when an agent changed it. Names in it are user data: show it as text. */
export function changeLine(snapshot: Snapshot): string {
  return snapshot.source.kind === 'agent' ? `${snapshot.source.key}: ${snapshot.summary}` : snapshot.summary;
}

/** What a restore of the chosen snapshot would change. Names in it are user data: show it as text. */
export function previewLine(changes: readonly string[]): string {
  return changes.length > 0 ? `If you restore it: ${changes.join(', ')}.` : 'This is the library as it is now.';
}

/**
 * The restore panel: every snapshot kept, newest first, with what changed and how many sites it holds. The row in
 * focus is the chosen one; the preview says what a restore of it would change.
 */
export class RestorePanel {
  readonly node: HTMLElement;
  private readonly title: HTMLElement;
  private readonly list: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly go: HTMLButtonElement;
  private history: History = emptyHistory();
  private now = new Date();
  /** The id of the chosen snapshot, or `null` while none is. */
  private chosen: number | null = null;

  constructor(
    private readonly doc: Document,
    private readonly restore: (id: number) => void,
  ) {
    this.node = make(doc, 'div', 'hb-restore');
    this.node.dataset['part'] = 'restore';
    this.node.setAttribute('role', 'dialog');
    this.node.hidden = true;
    this.title = make(doc, 'div', 'head');
    this.title.id = 'hb-restore-title';
    this.title.dataset['part'] = 'restore-title';
    this.node.setAttribute('aria-labelledby', this.title.id);
    this.list = make(doc, 'ul', 'list');
    this.list.dataset['part'] = 'restore-list';
    this.preview = make(doc, 'div', 'preview');
    this.preview.dataset['part'] = 'restore-preview';
    this.preview.setAttribute('aria-live', 'polite');
    this.go = make(doc, 'button', 'go', 'Restore');
    this.go.type = 'button';
    this.go.dataset['part'] = 'restore-go';
    const hint = make(
      doc,
      'div',
      'hint',
      'A snapshot is kept after every change, on this computer: the newest 20, and one a day for a week. ' +
        'The library before a restore is kept too. ↑↓ walk, enter restores.',
    );
    this.node.append(this.title, this.list, this.preview, this.go, hint);

    this.list.addEventListener('click', (event) => {
      const row = this.rowOf(event.target);
      if (row) this.pick(Number(row.dataset['id']));
    });
    // the preview follows the focus
    this.list.addEventListener('focusin', (event) => {
      const row = this.rowOf(event.target);
      if (row) this.pick(Number(row.dataset['id']));
    });
    this.list.addEventListener('keydown', (event) => this.onKey(event));
    this.go.addEventListener('click', () => this.restoreChosen());
  }

  get open(): boolean {
    return !this.node.hidden;
  }

  /** Opens on `history` with nothing chosen, the focus on the newest row. */
  show(history: History, now: Date): void {
    this.chosen = null;
    this.node.hidden = false;
    this.update(history, now);
    (this.list.querySelector<HTMLElement>('button') ?? this.go).focus();
  }

  hide(): void {
    this.node.hidden = true;
  }

  /** Takes a change made here or elsewhere; the chosen snapshot stays chosen while it is kept. */
  update(history: History, now: Date): void {
    this.history = history;
    this.now = now;
    if (!history.snapshots.some((snapshot) => snapshot.id === this.chosen)) this.chosen = null;
    if (this.open) this.draw();
  }

  private draw(): void {
    const doc = this.doc;
    const { snapshots } = this.history;
    const focused = this.rowOf(doc.activeElement)?.dataset['id'];
    this.title.textContent = `Restore · ${snapshots.length} ${snapshots.length === 1 ? 'snapshot' : 'snapshots'}`;
    this.list.replaceChildren(
      ...snapshots.map((snapshot) => {
        const row = make(doc, 'button');
        row.type = 'button';
        row.dataset['id'] = String(snapshot.id);
        row.append(
          make(doc, 'span', 't', whenOf(snapshot.at, this.now)),
          make(doc, 'span', 'l', changeLine(snapshot)),
          make(doc, 'span', 'm', sitesLabel(snapshot.sites)),
        );
        const item = make(doc, 'li');
        item.append(row);
        return item;
      }),
    );
    if (focused) this.list.querySelector<HTMLElement>(`button[data-id="${focused}"]`)?.focus();
    this.drawChoice();
  }

  /** The chosen row, what a restore of it would change, and whether there is anything to restore. */
  private drawChoice(): void {
    for (const row of this.list.querySelectorAll('button')) {
      row.setAttribute('aria-pressed', String(Number(row.dataset['id']) === this.chosen));
    }
    const changes = this.chosen === null ? [] : previewRestore(this.history, this.chosen);
    this.preview.textContent =
      this.chosen === null ? 'Choose a snapshot to see what a restore would change.' : previewLine(changes);
    this.go.disabled = changes.length === 0;
  }

  private pick(id: number): void {
    if (id === this.chosen) return;
    this.chosen = id;
    this.drawChoice();
  }

  /** The arrows walk the list, Enter restores the row in focus; neither reaches the page. */
  private onKey(event: KeyboardEvent): void {
    const row = this.rowOf(event.target);
    if (!row) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const item = row.parentElement as HTMLElement;
      const next = event.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling;
      next?.querySelector<HTMLElement>('button')?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.pick(Number(row.dataset['id']));
      this.restoreChosen();
    }
  }

  private restoreChosen(): void {
    if (this.chosen === null || this.go.disabled) return;
    this.restore(this.chosen);
  }

  private rowOf(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('.hb-restore .list button') : null;
  }
}
