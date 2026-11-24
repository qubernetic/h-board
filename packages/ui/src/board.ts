import type { Library } from '@h-board/core';

/**
 * Draws the library into `root`. Names and addresses are the user's data: they go in as text,
 * never as markup.
 */
export function renderBoard(root: HTMLElement, library: Library): void {
  const doc = root.ownerDocument;
  const heading = doc.createElement('h1');
  heading.textContent = 'H-Board';
  const nodes: HTMLElement[] = [heading];

  if (library.groups.length === 0) {
    const empty = doc.createElement('p');
    empty.dataset['empty'] = '';
    empty.textContent = 'No groups yet.';
    nodes.push(empty);
  }

  for (const group of library.groups) {
    const section = doc.createElement('section');
    const title = doc.createElement('h2');
    title.textContent = group.name;
    const list = doc.createElement('ul');
    for (const site of group.sites) {
      const item = doc.createElement('li');
      const link = doc.createElement('a');
      link.textContent = site.name;
      if (isWebAddress(site.url)) link.href = site.url;
      item.append(link);
      list.append(item);
    }
    section.append(title, list);
    nodes.push(section);
  }

  root.replaceChildren(...nodes);
}

function isWebAddress(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
