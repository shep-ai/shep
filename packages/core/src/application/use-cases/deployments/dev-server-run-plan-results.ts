/**
 * Shared result mapping for the three dev-server run-plan use cases.
 *
 * Reading, overriding and invalidating a run plan all start the same way —
 * resolve a `{ targetType, targetId }` to a repository path — and all fail the
 * same way when that resolution does not land. Mapping those failures once
 * keeps the three use cases from drifting and gives every presentation layer
 * ONE status vocabulary to branch on.
 *
 * The vocabulary itself lives in `dev-server-run-plan-vocabulary.ts` — a leaf
 * module with no tsyringe in its import graph, so client components can import
 * the enums as values. Everything there is re-exported here, so importers of
 * this module see no difference.
 *
 * `DevServerRunPlanView` is the ready-to-render projection of a persisted plan.
 * Note `isStale` lives on it: staleness is derived here, in the application
 * layer, so the CLI and the web disclosure agree by construction and neither
 * has to know what a `configHash` is (FR-13).
 */

import type { DevServerRunPlan } from '../../../domain/generated/output.js';
import {
  DeploymentTargetResolutionStatus,
  type DeploymentTargetResolution,
  type ResolvedDeploymentTarget,
} from '../../services/deployment-target-resolver.js';
import {
  DevServerRunPlanStatus,
  type DevServerRunPlanView,
} from './dev-server-run-plan-vocabulary.js';

export {
  DevServerRunPlanStatus,
  RunPlanOverrideField,
  REPO_CONFIG_CONTROLLED_NOTICE,
  type DevServerRunPlanView,
  type RunPlanOverrideValidationError,
} from './dev-server-run-plan-vocabulary.js';

/** Failure shapes every run-plan use case can return. */
export type DevServerRunPlanTargetFailure =
  | { status: DevServerRunPlanStatus.TargetNotFound; message: string }
  | { status: DevServerRunPlanStatus.TargetPathMissing; repoPath: string; message: string }
  | {
      status: DevServerRunPlanStatus.TargetAmbiguous;
      candidates: ResolvedDeploymentTarget[];
      message: string;
    };

/** Every resolution outcome except the successful one. */
export type UnresolvedDeploymentTarget = Exclude<
  DeploymentTargetResolution,
  { status: DeploymentTargetResolutionStatus.Resolved }
>;

/** Map a non-resolving target resolution onto the shared failure vocabulary. */
export function toTargetFailure(
  resolution: UnresolvedDeploymentTarget
): DevServerRunPlanTargetFailure {
  switch (resolution.status) {
    case DeploymentTargetResolutionStatus.PathMissing:
      return {
        status: DevServerRunPlanStatus.TargetPathMissing,
        repoPath: resolution.target.repoPath,
        message: resolution.message,
      };
    case DeploymentTargetResolutionStatus.Ambiguous:
      return {
        status: DevServerRunPlanStatus.TargetAmbiguous,
        candidates: resolution.candidates,
        message: resolution.message,
      };
    default:
      return { status: DevServerRunPlanStatus.TargetNotFound, message: resolution.message };
  }
}

/** Project a persisted plan into its renderable view. */
export function toRunPlanView(plan: DevServerRunPlan, isStale: boolean): DevServerRunPlanView {
  return {
    repoPath: plan.repoPath,
    command: plan.command,
    cwd: plan.cwd,
    source: plan.source,
    setupCommands: plan.setupCommands ?? [],
    isStale,
    ...(plan.packageManager === undefined ? {} : { packageManager: plan.packageManager }),
    ...(plan.expectedPort === undefined ? {} : { expectedPort: plan.expectedPort }),
    ...(plan.language === undefined ? {} : { language: plan.language }),
    ...(plan.framework === undefined ? {} : { framework: plan.framework }),
  };
}
