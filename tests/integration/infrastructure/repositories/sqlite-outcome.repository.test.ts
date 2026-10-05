/** Outcomes (spec 130): migration 163 and every field through the repository. */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/163-create-outcomes.js';
import { SQLiteOutcomeRepository } from '@/infrastructure/repositories/sqlite-outcome.repository.js';
import { OutcomeVerdict, type OpportunityOutcome } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-15T10:00:00Z');

const JUDGED: OpportunityOutcome = {
  id: 'out-1',
  opportunityId: 'opp-1',
  spaceId: 'space-acme',
  shippedAt: T1,
  reviewAt: T2,
  verdict: OutcomeVerdict.Solved,
  signalsBefore: 6,
  signalsAfter: 2,
  judgedAt: T2,
  actualReviewHours: 8.5,
  createdAt: T1,
  updatedAt: T2,
};

const PENDING: OpportunityOutcome = {
  id: 'out-2',
  opportunityId: 'opp-2',
  spaceId: 'space-acme',
  shippedAt: T2,
  reviewAt: new Date('2026-10-29T10:00:00Z'),
  verdict: OutcomeVerdict.Pending,
  createdAt: T2,
  updatedAt: T2,
};

describe('SQLiteOutcomeRepository', () => {
  let db: Database.Database;
  let outcomes: SQLiteOutcomeRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    outcomes = new SQLiteOutcomeRepository(db);
  });
  afterEach(() => db.close());

  it('is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips every field and finds an outcome by its opportunity', async () => {
    await outcomes.create(JUDGED);
    await outcomes.create(PENDING);
    expect(await outcomes.findByOpportunity('opp-1')).toEqual(JUDGED);
    expect(await outcomes.findByOpportunity('opp-2')).toEqual(PENDING);
    expect(await outcomes.findByOpportunity('opp-3')).toBeNull();
  });

  it('lists a space newest shipped first, and the pending ones due by a time', async () => {
    await outcomes.create(JUDGED);
    await outcomes.create(PENDING);
    await outcomes.create({ ...PENDING, id: 'out-3', opportunityId: 'opp-3', spaceId: 'space-me' });

    expect((await outcomes.list({ spaceId: 'space-acme' })).map((o) => o.id)).toEqual([
      'out-2',
      'out-1',
    ]);
    expect(await outcomes.listDue(new Date('2026-10-20T00:00:00Z'))).toEqual([]);
    expect(
      (await outcomes.listDue(new Date('2026-10-30T00:00:00Z'))).map((o) => o.id).sort()
    ).toEqual(['out-2', 'out-3']);
  });

  it('refuses a second outcome for one opportunity and updates in place', async () => {
    await outcomes.create(PENDING);
    await expect(outcomes.create({ ...PENDING, id: 'out-9' })).rejects.toThrow();
    await outcomes.update({ ...PENDING, actualReviewHours: 4 });
    expect((await outcomes.findByOpportunity('opp-2'))?.actualReviewHours).toBe(4);
  });
});
