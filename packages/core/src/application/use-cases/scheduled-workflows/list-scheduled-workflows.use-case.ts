/**
 * List Scheduled Workflows Use Case
 *
 * Returns all workflows for a repository path with optional filters.
 */

import { injectable, inject } from 'tsyringe';
import type { ScheduledWorkflow } from '../../../domain/generated/output.js';
import type {
  IWorkflowRepository,
  WorkflowListFilters,
} from '../../ports/output/repositories/workflow-repository.interface.js';

@injectable()
export class ListScheduledWorkflowsUseCase {
  constructor(
    @inject('IWorkflowRepository')
    private readonly workflowRepo: IWorkflowRepository
  ) {}

  async execute(filters?: WorkflowListFilters): Promise<ScheduledWorkflow[]> {
    return this.workflowRepo.list(filters);
  }
}
