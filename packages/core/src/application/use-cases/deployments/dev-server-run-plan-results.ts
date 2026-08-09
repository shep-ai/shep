/**
 * Shared result vocabulary for the three dev-server run-plan use cases.
 *
 * Reading, overriding and invalidating a run plan all start the same way —
 * resolve a `{ targetType, targetId }` to a repository path — and all fail the
 * same way when that resolution does not land. Mapping those failures once
 * keeps the three use cases from drifting and gives every presentation layer
 * ONE status vocabulary to branch on.
 *
 * `DevServerRunPlanView` is the ready-to-render projection of a persisted plan.
 * Note `isStale` lives on it: staleness is derived here, in the application
 * layer, so the CLI and the web disclosure agree by construction and neither
 * has to know what a `configHash` is (FR-13).
 */

import type { DevServerRunPlan, RunPlanSource } from '../../../domain/generated/output.js';
import {
  DeploymentTargetResolutionStatus,
  type DeploymentTargetResolution,
  type ResolvedDeploymentTarget,
} from '../../services/deployment-target-resolver.js';

/** Outcome vocabulary shared by all three run-plan use cases. */
export enum DevServerRunPlanStatus {
  /** The operation completed. */
  Ok = 'ok',
  /** The target resolved, but no plan is cached for it. */
  NoPlan = 'no-plan',
  /** A committed `.shep/dev.json` outranks anything that could be written. */
  RepoConfigControlled = 'repo-config-controlled',
  /** The supplied override failed validation; nothing was written. */
  ValidationFailed = 'validation-failed',
  /** No such deployment target. */
  TargetNotFound = 'target-not-found',
  /** The target exists but its directory is gone from disk. */
  TargetPathMissing = 'target-path-missing',
  /** Several equally-specific targets matched. */
  TargetAmbiguous = 'target-ambiguous',
}

/** A persisted run plan in ready-to-render form. */
export interface DevServerRunPlanView {
  /** Directory the plan is keyed by and spawns relative to. */
  repoPath: string;
  command: string;
  cwd: string;
  source: RunPlanSource;
  packageManager?: string;
  expectedPort?: number;
  language?: string;
  framework?: string;
  setupCommands: string[];
  /**
   * The repository's config files have changed since the plan was produced.
   * Reported, never acted on: a pinned plan that could be overruled by a
   * heuristic would not be a pin (FR-15).
   */
  isStale: boolean;
}

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

/**
 * Explanation attached to any successful operation on a repository whose
 * `.shep/dev.json` is in charge — so a surface can say why a database plan is
 * not the last word without re-deriving the rule.
 */
export const REPO_CONFIG_CONTROLLED_NOTICE =
  'A committed .shep/dev.json controls this repository — it is re-read on every ' +
  'start and outranks any stored plan. Edit that file to change what runs.';
