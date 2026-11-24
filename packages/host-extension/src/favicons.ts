import { faviconTone } from '@h-board/ui';
import type { FaviconSource } from '@h-board/ui';

/**
 * What the favicon source needs of the browser: the optional `favicon` permission, and the pixels of an image
 * the extension's own `_favicon` address gives.
 */
export interface FaviconAccess {
  request(permissions: { permissions: string[] }): Promise<boolean>;
  contains(permissions: { permissions: string[] }): Promise<boolean>;
  /** The RGBA pixels of the image at `url`, or `undefined` when it does not load. */
  pixels(url: string): Promise<Uint8ClampedArray | undefined>;
}

const PERMISSION = { permissions: ['favicon'] };
/** The size the cards ask for: twice the largest tile icon, for sharp edges on a dense screen. */
const SIZE = 32;
/** A page no browser has a favicon of (`.invalid` is reserved, RFC 2606): its favicon is the default globe. */
const NO_FAVICON = 'https://h-board.invalid/';

/**
 * The extension's own address of the favicon the browser stored for `pageUrl`. It reads the browser's favicon
 * store and nothing else: no request goes to the site or to anyone else.
 */
export function faviconAddress(base: string, pageUrl: string): string {
  const url = new URL('_favicon/', base);
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(SIZE));
  return url.href;
}

/** No pixel of an RGBA image shows: every alpha is 0. */
const blank = (image: Uint8ClampedArray): boolean => image.every((value, i) => i % 4 !== 3 || value === 0);

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * The browser's stored favicons for the page. Chrome answers a page it has no favicon of with its default globe,
 * so an image with the globe's pixels counts as none and the card shows the site's own icon instead. So does a
 * stored favicon that is fully transparent: it would leave the tile empty. A favicon comes with its tone when
 * nearly all of it is dark or light, read from the same pixels, so the page can back it where it would not show.
 */
export function browserFavicons(base: string, access: FaviconAccess): FaviconSource {
  let globe: Promise<Uint8ClampedArray | undefined> | undefined;
  return {
    allow: () => access.request(PERMISSION),
    async find(url) {
      if (!(await access.contains(PERMISSION))) return undefined;
      globe ??= access.pixels(faviconAddress(base, NO_FAVICON));
      const address = faviconAddress(base, url);
      const [image, none] = await Promise.all([access.pixels(address), globe]);
      if (!none) globe = undefined;
      if (!image || !none || same(image, none) || blank(image)) return undefined;
      const tone = faviconTone(image);
      return { image: address, ...(tone && { tone }) };
    },
  };
}
