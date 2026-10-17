import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoordinateFeatureConflictsUseCase } from '@/application/use-cases/features/coordinate-feature-conflicts.use-case.js';
import type { ReparentFeatureUseCase } from '@/application/use-cases/features/reparent-feature.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type {
  IGitPrService,
  FileDiff,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import {
  BuildMode,
  CoordinationAction,
  CoordinationOutcome,
  SdlcLifecycle,
  type Feature,
  type Settings,
} from '@/domain/generated/output.js';

function makeFeature(id: string, branch: string, overrides: Partial<Feature> = {}): Feature {
  return {
    id,
    branch,
    name: id,
    slug: id,
    description: id,
    userQuery: id,
    repositoryPath: '/repo',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function changed(path: string): FileDiff {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    hunks: [],
  };
}

describe('CoordinateFeatureConflictsUseCase', () => {
  const current = makeFeature('current', 'feat/current');
  const peer = makeFeature('peer', 'feat/peer');
  let files: Record<string, FileDiff[]>;
  let git: IGitPrService;
  let features: IFeatureRepository;
  let worktrees: IWorktreeService;
  let executor: { execute: ReturnType<typeof vi.fn> };
  let agentProvider: IAgentExecutorProvider;
  let reparent: ReparentFeatureUseCase;
  let settings: ISettingsRepository;
  let useCase: CoordinateFeatureConflictsUseCase;

  beforeEach(() => {
    files = {
      '/repo/.worktrees/feat/current': [changed('src/shared.ts')],
      '/repo/.worktrees/feat/peer': [changed('src/shared.ts')],
    };
    git = {
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      getFileDiffs: vi.fn().mockImplementation(async (cwd: string) => files[cwd] ?? []),
      revParse: vi.fn().mockResolvedValue('immutable-head'),
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    } as unknown as IGitPrService;
    worktrees = {
      exists: vi.fn().mockResolvedValue(true),
      getWorktreePath: vi
        .fn()
        .mockImplementation((_repo: string, branch: string) => `/repo/.worktrees/${branch}`),
    } as unknown as IWorktreeService;
    features = {
      findById: vi.fn().mockResolvedValue(current),
      list: vi.fn().mockResolvedValue([current, peer]),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFeatureRepository;
    settings = {
      load: vi
        .fn()
        .mockResolvedValue({ featureFlags: { agentCoordination: true } } as unknown as Settings),
    } as unknown as ISettingsRepository;
    executor = {
      execute: vi.fn().mockResolvedValue({
        result: JSON.stringify({ action: 'defer', rationale: 'Preserve the shared API change.' }),
      }),
    };
    agentProvider = {
      getExecutor: vi.fn().mockResolvedValue(executor),
    } as unknown as IAgentExecutorProvider;
    reparent = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReparentFeatureUseCase;

    useCase = new CoordinateFeatureConflictsUseCase(
      features,
      git,
      worktrees,
      agentProvider,
      reparent,
      settings
    );
  });

  it('does nothing at all while the agentCoordination flag is off', async () => {
    vi.mocked(settings.load).mockResolvedValue({
      featureFlags: { agentCoordination: false },
    } as unknown as Settings);
    expect(await useCase.execute('current')).toBe(CoordinationOutcome.Disabled);
    expect(features.findById).not.toHaveBeenCalled();
    expect(git.getFileDiffs).not.toHaveBeenCalled();
    expect(agentProvider.getExecutor).not.toHaveBeenCalled();
  });

  it('stores the deferral and its reason on the dependent, with the edge', async () => {
    expect(await useCase.execute('current')).toBe(CoordinationOutcome.Deferred);
    expect(reparent.execute).toHaveBeenCalledWith({
      featureId: 'peer',
      parentId: 'current',
      coordination: expect.objectContaining({
        action: CoordinationAction.Defer,
        rationale: 'Preserve the shared API change.',
        peerFeatureId: 'current',
        overlappingPaths: ['src/shared.ts'],
        decidedAt: expect.any(Date),
      }),
    });
  });

  it('stores a continue decision on the dependent without drawing an edge', async () => {
    executor.execute.mockResolvedValue({
      result: '{"action":"continue","rationale":"Independent additive changes."}',
    });
    expect(await useCase.execute('current')).toBe(CoordinationOutcome.Continued);
    expect(features.update).toHaveBeenCalledOnce();
    const written = vi.mocked(features.update).mock.calls[0][0];
    expect(written.id).toBe('peer');
    expect(written.parentId).toBeUndefined();
    expect(written.coordination).toMatchObject({
      action: CoordinationAction.Continue,
      rationale: 'Independent additive changes.',
      peerFeatureId: 'current',
    });
  });

  it('lets the model defer one workcell behind the interfering peer', async () => {
    expect(await useCase.execute('current')).toBe('deferred');
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(executor.execute).toHaveBeenCalledWith(
      expect.stringContaining('src/shared.ts'),
      expect.objectContaining({ maxTurns: 1, disableMcp: true, tools: [] })
    );
    // Stable direction: higher ID waits for lower ID, whoever triggers first.
    expect(reparent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ featureId: 'peer', parentId: 'current' })
    );
  });

  it('lets the model deliberately continue after seeing an overlap', async () => {
    executor.execute.mockResolvedValue({
      result: '{"action":"continue","rationale":"Independent additive changes."}',
    });
    expect(await useCase.execute('current')).toBe('continued');
    expect(reparent.execute).not.toHaveBeenCalled();
  });

  it('does nothing for disjoint committed changes', async () => {
    files['/repo/.worktrees/feat/peer'] = [changed('src/other.ts')];
    expect(await useCase.execute('current')).toBe('no-conflict');
    expect(agentProvider.getExecutor).not.toHaveBeenCalled();
  });

  it('fails closed on missing worktrees', async () => {
    vi.mocked(worktrees.exists).mockResolvedValue(false);
    expect(await useCase.execute('current')).toBe('unavailable');
    expect(agentProvider.getExecutor).not.toHaveBeenCalled();
  });

  it('fails closed on ambiguous competing peers', async () => {
    const third = makeFeature('third', 'feat/third');
    vi.mocked(features.list).mockResolvedValue([current, peer, third]);
    files['/repo/.worktrees/feat/third'] = [changed('src/shared.ts')];
    expect(await useCase.execute('current')).toBe('unavailable');
    expect(agentProvider.getExecutor).not.toHaveBeenCalled();
  });

  it('does not reinterpret existing dependencies as new authority', async () => {
    vi.mocked(features.findById).mockResolvedValue(
      makeFeature('current', 'feat/current', { parentId: 'another' })
    );
    expect(await useCase.execute('current')).toBe('no-conflict');
    expect(agentProvider.getExecutor).not.toHaveBeenCalled();
  });

  it('rejects unstructured or invalid model decisions', async () => {
    executor.execute.mockResolvedValue({ result: 'defer please' });
    expect(await useCase.execute('current')).toBe('unavailable');
    expect(reparent.execute).not.toHaveBeenCalled();
  });

  it('rejects stale Git evidence after model inference', async () => {
    let observations = 0;
    vi.mocked(git.getFileDiffs).mockImplementation(async (cwd: string) => {
      observations += 1;
      return cwd.includes('peer') && observations > 2
        ? [changed('src/changed-since-model.ts')]
        : [changed('src/shared.ts')];
    });
    expect(await useCase.execute('current')).toBe('stale');
    expect(reparent.execute).not.toHaveBeenCalled();
  });

  it('rejects dirty worktrees instead of treating uncommitted edits as complete evidence', async () => {
    vi.mocked(git.hasUncommittedChanges).mockResolvedValue(true);
    expect(await useCase.execute('current')).toBe('unavailable');
    expect(executor.execute).not.toHaveBeenCalled();
    expect(reparent.execute).not.toHaveBeenCalled();
  });

  it('rejects changes to the base branch after inference', async () => {
    let reads = 0;
    vi.mocked(git.revParse).mockImplementation(async (_cwd, ref) => {
      if (ref === 'HEAD') return 'unchanged-feature-head';
      reads += 1;
      return reads > 2 ? 'moved-base-head' : 'original-base-head';
    });
    expect(await useCase.execute('current')).toBe('stale');
    expect(reparent.execute).not.toHaveBeenCalled();
  });

  it('uses the same dependency direction when the other feature reports the collision', async () => {
    vi.mocked(features.findById).mockImplementation(async (id: string) =>
      id === 'peer' ? peer : current
    );
    expect(await useCase.execute('peer')).toBe('deferred');
    expect(reparent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ featureId: 'peer', parentId: 'current' })
    );
  });

  it('does not delegate authority to a model when its executor fails', async () => {
    vi.mocked(agentProvider.getExecutor).mockRejectedValue(new Error('provider offline'));
    expect(await useCase.execute('current')).toBe('unavailable');
    expect(reparent.execute).not.toHaveBeenCalled();
  });

  it('rejects peers whose dependency has already been satisfied', async () => {
    const ready = makeFeature('peer', 'feat/peer', { lifecycle: SdlcLifecycle.Maintain });
    vi.mocked(features.list).mockResolvedValue([current, ready]);
    expect(await useCase.execute('current')).toBe('no-conflict');
    expect(reparent.execute).not.toHaveBeenCalled();
  });
});
