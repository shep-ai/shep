import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateWorkItemRelationUseCase } from '@/application/use-cases/work-item-relations/create-work-item-relation.use-case.js';
import type { IWorkItemRelationRepository } from '@/application/ports/output/repositories/work-item-relation-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
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

function createMockRelationRepo(): IWorkItemRelationRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listByWorkItem: vi.fn().mockResolvedValue([]),
    findExisting: vi.fn().mockResolvedValue(null),
  };
}

function createMockWorkItemRepo(): IWorkItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeWorkItem()),
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

describe('CreateWorkItemRelationUseCase', () => {
  let useCase: CreateWorkItemRelationUseCase;
  let relationRepo: IWorkItemRelationRepository;
  let workItemRepo: IWorkItemRepository;

  beforeEach(() => {
    relationRepo = createMockRelationRepo();
    workItemRepo = createMockWorkItemRepo();
    useCase = new CreateWorkItemRelationUseCase(relationRepo, workItemRepo);
  });

  it('creates a valid relation', async () => {
    vi.mocked(workItemRepo.findById)
      .mockResolvedValueOnce(makeWorkItem({ id: 'wi-1' }))
      .mockResolvedValueOnce(makeWorkItem({ id: 'wi-2' }));

    const result = await useCase.execute({
      sourceWorkItemId: 'wi-1',
      targetWorkItemId: 'wi-2',
      relationType: 'Blocking',
    });

    expect(result.ok).toBe(true);
    expect(relationRepo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects self-referencing relation', async () => {
    const result = await useCase.execute({
      sourceWorkItemId: 'wi-1',
      targetWorkItemId: 'wi-1',
      relationType: 'RelatesTo',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('itself');
    }
  });

  it('rejects invalid relation type', async () => {
    const result = await useCase.execute({
      sourceWorkItemId: 'wi-1',
      targetWorkItemId: 'wi-2',
      relationType: 'InvalidType',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid relation type');
    }
  });

  it('rejects when source work item not found', async () => {
    vi.mocked(workItemRepo.findById).mockResolvedValueOnce(null);

    const result = await useCase.execute({
      sourceWorkItemId: 'missing',
      targetWorkItemId: 'wi-2',
      relationType: 'Blocking',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Source work item not found');
    }
  });

  it('rejects duplicate relation', async () => {
    vi.mocked(workItemRepo.findById)
      .mockResolvedValueOnce(makeWorkItem({ id: 'wi-1' }))
      .mockResolvedValueOnce(makeWorkItem({ id: 'wi-2' }));
    vi.mocked(relationRepo.findExisting).mockResolvedValueOnce({
      id: 'rel-1',
      sourceWorkItemId: 'wi-1',
      targetWorkItemId: 'wi-2',
      relationType: 'Blocking',
      createdAt: new Date(),
    });

    const result = await useCase.execute({
      sourceWorkItemId: 'wi-1',
      targetWorkItemId: 'wi-2',
      relationType: 'Blocking',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('already exists');
    }
  });

  it('detects circular blocking chain (A blocks B, B blocks A)', async () => {
    vi.mocked(workItemRepo.findById)
      .mockResolvedValueOnce(makeWorkItem({ id: 'wi-1' }))
      .mockResolvedValueOnce(makeWorkItem({ id: 'wi-2' }));
    vi.mocked(relationRepo.findExisting).mockResolvedValue(null);

    // When checking if wi-2 already blocks wi-1 transitively
    vi.mocked(relationRepo.listByWorkItem).mockResolvedValueOnce([
      {
        id: 'rel-existing',
        sourceWorkItemId: 'wi-2',
        targetWorkItemId: 'wi-1',
        relationType: 'Blocking',
        createdAt: new Date(),
      },
    ]);

    const result = await useCase.execute({
      sourceWorkItemId: 'wi-1',
      targetWorkItemId: 'wi-2',
      relationType: 'Blocking',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('circular');
    }
  });
});
