import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateScheduledWorkflowUseCase as CreateWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/create-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output.js';

function createMockWorkflowRepo(): IWorkflowRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByName: vi.fn().mockResolvedValue(null),
    findEnabled: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClock(date: Date = new Date('2026-01-15T10:00:00Z')): IClock {
  return { now: () => date };
}

describe('CreateWorkflowUseCase', () => {
  let useCase: CreateWorkflowUseCase;
  let repo: IWorkflowRepository;
  let clock: IClock;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    clock = createMockClock();
    useCase = new CreateWorkflowUseCase(repo, clock);
  });

  it('creates and returns a workflow with valid input', async () => {
    const result = await useCase.execute({
      name: 'test-workflow',
      prompt: 'Do something useful',
      repositoryPath: '/repo',
    });

    expect(result.name).toBe('test-workflow');
    expect(result.prompt).toBe('Do something useful');
    expect(result.repositoryPath).toBe('/repo');
    expect(result.enabled).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toEqual(clock.now());
    expect(result.updatedAt).toEqual(clock.now());
    expect(repo.create).toHaveBeenCalledWith(result);
  });

  it('throws when a workflow with the same name already exists', async () => {
    (repo.findByName as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'existing-id',
      name: 'duplicate',
    } as ScheduledWorkflow);

    await expect(
      useCase.execute({
        name: 'duplicate',
        prompt: 'prompt',
        repositoryPath: '/repo',
      })
    ).rejects.toThrow('A workflow named "duplicate" already exists in this repository.');
  });

  it('throws with a descriptive error for an invalid cron expression', async () => {
    await expect(
      useCase.execute({
        name: 'bad-cron',
        prompt: 'prompt',
        cronExpression: 'not-a-cron',
        repositoryPath: '/repo',
      })
    ).rejects.toThrow(/Invalid cron expression "not-a-cron"/);
  });

  it('calculates nextRunAt when a cron expression is provided', async () => {
    const result = await useCase.execute({
      name: 'scheduled',
      prompt: 'prompt',
      cronExpression: '0 9 * * MON',
      repositoryPath: '/repo',
    });

    expect(result.cronExpression).toBe('0 9 * * MON');
    expect(result.nextRunAt).toBeDefined();
    expect(result.nextRunAt).toBeInstanceOf(Date);
    expect((result.nextRunAt as Date).getTime()).toBeGreaterThan(clock.now().getTime());
  });

  it('leaves nextRunAt undefined when no cron expression is provided', async () => {
    const result = await useCase.execute({
      name: 'manual-only',
      prompt: 'prompt',
      repositoryPath: '/repo',
    });

    expect(result.cronExpression).toBeUndefined();
    expect(result.nextRunAt).toBeUndefined();
  });

  it('sets optional fields when provided', async () => {
    const result = await useCase.execute({
      name: 'full-workflow',
      description: 'A comprehensive workflow',
      prompt: 'prompt',
      toolConstraints: ['git', 'github'],
      cronExpression: '0 9 * * *',
      timezone: 'America/New_York',
      repositoryPath: '/repo',
    });

    expect(result.description).toBe('A comprehensive workflow');
    expect(result.toolConstraints).toEqual(['git', 'github']);
    expect(result.timezone).toBe('America/New_York');
  });

  it('does not calculate nextRunAt when workflow is disabled', async () => {
    const result = await useCase.execute({
      name: 'disabled',
      prompt: 'prompt',
      cronExpression: '0 9 * * *',
      enabled: false,
      repositoryPath: '/repo',
    });

    expect(result.enabled).toBe(false);
    expect(result.nextRunAt).toBeUndefined();
  });
});
