/**
 * SQLite implementation of IHarnessSessionRepository (spec 119).
 */
import type Database from 'better-sqlite3';
import type {
  HarnessSession,
  HarnessTask,
  RepoSnapshot,
} from '../../../domain/generated/output.js';
import type {
  IHarnessSessionRepository,
  ListHarnessSessionsQuery,
} from '../../../application/ports/output/harness/index.js';
import { SqliteDocumentTable } from './sqlite-document-table.js';

const DEFAULT_SESSION_LIMIT = 100;

export class SQLiteHarnessSessionRepository implements IHarnessSessionRepository {
  private readonly sessions: SqliteDocumentTable<HarnessSession>;
  private readonly tasks: SqliteDocumentTable<HarnessTask>;
  private readonly snapshots: SqliteDocumentTable<RepoSnapshot>;

  constructor(db: Database.Database) {
    this.sessions = new SqliteDocumentTable<HarnessSession>(db, {
      table: 'harness_sessions',
      columns: {
        status: (s) => s.status,
        origin: (s) => s.origin,
        agent_run_id: (s) => s.agentRunId ?? null,
        feature_id: (s) => s.featureId ?? null,
      },
    });
    this.tasks = new SqliteDocumentTable<HarnessTask>(db, {
      table: 'harness_tasks',
      columns: {
        session_id: (t) => t.sessionId,
        parent_task_id: (t) => t.parentTaskId ?? null,
        status: (t) => t.status,
        dedupe_key: (t) => t.dedupeKey,
      },
    });
    this.snapshots = new SqliteDocumentTable<RepoSnapshot>(db, {
      table: 'harness_repo_snapshots',
      columns: { session_id: (s) => s.sessionId },
    });
  }

  async createSession(session: HarnessSession): Promise<void> {
    this.sessions.upsert(session);
  }

  async updateSession(session: HarnessSession): Promise<void> {
    this.sessions.upsert(session);
  }

  async getSession(id: string): Promise<HarnessSession | null> {
    return this.sessions.get(id);
  }

  async findSessionByAgentRun(agentRunId: string): Promise<HarnessSession | null> {
    return this.sessions.queryOne(
      'SELECT data FROM harness_sessions WHERE agent_run_id = ? ORDER BY created_at DESC LIMIT 1',
      agentRunId
    );
  }

  async listSessions(query: ListHarnessSessionsQuery = {}): Promise<HarnessSession[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.origins?.length) {
      where.push(`origin IN (${query.origins.map(() => '?').join(', ')})`);
      params.push(...query.origins);
    }
    if (query.featureId) {
      where.push('feature_id = ?');
      params.push(query.featureId);
    }
    const sql = `SELECT data FROM harness_sessions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY updated_at DESC LIMIT ?`;
    return this.sessions.query(sql, ...params, query.limit ?? DEFAULT_SESSION_LIMIT);
  }

  async createTask(task: HarnessTask): Promise<void> {
    this.tasks.upsert(task);
  }

  async updateTask(task: HarnessTask): Promise<void> {
    this.tasks.upsert(task);
  }

  async getTask(id: string): Promise<HarnessTask | null> {
    return this.tasks.get(id);
  }

  async listTasks(sessionId: string): Promise<HarnessTask[]> {
    return this.tasks.query(
      'SELECT data FROM harness_tasks WHERE session_id = ? ORDER BY created_at ASC, rowid ASC',
      sessionId
    );
  }

  async putSnapshot(snapshot: RepoSnapshot): Promise<void> {
    this.snapshots.upsert(snapshot);
  }

  async getSnapshot(id: string): Promise<RepoSnapshot | null> {
    return this.snapshots.get(id);
  }

  async latestSnapshot(sessionId: string): Promise<RepoSnapshot | null> {
    return this.snapshots.queryOne(
      'SELECT data FROM harness_repo_snapshots WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      sessionId
    );
  }
}
