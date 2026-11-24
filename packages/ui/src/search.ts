import { hostOf, nextEngine, remember, scopeByWord, scopedSuggestions, searchTarget, suggestions } from '@h-board/core';
import type { Engine, Library, Site, Suggestion } from '@h-board/core';
import { make, place } from './dom';
import { keysOf } from './keys';
import { icon } from './parts';

/** Where the line keeps the last searches. The host chooses: the page's memory, or the extension's storage. */
export interface SearchHistory {
  load(): readonly string[];
  save(history: readonly string[]): void;
}

/** A history that lives as long as the page. */
export function memoryHistory(initial: readonly string[] = []): SearchHistory {
  let kept = [...initial];
  return {
    load: () => kept,
    save: (history) => {
      kept = [...history];
    },
  };
}

/** What the line needs from the page around it. */
export interface SearchContext {
  readonly library: () => Library;
  /** The index of the group in view: its sites lead the suggestions. */
  readonly active: () => number;
  /** Keeps the chosen engine in the settings. */
  readonly setEngine: (engine: Engine) => void;
  /** Opens an address the user chose. */
  readonly open: (url: string) => void;
  readonly history: SearchHistory;
  /** Adds an event listener that the page removes when it stops. */
  readonly listen: <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) => void;
}

const PLACEHOLDER = 'search or address';
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * The search line under the clock (`mock/` and `search()` and `suggestions()` of `docs/design/gen/build.py`): the
 * engine chip, the line, and the list of suggestions under it with the scrim behind. A site's alias or name and a
 * space, or Tab on one of the user's sites, turn the line into that site's search for one search.
 */
export class SearchLine {
  readonly box: HTMLElement;
  readonly list: HTMLElement;
  readonly scrim: HTMLElement;
  private readonly doc: Document;
  private readonly engineButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly caret: HTMLElement;
  private items: Suggestion[] = [];
  private selected = -1;
  private isOpen = false;
  private scope: Site | null = null;
  private fontSize = 16;

  constructor(
    doc: Document,
    private readonly context: SearchContext,
  ) {
    this.doc = doc;
    this.scrim = make(doc, 'div', 'hb-scrim');
    this.scrim.dataset['part'] = 'scrim';
    this.box = make(doc, 'div', 'abs hb-search');
    this.box.dataset['part'] = 'search';
    this.box.setAttribute('role', 'search');
    this.engineButton = make(doc, 'button', 'engine');
    this.engineButton.type = 'button';
    this.engineButton.dataset['part'] = 'engine';
    const prompt = make(doc, 'span', 'prompt', '›');
    prompt.setAttribute('aria-hidden', 'true');
    const wrap = make(doc, 'span', 'inwrap');
    this.input = make(doc, 'input');
    this.input.type = 'text';
    this.input.dataset['part'] = 'search-input';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-label', 'Search or address');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-controls', 'hb-sugg');
    this.input.setAttribute('aria-expanded', 'false');
    this.caret = make(doc, 'span', 'caret');
    this.caret.setAttribute('aria-hidden', 'true');
    wrap.append(this.input, this.caret);
    const kbd = make(doc, 'span', 'kbd', keysOf('search'));
    kbd.dataset['part'] = 'search-kbd';
    kbd.setAttribute('aria-hidden', 'true');
    this.box.append(this.engineButton, prompt, wrap, kbd);
    this.list = make(doc, 'div', 'abs hb-sugg');
    this.list.id = 'hb-sugg';
    this.list.dataset['part'] = 'suggestions';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Suggestions');
    this.list.hidden = true;
    this.setScope(null);
    this.listen();
  }

  /** Puts the line at x, y, w x h and the list under it, the scrim over the page between header and status bar. */
  place(x: number, y: number, w: number, h: number, pageW: number, pageH: number): void {
    place(this.box, x, y, w, h);
    this.fontSize = h <= 52 ? 16 : 18;
    this.box.style.setProperty('--e', `${h - 16}px`);
    this.box.style.setProperty('--fs', `${this.fontSize}px`);
    // the drawing's prompt sits 2 px above the middle of a line of the text's height
    this.box.style.setProperty('--pt', `${Math.round((h - this.fontSize * 1.3) / 2 - 2) - 1}px`);
    place(this.list, x, y + h + 6, w);
    place(this.scrim, 0, 65, pageW, pageH - 105);
    this.drawCaret();
  }

  /** Takes a changed library: the engine chip follows the setting. */
  update(): void {
    if (!this.scope) this.engineButton.textContent = this.context.library().settings.engine;
  }

  focus(): void {
    this.input.focus();
  }

  // ---------------------------------------------------------------- input

  private listen(): void {
    const on = this.context.listen;
    on(this.input, 'focus', () => this.openList());
    on(this.input, 'blur', () => {
      // the scope lasts for one search
      if (this.scope) this.setScope(null);
      this.closeList();
    });
    on(this.input, 'input', () => {
      const site = this.scope ? null : scopeByWord(this.context.library(), this.input.value);
      if (site) {
        this.input.value = '';
        this.setScope(site);
      }
      this.openList();
    });
    on(this.input, 'keydown', (event) => this.onKey(event));
    on(this.list, 'mousedown', (event) => {
      event.preventDefault(); // keep the focus in the line
      const row = (event.target as Element).closest<HTMLElement>('.row');
      if (row) this.run(this.items[Number(row.dataset['i'])] as Suggestion);
    });
    on(this.list, 'mousemove', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('.row');
      if (row && Number(row.dataset['i']) !== this.selected) this.select(Number(row.dataset['i']));
    });
    on(this.engineButton, 'click', () => {
      if (this.scope) {
        // a scope lives only while the line has the focus, so the list is open
        this.setScope(null);
        this.openList();
      } else this.turnEngine();
    });
    on(this.box, 'mousedown', (event) => {
      const target = event.target as Element;
      if (target.closest('.engine')) {
        // the focus stays in the line, so the click can lift the scope
        if (this.scope) event.preventDefault();
        return;
      }
      if (target === this.input) return;
      event.preventDefault();
      this.input.focus();
    });
    on(this.scrim, 'mousedown', () => this.input.blur());
  }

  private onKey(event: KeyboardEvent): void {
    const { key } = event;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!this.isOpen) this.openList();
      const n = this.items.length;
      if (n) this.select(mod((this.selected < 0 && key === 'ArrowUp' ? 0 : this.selected) + (key === 'ArrowDown' ? 1 : -1), n));
    } else if (key === 'Enter') {
      event.preventDefault();
      this.run(this.isOpen && this.selected >= 0 ? (this.items[this.selected] as Suggestion) : null);
    } else if (key === 'Escape') {
      event.preventDefault();
      if (this.scope) {
        // first back to the general search, with what was typed
        this.setScope(null);
        this.openList();
      } else if (this.isOpen) this.closeList();
      else this.input.blur();
    } else if (key === 'Backspace' && this.scope && !this.input.value) {
      event.preventDefault();
      this.setScope(null);
      this.openList();
    } else if (key === 'Tab' && !event.shiftKey) {
      // Tab turns the engine, or on one of the user's sites with a search, searches inside it;
      // Shift+Tab still leaves the line
      event.preventDefault();
      const item = this.isOpen && this.selected >= 0 ? this.items[this.selected] : undefined;
      if (item?.scope) {
        this.input.value = '';
        this.setScope(item.scope);
        this.openList();
      } else if (!this.scope) this.turnEngine();
    }
  }

  private turnEngine(): void {
    const engine = nextEngine(this.context.library().settings.engine);
    this.engineButton.textContent = engine;
    this.context.setEngine(engine);
  }

  private run(item: Suggestion | null): void {
    const { library, history, open } = this.context;
    if (item?.url) open(item.url);
    else {
      const text = item ? item.text : this.input.value;
      const target = searchTarget(text, library().settings.engine, this.scope, { address: !item });
      if (!target) return;
      if (target.remember) history.save(remember(history.load(), target.remember));
      open(target.url);
    }
    this.input.value = '';
    if (this.scope) this.setScope(null);
    this.closeList();
  }

  // ---------------------------------------------------------------- drawing

  private setScope(site: Site | null): void {
    this.scope = site;
    this.engineButton.classList.toggle('scoped', site !== null);
    this.engineButton.textContent = site ? site.name : this.context.library().settings.engine;
    this.engineButton.setAttribute(
      'aria-label',
      site ? `Search on ${site.name}. Back to the general search` : 'Next search engine',
    );
    this.input.placeholder = site ? 'search here' : PLACEHOLDER;
    this.drawCaret();
  }

  private openList(): void {
    const raw = this.input.value;
    this.items = this.scope
      ? scopedSuggestions(this.scope, raw)
      : suggestions(this.context.library(), this.context.active(), raw, this.context.history.load());
    this.selected = raw.trim() && this.items.length ? 0 : -1;
    this.isOpen = true;
    this.drawList();
    this.drawCaret();
    this.list.hidden = false;
    this.box.classList.add('open');
    this.scrim.classList.add('on');
    this.input.setAttribute('aria-expanded', 'true');
  }

  private closeList(): void {
    this.isOpen = false;
    this.list.hidden = true;
    this.box.classList.remove('open');
    this.scrim.classList.remove('on');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  private drawList(): void {
    const doc = this.doc;
    const rows = this.items.map((item, i) => {
      const row = make(doc, 'div', 'row');
      row.id = `hb-sugg-${i}`;
      row.dataset['i'] = String(i);
      row.setAttribute('role', 'option');
      if (item.kind === 'site') row.classList.add('hit');
      row.append(icon(doc, item.icon), make(doc, 'span', 't', item.text), make(doc, 'span', 'm', item.meta));
      if (item.scope) {
        row.classList.add('can-scope');
        const tab = make(doc, 'span', 'tabk', 'tab: search here');
        tab.setAttribute('aria-hidden', 'true');
        row.append(tab);
      }
      const ret = make(doc, 'span', 'ret', '↵');
      ret.setAttribute('aria-hidden', 'true');
      row.append(ret);
      return row;
    });
    if (rows.length === 0) {
      const text = this.scope
        ? `type what you are looking for on ${hostOf(this.scope.url)}`
        : 'no history · type a search or an address';
      this.list.replaceChildren(make(doc, 'div', 'empty', text));
    } else this.list.replaceChildren(...rows);
    this.select(this.selected);
  }

  private select(index: number): void {
    this.selected = index;
    this.list.querySelectorAll('.row').forEach((row, i) => row.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) {
      this.input.setAttribute('aria-activedescendant', `hb-sugg-${index}`);
      this.list.querySelector<HTMLElement>(`#hb-sugg-${index}`)?.scrollIntoView?.({ block: 'nearest' });
    } else this.input.removeAttribute('aria-activedescendant');
  }

  /** The resting block caret after the text or the placeholder, as the drawing has it. The focused line shows its own. */
  private drawCaret(): void {
    const { value, placeholder } = this.input;
    const at = (value || placeholder).length * 0.6 * this.fontSize + (value ? 1 : 3);
    this.caret.style.left = `${Math.round(at)}px`;
  }
}
