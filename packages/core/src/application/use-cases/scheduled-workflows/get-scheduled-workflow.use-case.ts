/**
 * Get Scheduled Workflow Use Case
 *
 * Finds a single workflow by name+repositoryPath or by ID.
 */

import { injectable, inject } from 'tsyringe';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../ports/output/repositories/workflow-repository.interface.js';

@injectable()
export class GetScheduledWorkflowUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository
  ) {}

  async execute(nameOrId: string, repositoryPath?: string): Promise<ScheduledWorkflow> {
    // Try find by ID first
    let workflow = await this.workflowRepo.findById(nameOrId);

    // Then try by name+repoPath
    if (!workflow && repositoryPath) {
      workflow = await this.workflowRepo.findByName(nameOrId, repositoryPath);
    }

    if (!workflow) {
      throw new Error(`Workflow not found: "${nameOrId}"`);
    }

    return workflow;
  }
}
