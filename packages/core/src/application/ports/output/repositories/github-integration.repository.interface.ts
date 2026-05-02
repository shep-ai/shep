/**
 * GitHub Integration Repository (port)
 *
 * Stores a single GitHub Personal Access Token, encrypted-at-rest using
 * LocalSecretBox. Used by the terminal-spawn path to inject GH_TOKEN /
 * GITHUB_TOKEN env vars so `gh`, `git`, and other git-aware tools auth
 * automatically inside shep.
 */

export interface GithubIntegrationStatus {
  connected: boolean;
  /** When the token was first stored (ms epoch). null when not connected. */
  connectedAt: number | null;
  /** When the token was last replaced (ms epoch). null when not connected. */
  updatedAt: number | null;
}

export interface IGithubIntegrationRepository {
  /** Return the decrypted PAT, or null if no token is stored. */
  get(): Promise<string | null>;

  /** Store (or replace) the PAT. Encrypted before write. */
  set(token: string): Promise<void>;

  /** Remove the stored PAT. No-op if none exists. */
  remove(): Promise<void>;

  /** Cheap status read — does not decrypt the token. */
  getStatus(): Promise<GithubIntegrationStatus>;
}
