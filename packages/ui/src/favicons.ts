/**
 * The favicons the browser has already stored, as a host hands them to the page. The page knows no host: the
 * extension reads the browser's own favicon store, and nothing here fetches a site or a third party.
 */
/** A favicon whose visible pixels are nearly all dark, or nearly all light: it cannot be seen on a tile of its own tone. */
export type FaviconTone = 'dark' | 'light';

/** A stored favicon: the address of its image, and its tone when it has one. */
export interface Favicon {
  readonly image: string;
  readonly tone?: FaviconTone;
}

/** The relative luminance below which a pixel is less than 2:1 against the dark theme's tile (`--surface`, #151617). */
const DARK_BELOW = 0.065;
/** The relative luminance above which a pixel is less than 2:1 against the light theme's tile (`--surface`, #ffffff). */
const LIGHT_ABOVE = 0.475;
/** The share of the visible pixels, weighted by their alpha, that makes a tone. */
const NEARLY_ALL = 0.9;

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * The tone of an RGBA image: `dark` when nearly all that shows of it is too dark to tell from the dark theme's
 * tile, `light` when nearly all is too light for the light theme's, and none for any other image, so a favicon
 * with colours or with a ground of its own is left as it is.
 */
export function faviconTone(image: Uint8ClampedArray): FaviconTone | undefined {
  let seen = 0;
  let dark = 0;
  let light = 0;
  for (let i = 0; i + 3 < image.length; i += 4) {
    const alpha = (image[i + 3] ?? 0) / 255;
    const luminance = 0.2126 * linear(image[i] ?? 0) + 0.7152 * linear(image[i + 1] ?? 0) + 0.0722 * linear(image[i + 2] ?? 0);
    seen += alpha;
    if (luminance < DARK_BELOW) dark += alpha;
    else if (luminance > LIGHT_ABOVE) light += alpha;
  }
  if (seen === 0) return undefined;
  if (dark >= NEARLY_ALL * seen) return 'dark';
  return light >= NEARLY_ALL * seen ? 'light' : undefined;
}

export interface FaviconSource {
  /** Asks the browser for the permission to show its stored favicons. Called in the click, so nothing waits before it. */
  allow(): Promise<boolean>;
  /** The favicon the browser stored for `url`, or `undefined` when it has none or may not show it. */
  find(url: string): Promise<Favicon | undefined>;
}

/**
 * What the source answered for each address, so that a drawing needs no wait. An address not asked about yet is
 * asked once; `changed` hears when an answer brings a favicon.
 */
export class FaviconCache {
  private readonly known = new Map<string, Favicon | null>();

  constructor(
    private readonly source: FaviconSource | undefined,
    private readonly changed: () => void,
  ) {}

  /** The favicon of `url` as far as it is known; asks the source the first time. */
  get(url: string): Favicon | undefined {
    const source = this.source;
    if (!source) return undefined;
    const known = this.known.get(url);
    if (known !== undefined) return known ?? undefined;
    this.known.set(url, null);
    source.find(url).then(
      (image) => {
        if (image === undefined) return;
        this.known.set(url, image);
        this.changed();
      },
      () => undefined,
    );
    return undefined;
  }

  /** Forgets the addresses that had no favicon: after the permission is given, they are asked again. */
  retry(): void {
    for (const [url, image] of this.known) if (image === null) this.known.delete(url);
  }
}
