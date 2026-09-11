/**
 * ListFleetTriageItemsUseCase Unit Tests
 *
 * Verifies prioritization sorting (P1 blockers before P2 failures before P3 warnings)
 * and date ordering within priority tiers.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListFleetTriageItemsUseCase } from '@/application/use-cases/fleet/list-fleet-triage-items.use-case.js';
import type { IFleetRepository } from '@/application/ports/output/repositories/fleet-repository.interface.js';
import {
  FleetTriagePriority,
  FleetTriageCategory,
  type FleetTriageItem,
} from '@/domain/generated/output.js';

describe('ListFleetTriageItemsUseCase', () => {
  let useCase: ListFleetTriageItemsUseCase;
  let mockFleetRepo: IFleetRepository;

  beforeEach(() => {
    mockFleetRepo = {
      getOverview: vi.fn(),
      listTriageItems: vi.fn(),
      getConsecutiveFailures: vi.fn(),
      getRollingFailureRate: vi.fn(),
    };

    useCase = new ListFleetTriageItemsUseCase(mockFleetRepo);
  });

  it('should order items by priority (P1 -> P2 -> P3)', async () => {
    const rawItems: FleetTriageItem[] = [
      {
        featureId: 'f-p3',
        featureName: 'Stalled job',
        slug: 'stalled-job',
        priority: FleetTriagePriority.p3,
        category: FleetTriageCategory.warning,
        reason: 'Running for > 45m',
        createdAt: '2026-09-11T12:00:00Z',
      },
      {
        featureId: 'f-p1',
        featureName: 'Stripe integration',
        slug: 'stripe-integration',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        reason: 'Diff exceeds threshold',
        createdAt: '2026-09-11T12:05:00Z',
      },
      {
        featureId: 'f-p2',
        featureName: 'CSV Export',
        slug: 'csv-export',
        priority: FleetTriagePriority.p2,
        category: FleetTriageCategory.ci_failed,
        reason: 'CI failed 3 attempts',
        createdAt: '2026-09-11T12:10:00Z',
      },
    ];

    vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue(rawItems);

    const result = await useCase.execute();

    expect(result).toHaveLength(3);
    expect(result[0].priority).toBe(FleetTriagePriority.p1);
    expect(result[0].featureId).toBe('f-p1');
    expect(result[1].priority).toBe(FleetTriagePriority.p2);
    expect(result[1].featureId).toBe('f-p2');
    expect(result[2].priority).toBe(FleetTriagePriority.p3);
    expect(result[2].featureId).toBe('f-p3');
  });

  it('should order items of the same priority by createdAt descending (newest first)', async () => {
    const rawItems: FleetTriageItem[] = [
      {
        featureId: 'f-older',
        featureName: 'Older blocker',
        slug: 'older-blocker',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.question,
        reason: 'Blocking question',
        createdAt: '2026-09-11T10:00:00Z',
      },
      {
        featureId: 'f-newer',
        featureName: 'Newer blocker',
        slug: 'newer-blocker',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        reason: 'Plan review waiting',
        createdAt: '2026-09-11T11:30:00Z',
      },
    ];

    vi.mocked(mockFleetRepo.listTriageItems).mockResolvedValue(rawItems);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0].featureId).toBe('f-newer');
    expect(result[1].featureId).toBe('f-older');
  });
});
