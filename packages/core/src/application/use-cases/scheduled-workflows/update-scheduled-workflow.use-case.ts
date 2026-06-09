/**
 * Update Scheduled Workflow Use Case
 *
 * Updates an existing workflow's fields. If the name changes, validates
 * uniqueness. If the cron expression or timezone changes, recalculates nextRunAt.
 */

import { injectable, inject } from 'tsyringe';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import { validateCronExpression, calculateNextRunAt } from './cron-helpers.js';

export interface UpdateScheduledWorkflowInput {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  toolConstraints?: string[];
  cronExpression?: string | null;
  timezone?: string | null;
}

@injectable()
export class UpdateScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(input: UpdateScheduledWorkflowInput): Promise<ScheduledWorkflow> {
    const workflow = await this.workflowRepo.findById(input.id);
    if (!workflow) {
      throw new Error(`Workflow not found: "${input.id}"`);
    }

    // Validate name uniqueness if name is changing
    if (input.name != null && input.name !== workflow.name) {
      const existing = await this.workflowRepo.findByName(input.name, workflow.repositoryPath);
      if (existing) {
        throw new Error(`A workflow named "${input.name}" already exists in this repository.`);
      }
    }

    // Validate new cron expression if provided
    const cronChanged = input.cronExpression !== undefined;
    const timezoneChanged = input.timezone !== undefined;
    const newCron = cronChanged ? (input.cronExpression ?? undefined) : workflow.cronExpression;
    const newTimezone = timezoneChanged ? (input.timezone ?? undefined) : workflow.timezone;

    if (newCron) {
      validateCronExpression(newCron);
    }

    // Apply updates
    const now = this.clock.now();
    const updated: ScheduledWorkflow = {
      ...workflow,
      ...(input.name != null && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description ?? undefined,
      }),
      ...(input.prompt != null && { prompt: input.prompt }),
      ...(input.toolConstraints !== undefined && {
        toolConstraints: input.toolConstraints ?? undefined,
      }),
      ...(cronChanged && { cronExpression: newCron }),
      ...(timezoneChanged && { timezone: newTimezone }),
      updatedAt: now,
    };

    // Recalculate nextRunAt if cron expression or timezone changed
    if ((cronChanged || timezoneChanged) && updated.enabled) {
      if (newCron) {
        updated.nextRunAt = calculateNextRunAt(newCron, newTimezone, now) ?? undefined;
      } else {
        updated.nextRunAt = undefined;
      }
    }

    await this.workflowRepo.update(updated);

    return updated;
  }
}
