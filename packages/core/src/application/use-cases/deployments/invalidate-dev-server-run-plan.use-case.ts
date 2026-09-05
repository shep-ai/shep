/**
 * Invalidate Dev Server Run Plan Use Case
 *
 * The "Re-analyze" action. Clears the cached plan for a target so the next
 * start re-runs the full tier chain (repo config → cache → detector registry →
 * agent).
 *
 * Two properties are requirements rather than incidental (FR-16):
 *
 * - It clears a plan REGARDLESS of source, including `Manual`. This is exactly
 *   why the Manual pin is enforced at the two graph call sites rather than
 *   inside the run-plan repository: a repository that refused to delete pinned
 *   rows would silently break this use case, which is the one deliberate,
 *   user-initiated way to discard an override.
 * - It works with no agent configured. Nothing here touches an executor or a
 *   structured caller; the detector registry alone can re-resolve every
 *   ecosystem it covers.
 *
 * A committed `.shep/dev.json` is NOT removed — it is the user's file, not a
 * cache, and it is re-read on every start anyway. The result says so, because
 * "I cleared the plan and the same command still runs" needs an explanation.
 */

import { inject, injectable } from 'tsyringe';

import type { RunPlanSource } from '../../../domain/generated/output.js';
import type { IDevServerRunPlanRepository } from '../../ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IRunPlanStalenessProbe } from '../../ports/output/services/run-plan-staleness-probe.interface.js';
import {
  DeploymentTargetResolutionStatus,
  DeploymentTargetResolver,
  type DeploymentTargetRef,
} from '../../services/deployment-target-resolver.js';
import {
  DevServerRunPlanStatus,
  REPO_CONFIG_CONTROLLED_NOTICE,
  toTargetFailure,
  type DevServerRunPlanTargetFailure,
} from './dev-server-run-plan-results.js';

export type InvalidateDevServerRunPlanResult =
  | {
      status: DevServerRunPlanStatus.Ok;
      repoPath: string;
      /** Which kind of plan was discarded — worth reporting for a Manual one. */
      clearedSource: RunPlanSource;
      repoConfigControlled: boolean;
      /** Present only when a committed file still controls the repository. */
      message?: string;
    }
  | {
      status: DevServerRunPlanStatus.NoPlan;
      repoPath: string;
      repoConfigControlled: boolean;
      message?: string;
    }
  | DevServerRunPlanTargetFailure;

@injectable()
export class InvalidateDevServerRunPlanUseCase {
  constructor(
    @inject('DeploymentTargetResolver')
    private readonly targetResolver: DeploymentTargetResolver,
    @inject('IDevServerRunPlanRepository')
    private readonly runPlanRepository: IDevServerRunPlanRepository,
    @inject('IRunPlanStalenessProbe')
    private readonly stalenessProbe: IRunPlanStalenessProbe
  ) {}

  async execute(ref: DeploymentTargetRef): Promise<InvalidateDevServerRunPlanResult> {
    const resolution = await this.targetResolver.resolve(ref);
    if (resolution.status !== DeploymentTargetResolutionStatus.Resolved) {
      return toTargetFailure(resolution);
    }

    const { repoPath } = resolution.target;
    const repoConfigControlled = this.stalenessProbe.hasRepoDevConfig(repoPath);
    const notice = repoConfigControlled ? { message: REPO_CONFIG_CONTROLLED_NOTICE } : {};

    const existing = await this.runPlanRepository.findByRepoPath(repoPath);
    if (!existing) {
      return {
        status: DevServerRunPlanStatus.NoPlan,
        repoPath,
        repoConfigControlled,
        ...notice,
      };
    }

    await this.runPlanRepository.deleteByRepoPath(repoPath);
    return {
      status: DevServerRunPlanStatus.Ok,
      repoPath,
      clearedSource: existing.source,
      repoConfigControlled,
      ...notice,
    };
  }
}
