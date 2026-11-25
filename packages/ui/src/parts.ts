import { drum, wheelLayout } from '@h-board/core';
import type { Group, IconMode, Library, PageLayout, Site } from '@h-board/core';
import { brandMark } from './brands';
import { make, pad2, place } from './dom';
import { glyph, hasGlyph } from './icons';
import type { Favicon } from './favicons';

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
    const group = groups[row.index] as Group;
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
  add.dataset['part'] = 'add-group';
  add.style.top = `${h - 40}px`;
  nodes.push(add);
  return nodes;
}

/** The edit mode's buttons for the group in view: rename it, delete it. */
export function groupActions(doc: Document): HTMLElement {
  const node = make(doc, 'span', 'group-acts');
  for (const [act, text] of [
    ['rename', 'rename group'],
    ['delete', 'delete group'],
  ] as const) {
    const button = make(doc, 'button', '', text);
    button.type = 'button';
    button.dataset['groupAct'] = act;
    node.append(button);
  }
  return node;
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

/**
 * The size a card is drawn in, from its height: build.py's card(). Its roomy size (150 to 175 px tall) does not
 * occur, as a spacious card is 148 px tall, or 192 px on a tall screen.
 */
export function cardSize(L: PageLayout): 'dense' | 'normal' | 'compact' | 'large' {
  if (L.cardH <= 72) return 'dense';
  if (L.cardH <= 120) return 'normal';
  return L.cardH >= 176 ? 'large' : 'compact';
}

/** Whether `url` is an `http` or `https` address, the only kind a card opens. */
export function isWebAddress(url: string): boolean {
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

/** The icon mode a site is drawn in: its own, or its group's. */
export const modeOf = (site: Site, mode: IconMode): IconMode => site.icon ?? mode;

const initial = (doc: Document, site: Site): HTMLElement =>
  make(doc, 'span', 'initial', (site.name.trim()[0] ?? '?').toLowerCase());

/**
 * A site's tile. In the favicon mode it shows `favicon`, the image the browser stored for the site, marked with
 * its tone when it has one; without one
 * the site's Phosphor icon, and the initial when the site has no Phosphor icon.
 */
export function tile(doc: Document, site: Site, mode: IconMode, favicon?: Favicon): HTMLElement {
  const node = make(doc, 'span', 'tile');
  node.setAttribute('aria-hidden', 'true');
  const own = modeOf(site, mode);
  const brand = own === 'brand' && site.brand ? brandMark(doc, site.brand) : null;
  if (own === 'initial') node.append(initial(doc, site));
  else if (own === 'favicon') {
    if (favicon === undefined) node.append(hasGlyph(site.glyph) ? icon(doc, site.glyph) : initial(doc, site));
    else {
      const image = make(doc, 'img', 'favimg');
      image.alt = '';
      image.src = favicon.image;
      // the theme backs a favicon that cannot be seen on its tile (board.css)
      if (favicon.tone) image.dataset['tone'] = favicon.tone;
      node.append(image);
    }
  }
  // a site without a bundled mark shows its glyph
  else node.append(brand ?? icon(doc, site.glyph));
  return node;
}

/**
 * A site's card: a link that opens the site, or a plain card where the address is not a web address. In edit mode
 * it is a card to drag, with a handle and its edit and delete buttons. Outside edit mode it carries its jump `code`,
 * which shows while the codes do. `favicon` is the image the browser stored for the site, for the favicon mode.
 */
export function card(
  doc: Document,
  site: Site,
  index: number,
  mode: IconMode,
  editing = false,
  code = '',
  favicon?: Favicon,
): HTMLElement {
  const web = isWebAddress(site.url) && !editing;
  const node = web ? make(doc, 'a', 'card') : make(doc, 'div', editing ? 'card ed' : 'card');
  node.dataset['index'] = String(index);
  if (node instanceof HTMLAnchorElement) {
    node.href = site.url;
    node.rel = 'noopener noreferrer';
  }
  if (site.description && !editing) node.title = site.description;
  const no = make(doc, 'span', 'no', pad2(index + 1));
  no.setAttribute('aria-hidden', 'true');
  node.append(
    tile(doc, site, mode, favicon),
    no,
    make(doc, 'span', 'name', site.name),
    make(doc, 'span', 'host', hostOf(site.url)),
    make(doc, 'span', 'desc', site.description),
    make(doc, 'span', 'rule'),
  );
  if (!editing) {
    node.dataset['code'] = code;
    const hk = make(doc, 'span', 'hk', code);
    hk.setAttribute('aria-hidden', 'true');
    node.append(icon(doc, 'arrow-up-right', 'go'), hk);
    return node;
  }
  node.draggable = true;
  node.tabIndex = 0;
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', site.name);
  const bar = make(doc, 'span', 'editbar');
  for (const [act, glyphName, text, label] of [
    ['edit', 'pencil-simple', 'edit', 'Edit'],
    ['delete', 'trash', 'delete', 'Delete'],
  ] as const) {
    const button = make(doc, 'button');
    button.type = 'button';
    button.dataset['act'] = act;
    button.setAttribute('aria-label', `${label}: ${site.name}`);
    button.append(icon(doc, glyphName), make(doc, 'span', 'lbl', text));
    bar.append(button);
  }
  node.append(icon(doc, 'dots-six-vertical', 'handle'), bar);
  return node;
}

/** The tile after the last card: it opens the site dialog. */
export function addTile(doc: Document): HTMLElement {
  const node = make(doc, 'button', 'card add');
  node.type = 'button';
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

/**
 * The to-do list beside the clock: a checkbox, the text and a delete button per to-do. The check and the cross are
 * drawn by the style sheet, so an item's text is the to-do's alone.
 */
export function todoList(doc: Document, library: Library): HTMLElement[] {
  const done = library.todos.filter((todo) => todo.done).length;
  const head = label(doc, '✓', `To do · ${done} / ${library.todos.length}`, 'todo-head');
  const list = make(doc, 'ul');
  list.dataset['part'] = 'todo';
  library.todos.forEach((todo, i) => {
    const item = make(doc, 'li');
    item.dataset['index'] = String(i);
    if (todo.done) item.dataset['done'] = '';
    const check = make(doc, 'button', 'check');
    check.type = 'button';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(todo.done));
    check.setAttribute('aria-label', todo.text);
    const remove = make(doc, 'button', 'del');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete: ${todo.text}`);
    item.append(check, make(doc, 'span', 'txt', todo.text), remove);
    list.append(item);
  });
  return [head, list];
}

/** The field under the to-do list that adds one. */
export function todoForm(doc: Document): HTMLFormElement {
  const form = make(doc, 'form', 'todo-add');
  const input = make(doc, 'input');
  input.type = 'text';
  input.placeholder = '+ new to-do';
  input.autocomplete = 'off';
  input.dataset['part'] = 'todo-new';
  input.setAttribute('aria-label', 'New to-do');
  form.append(input);
  return form;
}
