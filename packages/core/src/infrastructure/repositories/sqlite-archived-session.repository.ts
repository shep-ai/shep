/**
 * SQLite Archived Session Repository
 *
 * Stores the sparse set of archived agent sessions in archived_agent_sessions
 * (migration 141). Archive is an upsert-shaped INSERT OR REPLACE and unarchive
 * is a DELETE, so both operations are naturally idempotent.
 */

import { injectable } from 'tsyringe';
import type Database from 'better-sqlite3';
import type { AgentType } from '../../domain/generated/output.js';
import type {
  ArchivedSessionKey,
  IArchivedSessionRepository,
} from '../../application/ports/output/repositories/archived-session.repository.interface.js';

interface ArchivedRow {
  agent_type: string;
  session_id: string;
}

@injectable()
export class SQLiteArchivedSessionRepository implements IArchivedSessionRepository {
  constructor(private readonly db: Database.Database) {}

  async archive(key: ArchivedSessionKey): Promise<void> {
    // INSERT OR REPLACE keeps archiving idempotent while refreshing the
    // timestamp, so re-archiving records when it last happened.
    this.db
      .prepare(
        `INSERT OR REPLACE INTO archived_agent_sessions (agent_type, session_id, archived_at)
         VALUES (?, ?, ?)`
      )
      .run(String(key.agentType), key.sessionId, new Date().toISOString());
  }

  async unarchive(key: ArchivedSessionKey): Promise<void> {
    this.db
      .prepare('DELETE FROM archived_agent_sessions WHERE agent_type = ? AND session_id = ?')
      .run(String(key.agentType), key.sessionId);
  }

  async isArchived(key: ArchivedSessionKey): Promise<boolean> {
    const row = this.db
      .prepare(
        'SELECT 1 AS present FROM archived_agent_sessions WHERE agent_type = ? AND session_id = ?'
      )
      .get(String(key.agentType), key.sessionId);

    return row !== undefined;
  }

  async listArchivedIds(agentType: AgentType | string): Promise<Set<string>> {
    const rows = this.db
      .prepare('SELECT session_id FROM archived_agent_sessions WHERE agent_type = ?')
      .all(String(agentType)) as { session_id: string }[];

    return new Set(rows.map((r) => r.session_id));
  }

  async listAllArchivedIds(): Promise<Map<string, Set<string>>> {
    const rows = this.db
      .prepare('SELECT agent_type, session_id FROM archived_agent_sessions')
      .all() as ArchivedRow[];

    const byAgentType = new Map<string, Set<string>>();
    for (const row of rows) {
      const existing = byAgentType.get(row.agent_type);
      if (existing) {
        existing.add(row.session_id);
      } else {
        byAgentType.set(row.agent_type, new Set([row.session_id]));
      }
    }

    return byAgentType;
  }
}
