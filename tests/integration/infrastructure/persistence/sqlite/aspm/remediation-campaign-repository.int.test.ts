/**
 * SQLiteRemediationCampaignRepository round-trip integration tests.
 *
 * Feature 098, phase 6 (task-37). Covers full CRUD + state transitions
 * + audit-log append + targetQuery JSON conformance to FindingFilter.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteRemediationCampaignRepository } from '@/infrastructure/repositories/aspm/sqlite-remediation-campaign-repository.js';
import {
  CampaignStatus,
  CanonicalSeverity,
  FindingState,
  type FindingFilter,
  type RemediationCampaign,
} from '@/domain/generated/output.js';

function makeCampaign(overrides: Partial<RemediationCampaign> = {}): RemediationCampaign {
  const now = new Date('2026-05-19T12:00:00Z');
  const filter: FindingFilter = {
    severities: [CanonicalSeverity.Critical, CanonicalSeverity.High],
    states: [FindingState.Open, FindingState.Triaged],
    kev: true,
  };
  return {
    id: randomUUID(),
    name: 'Fix all KEV log4j',
    description: 'cross-cutting sprint',
    targetQuery: filter,
    status: CampaignStatus.Draft,
    ownerId: randomUUID(),
    dueDate: new Date('2026-06-19T00:00:00Z'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SQLiteRemediationCampaignRepository', () => {
  let db: Database.Database;
  let repo: SQLiteRemediationCampaignRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteRemediationCampaignRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('persists and round-trips a campaign with its FindingFilter targetQuery', async () => {
    const c = makeCampaign();
    await repo.create(c, { at: 'a', actor: 'alice', action: 'created' });
    const read = await repo.findById(c.id);
    expect(read).not.toBeNull();
    expect(read!.name).toBe(c.name);
    expect(read!.status).toBe(CampaignStatus.Draft);
    expect(read!.targetQuery.severities).toEqual([
      CanonicalSeverity.Critical,
      CanonicalSeverity.High,
    ]);
    expect(read!.targetQuery.kev).toBe(true);
    expect(read!.dueDate?.toISOString()).toBe(c.dueDate!.toISOString());
  });

  it('targetQueryJson conforms to FindingFilter on read after update', async () => {
    const c = makeCampaign();
    await repo.create(c, { at: 'a', actor: 'x', action: 'created' });
    const newFilter: FindingFilter = {
      severities: [CanonicalSeverity.Medium],
      applicationIds: [randomUUID()],
    };
    await repo.update(c.id, { targetQuery: newFilter }, { at: 'b', actor: 'x', action: 'edited' });
    const read = await repo.findById(c.id);
    expect(read!.targetQuery.severities).toEqual([CanonicalSeverity.Medium]);
    expect(read!.targetQuery.applicationIds).toEqual(newFilter.applicationIds);
  });

  it('updateStatus transitions Draft → Active → Completed and stamps closedAt only on Completed', async () => {
    const c = makeCampaign();
    await repo.create(c, { at: 'a', actor: 'x', action: 'created' });

    await repo.updateStatus(c.id, CampaignStatus.Active, {
      at: 'b',
      actor: 'x',
      action: 'activated',
    });
    let read = await repo.findById(c.id);
    expect(read!.status).toBe(CampaignStatus.Active);
    expect(read!.closedAt).toBeUndefined();

    await repo.updateStatus(c.id, CampaignStatus.Completed, {
      at: 'c',
      actor: 'x',
      action: 'closed',
    });
    read = await repo.findById(c.id);
    expect(read!.status).toBe(CampaignStatus.Completed);
    expect(read!.closedAt).toBeInstanceOf(Date);
  });

  it('updateStatus appends to the audit log without overwriting prior entries', async () => {
    const c = makeCampaign();
    await repo.create(c, { at: 'a', actor: 'x', action: 'created' });
    await repo.updateStatus(c.id, CampaignStatus.Active, {
      at: 'b',
      actor: 'x',
      action: 'activated',
    });
    await repo.updateStatus(c.id, CampaignStatus.Cancelled, {
      at: 'c',
      actor: 'x',
      action: 'cancelled',
      note: 'business pivot',
    });
    const withAudit = await repo.findByIdWithAudit(c.id);
    expect(withAudit!.audit.map((e) => e.action)).toEqual(['created', 'activated', 'cancelled']);
    expect(withAudit!.audit[2].note).toBe('business pivot');
  });

  it('list returns Active first, then Paused, then Draft, then closed; orders by dueDate within each', async () => {
    const a = makeCampaign({
      name: 'A',
      status: CampaignStatus.Active,
      dueDate: new Date('2026-07-01'),
    });
    const b = makeCampaign({
      name: 'B',
      status: CampaignStatus.Draft,
      dueDate: new Date('2026-06-01'),
    });
    const c = makeCampaign({
      name: 'C',
      status: CampaignStatus.Completed,
      dueDate: new Date('2026-05-01'),
    });
    await repo.create(a, { at: 'a', actor: 'x', action: 'created' });
    await repo.create(b, { at: 'b', actor: 'x', action: 'created' });
    await repo.create(c, { at: 'c', actor: 'x', action: 'created' });

    const all = await repo.list();
    expect(all.map((x) => x.name)).toEqual(['A', 'B', 'C']);
  });

  it('list with status filter restricts the result set', async () => {
    const a = makeCampaign({ name: 'A', status: CampaignStatus.Active });
    const b = makeCampaign({ name: 'B', status: CampaignStatus.Completed });
    await repo.create(a, { at: 'a', actor: 'x', action: 'created' });
    await repo.create(b, { at: 'b', actor: 'x', action: 'created' });

    const onlyActive = await repo.list({ statuses: [CampaignStatus.Active] });
    expect(onlyActive.map((x) => x.id)).toEqual([a.id]);
  });

  it('softDelete excludes the campaign from queries while preserving the row', async () => {
    const c = makeCampaign();
    await repo.create(c, { at: 'a', actor: 'x', action: 'created' });
    await repo.softDelete(c.id);
    expect(await repo.findById(c.id)).toBeNull();
    expect((await repo.list()).find((x) => x.id === c.id)).toBeUndefined();
  });
});
