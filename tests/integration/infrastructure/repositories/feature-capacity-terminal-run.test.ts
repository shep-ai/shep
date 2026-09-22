/**
 * Parallel-Capacity: a finished agent run releases its slot
 *
 * The running count used to be derived from the feature lifecycle alone. A
 * worker that is SIGKILLed, OOM-killed, stopped or fails leaves the lifecycle in
 * a running phase — the failure path even resets it to `Started`, which is
 * itself a running lifecycle — so with `maxParallelFeatures` set, every such
 * feature held a slot forever and the queue never drained.
 *
 * These run against real SQLite through FeatureCapacityService, because the
 * rule is only right if the service hands the repository the statuses AND the
 * repository's SQL honours them inside the same statement as the claim.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { Feature } from '@/domain/generated/output.js';
import { AgentRunStatus, AgentType, BuildMode, SdlcLifecycle } from '@/domain/generated/output.js';

const LIMIT = 1;

function makeFeature(id: string, overrides?: Partial<Feature>): Feature {
  return {
    id,
    name: id,
    slug: id,
    description: '',
    userQuery: '',
    repositoryPath: '/repo',
    branch: `feat/${id}`,
    lifecycle: SdlcLifecycle.Pending,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('FeatureCapacityService — slots held by finished runs', () => {
  let db: Database.Database;
  let features: SQLiteFeatureRepository;
  let runs: SQLiteAgentRunRepository;
  let capacity: FeatureCapacityService;

  /** A feature in a running lifecycle whose current agent run has `status`. */
  async function occupy(id: string, status: AgentRunStatus): Promise<void> {
    const runId = `run-${id}`;
    await runs.create({
      id: runId,
      agentType: AgentType.ClaudeCode,
      agentName: 'feature-agent',
      status,
      prompt: 'p',
      threadId: runId,
      featureId: id,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await features.create(makeFeature(id, { lifecycle: SdlcLifecycle.Started, agentRunId: runId }));
  }

  async function queue(id: string): Promise<void> {
    await features.create(makeFeature(id, { queuedAt: new Date('2026-01-02T00:00:00Z') }));
  }

  const claimQueued = (featureId: string) =>
    capacity.claimSlot({
      featureId,
      targetLifecycle: SdlcLifecycle.Requirements,
      requireQueued: true,
    });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    features = new SQLiteFeatureRepository(db);
    runs = new SQLiteAgentRunRepository(db);
    const settings = {
      load: async () => ({ workflow: { maxParallelFeatures: LIMIT } }),
    } as unknown as ISettingsRepository;
    capacity = new FeatureCapacityService(features, settings);
  });

  afterEach(() => {
    db.close();
  });

  it.each([
    AgentRunStatus.failed,
    AgentRunStatus.interrupted,
    AgentRunStatus.cancelled,
    AgentRunStatus.completed,
  ])('does not count a feature whose agent run is %s', async (status) => {
    await occupy('stuck', status);

    expect(await capacity.getRunningCount()).toBe(0);
  });

  it('admits a queued feature into the slot a failed run left behind', async () => {
    await occupy('crashed', AgentRunStatus.failed);
    await queue('next');

    expect(await claimQueued('next')).toBe(true);
    expect((await features.findById('next'))?.lifecycle).toBe(SdlcLifecycle.Requirements);
  });

  it.each([AgentRunStatus.running, AgentRunStatus.pending, AgentRunStatus.waitingApproval])(
    'still counts a feature whose agent run is %s',
    async (status) => {
      await occupy('busy', status);
      await queue('next');

      expect(await capacity.getRunningCount()).toBe(1);
      expect(await claimQueued('next')).toBe(false);
    }
  );

  it('still counts a running-lifecycle feature with no agent run recorded yet', async () => {
    await features.create(makeFeature('booting', { lifecycle: SdlcLifecycle.Started }));

    expect(await capacity.getRunningCount()).toBe(1);
  });
});
