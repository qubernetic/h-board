/** The longest library file `library.import` reads, and the largest library as JSON, in bytes. */
export const MAX_FILE = 5_000_000;

/** How many bytes `text` takes as UTF-8, the way the extension's storage and the server keep it. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      // A pair of UTF-16 code units, one character of four bytes. JSON text holds no lone half.
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** How many bytes `value` takes as JSON. */
export function jsonBytes(value: unknown): number {
  return utf8Bytes(JSON.stringify(value));
}
