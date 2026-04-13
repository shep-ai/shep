import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeclineIntakeItemUseCase } from '@/application/use-cases/intake/decline-intake-item.use-case.js';
import type { IIntakeItemRepository } from '@/application/ports/output/repositories/intake-item-repository.interface.js';
import type { IntakeItem } from '@/domain/generated/output.js';
import { IntakeStatus } from '@/domain/generated/output.js';

const PENDING_ITEM: IntakeItem = {
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
    findById: vi.fn().mockResolvedValue(PENDING_ITEM),
    listByProject: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn(),
  };
}

describe('DeclineIntakeItemUseCase', () => {
  let useCase: DeclineIntakeItemUseCase;
  let intakeRepo: IIntakeItemRepository;

  beforeEach(() => {
    intakeRepo = createMockIntakeRepo();
    useCase = new DeclineIntakeItemUseCase(intakeRepo);
  });

  it('declines an intake item with reason', async () => {
    const result = await useCase.execute({
      intakeItemId: 'intake-1',
      reason: 'Not actionable',
    });

    expect(result.ok).toBe(true);
    expect(intakeRepo.update).toHaveBeenCalledWith('intake-1', {
      status: IntakeStatus.Declined,
      declineReason: 'Not actionable',
    });
  });

  it('returns error for nonexistent item', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      intakeItemId: 'nonexistent',
      reason: 'No',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns error if item is not in Pending status', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue({
      ...PENDING_ITEM,
      status: IntakeStatus.Accepted,
    });

    const result = await useCase.execute({
      intakeItemId: 'intake-1',
      reason: 'No',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Pending');
  });

  it('returns error for empty reason', async () => {
    const result = await useCase.execute({
      intakeItemId: 'intake-1',
      reason: '   ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('reason');
  });
});
