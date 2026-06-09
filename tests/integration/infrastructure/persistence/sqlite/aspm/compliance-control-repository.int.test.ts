/**
 * ComplianceControl repository + migration 115 integration tests
 * (feature 098, phase 9 / task-52).
 *
 * Acceptance criteria covered:
 *  - Migration creates compliance_controls + finding_compliance_controls
 *  - Seed inserts the expected number of OWASP ASVS + CWE Top 25 rows
 *  - Migration is idempotent: re-running yields zero additional rows
 *  - Round-trip findByFramework / findIdByControlIdentifier / linkToFinding
 *  - linkToFinding + linkManyToFinding are idempotent on (finding_id, control_id)
 *  - getCoverageForFramework reports per-control open-finding counts
 *    and zero-fills controls without evidence
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteComplianceControlRepository } from '@/infrastructure/repositories/aspm/sqlite-compliance-control-repository.js';
import {
  COMPLIANCE_CONTROL_SEED_ROWS,
  OWASP_ASVS_SEED_COUNT,
  CWE_TOP_25_SEED_COUNT,
} from '@/infrastructure/persistence/sqlite/migrations/data/compliance-control-seed.js';
import {
  CanonicalSeverity,
  ComplianceFramework,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import { SQLiteFindingRepository } from '@/infrastructure/repositories/aspm/sqlite-finding-repository.js';

const TOTAL_SEED_ROWS = OWASP_ASVS_SEED_COUNT + CWE_TOP_25_SEED_COUNT;

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  const now = new Date();
  return {
    id: 'finding-1',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'rule-1',
    title: 'Title',
    description: 'desc',
    rawSeverity: 'high',
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

describe('SQLiteComplianceControlRepository + migration 115', () => {
  let db: Database.Database;
  let repo: SQLiteComplianceControlRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteComplianceControlRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates both compliance tables', () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name IN ('compliance_controls', 'finding_compliance_controls')`
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name).sort()).toEqual([
      'compliance_controls',
      'finding_compliance_controls',
    ]);
  });

  it('seeds the expected number of OWASP ASVS + CWE Top 25 rows', async () => {
    const asvs = await repo.findByFramework(ComplianceFramework.OwaspAsvs);
    const cwe = await repo.findByFramework(ComplianceFramework.CweTop25);

    expect(asvs.length).toBe(OWASP_ASVS_SEED_COUNT);
    expect(cwe.length).toBe(CWE_TOP_25_SEED_COUNT);
    expect(asvs.length + cwe.length).toBe(TOTAL_SEED_ROWS);
    expect(asvs.length + cwe.length).toBe(COMPLIANCE_CONTROL_SEED_ROWS.length);
  });

  it('seeded controls expose framework-specific identifiers', async () => {
    const asvs = await repo.findByFramework(ComplianceFramework.OwaspAsvs);
    const cwe = await repo.findByFramework(ComplianceFramework.CweTop25);

    expect(asvs.every((c) => /^V\d/.test(c.controlId))).toBe(true);
    expect(cwe.every((c) => c.controlId.startsWith('CWE-'))).toBe(true);
  });

  it('migration is idempotent — re-running migrations yields zero additional rows', async () => {
    const beforeCount = (
      db.prepare('SELECT COUNT(*) AS c FROM compliance_controls').get() as { c: number }
    ).c;
    expect(beforeCount).toBe(TOTAL_SEED_ROWS);

    // Re-run the full migration set on the same DB; legacy / new migrations
    // are all marked as already-applied in umzug_migrations, but the seed
    // INSERT OR IGNOREs guarantee idempotence even if forced.
    await runSQLiteMigrations(db);

    const afterCount = (
      db.prepare('SELECT COUNT(*) AS c FROM compliance_controls').get() as { c: number }
    ).c;
    expect(afterCount).toBe(beforeCount);
  });

  it('findIdByControlIdentifier resolves to the seeded canonical row id', async () => {
    const asvsId = await repo.findIdByControlIdentifier(ComplianceFramework.OwaspAsvs, 'V5.3.4');
    const cweId = await repo.findIdByControlIdentifier(ComplianceFramework.CweTop25, 'CWE-89');

    expect(asvsId).toBe('cc-asvs-v5-3-4');
    expect(cweId).toBe('cc-cwe-89');
  });

  it('findIdByControlIdentifier returns null for unknown identifiers', async () => {
    const unknown = await repo.findIdByControlIdentifier(
      ComplianceFramework.OwaspAsvs,
      'V99.99.99'
    );
    expect(unknown).toBeNull();
  });

  it('linkToFinding is idempotent on (finding_id, control_id)', async () => {
    const findingRepo = new SQLiteFindingRepository(db);
    await findingRepo.create(makeFinding({ id: 'finding-1' }));

    await repo.linkToFinding('finding-1', 'cc-cwe-89');
    await repo.linkToFinding('finding-1', 'cc-cwe-89');
    await repo.linkToFinding('finding-1', 'cc-cwe-89');

    const rows = db
      .prepare(
        'SELECT COUNT(*) AS c FROM finding_compliance_controls WHERE finding_id = ? AND control_id = ?'
      )
      .get('finding-1', 'cc-cwe-89') as { c: number };
    expect(rows.c).toBe(1);
  });

  it('linkManyToFinding writes each control exactly once and survives re-ingestion', async () => {
    const findingRepo = new SQLiteFindingRepository(db);
    await findingRepo.create(makeFinding({ id: 'finding-1' }));

    await repo.linkManyToFinding('finding-1', ['cc-cwe-89', 'cc-asvs-v5-3-4']);
    // Simulate a second SARIF ingestion adding the same links plus a new one.
    await repo.linkManyToFinding('finding-1', ['cc-cwe-89', 'cc-asvs-v5-3-4', 'cc-cwe-79']);

    const linked = await repo.findControlsForFinding('finding-1');
    expect(linked.map((c) => c.id).sort()).toEqual(
      ['cc-asvs-v5-3-4', 'cc-cwe-79', 'cc-cwe-89'].sort()
    );
  });

  it('linkManyToFinding with empty list is a no-op', async () => {
    const findingRepo = new SQLiteFindingRepository(db);
    await findingRepo.create(makeFinding({ id: 'finding-1' }));
    await repo.linkManyToFinding('finding-1', []);
    const count = (
      db.prepare('SELECT COUNT(*) AS c FROM finding_compliance_controls').get() as { c: number }
    ).c;
    expect(count).toBe(0);
  });

  it('getCoverageForFramework reports open-finding counts per control', async () => {
    const findingRepo = new SQLiteFindingRepository(db);
    await findingRepo.create(
      makeFinding({
        id: 'f-open',
        ruleId: 'rule-a',
        state: FindingState.Open,
        canonicalSeverity: CanonicalSeverity.High,
      })
    );
    await findingRepo.create(
      makeFinding({
        id: 'f-triaged',
        ruleId: 'rule-b',
        state: FindingState.Triaged,
        canonicalSeverity: CanonicalSeverity.Medium,
      })
    );
    await findingRepo.create(
      makeFinding({
        id: 'f-resolved',
        ruleId: 'rule-c',
        state: FindingState.Resolved,
        canonicalSeverity: CanonicalSeverity.Low,
      })
    );

    await repo.linkToFinding('f-open', 'cc-cwe-89');
    await repo.linkToFinding('f-triaged', 'cc-cwe-89');
    await repo.linkToFinding('f-resolved', 'cc-cwe-89'); // closed/resolved shouldn't count

    const coverage = await repo.getCoverageForFramework(ComplianceFramework.CweTop25);
    const sqlInjection = coverage.find((c) => c.controlIdentifier === 'CWE-89');
    expect(sqlInjection).toBeDefined();
    expect(sqlInjection!.openFindingCount).toBe(2);

    // Controls without any evidence still appear so the UI can show "covered without evidence".
    const xss = coverage.find((c) => c.controlIdentifier === 'CWE-79');
    expect(xss).toBeDefined();
    expect(xss!.openFindingCount).toBe(0);
  });

  it('getCoverageForFramework excludes soft-deleted findings', async () => {
    const findingRepo = new SQLiteFindingRepository(db);
    await findingRepo.create(makeFinding({ id: 'f-deleted', state: FindingState.Open }));
    await repo.linkToFinding('f-deleted', 'cc-cwe-89');
    await findingRepo.softDelete('f-deleted');

    const coverage = await repo.getCoverageForFramework(ComplianceFramework.CweTop25);
    const sqlInjection = coverage.find((c) => c.controlIdentifier === 'CWE-89');
    expect(sqlInjection!.openFindingCount).toBe(0);
  });
});
