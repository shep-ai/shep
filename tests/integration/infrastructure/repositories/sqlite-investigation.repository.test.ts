/**
 * Investigation repository (spec 123): migration 155, every field
 * round-tripped through both the insert and the update column lists, and
 * newest-first listing per work item.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/155-create-work-item-investigations.js';
import { SQLiteInvestigationRepository } from '@/infrastructure/repositories/sqlite-investigation.repository.js';
import {
  AgentType,
  HypothesisConfidence,
  InvestigationStatus,
  type WorkItemInvestigation,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

const PENDING: WorkItemInvestigation = {
  id: 'inv-1',
  workItemId: 'item-1',
  repositoryPath: '/src/pay',
  status: InvestigationStatus.Pending,
  hypotheses: [],
  createdAt: T1,
  updatedAt: T1,
};

const COMPLETED: WorkItemInvestigation = {
  ...PENDING,
  commitSha: 'abc123',
  status: InvestigationStatus.Completed,
  summary: 'The session loads late.',
  hypotheses: [
    {
      number: 1,
      title: 'Null session',
      rootCause: 'Reads user before load',
      confidence: HypothesisConfidence.High,
      evidence: [
        { file: 'src/a.ts', line: 3, note: 'here' },
        { file: 'src/b.ts', note: 'and here' },
      ],
      testPlan: 'Call without a session',
      fixPlan: 'Guard it',
    },
  ],
  agentType: AgentType.ClaudeCode,
  error: 'none really',
  startedAt: T1,
  finishedAt: T2,
  approvedHypothesisNumber: 1,
  featureId: 'feat-1',
  updatedAt: T2,
};

describe('SQLiteInvestigationRepository', () => {
  let db: Database.Database;
  let repo: SQLiteInvestigationRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteInvestigationRepository(db);
  });

  afterEach(() => db.close());

  it('migration 155 is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips a minimal investigation', async () => {
    await repo.create(PENDING);
    expect(await repo.findById(PENDING.id)).toEqual(PENDING);
  });

  it('round-trips every field on insert and on update', async () => {
    await repo.create(COMPLETED);
    expect(await repo.findById(COMPLETED.id)).toEqual(COMPLETED);

    await repo.create({ ...PENDING, id: 'inv-2' });
    await repo.update({ ...COMPLETED, id: 'inv-2' });
    expect(await repo.findById('inv-2')).toEqual({ ...COMPLETED, id: 'inv-2' });
  });

  it('clears optional fields on update', async () => {
    await repo.create(COMPLETED);
    await repo.update(PENDING);
    expect(await repo.findById(PENDING.id)).toEqual(PENDING);
  });

  it('stores repository paths with forward slashes', async () => {
    await repo.create({ ...PENDING, repositoryPath: 'C:\\src\\pay' });
    expect((await repo.findById(PENDING.id))?.repositoryPath).toBe('C:/src/pay');
  });

  it('lists a work item investigations newest first', async () => {
    await repo.create(PENDING);
    await repo.create({ ...PENDING, id: 'inv-2', createdAt: T2, updatedAt: T2 });
    await repo.create({ ...PENDING, id: 'inv-3', workItemId: 'item-2' });
    expect((await repo.listByWorkItem('item-1')).map((i) => i.id)).toEqual(['inv-2', 'inv-1']);
    expect(await repo.findById('missing')).toBeNull();
  });
});
