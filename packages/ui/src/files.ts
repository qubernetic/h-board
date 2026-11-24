import { pad2 } from './dom';

/** The name of an exported library: `h-board-2026-11-23.json`, by the local day. */
export function exportName(now: Date): string {
  return `h-board-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`;
}

/** Saves `text` as the file `name` through the browser's downloads: a link to a blob, clicked once. */
export function downloadFile(doc: Document, name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  doc.body.append(link);
  link.click();
  link.remove();
  // the download has started by then; the mock waits as long
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
