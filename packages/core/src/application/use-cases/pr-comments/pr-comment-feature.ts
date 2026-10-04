/**
 * The feature a PR comment use case works on (spec 124): found by id or id
 * prefix, waiting for review with an open pull request, and the checkout its
 * agent and gh run in.
 */

import { PrStatus, SdlcLifecycle, type Feature } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';

export interface FeaturePullRequest {
  feature: Feature;
  prNumber: number;
  /** The feature's worktree, where the branch is checked out. */
  worktreePath: string;
}

export type FeaturePullRequestResult =
  | ({ ok: true } & FeaturePullRequest)
  | { ok: false; error: string };

export async function findFeature(
  features: IFeatureRepository,
  ref: string
): Promise<Feature | null> {
  return (await features.findById(ref)) ?? (await features.findByIdPrefix(ref));
}

/** The feature's open pull request, or why there is none to work on. */
export function featurePullRequest(
  feature: Feature,
  worktreePaths: IWorktreePathProvider
): FeaturePullRequestResult {
  const pr = feature.pr;
  if (pr?.status !== PrStatus.Open) {
    return { ok: false, error: `${feature.name} has no open pull request.` };
  }
  if (feature.lifecycle !== SdlcLifecycle.Review) {
    return {
      ok: false,
      error: `${feature.name} is not waiting for review (it is in ${feature.lifecycle}).`,
    };
  }
  return {
    ok: true,
    feature,
    prNumber: pr.number,
    worktreePath:
      feature.worktreePath ?? worktreePaths.getWorktreePath(feature.repositoryPath, feature.branch),
  };
}

/** Finds the feature and its open pull request. */
export async function resolveFeaturePullRequest(
  features: IFeatureRepository,
  worktreePaths: IWorktreePathProvider,
  ref: string
): Promise<FeaturePullRequestResult> {
  const feature = await findFeature(features, ref);
  if (!feature) return { ok: false, error: `Feature not found: "${ref}"` };
  return featurePullRequest(feature, worktreePaths);
}
