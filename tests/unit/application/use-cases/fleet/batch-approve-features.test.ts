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

    useCase = new BatchApproveFeaturesUseCase(mockFleetRepo, mockApproveUseCase);
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
});
