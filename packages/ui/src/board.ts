/// <reference types="vite/client" />
import { DENSITIES, LAYOUTS, diffLibraries, layout, summarise } from '@h-board/core';
import type { Density, Layout as CardLayout, Library, PageLayout, Site, Theme } from '@h-board/core';
import type { ApplyOptions, State, Store } from '@h-board/store';
import logoDark from '../assets/img/lockup-horizontal-dark.svg';
import logoLight from '../assets/img/lockup-horizontal-light.svg';
import './board.css';
import { clockParts } from './clock';
import { make, pad2, place } from './dom';
import { SiteDialog } from './dialog';
import type { SiteForm } from './dialog';
import { fieldOf } from './field';
import { keyAction, keyHints } from './keys';
import { addTile, card, icon, label, sitesLabel, sizeGrid, todoList, wheel } from './parts';
import { SearchLine, memoryHistory } from './search';
import type { SearchHistory } from './search';
import { Toast } from './toast';
import type { ToastAction } from './toast';

export interface BoardOptions {
  /** The clock. `new Date()` when left out. */
  readonly now?: () => Date;
  /** The page's size in CSS px. The window's, but at least 960 x 640, when left out. */
  readonly viewport?: () => { w: number; h: number };
  /** Whether the system asks for a dark page. `prefers-color-scheme` when left out. */
  readonly systemDark?: () => boolean;
  /** Opens an address the user chose from the search line. A new tab without access to this page when left out. */
  readonly open?: (url: string) => void;
  /** Where the search line keeps its last searches. The page's memory when left out. */
  readonly searchHistory?: SearchHistory;
}

/** The empty group's block (label, heading, text, buttons, tip) takes this much room above the info strip. */
const EMPTY_H = 300;
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
  private active = 0;
  private activeId: string | null;
  private L: PageLayout | undefined;
  private wheelSum = 0;
  private wheelAt = 0;
  private editing = false;
  private readonly listeners: (() => void)[] = [];

  private readonly page: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly field: HTMLElement;
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
  private readonly keys: HTMLElement;
  private readonly toast: Toast;
  private readonly dialog: SiteDialog;

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
    this.activeId = state.library.settings.activeGroup;
    const doc = this.doc;

    this.page = make(doc, 'div', 'hb');
    this.page.dataset['part'] = 'page';
    this.lines = make(doc, 'div', 'hb-lines');
    this.field = make(doc, 'pre', 'hb-field');
    this.field.setAttribute('aria-hidden', 'true');

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
      open: options.open ?? ((url) => this.win.open(url, '_blank', 'noopener')),
      history: options.searchHistory ?? memoryHistory(),
      listen: (target, type, handler) => this.on(target, type, handler),
    });
    this.todo = make(doc, 'section', 'abs hb-todo');
    this.todo.setAttribute('aria-label', 'To do');

    this.sectionRow = make(doc, 'div', 'abs');
    this.sectionRow.dataset['part'] = 'section-row';
    this.section = label(doc, '', '', 'section');
    this.section.classList.add('abs');
    this.switcher = make(doc, 'div', 'abs hb-switch');
    this.switcher.setAttribute('role', 'group');
    this.switcher.setAttribute('aria-label', 'Cards');
    this.editNote = make(doc, 'span', 'abs hb-editnote', 'edit mode · drag to move · e: done');
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
    this.statusLeft = make(doc, 'span');
    this.statusLeft.dataset['part'] = 'status-left';
    this.keys = make(doc, 'span');
    this.keys.dataset['part'] = 'keys';
    status.append(this.statusLeft, this.keys);

    this.toast = new Toast(doc, this.win);
    this.dialog = new SiteDialog(doc, (form, site) => this.saveSite(form, site));
    this.page.append(
      this.lines,
      this.field,
      header,
      this.railRule,
      this.rail,
      main,
      status,
      this.panel,
      this.toast.node,
      this.dialog.node,
    );
    root.replaceChildren(this.page);
    this.listen();
    this.draw();
    this.tick();
  }

  /** Takes the store's library: a change made here or in another page. */
  update(state: State): void {
    this.library = state.library;
    this.draw();
  }

  /** Stops listening. The drawing stays as it is. */
  stop(): void {
    for (const off of this.listeners.splice(0)) off();
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
      const target = event.target as Element | null;
      if (!this.panel.hidden && !target?.closest('.hb-panel, .hb-settings')) this.showPanel(false);
    };
    this.doc.addEventListener('pointerdown', onPointer);
    this.listeners.push(() => this.doc.removeEventListener('pointerdown', onPointer));
    const timer = this.win.setInterval(() => this.tick(), 250);
    this.listeners.push(() => this.win.clearInterval(timer));
    if (!this.options.systemDark && typeof this.win.matchMedia === 'function') {
      const query = this.win.matchMedia('(prefers-color-scheme: dark)');
      const onScheme = (): void => this.draw();
      query.addEventListener('change', onScheme);
      this.listeners.push(() => query.removeEventListener('change', onScheme));
    }

    this.on(this.page, 'wheel', (event) => this.onWheel(event), { passive: false });
    this.on(this.rail, 'click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-index]');
      if (target) this.jump(Number(target.dataset['index']));
    });
    this.on(this.themeButton, 'click', () => {
      this.set({ theme: this.theme() === 'dark' ? 'light' : 'dark' });
    });
    this.on(this.settingsButton, 'click', () => this.showPanel(this.panel.hidden === true));
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
      if (density) this.set({ density: density as Density });
      else if (button.dataset['part'] === 'columns-up') this.set({ columns: columns ? Math.min(12, columns + 1) : 4 });
      else if (button.dataset['part'] === 'columns-down') this.set({ columns: columns > 4 ? columns - 1 : 0 });
      else if (button.dataset['part'] === 'theme-system') this.set({ theme: 'system' });
    });
    this.on(this.grid, 'scroll', () => this.drawScroll());
    this.on(this.empty, 'click', (event) => {
      if ((event.target as Element).closest('.btn.primary')) this.openDialog();
    });
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
    this.run('site.move', { site: site.id, to }, {}, () => {
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
    if (!site || !act) return;
    if (act === 'edit') {
      this.openDialog(site);
      return;
    }
    this.run('site.remove', { site: site.id }, { alone: true }, () => {
      this.toast.show(`deleted: ${site.name}`, this.undoAction());
    });
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
    return { label: 'undo · z', run: () => this.undo() };
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
    });
  }

  private setEditing(on: boolean): void {
    this.editing = on;
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    if (this.dialog.open) return;
    if (event.key === 'Escape' && !this.panel.hidden) {
      this.showPanel(false);
      return;
    }
    if (event.key === 'Escape' && this.editing) {
      this.setEditing(false);
      return;
    }
    const target = event.target as Element | null;
    const action = keyAction(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        typing: Boolean(target?.closest?.('input, textarea, select, [contenteditable]')),
      },
      this.library.groups.length,
    );
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'search') this.search.focus();
    else if (action.kind === 'jump') this.jump(action.index);
    else if (action.kind === 'step') this.step(action.by);
    else if (action.kind === 'edit') this.setEditing(!this.editing);
    else if (action.kind === 'undo') this.undo();
    else this.stepDensity(action.by);
  }

  /** The wheel turns the drum anywhere outside the card grid and the settings: one notch, one group. */
  private onWheel(event: WheelEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('.hb-grid, .hb-panel, .hb-sugg') || event.ctrlKey) return;
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
    this.active = index;
    this.activeId = group.id;
    this.draw();
  }

  private step(by: 1 | -1): void {
    const count = this.library.groups.length;
    if (count) this.jump(mod(this.active + by, count));
  }

  private stepDensity(by: 1 | -1): void {
    const i = DENSITIES.indexOf(this.library.settings.density);
    this.set({ density: DENSITIES[mod(i + by, DENSITIES.length)] as Density });
  }

  /** Changes settings through the settings command; the store's answer redraws the page. */
  private set(change: Partial<Library['settings']>): void {
    this.store.apply('settings.set', change).catch((error: unknown) => {
      console.error('H-Board: the settings did not change', error);
    });
  }

  private showPanel(open: boolean): void {
    this.panel.hidden = !open;
    this.settingsButton.setAttribute('aria-expanded', String(open));
    if (open) this.drawPanel();
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

  private draw(): void {
    const { groups, settings } = this.library;
    const byId = groups.findIndex((group) => group.id === this.activeId);
    this.active = byId >= 0 ? byId : Math.min(this.active, Math.max(0, groups.length - 1));
    this.activeId = groups[this.active]?.id ?? null;
    const group = groups[this.active];
    const count = group?.sites.length ?? 0;
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
    this.logo.src = theme === 'dark' ? logoDark : logoLight;
    this.logo.dataset['theme'] = theme;
    this.themeButton.replaceChildren(
      make(this.doc, 'span', '', '◐  '),
      make(this.doc, 'span', '', theme === 'dark' ? 'Light' : 'Dark'),
    );
    this.themeButton.setAttribute('aria-label', `Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`);

    place(this.lines, L.rail, 0);
    const field = fieldOf(w, h);
    this.field.textContent = field.text;
    this.field.style.fontSize = `${field.cw / 0.6}px`;
    this.field.style.lineHeight = `${field.ch}px`;

    this.drawRail(L, h);
    this.drawHero(L);
    const [sx, sy, sw, sh] = L.search;
    this.search.place(sx, sy, sw, sh, w, h);
    this.search.update();
    this.drawSection(L);
    if (!this.panel.hidden) this.drawPanel();

    const sites = groups.reduce((sum, g) => sum + g.sites.length, 0);
    this.statusLeft.textContent = `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · ${sitesLabel(sites)}`;
    this.keys.textContent = keyHints(groups.length).join('   ');
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
    this.todo.replaceChildren(...todoList(this.doc, this.library));
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
      importButton.disabled = true;
      importButton.append(icon(doc, 'bookmarks-simple'), doc.createTextNode('Import from bookmarks'));
      const tip = make(doc, 'div', 'tip', 'or drag a link here from the address bar');
      const head = label(doc, group ? index : '00', group ? `${group.name} · ${sitesLabel(0)}` : 'Groups · 0');
      head.classList.add('abs');
      this.empty.replaceChildren(head, heading, text, add, importButton, tip);
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
      density.title = 'Next density ([ and ])';
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
    this.grid.replaceChildren(...group.sites.map((site, i) => card(doc, site, i, mode, this.editing)), addTile(doc));
    this.grid.scrollTop = 0;
    this.drawScroll();
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
    const hint = make(doc, 'div', 'head', '[ and ] also change the density');
    hint.style.textTransform = 'none';
    hint.style.letterSpacing = '0';
    this.panel.replaceChildren(head('Cards'), densityRow, columnsRow, hint, head('Theme'), system);
  }

  private tick(): void {
    const parts = clockParts(this.options.now ? this.options.now() : new Date());
    const date = this.heroLabel.querySelector('.txt');
    if (date && date.textContent !== parts.date) date.textContent = parts.date;
    if (this.clock.textContent !== parts.time) this.clock.textContent = parts.time;
    if (this.seconds.textContent !== parts.seconds) this.seconds.textContent = parts.seconds;
  }
}
