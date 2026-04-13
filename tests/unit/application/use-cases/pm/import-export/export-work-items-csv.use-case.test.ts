import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportWorkItemsCsvUseCase } from '@/application/use-cases/import-export/export-work-items-csv.use-case.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { ICycleRepository } from '@/application/ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type { ILabelRepository } from '@/application/ports/output/repositories/label-repository.interface.js';
import type { WorkItem, WorkItemState, Label } from '@/domain/generated/output.js';
import { Priority, StateGroup } from '@/domain/generated/output.js';

const now = new Date('2026-04-13T12:00:00Z');

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wi-1',
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'TST',
    title: 'First item',
    stateId: 'state-todo',
    priority: Priority.Medium,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeState(overrides: Partial<WorkItemState> = {}): WorkItemState {
  return {
    id: 'state-todo',
    projectId: 'proj-1',
    name: 'Todo',
    color: '#ccc',
    displayOrder: 0,
    stateGroup: StateGroup.Unstarted,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeLabel(overrides: Partial<Label> = {}): Label {
  return {
    id: 'lbl-1',
    projectId: 'proj-1',
    name: 'bug',
    color: '#f00',
    createdAt: now,
    updatedAt: now,
    ...overrides,
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
    getLabels: vi.fn().mockResolvedValue([]),
    getAssignees: vi.fn().mockResolvedValue([]),
  };
}

function createMockCycleRepo(): ICycleRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([]),
    findActiveByProject: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    addWorkItem: vi.fn(),
    removeWorkItem: vi.fn(),
    getWorkItemIds: vi.fn().mockResolvedValue([]),
    findCycleForWorkItem: vi.fn(),
  };
}

function createMockStateRepo(): IWorkItemStateRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    seedDefaultStates: vi.fn(),
    reorder: vi.fn(),
  };
}

function createMockLabelRepo(): ILabelRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
}

describe('ExportWorkItemsCsvUseCase', () => {
  let useCase: ExportWorkItemsCsvUseCase;
  let workItemRepo: IWorkItemRepository;
  let cycleRepo: ICycleRepository;
  let stateRepo: IWorkItemStateRepository;
  let labelRepo: ILabelRepository;

  beforeEach(() => {
    workItemRepo = createMockWorkItemRepo();
    cycleRepo = createMockCycleRepo();
    stateRepo = createMockStateRepo();
    labelRepo = createMockLabelRepo();
    useCase = new ExportWorkItemsCsvUseCase(workItemRepo, cycleRepo, stateRepo, labelRepo);
  });

  it('exports work items as valid CSV with header and rows', async () => {
    const items: WorkItem[] = [
      makeWorkItem({ id: 'wi-1', sequenceId: 1, title: 'First' }),
      makeWorkItem({ id: 'wi-2', sequenceId: 2, title: 'Second', priority: Priority.High }),
      makeWorkItem({ id: 'wi-3', sequenceId: 3, title: 'Third', estimateValue: 'M' }),
    ];
    vi.mocked(workItemRepo.listByProject).mockResolvedValue(items);
    vi.mocked(stateRepo.listByProject).mockResolvedValue([makeState()]);
    vi.mocked(labelRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({
      projectId: 'proj-1',
      columns: ['identifier', 'title', 'priority', 'estimate'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itemCount).toBe(3);

    const lines = result.csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe('Identifier,Title,Priority,Estimate');
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toContain('TST-1');
    expect(lines[1]).toContain('First');
    expect(lines[2]).toContain('High');
    expect(lines[3]).toContain('M');
  });

  it('filters by cycle when cycleId is provided', async () => {
    const items = [
      makeWorkItem({ id: 'wi-1', title: 'In cycle' }),
      makeWorkItem({ id: 'wi-2', title: 'Not in cycle' }),
    ];
    vi.mocked(workItemRepo.listByProject).mockResolvedValue(items);
    vi.mocked(cycleRepo.getWorkItemIds).mockResolvedValue(['wi-1']);
    vi.mocked(stateRepo.listByProject).mockResolvedValue([makeState()]);
    vi.mocked(labelRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({
      projectId: 'proj-1',
      cycleId: 'cycle-1',
      columns: ['title'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itemCount).toBe(1);
    expect(result.csv).toContain('In cycle');
    expect(result.csv).not.toContain('Not in cycle');
  });

  it('resolves state names in the output', async () => {
    const items = [makeWorkItem({ stateId: 'state-done' })];
    vi.mocked(workItemRepo.listByProject).mockResolvedValue(items);
    vi.mocked(stateRepo.listByProject).mockResolvedValue([
      makeState({ id: 'state-todo', name: 'Todo' }),
      makeState({ id: 'state-done', name: 'Done' }),
    ]);
    vi.mocked(labelRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({
      projectId: 'proj-1',
      columns: ['title', 'state'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain('Done');
  });

  it('includes label names in the output', async () => {
    const items = [makeWorkItem({ id: 'wi-1' })];
    vi.mocked(workItemRepo.listByProject).mockResolvedValue(items);
    vi.mocked(stateRepo.listByProject).mockResolvedValue([makeState()]);
    vi.mocked(labelRepo.listByProject).mockResolvedValue([
      makeLabel({ id: 'lbl-1', name: 'bug' }),
      makeLabel({ id: 'lbl-2', name: 'frontend' }),
    ]);
    vi.mocked(workItemRepo.getLabels).mockResolvedValue(['lbl-1', 'lbl-2']);

    const result = await useCase.execute({
      projectId: 'proj-1',
      columns: ['title', 'labels'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain('bug');
    expect(result.csv).toContain('frontend');
  });

  it('returns empty CSV with header only when no items', async () => {
    vi.mocked(workItemRepo.listByProject).mockResolvedValue([]);
    vi.mocked(stateRepo.listByProject).mockResolvedValue([makeState()]);
    vi.mocked(labelRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({
      projectId: 'proj-1',
      columns: ['title', 'priority'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itemCount).toBe(0);
    const lines = result.csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1); // header only
  });
});
