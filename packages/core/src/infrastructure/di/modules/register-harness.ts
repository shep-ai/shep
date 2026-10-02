/**
 * DI registrations for the query-aware agent harness (spec 119).
 *
 * Every harness port is registered under its HARNESS_TOKENS string token.
 * Registrations are lazy factories: nothing touches the filesystem until a
 * harness component is first resolved.
 */
import { join } from 'node:path';
import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import {
  HARNESS_TOKENS,
  type IBlobStore,
  type IHarnessContextRepository,
  type IHarnessEvalRepository,
  type IHarnessEventLog,
  type IHarnessExecutionRepository,
  type IHarnessPermissionRepository,
  type IHarnessSessionRepository,
  type IRepoSnapshotter,
} from '../../../application/ports/output/harness/index.js';
import { getShepHomeDir } from '../../services/filesystem/shep-directory.service.js';
import { FileSystemBlobStore } from '../../services/harness/storage/file-system-blob-store.js';
import { GitRepoSnapshotter } from '../../services/harness/git-repo-snapshotter.js';
import { SQLiteHarnessSessionRepository } from '../../repositories/harness/sqlite-harness-session.repository.js';
import { SQLiteHarnessContextRepository } from '../../repositories/harness/sqlite-harness-context.repository.js';
import { SQLiteHarnessExecutionRepository } from '../../repositories/harness/sqlite-harness-execution.repository.js';
import { SQLiteHarnessPermissionRepository } from '../../repositories/harness/sqlite-harness-permission.repository.js';
import { SQLiteHarnessEvalRepository } from '../../repositories/harness/sqlite-harness-eval.repository.js';
import { SqliteHarnessEventLog } from '../../repositories/harness/sqlite-harness-event-log.js';

/** Directory (under SHEP_HOME) holding content-addressed harness blobs. */
export const HARNESS_OBJECTS_DIR = 'objects';

export function registerHarness(container: DependencyContainer): void {
  const db = (c: DependencyContainer) => c.resolve<Database.Database>('Database');

  // ─── Storage ─────────────────────────────────────────────────────────────
  let blobStore: IBlobStore | undefined;
  container.register<IBlobStore>(HARNESS_TOKENS.BlobStore, {
    useFactory: () =>
      (blobStore ??= new FileSystemBlobStore(join(getShepHomeDir(), HARNESS_OBJECTS_DIR))),
  });
  container.register<IRepoSnapshotter>(HARNESS_TOKENS.RepoSnapshotter, {
    useFactory: () => new GitRepoSnapshotter(),
  });

  // ─── Repositories ────────────────────────────────────────────────────────
  container.register<IHarnessSessionRepository>(HARNESS_TOKENS.SessionRepository, {
    useFactory: (c) => new SQLiteHarnessSessionRepository(db(c)),
  });
  container.register<IHarnessContextRepository>(HARNESS_TOKENS.ContextRepository, {
    useFactory: (c) => new SQLiteHarnessContextRepository(db(c)),
  });
  container.register<IHarnessExecutionRepository>(HARNESS_TOKENS.ExecutionRepository, {
    useFactory: (c) => new SQLiteHarnessExecutionRepository(db(c)),
  });
  container.register<IHarnessPermissionRepository>(HARNESS_TOKENS.PermissionRepository, {
    useFactory: (c) => new SQLiteHarnessPermissionRepository(db(c)),
  });
  container.register<IHarnessEvalRepository>(HARNESS_TOKENS.EvalRepository, {
    useFactory: (c) => new SQLiteHarnessEvalRepository(db(c)),
  });
  container.register<IHarnessEventLog>(HARNESS_TOKENS.EventLog, {
    useFactory: (c) =>
      new SqliteHarnessEventLog(db(c), c.resolve<IBlobStore>(HARNESS_TOKENS.BlobStore)),
  });
}
