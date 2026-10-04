/**
 * Connection verifier port (spec 125): checks an account's credentials with
 * whichever tool the connection is for, before shep saves it and whenever
 * the user asks again.
 */

import type { ConnectionProvider } from '../../../../domain/generated/output.js';

/** Everything needed to talk to one account. */
export interface ConnectionCredentials {
  provider: ConnectionProvider;
  /** Jira site URL; unset for other tools. */
  siteUrl?: string;
  /** Jira account email; unset for other tools. */
  accountEmail?: string;
  /** API key or token. */
  secret: string;
}

export interface ConnectionAccount {
  /** Display name of the account or workspace the credentials belong to. */
  name: string;
}

export interface IConnectionVerifier {
  /** Names the account; throws ConnectionAuthError when the credentials are rejected. */
  verify(credentials: ConnectionCredentials): Promise<ConnectionAccount>;
}
