/**
 * Schedule Scheduled Workflow Use Case
 *
 * Sets, updates, or removes a cron schedule on a workflow.
 * Validates the cron expression and calculates nextRunAt.
 */

import { injectable, inject } from 'tsyringe';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import { validateCronExpression, calculateNextRunAt } from './cron-helpers.js';

export interface ScheduleScheduledWorkflowInput {
  nameOrId: string;
  repositoryPath?: string;
  cronExpression: string | null;
  timezone?: string;
}

@injectable()
export class ScheduleScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(input: ScheduleScheduledWorkflowInput): Promise<ScheduledWorkflow> {
    // Find workflow
    let workflow = await this.workflowRepo.findById(input.nameOrId);
    if (!workflow && input.repositoryPath) {
      workflow = await this.workflowRepo.findByName(input.nameOrId, input.repositoryPath);
    }
    if (!workflow) {
      throw new Error(`Workflow not found: "${input.nameOrId}"`);
    }

    const now = this.clock.now();

    if (input.cronExpression === null) {
      // Remove schedule
      const updated: ScheduledWorkflow = {
        ...workflow,
        cronExpression: undefined,
        timezone: undefined,
        nextRunAt: undefined,
        updatedAt: now,
      };
      await this.workflowRepo.update(updated);
      return updated;
    }

    // Validate cron expression
    validateCronExpression(input.cronExpression);

    // Calculate nextRunAt
    const nextRunAt = workflow.enabled
      ? calculateNextRunAt(input.cronExpression, input.timezone, now)
      : null;

    const updated: ScheduledWorkflow = {
      ...workflow,
      cronExpression: input.cronExpression,
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(nextRunAt != null ? { nextRunAt } : { nextRunAt: undefined }),
      updatedAt: now,
    };

    await this.workflowRepo.update(updated);

    return updated;
  }
}
