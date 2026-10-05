import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageOpportunityWeightsUseCase } from '@/application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { SyncDiscoveryUseCase } from '@/application/use-cases/discovery/sync-discovery.use-case.js';
import { ListDiscoveryRunsUseCase } from '@/application/use-cases/discovery/list-discovery-runs.use-case.js';
import type { RunDiscoveryUseCase } from '@/application/use-cases/discovery/run-discovery.use-case.js';
import { DiscoveryRunStatus } from '@/domain/generated/output.js';
import { InMemoryDiscoveryRuns } from '../../../../helpers/discovery-runs.mock.js';
import { DEFAULT_SPACE } from '../../../../helpers/space-repositories.mock.js';
import { ACME, opportunityWorld } from '../opportunities/opportunity.fixtures.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-10-05T12:00:00Z');

describe('Discovery schedule', () => {
  let world: ReturnType<typeof opportunityWorld>;
  let weights: ManageOpportunityWeightsUseCase;
  let runs: InMemoryDiscoveryRuns;
  let run: { execute: ReturnType<typeof vi.fn> };
  let sync: SyncDiscoveryUseCase;

  beforeEach(() => {
    world = opportunityWorld();
    weights = new ManageOpportunityWeightsUseCase(world.weights, world.spaces, world.productLines);
    runs = new InMemoryDiscoveryRuns();
    run = { execute: vi.fn(async () => ({ ok: true })) };
    sync = new SyncDiscoveryUseCase(world.weights, runs, run as unknown as RunDiscoveryUseCase);
  });

  it('turns discovery on and off for a space, within bounds', async () => {
    const on = await weights.setDiscovery('acme', 24);
    expect(on.ok && on.weights.discoveryEveryHours).toBe(24);
    expect((await weights.setDiscovery('acme', 0)).ok).toBe(false);
    expect((await weights.setDiscovery('acme', 10_000)).ok).toBe(false);
    const off = await weights.setDiscovery('acme', null);
    expect(off.ok && 'discoveryEveryHours' in off.weights).toBe(false);
  });

  it('runs only the spaces whose schedule is due', async () => {
    await weights.setDiscovery('acme', 24);
    await weights.setDiscovery('default', 6);
    await runs.create({
      id: 'recent',
      spaceId: ACME.id,
      status: DiscoveryRunStatus.Succeeded,
      signalsRead: 1,
      proposed: 0,
      dropped: 0,
      createdAt: new Date(NOW.getTime() - 2 * HOUR),
      updatedAt: NOW,
    });
    await sync.runDue(NOW);
    expect(run.execute.mock.calls).toEqual([[{ space: DEFAULT_SPACE.id }]]);

    run.execute.mockClear();
    await sync.runDue(new Date(NOW.getTime() + 23 * HOUR));
    expect(run.execute.mock.calls.map(([input]) => input.space)).toContain(ACME.id);
  });

  it('keeps going when one space fails', async () => {
    await weights.setDiscovery('acme', 1);
    await weights.setDiscovery('default', 1);
    run.execute.mockRejectedValueOnce(new Error('boom'));
    const outcomes = await sync.runDue(NOW);
    expect(run.execute).toHaveBeenCalledTimes(2);
    expect(outcomes.filter((o) => !o.ok)).toHaveLength(1);
  });

  it('lists a space history newest first', async () => {
    const list = new ListDiscoveryRunsUseCase(runs, world.spaces, world.productLines);
    for (const [id, hoursAgo] of [
      ['old', 5],
      ['new', 1],
    ] as const) {
      await runs.create({
        id,
        spaceId: ACME.id,
        status: DiscoveryRunStatus.Succeeded,
        signalsRead: 1,
        proposed: 1,
        dropped: 0,
        createdAt: new Date(NOW.getTime() - hoursAgo * HOUR),
        updatedAt: NOW,
      });
    }
    const result = await list.execute('acme');
    expect(result.ok && result.runs.map((r) => r.id)).toEqual(['new', 'old']);
    expect((await list.execute('nope')).ok).toBe(false);
  });
});
