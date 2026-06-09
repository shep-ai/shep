/**
 * Run Scheduled Workflow Use Case
 *
 * Manually triggers a workflow execution. Creates a WorkflowExecution record
 * with triggerType=Manual and status=Queued. The scheduler service handles
 * actual execution.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { WorkflowExecution } from '../../../domain/generated/output.js';
import { WorkflowTriggerType, WorkflowExecutionStatus } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '../../ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';

@injectable()
export class RunScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IWorkflowExecutionRepository')
    private readonly executionRepo: IWorkflowExecutionRepository,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(nameOrId: string, repositoryPath?: string): Promise<WorkflowExecution> {
    // Find workflow — works on both enabled and disabled workflows
    let workflow = await this.workflowRepo.findById(nameOrId);
    if (!workflow && repositoryPath) {
      workflow = await this.workflowRepo.findByName(nameOrId, repositoryPath);
    }
    if (!workflow) {
      throw new Error(`Workflow not found: "${nameOrId}"`);
    }

    const now = this.clock.now();
    const execution: WorkflowExecution = {
      id: randomUUID(),
      workflowId: workflow.id,
      triggerType: WorkflowTriggerType.Manual,
      status: WorkflowExecutionStatus.Queued,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.executionRepo.create(execution);

    return execution;
  }
}
