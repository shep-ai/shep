import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListIntakeItemsUseCase } from '@/application/use-cases/intake/list-intake-items.use-case.js';
import type { IIntakeItemRepository } from '@/application/ports/output/repositories/intake-item-repository.interface.js';
import type { IntakeItem } from '@/domain/generated/output.js';
import { IntakeStatus } from '@/domain/generated/output.js';

const ITEM: IntakeItem = {
  id: 'intake-1',
  projectId: 'proj-1',
  title: 'Bug',
  source: 'manual',
  status: IntakeStatus.Pending,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockIntakeRepo(): IIntakeItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([ITEM]),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
}

describe('ListIntakeItemsUseCase', () => {
  let useCase: ListIntakeItemsUseCase;
  let intakeRepo: IIntakeItemRepository;

  beforeEach(() => {
    intakeRepo = createMockIntakeRepo();
    useCase = new ListIntakeItemsUseCase(intakeRepo);
  });

  it('returns items for a project', async () => {
    const result = await useCase.execute({ projectId: 'proj-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('intake-1');
    }
  });

  it('passes status filter to repository', async () => {
    await useCase.execute({ projectId: 'proj-1', status: 'Pending' });

    expect(intakeRepo.listByProject).toHaveBeenCalledWith('proj-1', 'Pending');
  });

  it('returns empty array when no items exist', async () => {
    vi.mocked(intakeRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({ projectId: 'proj-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toHaveLength(0);
  });
});
