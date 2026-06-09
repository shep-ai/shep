/**
 * Get Scheduled Workflow History Use Case
 *
 * Returns paginated execution history for a workflow,
 * ordered by started_at DESC.
 */

import { injectable, inject } from 'tsyringe';
import type { WorkflowExecution } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '../../ports/output/repositories/workflow-execution-repository.interface.js';

const DEFAULT_LIMIT = 20;

@injectable()
export class GetScheduledWorkflowHistoryUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository,
    @inject('IWorkflowExecutionRepository')
    private readonly executionRepo: IWorkflowExecutionRepository
  ) {}

  async execute(
    nameOrId: string,
    repositoryPath?: string,
    limit?: number
  ): Promise<WorkflowExecution[]> {
    // Find workflow
    let workflow = await this.workflowRepo.findById(nameOrId);
    if (!workflow && repositoryPath) {
      workflow = await this.workflowRepo.findByName(nameOrId, repositoryPath);
    }
    if (!workflow) {
      throw new Error(`Workflow not found: "${nameOrId}"`);
    }

    return this.executionRepo.findByWorkflowId(workflow.id, limit ?? DEFAULT_LIMIT);
  }
}
