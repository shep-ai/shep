import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportWorkItemsCsvUseCase } from '@/application/use-cases/import-export/import-work-items-csv.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type { IActivityLogRepository } from '@/application/ports/output/repositories/activity-log-repository.interface.js';
import type { PmProject, WorkItemState } from '@/domain/generated/output.js';
import { EstimateType, StateGroup } from '@/domain/generated/output.js';

const now = new Date('2026-04-13T12:00:00Z');

const PROJECT: PmProject = {
  id: 'proj-1',
  name: 'Test',
  slug: 'test',
  identifierPrefix: 'TST',
  workItemCounter: 5,
  estimateType: EstimateType.Category,
  createdAt: now,
  updatedAt: now,
};

const TODO_STATE: WorkItemState = {
  id: 'state-todo',
  projectId: 'proj-1',
  name: 'Todo',
  color: '#ccc',
  displayOrder: 0,
  stateGroup: StateGroup.Unstarted,
  isDefault: true,
  createdAt: now,
  updatedAt: now,
};

function createMockProjectRepo(): IPmProjectRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(PROJECT),
    findBySlug: vi.fn(),
    findByIdentifierPrefix: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    incrementWorkItemCounter: vi.fn().mockResolvedValue(6),
  };
}

function createMockWorkItemRepo(): IWorkItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdentifier: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    addLabel: vi.fn(),
    removeLabel: vi.fn(),
    addAssignee: vi.fn(),
    removeAssignee: vi.fn(),
    getLabels: vi.fn(),
    getAssignees: vi.fn(),
  };
}

function createMockStateRepo(): IWorkItemStateRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([TODO_STATE]),
    update: vi.fn(),
    softDelete: vi.fn(),
    seedDefaultStates: vi.fn(),
    reorder: vi.fn(),
  };
}

function createMockActivityRepo(): IActivityLogRepository {
  return {
    create: vi.fn(),
    listByWorkItem: vi.fn().mockResolvedValue([]),
  };
}

describe('ImportWorkItemsCsvUseCase', () => {
  let useCase: ImportWorkItemsCsvUseCase;
  let projectRepo: IPmProjectRepository;
  let workItemRepo: IWorkItemRepository;
  let stateRepo: IWorkItemStateRepository;
  let activityRepo: IActivityLogRepository;

  beforeEach(() => {
    projectRepo = createMockProjectRepo();
    workItemRepo = createMockWorkItemRepo();
    stateRepo = createMockStateRepo();
    activityRepo = createMockActivityRepo();
    useCase = new ImportWorkItemsCsvUseCase(projectRepo, workItemRepo, stateRepo, activityRepo);
  });

  it('imports CSV with field mapping and creates work items', async () => {
    const csv = 'Title,Priority,Estimate\nFix login bug,High,M\nAdd dashboard,Medium,L\n';

    const result = await useCase.execute({
      projectId: 'proj-1',
      csvContent: csv,
      fieldMapping: { 0: 'title', 1: 'priority', 2: 'estimateValue' },
      skipHeaderRow: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdCount).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(workItemRepo.create).toHaveBeenCalledTimes(2);
  });

  it('reports per-row errors for invalid data', async () => {
    const csv = 'Title,Priority\n,High\nValid item,Medium\n';

    const result = await useCase.execute({
      projectId: 'proj-1',
      csvContent: csv,
      fieldMapping: { 0: 'title', 1: 'priority' },
      skipHeaderRow: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(2); // row 2 (1-indexed, skipping header)
    expect(result.errors[0].error).toContain('title');
  });

  it('returns error for nonexistent project', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      projectId: 'nonexistent',
      csvContent: 'Title\nTest\n',
      fieldMapping: { 0: 'title' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('imports CSV without header row when skipHeaderRow is false', async () => {
    const csv = 'My task,Low\n';

    const result = await useCase.execute({
      projectId: 'proj-1',
      csvContent: csv,
      fieldMapping: { 0: 'title', 1: 'priority' },
      skipHeaderRow: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdCount).toBe(1);
  });

  it('resolves state names from CSV to state IDs', async () => {
    const doneState: WorkItemState = {
      id: 'state-done',
      projectId: 'proj-1',
      name: 'Done',
      color: '#0f0',
      displayOrder: 3,
      stateGroup: StateGroup.Completed,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    vi.mocked(stateRepo.listByProject).mockResolvedValue([TODO_STATE, doneState]);

    const csv = 'Title,State\nCompleted task,Done\n';

    const result = await useCase.execute({
      projectId: 'proj-1',
      csvContent: csv,
      fieldMapping: { 0: 'title', 1: 'state' },
      skipHeaderRow: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdCount).toBe(1);
    const createdItem = vi.mocked(workItemRepo.create).mock.calls[0][0];
    expect(createdItem.stateId).toBe('state-done');
  });

  it('handles completely empty CSV', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      csvContent: '',
      fieldMapping: { 0: 'title' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
