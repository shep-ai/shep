import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateIntakeItemUseCase } from '@/application/use-cases/intake/create-intake-item.use-case.js';
import type { IIntakeItemRepository } from '@/application/ports/output/repositories/intake-item-repository.interface.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { PmProject } from '@/domain/generated/output.js';
import { EstimateType } from '@/domain/generated/output.js';

const PROJECT: PmProject = {
  id: 'proj-1',
  name: 'Test',
  slug: 'test',
  identifierPrefix: 'TST',
  workItemCounter: 0,
  estimateType: EstimateType.Category,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockIntakeRepo(): IIntakeItemRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    listByProject: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
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
    incrementWorkItemCounter: vi.fn(),
  };
}

describe('CreateIntakeItemUseCase', () => {
  let useCase: CreateIntakeItemUseCase;
  let intakeRepo: IIntakeItemRepository;
  let projectRepo: IPmProjectRepository;

  beforeEach(() => {
    intakeRepo = createMockIntakeRepo();
    projectRepo = createMockProjectRepo();
    useCase = new CreateIntakeItemUseCase(intakeRepo, projectRepo);
  });

  it('creates an intake item successfully', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      title: 'Bug report',
      source: 'manual',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intakeItem.title).toBe('Bug report');
      expect(result.intakeItem.status).toBe('Pending');
      expect(result.intakeItem.source).toBe('manual');
      expect(result.intakeItem.projectId).toBe('proj-1');
    }
    expect(intakeRepo.create).toHaveBeenCalledOnce();
  });

  it('returns error for empty title', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      title: '   ',
      source: 'manual',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('title');
  });

  it('returns error for nonexistent project', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      projectId: 'nonexistent',
      title: 'Bug',
      source: 'manual',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('persists optional description', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      title: 'Bug report',
      source: 'api',
      description: 'Detailed description',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intakeItem.description).toBe('Detailed description');
    }
  });
});
