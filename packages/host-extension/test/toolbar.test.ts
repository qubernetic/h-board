import { describe, expect, it } from 'vitest';
import { followScheme, reportScheme, toolbarIcon, watchScheme } from '../src/index';
import type { ActionApi, OffscreenApi } from '../src/index';

function fakeAction(): { action: ActionApi; icons: unknown[] } {
  const icons: unknown[] = [];
  return {
    icons,
    action: {
      setIcon: (details) => {
        icons.push(details.path);
        return Promise.resolve();
      },
    },
  };
}

describe('toolbarIcon', () => {
  it('names the ink for a dark and for a light toolbar', () => {
    expect(toolbarIcon(true)).toEqual({
      16: 'icons/toolbar-on-dark-16.png',
      24: 'icons/toolbar-on-dark-24.png',
      32: 'icons/toolbar-on-dark-32.png',
    });
    expect(toolbarIcon(false)[16]).toBe('icons/toolbar-on-light-16.png');
  });
});

describe('followScheme', () => {
  it('sets the icon for a scheme message, and leaves every other message alone', () => {
    const { action, icons } = fakeAction();
    expect(followScheme({ type: 'scheme', dark: true }, action)).toBe(true);
    expect(followScheme({ type: 'scheme', dark: 'yes' }, action)).toBe(false);
    expect(followScheme({ type: 'other' }, action)).toBe(false);
    expect(followScheme(null, action)).toBe(false);
    expect(icons).toEqual([toolbarIcon(true)]);
  });
});

describe('watchScheme', () => {
  function fakeOffscreen(open: boolean, fails = false): { offscreen: OffscreenApi; made: unknown[] } {
    const made: unknown[] = [];
    return {
      made,
      offscreen: {
        hasDocument: () => Promise.resolve(open),
        createDocument: (parameters) => {
          made.push(parameters);
          return fails ? Promise.reject(new Error('Only a single offscreen document may be created.')) : Promise.resolve();
        },
      },
    };
  }

  it('opens the offscreen page that watches the colour scheme', async () => {
    const { offscreen, made } = fakeOffscreen(false);
    await watchScheme(offscreen);
    expect(made).toEqual([
      { url: 'theme.html', reasons: ['MATCH_MEDIA'], justification: 'Follow the colour scheme for the toolbar icon.' },
    ]);
  });

  it('opens it once', async () => {
    const { offscreen, made } = fakeOffscreen(true);
    await watchScheme(offscreen);
    expect(made).toEqual([]);
  });

  it('takes a page another start opened in the meantime', async () => {
    const { offscreen } = fakeOffscreen(false, true);
    await expect(watchScheme(offscreen)).resolves.toBeUndefined();
  });
});

describe('reportScheme', () => {
  it('reports the scheme now and on every change', () => {
    let change: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: (_type: 'change', listener: () => void) => {
        change = listener;
      },
    };
    const sent: unknown[] = [];
    reportScheme(media, (message) => {
      sent.push(message);
      return Promise.resolve();
    });
    media.matches = true;
    change?.();
    expect(sent).toEqual([
      { type: 'scheme', dark: false },
      { type: 'scheme', dark: true },
    ]);
  });
});
