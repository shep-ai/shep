/**
 * Tracker connection repository (spec 122).
 *
 * The secret (Linear API key or Jira API token) is stored encrypted next to
 * the connection and is only ever read back through {@link getSecret}; no
 * listing returns it.
 */

import type { Connection } from '../../../../domain/generated/output.js';

export interface IConnectionRepository {
  list(): Promise<Connection[]>;
  findById(id: string): Promise<Connection | null>;
  findBySlug(slug: string): Promise<Connection | null>;
  create(connection: Connection, secret: string): Promise<void>;
  /** Updates everything except the secret. */
  update(connection: Connection): Promise<void>;
  getSecret(id: string): Promise<string | null>;
  delete(id: string): Promise<void>;
}
