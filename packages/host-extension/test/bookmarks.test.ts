import { describe, expect, it } from 'vitest';
import { bookmarkGroups, readBookmarks } from '../src/index';
import type { BookmarkNode } from '../src/index';

/** A tree as `chrome.bookmarks.getTree` gives it: a root without a title, then the browser's own folders. */
const tree: BookmarkNode[] = [
  {
    title: '',
    children: [
      {
        title: 'Bookmarks bar',
        children: [
          { title: 'Mail', url: 'https://mail.example.com/' },
          { title: '  ', url: 'https://news.example.org/today' },
          { title: 'Run me', url: 'javascript:alert(1)' },
          { title: 'Settings', url: 'chrome://settings/' },
          { title: 'Broken', url: 'http://[oops/' },
          {
            title: '  Work ',
            children: [
              { title: 'Tracker', url: 'http://tracker.example.com:8080/board' },
              { title: 'Empty', children: [] },
            ],
          },
        ],
      },
      { title: 'Other bookmarks', children: [{ title: 'Only a file', url: 'file:///home/notes.txt' }] },
      { title: 'Mobile bookmarks', children: [] },
    ],
  },
];

describe('bookmarkGroups', () => {
  it('makes one group of every folder that holds links, in the order of the tree', () => {
    expect(bookmarkGroups(tree)).toEqual([
      {
        name: 'Bookmarks bar',
        sites: [
          { name: 'Mail', url: 'https://mail.example.com/' },
          { name: 'news.example.org', url: 'https://news.example.org/today' },
        ],
      },
      { name: 'Work', sites: [{ name: 'Tracker', url: 'http://tracker.example.com:8080/board' }] },
    ]);
  });

  it('names a folder without a title, and cuts long titles to what core takes', () => {
    const long = 'x'.repeat(300);
    const [group] = bookmarkGroups([{ title: ' ', children: [{ title: long, url: 'https://a.example.com/' }] }]);
    expect(group?.name).toBe('Bookmarks');
    expect(group?.sites[0]?.name).toHaveLength(200);
  });

  it('leaves out an address longer than core takes', () => {
    const url = `https://a.example.com/${'p'.repeat(2048)}`;
    expect(bookmarkGroups([{ title: 'Long', children: [{ title: 'Long', url }] }])).toEqual([]);
  });
});

describe('readBookmarks', () => {
  it('asks for the bookmarks permission, then reads the tree', async () => {
    const asked: unknown[] = [];
    const groups = await readBookmarks({
      request: (permissions) => {
        asked.push(permissions);
        return Promise.resolve(true);
      },
      tree: () => Promise.resolve(tree),
    });
    expect(asked).toEqual([{ permissions: ['bookmarks'] }]);
    expect(groups?.map((group) => group.name)).toEqual(['Bookmarks bar', 'Work']);
  });

  it('reads nothing when the user refuses', async () => {
    let read = false;
    const groups = await readBookmarks({
      request: () => Promise.resolve(false),
      tree: () => {
        read = true;
        return Promise.resolve(tree);
      },
    });
    expect(groups).toBeUndefined();
    expect(read).toBe(false);
  });
});
