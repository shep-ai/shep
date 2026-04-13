import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateCycleUseCase } from '@/application/use-cases/cycles/create-cycle.use-case.js';
import type { ICycleRepository } from '@/application/ports/output/repositories/cycle-repository.interface.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import { CycleStatus, EstimateType } from '@/domain/generated/output.js';
import type { PmProject } from '@/domain/generated/output.js';

describe('CreateCycleUseCase', () => {
  let useCase: CreateCycleUseCase;
  let cycleRepo: ICycleRepository;
  let projectRepo: IPmProjectRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT: PmProject = {
    id: 'proj-001',
    name: 'Test Project',
    slug: 'test-project',
    identifierPrefix: 'TST',
    workItemCounter: 0,
    estimateType: EstimateType.Category,
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeEach(() => {
    cycleRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      listByProject: vi.fn().mockResolvedValue([]),
      findActiveByProject: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      addWorkItem: vi.fn().mockResolvedValue(undefined),
      removeWorkItem: vi.fn().mockResolvedValue(undefined),
      getWorkItemIds: vi.fn().mockResolvedValue([]),
      findCycleForWorkItem: vi.fn().mockResolvedValue(null),
    };
    projectRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(PROJECT),
      findBySlug: vi.fn(),
      findByIdentifierPrefix: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementWorkItemCounter: vi.fn(),
    };
    useCase = new CreateCycleUseCase(cycleRepo, projectRepo);
  });

  it('creates a cycle successfully', async () => {
    const result = await useCase.execute({
      projectId: 'proj-001',
      name: 'Sprint 1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cycle.name).toBe('Sprint 1');
      expect(result.cycle.status).toBe('Upcoming');
      expect(result.cycle.projectId).toBe('proj-001');
    }
    expect(cycleRepo.create).toHaveBeenCalledOnce();
  });

  it('returns error for empty name', async () => {
    const result = await useCase.execute({
      projectId: 'proj-001',
      name: '  ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('required');
  });

  it('returns error for nonexistent project', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      projectId: 'nonexistent',
      name: 'Sprint 1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('rejects creating Active cycle when one already exists', async () => {
    vi.mocked(cycleRepo.findActiveByProject).mockResolvedValue({
      id: 'existing',
      projectId: 'proj-001',
      name: 'Existing Active',
      status: CycleStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await useCase.execute({
      projectId: 'proj-001',
      name: 'Sprint 2',
      status: CycleStatus.Active,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already has an active cycle');
  });

  it('allows creating Upcoming cycle when one Active exists', async () => {
    vi.mocked(cycleRepo.findActiveByProject).mockResolvedValue({
      id: 'existing',
      projectId: 'proj-001',
      name: 'Existing Active',
      status: CycleStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await useCase.execute({
      projectId: 'proj-001',
      name: 'Sprint 2',
      status: CycleStatus.Upcoming,
    });

    expect(result.ok).toBe(true);
  });
});
