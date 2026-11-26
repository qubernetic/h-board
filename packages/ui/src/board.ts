/// <reference types="vite/client" />
import { BURST_MS, DENSITIES, ICON_MODES, LAYOUTS, diffLibraries, jumpCode, layout, summarise } from '@h-board/core';
import { DEFAULT_SETTINGS, MOTIONS } from '@h-board/core';
import type { Density, Group, History, IconMode, ImportGroup,Layout as CardLayout, Library, Motion, PageLayout, Site, Theme } from '@h-board/core';
import type { ApplyOptions, State, Store } from '@h-board/store';
import logoDark from '../assets/img/lockup-horizontal-dark.svg';
import logoLight from '../assets/img/lockup-horizontal-light.svg';
import './board.css';
import { clockParts } from './clock';
import { make, pad2, place } from './dom';
import { SiteDialog } from './dialog';
import type { SiteForm } from './dialog';
import { standbyGrid, startGrid } from './field';
import type { Rect } from './field';
import { FieldView } from './field-view';
import { Moves } from './moves';
import { Standby } from './standby';
import { GroupDialog } from './group-dialog';
import { codeStep } from './codes';
import { codeHints, keyAction, keyHints, keysOf } from './keys';
import type { KeyPress } from './keys';
import { motionLevel, windowFrames } from './motion';
import type { Frames } from './motion';
import { hasBrand } from './brands';
import { FaviconCache } from './favicons';
import type { Favicon, FaviconSource } from './favicons';
import { addTile, card, groupActions, icon, isWebAddress, label, modeOf, sitesLabel, sizeGrid, tile, todoForm, todoList, wheel } from './parts';
import { SearchLine, memoryHistory } from './search';
import type { SearchHistory } from './search';
import { downloadFile, exportName } from './files';
import { RestorePanel, savedLine } from './restore';
import { ServerSection } from './server';
import type { ServerAccess } from './server';
import { Toast } from './toast';
import type { ToastAction } from './toast';

export interface BoardOptions {
  /** The clock. `new Date()` when left out. */
  readonly now?: () => Date;
  /** The page's size in CSS px. The window's, but at least 960 x 640, when left out. */
  readonly viewport?: () => { w: number; h: number };
  /** Whether the system asks for a dark page. `prefers-color-scheme` when left out. */
  readonly systemDark?: () => boolean;
  /** Whether the system asks for less motion. `prefers-reduced-motion` when left out. */
  readonly systemReducedMotion?: () => boolean;
  /** The clock of the movements. The window's frames when left out. */
  readonly frames?: Frames;
  /** The random source of the character field and the scramble. `Math.random` when left out. */
  readonly random?: () => number;
  /** How long the page waits without input before it goes to home · standby, in ms. Five minutes when left out. */
  readonly idleMs?: number;
  /** Opens an address the user chose. A new tab without access to this page when left out. */
  readonly open?: (url: string) => void;
  /** Opens an address in a tab behind this one, for Shift and a jump code. `open` when left out: a page cannot choose. */
  readonly openBehind?: (url: string) => void;
  /** Where the search line keeps its last searches. The page's memory when left out. */
  readonly searchHistory?: SearchHistory;
  /** Saves an exported library as the file `name`. A download when left out. */
  readonly save?: (name: string, text: string) => void;
  /**
   * Reads the browser's bookmarks, one group per folder; `undefined` when the browser does not allow it.
   * Called in the click, so that the host can ask for the permission. No bookmark import when left out.
   */
  readonly bookmarks?: () => Promise<readonly ImportGroup[] | undefined>;
  /**
   * The favicons the browser has already stored, for the favicon mode. Without it that mode shows the sites' Phosphor
   * icons. Its `allow` is called in the click that switches a group or a site to favicons.
   */
  readonly favicons?: FaviconSource;
  /** Opens the page with the settings shown: the extension's settings page. Closed when left out. */
  readonly openSettings?: boolean;
  /** Hears the id of the group in view, on the first drawing and on every change: the address bar's codes go there. */
  readonly onGroup?: (id: string) => void;
  /** The user's own server, for the settings' Server section. No such section when left out. */
  readonly server?: ServerAccess;
}

/** The empty group's block (label, heading, text, buttons, tip) takes this much room above the info strip. */
const EMPTY_H = 300;
/** Five minutes without input, then home · standby. */
const IDLE_MS = 300_000;
/** Pixel steps of a touchpad that add up to one group. */
const WHEEL_STEP = 100;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * The start page on a store: it draws the library and changes it only by running core commands through the store.
 * Which group is in view is the page's own state.
 */
export class Board {
  private readonly doc: Document;
  private readonly win: Window;
  private library: Library;
  private history: History;
  private active = 0;
  private activeId: string | null;
  /** The group `onGroup` heard of last. */
  private toldGroup: string | null = null;
  private L: PageLayout | undefined;
  private wheelSum = 0;
  private wheelAt = 0;
  /** When the last move ran; a move less than `BURST_MS` after it joins its snapshot. */
  private moveAt = -Infinity;
  private editing = false;
  /** The letters typed while the jump codes show, or `null` while they do not. */
  private codes: string | null = null;
  private readonly open: (url: string) => void;
  /** Whether the user picked a motion level on this page; until then a system asking for less motion means none. */
  private motionPicked = false;
  private readonly listeners: (() => void)[] = [];
  private readonly frames: Frames;
  private readonly random: () => number;
  /** When the user last pressed a key, clicked, turned the wheel or moved the pointer, on the frames' clock. */
  private lastInput: number;

  private readonly page: HTMLElement;
  private readonly start: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly view: FieldView;
  private readonly standby: Standby;
  private readonly moves: Moves;
  /** Where the cards were before a change of density or columns, for the FLIP of the next drawing. */
  private flipFrom: Map<string, DOMRect> | null = null;
  private readonly logo: HTMLImageElement;
  private readonly themeButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly railRule: HTMLElement;
  private readonly heroLabel: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly seconds: HTMLElement;
  private readonly search: SearchLine;
  private readonly todo: HTMLElement;
  private readonly todoBox: HTMLElement;
  private readonly todoForm: HTMLFormElement;
  private readonly sectionRow: HTMLElement;
  private readonly section: HTMLElement;
  private readonly editNote: HTMLElement;
  private readonly switcher: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly fade: HTMLElement;
  private readonly track: HTMLElement;
  private readonly thumb: HTMLElement;
  private readonly more: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly statusLeft: HTMLElement;
  private readonly saved: HTMLButtonElement;
  private readonly restorePanel: RestorePanel;
  /** The file field behind the settings' Import; it stays out of the panel, which draws itself again. */
  private readonly importFile: HTMLInputElement;
  /** Why the last file could not be imported, shown in the settings until they close; empty when nothing is wrong. */
  private importError = '';
  private readonly keys: HTMLElement;
  private readonly toast: Toast;
  private readonly dialog: SiteDialog;
  private readonly favicons: FaviconCache;
  private readonly groupDialog: GroupDialog;
  private readonly server: ServerSection | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: Store,
    state: State,
    private readonly options: BoardOptions = {},
  ) {
    this.doc = root.ownerDocument;
    // a document in a page always has its window
    this.win = this.doc.defaultView as Window;
    this.library = state.library;
    this.history = state.history;
    this.activeId = state.library.settings.activeGroup;
    const doc = this.doc;

    this.frames = options.frames ?? windowFrames(this.win);
    this.random = options.random ?? Math.random;
    this.lastInput = this.frames.now();
    this.open = options.open ?? ((url) => this.win.open(url, '_blank', 'noopener'));
    this.page = make(doc, 'div', 'hb');
    this.page.dataset['part'] = 'page';
    this.start = make(doc, 'div', 'hb-start');
    this.lines = make(doc, 'div', 'hb-lines');
    this.view = new FieldView(doc, this.win, this.frames, this.random);
    this.moves = new Moves(this.frames, this.random);

    const header = make(doc, 'header', 'hb-header');
    const logoBox = make(doc, 'div', 'hb-logo');
    logoBox.dataset['part'] = 'logo';
    this.logo = make(doc, 'img');
    this.logo.alt = 'Qubernetic';
    logoBox.append(this.logo);
    this.themeButton = make(doc, 'button', 'hb-hbtn hb-theme');
    this.themeButton.type = 'button';
    this.themeButton.dataset['part'] = 'theme';
    this.settingsButton = make(doc, 'button', 'hb-hbtn hb-settings');
    this.settingsButton.type = 'button';
    this.settingsButton.dataset['part'] = 'settings';
    this.settingsButton.setAttribute('aria-label', 'Settings');
    this.settingsButton.setAttribute('aria-expanded', 'false');
    this.settingsButton.append(icon(doc, 'gear-six'));
    const account = make(doc, 'button', 'hb-hbtn hb-account', 'HB');
    account.type = 'button';
    account.disabled = true;
    account.setAttribute('aria-label', 'Account: comes with your own server');
    header.append(logoBox, this.themeButton, this.settingsButton, account);

    this.panel = make(doc, 'div', 'hb-panel');
    this.panel.dataset['part'] = 'settings-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Settings');
    this.panel.hidden = true;

    this.rail = make(doc, 'nav', 'hb-rail');
    this.rail.dataset['part'] = 'rail';
    this.rail.setAttribute('aria-label', 'Groups');
    this.railRule = make(doc, 'div', 'hb-rail-rule');

    const main = make(doc, 'div', 'hb-main');
    const title = make(doc, 'h1', 'vh', 'H-Board');
    this.heroLabel = label(doc, '00', '');
    this.heroLabel.classList.add('abs');
    this.heroLabel.querySelector('.txt')?.setAttribute('data-part', 'date');
    this.clock = make(doc, 'div', 'abs clock');
    this.clock.dataset['part'] = 'time';
    this.clock.setAttribute('role', 'timer');
    this.seconds = make(doc, 'div', 'abs clock-s');
    this.seconds.dataset['part'] = 'seconds';
    this.seconds.setAttribute('aria-hidden', 'true');
    this.search = new SearchLine(doc, {
      library: () => this.library,
      active: () => this.active,
      setEngine: (engine) => this.set({ engine }),
      open: this.open,
      history: options.searchHistory ?? memoryHistory(),
      listen: (target, type, handler) => this.on(target, type, handler),
    });
    this.todo = make(doc, 'section', 'abs hb-todo');
    this.todo.setAttribute('aria-label', 'To do');
    this.todoBox = make(doc, 'div');
    // the field stays where it is when the list is drawn again, so it keeps the focus
    this.todoForm = todoForm(doc);
    this.todo.append(this.todoBox, this.todoForm);

    this.sectionRow = make(doc, 'div', 'abs');
    this.sectionRow.dataset['part'] = 'section-row';
    this.section = label(doc, '', '', 'section');
    this.section.classList.add('abs');
    this.switcher = make(doc, 'div', 'abs hb-switch');
    this.switcher.setAttribute('role', 'group');
    this.switcher.setAttribute('aria-label', 'Cards');
    this.editNote = make(doc, 'span', 'abs hb-editnote');
    this.editNote.append(make(doc, 'span', '', `edit mode · drag to move · ${keysOf('edit')}: done`), groupActions(doc));
    this.editNote.dataset['part'] = 'edit-note';
    this.editNote.hidden = true;
    this.sectionRow.append(this.section, this.editNote, this.switcher);

    this.grid = make(doc, 'div', 'abs hb-grid');
    this.grid.dataset['part'] = 'grid';
    this.fade = make(doc, 'div', 'abs hb-fade');
    this.track = make(doc, 'div', 'abs hb-track');
    this.thumb = make(doc, 'div', 'abs hb-thumb');
    this.more = make(doc, 'div', 'abs hb-more');
    this.more.dataset['part'] = 'more';
    for (const node of [this.fade, this.track, this.thumb, this.more]) node.setAttribute('aria-hidden', 'true');

    this.empty = make(doc, 'section', 'abs hb-empty');
    this.empty.dataset['part'] = 'empty';

    main.append(
      title,
      this.heroLabel,
      this.clock,
      this.seconds,
      this.search.scrim,
      this.search.box,
      this.search.list,
      this.todo,
      this.sectionRow,
      this.grid,
      this.fade,
      this.track,
      this.thumb,
      this.more,
      this.empty,
    );

    const status = make(doc, 'footer', 'hb-status');
    const left = make(doc, 'span', 'hb-status-l');
    // the sign says the library is kept, and opens the snapshots
    this.saved = make(doc, 'button', 'hb-saved');
    this.saved.type = 'button';
    this.saved.dataset['part'] = 'saved';
    this.saved.setAttribute('aria-expanded', 'false');
    this.saved.title = `Snapshots and restore (${keysOf('restore')})`;
    this.statusLeft = make(doc, 'span');
    this.statusLeft.dataset['part'] = 'status-left';
    left.append(this.saved, this.statusLeft);
    this.keys = make(doc, 'span');
    this.keys.dataset['part'] = 'keys';
    status.append(left, this.keys);

    this.toast = new Toast(doc, this.win);
    this.restorePanel = new RestorePanel(doc, (id) => this.restoreTo(id));
    this.importFile = make(doc, 'input');
    this.importFile.type = 'file';
    this.importFile.accept = 'application/json,.json';
    this.importFile.hidden = true;
    this.importFile.dataset['part'] = 'import-file';
    this.favicons = new FaviconCache(options.favicons, () => this.drawFavicons());
    const source = options.favicons;
    this.dialog = new SiteDialog(doc, (form, site) => this.saveSite(form, site), {
      image: (url) => this.favicons.get(url)?.image,
      ...(source && { allow: () => this.allowFavicons(source) }),
    });
    this.groupDialog = new GroupDialog(doc, (name, group) => this.saveGroup(name, group));
    this.server = options.server ? new ServerSection(doc, options.server, options.now) : undefined;
    this.start.append(this.lines, header, this.railRule, this.rail, main, status);
    this.standby = new Standby(doc, this.frames, {
      page: this.page,
      start: this.start,
      clock: this.clock,
      lines: this.lines,
      view: this.view,
      blocks: () => this.dissolving(),
      layoutField: (standby) => this.layoutField(standby),
      size: () => this.viewport(),
      settled: () => this.syncField(),
      random: this.random,
    });
    this.page.append(
      this.view.canvas,
      this.start,
      this.standby.node,
      this.panel,
      this.restorePanel.node,
      this.importFile,
      this.toast.node,
      this.dialog.node,
      this.groupDialog.node,
      ...(this.server ? [this.server.dialog.node] : []),
    );
    root.replaceChildren(this.page);
    this.listen();
    this.draw();
    this.tick();
    if (options.openSettings) this.showPanel(true);
    if (state.notice) this.toast.show(state.notice);
  }

  /** Takes the store's library: a change made here or in another page. */
  update(state: State): void {
    this.library = state.library;
    this.history = state.history;
    this.draw();
  }

  /** Stops listening. The drawing stays as it is. */
  stop(): void {
    for (const off of this.listeners.splice(0)) off();
    this.standby.finish();
    this.view.stop();
  }

  // ---------------------------------------------------------------- input

  private on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  private listen(): void {
    const onKey = (event: KeyboardEvent): void => this.onKey(event);
    this.doc.addEventListener('keydown', onKey);
    this.listeners.push(() => this.doc.removeEventListener('keydown', onKey));
    const onResize = (): void => this.draw();
    this.win.addEventListener('resize', onResize);
    this.listeners.push(() => this.win.removeEventListener('resize', onResize));
    const onPointer = (event: PointerEvent): void => {
      this.lastInput = this.frames.now();
      if (this.standby.on) {
        event.preventDefault();
        this.wake(event.clientX, event.clientY);
        return;
      }
      const target = event.target as Element | null;
      if (!this.panel.hidden && !target?.closest('.hb-panel, .hb-settings, .server-dialog')) this.showPanel(false);
      if (this.restorePanel.open && !target?.closest('.hb-restore, .hb-saved')) this.showRestore(false);
      this.setCodes(null);
    };
    this.doc.addEventListener('pointerdown', onPointer);
    this.listeners.push(() => this.doc.removeEventListener('pointerdown', onPointer));
    const onMove = (event: PointerEvent): void => {
      const box = this.page.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (!this.standby.on) this.lastInput = this.frames.now();
      else if (this.standby.wakes(x, y)) this.wake(x, y);
      this.view.move(x, y);
    };
    this.doc.addEventListener('pointermove', onMove);
    this.listeners.push(() => this.doc.removeEventListener('pointermove', onMove));
    const onLeave = (): void => this.view.leave();
    this.doc.documentElement.addEventListener('pointerleave', onLeave);
    this.listeners.push(() => this.doc.documentElement.removeEventListener('pointerleave', onLeave));
    if (typeof this.doc.fonts?.ready?.then === 'function') {
      // the field's glyphs and the blocks it quiets wait for the fonts
      void this.doc.fonts.ready.then(() => this.draw());
    }
    const timer = this.win.setInterval(() => this.tick(), 250);
    this.listeners.push(() => this.win.clearInterval(timer));
    for (const [given, media] of [
      [this.options.systemDark, '(prefers-color-scheme: dark)'],
      [this.options.systemReducedMotion, '(prefers-reduced-motion: reduce)'],
    ] as const) {
      if (given || typeof this.win.matchMedia !== 'function') continue;
      const query = this.win.matchMedia(media);
      const onChange = (): void => this.draw();
      query.addEventListener('change', onChange);
      this.listeners.push(() => query.removeEventListener('change', onChange));
    }

    this.on(this.page, 'wheel', (event) => this.onWheel(event), { passive: false });
    this.on(this.rail, 'click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-index], [data-part="add-group"]');
      if (target?.dataset['part'] === 'add-group') this.groupDialog.show();
      else if (target) this.jump(Number(target.dataset['index']));
    });
    this.on(this.themeButton, 'click', () => {
      this.set({ theme: this.theme() === 'dark' ? 'light' : 'dark' });
    });
    this.on(this.settingsButton, 'click', () => this.showPanel(this.panel.hidden === true));
    this.on(this.saved, 'click', () => this.showRestore(!this.restorePanel.open));
    this.on(this.switcher, 'click', (event) => {
      const button = (event.target as Element).closest<HTMLElement>('button');
      if (!button) return;
      const cardLayout = button.dataset['layout'];
      if (cardLayout) this.set({ layout: cardLayout as CardLayout });
      else this.stepDensity(1);
    });
    this.on(this.panel, 'click', (event) => {
      const button = (event.target as Element).closest<HTMLElement>('button');
      if (!button) return;
      const { columns } = this.library.settings;
      const density = button.dataset['density'];
      if (density) this.relayout({ density: density as Density });
      else if (button.dataset['part'] === 'columns-up') this.relayout({ columns: columns ? Math.min(12, columns + 1) : 4 });
      else if (button.dataset['part'] === 'columns-down') this.relayout({ columns: columns > 4 ? columns - 1 : 0 });
      else if (button.dataset['part'] === 'theme-system') this.set({ theme: 'system' });
      else if (button.dataset['motion']) this.pickMotion(button.dataset['motion'] as Motion);
      else if (button.dataset['iconMode']) this.setIconMode(button.dataset['iconMode'] as IconMode);
      else if (button.dataset['part'] === 'restore-open') this.showRestore(true);
      else if (button.dataset['part'] === 'export') this.exportLibrary();
      else if (button.dataset['part'] === 'import') this.importFile.click();
      else if (button.dataset['part'] === 'bookmarks') this.importBookmarks();
    });
    this.on(this.importFile, 'change', () => {
      const file = this.importFile.files?.[0];
      // the same file can be picked again
      this.importFile.value = '';
      if (file) void this.importLibrary(file);
    });
    this.on(this.grid, 'scroll', () => this.drawScroll());
    this.on(this.empty, 'click', (event) => {
      if ((event.target as Element).closest('.btn.primary')) this.openDialog();
      else if ((event.target as Element).closest('.btn.import')) this.importBookmarks();
      else this.onGroupAct(event);
    });
    this.on(this.editNote, 'click', (event) => this.onGroupAct(event));
    this.listenTodos();
    this.on(this.grid, 'click', (event) => this.onGridClick(event));
    this.on(this.grid, 'keydown', (event) => this.onCardKey(event));
    this.listenDrag();
  }

  /** In edit mode Shift and an arrow key move the focused card one place. */
  private onCardKey(event: KeyboardEvent): void {
    const card = event.target as HTMLElement;
    if (!event.shiftKey || !card.matches('.card.ed')) return;
    const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!by) return;
    event.preventDefault();
    event.stopPropagation();
    const from = Number(card.dataset['index']);
    this.moveSite(from, from + by);
  }

  /** In edit mode a card dragged onto another takes its place, before or after it by the side it is dropped on. */
  private listenDrag(): void {
    let from = -1;
    const cardOf = (event: Event): HTMLElement | null =>
      (event.target as Element).closest<HTMLElement>('.card.ed[data-index]');
    const clear = (): void => {
      for (const node of this.grid.querySelectorAll('.drop-before, .drop-after')) {
        node.classList.remove('drop-before', 'drop-after');
      }
    };
    const after = (card: HTMLElement, event: DragEvent): boolean => {
      const rect = card.getBoundingClientRect();
      return this.library.settings.layout === 'compact'
        ? event.clientY > rect.top + rect.height / 2
        : event.clientX > rect.left + rect.width / 2;
    };
    this.on(this.grid, 'dragstart', (event) => {
      const card = cardOf(event);
      if (!card) return;
      from = Number(card.dataset['index']);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    this.on(this.grid, 'dragover', (event) => {
      const card = cardOf(event);
      if (from < 0 || !card) return;
      event.preventDefault();
      clear();
      if (Number(card.dataset['index']) !== from) card.classList.add(after(card, event) ? 'drop-after' : 'drop-before');
    });
    this.on(this.grid, 'drop', (event) => {
      const card = cardOf(event);
      if (from < 0 || !card) return;
      event.preventDefault();
      let to = Number(card.dataset['index']) + (after(card, event) ? 1 : 0);
      if (to > from) to -= 1;
      clear();
      this.moveSite(from, to);
      from = -1;
    });
    this.on(this.grid, 'dragend', () => {
      from = -1;
      clear();
      for (const node of this.grid.querySelectorAll('.dragging')) node.classList.remove('dragging');
    });
  }

  /** Moves the site at `from` in the group in view to `to`, and keeps the focus on its card. */
  private moveSite(from: number, to: number): void {
    const sites = this.library.groups[this.active]?.sites ?? [];
    const site = sites[from];
    if (!site || from === to || to < 0 || to >= sites.length) return;
    const focused = this.doc.activeElement === this.grid.querySelector(`.card[data-index="${from}"]`);
    // the first move of a run starts its own snapshot, so it never joins an edit of another kind
    const now = Date.now();
    const alone = now - this.moveAt >= BURST_MS;
    this.moveAt = now;
    this.run('site.move', { site: site.id, to }, { alone }, () => {
      if (focused) this.grid.querySelector<HTMLElement>(`.card[data-index="${to}"]`)?.focus();
    });
  }

  private onGridClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (target.closest('[data-part="add-site"]')) {
      this.openDialog();
      return;
    }
    const site = this.siteAt(target);
    const act = target.closest<HTMLElement>('[data-act]')?.dataset['act'];
    const card = target.closest<HTMLElement>('.card') as HTMLElement | null;
    // a card on its way out takes no more actions, so a double click deletes once
    if (!site || !act || !card || card.dataset['leaving'] !== undefined) return;
    if (act === 'edit') {
      this.openDialog(site);
      return;
    }
    card.dataset['leaving'] = '';
    this.moves.leave(card, this.motion(), () => {
      this.run('site.remove', { site: site.id }, { alone: true }, () => {
        this.toast.show(`deleted: ${site.name}`, this.undoAction());
      });
    });
  }

  /** Ticks, deletes and adds to-dos. */
  private listenTodos(): void {
    const input = this.todoForm.querySelector('input') as HTMLInputElement;
    this.on(this.todoBox, 'click', (event) => {
      const target = event.target as Element;
      const index = Number(target.closest<HTMLElement>('li[data-index]')?.dataset['index']);
      const todo = this.library.todos[index];
      const button = target.closest('button');
      if (!todo || !button) return;
      if (button.classList.contains('check')) {
        this.run('todo.toggle', { todo: todo.id }, { alone: true }, () => {
          this.todoBox.querySelector<HTMLElement>(`li[data-index="${index}"] .check`)?.focus();
        });
        return;
      }
      this.run('todo.remove', { todo: todo.id }, { alone: true }, () => {
        this.toast.show(`deleted: ${todo.text}`, this.undoAction());
      });
    });
    this.on(this.todoForm, 'submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this.run('todo.add', { text }, { alone: true }, () => {
        const list = this.todoBox.querySelector('ul') as HTMLElement;
        list.scrollTop = list.scrollHeight;
      });
    });
    this.on(input, 'keydown', (event) => {
      if (event.key === 'Escape') input.blur();
    });
  }

  /** Rename or delete, for the group in view. */
  private onGroupAct(event: MouseEvent): void {
    const act = (event.target as Element).closest<HTMLElement>('[data-group-act]')?.dataset['groupAct'];
    const group = this.library.groups[this.active];
    if (!act || !group) return;
    if (act === 'rename') {
      this.groupDialog.show(group);
      return;
    }
    this.run('group.remove', { group: group.id }, { alone: true }, () => {
      this.toast.show(`deleted group: ${group.name} · ${sitesLabel(group.sites.length)}`, this.undoAction());
    });
  }

  /** Adds a group by the name the dialog gives and shows it, or renames `group`. */
  private saveGroup(name: string, group: Group | null): void {
    if (group) {
      this.run('group.rename', { group: group.id, name }, { alone: true }, () => {
        this.toast.show(`renamed: ${group.name} to ${name}`, this.undoAction());
      });
      return;
    }
    this.run('group.add', { name }, { alone: true }, (id) => {
      this.activeId = id as string;
      this.draw();
      this.toast.show(`added group: ${name}`);
    });
  }

  /**
   * Sets the icon mode of the group in view. Favicons need the browser's permission, asked in this click where the
   * host has a favicon source; a refusal leaves the mode as it was.
   */
  private setIconMode(iconMode: IconMode): void {
    const group = this.library.groups[this.active];
    if (!group) return;
    const set = (): void => this.run('group.setIconMode', { group: group.id, iconMode }, { alone: true });
    const source = this.options.favicons;
    if (iconMode !== 'favicon' || !source) return set();
    this.allowFavicons(source).then(
      (allowed) => {
        if (allowed) set();
        else this.toast.show(`favicons not shown: the browser did not allow it, ${group.name} stays on ${group.iconMode}`);
      },
      (error: unknown) => this.toast.show(`favicons not shown: ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  /** Asks for the favicon permission; once it is given, the sites without a favicon are looked up again. */
  private async allowFavicons(source: FaviconSource): Promise<boolean> {
    const allowed = await source.allow();
    if (allowed) this.favicons.retry();
    return allowed;
  }

  /** Draws the favicons that have arrived into the tiles, the settings' count and the site dialog's preview. */
  private drawFavicons(): void {
    const group = this.library.groups[this.active];
    if (!group) return;
    for (const node of this.grid.querySelectorAll<HTMLElement>('.card[data-index]')) {
      const site = group.sites[Number(node.dataset['index'])];
      const old = node.querySelector('.tile');
      if (site && old) old.replaceWith(tile(this.doc, site, group.iconMode, this.faviconOf(site, group.iconMode)));
    }
    if (!this.panel.hidden) this.drawPanel();
    if (this.dialog.open) this.dialog.redraw();
  }

  /** The stored favicon of a site drawn in the favicon mode; `undefined` for the other modes, and while unknown. */
  private faviconOf(site: Site, mode: IconMode): Favicon | undefined {
    return modeOf(site, mode) === 'favicon' ? this.favicons.get(site.url) : undefined;
  }

  /** Opens the site dialog on the group in view: for a new site, or for `site`. */
  private openDialog(site: Site | null = null): void {
    if (this.library.groups.length > 0) this.dialog.show(this.library.groups, this.active, site);
  }

  /** Adds the site the dialog gives, or changes `site` and moves it when its group changed. */
  private saveSite(form: SiteForm, site: Site | null): void {
    const target = this.library.groups[form.group] as Library['groups'][number];
    const away = form.group !== this.active ? ` → ${target.name}` : '';
    if (!site) {
      this.run('site.add', { group: target.id, ...form.fields }, { alone: true }, () => {
        this.toast.show(`added: ${form.fields.name}${away}`);
      });
      return;
    }
    const said = (): void => this.toast.show(`saved: ${form.fields.name}${away}`, this.undoAction());
    this.run('site.update', { site: site.id, ...form.fields }, { alone: true }, () => {
      // the move joins the change's snapshot, so one undo takes both back
      if (away) this.run('site.move', { site: site.id, group: target.id, to: target.sites.length }, {}, said);
      else said();
    });
  }

  /** The site of the card `node` is in, in the group in view. */
  private siteAt(node: Element): Site | undefined {
    const index = node.closest<HTMLElement>('.card[data-index]')?.dataset['index'];
    return index === undefined ? undefined : this.library.groups[this.active]?.sites[Number(index)];
  }

  /**
   * Runs a command through the store; the store's answer redraws the page. `done` follows when it worked; when it
   * did not, the toast says why.
   */
  private run(id: string, params: unknown, options: ApplyOptions = {}, done?: (value: unknown) => void): void {
    this.store.apply(id, params, options).then(
      (outcome) => done?.(outcome.value),
      (error: unknown) => {
        this.toast.show(`not saved: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  }

  private undoAction(): ToastAction {
    return { label: `undo · ${keysOf('undo')}`, run: () => this.undo() };
  }

  /** Takes the last change back and says what that brought back. */
  private undo(): void {
    const before = this.library;
    void this.store.undo().then((state) => {
      if (!state) {
        this.toast.show('nothing to undo');
        return;
      }
      const what = summarise(diffLibraries(before, state.library));
      this.toast.show(what ? `undone: ${what}` : 'undone');
      this.moves.cardsIn(this.grid, this.motion());
    });
  }

  private setEditing(on: boolean): void {
    this.editing = on;
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    this.lastInput = this.frames.now();
    if (this.standby.on) {
      // any key brings the start page back, and does nothing else
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key) || event.repeat) return;
      event.preventDefault();
      this.wake();
      return;
    }
    // a key during a movement acts at once: the movement jumps to its end
    this.standby.finish();
    this.moves.finish();
    if (this.dialog.open || this.groupDialog.open || this.server?.dialogOpen) return;
    const target = event.target as Element | null;
    const press: KeyPress = {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      typing: Boolean(target?.closest?.('input, textarea, select, [contenteditable]')),
      repeat: event.repeat,
    };
    if (this.codes !== null && this.onCodeKey(event, press, this.codes)) return;
    if (event.key === 'Escape' && this.restorePanel.open) {
      this.showRestore(false);
      return;
    }
    if (event.key === 'Escape' && !this.panel.hidden) {
      this.showPanel(false);
      return;
    }
    if (event.key === 'Escape' && this.editing) {
      this.setEditing(false);
      return;
    }
    const action = keyAction(press, this.library.groups.length);
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'search') this.search.focus();
    else if (action.kind === 'jump') this.jump(action.index);
    else if (action.kind === 'step') this.step(action.by);
    else if (action.kind === 'edit') this.setEditing(!this.editing);
    else if (action.kind === 'standby') this.enterStandby();
    else if (action.kind === 'codes') this.showCodes();
    else if (action.kind === 'undo') this.undo();
    else if (action.kind === 'restore') this.showRestore(!this.restorePanel.open);
    else this.stepDensity(action.by);
  }

  /**
   * A key while the jump codes show: a letter opens or narrows, a group key goes through with the codes kept.
   * Returns whether the key was used up. Nothing animates here: it runs many times a day.
   */
  private onCodeKey(event: KeyboardEvent, press: KeyPress, typed: string): boolean {
    const sites = (this.library.groups[this.active] as Group).sites;
    const step = codeStep(typed, press, sites.length);
    if (step.kind === 'pass') {
      this.setCodes(step.keep ? '' : null);
      return false;
    }
    event.preventDefault();
    if (step.kind === 'narrow') this.setCodes(step.typed);
    else if (step.kind !== 'hold') this.setCodes(null);
    if (step.kind !== 'open') return true;
    const site = sites[step.index] as Site;
    // a card that is no link opens nothing
    if (!isWebAddress(site.url)) return true;
    const card = this.grid.querySelector(`.card[data-index="${step.index}"]`) as HTMLElement;
    card.scrollIntoView({ block: 'nearest' });
    // the card answers, as it would to a press
    card.classList.add('fired');
    this.win.setTimeout(() => card.classList.remove('fired'), 240);
    (step.background ? (this.options.openBehind ?? this.open) : this.open)(site.url);
    return true;
  }

  /** `f`: the codes show on the cards of the group in view; not in edit mode, and not in an empty group. */
  private showCodes(): void {
    if (!this.editing && this.library.groups[this.active]?.sites.length) this.setCodes('');
  }

  private setCodes(typed: string | null): void {
    this.codes = typed;
    this.drawCodes();
  }

  /** The wheel turns the drum anywhere outside the card grid and the settings: one notch, one group. */
  private onWheel(event: WheelEvent): void {
    this.lastInput = this.frames.now();
    if (this.standby.on) {
      event.preventDefault();
      this.wake();
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('.hb-grid, .hb-panel, .hb-restore, .hb-sugg') || event.ctrlKey) return;
    const dy = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!dy) return;
    event.preventDefault();
    const now = Date.now();
    if (now - this.wheelAt > 300) this.wheelSum = 0;
    this.wheelAt = now;
    if (event.deltaMode === 1 || Math.abs(dy) >= WHEEL_STEP / 2) {
      // a mouse wheel's notch
      this.wheelSum = 0;
      this.step(dy > 0 ? 1 : -1);
      return;
    }
    // a touchpad's stream of small steps adds up
    this.wheelSum += dy;
    if (Math.abs(this.wheelSum) >= WHEEL_STEP) {
      this.step(this.wheelSum > 0 ? 1 : -1);
      this.wheelSum = 0;
    }
  }

  private jump(index: number): void {
    const group = this.library.groups[index];
    if (!group) return;
    // as in the mock, another group ends edit mode
    if (index !== this.active) this.editing = false;
    // the codes stay for the next group, with nothing typed
    if (this.codes !== null) this.codes = '';
    const count = this.library.groups.length;
    // the shorter way round the drum
    let by = index - this.active;
    if (Math.abs(by) > count / 2) by -= Math.sign(by) * count;
    this.active = index;
    this.activeId = group.id;
    this.draw();
    if (!by) return;
    const level = this.motion();
    this.moves.spring(this.rail, by, level);
    this.moves.cardsIn(this.grid, level);
  }

  private step(by: 1 | -1): void {
    const count = this.library.groups.length;
    if (count) this.jump(mod(this.active + by, count));
  }

  private stepDensity(by: 1 | -1): void {
    const i = DENSITIES.indexOf(this.library.settings.density);
    this.relayout({ density: DENSITIES[mod(i + by, DENSITIES.length)] as Density });
  }

  /** M5: a change of density or columns, which the next drawing plays from where the cards are now. */
  private relayout(change: Partial<Library['settings']>): void {
    this.moves.finish();
    if (!this.grid.hidden) this.flipFrom = this.moves.rects(this.grid);
    this.set(change);
  }

  /** Changes settings through the settings command; the store's answer redraws the page. */
  private set(change: Partial<Library['settings']>): void {
    this.store.apply('settings.set', change).catch((error: unknown) => {
      console.error('H-Board: the settings did not change', error);
    });
  }

  /** Home · standby: everything that floats over the page closes first. */
  private enterStandby(): void {
    if (this.standby.on || this.dialog.open || this.groupDialog.open) return;
    this.showPanel(false);
    this.showRestore(false);
    this.toast.hide();
    this.setCodes(null);
    if (this.editing) this.setEditing(false);
    const focused = this.doc.activeElement;
    if (focused instanceof HTMLElement && focused !== this.doc.body) focused.blur();
    this.standby.enter(this.motion());
  }

  /** Back to the start page; x, y is where the wake came from, the middle of the page for a key. */
  private wake(x?: number, y?: number): void {
    this.standby.exit(this.standby.moving ? 'none' : this.motion(), x, y);
  }

  /** Lays the field out for the start page or for standby, with the blocks that quiet it. */
  private layoutField(standby: boolean): void {
    const { w, h } = this.viewport();
    if (standby) this.view.layout(standbyGrid(w, h), this.standby.quietRects(), w, h);
    else this.view.layout(startGrid(w, h), this.quietRects(), w, h);
    this.syncField();
  }

  /** M1 and M2: the trail runs on the start page under full motion, and on standby unless there is no motion. */
  private syncField(): void {
    const level = this.motion();
    if (this.standby.moving) this.view.setLive(false, false);
    else if (this.standby.on) this.view.setLive(level !== 'none', level !== 'none');
    else this.view.setLive(level === 'full', false);
  }

  /** The start page's text and cards, which quiet the field round them; not the header and the status bar. */
  private quietRects(): Rect[] {
    const box = this.page.getBoundingClientRect();
    const grid = this.grid.getBoundingClientRect();
    const rects: Rect[] = [];
    const add = (r: Rect): void => {
      if (r.right > r.left && r.bottom > r.top) {
        rects.push({ left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top });
      }
    };
    const nodes = [
      this.heroLabel,
      this.clock,
      this.seconds,
      this.search.box,
      this.todo,
      this.section,
      this.switcher,
      this.more,
      ...this.rail.querySelectorAll<HTMLElement>('.drum-row, .lens-name, .lens-tag, .lens-count, .add'),
      ...this.empty.children,
    ];
    for (const node of nodes) if (!(node as HTMLElement).hidden) add(node.getBoundingClientRect());
    if (!this.grid.hidden) {
      // a card scrolled out of its box quiets nothing
      for (const card of this.grid.children) {
        const r = card.getBoundingClientRect();
        add({
          left: Math.max(r.left, grid.left),
          right: Math.min(r.right, grid.right),
          top: Math.max(r.top, grid.top),
          bottom: Math.min(r.bottom, grid.bottom),
        });
      }
    }
    return rects;
  }

  /** The blocks of the start page that dissolve into the field on the way into standby. */
  private dissolving(): HTMLElement[] {
    const nodes = [
      this.start.querySelector<HTMLElement>('.hb-header'),
      this.start.querySelector<HTMLElement>('.hb-status'),
      this.rail,
      this.heroLabel,
      this.seconds,
      this.search.box,
      this.todo,
      this.sectionRow,
      this.more,
      this.empty,
      ...this.grid.querySelectorAll<HTMLElement>(':scope > .card'),
    ];
    return nodes.filter((node): node is HTMLElement => node !== null && !node.hidden);
  }

  /** The user's own motion level: from now on it counts even when the system asks for less motion. */
  private pickMotion(motion: Motion): void {
    this.motionPicked = true;
    if (motion === this.library.settings.motion) this.draw();
    else this.set({ motion });
  }

  private showPanel(open: boolean): void {
    if (!open) this.importError = '';
    this.panel.hidden = !open;
    this.settingsButton.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // the users and keys may have changed elsewhere since the panel was open
    this.server?.reload();
    this.drawPanel();
  }

  /** Saves the library as a JSON file, through the export command. */
  private exportLibrary(): void {
    const name = exportName(this.now());
    this.run('library.export', undefined, {}, (text) => {
      (this.options.save ?? ((file, content) => downloadFile(this.doc, file, content)))(name, text as string);
      this.toast.show(`exported: ${name}`);
    });
  }

  /** Replaces the library with an exported file; a wrong file is named in the settings, problem by problem. */
  private async importLibrary(file: File): Promise<void> {
    const text = await file.text();
    try {
      const outcome = await this.store.apply('library.import', { text }, { alone: true });
      const { groups, sites } = outcome.value as { groups: number; sites: number };
      this.showPanel(false);
      this.toast.show(
        `imported: ${file.name} · ${groups} ${groups === 1 ? 'group' : 'groups'} · ${sitesLabel(sites)}`,
        this.undoAction(),
      );
    } catch (error) {
      this.importError = `${file.name} cannot be imported:\n${error instanceof Error ? error.message : String(error)}`;
      if (!this.panel.hidden) this.drawPanel();
    }
  }

  /** Adds a group for every bookmark folder the host reads, in one change that undo takes back, and shows the first. */
  private importBookmarks(): void {
    const read = this.options.bookmarks;
    if (!read) return;
    const failed = (why: string): void => this.toast.show(`bookmarks not imported: ${why}`);
    // the host asks for the permission in this click, so nothing may wait before it
    read().then(
      (groups) => {
        if (!groups) return failed('the browser did not allow it');
        if (groups.length === 0) return this.toast.show('no bookmarks to import: no folder holds a web address');
        this.showPanel(false);
        this.run('group.import', { groups }, { alone: true }, (value) => {
          const { groups: count, sites } = value as { groups: number; sites: number };
          this.activeId = this.library.groups.at(-count)?.id ?? this.activeId;
          this.draw();
          this.toast.show(
            `imported from bookmarks · ${count} ${count === 1 ? 'group' : 'groups'} · ${sitesLabel(sites)}`,
            this.undoAction(),
          );
        });
      },
      (error: unknown) => failed(error instanceof Error ? error.message : String(error)),
    );
  }

  /** The restore panel; the settings close when it opens. */
  private showRestore(open: boolean): void {
    if (open) {
      this.showPanel(false);
      this.setCodes(null);
      this.restorePanel.show(this.history, this.now());
    } else {
      this.restorePanel.hide();
    }
    this.saved.setAttribute('aria-expanded', String(open));
  }

  /** Goes back to snapshot `id` and says what that changed; undo takes it back. */
  private restoreTo(id: number): void {
    const before = this.library;
    this.showRestore(false);
    this.store.restore(id).then(
      (state) => {
        if (!state) return;
        this.toast.show(`restored: ${summarise(diffLibraries(before, state.library))}`, this.undoAction());
        this.moves.cardsIn(this.grid, this.motion());
      },
      (error: unknown) => {
        this.toast.show(`not restored: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  }

  // ---------------------------------------------------------------- drawing

  private viewport(): { w: number; h: number } {
    if (this.options.viewport) return this.options.viewport();
    return { w: Math.max(this.win.innerWidth, 960), h: Math.max(this.win.innerHeight, 640) };
  }

  private theme(): Exclude<Theme, 'system'> {
    const { theme } = this.library.settings;
    if (theme !== 'system') return theme;
    const dark = this.options.systemDark
      ? this.options.systemDark()
      : typeof this.win.matchMedia !== 'function' || this.win.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? 'dark' : 'light';
  }

  /** The one motion flag: what every movement of the page reads. */
  private motion(): Motion {
    const reduced = this.options.systemReducedMotion
      ? this.options.systemReducedMotion()
      : typeof this.win.matchMedia === 'function' && this.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // a level other than the default was picked by someone; a picked default only this page knows of
    const { motion } = this.library.settings;
    return motionLevel(motion, reduced, this.motionPicked || motion !== DEFAULT_SETTINGS.motion);
  }

  private draw(): void {
    const { groups, settings } = this.library;
    const byId = groups.findIndex((group) => group.id === this.activeId);
    this.active = byId >= 0 ? byId : Math.min(this.active, Math.max(0, groups.length - 1));
    this.activeId = groups[this.active]?.id ?? null;
    if (this.activeId !== null && this.activeId !== this.toldGroup) {
      this.toldGroup = this.activeId;
      this.options.onGroup?.(this.activeId);
    }
    const group = groups[this.active];
    const count = group?.sites.length ?? 0;
    if (this.editing || count === 0) this.codes = null;
    const { w, h } = this.viewport();
    let L = layout(w, h, settings.density, settings.columns, count + 1);
    if (count === 0) {
      // reserve rows for the empty group's block, so the info strip lands under it
      L = layout(w, h, settings.density, settings.columns, Math.ceil((EMPTY_H + L.gap) / L.pitch) * L.columns);
    }
    this.L = L;

    place(this.page, 0, 0, w, h);
    if (this.editing) this.page.dataset['editing'] = '';
    else delete this.page.dataset['editing'];
    const theme = this.theme();
    this.page.dataset['theme'] = theme;
    this.page.dataset['motion'] = this.motion();
    this.logo.src = theme === 'dark' ? logoDark : logoLight;
    this.logo.dataset['theme'] = theme;
    this.themeButton.replaceChildren(
      make(this.doc, 'span', '', '◐  '),
      make(this.doc, 'span', '', theme === 'dark' ? 'Light' : 'Dark'),
    );
    this.themeButton.setAttribute('aria-label', `Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`);

    place(this.lines, L.rail, 0);

    this.drawRail(L, h);
    this.drawHero(L);
    const [sx, sy, sw, sh] = L.search;
    this.search.place(sx, sy, sw, sh, w, h);
    this.search.update();
    this.drawSection(L);
    if (!this.panel.hidden) this.drawPanel();

    const sites = groups.reduce((sum, g) => sum + g.sites.length, 0);
    this.saved.textContent = savedLine(this.history);
    this.restorePanel.update(this.history, this.now());
    this.statusLeft.textContent = `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · ${sitesLabel(sites)}`;
    this.drawCodes();

    this.standby.place(w, h);
    this.standby.update(this.now(), this.library);
    // a movement between the two pages lays the field out itself
    if (!this.standby.moving) this.layoutField(this.standby.on);
  }

  private drawRail(L: PageLayout, h: number): void {
    const railH = h - 105;
    place(this.rail, 0, 65, L.rail, railH);
    place(this.railRule, L.rail, 65, 1, railH);
    const focused = this.doc.activeElement;
    const refocus =
      focused instanceof HTMLElement && this.rail.contains(focused)
        ? `.${focused.className.split(' ')[0] ?? ''}[data-index="${focused.dataset['index'] ?? ''}"]`
        : null;
    this.rail.replaceChildren(...wheel(this.doc, this.library.groups, this.active, L.rail, railH));
    if (refocus) this.rail.querySelector<HTMLElement>(refocus)?.focus();
  }

  private drawHero(L: PageLayout): void {
    const cs = L.clock;
    const f = cs / 88;
    place(this.heroLabel, L.x0, L.top);
    place(this.clock, L.x0 - Math.round(4 * f), L.clockY);
    this.clock.style.fontSize = `${cs}px`;
    this.clock.style.letterSpacing = `${-2 * f}px`;
    const ss = Math.round(cs / 4);
    place(this.seconds, L.x0 + Math.round(3 * cs), Math.round(L.clockY + 1.03 * (cs - ss)));
    this.seconds.style.fontSize = `${ss}px`;

    const [tx, ty, tw] = L.todo;
    place(this.todo, tx, ty, tw);
    this.todoBox.replaceChildren(...todoList(this.doc, this.library));
    const list = this.todo.querySelector('ul');
    if (list) {
      list.style.marginTop = '16px';
      list.style.maxHeight = `${L.todoH}px`;
      list.style.overflowY = 'auto';
    }
  }

  private drawSection(L: PageLayout): void {
    const doc = this.doc;
    const { groups, settings } = this.library;
    const group = groups[this.active];
    const none = !group || group.sites.length === 0;
    const index = pad2(this.active + 1);
    this.sectionRow.hidden = none;
    this.grid.hidden = none;
    this.empty.hidden = !none;
    for (const node of [this.fade, this.track, this.thumb, this.more]) node.hidden = true;

    if (none) {
      place(this.empty, L.x0, L.secY + 40, 460, 260);
      const heading = make(doc, 'h2', '', group ? 'This group is still empty.' : 'No groups yet.');
      const text = make(
        doc,
        'p',
        '',
        group
          ? "Add sites here one by one, or bring them over from the browser's bookmarks: a bookmark folder becomes a group."
          : 'Groups hold your sites. Adding groups and sites comes with editing.',
      );
      const add = make(doc, 'button', 'btn primary', '+ new site');
      add.type = 'button';
      add.disabled = !group;
      const importButton = make(doc, 'button', 'btn import');
      importButton.type = 'button';
      importButton.disabled = !this.options.bookmarks;
      importButton.append(icon(doc, 'bookmarks-simple'), doc.createTextNode('Import from bookmarks'));
      const tip = make(doc, 'div', 'tip', 'or drag a link here from the address bar');
      const head = label(doc, group ? index : '00', group ? `${group.name} · ${sitesLabel(0)}` : 'Groups · 0');
      head.classList.add('abs');
      this.empty.replaceChildren(head, heading, text, add, importButton, tip);
      if (group && this.editing) this.empty.append(groupActions(doc));
      return;
    }

    place(this.sectionRow, 0, 0);
    place(this.section, L.x0, L.secY);
    this.section.replaceChildren(
      make(doc, 'span', 'idx', `[ ${index} ]`),
      make(doc, 'span', 'txt', `${group.name} · ${sitesLabel(group.sites.length)}`),
    );
    this.editNote.hidden = !this.editing;
    if (this.editing) place(this.editNote, L.x0 + this.section.getBoundingClientRect().width + 18, L.secY);
    place(this.switcher, L.x0, L.secY, L.mainW);
    const switches: HTMLElement[] = [];
    if (L.mainW >= 900) {
      const density = make(doc, 'button', 'density', `density: ${settings.density}`);
      density.type = 'button';
      density.dataset['part'] = 'density';
      density.title = `Next density (${keysOf('density')})`;
      switches.push(density);
    }
    for (const name of LAYOUTS) {
      const button = make(doc, 'button', '', name);
      button.type = 'button';
      button.dataset['layout'] = name;
      button.setAttribute('aria-pressed', String(name === settings.layout));
      switches.push(button);
    }
    this.switcher.replaceChildren(...switches);

    const boxH = settings.layout === 'classic' || L.place === 'strip' ? L.viewH : L.bottom - 12 - L.gridY;
    sizeGrid(this.grid, L, settings.layout, boxH);
    const mode = group.iconMode;
    const n = group.sites.length;
    this.grid.replaceChildren(
      ...group.sites.map((site, i) => card(doc, site, i, mode, this.editing, jumpCode(i, n), this.faviconOf(site, mode))),
      addTile(doc),
    );
    this.grid.scrollTop = 0;
    this.drawScroll();
    if (this.flipFrom) {
      this.moves.flip(this.grid, this.flipFrom, this.motion());
      this.flipFrom = null;
    }
  }

  /** The codes on the cards, the cards the typed letters leave out, and the keys in the status bar. */
  private drawCodes(): void {
    const typed = this.codes;
    if (typed === null) delete this.page.dataset['codes'];
    else this.page.dataset['codes'] = '';
    for (const node of this.grid.querySelectorAll<HTMLElement>('.card[data-code]')) {
      node.classList.toggle('off', typed !== null && !(node.dataset['code'] as string).startsWith(typed));
    }
    const groups = this.library.groups.length;
    this.keys.textContent = (typed === null ? keyHints(groups) : codeHints(groups, typed)).join('   ');
  }

  /** The fade, the track and its thumb, and how many tiles are still below, for a grid that scrolls. */
  private drawScroll(): void {
    const L = this.L;
    if (!L || this.grid.hidden) return;
    const classic = this.library.settings.layout === 'classic';
    const scroll = classic && L.scroll;
    for (const node of [this.fade, this.track, this.thumb, this.more]) node.hidden = !scroll;
    if (!scroll) return;
    const vh = L.viewH;
    const total = L.rowsTotal * L.pitch;
    const top = this.grid.scrollTop;
    const fh = Math.min(56, Math.floor(L.pitch / 2));
    place(this.fade, L.x0, L.gridY + vh - fh, L.mainW, fh);
    place(this.track, L.right + 8, L.gridY, 2, vh);
    const thumbH = Math.round(vh * Math.min(1, vh / total));
    place(this.thumb, L.right + 8, L.gridY + Math.round((top / total) * vh), 2, thumbH);
    // the rows clear of the fade count as shown; at the end of the list every row is
    const end = top >= total - L.gap - vh - 1;
    const shown = Math.floor((top + vh - fh + L.gap) / L.pitch);
    const more = end ? 0 : Math.max(0, L.tiles - shown * L.columns);
    this.more.textContent = more ? `↓ ${more} more` : '';
    this.fade.hidden = more === 0;
    place(this.more, L.right - 90, L.gridY + vh - 4, 90);
  }

  private drawPanel(): void {
    const doc = this.doc;
    const { density, columns, theme } = this.library.settings;
    const head = (text: string): HTMLElement => make(doc, 'div', 'head', text);
    const densityRow = make(doc, 'div', 'row');
    const seg = make(doc, 'div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Density');
    for (const name of DENSITIES) {
      const button = make(doc, 'button', '', name);
      button.type = 'button';
      button.dataset['density'] = name;
      button.setAttribute('aria-pressed', String(name === density));
      seg.append(button);
    }
    densityRow.append(make(doc, 'span', '', 'density'), seg);
    const columnsRow = make(doc, 'div', 'row');
    const stepper = make(doc, 'div', 'stepper');
    const down = make(doc, 'button', '', '−');
    down.type = 'button';
    down.dataset['part'] = 'columns-down';
    down.setAttribute('aria-label', 'Fewer columns');
    down.disabled = columns === 0;
    const value = make(doc, 'output', '', columns ? String(columns) : `auto · ${this.L?.columns ?? ''}`);
    value.dataset['part'] = 'columns';
    const up = make(doc, 'button', '', '+');
    up.type = 'button';
    up.dataset['part'] = 'columns-up';
    up.setAttribute('aria-label', 'More columns');
    up.disabled = columns >= 12;
    stepper.append(down, value, up);
    columnsRow.append(make(doc, 'span', '', 'columns'), stepper);
    const system = make(doc, 'button', 'wide', 'Theme: follow the system');
    system.type = 'button';
    system.dataset['part'] = 'theme-system';
    system.disabled = theme === 'system';
    // the keys drawn as keys, as the mock's kbd: a bare `[ ]` reads like a checkbox
    const hint = make(doc, 'div', 'hint');
    hint.dataset['part'] = 'density-keys';
    keysOf('density')
      .split(' ')
      .forEach((key, i) => hint.append(...(i ? [' and '] : []), make(doc, 'kbd', '', key)));
    hint.append(' also change the density.');
    this.panel.replaceChildren(
      head('Cards'),
      densityRow,
      columnsRow,
      hint,
      ...this.iconRows(),
      head('Theme'),
      system,
      head('Motion'),
      this.motionRow(),
      ...this.libraryRows(),
      ...this.serverRows(),
    );
  }

  /** The Server section: the same node every time, so that what is typed in it stays. */
  private serverRows(): HTMLElement[] {
    if (!this.server) return [];
    this.server.refresh();
    return [this.server.node];
  }

  /** The snapshots, and the library as a file: restore, export and import, and why the last import failed. */
  private libraryRows(): HTMLElement[] {
    const doc = this.doc;
    const row = make(doc, 'div', 'acts');
    for (const [part, text] of [
      ['restore-open', `Restore… (${keysOf('restore')})`],
      ['export', 'Export'],
      ['import', 'Import'],
      ...(this.options.bookmarks ? ([['bookmarks', 'Import bookmarks']] as const) : []),
    ] as const) {
      const button = make(doc, 'button', '', text);
      button.type = 'button';
      button.dataset['part'] = part;
      row.append(button);
    }
    const error = make(doc, 'div', 'error', this.importError);
    error.dataset['part'] = 'import-error';
    error.setAttribute('role', 'alert');
    error.hidden = !this.importError;
    const hint = make(
      doc,
      'div',
      'hint',
      'Export saves the library as a JSON file; Import replaces it with one.' +
        (this.options.bookmarks ? ' Import bookmarks adds a group for every bookmark folder.' : '') +
        ' Undo takes an import back.',
    );
    return [make(doc, 'div', 'head', 'Library'), row, error, hint];
  }

  /** Full, reduced or none: the level in force is the pressed one. */
  private motionRow(): HTMLElement {
    const doc = this.doc;
    const level = this.motion();
    const seg = make(doc, 'div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Motion');
    for (const name of MOTIONS) {
      const button = make(doc, 'button', '', name);
      button.type = 'button';
      button.dataset['motion'] = name;
      button.setAttribute('aria-pressed', String(name === level));
      seg.append(button);
    }
    const row = make(doc, 'div', 'row');
    row.append(make(doc, 'span', '', 'motion'), seg);
    return row;
  }

  /** The icon mode of the group in view, and what it shows. */
  private iconRows(): HTMLElement[] {
    const doc = this.doc;
    const group = this.library.groups[this.active];
    if (!group) return [];
    const caption = make(doc, 'span', '', `icons · ${group.name}`);
    caption.dataset['part'] = 'icons-label';
    const seg = make(doc, 'div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', `Icons of ${group.name}`);
    for (const mode of ICON_MODES) {
      const button = make(doc, 'button', '', mode);
      button.type = 'button';
      button.dataset['iconMode'] = mode;
      button.setAttribute('aria-pressed', String(mode === group.iconMode));
      seg.append(button);
    }
    const row = make(doc, 'div', 'row col');
    row.append(caption, seg);
    const marks = group.sites.filter((site) => hasBrand(site.brand)).length;
    const favicons = group.iconMode === 'favicon' ? group.sites.filter((site) => this.favicons.get(site.url) !== undefined).length : 0;
    const hint = make(
      doc,
      'div',
      'hint',
      {
        brand: `Per group. Brand marks: ${marks} / ${group.sites.length}, the rest show their Phosphor icon.`,
        favicon: `Per group. Favicons: ${favicons} / ${group.sites.length}, the rest show their Phosphor icon.`,
        phosphor: 'Per group. Every site shows its Phosphor icon.',
        initial: 'Per group. Every site shows its initial.',
      }[group.iconMode],
    );
    hint.dataset['part'] = 'icons-hint';
    return [make(doc, 'div', 'head', 'Icons'), row, hint];
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private tick(): void {
    const idle = this.frames.now() - this.lastInput >= (this.options.idleMs ?? IDLE_MS);
    if (idle && !this.standby.on) this.enterStandby();
    this.standby.update(this.now(), this.library);
    const parts = clockParts(this.now());
    const date = this.heroLabel.querySelector('.txt');
    if (date && date.textContent !== parts.date) date.textContent = parts.date;
    if (this.clock.textContent !== parts.time) this.clock.textContent = parts.time;
    if (this.seconds.textContent !== parts.seconds) this.seconds.textContent = parts.seconds;
  }
}
