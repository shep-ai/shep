/**
 * Migration 141: Create archived_agent_sessions table.
 *
 * Records which agent CLI sessions the user has archived (spec 106).
 *
 * Agent sessions are read from provider storage (~/.claude/projects,
 * ~/.cursor/projects) and are deliberately NOT shep database rows. Rather than
 * materialise every discovered session just to carry an `archived` flag — which
 * would invert that invariant and create a sync problem — this is a sparse
 * marker table holding only the archived ones. Unarchiving deletes the row,
 * which is what makes the reversibility guarantee structural: archiving never
 * touches a provider file, so there is nothing to restore.
 *
 * Columns:
 *  - agent_type   TEXT NOT NULL — AgentType that owns the session
 *  - session_id   TEXT NOT NULL — provider-native session id
 *  - archived_at  TEXT NOT NULL — ISO 8601 timestamp
 *
 * Primary key is (agent_type, session_id): session ids are only unique within a
 * provider, and one row per archived session must be idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS archived_agent_sessions (
      agent_type  TEXT NOT NULL,
      session_id  TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      PRIMARY KEY (agent_type, session_id)
    )
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
