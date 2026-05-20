/**
 * SQLiteScanRunRepository round-trip integration test (Phase 11, task-70).
 *
 * Verifies:
 *   - save → findById round-trips a multi-stage ScanRun including JSON stages
 *   - upsert semantics: same id overwrites status/finished_at/stages
 *   - listLatestForApplication returns rows in descending startedAt order
 *   - findLatestForApplication returns the most recent row
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteScanRunRepository } from '@/infrastructure/repositories/aspm/sqlite-scan-run-repository.js';
import {
  ScanStageName,
  ScanStageStatus,
  ScanStatus,
  ScanTrigger,
  type ScanRun,
} from '@/domain/generated/output.js';

function makeRun(overrides: Partial<ScanRun> = {}): ScanRun {
  const now = new Date('2026-05-20T15:00:00.000Z');
  return {
    id: randomUUID(),
    applicationId: randomUUID(),
    triggeredBy: ScanTrigger.User,
    status: ScanStatus.Running,
    startedAt: now,
    stages: [{ name: ScanStageName.Sbom, status: ScanStageStatus.Running, startedAt: now }],
    findingsCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SQLiteScanRunRepository', () => {
  let db: Database.Database;
  let repo: SQLiteScanRunRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteScanRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips a multi-stage ScanRun', async () => {
    const run = makeRun({
      stages: [
        {
          name: ScanStageName.Sbom,
          status: ScanStageStatus.Succeeded,
          findingsCount: 0,
          componentsCount: 42,
        },
        { name: ScanStageName.Secrets, status: ScanStageStatus.Failed, errorMessage: 'I/O' },
      ],
    });

    await repo.save(run);
    const fetched = await repo.findById(run.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.stages).toHaveLength(2);
    expect(fetched!.stages[0]!.componentsCount).toBe(42);
    expect(fetched!.stages[1]!.errorMessage).toBe('I/O');
  });

  it('upserts on save (overwrites status + finished_at + stages on same id)', async () => {
    const initial = makeRun({
      status: ScanStatus.Running,
      stages: [{ name: ScanStageName.Sbom, status: ScanStageStatus.Running }],
    });
    await repo.save(initial);

    const finishedAt = new Date('2026-05-20T15:05:00.000Z');
    const updated: ScanRun = {
      ...initial,
      status: ScanStatus.Succeeded,
      finishedAt,
      stages: [
        {
          name: ScanStageName.Sbom,
          status: ScanStageStatus.Succeeded,
          finishedAt,
          findingsCount: 0,
        },
      ],
      findingsCount: 0,
      updatedAt: finishedAt,
    };
    await repo.save(updated);

    const fetched = await repo.findById(initial.id);
    expect(fetched!.status).toBe(ScanStatus.Succeeded);
    expect(fetched!.finishedAt).toEqual(finishedAt);
    expect(fetched!.stages[0]!.status).toBe(ScanStageStatus.Succeeded);
  });

  it('lists latest runs per application in descending startedAt order', async () => {
    const applicationId = randomUUID();
    const older = makeRun({ applicationId, startedAt: new Date('2026-05-19T10:00:00.000Z') });
    const newer = makeRun({ applicationId, startedAt: new Date('2026-05-20T10:00:00.000Z') });
    await repo.save(older);
    await repo.save(newer);

    const list = await repo.listLatestForApplication(applicationId, 5);
    expect(list.map((r) => r.id)).toEqual([newer.id, older.id]);

    const latest = await repo.findLatestForApplication(applicationId);
    expect(latest!.id).toBe(newer.id);
  });

  it('returns null when there are no runs for an application', async () => {
    const latest = await repo.findLatestForApplication(randomUUID());
    expect(latest).toBeNull();
  });
});
