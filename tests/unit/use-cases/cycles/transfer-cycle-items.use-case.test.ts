import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransferCycleItemsUseCase } from '@/application/use-cases/cycles/transfer-cycle-items.use-case.js';
import type { ICycleRepository } from '@/application/ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import { CycleStatus, Priority, StateGroup } from '@/domain/generated/output.js';
import type { Cycle, WorkItem, WorkItemState } from '@/domain/generated/output.js';

describe('TransferCycleItemsUseCase', () => {
  let useCase: TransferCycleItemsUseCase;
  let cycleRepo: ICycleRepository;
  let workItemRepo: IWorkItemRepository;
  let stateRepo: IWorkItemStateRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT_ID = 'proj-001';

  const SOURCE_CYCLE: Cycle = {
    id: 'cycle-source',
    projectId: PROJECT_ID,
    name: 'Sprint 1',
    status: CycleStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const TARGET_CYCLE: Cycle = {
    id: 'cycle-target',
    projectId: PROJECT_ID,
    name: 'Sprint 2',
    status: CycleStatus.Upcoming,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const STATES: WorkItemState[] = [
    {
      id: 'state-todo',
      projectId: PROJECT_ID,
      name: 'Todo',
      color: '#ccc',
      displayOrder: 0,
      stateGroup: StateGroup.Unstarted,
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'state-done',
      projectId: PROJECT_ID,
      name: 'Done',
      color: '#0f0',
      displayOrder: 3,
      stateGroup: StateGroup.Completed,
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  function makeWorkItem(id: string, stateId: string): WorkItem {
    return {
      id,
      projectId: PROJECT_ID,
      sequenceId: 1,
      identifierPrefix: 'TST',
      title: `Item ${id}`,
      priority: Priority.Medium,
      stateId,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  beforeEach(() => {
    cycleRepo = {
      create: vi.fn(),
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === 'cycle-source') return Promise.resolve(SOURCE_CYCLE);
        if (id === 'cycle-target') return Promise.resolve(TARGET_CYCLE);
        return Promise.resolve(null);
      }),
      listByProject: vi.fn(),
      findActiveByProject: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      addWorkItem: vi.fn(),
      removeWorkItem: vi.fn(),
      getWorkItemIds: vi.fn().mockResolvedValue(['wi-1', 'wi-2', 'wi-3']),
      findCycleForWorkItem: vi.fn(),
    };

    workItemRepo = {
      create: vi.fn(),
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === 'wi-1') return Promise.resolve(makeWorkItem('wi-1', 'state-todo'));
        if (id === 'wi-2') return Promise.resolve(makeWorkItem('wi-2', 'state-done'));
        if (id === 'wi-3') return Promise.resolve(makeWorkItem('wi-3', 'state-todo'));
        return Promise.resolve(null);
      }),
      findByIdentifier: vi.fn(),
      listByProject: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      addLabel: vi.fn(),
      removeLabel: vi.fn(),
      addAssignee: vi.fn(),
      removeAssignee: vi.fn(),
      getLabels: vi.fn(),
      getAssignees: vi.fn(),
    };

    stateRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByProject: vi.fn().mockResolvedValue(STATES),
      update: vi.fn(),
      softDelete: vi.fn(),
      seedDefaultStates: vi.fn(),
      reorder: vi.fn(),
    };

    useCase = new TransferCycleItemsUseCase(cycleRepo, workItemRepo, stateRepo);
  });

  it('transfers incomplete items to target cycle', async () => {
    const result = await useCase.execute({
      sourceCycleId: 'cycle-source',
      targetCycleId: 'cycle-target',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transferred).toBe(2); // wi-1, wi-3 (incomplete)
      expect(result.kept).toBe(1); // wi-2 (completed)
    }

    expect(cycleRepo.removeWorkItem).toHaveBeenCalledWith('cycle-source', 'wi-1');
    expect(cycleRepo.removeWorkItem).toHaveBeenCalledWith('cycle-source', 'wi-3');
    expect(cycleRepo.addWorkItem).toHaveBeenCalledWith('cycle-target', 'wi-1');
    expect(cycleRepo.addWorkItem).toHaveBeenCalledWith('cycle-target', 'wi-3');
    expect(cycleRepo.removeWorkItem).not.toHaveBeenCalledWith('cycle-source', 'wi-2');
  });

  it('keeps completed items in source cycle', async () => {
    const result = await useCase.execute({
      sourceCycleId: 'cycle-source',
      targetCycleId: 'cycle-target',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kept).toBe(1);
    }
    expect(cycleRepo.addWorkItem).not.toHaveBeenCalledWith('cycle-target', 'wi-2');
  });

  it('removes items from source without adding to target when no target specified', async () => {
    const result = await useCase.execute({
      sourceCycleId: 'cycle-source',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transferred).toBe(2);
    }
    expect(cycleRepo.removeWorkItem).toHaveBeenCalledTimes(2);
    expect(cycleRepo.addWorkItem).not.toHaveBeenCalled();
  });

  it('returns error for nonexistent source cycle', async () => {
    const result = await useCase.execute({
      sourceCycleId: 'nonexistent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns error for nonexistent target cycle', async () => {
    const result = await useCase.execute({
      sourceCycleId: 'cycle-source',
      targetCycleId: 'nonexistent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });
});
