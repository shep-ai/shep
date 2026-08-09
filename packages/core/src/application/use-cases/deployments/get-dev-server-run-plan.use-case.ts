/**
 * Get Dev Server Run Plan Use Case
 *
 * Answers "what will actually run when I press Start?" for any deployment
 * target, in ready-to-render form. Until this existed, `dev_server_run_plans`
 * rows were written by the graph and read by nobody — so an agent-inferred
 * command that was wrong had no surface that could show it.
 *
 * Two derivations live here rather than in a presentation layer:
 *
 * - `isStale`, from the stored `configHash` against the repository's current
 *   one. Presentation layers do not know what a config hash is, and if two of
 *   them computed it they would eventually disagree (FR-13).
 * - `repoConfigControlled`, because a committed `.shep/dev.json` is re-read on
 *   every start and outranks whatever is stored — so both the web Edit action
 *   and `shep dev plan set` need to explain why they are unavailable.
 *
 * Never throws for an expected condition: an unknown target, a missing
 * directory and an uncached plan are all typed results.
 */

import { inject, injectable } from 'tsyringe';

import type { IDevServerRunPlanRepository } from '../../ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IRunPlanStalenessProbe } from '../../ports/output/services/run-plan-staleness-probe.interface.js';
import {
  DeploymentTargetResolutionStatus,
  DeploymentTargetResolver,
  type DeploymentTargetRef,
} from '../../services/deployment-target-resolver.js';
import {
  DevServerRunPlanStatus,
  toRunPlanView,
  toTargetFailure,
  type DevServerRunPlanTargetFailure,
  type DevServerRunPlanView,
} from './dev-server-run-plan-results.js';

export type GetDevServerRunPlanResult =
  | {
      status: DevServerRunPlanStatus.Ok;
      repoPath: string;
      /** A committed `.shep/dev.json` is in charge — overrides are refused. */
      repoConfigControlled: boolean;
      plan: DevServerRunPlanView;
    }
  | {
      status: DevServerRunPlanStatus.NoPlan;
      repoPath: string;
      repoConfigControlled: boolean;
    }
  | DevServerRunPlanTargetFailure;

@injectable()
export class GetDevServerRunPlanUseCase {
  constructor(
    @inject('DeploymentTargetResolver')
    private readonly targetResolver: DeploymentTargetResolver,
    @inject('IDevServerRunPlanRepository')
    private readonly runPlanRepository: IDevServerRunPlanRepository,
    @inject('IRunPlanStalenessProbe')
    private readonly stalenessProbe: IRunPlanStalenessProbe
  ) {}

  async execute(ref: DeploymentTargetRef): Promise<GetDevServerRunPlanResult> {
    const resolution = await this.targetResolver.resolve(ref);
    if (resolution.status !== DeploymentTargetResolutionStatus.Resolved) {
      return toTargetFailure(resolution);
    }

    const { repoPath } = resolution.target;
    const repoConfigControlled = this.stalenessProbe.hasRepoDevConfig(repoPath);

    const plan = await this.runPlanRepository.findByRepoPath(repoPath);
    if (!plan) {
      return { status: DevServerRunPlanStatus.NoPlan, repoPath, repoConfigControlled };
    }

    const isStale = plan.configHash !== this.stalenessProbe.currentConfigHash(repoPath);
    return {
      status: DevServerRunPlanStatus.Ok,
      repoPath,
      repoConfigControlled,
      plan: toRunPlanView(plan, isStale),
    };
  }
}
