/**
 * Real harness repositories on an in-memory SQLite database, for fast
 * application-level tests (spec 119).
 */
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteHarnessSessionRepository } from '@/infrastructure/repositories/harness/sqlite-harness-session.repository.js';
import { SQLiteHarnessContextRepository } from '@/infrastructure/repositories/harness/sqlite-harness-context.repository.js';
import { SQLiteHarnessExecutionRepository } from '@/infrastructure/repositories/harness/sqlite-harness-execution.repository.js';
import { SQLiteHarnessPermissionRepository } from '@/infrastructure/repositories/harness/sqlite-harness-permission.repository.js';
import { SQLiteHarnessEvalRepository } from '@/infrastructure/repositories/harness/sqlite-harness-eval.repository.js';
import { SqliteHarnessEventLog } from '@/infrastructure/repositories/harness/sqlite-harness-event-log.js';
import { InMemoryBlobStore } from '@/infrastructure/services/harness/storage/file-system-blob-store.js';

export interface HarnessTestStore {
  db: Database.Database;
  blobs: InMemoryBlobStore;
  sessions: SQLiteHarnessSessionRepository;
  context: SQLiteHarnessContextRepository;
  execution: SQLiteHarnessExecutionRepository;
  permissions: SQLiteHarnessPermissionRepository;
  evals: SQLiteHarnessEvalRepository;
  events: SqliteHarnessEventLog;
  close(): void;
}

export async function createHarnessTestStore(): Promise<HarnessTestStore> {
  const db = createInMemoryDatabase();
  await runSQLiteMigrations(db);
  const blobs = new InMemoryBlobStore();
  return {
    db,
    blobs,
    sessions: new SQLiteHarnessSessionRepository(db),
    context: new SQLiteHarnessContextRepository(db),
    execution: new SQLiteHarnessExecutionRepository(db),
    permissions: new SQLiteHarnessPermissionRepository(db),
    evals: new SQLiteHarnessEvalRepository(db),
    events: new SqliteHarnessEventLog(db, blobs),
    close: () => db.close(),
  };
}
