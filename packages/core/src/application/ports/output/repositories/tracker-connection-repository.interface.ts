/**
 * Tracker connection repository (spec 122).
 *
 * The secret (Linear API key or Jira API token) is stored encrypted next to
 * the connection and is only ever read back through {@link getSecret}; no
 * listing returns it.
 */

import type { TrackerConnection } from '../../../../domain/generated/output.js';

export interface ITrackerConnectionRepository {
  list(): Promise<TrackerConnection[]>;
  findById(id: string): Promise<TrackerConnection | null>;
  findBySlug(slug: string): Promise<TrackerConnection | null>;
  create(connection: TrackerConnection, secret: string): Promise<void>;
  /** Updates everything except the secret. */
  update(connection: TrackerConnection): Promise<void>;
  getSecret(id: string): Promise<string | null>;
  delete(id: string): Promise<void>;
}
