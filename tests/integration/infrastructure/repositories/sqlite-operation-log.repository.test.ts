/**
 * SQLiteOperationLogRepository integration tests.
 * In-memory SQLite + full migration chain (migration 062 creates the table).
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteOperationLogRepository } from '@/infrastructure/repositories/sqlite-operation-log.repository.js';
import { OperationLogKind, OperationLogLevel } from '@/domain/generated/output.js';

describe('SQLiteOperationLogRepository', () => {
  let db: Database.Database;
  let repo: SQLiteOperationLogRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteOperationLogRepository(db);
  });

  it('creates the operation_log_entries table via migration 062', () => {
    expect(tableExists(db, 'operation_log_entries')).toBe(true);
  });

  it('append persists an entry and returns it with id + timestamps', async () => {
    const entry = await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Info,
      message: 'Starting deploy',
    });
    expect(entry.id).toBeTruthy();
    expect(entry.operationKind).toBe(OperationLogKind.CloudDeploy);
    expect(entry.message).toBe('Starting deploy');
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('listByScope returns entries oldest first, filtered by (kind, id)', async () => {
    await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Info,
      message: 'a',
    });
    await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Warn,
      message: 'b',
    });
    // Different scope — should be excluded.
    await repo.append({
      operationKind: OperationLogKind.GitRemoteCreate,
      operationId: 'app-1',
      level: OperationLogLevel.Info,
      message: 'c (different kind)',
    });
    await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-2',
      level: OperationLogLevel.Info,
      message: 'd (different id)',
    });

    const entries = await repo.listByScope(OperationLogKind.CloudDeploy, 'app-1');
    expect(entries.map((e) => e.message)).toEqual(['a', 'b']);
  });

  it('persists and reads back the detail column', async () => {
    await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Error,
      message: 'failed',
      detail: 'line 1\nline 2\nline 3',
    });
    const entries = await repo.listByScope(OperationLogKind.CloudDeploy, 'app-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toBe('line 1\nline 2\nline 3');
  });

  it('pruneBefore deletes rows older than the given timestamp', async () => {
    const cutoff = Date.now();
    // Insert one entry, then advance the cutoff forward in time.
    await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Info,
      message: 'old',
    });
    const deleted = await repo.pruneBefore(cutoff + 60_000);
    expect(deleted).toBe(1);
    expect(await repo.listByScope(OperationLogKind.CloudDeploy, 'app-1')).toHaveLength(0);
  });
});
