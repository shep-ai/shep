/**
 * Opportunity repositories (spec 126): migration 159, every field through
 * both column lists, and the signal and opportunity filters.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/159-create-opportunities.js';
import {
  SQLiteOpportunityRepository,
  SQLiteOpportunityWeightsRepository,
  SQLiteSignalRepository,
} from '@/infrastructure/repositories/sqlite-opportunity.repository.js';
import {
  OpportunitySource,
  OpportunityStatus,
  SignalKind,
  type Opportunity,
  type Signal,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

const SIGNAL: Signal = {
  id: 'sig-1',
  spaceId: 'space-acme',
  productLineId: 'line-pay',
  kind: SignalKind.Feedback,
  title: 'Checkout times out',
  detail: 'Since Tuesday',
  customer: 'Globex',
  monthlyRevenue: 4000.5,
  urgent: true,
  url: 'https://support.acme.com/t/1',
  opportunityId: 'opp-1',
  createdAt: T1,
  updatedAt: T1,
};

const OPPORTUNITY: Opportunity = {
  id: 'opp-1',
  spaceId: 'space-acme',
  productLineId: 'line-pay',
  title: 'Faster checkout',
  problem: 'Guests abandon checkout',
  status: OpportunityStatus.Dropped,
  reviewHours: 6.5,
  confidence: 0.7,
  strategic: true,
  workItemId: 'wi-1',
  decidedAt: T2,
  dropReason: 'Covered elsewhere',
  source: OpportunitySource.Discovery,
  brief: 'Cache the session lookup.',
  createdAt: T1,
  updatedAt: T2,
};

describe('SQLite opportunity repositories', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips every signal field and filters by space, opportunity and link', async () => {
    const signals = new SQLiteSignalRepository(db);
    await signals.create(SIGNAL);
    const bare: Signal = {
      id: 'sig-2',
      spaceId: 'space-acme',
      kind: SignalKind.Manual,
      title: 'Dark mode',
      urgent: false,
      createdAt: T2,
      updatedAt: T2,
    };
    await signals.create(bare);
    await signals.create({ ...bare, id: 'sig-3', spaceId: 'space-me' });

    expect(await signals.findById('sig-1')).toEqual(SIGNAL);
    expect(await signals.findById('sig-2')).toEqual(bare);
    expect((await signals.list({ spaceId: 'space-acme' })).map((s) => s.id)).toEqual([
      'sig-2',
      'sig-1',
    ]);
    expect((await signals.list({ opportunityId: 'opp-1' })).map((s) => s.id)).toEqual(['sig-1']);
    expect(
      (await signals.list({ spaceId: 'space-acme', unlinked: true })).map((s) => s.id)
    ).toEqual(['sig-2']);

    const { opportunityId: _linked, ...unlinked } = SIGNAL;
    await signals.update({ ...unlinked, updatedAt: T2 });
    expect(await signals.findById('sig-1')).toEqual({ ...unlinked, updatedAt: T2 });
    await signals.delete('sig-1');
    expect(await signals.findById('sig-1')).toBeNull();
  });

  it('round-trips every opportunity field and filters by status', async () => {
    const opportunities = new SQLiteOpportunityRepository(db);
    await opportunities.create(OPPORTUNITY);
    const proposed: Opportunity = {
      id: 'opp-2',
      spaceId: 'space-acme',
      title: 'Dark mode',
      status: OpportunityStatus.Proposed,
      reviewHours: 2,
      confidence: 0.5,
      strategic: false,
      createdAt: T2,
      updatedAt: T2,
    };
    await opportunities.create(proposed);

    expect(await opportunities.findById('opp-1')).toEqual(OPPORTUNITY);
    expect(await opportunities.findById('opp-2')).toEqual(proposed);
    expect(
      (await opportunities.list({ statuses: [OpportunityStatus.Proposed] })).map((o) => o.id)
    ).toEqual(['opp-2']);
    expect(await opportunities.list({ statuses: [] })).toEqual([]);
    expect(await opportunities.list({ spaceId: 'space-me' })).toEqual([]);

    await opportunities.update({ ...proposed, status: OpportunityStatus.Accepted });
    expect((await opportunities.findById('opp-2'))?.status).toBe(OpportunityStatus.Accepted);
  });

  it("saves and replaces a space's weights", async () => {
    const weights = new SQLiteOpportunityWeightsRepository(db);
    expect(await weights.find('space-acme')).toBeNull();
    const own = {
      spaceId: 'space-acme',
      reach: 1.5,
      revenue: 2,
      urgency: 3,
      strategic: 5,
      weeklyReviewHours: 12,
      discoveryEveryHours: 24,
    };
    await weights.save(own);
    await weights.save({ ...own, reach: 4 });
    expect(await weights.find('space-acme')).toEqual({ ...own, reach: 4 });
    expect((await weights.listScheduled()).map((w) => w.spaceId)).toEqual(['space-acme']);
    const { discoveryEveryHours: _off, ...withoutDiscovery } = own;
    await weights.save(withoutDiscovery);
    expect(await weights.find('space-acme')).toEqual(withoutDiscovery);
    expect(await weights.listScheduled()).toEqual([]);
  });
});
