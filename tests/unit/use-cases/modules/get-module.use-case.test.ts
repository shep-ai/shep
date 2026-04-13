import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetModuleUseCase } from '@/application/use-cases/modules/get-module.use-case.js';
import type { IPmModuleRepository } from '@/application/ports/output/repositories/pm-module-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import { ModuleStatus, Priority, StateGroup } from '@/domain/generated/output.js';
import type { PmModule, WorkItem, WorkItemState } from '@/domain/generated/output.js';

describe('GetModuleUseCase', () => {
  let useCase: GetModuleUseCase;
  let moduleRepo: IPmModuleRepository;
  let workItemRepo: IWorkItemRepository;
  let stateRepo: IWorkItemStateRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT_ID = 'proj-001';

  const MODULE: PmModule = {
    id: 'mod-001',
    projectId: PROJECT_ID,
    name: 'Module Alpha',
    status: ModuleStatus.InProgress,
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
    moduleRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(MODULE),
      listByProject: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      addWorkItem: vi.fn(),
      removeWorkItem: vi.fn(),
      getWorkItemIds: vi.fn().mockResolvedValue(['wi-1', 'wi-2', 'wi-3', 'wi-4', 'wi-5']),
      getModuleIdsForWorkItem: vi.fn(),
    };

    workItemRepo = {
      create: vi.fn(),
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === 'wi-1') return Promise.resolve(makeWorkItem('wi-1', 'state-done'));
        if (id === 'wi-2') return Promise.resolve(makeWorkItem('wi-2', 'state-done'));
        if (id === 'wi-3') return Promise.resolve(makeWorkItem('wi-3', 'state-done'));
        if (id === 'wi-4') return Promise.resolve(makeWorkItem('wi-4', 'state-todo'));
        if (id === 'wi-5') return Promise.resolve(makeWorkItem('wi-5', 'state-todo'));
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

    useCase = new GetModuleUseCase(moduleRepo, workItemRepo, stateRepo);
  });

  it('returns module with 60% progress when 3/5 items completed', async () => {
    const result = await useCase.execute('mod-001');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.module.totalItems).toBe(5);
      expect(result.module.completedItems).toBe(3);
      expect(result.module.progressPercent).toBe(60);
    }
  });

  it('returns 0% progress when no items assigned', async () => {
    vi.mocked(moduleRepo.getWorkItemIds).mockResolvedValue([]);

    const result = await useCase.execute('mod-001');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.module.progressPercent).toBe(0);
      expect(result.module.totalItems).toBe(0);
    }
  });

  it('returns error for nonexistent module', async () => {
    vi.mocked(moduleRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute('nonexistent');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });
});
