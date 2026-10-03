/**
 * SQLite implementation of IHarnessContextRepository (spec 119).
 */
import type Database from 'better-sqlite3';
import type {
  ChunkKind,
  ChunkView,
  ChunkVisibility,
  ContextChunk,
  ContextPlan,
} from '../../../domain/generated/output.js';
import type {
  IHarnessContextRepository,
  ListChunksQuery,
} from '../../../application/ports/output/harness/index.js';
import { SqliteDocumentTable } from './sqlite-document-table.js';

const DEFAULT_CHUNK_LIMIT = 5000;

export class SQLiteHarnessContextRepository implements IHarnessContextRepository {
  private readonly chunks: SqliteDocumentTable<ContextChunk>;
  private readonly views: SqliteDocumentTable<ChunkView>;
  private readonly plans: SqliteDocumentTable<ContextPlan>;

  constructor(private readonly db: Database.Database) {
    this.chunks = new SqliteDocumentTable<ContextChunk>(db, {
      table: 'harness_chunks',
      columns: {
        session_id: (c) => c.sessionId,
        task_id: (c) => c.taskId ?? null,
        kind: (c) => c.kind,
        path: (c) => c.path ?? null,
        content_hash: (c) => c.contentHash,
        superseded_by: (c) => c.supersededBy ?? null,
      },
    });
    this.views = new SqliteDocumentTable<ChunkView>(db, {
      table: 'harness_chunk_views',
      columns: {
        chunk_id: (v) => v.chunkId,
        query_fingerprint: (v) => v.queryFingerprint,
        visibility: (v) => v.visibility,
        renderer_id: (v) => v.rendererId,
      },
    });
    this.plans = new SqliteDocumentTable<ContextPlan>(db, {
      table: 'harness_context_plans',
      columns: {
        task_id: (p) => p.taskId,
        turn: (p) => p.turn,
        shadow: (p) => (p.shadow ? 1 : 0),
      },
    });
  }

  async putChunk(chunk: ContextChunk): Promise<void> {
    this.chunks.upsert(chunk);
  }

  async getChunk(id: string): Promise<ContextChunk | null> {
    return this.chunks.get(id);
  }

  async getChunks(ids: readonly string[]): Promise<ContextChunk[]> {
    if (ids.length === 0) return [];
    const found = this.chunks.query(
      `SELECT data FROM harness_chunks WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ...ids
    );
    const byId = new Map(found.map((c) => [c.id, c]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  async listChunks(query: ListChunksQuery): Promise<ContextChunk[]> {
    const where = ['session_id = ?'];
    const params: unknown[] = [query.sessionId];
    if (query.taskId) {
      where.push('task_id = ?');
      params.push(query.taskId);
    }
    if (query.kinds?.length) {
      where.push(`kind IN (${query.kinds.map(() => '?').join(', ')})`);
      params.push(...query.kinds);
    }
    if (!query.includeSuperseded) where.push('superseded_by IS NULL');
    return this.chunks.query(
      `SELECT data FROM harness_chunks WHERE ${where.join(' AND ')}
       ORDER BY created_at ASC, rowid ASC LIMIT ?`,
      ...params,
      query.limit ?? DEFAULT_CHUNK_LIMIT
    );
  }

  async findLatestChunkByPath(
    sessionId: string,
    path: string,
    kind: ChunkKind
  ): Promise<ContextChunk | null> {
    return this.chunks.queryOne(
      `SELECT data FROM harness_chunks
       WHERE session_id = ? AND path = ? AND kind = ? AND superseded_by IS NULL
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      sessionId,
      path,
      kind
    );
  }

  async markSuperseded(oldId: string, newId: string): Promise<void> {
    const tx = this.db.transaction(() => {
      const older = this.chunks.get(oldId);
      const newer = this.chunks.get(newId);
      if (older) this.chunks.upsert({ ...older, supersededBy: newId });
      if (newer) this.chunks.upsert({ ...newer, supersedes: oldId });
    });
    tx();
  }

  async putView(view: ChunkView): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM harness_chunk_views
         WHERE chunk_id = ? AND query_fingerprint = ? AND visibility = ? AND renderer_id = ? AND id != ?`
      )
      .run(view.chunkId, view.queryFingerprint, view.visibility, view.rendererId, view.id);
    this.views.upsert(view);
  }

  async findView(
    chunkId: string,
    queryFingerprint: string,
    visibility: ChunkVisibility,
    rendererId: string
  ): Promise<ChunkView | null> {
    return this.views.queryOne(
      `SELECT data FROM harness_chunk_views
       WHERE chunk_id = ? AND query_fingerprint = ? AND visibility = ? AND renderer_id = ?`,
      chunkId,
      queryFingerprint,
      visibility,
      rendererId
    );
  }

  async putPlan(plan: ContextPlan): Promise<void> {
    this.plans.upsert(plan);
  }

  async getPlan(id: string): Promise<ContextPlan | null> {
    return this.plans.get(id);
  }

  async listPlans(taskId: string): Promise<ContextPlan[]> {
    return this.plans.query(
      'SELECT data FROM harness_context_plans WHERE task_id = ? ORDER BY turn ASC, shadow ASC, created_at ASC',
      taskId
    );
  }
}
