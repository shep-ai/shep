/**
 * SqliteFindingRepository.listRanked integration tests
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-29. Exercises
 * the JOIN with risk_scores via current_risk_score_id and the ORDER BY
 * total DESC NULLS LAST behavior.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'r-1',
    title: 't',
    description: 'd',
    locationPath: 'src/foo.ts',
    locationLine: 12,
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:semgrep',
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SecurityFinding;
}

function makeScore(findingId: string, total: number, idSuffix: string): RiskScore {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: `rs-${idSuffix}`,
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
    computedAt: now,
    inputsHash: idSuffix,
    createdAt: now,
    updatedAt: now,
  } as RiskScore;
}

describe('SQLiteFindingRepository.listRanked', () => {
  let db: Database.Database;
  let findingRepo: SQLiteFindingRepository;
  let riskScoreRepo: SQLiteRiskScoreRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    findingRepo = new SQLiteFindingRepository(db);
    riskScoreRepo = new SQLiteRiskScoreRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns an empty page when no findings exist', async () => {
    const page = await findingRepo.listRanked({}, { offset: 0, limit: 25 });
    expect(page).toEqual({ items: [], total: 0 });
  });

  it('orders by risk_score.total DESC, NULLS LAST', async () => {
    // Three findings with three different totals, one without a score.
    const a = makeFinding({ id: 'a', ruleId: 'a-rule' });
    const b = makeFinding({ id: 'b', ruleId: 'b-rule' });
    const c = makeFinding({ id: 'c', ruleId: 'c-rule' });
    const d = makeFinding({ id: 'd', ruleId: 'd-rule' });
    await findingRepo.create(a);
    await findingRepo.create(b);
    await findingRepo.create(c);
    await findingRepo.create(d);

    const sA = makeScore('a', 30, 'a');
    const sB = makeScore('b', 90, 'b');
    const sC = makeScore('c', 60, 'c');
    await riskScoreRepo.append(sA);
    await riskScoreRepo.append(sB);
    await riskScoreRepo.append(sC);
    await findingRepo.update('a', { currentRiskScoreId: sA.id });
    await findingRepo.update('b', { currentRiskScoreId: sB.id });
    await findingRepo.update('c', { currentRiskScoreId: sC.id });

    const page = await findingRepo.listRanked({}, { offset: 0, limit: 25 });
    expect(page.total).toBe(4);
    expect(page.items.map((i) => i.finding.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(page.items.map((i) => i.riskScoreTotal)).toEqual([90, 60, 30, null]);
  });

  it('respects the filter primitive (kev=true)', async () => {
    const kev = makeFinding({ id: 'k', ruleId: 'k', cveId: 'CVE-2024-1', kev: true });
    const not = makeFinding({ id: 'n', ruleId: 'n', cveId: 'CVE-2024-2', kev: false });
    await findingRepo.create(kev);
    await findingRepo.create(not);

    const page = await findingRepo.listRanked({ kev: true }, { offset: 0, limit: 25 });
    expect(page.total).toBe(1);
    expect(page.items[0].finding.id).toBe('k');
  });

  it('respects the filter primitive (severities)', async () => {
    const high = makeFinding({
      id: 'h',
      ruleId: 'h',
      canonicalSeverity: CanonicalSeverity.High,
    });
    const med = makeFinding({
      id: 'm',
      ruleId: 'm',
      canonicalSeverity: CanonicalSeverity.Medium,
    });
    await findingRepo.create(high);
    await findingRepo.create(med);

    const page = await findingRepo.listRanked(
      { severities: [CanonicalSeverity.High] },
      { offset: 0, limit: 25 }
    );
    expect(page.total).toBe(1);
    expect(page.items[0].finding.id).toBe('h');
  });

  it('excludes soft-deleted findings', async () => {
    const live = makeFinding({ id: 'live', ruleId: 'live' });
    const gone = makeFinding({ id: 'gone', ruleId: 'gone' });
    await findingRepo.create(live);
    await findingRepo.create(gone);
    await findingRepo.softDelete('gone');

    const page = await findingRepo.listRanked({}, { offset: 0, limit: 25 });
    expect(page.total).toBe(1);
    expect(page.items[0].finding.id).toBe('live');
  });

  it('paginates correctly', async () => {
    for (let i = 0; i < 5; i++) {
      const finding = makeFinding({ id: `p-${i}`, ruleId: `r-${i}` });
      await findingRepo.create(finding);
      const score = makeScore(`p-${i}`, 100 - i * 10, `s-${i}`);
      await riskScoreRepo.append(score);
      await findingRepo.update(`p-${i}`, { currentRiskScoreId: score.id });
    }

    const page1 = await findingRepo.listRanked({}, { offset: 0, limit: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items.map((i) => i.finding.id)).toEqual(['p-0', 'p-1']);

    const page2 = await findingRepo.listRanked({}, { offset: 2, limit: 2 });
    expect(page2.items.map((i) => i.finding.id)).toEqual(['p-2', 'p-3']);
  });
});
