/**
 * Delete Scheduled Workflow Use Case
 *
 * Soft-deletes a workflow and cancels any queued executions for it.
 * Execution history is preserved subject to the retention policy.
 */

import { injectable, inject } from 'tsyringe';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import { WorkflowExecutionStatus } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '../../ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';

@injectable()
export class DeleteScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IWorkflowExecutionRepository')
    private readonly executionRepo: IWorkflowExecutionRepository,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(nameOrId: string, repositoryPath?: string): Promise<ScheduledWorkflow> {
    // Try find by ID first, then by name
    let workflow = await this.workflowRepo.findById(nameOrId);
    if (!workflow && repositoryPath) {
      workflow = await this.workflowRepo.findByName(nameOrId, repositoryPath);
    }
    if (!workflow) {
      throw new Error(`Workflow not found: "${nameOrId}"`);
    }

    // Cancel any queued executions for this workflow
    const queuedExecutions = await this.executionRepo.findByStatus(WorkflowExecutionStatus.Queued);
    const now = this.clock.now();
    for (const execution of queuedExecutions) {
      if (execution.workflowId === workflow.id) {
        await this.executionRepo.update({
          ...execution,
          status: WorkflowExecutionStatus.Cancelled,
          completedAt: now,
          updatedAt: now,
        });
      }
    }

    // Soft-delete the workflow
    await this.workflowRepo.softDelete(workflow.id);

    return workflow;
  }
}
