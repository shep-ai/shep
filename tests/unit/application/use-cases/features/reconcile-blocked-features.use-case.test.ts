/**
 * ReconcileBlockedFeaturesUseCase Unit Tests
 *
 * Verifies the self-healing sweep that restores the dependency-gate invariant:
 * no feature stays Blocked once its parent has passed the Implementation gate.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BLOCKED_ON_PARENT_PHASE,
  ReconcileBlockedFeaturesUseCase,
} from '@/application/use-cases/features/reconcile-blocked-features.use-case.js';
import type { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import { SdlcLifecycle, BuildMode, AgentRunStatus, AgentType } from '@/domain/generated/output.js';
import type { AgentRun, Feature, PhaseTiming } from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';
import { createFakeAgentRunRepository } from '../../../../helpers/agent-run-repository.fake.js';

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Blocked,
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
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Feature;
}

describe('ReconcileBlockedFeaturesUseCase', () => {
  let useCase: ReconcileBlockedFeaturesUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockCheckAndUnblock: CheckAndUnblockFeaturesUseCase;
  let runRepo: ReturnType<typeof createFakeAgentRunRepository>;
  let timings: PhaseTiming[];
  let timingRepo: IPhaseTimingRepository;
  let logger: ILogger;

  beforeEach(() => {
    mockFeatureRepo = createMockFeatureRepository();

    mockCheckAndUnblock = {
      execute: vi.fn().mockResolvedValue([]),
    } as unknown as CheckAndUnblockFeaturesUseCase;

    runRepo = createFakeAgentRunRepository();
    timings = [];
    timingRepo = {
      save: vi.fn(async (timing: PhaseTiming) => {
        timings.push(timing);
      }),
      update: vi.fn(),
      updateApprovalWait: vi.fn(),
      findByRunId: vi.fn(async (runId: string) => timings.filter((t) => t.agentRunId === runId)),
      findByRunIds: vi.fn(),
      findByFeatureId: vi.fn(),
    } as unknown as IPhaseTimingRepository;
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    useCase = new ReconcileBlockedFeaturesUseCase(
      mockFeatureRepo,
      mockCheckAndUnblock,
      runRepo as unknown as IAgentRunRepository,
      timingRepo,
      logger
    );
  });

  it('should query only Blocked features', async () => {
    await useCase.execute();

    expect(mockFeatureRepo.list).toHaveBeenCalledWith({ lifecycle: SdlcLifecycle.Blocked });
  });

  it('should be a no-op when nothing is Blocked', async () => {
    const result = await useCase.execute();

    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ unblockedFeatureIds: [] });
  });

  it('should delegate each stranded parent to CheckAndUnblockFeaturesUseCase', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute).mockResolvedValue(['child-1']);

    const result = await useCase.execute();

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('parent-1');
    expect(result).toEqual({ unblockedFeatureIds: ['child-1'] });
  });

  it('should evaluate each distinct parent exactly once', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
      makeFeature({ id: 'child-2', parentId: 'parent-1' }),
      makeFeature({ id: 'child-3', parentId: 'parent-2' }),
    ]);

    await useCase.execute();

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledTimes(2);
    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('parent-1');
    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('parent-2');
  });

  it('should ignore Blocked features that have no parent', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'orphan', parentId: undefined }),
    ]);

    await useCase.execute();

    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
  });

  it('should not duplicate ids reported by more than one parent', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
      makeFeature({ id: 'child-2', parentId: 'parent-2' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute)
      .mockResolvedValueOnce(['child-1'])
      .mockResolvedValueOnce(['child-1', 'child-2']);

    const result = await useCase.execute();

    expect(result.unblockedFeatureIds).toEqual(['child-1', 'child-2']);
  });

  it('should isolate a failing parent so the remaining parents are still evaluated', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
      makeFeature({ id: 'child-2', parentId: 'parent-2' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute)
      .mockRejectedValueOnce(new Error('rebase exploded'))
      .mockResolvedValueOnce(['child-2']);

    const result = await useCase.execute();

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledTimes(2);
    expect(result.unblockedFeatureIds).toEqual(['child-2']);
  });

  it('logs the error of a parent whose evaluation failed instead of swallowing it', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute).mockRejectedValue(new Error('rebase exploded'));

    await useCase.execute();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ parentId: 'parent-1', error: 'rebase exploded' })
    );
  });

  // A child of a parent whose agent failed stays Blocked forever, and nothing
  // said why. The gate is right to hold it; the silence is the defect.
  describe('a parent whose agent run failed', () => {
    const parentRun = (status: AgentRunStatus, error?: string): AgentRun => ({
      id: 'parent-run',
      agentType: AgentType.ClaudeCode,
      agentName: 'feature-agent',
      status,
      prompt: 'p',
      threadId: 't',
      featureId: 'parent-1',
      ...(error ? { error } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    beforeEach(() => {
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([
        makeFeature({ id: 'child-1', parentId: 'parent-1', agentRunId: 'child-run' }),
      ]);
      vi.mocked(mockFeatureRepo.findById).mockResolvedValue(
        makeFeature({
          id: 'parent-1',
          name: 'Parent work',
          lifecycle: SdlcLifecycle.Implementation,
          agentRunId: 'parent-run',
        })
      );
    });

    it.each([AgentRunStatus.failed, AgentRunStatus.interrupted])(
      'records why the child is still blocked when the parent run is %s',
      async (status) => {
        runRepo.seed(parentRun(status, 'Agent process (PID 7) crashed or was killed'));

        await useCase.execute();

        expect(timings).toHaveLength(1);
        expect(timings[0]).toMatchObject({
          agentRunId: 'child-run',
          phase: BLOCKED_ON_PARENT_PHASE,
          exitCode: 'error',
        });
        expect(timings[0].errorMessage).toContain('Parent work');
        expect(timings[0].errorMessage).toContain(status);
        expect(timings[0].errorMessage).toContain('crashed or was killed');
      }
    );

    it('records the reason once, not on every sweep', async () => {
      runRepo.seed(parentRun(AgentRunStatus.failed, 'boom'));

      await useCase.execute();
      await useCase.execute();

      expect(timings).toHaveLength(1);
    });

    it('records nothing while the parent is still running', async () => {
      runRepo.seed(parentRun(AgentRunStatus.running));

      await useCase.execute();

      expect(timings).toHaveLength(0);
    });

    it('leaves the gate itself alone — the child is not released', async () => {
      runRepo.seed(parentRun(AgentRunStatus.failed, 'boom'));

      await useCase.execute();

      expect(mockFeatureRepo.update).not.toHaveBeenCalled();
      expect(mockFeatureRepo.claimForStart).not.toHaveBeenCalled();
    });
  });
});
