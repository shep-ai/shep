/**
 * ManageAutopilotUseCase (spec 132): a space's autopilot policy — off until
 * set — and its recent passes. Filling the line needs a project to build into.
 */

import { injectable, inject } from 'tsyringe';
import type {
  AutopilotPolicy,
  AutopilotRun,
  PmProject,
  Space,
} from '../../../domain/generated/output.js';
import { MAX_DAILY_FIX_BUDGET, defaultAutopilotPolicy } from '../../../domain/shared/autopilot.js';
import type {
  IAutopilotPolicyRepository,
  IAutopilotRunRepository,
} from '../../ports/output/repositories/autopilot-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';

/** Recent passes shown with the policy. */
const RECENT_RUNS = 10;

export interface AutopilotChange {
  investigateUrgent?: boolean;
  fixConfident?: boolean;
  mergeFixes?: boolean;
  fillLine?: boolean;
  /** Project id or slug to build the line into; null clears it. */
  project?: string | null;
  dailyFixBudget?: number;
}

export interface AutopilotView {
  space: Space;
  policy: AutopilotPolicy;
  /** The space has never set its own policy. */
  isDefault: boolean;
  /** The project the line is built into, when it still exists. */
  project?: PmProject;
  runs: AutopilotRun[];
}

const FLAGS = ['investigateUrgent', 'fixConfident', 'mergeFixes', 'fillLine'] as const;

@injectable()
export class ManageAutopilotUseCase {
  constructor(
    @inject('IAutopilotPolicyRepository') private readonly policies: IAutopilotPolicyRepository,
    @inject('IAutopilotRunRepository') private readonly runs: IAutopilotRunRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository
  ) {}

  /** Space id or slug; the default space when omitted. */
  async get(space?: string): Promise<OpportunityResult<AutopilotView>> {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    const own = await this.policies.find(scope.space.id);
    const project = own?.projectId ? await this.projects.findById(own.projectId) : null;
    return {
      ok: true,
      space: scope.space,
      policy: own ?? defaultAutopilotPolicy(scope.space.id, new Date()),
      isDefault: own === null,
      ...(project ? { project } : {}),
      runs: await this.runs.listBySpace(scope.space.id, RECENT_RUNS),
    };
  }

  async set(
    space: string | undefined,
    change: AutopilotChange
  ): Promise<OpportunityResult<{ policy: AutopilotPolicy }>> {
    const budget = change.dailyFixBudget;
    if (
      budget !== undefined &&
      (!Number.isInteger(budget) || budget < 0 || budget > MAX_DAILY_FIX_BUDGET)
    ) {
      return failure(`The daily fix budget is a whole number from 0 to ${MAX_DAILY_FIX_BUDGET}.`);
    }
    const current = await this.get(space);
    if (!current.ok) return current;
    const { projectId: previousProject, ...rest } = current.policy;
    let projectId = previousProject;
    if (change.project === null) projectId = undefined;
    else if (change.project !== undefined) {
      const ref = change.project.trim();
      const project = (await this.projects.findById(ref)) ?? (await this.projects.findBySlug(ref));
      if (!project) return failure(`No project "${change.project}".`);
      projectId = project.id;
    }
    const policy: AutopilotPolicy = {
      ...rest,
      ...(projectId ? { projectId } : {}),
      ...(budget === undefined ? {} : { dailyFixBudget: budget }),
      updatedAt: new Date(),
    };
    for (const flag of FLAGS) {
      const value = change[flag];
      if (value !== undefined) policy[flag] = value;
    }
    if (policy.fillLine && !policy.projectId) {
      return failure('Filling the line needs a project to build into.');
    }
    await this.policies.save(policy);
    return { ok: true, policy };
  }
}
