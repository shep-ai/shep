import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { CoordinateFeatureConflictsUseCase } from '@/application/use-cases/features/coordinate-feature-conflicts.use-case.js';
import { ReparentFeatureUseCase } from '@/application/use-cases/features/reparent-feature.use-case.js';
import { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type {
  IGitPrService,
  FileDiff,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { StopAgentRunUseCase } from '@/application/use-cases/agents/stop-agent-run.use-case.js';
import type { SyncFeatureBranchUseCase } from '@/application/use-cases/features/sync-feature-branch.use-case.js';
import type { SpawnFeatureAgentUseCase } from '@/application/use-cases/features/spawn-feature-agent.use-case.js';
import type { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import { BuildMode, SdlcLifecycle, type Feature } from '@/domain/generated/output.js';

function workcell(id: string, runId?: string): Feature {
  return {
    id,
    name: id,
    slug: id,
    branch: `feat/${id}`,
    repositoryPath: '/repo',
    lifecycle: SdlcLifecycle.Implementation,
    agentRunId: runId,
    description: '',
    userQuery: '',
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('S2 coordination: real application use-case closure', () => {
  it('model defer blocks a live workcell and parent completion rebases and resumes it', async () => {
    const first = workcell('a-workcell');
    const second = workcell('b-workcell', 'run-b');
    const store = new Map<string, Feature>([
      [first.id, first],
      [second.id, second],
    ]);
    const repo = {
      findById: vi.fn(async (id: string) => store.get(id) ?? null),
      list: vi.fn(async () => [...store.values()]),
      findByParentId: vi.fn(async (id: string) =>
        [...store.values()].filter((entry) => entry.parentId === id)
      ),
      update: vi.fn(async (feature: Feature) => {
        store.set(feature.id, { ...feature });
      }),
    } as unknown as IFeatureRepository;
    const diff: FileDiff = {
      path: 'src/shared.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      hunks: [],
    };
    const git = {
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      revParse: vi.fn().mockResolvedValue('stable-sha'),
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      getFileDiffs: vi.fn().mockResolvedValue([diff]),
    } as unknown as IGitPrService;
    const worktrees = {
      exists: vi.fn().mockResolvedValue(true),
      getWorktreePath: vi.fn((_repo: string, branch: string) => `/repo/${branch}`),
    } as unknown as IWorktreeService;
    const agent = {
      getExecutor: vi.fn().mockResolvedValue({
        execute: vi.fn().mockResolvedValue({
          result: '{"action":"defer","rationale":"Prevent shared-file integration churn."}',
        }),
      }),
    } as unknown as IAgentExecutorProvider;
    const stop = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as StopAgentRunUseCase;
    const sync = {
      execute: vi.fn().mockResolvedValue({}),
    } as unknown as SyncFeatureBranchUseCase;
    const spawn = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as SpawnFeatureAgentUseCase;
    const runs = {
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAgentRunRepository;
    const timings = {
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPhaseTimingRepository;
    const capacity = {
      claimSlot: vi.fn(async (input: { featureId: string; targetLifecycle: SdlcLifecycle }) => {
        const child = store.get(input.featureId);
        if (!child) return false;
        store.set(child.id, { ...child, lifecycle: input.targetLifecycle });
        return true;
      }),
    } as unknown as FeatureCapacityService;
    const unblock = new CheckAndUnblockFeaturesUseCase(repo, sync, runs, timings, spawn, capacity);
    const reparent = new ReparentFeatureUseCase(repo, unblock, stop);
    const coordinator = new CoordinateFeatureConflictsUseCase(
      repo,
      git,
      worktrees,
      agent,
      reparent
    );

    expect(await coordinator.execute(first.id)).toBe('deferred');
    expect(store.get(second.id)).toMatchObject({
      parentId: first.id,
      lifecycle: SdlcLifecycle.Blocked,
    });
    expect(stop.execute).toHaveBeenCalledWith('run-b');
    expect(spawn.execute).not.toHaveBeenCalled();

    const parent = store.get(first.id)!;
    await repo.update({ ...parent, lifecycle: SdlcLifecycle.Maintain });
    expect(await unblock.execute(first.id)).toEqual([second.id]);
    expect(store.get(second.id)?.lifecycle).toBe(SdlcLifecycle.Started);
    expect(sync.execute).toHaveBeenCalledWith(
      expect.objectContaining({ branch: second.branch, parentBranch: first.branch })
    );
    expect(spawn.execute).toHaveBeenCalledOnce();
  });
});
