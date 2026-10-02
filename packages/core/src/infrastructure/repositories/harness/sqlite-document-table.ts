/**
 * Shared helper for harness tables that store an entity as a JSON document
 * (`data`) plus a few indexed columns (spec 119, migrations 148–150).
 *
 * Dates inside entities (createdAt, updatedAt, startedAt, …) are serialized as
 * ISO strings and revived on read, so callers always get `Date` objects back
 * for the BaseEntity timestamps.
 */
import type Database from 'better-sqlite3';

/** Entity timestamp fields revived from ISO strings on read. */
const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'startedAt', 'completedAt']);

export type ColumnValue = string | number | null;

export interface DocumentTableConfig<T> {
  table: string;
  /** Extra indexed columns (besides id, data, created_at, updated_at). */
  columns: Record<string, (entity: T) => ColumnValue>;
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  return Date.now();
}

export function serializeDocument(entity: object): string {
  return JSON.stringify(entity);
}

export function deserializeDocument<T>(data: string): T {
  return JSON.parse(data, (key, value) =>
    DATE_FIELDS.has(key) && typeof value === 'string' ? new Date(value) : value
  ) as T;
}

/**
 * A thin, typed wrapper around one document table. Upsert semantics: writing
 * an entity with an existing id replaces it (entities are immutable records
 * or whole-object updates; partial column updates go through dedicated SQL).
 */
export class SqliteDocumentTable<
  T extends { id: string; createdAt?: unknown; updatedAt?: unknown },
> {
  private readonly upsertStmt: Database.Statement;
  private readonly getStmt: Database.Statement;

  constructor(
    readonly db: Database.Database,
    private readonly config: DocumentTableConfig<T>
  ) {
    const cols = Object.keys(config.columns);
    const all = ['id', ...cols, 'data', 'created_at', 'updated_at'];
    const updates = [...cols, 'data', 'updated_at'].map((c) => `${c} = excluded.${c}`).join(', ');
    this.upsertStmt = db.prepare(
      `INSERT INTO ${config.table} (${all.join(', ')}) VALUES (${all.map((c) => `@${c}`).join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${updates}`
    );
    this.getStmt = db.prepare(`SELECT data FROM ${config.table} WHERE id = ?`);
  }

  upsert(entity: T): void {
    const params: Record<string, ColumnValue> = {
      id: entity.id,
      data: serializeDocument(entity),
      created_at: toMillis(entity.createdAt),
      updated_at: toMillis(entity.updatedAt ?? entity.createdAt),
    };
    for (const [col, read] of Object.entries(this.config.columns)) params[col] = read(entity);
    this.upsertStmt.run(params);
  }

  get(id: string): T | null {
    const row = this.getStmt.get(id) as { data: string } | undefined;
    return row ? deserializeDocument<T>(row.data) : null;
  }

  /** Run a SELECT that returns a `data` column and deserialize every row. */
  query(sql: string, ...params: unknown[]): T[] {
    const rows = this.db.prepare(sql).all(...params) as { data: string }[];
    return rows.map((r) => deserializeDocument<T>(r.data));
  }

  queryOne(sql: string, ...params: unknown[]): T | null {
    const row = this.db.prepare(sql).get(...params) as { data: string } | undefined;
    return row ? deserializeDocument<T>(row.data) : null;
  }
}
