import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceptIntakeItemUseCase } from '@/application/use-cases/intake/accept-intake-item.use-case.js';
import type { IIntakeItemRepository } from '@/application/ports/output/repositories/intake-item-repository.interface.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type { IActivityLogRepository } from '@/application/ports/output/repositories/activity-log-repository.interface.js';
import type { IntakeItem, PmProject, WorkItemState } from '@/domain/generated/output.js';
import { EstimateType, IntakeStatus, StateGroup } from '@/domain/generated/output.js';

const PROJECT: PmProject = {
  id: 'proj-1',
  name: 'Test',
  slug: 'test',
  identifierPrefix: 'TST',
  workItemCounter: 5,
  estimateType: EstimateType.Category,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DEFAULT_STATE: WorkItemState = {
  id: 'state-1',
  projectId: 'proj-1',
  name: 'Backlog',
  color: '#a3a3a3',
  displayOrder: 0,
  stateGroup: StateGroup.Backlog,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PENDING_ITEM: IntakeItem = {
  id: 'intake-1',
  projectId: 'proj-1',
  title: 'Bug report',
  description: 'Something broke',
  source: 'manual',
  status: IntakeStatus.Pending,
  suggestedPriority: 'High',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockIntakeRepo(): IIntakeItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(PENDING_ITEM),
    listByProject: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn(),
  };
}

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
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
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
}

function createMockStateRepo(): IWorkItemStateRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([DEFAULT_STATE]),
    update: vi.fn(),
    softDelete: vi.fn(),
    seedDefaultStates: vi.fn(),
    reorder: vi.fn(),
  };
}

function createMockActivityRepo(): IActivityLogRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    listByWorkItem: vi.fn().mockResolvedValue([]),
  };
}

describe('AcceptIntakeItemUseCase', () => {
  let useCase: AcceptIntakeItemUseCase;
  let intakeRepo: IIntakeItemRepository;
  let projectRepo: IPmProjectRepository;
  let workItemRepo: IWorkItemRepository;
  let stateRepo: IWorkItemStateRepository;
  let activityRepo: IActivityLogRepository;

  beforeEach(() => {
    intakeRepo = createMockIntakeRepo();
    projectRepo = createMockProjectRepo();
    workItemRepo = createMockWorkItemRepo();
    stateRepo = createMockStateRepo();
    activityRepo = createMockActivityRepo();
    useCase = new AcceptIntakeItemUseCase(
      intakeRepo,
      projectRepo,
      workItemRepo,
      stateRepo,
      activityRepo
    );
  });

  it('accepts intake item and creates a work item', async () => {
    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workItem.title).toBe('Bug report');
      expect(result.workItem.description).toBe('Something broke');
      expect(result.workItem.projectId).toBe('proj-1');
      expect(result.workItem.priority).toBe('High');
      expect(result.workItem.sequenceId).toBe(6);
      expect(result.workItem.identifierPrefix).toBe('TST');
    }
    expect(workItemRepo.create).toHaveBeenCalledOnce();
    expect(intakeRepo.update).toHaveBeenCalledWith(
      'intake-1',
      expect.objectContaining({
        status: IntakeStatus.Accepted,
      })
    );
  });

  it('uses suggested state id when available', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue({
      ...PENDING_ITEM,
      suggestedStateId: 'state-custom',
    });

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workItem.stateId).toBe('state-custom');
    }
  });

  it('falls back to default state when no suggestion', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue({
      ...PENDING_ITEM,
      suggestedPriority: undefined,
    });

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workItem.stateId).toBe('state-1');
    }
  });

  it('returns error for nonexistent intake item', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ intakeItemId: 'nonexistent' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns error if item is not in Pending status', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue({
      ...PENDING_ITEM,
      status: IntakeStatus.Declined,
    });

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Pending');
  });

  it('returns error if project not found', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Project');
  });

  it('returns error if no workflow states exist', async () => {
    vi.mocked(stateRepo.listByProject).mockResolvedValue([]);
    vi.mocked(intakeRepo.findById).mockResolvedValue({
      ...PENDING_ITEM,
      suggestedStateId: undefined,
    });

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('states');
  });

  it('creates activity log entry', async () => {
    await useCase.execute({ intakeItemId: 'intake-1' });

    expect(activityRepo.create).toHaveBeenCalledOnce();
  });

  it('links resulting work item id back to intake item', async () => {
    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(intakeRepo.update).toHaveBeenCalledWith('intake-1', {
        status: IntakeStatus.Accepted,
        resultingWorkItemId: result.workItem.id,
      });
    }
  });
});
