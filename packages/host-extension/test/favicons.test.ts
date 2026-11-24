import { describe, expect, it } from 'vitest';
import { browserFavicons, faviconAddress } from '../src/index';
import type { FaviconAccess } from '../src/index';

const BASE = 'chrome-extension://abc/';
/** Chrome's default globe, which it gives for every page it has no favicon of. */
const GLOBE = new Uint8ClampedArray([1, 2, 3, 255]);
const MAIL = new Uint8ClampedArray([9, 9, 9, 255]);

/** A browser that has the favicon of mail.example.com only, and keeps a log of what was asked. */
function access(allowed = true): FaviconAccess & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    request: (permissions) => {
      log.push(`request ${permissions.permissions.join()}`);
      return Promise.resolve(allowed);
    },
    contains: (permissions) => {
      log.push(`contains ${permissions.permissions.join()}`);
      return Promise.resolve(allowed);
    },
    pixels: (url) => {
      const page = new URL(url).searchParams.get('pageUrl') ?? '';
      log.push(`pixels ${page}`);
      if (page.includes('broken')) return Promise.resolve(undefined);
      return Promise.resolve(page.includes('mail.example.com') ? MAIL : GLOBE);
    },
  };
}

describe('faviconAddress', () => {
  it("names the page in the extension's own favicon address, never the site", () => {
    expect(faviconAddress(BASE, 'https://mail.example.com/inbox?a=1&b=2')).toBe(
      'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fmail.example.com%2Finbox%3Fa%3D1%26b%3D2&size=32',
    );
  });
});

describe('browserFavicons', () => {
  it('asks for the favicon permission, and nothing else', async () => {
    const browser = access();
    expect(await browserFavicons(BASE, browser).allow()).toBe(true);
    expect(browser.log).toEqual(['request favicon']);
  });

  it('gives the address of a stored favicon', async () => {
    expect(await browserFavicons(BASE, access()).find('https://mail.example.com/')).toBe(
      faviconAddress(BASE, 'https://mail.example.com/'),
    );
  });

  it("gives nothing where the browser shows its default globe, and reads the globe once", async () => {
    const browser = access();
    const favicons = browserFavicons(BASE, browser);
    expect(await favicons.find('https://news.example.org/')).toBeUndefined();
    expect(await favicons.find('https://wiki.example.net/')).toBeUndefined();
    expect(browser.log.filter((line) => line === 'pixels https://h-board.invalid/')).toHaveLength(1);
  });

  it('reads no image without the permission', async () => {
    const browser = access(false);
    expect(await browserFavicons(BASE, browser).find('https://mail.example.com/')).toBeUndefined();
    expect(browser.log).toEqual(['contains favicon']);
  });

  it('gives nothing for an image that cannot be read', async () => {
    expect(await browserFavicons(BASE, access()).find('https://broken.example.com/')).toBeUndefined();
  });

  it('gives nothing when the globe cannot be read, and tries the globe again next time', async () => {
    const browser = access();
    const pixels = browser.pixels;
    let first = true;
    browser.pixels = (url) => {
      if (first && url.includes('h-board.invalid')) {
        first = false;
        return Promise.resolve(undefined);
      }
      return pixels(url);
    };
    const favicons = browserFavicons(BASE, browser);
    expect(await favicons.find('https://mail.example.com/')).toBeUndefined();
    expect(await favicons.find('https://mail.example.com/')).toBe(faviconAddress(BASE, 'https://mail.example.com/'));
  });

  it('tells an image of another size from the globe', async () => {
    const browser = access();
    browser.pixels = (url) =>
      Promise.resolve(url.includes('h-board.invalid') ? GLOBE : new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 0, 0]));
    expect(await browserFavicons(BASE, browser).find('https://big.example.com/')).toBeDefined();
  });

  it('gives nothing for a stored favicon without a visible pixel', async () => {
    const browser = access();
    browser.pixels = (url) =>
      Promise.resolve(url.includes('h-board.invalid') ? GLOBE : new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 0]));
    expect(await browserFavicons(BASE, browser).find('https://blank.example.com/')).toBeUndefined();
  });

  it('gives a favicon that has one visible pixel', async () => {
    const browser = access();
    browser.pixels = (url) =>
      Promise.resolve(url.includes('h-board.invalid') ? GLOBE : new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 1]));
    expect(await browserFavicons(BASE, browser).find('https://faint.example.com/')).toBeDefined();
  });
});
