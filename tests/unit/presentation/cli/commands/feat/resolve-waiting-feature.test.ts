/**
 * resolveWaitingFeature Unit Tests
 *
 * Tests for the shared helper that resolves a feature waiting
 * for human approval, used by feat review/approve/reject commands.
 *
 * TDD Phase: RED
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunStatus, FeatureMode } from '@/domain/generated/output.js';
import type { Feature, AgentRun } from '@/domain/generated/output.js';
import { resolveWaitingFeature } from '../../../../../../src/presentation/cli/commands/feat/resolve-waiting-feature.js';

function createMockFeatureRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockRunRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
    updateStatus: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  };
}

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: 'Requirements' as any,
    messages: [],
    relatedArtifacts: [],
    agentRunId: 'run-001',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeWaitingRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-001',
    agentType: 'claude-code' as any,
    agentName: 'feature-agent',
    status: AgentRunStatus.waitingApproval,
    prompt: 'Test prompt',
    threadId: 'thread-001',
    featureId: 'feat-001',
    repositoryPath: '/repo',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('resolveWaitingFeature', () => {
  let featureRepo: ReturnType<typeof createMockFeatureRepo>;
  let runRepo: ReturnType<typeof createMockRunRepo>;

  beforeEach(() => {
    featureRepo = createMockFeatureRepo();
    runRepo = createMockRunRepo();
  });

  describe('with explicit feature ID', () => {
    it('should return feature and run when found and waiting', async () => {
      const feature = makeFeature();
      const run = makeWaitingRun();
      featureRepo.findById.mockResolvedValue(feature);
      featureRepo.findByIdPrefix.mockResolvedValue(feature);
      runRepo.findById.mockResolvedValue(run);

      const result = await resolveWaitingFeature({
        featureId: 'feat-001',
        repoPath: '/repo',
        featureRepo: featureRepo as any,
        runRepo: runRepo as any,
      });

      expect(result.feature).toBe(feature);
      expect(result.run).toBe(run);
    });

    it('should throw when feature not found', async () => {
      featureRepo.findById.mockResolvedValue(null);
      featureRepo.findByIdPrefix.mockResolvedValue(null);

      await expect(
        resolveWaitingFeature({
          featureId: 'non-existent',
          repoPath: '/repo',
          featureRepo: featureRepo as any,
          runRepo: runRepo as any,
        })
      ).rejects.toThrow(/not found/i);
    });

    it('should throw when feature has no agent run', async () => {
      const feature = makeFeature({ agentRunId: undefined });
      featureRepo.findById.mockResolvedValue(feature);
      featureRepo.findByIdPrefix.mockResolvedValue(feature);

      await expect(
        resolveWaitingFeature({
          featureId: 'feat-001',
          repoPath: '/repo',
          featureRepo: featureRepo as any,
          runRepo: runRepo as any,
        })
      ).rejects.toThrow(/no agent run/i);
    });

    it('should throw when agent run is not waiting for approval', async () => {
      const feature = makeFeature();
      const run = makeWaitingRun({ status: AgentRunStatus.running });
      featureRepo.findById.mockResolvedValue(feature);
      featureRepo.findByIdPrefix.mockResolvedValue(feature);
      runRepo.findById.mockResolvedValue(run);

      await expect(
        resolveWaitingFeature({
          featureId: 'feat-001',
          repoPath: '/repo',
          featureRepo: featureRepo as any,
          runRepo: runRepo as any,
        })
      ).rejects.toThrow(/not waiting/i);
    });
  });

  describe('auto-resolve (no feature ID)', () => {
    it('should return the single waiting feature', async () => {
      const feature = makeFeature();
      const run = makeWaitingRun();
      featureRepo.list.mockResolvedValue([feature]);
      runRepo.findById.mockResolvedValue(run);

      const result = await resolveWaitingFeature({
        repoPath: '/repo',
        featureRepo: featureRepo as any,
        runRepo: runRepo as any,
      });

      expect(result.feature).toBe(feature);
      expect(result.run).toBe(run);
    });

    it('should throw when no features are waiting', async () => {
      featureRepo.list.mockResolvedValue([makeFeature()]);
      runRepo.findById.mockResolvedValue(makeWaitingRun({ status: AgentRunStatus.running }));

      await expect(
        resolveWaitingFeature({
          repoPath: '/repo',
          featureRepo: featureRepo as any,
          runRepo: runRepo as any,
        })
      ).rejects.toThrow(/no features waiting/i);
    });

    it('should throw when multiple features are waiting', async () => {
      const feat1 = makeFeature({ id: 'feat-001', name: 'Feature 1', agentRunId: 'run-001' });
      const feat2 = makeFeature({ id: 'feat-002', name: 'Feature 2', agentRunId: 'run-002' });
      featureRepo.list.mockResolvedValue([feat1, feat2]);
      runRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'run-001') return makeWaitingRun({ id: 'run-001' });
        if (id === 'run-002') return makeWaitingRun({ id: 'run-002' });
        return null;
      });

      await expect(
        resolveWaitingFeature({
          repoPath: '/repo',
          featureRepo: featureRepo as any,
          runRepo: runRepo as any,
        })
      ).rejects.toThrow(/multiple features/i);
    });

    it('should skip features without agent runs', async () => {
      const feat1 = makeFeature({ id: 'feat-001', agentRunId: undefined });
      const feat2 = makeFeature({ id: 'feat-002', agentRunId: 'run-002' });
      featureRepo.list.mockResolvedValue([feat1, feat2]);
      runRepo.findById.mockResolvedValue(makeWaitingRun({ id: 'run-002' }));

      const result = await resolveWaitingFeature({
        repoPath: '/repo',
        featureRepo: featureRepo as any,
        runRepo: runRepo as any,
      });

      expect(result.feature.id).toBe('feat-002');
    });

    it('should scope search to repository path', async () => {
      await resolveWaitingFeature({
        repoPath: '/my/repo',
        featureRepo: featureRepo as any,
        runRepo: runRepo as any,
      }).catch(() => undefined);

      expect(featureRepo.list).toHaveBeenCalledWith({ repositoryPath: '/my/repo' });
    });
  });
});
