import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SyncTrackerRulesUseCase } from '@/application/use-cases/trackers/sync-tracker-rules.use-case.js';
import type { RunTrackerSyncUseCase } from '@/application/use-cases/trackers/run-tracker-sync.use-case.js';
import { TrackerSyncDirection, type TrackerSyncRule } from '@/domain/generated/output.js';
import { InMemoryTrackerRules } from '../../../../helpers/tracker-repositories.mock.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const rule = (id: string, over: Partial<TrackerSyncRule> = {}): TrackerSyncRule => ({
  id,
  connectionId: 'c',
  projectId: 'p',
  scope: 'ENG',
  direction: TrackerSyncDirection.Import,
  intervalMinutes: 15,
  enabled: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

async function setup(...list: TrackerSyncRule[]) {
  const rules = new InMemoryTrackerRules();
  for (const r of list) await rules.create(r);
  const run = {
    execute: vi.fn(async (id: string) =>
      id === 'broken' ? { ok: false, error: 'gone' } : { ok: true, rule: { id }, summary: {} }
    ),
  };
  return {
    run,
    useCase: new SyncTrackerRulesUseCase(rules, run as unknown as RunTrackerSyncUseCase),
  };
}

describe('SyncTrackerRulesUseCase', () => {
  it('runs only enabled rules whose interval has passed', async () => {
    const { run, useCase } = await setup(
      rule('due'),
      rule('recent', { lastRunAt: new Date('2026-10-01T11:55:00Z') }),
      rule('off', { enabled: false })
    );
    const results = await useCase.runDue(NOW);
    expect(run.execute.mock.calls.map(([id]) => id)).toEqual(['due']);
    expect(results).toHaveLength(1);
  });

  it('runs every enabled rule on demand, one after another, reporting each', async () => {
    const { run, useCase } = await setup(
      rule('a'),
      rule('broken'),
      rule('off', { enabled: false })
    );
    const results = await useCase.runAll();
    expect(run.execute.mock.calls.map(([id]) => id)).toEqual(['a', 'broken']);
    expect(results).toEqual([expect.objectContaining({ ok: true }), { ok: false, error: 'gone' }]);
  });
});
