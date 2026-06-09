import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { ToggleScheduledWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/toggle-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import {
  createMockWorkflowRepo,
  createMockClock,
  createTestWorkflow,
} from './workflow-test-helpers.js';

describe('ToggleWorkflowUseCase', () => {
  let useCase: ToggleScheduledWorkflowUseCase;
  let repo: IWorkflowRepository;
  let clock: IClock;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    clock = createMockClock();
    useCase = new ToggleScheduledWorkflowUseCase(repo, clock);
  });

  it('enables workflow and recalculates nextRunAt', async () => {
    const workflow = createTestWorkflow({
      enabled: false,
      cronExpression: '0 9 * * MON',
    });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id, true);

    expect(result.enabled).toBe(true);
    expect(result.nextRunAt).toBeDefined();
    expect(result.nextRunAt).toBeInstanceOf(Date);
    expect(repo.update).toHaveBeenCalledWith(result);
  });

  it('disables workflow', async () => {
    const workflow = createTestWorkflow({
      enabled: true,
      cronExpression: '0 9 * * *',
      nextRunAt: new Date('2026-01-16T09:00:00Z'),
    });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id, false);

    expect(result.enabled).toBe(false);
    expect(result.nextRunAt).toBeUndefined();
  });

  it('throws for non-existent workflow', async () => {
    await expect(useCase.execute('nonexistent', true)).rejects.toThrow(
      'Workflow not found: "nonexistent"'
    );
  });

  it('enabling workflow without cron expression leaves nextRunAt undefined', async () => {
    const workflow = createTestWorkflow({ enabled: false });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id, true);

    expect(result.enabled).toBe(true);
    expect(result.nextRunAt).toBeUndefined();
  });
});
