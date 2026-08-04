/**
 * Archived Session Repository Interface
 *
 * Output port for the sparse set of agent sessions the user has archived.
 *
 * Agent sessions live in provider storage and are not shep database rows, so
 * this port stores only the archived exceptions rather than materialising every
 * discovered session. Unarchiving removes the marker, which is why archiving is
 * reversible by construction and never touches a provider file.
 */

import type { AgentType } from '../../../../domain/generated/output.js';

/** Identifies one session within its provider. */
export interface ArchivedSessionKey {
  agentType: AgentType | string;
  sessionId: string;
}

export interface IArchivedSessionRepository {
  /**
   * Mark a session as archived. Idempotent — archiving an already-archived
   * session leaves a single marker and does not throw.
   */
  archive(key: ArchivedSessionKey): Promise<void>;

  /**
   * Remove a session's archive marker. Idempotent — unarchiving a session that
   * was never archived is a no-op.
   */
  unarchive(key: ArchivedSessionKey): Promise<void>;

  /** Whether the given session is archived. */
  isArchived(key: ArchivedSessionKey): Promise<boolean>;

  /**
   * All archived session ids for one provider, as a set for O(1) membership
   * tests while building the session tree.
   */
  listArchivedIds(agentType: AgentType | string): Promise<Set<string>>;

  /**
   * All archived session ids across every provider, keyed by agent type.
   * Used by the tree, which spans providers in a single pass.
   */
  listAllArchivedIds(): Promise<Map<string, Set<string>>>;
}
