/**
 * SqliteFindingRepository round-trip integration tests (feature 098, phase 3).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFindingRepository } from '@/infrastructure/repositories/aspm/sqlite-finding-repository.js';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@/domain/generated/output.js';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'semgrep.sql-injection',
    title: 'SQL injection',
    description: 'Tainted input flows to a query.',
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

describe('SQLiteFindingRepository', () => {
  let db: Database.Database;
  let repo: SQLiteFindingRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteFindingRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    const finding = makeFinding({ id: 'f-1', cveId: 'CVE-2024-1', cweId: 'CWE-89' });
    await repo.create(finding);

    const found = await repo.findById('f-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('f-1');
    expect(found!.cveId).toBe('CVE-2024-1');
    expect(found!.cweId).toBe('CWE-89');
    expect(found!.canonicalSeverity).toBe(CanonicalSeverity.High);
    expect(found!.findingDomain).toBe(FindingDomain.Code);
    expect(found!.state).toBe(FindingState.Open);
  });

  it('returns null for unknown id', async () => {
    expect(await repo.findById('nope')).toBeNull();
  });

  it('normalizes Windows backslash paths to POSIX before persisting', async () => {
    await repo.create(makeFinding({ id: 'f-win', locationPath: 'src\\nested\\file.ts' }));
    const found = await repo.findById('f-win');
    expect(found!.locationPath).toBe('src/nested/file.ts');

    const raw = db
      .prepare('SELECT location_path FROM security_findings WHERE id = ?')
      .get('f-win') as { location_path: string };
    expect(raw.location_path).toBe('src/nested/file.ts');
  });

  it('soft-deletes (findById returns null but row persists)', async () => {
    await repo.create(makeFinding({ id: 'f-sd' }));
    await repo.softDelete('f-sd');
    expect(await repo.findById('f-sd')).toBeNull();
    const raw = db.prepare('SELECT deleted_at FROM security_findings WHERE id = ?').get('f-sd') as {
      deleted_at: number | null;
    };
    expect(raw.deleted_at).not.toBeNull();
  });

  it('updates state, owner and timestamps', async () => {
    await repo.create(makeFinding({ id: 'f-u' }));
    const now = new Date('2026-05-20T00:00:00Z');
    await repo.update('f-u', {
      state: FindingState.Resolved,
      ownerId: 'owner-1',
      lastSeenAt: now,
      firstFixedAt: now,
    });
    const found = await repo.findById('f-u');
    expect(found!.state).toBe(FindingState.Resolved);
    expect(found!.ownerId).toBe('owner-1');
    expect(found!.lastSeenAt.getTime()).toBe(now.getTime());
    expect(found!.firstFixedAt!.getTime()).toBe(now.getTime());
  });

  describe('bulkInsertOrIgnore', () => {
    it('inserts new rows and reports inserted count', async () => {
      const result = await repo.bulkInsertOrIgnore([
        makeFinding({ id: 'a', ruleId: 'r-a' }),
        makeFinding({ id: 'b', ruleId: 'r-b' }),
      ]);
      expect(result).toEqual({ inserted: 2, duplicates: 0 });
    });

    it('ignores duplicates on the dedup key and reports duplicate count', async () => {
      const dup = makeFinding({
        id: 'orig',
        ruleId: 'rule-dup',
        cveId: null as unknown as undefined,
      });
      await repo.create(dup);
      const result = await repo.bulkInsertOrIgnore([
        makeFinding({ id: 'new1', ruleId: 'rule-dup' }),
        makeFinding({ id: 'new2', ruleId: 'rule-dup', locationLine: 99 }),
      ]);
      expect(result.duplicates).toBe(1);
      expect(result.inserted).toBe(1);
    });

    it('handles an empty batch', async () => {
      const result = await repo.bulkInsertOrIgnore([]);
      expect(result).toEqual({ inserted: 0, duplicates: 0 });
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      const now = new Date('2026-05-19T12:00:00Z');
      await repo.bulkInsertOrIgnore([
        makeFinding({
          id: 'a',
          applicationId: 'app-1',
          canonicalSeverity: CanonicalSeverity.Critical,
          ruleId: 'r-a',
          ownerId: 'owner-1',
          state: FindingState.Open,
          discoveredAt: new Date(now.getTime() - 1000),
        }),
        makeFinding({
          id: 'b',
          applicationId: 'app-1',
          canonicalSeverity: CanonicalSeverity.High,
          ruleId: 'r-b',
          ownerId: 'owner-2',
          state: FindingState.Open,
          discoveredAt: now,
        }),
        makeFinding({
          id: 'c',
          applicationId: 'app-2',
          canonicalSeverity: CanonicalSeverity.Medium,
          ruleId: 'r-c',
          ownerId: 'owner-1',
          state: FindingState.Resolved,
          findingDomain: FindingDomain.Dependency,
          cveId: 'CVE-2024-9',
        }),
      ]);
    });

    it('filters by application + severity', async () => {
      const result = await repo.list(
        { applicationIds: ['app-1'], severities: [CanonicalSeverity.Critical] },
        { offset: 0, limit: 25 }
      );
      expect(result.total).toBe(1);
      expect(result.items.map((f) => f.id)).toEqual(['a']);
    });

    it('filters by owner', async () => {
      const result = await repo.list({ ownerIds: ['owner-1'] }, { offset: 0, limit: 25 });
      expect(result.items.map((f) => f.id).sort()).toEqual(['a', 'c']);
    });

    it('filters by state', async () => {
      const result = await repo.list({ states: [FindingState.Resolved] }, { offset: 0, limit: 25 });
      expect(result.items.map((f) => f.id)).toEqual(['c']);
    });

    it('filters by finding domain', async () => {
      const result = await repo.list(
        { findingDomains: [FindingDomain.Dependency] },
        { offset: 0, limit: 25 }
      );
      expect(result.items.map((f) => f.id)).toEqual(['c']);
    });

    it('filters by cveId', async () => {
      const result = await repo.list({ cveIds: ['CVE-2024-9'] }, { offset: 0, limit: 25 });
      expect(result.items.map((f) => f.id)).toEqual(['c']);
    });

    it('orders by discovered_at DESC (most recent first)', async () => {
      const result = await repo.list({}, { offset: 0, limit: 25 });
      expect(result.items[0]!.id).toBe('b');
    });

    it('paginates with limit + offset', async () => {
      const page1 = await repo.list({}, { offset: 0, limit: 2 });
      const page2 = await repo.list({}, { offset: 2, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page1.total).toBe(3);
    });

    it('excludes soft-deleted rows', async () => {
      await repo.softDelete('a');
      const result = await repo.list({}, { offset: 0, limit: 25 });
      expect(result.items.map((f) => f.id)).not.toContain('a');
      expect(result.total).toBe(2);
    });
  });

  it('counts matches without pagination', async () => {
    await repo.create(makeFinding({ id: 'x' }));
    await repo.create(makeFinding({ id: 'y', ruleId: 'r-other' }));
    expect(await repo.count({})).toBe(2);
    expect(await repo.count({ ruleIds: ['r-other'] })).toBe(1);
  });
});
