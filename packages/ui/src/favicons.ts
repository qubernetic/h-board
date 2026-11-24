/**
 * The favicons the browser has already stored, as a host hands them to the page. The page knows no host: the
 * extension reads the browser's own favicon store, and nothing here fetches a site or a third party.
 */
export interface FaviconSource {
  /** Asks the browser for the permission to show its stored favicons. Called in the click, so nothing waits before it. */
  allow(): Promise<boolean>;
  /** The address of the favicon the browser stored for `url`, or `undefined` when it has none or may not show it. */
  find(url: string): Promise<string | undefined>;
}

/**
 * What the source answered for each address, so that a drawing needs no wait. An address not asked about yet is
 * asked once; `changed` hears when an answer brings a favicon.
 */
export class FaviconCache {
  private readonly known = new Map<string, string | null>();

  constructor(
    private readonly source: FaviconSource | undefined,
    private readonly changed: () => void,
  ) {}

  /** The favicon of `url` as far as it is known; asks the source the first time. */
  get(url: string): string | undefined {
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
