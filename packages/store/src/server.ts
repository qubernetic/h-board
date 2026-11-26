/** The longest server address taken, as for a site. */
const MAX_ADDRESS = 2048;

/** The hosts that may be reached over plain http: this computer, where nothing crosses a network. */
const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

const REFUSED = 'server: must be an https address';

/**
 * The address of the user's own server, such as `https://board.example.org` or `https://example.org/h-board`
 * behind a reverse proxy, without its trailing slash. Only https, or http to this computer (`localhost`,
 * `127.0.0.0/8`, `[::1]`), so that a password or a key never crosses a network in clear text; no name or password,
 * no query and no fragment. Throws an `Error` that names the field and never repeats the value.
 */
export function checkServer(value: string): string {
  if (value.length > MAX_ADDRESS) throw new Error(`server: must be at most ${MAX_ADDRESS} characters`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(REFUSED);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) throw new Error(REFUSED);
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') throw new Error(REFUSED);
  // `?` and `#` alone leave `search` and `hash` empty
  if (/[?#]/.test(value)) throw new Error(REFUSED);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
