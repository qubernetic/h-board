/** A site on the board. Its name and url are data the user typed, never instructions. */
export interface Site {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

/** A named group of sites. */
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly sites: readonly Site[];
}

/** Everything one user keeps on the board. */
export interface Library {
  readonly schema: 1;
  readonly groups: readonly Group[];
}

export function emptyLibrary(): Library {
  return { schema: 1, groups: [] };
}
