import { drum, wheelLayout } from '@h-board/core';
import type { Group, IconMode, Library, PageLayout, Site } from '@h-board/core';
import { make, pad2, place } from './dom';
import { glyph } from './icons';

/** The drawing's pieces of the start page. Every name, address and description goes in as text. */

/** `[ 02 ]  DEVELOPMENT · 29 SITES`: the label of a section. */
export function label(doc: Document, index: string, text: string, part?: string): HTMLElement {
  const node = make(doc, 'div', 'label');
  if (part) node.dataset['part'] = part;
  node.append(make(doc, 'span', 'idx', `[ ${index} ]`), make(doc, 'span', 'txt', text));
  return node;
}

export function icon(doc: Document, name: string, className = ''): HTMLElement {
  const node = make(doc, 'span', `ph ${className}`.trim(), glyph(name));
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export const sitesLabel = (count: number): string => `${count} ${count === 1 ? 'site' : 'sites'}`;

// ------------------------------------------------------------------ the group wheel

/** Positions of the limb's ticks past the last name: offset from the lens, opacity. */
const WHEEL_TICKS = [
  [196, 0.8],
  [222, 0.62],
  [242, 0.46],
  [256, 0.32],
  [265, 0.22],
  [270, 0.14],
] as const;

/**
 * The wheel on a rail `w` x `h`: the head, the limb's ticks, the lens with the active group, its neighbours round
 * the drum, the ruler with one mark per group, and the new-group button.
 */
export function wheel(doc: Document, groups: readonly Group[], active: number, w: number, h: number): HTMLElement[] {
  const { cy, s, lh } = wheelLayout(h);
  const nodes: HTMLElement[] = [];
  const head = make(doc, 'div', 'head', `Groups · ${groups.length}`);
  head.dataset['part'] = 'rail-head';
  nodes.push(head);
  for (const [off, opacity] of WHEEL_TICKS) {
    for (const sign of [-1, 1]) {
      const y = Math.round(cy + sign * off * s);
      if (y > 56 + 12 && y < h - 60 - 12) {
        const tick = make(doc, 'span', 'limb');
        tick.style.top = `${y}px`;
        tick.style.opacity = String(Math.round(opacity * 0.55 * 1000) / 1000);
        nodes.push(tick);
      }
    }
  }
  const lens = make(doc, 'div', 'lens');
  place(lens, 0, cy - lh, undefined, 2 * lh + 1);
  nodes.push(lens);
  const current = groups[active];
  const rows = drum(
    active,
    groups.map((group) => group.name),
    w,
    h,
  );
  for (const row of rows) {
    const group = groups[row.index];
    if (!group) continue;
    const button = make(doc, 'button', 'drum-row');
    button.type = 'button';
    button.dataset['index'] = String(row.index);
    button.setAttribute('aria-label', `${row.index + 1}: ${group.name}`);
    const height = Math.round(row.size * 1.4);
    if (row.distance === 0) {
      button.setAttribute('aria-current', 'true');
      place(button, 32, cy - lh, w - 72, 2 * lh);
    } else {
      if (!row.visible) continue;
      place(button, 32, Math.round(row.y - row.size * 0.65), w - 72, height);
      button.style.opacity = String(row.opacity);
      button.style.fontSize = `${row.size}px`;
      const num = make(doc, 'span', 'num', pad2(row.index + 1));
      num.style.top = `${Math.round(row.size * 0.3)}px`;
      button.append(num, make(doc, 'span', 'name', group.name));
    }
    nodes.push(button);
  }
  const lensRow = rows.find((row) => row.distance === 0);
  const tag = make(doc, 'span', 'lens-tag', current ? `[ ${pad2(active + 1)} ]` : '');
  tag.dataset['part'] = 'lens-tag';
  tag.style.top = `${cy - lh + 8}px`;
  const name = make(doc, 'span', 'lens-name', current?.name ?? '');
  name.dataset['part'] = 'lens-name';
  const nameSize = lensRow?.size ?? 26;
  name.style.top = `${cy - Math.round(nameSize * 0.68)}px`;
  name.style.fontSize = `${nameSize}px`;
  const count = make(doc, 'span', 'lens-count', current ? sitesLabel(current.sites.length) : '');
  count.dataset['part'] = 'lens-count';
  count.style.top = `${cy + lh - 24}px`;
  nodes.push(tag, name, count);
  nodes.push(ruler(doc, groups, active, w, h));
  const add = make(doc, 'button', 'add', '+ new group');
  add.type = 'button';
  add.disabled = true;
  add.title = 'Adding a group comes with editing';
  add.style.top = `${h - 40}px`;
  nodes.push(add);
  return nodes;
}

/** The ruler on the rail's right edge: the whole list, a mark per group, the active one cyan. */
function ruler(doc: Document, groups: readonly Group[], active: number, w: number, h: number): HTMLElement {
  const box = make(doc, 'div', 'ruler');
  const rx = w - 22;
  box.style.left = `${rx}px`;
  const ticks = make(doc, 'div', 'ticks');
  const count = Math.floor((h - 40) / 7);
  ticks.style.height = `${(count - 1) * 7 + 1}px`;
  box.append(ticks);
  const n = groups.length;
  if (n === 0) return box;
  const span = (h - 40) / n;
  groups.forEach((group, i) => {
    const mark = make(doc, 'button', 'ruler-mark');
    mark.type = 'button';
    mark.tabIndex = -1;
    mark.dataset['index'] = String(i);
    mark.setAttribute('aria-label', `${i + 1}: ${group.name}`);
    const top = 20 + span * i;
    place(mark, -4, top, undefined, span);
    const tick = make(doc, 'span', 'tick');
    tick.style.top = `${Math.round(20 + span * i + span / 2) - top}px`;
    mark.append(tick);
    if (i === active) mark.setAttribute('aria-current', 'true');
    box.append(mark);
  });
  const pos = make(doc, 'div', 'ruler-pos');
  place(pos, 14, Math.round(20 + span * active), undefined, Math.round(span));
  box.append(pos);
  return box;
}

// ------------------------------------------------------------------ cards

/** The size a card is drawn in, from its measures: build.py's card(). */
export function cardSize(L: PageLayout): 'dense' | 'normal' | 'compact' | 'roomy' | 'large' {
  if (L.cardH <= 72) return 'dense';
  if (L.cardH <= 120) return 'normal';
  if (L.cardH >= 176) return 'large';
  return L.cardH >= 150 && L.cardW >= 260 ? 'roomy' : 'compact';
}

function isWebAddress(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** The address without its scheme and without a trailing slash, as the cards show it. */
export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function tile(doc: Document, site: Site, mode: IconMode): HTMLElement {
  const node = make(doc, 'span', 'tile');
  node.setAttribute('aria-hidden', 'true');
  if ((site.icon ?? mode) === 'initial') {
    node.append(make(doc, 'span', 'initial', (site.name.trim()[0] ?? '?').toLowerCase()));
  } else {
    // the brand marks come with the icon choice; until then a brand falls back to the site's glyph
    node.append(icon(doc, site.glyph));
  }
  return node;
}

/** A site's card: a link that opens the site, or a plain card where the address is not a web address. */
export function card(doc: Document, site: Site, index: number, mode: IconMode): HTMLElement {
  const web = isWebAddress(site.url);
  const node = web ? make(doc, 'a', 'card') : make(doc, 'div', 'card');
  if (node instanceof HTMLAnchorElement) {
    node.href = site.url;
    node.rel = 'noopener noreferrer';
  }
  if (site.description) node.title = site.description;
  const no = make(doc, 'span', 'no', pad2(index + 1));
  no.setAttribute('aria-hidden', 'true');
  const go = icon(doc, 'arrow-up-right', 'go');
  node.append(
    tile(doc, site, mode),
    no,
    make(doc, 'span', 'name', site.name),
    make(doc, 'span', 'host', hostOf(site.url)),
    make(doc, 'span', 'desc', site.description),
    make(doc, 'span', 'rule'),
    go,
  );
  return node;
}

/** The tile after the last card. Adding a site comes with editing. */
export function addTile(doc: Document): HTMLElement {
  const node = make(doc, 'button', 'card add');
  node.type = 'button';
  node.disabled = true;
  node.title = 'Adding a site comes with editing';
  node.dataset['part'] = 'add-site';
  node.append(icon(doc, 'plus'), make(doc, 'span', '', 'new site'));
  return node;
}

/** Puts the grid's box and its tiles where the layout and the card layout say. */
export function sizeGrid(grid: HTMLElement, L: PageLayout, cardLayout: string, boxH: number): void {
  place(grid, L.x0, L.gridY, L.mainW, boxH);
  grid.dataset['layout'] = cardLayout;
  grid.dataset['size'] = cardSize(L);
  if (L.cardW >= 300) grid.dataset['wide'] = '';
  else delete grid.dataset['wide'];
  if (cardLayout === 'compact') {
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.floor((L.mainW + 12) / 312))}, minmax(0, 1fr))`;
    grid.style.gridAutoRows = '';
    grid.style.gap = '';
  } else {
    grid.style.gridTemplateColumns = `repeat(${L.columns}, ${L.cardW}px)`;
    grid.style.gridAutoRows = `${L.cardH}px`;
    grid.style.gap = `${L.gap}px`;
  }
}

// ------------------------------------------------------------------ the hero

/** The to-do list beside the clock: shown here, changed with editing. */
export function todoList(doc: Document, library: Library): HTMLElement[] {
  const done = library.todos.filter((todo) => todo.done).length;
  const head = label(doc, '✓', `To do · ${done} / ${library.todos.length}`, 'todo-head');
  const list = make(doc, 'ul');
  list.dataset['part'] = 'todo';
  for (const todo of library.todos) {
    const item = make(doc, 'li');
    if (todo.done) item.dataset['done'] = '';
    const check = make(doc, 'span', 'check');
    check.setAttribute('aria-hidden', 'true');
    item.append(check, doc.createTextNode(todo.text));
    list.append(item);
  }
  return [head, list];
}

/** The search box's pieces, sized for a box `h` tall. Searching comes with the search. */
export function searchBox(doc: Document, w: number, h: number, engine: string): HTMLElement[] {
  const fs = h <= 52 ? 16 : 18;
  const e = h - 16;
  const chip = make(doc, 'span', 'engine', engine);
  place(chip, 7, 7, e, e);
  const px = 8 + e + 14;
  const prompt = make(doc, 'span', 'prompt', '›');
  prompt.setAttribute('aria-hidden', 'true');
  place(prompt, px - 1, Math.round((h - fs * 1.3) / 2 - 2) - 1);
  prompt.style.fontSize = `${fs + 4}px`;
  const tx = px + 20;
  const input = make(doc, 'input');
  input.type = 'text';
  input.placeholder = 'search or address';
  input.setAttribute('aria-label', 'Search or address');
  input.autocomplete = 'off';
  input.spellcheck = false;
  place(input, tx - 1, 0, w - tx - 60);
  input.style.height = `${h - 2}px`;
  input.style.fontSize = `${fs}px`;
  const caret = make(doc, 'span', 'caret');
  caret.setAttribute('aria-hidden', 'true');
  place(caret, Math.round(tx + 'search or address'.length * 0.6 * fs + 3) - 1, (h - 20) / 2 - 1);
  const kbd = make(doc, 'span', 'kbd', '/');
  kbd.setAttribute('aria-hidden', 'true');
  place(kbd, w - 52 - 1, (h - 24) / 2 - 1);
  return [chip, prompt, input, caret, kbd];
}
