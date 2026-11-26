/**
 * Where the page stands with the user's own server:
 * - `local`: no server; the library is kept in this browser only.
 * - `setup`: connected to a server with no account yet; the setup code makes the admin.
 * - `sign-in`: connected, signed out.
 * - `forced`: signed in with a temporary password, which must be replaced before anything else.
 * - `offer`: signed in to a server whose library is empty; this browser's library can be sent to it.
 * - `signed-in`: signed in; the page shows the server's library.
 */
export type ServerStage = 'local' | 'setup' | 'sign-in' | 'forced' | 'offer' | 'signed-in';

export interface ServerState {
  readonly stage: ServerStage;
  /** The server's origin, such as `https://hboard.example.com`; there in every stage but `local`. */
  readonly address?: string;
  /** The signed-in user; there in `forced`, `offer` and `signed-in`. */
  readonly user?: { readonly name: string; readonly admin: boolean };
  /** In `offer`: what this browser's library holds. */
  readonly local?: { readonly groups: number; readonly sites: number };
}

/**
 * The host's way to the user's own server, for the settings' Server section. Every method answers once the server
 * has; a refusal rejects with an `Error` whose message the page shows as text. `connect` is called in the click, so
 * that the host can ask for the permission to reach the server.
 */
export interface ServerAccess {
  state(): ServerState;
  connect(address: string): Promise<void>;
  setup(code: string, name: string, password: string): Promise<void>;
  signIn(name: string, password: string): Promise<void>;
  changePassword(current: string, password: string): Promise<void>;
  /** In `offer`: sends this browser's library to the server, as one import. */
  send(): Promise<void>;
  /** In `offer`: keeps the server's library as it is. */
  skip(): Promise<void>;
  signOut(): Promise<void>;
  /** Forgets the server and gives back the permission to reach it: the page shows this browser's library. */
  local(): Promise<void>;
}
