/**
 * Posture aggregate methods round-trip integration tests
 * (feature 098, phase 7, task-40 / task-41).
 *
 * Exercises the new IFindingRepository aggregate helpers against a real
 * in-memory SQLite database:
 *   - countOpenBySeverity
 *   - topAtRiskApplications
 *   - countOpenKev
 *   - countSlaBreached
 *   - latestLastSeenAt
 *   - postureTrend
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFindingRepository } from '@/infrastructure/repositories/aspm/sqlite-finding-repository.js';
import { SQLiteRiskScoreRepository } from '@/infrastructure/repositories/aspm/sqlite-risk-score-repository.js';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type RiskScore,
  type SecurityFinding,
} from '@/domain/generated/output.js';

const FIXED_NOW = new Date('2026-05-19T12:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  const id = overrides.id ?? `f-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: `semgrep.test.${id}`,
    title: 'A finding',
    description: '…',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:test',
    discoveredAt: FIXED_NOW,
    lastSeenAt: FIXED_NOW,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  } as SecurityFinding;
}

function makeRiskScore(findingId: string, total: number): RiskScore {
  return {
    id: `rs-${findingId}`,
    findingId,
    total,
    breakdown: {
      total,
      cvssContribution: total,
      epssContribution: 0,
      kevContribution: 0,
      exposureContribution: 0,
      criticalityContribution: 0,
      dataClassificationContribution: 0,
    },
    computedAt: FIXED_NOW,
    inputsHash: 'h',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  } as unknown as RiskScore;
}

describe('SQLiteFindingRepository — posture aggregates', () => {
  let db: Database.Database;
  let repo: SQLiteFindingRepository;
  let scoreRepo: SQLiteRiskScoreRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteFindingRepository(db);
    scoreRepo = new SQLiteRiskScoreRepository(db);
  });

  afterEach(() => db.close());

  it('countOpenBySeverity zero-fills every canonical severity', async () => {
    await repo.create(
      makeFinding({
        id: 'a',
        canonicalSeverity: CanonicalSeverity.Critical,
        state: FindingState.Open,
      })
    );
    await repo.create(
      makeFinding({
        id: 'b',
        canonicalSeverity: CanonicalSeverity.High,
        state: FindingState.Triaged,
      })
    );
    await repo.create(
      makeFinding({
        id: 'c',
        canonicalSeverity: CanonicalSeverity.High,
        state: FindingState.InProgress,
      })
    );
    await repo.create(
      makeFinding({
        id: 'd',
        canonicalSeverity: CanonicalSeverity.Low,
        state: FindingState.Resolved,
      })
    );
    const counts = await repo.countOpenBySeverity();
    const byKey = new Map(counts.map((c) => [c.severity, c.count]));
    expect(byKey.get(CanonicalSeverity.Critical)).toBe(1);
    expect(byKey.get(CanonicalSeverity.High)).toBe(2);
    expect(byKey.get(CanonicalSeverity.Medium)).toBe(0);
    expect(byKey.get(CanonicalSeverity.Low)).toBe(0); // resolved excluded
    expect(byKey.get(CanonicalSeverity.Info)).toBe(0);
  });

  it('topAtRiskApplications orders by risk-score sum desc, ties broken by open count', async () => {
    await repo.create(makeFinding({ id: 'a1', applicationId: 'app-A' }));
    await repo.create(makeFinding({ id: 'a2', applicationId: 'app-A' }));
    await repo.create(makeFinding({ id: 'b1', applicationId: 'app-B' }));
    await scoreRepo.append(makeRiskScore('a1', 80));
    await repo.update('a1', { currentRiskScoreId: 'rs-a1' });
    await scoreRepo.append(makeRiskScore('b1', 50));
    await repo.update('b1', { currentRiskScoreId: 'rs-b1' });

    const top = await repo.topAtRiskApplications(5);
    expect(top[0].applicationId).toBe('app-A');
    expect(top[0].riskScoreSum).toBe(80);
    expect(top[1].applicationId).toBe('app-B');
    expect(top[1].riskScoreSum).toBe(50);
  });

  it('countOpenKev counts only open kev-flagged findings', async () => {
    await repo.create(makeFinding({ id: 'k1', kev: true, state: FindingState.Open }));
    await repo.create(makeFinding({ id: 'k2', kev: true, state: FindingState.Resolved }));
    await repo.create(makeFinding({ id: 'k3', kev: false, state: FindingState.Open }));
    expect(await repo.countOpenKev()).toBe(1);
  });

  it('countSlaBreached counts findings older than the per-severity window', async () => {
    const tenDaysAgo = new Date(FIXED_NOW.getTime() - 10 * MS_PER_DAY);
    const twoDaysAgo = new Date(FIXED_NOW.getTime() - 2 * MS_PER_DAY);
    await repo.create(
      makeFinding({
        id: 'breached',
        canonicalSeverity: CanonicalSeverity.Critical,
        discoveredAt: tenDaysAgo,
      })
    );
    await repo.create(
      makeFinding({
        id: 'healthy',
        canonicalSeverity: CanonicalSeverity.Critical,
        discoveredAt: twoDaysAgo,
      })
    );
    const breaches = await repo.countSlaBreached(
      [{ severity: CanonicalSeverity.Critical, windowDays: 7 }],
      FIXED_NOW
    );
    expect(breaches).toBe(1);
  });

  it('countSlaBreached excludes findings whose ids are in the exclusion set', async () => {
    const tenDaysAgo = new Date(FIXED_NOW.getTime() - 10 * MS_PER_DAY);
    await repo.create(
      makeFinding({
        id: 'excluded',
        canonicalSeverity: CanonicalSeverity.Critical,
        discoveredAt: tenDaysAgo,
      })
    );
    const breaches = await repo.countSlaBreached(
      [{ severity: CanonicalSeverity.Critical, windowDays: 7 }],
      FIXED_NOW,
      ['excluded']
    );
    expect(breaches).toBe(0);
  });

  it('latestLastSeenAt returns the most recent lastSeenAt or null when empty', async () => {
    expect(await repo.latestLastSeenAt()).toBeNull();
    await repo.create(makeFinding({ id: 'l1', lastSeenAt: new Date('2026-05-18T00:00:00Z') }));
    await repo.create(makeFinding({ id: 'l2', lastSeenAt: new Date('2026-05-19T00:00:00Z') }));
    const latest = await repo.latestLastSeenAt();
    expect(latest?.toISOString()).toBe('2026-05-19T00:00:00.000Z');
  });

  it('postureTrend returns one bucket per requested bucket start', async () => {
    await repo.create(
      makeFinding({
        id: 't1',
        canonicalSeverity: CanonicalSeverity.High,
        discoveredAt: new Date('2026-05-10T00:00:00Z'),
        state: FindingState.Open,
      })
    );
    const buckets = await repo.postureTrend([
      new Date('2026-05-09T00:00:00Z'),
      new Date('2026-05-11T00:00:00Z'),
      new Date('2026-05-20T00:00:00Z'),
    ]);
    expect(buckets).toHaveLength(3);
    expect(
      buckets[0].countsBySeverity.find((c) => c.severity === CanonicalSeverity.High)?.count
    ).toBe(0);
    expect(
      buckets[1].countsBySeverity.find((c) => c.severity === CanonicalSeverity.High)?.count
    ).toBe(1);
    expect(
      buckets[2].countsBySeverity.find((c) => c.severity === CanonicalSeverity.High)?.count
    ).toBe(1);
  });
});
