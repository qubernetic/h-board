import { ICON_MODES, addressOf, hostOf } from '@h-board/core';
import type { Group, IconMode, Site } from '@h-board/core';
import { BRANDS, brandMark, guessBrand } from './brands';
import { make, pad2 } from './dom';
import { GLYPH_NAMES, hasGlyph } from './icons';
import { icon } from './parts';

/** What the dialog hands back: the site's fields, and the index of the group it goes to. */
export interface SiteForm {
  readonly group: number;
  readonly fields: Omit<Site, 'id'>;
}

/** The Phosphor icons the picker offers before anything is typed: the mock's list. */
const GLYPH_STARTERS = [
  'globe',
  'chart-line-up',
  'cloud',
  'code',
  'gear-six',
  'book-open',
  'terminal-window',
  'database',
  'camera',
  'envelope-simple',
  'calendar-blank',
  'folder',
  'lightning',
  'cube',
];
/** How many matches a picker shows. */
const PICKS = 14;

const TITLES = new Map(BRANDS.map((brand) => [brand.slug, brand.title]));

const LABELS: Readonly<Record<IconMode, string>> = { brand: 'brand', favicon: 'favicon', phosphor: 'Phosphor', initial: 'initial' };

/** The browser's stored favicons, as the dialog sees them. */
export interface DialogFavicons {
  /** The favicon the browser stored for an address, as far as it is known. */
  image(url: string): string | undefined;
  /** Asks for the permission to show favicons, in the change that chooses them. Nothing to ask when left out. */
  allow?: () => Promise<boolean>;
}

/** A short name from a host: `grafana` for grafana.example.local, `github` for github.com. The mock's rule. */
export function nameFromHost(host: string): string {
  const parts = host.split('.');
  const first = parts[0] as string;
  return parts.length > 2 && first.length > 2 ? first : (parts[parts.length - 2] as string);
}

/** The names that contain `query`, those where it comes first and the short ones before the rest. */
function matches(names: readonly string[], query: string): string[] {
  return names
    .filter((name) => name.includes(query))
    .sort((a, b) => a.indexOf(query) - b.indexOf(query) || a.length - b.length)
    .slice(0, PICKS);
}

function labelled(doc: Document, text: string, control: HTMLElement, part?: string): HTMLLabelElement {
  const node = make(doc, 'label', 'fld');
  if (part) node.dataset['part'] = part;
  node.append(make(doc, 'span', 'cap', text), control);
  return node;
}

/**
 * The add and edit dialog of a site: address, name, description, the icon (the brand mark, a Phosphor icon or the
 * initial) and the group. It changes nothing itself; `save` gets what the user filled in. What the user types is
 * shown as text.
 */
export class SiteDialog {
  readonly node: HTMLDialogElement;
  private readonly form: HTMLFormElement;
  private readonly title: HTMLElement;
  private readonly url: HTMLInputElement;
  private readonly urlField: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly description: HTMLTextAreaElement;
  private readonly group: HTMLSelectElement;
  private readonly ok: HTMLButtonElement;
  private readonly previews: Record<IconMode, HTMLElement>;
  private readonly glyphPicker: HTMLElement;
  private readonly brandPicker: HTMLElement;
  /** Why the favicon choice went back: the browser did not allow it. */
  private readonly refused: HTMLElement;
  private groups: readonly Group[] = [];
  private site: Site | null = null;
  private glyph = 'globe';
  private brand: string | null = null;
  private brandChosen = false;
  private nameTouched = false;
  private iconMode: IconMode = 'brand';

  constructor(
    private readonly doc: Document,
    private readonly save: (form: SiteForm, site: Site | null) => void,
    private readonly favicons: DialogFavicons = { image: () => undefined },
  ) {
    this.node = make(doc, 'dialog', 'hb-dialog');
    this.node.dataset['part'] = 'site-dialog';
    this.node.setAttribute('aria-labelledby', 'hb-dialog-title');
    this.form = make(doc, 'form');
    this.form.noValidate = true;
    this.title = make(doc, 'h2', 'label');
    this.title.id = 'hb-dialog-title';
    this.title.dataset['part'] = 'dialog-title';
    const close = make(doc, 'button', 'x');
    close.type = 'button';
    close.dataset['part'] = 'dialog-close';
    close.setAttribute('aria-label', 'Close');
    close.append(icon(doc, 'x'));

    this.url = make(doc, 'input');
    this.url.name = 'url';
    this.url.type = 'text';
    this.url.inputMode = 'url';
    this.url.placeholder = 'https://';
    this.url.autocomplete = 'off';
    this.url.spellcheck = false;
    this.urlField = labelled(doc, 'Address', this.url, 'url-field');
    this.urlField.append(make(doc, 'span', 'err', 'Give an address, for example grafana.example.local'));
    this.name = make(doc, 'input');
    this.name.name = 'name';
    this.name.type = 'text';
    this.name.autocomplete = 'off';
    this.name.spellcheck = false;
    this.description = make(doc, 'textarea');
    this.description.name = 'description';
    this.description.rows = 2;

    const icons = make(doc, 'fieldset', 'icons');
    icons.append(make(doc, 'legend', 'cap', 'Icon'));
    const options = make(doc, 'div', 'opts');
    const previews: Partial<Record<IconMode, HTMLElement>> = {};
    for (const mode of ICON_MODES) {
      const option = make(doc, 'label');
      const radio = make(doc, 'input');
      radio.type = 'radio';
      radio.name = 'icon';
      radio.value = mode;
      const preview = make(doc, 'span', 'pv');
      preview.dataset['part'] = `preview-${mode}`;
      previews[mode] = preview;
      const box = make(doc, 'span', 'box');
      box.append(preview, make(doc, 'span', 'sub', LABELS[mode]));
      option.append(radio, box);
      options.append(option);
    }
    this.previews = previews as Record<IconMode, HTMLElement>;
    this.glyphPicker = this.picker('glyph-picker', 'Search the icons, for example chart, cloud, gear');
    this.brandPicker = this.picker('brand-picker', 'Search the marks, for example github, youtube');
    this.refused = make(doc, 'p', 'note', 'The browser did not allow favicons; the icon stays as it was.');
    this.refused.dataset['part'] = 'favicon-refused';
    this.refused.hidden = true;
    icons.append(options, this.refused, this.glyphPicker, this.brandPicker);

    this.group = make(doc, 'select');
    this.group.name = 'group';
    const actions = make(doc, 'div', 'acts');
    const cancel = make(doc, 'button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.dataset['part'] = 'dialog-cancel';
    this.ok = make(doc, 'button', 'btn primary');
    this.ok.type = 'submit';
    this.ok.dataset['part'] = 'dialog-ok';
    actions.append(cancel, this.ok);

    this.form.append(
      make(doc, 'div', 'top'),
      this.title,
      close,
      this.urlField,
      labelled(doc, 'Name', this.name),
      labelled(doc, 'Description', this.description),
      icons,
      labelled(doc, 'Group', this.group),
      actions,
    );
    this.node.append(this.form);
    this.listen(close, cancel, options);
  }

  get open(): boolean {
    return this.node.open;
  }

  /** Opens the dialog for a new site in group `active`, or for `site` there. */
  show(groups: readonly Group[], active: number, site: Site | null = null): void {
    const doc = this.doc;
    this.groups = groups;
    this.site = site;
    const group = groups[active] as Group;
    this.form.reset();
    delete this.urlField.dataset['bad'];
    this.refused.hidden = true;
    this.title.replaceChildren(
      make(doc, 'span', 'idx', site ? '[ ✎ ]' : '[ + ]'),
      make(doc, 'span', 'txt', `${site ? 'Edit site' : 'New site'} · ${group.name}`),
    );
    this.ok.textContent = site ? 'Save' : 'Add';
    this.group.replaceChildren(
      ...groups.map((g, i) => {
        const option = make(doc, 'option', '', `${pad2(i + 1)}  ${g.name}`);
        option.value = String(i);
        return option;
      }),
    );
    this.group.value = String(active);
    this.url.value = site?.url ?? '';
    this.name.value = site?.name ?? '';
    this.description.value = site?.description ?? '';
    this.glyph = site?.glyph ?? 'globe';
    this.brandChosen = Boolean(site?.brand);
    this.brand = site?.brand ?? (site ? guessBrand(site.url) : null);
    this.nameTouched = site !== null;
    this.mode = site?.icon ?? group.iconMode;
    for (const picker of [this.glyphPicker, this.brandPicker]) (picker.querySelector('input') as HTMLInputElement).value = '';
    this.draw();
    this.node.showModal();
    this.url.focus();
  }

  close(): void {
    this.node.close();
  }

  /** Draws the previews again, for a favicon that has arrived. */
  redraw(): void {
    this.draw();
  }

  private get mode(): IconMode {
    return this.iconMode;
  }

  private set mode(mode: IconMode) {
    this.iconMode = mode;
    (this.form.querySelector(`input[name="icon"][value="${mode}"]`) as HTMLInputElement).checked = true;
  }

  private picker(part: string, placeholder: string): HTMLElement {
    const node = make(this.doc, 'div', 'pick');
    node.dataset['part'] = part;
    const search = make(this.doc, 'input');
    search.type = 'text';
    search.placeholder = placeholder;
    search.setAttribute('aria-label', placeholder);
    search.autocomplete = 'off';
    search.spellcheck = false;
    node.append(search, make(this.doc, 'div', 'res'));
    return node;
  }

  private listen(close: HTMLElement, cancel: HTMLElement, options: HTMLElement): void {
    close.addEventListener('click', () => this.close());
    cancel.addEventListener('click', () => this.close());
    this.node.addEventListener('click', (event) => {
      if (event.target === this.node) this.close(); // the backdrop
    });
    this.url.addEventListener('input', () => {
      delete this.urlField.dataset['bad'];
      const url = addressOf(this.url.value);
      if (!url) return;
      if (!this.nameTouched) this.name.value = nameFromHost(hostOf(url));
      if (!this.brandChosen) this.brand = guessBrand(url);
      this.draw();
    });
    this.name.addEventListener('input', () => {
      this.nameTouched = this.name.value.trim() !== '';
      this.draw();
    });
    options.addEventListener('change', (event) => {
      const previous = this.iconMode;
      this.iconMode = (event.target as HTMLInputElement).value as IconMode;
      this.refused.hidden = true;
      this.draw();
      if (this.iconMode === 'favicon' && previous !== 'favicon') this.askFavicons(previous);
    });
    for (const picker of [this.glyphPicker, this.brandPicker]) {
      const search = picker.querySelector('input') as HTMLInputElement;
      search.addEventListener('input', () => this.draw());
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault(); // searching icons is not saving the site
      });
      picker.addEventListener('click', (event) => {
        const name = (event.target as Element).closest<HTMLElement>('button[data-name]')?.dataset['name'];
        if (!name) return;
        if (picker === this.glyphPicker) this.glyph = name;
        else {
          this.brand = name;
          this.brandChosen = true;
        }
        this.draw();
      });
    }
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
  }

  /** Asks for the favicon permission in the change; a refusal goes back to `previous` and says why. */
  private askFavicons(previous: IconMode): void {
    const allow = this.favicons.allow;
    if (!allow) return;
    const refuse = (): void => {
      if (this.iconMode !== 'favicon') return;
      this.mode = previous;
      this.refused.hidden = false;
      this.draw();
    };
    allow().then((allowed) => {
      if (allowed) this.draw();
      else refuse();
    }, refuse);
  }

  private submit(): void {
    const url = addressOf(this.url.value);
    if (!url) {
      this.urlField.dataset['bad'] = '';
      this.url.focus();
      return;
    }
    const group = Number(this.group.value);
    const mode = this.mode;
    // a site whose choice is its group's mode follows the group, unless it had its own already
    const keep = this.site?.icon ?? null;
    const own = keep === null && mode === (this.groups[group] as Group).iconMode ? null : mode;
    this.close();
    this.save(
      {
        group,
        fields: {
          name: this.name.value.trim() || nameFromHost(hostOf(url)),
          url,
          description: this.description.value.trim(),
          glyph: this.glyph,
          brand: this.brand,
          icon: own,
        },
      },
      this.site,
    );
  }

  /**
   * The previews and the picker of the chosen mode. The favicon's preview is the one the browser stored, or what
   * the card shows without it: the Phosphor icon, which its picker chooses, or the initial.
   */
  private draw(): void {
    const doc = this.doc;
    const mode = this.mode;
    const mark = this.brand ? brandMark(doc, this.brand) : null;
    const initial = (): HTMLElement => make(doc, 'span', 'initial', (this.name.value.trim()[0] ?? 'g').toLowerCase());
    const url = addressOf(this.url.value);
    const favicon = url ? this.favicons.image(url) : undefined;
    let stored: HTMLImageElement | undefined;
    if (favicon !== undefined) {
      stored = make(doc, 'img');
      stored.alt = '';
      stored.src = favicon;
    }
    this.previews.brand.replaceChildren(mark ?? make(doc, 'span', 'sq'));
    this.previews.favicon.replaceChildren(stored ?? (hasGlyph(this.glyph) ? icon(doc, this.glyph) : initial()));
    this.previews.phosphor.replaceChildren(icon(doc, this.glyph));
    this.previews.initial.replaceChildren(initial());
    const glyphs = mode === 'phosphor' || mode === 'favicon';
    this.glyphPicker.hidden = !glyphs;
    this.brandPicker.hidden = mode !== 'brand';
    if (glyphs) this.drawPicks(this.glyphPicker, GLYPH_STARTERS, GLYPH_NAMES, this.glyph);
    if (mode === 'brand') {
      const slugs = BRANDS.map((brand) => brand.slug);
      this.drawPicks(this.brandPicker, slugs.slice(0, PICKS), slugs, this.brand);
    }
  }

  private drawPicks(picker: HTMLElement, starters: readonly string[], all: readonly string[], chosen: string | null): void {
    const doc = this.doc;
    const query = (picker.querySelector('input') as HTMLInputElement).value.trim().toLowerCase();
    const brands = picker === this.brandPicker;
    const names = query ? matches(all, query) : starters;
    const buttons = names.map((name) => {
      const button = make(doc, 'button');
      button.type = 'button';
      button.dataset['name'] = name;
      const title = brands ? (TITLES.get(name) as string) : name;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.setAttribute('aria-pressed', String(name === chosen));
      button.append(brands ? (brandMark(doc, name) as SVGSVGElement) : icon(doc, name));
      return button;
    });
    const none = make(doc, 'span', 'none', brands ? 'no such mark' : 'no such icon');
    (picker.querySelector('.res') as HTMLElement).replaceChildren(...(buttons.length ? buttons : [none]));
  }
}
