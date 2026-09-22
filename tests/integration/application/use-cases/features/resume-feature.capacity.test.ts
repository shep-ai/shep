/**
 * Resume respects the parallel-feature cap (spec 116 follow-up)
 *
 * A stopped, failed or crashed run releases its slot, so resuming it is a start
 * like any other. Resume used to spawn a worker without taking a slot, so with
 * `maxParallelFeatures` set it pushed the machine past its cap; and two
 * concurrent resumes of one feature both spawned a worker into one worktree.
 *
 * Real SQLite, because the slot count and the claim are one SQL statement.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import { ResumeFeatureUseCase } from '@/application/use-cases/features/resume-feature.use-case.js';
import type { Feature } from '@/domain/generated/output.js';
import { AgentRunStatus, AgentType, BuildMode, SdlcLifecycle } from '@/domain/generated/output.js';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({}),
}));

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
    lifecycle: SdlcLifecycle.Implementation,
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
    agentRunId: `run-${id}`,
    specPath: `/wt/${id}/specs/001`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ResumeFeatureUseCase — parallel-feature cap', () => {
  let db: Database.Database;
  let features: SQLiteFeatureRepository;
  let runs: SQLiteAgentRunRepository;
  let spawn: ReturnType<typeof vi.fn>;
  let resume: ResumeFeatureUseCase;

  async function seed(id: string, status: AgentRunStatus): Promise<void> {
    await runs.create({
      id: `run-${id}`,
      agentType: AgentType.ClaudeCode,
      agentName: 'feature-agent',
      status,
      prompt: 'p',
      threadId: `thread-${id}`,
      featureId: id,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await features.create(makeFeature(id));
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    features = new SQLiteFeatureRepository(db);
    runs = new SQLiteAgentRunRepository(db);
    spawn = vi.fn().mockReturnValue(12345);
    const settings = { load: vi.fn(async () => ({ workflow: { maxParallelFeatures: LIMIT } })) };
    resume = new ResumeFeatureUseCase(
      features,
      runs,
      { spawn, isAlive: vi.fn(), checkAndMarkCrashed: vi.fn() } as never,
      { getWorktreePath: vi.fn().mockReturnValue('/wt/derived') } as never,
      settings as never,
      new FeatureCapacityService(features, settings as never)
    );
  });

  afterEach(() => {
    db.close();
  });

  it('refuses to resume past the cap, says why, and spawns nothing', async () => {
    await seed('busy', AgentRunStatus.running);
    await seed('stopped', AgentRunStatus.interrupted);

    await expect(resume.execute('stopped')).rejects.toThrow(/parallel|capacity|limit/i);

    expect(spawn).not.toHaveBeenCalled();
    // The feature still points at its old run, so it can be resumed later.
    expect((await features.findById('stopped'))?.agentRunId).toBe('run-stopped');
  });

  it('resumes into a free slot', async () => {
    await seed('stopped', AgentRunStatus.interrupted);

    const { newRun } = await resume.execute('stopped');

    expect(spawn).toHaveBeenCalledOnce();
    expect((await features.findById('stopped'))?.agentRunId).toBe(newRun.id);
  });

  it('spawns exactly one worker when the same feature is resumed twice at once', async () => {
    await seed('stopped', AgentRunStatus.failed);
    // Unlimited would let both through the cap; the claim must still be single.
    const outcomes = await Promise.allSettled([
      resume.execute('stopped', { bypassCapacityLimit: true }),
      resume.execute('stopped', { bypassCapacityLimit: true }),
    ]);

    expect(spawn).toHaveBeenCalledOnce();
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  });
});
