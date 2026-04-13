/**
 * List Applications Use Case
 *
 * Returns all (non-deleted) application records with their effective
 * status derived from the `setupComplete` flag and workflow steps.
 */

import { injectable, inject } from 'tsyringe';
import type { Application } from '../../../domain/generated/output.js';
import { WorkflowStepStatus } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWorkflowStepRepository } from '../../ports/output/repositories/workflow-step-repository.interface.js';

/**
 * Effective status for an application, derived from persisted app
 * status + workflow step health.
 *
 *  - `ready`       — setup complete, app is usable
 *  - `building`    — setup in progress (a step is running)
 *  - `interrupted` — setup was interrupted (agent killed / crashed)
 *  - `failed`      — a setup step failed with an error
 */
export type ApplicationEffectiveStatus = 'ready' | 'building' | 'interrupted' | 'failed';

export interface ApplicationWithStatus extends Application {
  effectiveStatus: ApplicationEffectiveStatus;
}

@injectable()
export class ListApplicationsUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IWorkflowStepRepository')
    private readonly stepRepo: IWorkflowStepRepository
  ) {}

  async execute(): Promise<ApplicationWithStatus[]> {
    const apps = await this.appRepo.list();

    // For apps where setup is not complete, fetch workflow steps to
    // determine the precise status (building / interrupted / failed).
    // Apps with setupComplete=true skip the step query entirely.
    const results: ApplicationWithStatus[] = [];

    for (const app of apps) {
      if (app.setupComplete) {
        results.push({ ...app, effectiveStatus: 'ready' });
        continue;
      }

      const steps = await this.stepRepo.listByFeature(`app-${app.id}`);
      results.push({ ...app, effectiveStatus: deriveEffectiveStatus(app, steps) });
    }

    return results;
  }
}

function deriveEffectiveStatus(
  app: Application,
  steps: { status: WorkflowStepStatus }[]
): ApplicationEffectiveStatus {
  if (app.status === 'Error') return 'failed';
  if (steps.length === 0) return 'ready';

  if (steps.some((s) => s.status === WorkflowStepStatus.failed)) return 'failed';
  if (steps.some((s) => s.status === WorkflowStepStatus.interrupted)) return 'interrupted';
  if (steps.some((s) => s.status === WorkflowStepStatus.running)) return 'building';
  if (steps.every((s) => s.status === WorkflowStepStatus.done)) return 'ready';

  return 'building';
}
