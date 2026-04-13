import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectDuplicatesUseCase } from '@/application/use-cases/intake/detect-duplicates.use-case.js';
import type { IIntakeItemRepository } from '@/application/ports/output/repositories/intake-item-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IntakeItem, WorkItem } from '@/domain/generated/output.js';
import { IntakeStatus } from '@/domain/generated/output.js';

const PENDING_ITEM: IntakeItem = {
  id: 'intake-1',
  projectId: 'proj-1',
  title: 'Login button not working',
  description: 'Users report the login button is broken on mobile',
  source: 'manual',
  status: IntakeStatus.Pending,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeWorkItem(id: string, title: string): WorkItem {
  return {
    id,
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'TST',
    title,
    stateId: 'state-1',
    priority: 'None',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as WorkItem;
}

function createMockIntakeRepo(): IIntakeItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(PENDING_ITEM),
    listByProject: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
}

function createMockWorkItemRepo(): IWorkItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdentifier: vi.fn(),
    listByProject: vi
      .fn()
      .mockResolvedValue([
        makeWorkItem('wi-1', 'Login button broken on iOS'),
        makeWorkItem('wi-2', 'Fix user authentication'),
        makeWorkItem('wi-3', 'Update dashboard layout'),
      ]),
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

describe('DetectDuplicatesUseCase', () => {
  let useCase: DetectDuplicatesUseCase;
  let intakeRepo: IIntakeItemRepository;
  let workItemRepo: IWorkItemRepository;

  beforeEach(() => {
    intakeRepo = createMockIntakeRepo();
    workItemRepo = createMockWorkItemRepo();
    useCase = new DetectDuplicatesUseCase(intakeRepo, workItemRepo);
  });

  it('returns ranked similar items', async () => {
    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates).toBeDefined();
      expect(Array.isArray(result.candidates)).toBe(true);
    }
  });

  it('returns error for nonexistent intake item', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ intakeItemId: 'nonexistent' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns empty candidates when no work items exist', async () => {
    vi.mocked(workItemRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidates).toHaveLength(0);
  });

  it('limits results to top candidates', async () => {
    const result = await useCase.execute({ intakeItemId: 'intake-1', limit: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidates.length).toBeLessThanOrEqual(2);
  });
});
