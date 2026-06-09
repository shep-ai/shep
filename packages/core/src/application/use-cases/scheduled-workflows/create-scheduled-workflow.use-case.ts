/**
 * Create Scheduled Workflow Use Case
 *
 * Creates a new scheduled workflow definition. Validates:
 * - Name uniqueness within the same repository path
 * - Cron expression validity (if provided) using croner
 * - Calculates nextRunAt if a cron expression is provided
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import { validateCronExpression, calculateNextRunAt } from './cron-helpers.js';

export interface CreateScheduledWorkflowInput {
  name: string;
  description?: string;
  prompt: string;
  toolConstraints?: string[];
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  repositoryPath: string;
}

@injectable()
export class CreateScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(input: CreateScheduledWorkflowInput): Promise<ScheduledWorkflow> {
    // Validate name uniqueness within the repository
    const existing = await this.workflowRepo.findByName(input.name, input.repositoryPath);
    if (existing) {
      throw new Error(`A workflow named "${input.name}" already exists in this repository.`);
    }

    // Validate cron expression if provided
    if (input.cronExpression) {
      validateCronExpression(input.cronExpression);
    }

    const now = this.clock.now();

    // Calculate nextRunAt if cron expression is provided and workflow is enabled
    let nextRunAt: Date | null = null;
    const enabled = input.enabled !== false; // default to true
    if (input.cronExpression && enabled) {
      nextRunAt = calculateNextRunAt(input.cronExpression, input.timezone, now);
    }

    const workflow: ScheduledWorkflow = {
      id: randomUUID(),
      name: input.name,
      prompt: input.prompt,
      enabled,
      repositoryPath: input.repositoryPath,
      createdAt: now,
      updatedAt: now,
      ...(input.description != null && { description: input.description }),
      ...(input.toolConstraints != null && { toolConstraints: input.toolConstraints }),
      ...(input.cronExpression != null && { cronExpression: input.cronExpression }),
      ...(input.timezone != null && { timezone: input.timezone }),
      ...(nextRunAt != null && { nextRunAt }),
    };

    await this.workflowRepo.create(workflow);

    return workflow;
  }
}
