/**
 * RiskScore repository round-trip integration tests
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-25.
 * Asserts the append-only contract and that history returns rows in
 * computedAt descending order.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteRiskScoreRepository } from '@/infrastructure/repositories/aspm/sqlite-risk-score-repository.js';
import type { RiskScore } from '@/domain/generated/output.js';

function makeScore(overrides: Partial<RiskScore> = {}): RiskScore {
  const computed = new Date('2026-05-01T00:00:00.000Z');
  return {
    id: 'rs-1',
    findingId: 'finding-1',
    total: 72,
    breakdown: {
      total: 72,
      cvssContribution: 30,
      epssContribution: 10,
      kevContribution: 15,
      exposureContribution: 8,
      criticalityContribution: 6,
      dataClassificationContribution: 3,
    },
    computedAt: computed,
    inputsHash: 'hash-abc',
    createdAt: computed,
    updatedAt: computed,
    ...overrides,
  };
}

describe('SQLiteRiskScoreRepository', () => {
  let db: Database.Database;
  let repo: SQLiteRiskScoreRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteRiskScoreRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips append → findCurrentForFinding', async () => {
    const score = makeScore();
    await repo.append(score);

    const found = await repo.findCurrentForFinding(score.findingId);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(score.id);
    expect(found!.findingId).toBe(score.findingId);
    expect(found!.total).toBe(72);
    expect(found!.breakdown.cvssContribution).toBe(30);
    expect(found!.breakdown.epssContribution).toBe(10);
    expect(found!.breakdown.kevContribution).toBe(15);
    expect(found!.breakdown.exposureContribution).toBe(8);
    expect(found!.breakdown.criticalityContribution).toBe(6);
    expect(found!.breakdown.dataClassificationContribution).toBe(3);
    expect(found!.inputsHash).toBe('hash-abc');
  });

  it('returns null when no score exists for the finding', async () => {
    expect(await repo.findCurrentForFinding('unknown')).toBeNull();
  });

  it('findCurrentForFinding returns the latest by computedAt', async () => {
    await repo.append(
      makeScore({
        id: 'rs-old',
        total: 50,
        computedAt: new Date('2026-04-01T00:00:00.000Z'),
      })
    );
    await repo.append(
      makeScore({
        id: 'rs-new',
        total: 88,
        computedAt: new Date('2026-05-15T00:00:00.000Z'),
      })
    );
    await repo.append(
      makeScore({
        id: 'rs-mid',
        total: 70,
        computedAt: new Date('2026-05-01T00:00:00.000Z'),
      })
    );

    const current = await repo.findCurrentForFinding('finding-1');
    expect(current!.id).toBe('rs-new');
    expect(current!.total).toBe(88);
  });

  it('findHistory returns all rows in computedAt desc order', async () => {
    await repo.append(
      makeScore({ id: 'a', total: 50, computedAt: new Date('2026-04-01T00:00:00.000Z') })
    );
    await repo.append(
      makeScore({ id: 'b', total: 65, computedAt: new Date('2026-05-01T00:00:00.000Z') })
    );
    await repo.append(
      makeScore({ id: 'c', total: 88, computedAt: new Date('2026-05-15T00:00:00.000Z') })
    );

    const history = await repo.findHistory('finding-1');
    expect(history.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('history is scoped to the requested finding', async () => {
    await repo.append(makeScore({ id: '1a', findingId: 'finding-A' }));
    await repo.append(makeScore({ id: '2a', findingId: 'finding-A' }));
    await repo.append(makeScore({ id: '1b', findingId: 'finding-B' }));

    const a = await repo.findHistory('finding-A');
    const b = await repo.findHistory('finding-B');
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(1);
  });

  it('append is truly append-only (the same id cannot be inserted twice)', async () => {
    await repo.append(makeScore({ id: 'same-id' }));
    await expect(repo.append(makeScore({ id: 'same-id' }))).rejects.toThrow();
  });
});
