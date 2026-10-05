/**
 * Discovery (spec 128), end to end through a real DI container and SQLite
 * with a scripted agent: a run proposes a discovered opportunity backed by
 * the space's loose signals, and the schedule decides when the next runs.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { registerKnowledge } from '@/infrastructure/di/modules/register-knowledge.js';
import { registerOpportunities } from '@/infrastructure/di/modules/register-opportunities.js';
import { registerDiscovery } from '@/infrastructure/di/modules/register-discovery.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { ManageOpportunityWeightsUseCase } from '@/application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { GetOpportunityBoardUseCase } from '@/application/use-cases/opportunities/get-opportunity-board.use-case.js';
import { SyncDiscoveryUseCase } from '@/application/use-cases/discovery/sync-discovery.use-case.js';
import { ListDiscoveryRunsUseCase } from '@/application/use-cases/discovery/list-discovery-runs.use-case.js';
import { DiscoveryRunStatus, OpportunitySource } from '@/domain/generated/output.js';

describe('Discovery (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;
  const call = vi.fn();

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    registerRepositories(c);
    registerSpaces(c);
    c.register('ITrackerClientFactory', { useValue: {} });
    registerKnowledge(c);
    registerOpportunities(c);
    registerDiscovery(c);
    c.register('IStructuredAgentCaller', { useValue: { call } });
    expect((await c.resolve(ManageSpacesUseCase).create({ name: 'Acme' })).ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
    call.mockReset();
  });

  it('runs on schedule and proposes a discovered opportunity from loose signals', async () => {
    const signals = c.resolve(ManageSignalsUseCase);
    const ids: string[] = [];
    for (const title of ['Checkout times out', 'Guest checkout slow']) {
      const recorded = await signals.record({ space: 'acme', title, customer: title });
      if (!recorded.ok) throw new Error(recorded.error);
      ids.push(recorded.signal.id);
    }
    call.mockResolvedValue({
      proposals: [
        {
          title: 'Faster guest checkout',
          problem: 'Guests abandon checkout.',
          outline: 'Cache the session lookup.',
          rationale: 'Two customers.',
          signalIds: ids,
          reviewHours: 4,
          confidence: 0.6,
        },
      ],
    });
    await c.resolve(ManageOpportunityWeightsUseCase).setDiscovery('acme', 24);

    const sync = c.resolve(SyncDiscoveryUseCase);
    const now = new Date();
    expect(await sync.runDue(now)).toEqual([expect.objectContaining({ ok: true })]);
    expect(await sync.runDue(now)).toEqual([]);
    expect(call).toHaveBeenCalledTimes(1);

    const board = await c.resolve(GetOpportunityBoardUseCase).execute('acme');
    if (!board.ok) throw new Error(board.error);
    expect(board.board.ranked[0].opportunity).toMatchObject({
      title: 'Faster guest checkout',
      source: OpportunitySource.Discovery,
    });
    expect(board.board.ranked[0].evidence.customers).toBe(2);
    expect(board.board.unlinkedSignals).toEqual([]);

    const runs = await c.resolve(ListDiscoveryRunsUseCase).execute('acme');
    expect(runs.ok && runs.runs[0]).toMatchObject({
      status: DiscoveryRunStatus.Succeeded,
      signalsRead: 2,
      proposed: 1,
    });
  });
});
