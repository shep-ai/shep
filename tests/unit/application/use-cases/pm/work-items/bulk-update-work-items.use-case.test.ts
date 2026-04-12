import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkUpdateWorkItemsUseCase } from '@/application/use-cases/work-items/bulk-update-work-items.use-case.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IActivityLogRepository } from '@/application/ports/output/repositories/activity-log-repository.interface.js';
import type { WorkItem } from '@/domain/generated/output.js';

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wi-1',
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'TEST',
    title: 'Test Item',
    stateId: 'state-1',
    priority: 'None',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WorkItem;
}

function createMockWorkItemRepo(): IWorkItemRepository {
  return {
    create: vi.fn(),
    findById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(makeWorkItem({ id, stateId: 'state-old' }))
      ),
    findByIdentifier: vi.fn(),
    listByProject: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    addLabel: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    addAssignee: vi.fn().mockResolvedValue(undefined),
    removeAssignee: vi.fn().mockResolvedValue(undefined),
    getLabels: vi.fn(),
    getAssignees: vi.fn(),
  };
}

function createMockActivityRepo(): IActivityLogRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    listByWorkItem: vi.fn().mockResolvedValue([]),
  };
}

describe('BulkUpdateWorkItemsUseCase', () => {
  let useCase: BulkUpdateWorkItemsUseCase;
  let workItemRepo: IWorkItemRepository;
  let activityRepo: IActivityLogRepository;

  beforeEach(() => {
    workItemRepo = createMockWorkItemRepo();
    activityRepo = createMockActivityRepo();
    useCase = new BulkUpdateWorkItemsUseCase(workItemRepo, activityRepo);
  });

  it('bulk state change updates all 5 items', async () => {
    const ids = ['wi-1', 'wi-2', 'wi-3', 'wi-4', 'wi-5'];

    const result = await useCase.execute({
      workItemIds: ids,
      operation: { type: 'changeState', stateId: 'state-new' },
    });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toHaveLength(5);
    expect(result.failed).toHaveLength(0);
    expect(workItemRepo.update).toHaveBeenCalledTimes(5);
    expect(activityRepo.create).toHaveBeenCalledTimes(5);
  });

  it('bulk label add creates junction entries', async () => {
    const ids = ['wi-1', 'wi-2'];

    const result = await useCase.execute({
      workItemIds: ids,
      operation: { type: 'addLabel', labelId: 'label-1' },
    });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toHaveLength(2);
    expect(workItemRepo.addLabel).toHaveBeenCalledTimes(2);
    expect(workItemRepo.addLabel).toHaveBeenCalledWith('wi-1', 'label-1');
    expect(workItemRepo.addLabel).toHaveBeenCalledWith('wi-2', 'label-1');
  });

  it('handles invalid ID gracefully - others still succeed', async () => {
    vi.mocked(workItemRepo.findById).mockImplementation((id: string) => {
      if (id === 'missing') return Promise.resolve(null);
      return Promise.resolve(makeWorkItem({ id }));
    });

    const result = await useCase.execute({
      workItemIds: ['wi-1', 'missing', 'wi-3'],
      operation: { type: 'changeState', stateId: 'state-new' },
    });

    expect(result.ok).toBe(false);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toEqual({ id: 'missing', error: 'Work item not found' });
  });

  it('bulk delete soft-deletes and logs activity', async () => {
    const result = await useCase.execute({
      workItemIds: ['wi-1', 'wi-2'],
      operation: { type: 'delete' },
    });

    expect(result.ok).toBe(true);
    expect(workItemRepo.softDelete).toHaveBeenCalledTimes(2);
    expect(activityRepo.create).toHaveBeenCalledTimes(2);
  });

  it('bulk priority change updates all items', async () => {
    const result = await useCase.execute({
      workItemIds: ['wi-1', 'wi-2', 'wi-3'],
      operation: { type: 'changePriority', priority: 'High' },
    });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toHaveLength(3);
    expect(workItemRepo.update).toHaveBeenCalledTimes(3);
  });
});
