/**
 * Toggle Scheduled Workflow Use Case
 *
 * Enables or disables a workflow's schedule. When enabling,
 * recalculates nextRunAt from the cron expression.
 */

import { injectable, inject } from 'tsyringe';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import { calculateNextRunAt } from './cron-helpers.js';

@injectable()
export class ToggleScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(
    nameOrId: string,
    enabled: boolean,
    repositoryPath?: string
  ): Promise<ScheduledWorkflow> {
    let workflow = await this.workflowRepo.findById(nameOrId);
    if (!workflow && repositoryPath) {
      workflow = await this.workflowRepo.findByName(nameOrId, repositoryPath);
    }
    if (!workflow) {
      throw new Error(`Workflow not found: "${nameOrId}"`);
    }

    const now = this.clock.now();
    const updated: ScheduledWorkflow = {
      ...workflow,
      enabled,
      updatedAt: now,
    };

    // Recalculate nextRunAt when enabling with an existing cron expression
    if (enabled && workflow.cronExpression) {
      const nextRunAt = calculateNextRunAt(workflow.cronExpression, workflow.timezone, now);
      updated.nextRunAt = nextRunAt ?? undefined;
    } else if (!enabled) {
      updated.nextRunAt = undefined;
    }

    await this.workflowRepo.update(updated);

    return updated;
  }
}
