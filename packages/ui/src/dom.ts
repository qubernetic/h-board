/** Makes an element with a class and, when given, its text. Text always goes in as text, never as markup. */
export function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const px = (value: number): string => `${value}px`;

/** Puts an absolutely positioned element at x, y, with a width and a height when given. */
export function place(node: HTMLElement, x: number, y: number, w?: number, h?: number): void {
  node.style.left = px(x);
  node.style.top = px(y);
  if (w !== undefined) node.style.width = px(w);
  if (h !== undefined) node.style.height = px(h);
}

/** Two digits: 02. */
export const pad2 = (n: number): string => String(n).padStart(2, '0');
