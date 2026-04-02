/**
 * CheckAndUnblockFeaturesUseCase Unit Tests
 *
 * Verifies idempotent auto-unblocking behaviour:
 * - No-op when parent lifecycle is below Implementation gate
 * - No-op when no blocked children exist
 * - Transitions Blocked children to Started and calls spawn()
 * - Does not touch non-Blocked children
 * - Idempotent: second call finds no blocked children → spawn() called once total
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    agentRunId: 'run-001',
    specPath: '/repo/.shep/specs/001-test-feature',
    worktreePath: '/worktrees/test-feature',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CheckAndUnblockFeaturesUseCase', () => {
  let useCase: CheckAndUnblockFeaturesUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockAgentProcess: IFeatureAgentProcessService;

  const parentId = 'parent-001';

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdPrefix: vi.fn(),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockAgentProcess = {
      spawn: vi.fn().mockReturnValue(1234),
      isAlive: vi.fn(),
      checkAndMarkCrashed: vi.fn(),
    };

    useCase = new CheckAndUnblockFeaturesUseCase(mockFeatureRepo, mockAgentProcess);
  });

  // -------------------------------------------------------------------------
  // Gate checks — parent not in POST_IMPLEMENTATION
  // -------------------------------------------------------------------------

  it('should be a no-op when parent is not found', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  it('should be a no-op when parent lifecycle is Planning (below Implementation gate)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Planning });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  it('should be a no-op when parent lifecycle is Started (below gate)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  it('should be a no-op when parent lifecycle is Blocked', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate satisfied — no blocked children
  // -------------------------------------------------------------------------

  it('should be a no-op when parent lifecycle is Implementation but no blocked children', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const startedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([startedChild]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate satisfied — blocked children present
  // -------------------------------------------------------------------------

  it('should unblock a single blocked child when parent reaches Implementation', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    const updatedFeature = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updatedFeature.id).toBe('child-001');
    expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Started);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    expect(mockAgentProcess.spawn).toHaveBeenCalledWith(
      'child-001',
      blockedChild.agentRunId,
      blockedChild.repositoryPath,
      blockedChild.specPath,
      blockedChild.worktreePath,
      {
        approvalGates: blockedChild.approvalGates,
        push: blockedChild.push,
        openPr: blockedChild.openPr,
        forkAndPr: blockedChild.forkAndPr,
        commitSpecs: blockedChild.commitSpecs,
        ciWatchEnabled: blockedChild.ciWatchEnabled,
        enableEvidence: blockedChild.enableEvidence,
        commitEvidence: blockedChild.commitEvidence,
      }
    );
  });

  it('should unblock two blocked children when parent reaches Implementation', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const child1 = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-1',
      specPath: '/specs/1',
    });
    const child2 = makeFeature({
      id: 'child-002',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-2',
      specPath: '/specs/2',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([child1, child2]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).toHaveBeenCalledTimes(2);
    expect(mockAgentProcess.spawn).toHaveBeenCalledTimes(2);

    const updatedIds = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => (call[0] as Feature).id
    );
    expect(updatedIds).toContain('child-001');
    expect(updatedIds).toContain('child-002');
  });

  it('should only unblock blocked children, not already-started children', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({ id: 'blocked', lifecycle: SdlcLifecycle.Blocked });
    const startedChild = makeFeature({ id: 'started', lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild, startedChild]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    const updatedFeature = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updatedFeature.id).toBe('blocked');
    expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Started);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should work when parent lifecycle is Review (also in POST_IMPLEMENTATION)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Review });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should work when parent lifecycle is Maintain (also in POST_IMPLEMENTATION)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Maintain });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it('should be idempotent: second call finds no blocked children, spawn called once total', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });

    // First call: one blocked child
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi
      .fn()
      .mockResolvedValueOnce([blockedChild]) // first call: blocked child exists
      .mockResolvedValueOnce([{ ...blockedChild, lifecycle: SdlcLifecycle.Started }]); // second call: already started

    await useCase.execute(parentId);
    await useCase.execute(parentId);

    // spawn() called exactly once (on the first call only)
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    // update called exactly once (on the first call only)
    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Spawn call uses correct feature fields
  // -------------------------------------------------------------------------

  it('should call spawn() with the correct feature fields from the blocked child', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({
      id: 'child-abc',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-xyz',
      repositoryPath: '/my-repo',
      specPath: '/my-repo/specs/001-child',
      worktreePath: '/my-repo/.worktrees/child',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledWith(
      'child-abc',
      'run-xyz',
      '/my-repo',
      '/my-repo/specs/001-child',
      '/my-repo/.worktrees/child',
      {
        approvalGates: blockedChild.approvalGates,
        push: blockedChild.push,
        openPr: blockedChild.openPr,
        forkAndPr: blockedChild.forkAndPr,
        commitSpecs: blockedChild.commitSpecs,
        ciWatchEnabled: blockedChild.ciWatchEnabled,
        enableEvidence: blockedChild.enableEvidence,
        commitEvidence: blockedChild.commitEvidence,
      }
    );
  });

  it('should skip spawn() for a blocked child that has no agentRunId or specPath', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const incompleteChild = makeFeature({
      id: 'child-no-run',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: undefined,
      specPath: undefined,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([incompleteChild]);

    await useCase.execute(parentId);

    // Should still update lifecycle but NOT call spawn
    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });
});
