/**
 * BatchApproveFeaturesUseCase Unit Tests
 *
 * Verifies batch approval execution, gate type filtering, and error isolation.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchApproveFeaturesUseCase } from '@/application/use-cases/fleet/batch-approve-features.use-case.js';
import type { IFleetRepository } from '@/application/ports/output/repositories/fleet-repository.interface.js';
import { type ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import {
  FleetTriagePriority,
  FleetTriageCategory,
  GuardrailGateType,
  type FleetTriageItem,
} from '@/domain/generated/output.js';

describe('BatchApproveFeaturesUseCase', () => {
  let useCase: BatchApproveFeaturesUseCase;
  let mockFleetRepo: IFleetRepository;
  let mockApproveUseCase: ApproveAgentRunUseCase;
  let mockLowRisk: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFleetRepo = {
      getOverview: vi.fn(),
      listTriageItems: vi.fn(),
      getConsecutiveFailures: vi.fn(),
      getRollingFailureRate: vi.fn(),
    };

    mockApproveUseCase = {
      execute: vi.fn(),
    } as unknown as ApproveAgentRunUseCase;

    mockLowRisk = { execute: vi.fn().mockResolvedValue({ lowRisk: true, reason: 'low risk' }) };

    useCase = new BatchApproveFeaturesUseCase(
      mockFleetRepo,
      mockApproveUseCase,
      mockLowRisk as never
    );
  });

  it('should sequentially approve all candidate gate items and return batch summary', async () => {
    const candidates: FleetTriageItem[] = [
      {
        featureId: 'f1',
        featureName: 'Feature 1',
        slug: 'feat-1',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'plan',
        runId: 'run-1',
        reason: 'Waiting plan approval',
        createdAt: '2026-09-11T12:00:00Z',
      },
      {
        featureId: 'f2',
        featureName: 'Feature 2',
        slug: 'feat-2',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'merge',
        runId: 'run-2',
        reason: 'Waiting merge approval',
        createdAt: '2026-09-11T12:05:00Z',
      },
    ];

    vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue(candidates);
    vi.mocked(mockApproveUseCase.execute).mockResolvedValue({ approved: true, reason: 'Approved' });

    const result = await useCase.execute();

    expect(result.totalAttempted).toBe(2);
    expect(result.approvedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.approvedFeatureIds).toEqual(['f1', 'f2']);
    expect(mockApproveUseCase.execute).toHaveBeenCalledTimes(2);
    expect(mockApproveUseCase.execute).toHaveBeenCalledWith('run-1');
    expect(mockApproveUseCase.execute).toHaveBeenCalledWith('run-2');
  });

  it('should filter candidates by gateType when provided', async () => {
    const candidates: FleetTriageItem[] = [
      {
        featureId: 'f1',
        featureName: 'Feature 1',
        slug: 'feat-1',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'plan',
        runId: 'run-1',
        reason: 'Waiting plan approval',
        createdAt: '2026-09-11T12:00:00Z',
      },
      {
        featureId: 'f2',
        featureName: 'Feature 2',
        slug: 'feat-2',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'merge',
        runId: 'run-2',
        reason: 'Waiting merge approval',
        createdAt: '2026-09-11T12:05:00Z',
      },
    ];

    vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue(candidates);
    vi.mocked(mockApproveUseCase.execute).mockResolvedValue({ approved: true, reason: 'Approved' });

    const result = await useCase.execute({ gateType: GuardrailGateType.plan });

    expect(result.totalAttempted).toBe(1);
    expect(result.approvedCount).toBe(1);
    expect(result.approvedFeatureIds).toEqual(['f1']);
    expect(mockApproveUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockApproveUseCase.execute).toHaveBeenCalledWith('run-1');
  });

  it('should isolate errors so one failed approval does not block the remaining batch', async () => {
    const candidates: FleetTriageItem[] = [
      {
        featureId: 'f1',
        featureName: 'Feature 1',
        slug: 'feat-1',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'prd',
        runId: 'run-1',
        reason: 'Waiting PRD',
        createdAt: '2026-09-11T12:00:00Z',
      },
      {
        featureId: 'f2',
        featureName: 'Feature 2',
        slug: 'feat-2',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'prd',
        runId: 'run-2',
        reason: 'Waiting PRD',
        createdAt: '2026-09-11T12:05:00Z',
      },
    ];

    vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue(candidates);
    // f1 fails, f2 succeeds
    vi.mocked(mockApproveUseCase.execute)
      .mockResolvedValueOnce({ approved: false, reason: 'Worktree lock busy' })
      .mockResolvedValueOnce({ approved: true, reason: 'Approved' });

    const result = await useCase.execute();

    expect(result.totalAttempted).toBe(2);
    expect(result.approvedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.failures[0]).toEqual({
      featureId: 'f1',
      reason: 'Worktree lock busy',
    });
    expect(result.approvedFeatureIds).toEqual(['f2']);
  });

  it('should select nothing when featureIds is an empty array', async () => {
    // A stale or emptied selection must never widen into "the whole fleet".
    // This is the same footgun `fleet retry` removed.
    vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue([
      {
        featureId: 'f1',
        featureName: 'Feature 1',
        slug: 'feat-1',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        gateType: 'plan',
        runId: 'run-1',
        reason: 'Waiting plan approval',
        createdAt: '2026-09-11T12:00:00Z',
      },
    ]);

    const result = await useCase.execute({ featureIds: [] });

    expect(result.totalAttempted).toBe(0);
    expect(mockApproveUseCase.execute).not.toHaveBeenCalled();
  });

  describe('the --low-risk filter', () => {
    const gate = (featureId: string, gateType: string): FleetTriageItem => ({
      featureId,
      featureName: featureId,
      slug: featureId,
      priority: FleetTriagePriority.p1,
      category: FleetTriageCategory.gate,
      gateType,
      runId: `run-${featureId}`,
      reason: 'waiting',
      createdAt: '2026-09-11T12:00:00Z',
    });

    it('approves only the candidates the guardrails prove low-risk', async () => {
      vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue([
        gate('safe', 'plan'),
        gate('risky', 'plan'),
      ]);
      mockLowRisk.execute.mockImplementation(({ featureId }: { featureId: string }) =>
        Promise.resolve(
          featureId === 'safe'
            ? { lowRisk: true, reason: 'Auto-approved by guardrail rule' }
            : { lowRisk: false, reason: 'Diff lines (900) exceed maximum permitted (200)' }
        )
      );
      vi.mocked(mockApproveUseCase.execute).mockResolvedValue({
        approved: true,
        reason: 'Approved',
      });

      const result = await useCase.execute({ lowRisk: true });

      expect(result.approvedFeatureIds).toEqual(['safe']);
      expect(mockApproveUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockApproveUseCase.execute).toHaveBeenCalledWith('run-safe');
      expect(result.skippedCount).toBe(1);
      expect(result.skipped).toEqual([
        { featureId: 'risky', reason: 'Diff lines (900) exceed maximum permitted (200)' },
      ]);
    });

    it('approves nothing when no guardrail rules are configured', async () => {
      // The CLI has to be able to say "nothing is low-risk" instead of approving
      // everything, which would make --low-risk a synonym for --all.
      vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue([
        gate('f1', 'plan'),
        gate('f2', 'plan'),
      ]);
      mockLowRisk.execute.mockResolvedValue({
        lowRisk: false,
        reason: 'No guardrail rules configured for the plan gate — nothing is low-risk',
      });

      const result = await useCase.execute({ lowRisk: true });

      expect(result.totalAttempted).toBe(2);
      expect(result.approvedCount).toBe(0);
      expect(result.skippedCount).toBe(2);
      expect(mockApproveUseCase.execute).not.toHaveBeenCalled();
    });

    it('does not consult the guardrails when the flag is not requested', async () => {
      vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue([gate('f1', 'plan')]);
      vi.mocked(mockApproveUseCase.execute).mockResolvedValue({
        approved: true,
        reason: 'Approved',
      });

      await useCase.execute({ gateType: GuardrailGateType.plan });

      expect(mockLowRisk.execute).not.toHaveBeenCalled();
      expect(mockApproveUseCase.execute).toHaveBeenCalledOnce();
    });

    it('passes the candidate gate through to the assessor', async () => {
      vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue([gate('f1', 'merge')]);
      vi.mocked(mockApproveUseCase.execute).mockResolvedValue({
        approved: true,
        reason: 'Approved',
      });

      await useCase.execute({ lowRisk: true });

      expect(mockLowRisk.execute).toHaveBeenCalledWith({
        featureId: 'f1',
        gate: GuardrailGateType.merge,
      });
    });

    it('isolates an assessor failure as a skip, not a crash', async () => {
      vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue([
        gate('f1', 'plan'),
        gate('f2', 'plan'),
      ]);
      mockLowRisk.execute
        .mockRejectedValueOnce(new Error('git exploded'))
        .mockResolvedValueOnce({ lowRisk: true, reason: 'ok' });
      vi.mocked(mockApproveUseCase.execute).mockResolvedValue({
        approved: true,
        reason: 'Approved',
      });

      const result = await useCase.execute({ lowRisk: true });

      expect(result.approvedFeatureIds).toEqual(['f2']);
      expect(result.skipped[0]).toEqual({ featureId: 'f1', reason: 'git exploded' });
    });
  });
});
