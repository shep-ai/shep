/**
 * Auto-Resolve Merged Branches Use Case
 *
 * Detects features in the Review lifecycle whose remote branches have already
 * been merged, and transitions them to Maintain. This resolves stale
 * "action needed" states that are out of sync with the actual git/PR state.
 *
 * Called on dashboard page load to ensure the UI reflects reality.
 *
 * Strategy per feature:
 * 1. If the feature has PR data, check PR status via batch `listPrStatuses`.
 *    If the PR is Merged, transition to Maintain.
 * 2. If the feature has no PR data, check if the branch is merged into the
 *    default branch using `verifyMerge` (git merge-base), and only when the
 *    branch has a commit of its own: one made after the feature was created.
 *    A branch nobody has committed to yet is "contained in" its base too —
 *    that is not a merge, and closing it would hide a feature still waiting
 *    at its gate.
 */

import { injectable, inject } from 'tsyringe';
import type { Feature } from '../../../domain/generated/output.js';
import { SdlcLifecycle, PrStatus, AgentRunStatus } from '../../../domain/generated/output.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IGitCommitHistoryService } from '../../ports/output/services/git-commit-history.service.interface.js';
import { UpdateFeatureLifecycleUseCase } from './update/update-feature-lifecycle.use-case.js';

export interface AutoResolveMergedBranchesOutput {
  resolvedCount: number;
  resolvedFeatureIds: string[];
}

@injectable()
export class AutoResolveMergedBranchesUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject(UpdateFeatureLifecycleUseCase)
    private readonly updateLifecycle: UpdateFeatureLifecycleUseCase,
    @inject('IGitCommitHistoryService')
    private readonly commitHistory: IGitCommitHistoryService
  ) {}

  async execute(features: Feature[]): Promise<AutoResolveMergedBranchesOutput> {
    const reviewFeatures = features.filter(
      (f) => f.lifecycle === SdlcLifecycle.Review && f.repositoryPath
    );

    if (reviewFeatures.length === 0) {
      return { resolvedCount: 0, resolvedFeatureIds: [] };
    }

    // Group by repository for batch PR status queries
    const byRepo = new Map<string, Feature[]>();
    for (const feature of reviewFeatures) {
      const group = byRepo.get(feature.repositoryPath) ?? [];
      group.push(feature);
      byRepo.set(feature.repositoryPath, group);
    }

    const resolvedFeatureIds: string[] = [];

    for (const [repoPath, repoFeatures] of byRepo) {
      const resolved = await this.processRepository(repoPath, repoFeatures);
      resolvedFeatureIds.push(...resolved);
    }

    return {
      resolvedCount: resolvedFeatureIds.length,
      resolvedFeatureIds,
    };
  }

  private async processRepository(repoPath: string, features: Feature[]): Promise<string[]> {
    const resolvedIds: string[] = [];

    // Check if repo has a remote — skip if not
    let hasRemote: boolean;
    try {
      hasRemote = await this.gitPrService.hasRemote(repoPath);
    } catch {
      return resolvedIds;
    }

    if (!hasRemote) {
      // No remote — try local merge verification for features without PRs
      return this.checkLocalMergeStatus(repoPath, features);
    }

    // Batch-fetch PR statuses for this repo
    let prStatuses: Awaited<ReturnType<IGitPrService['listPrStatuses']>>;
    try {
      prStatuses = await this.gitPrService.listPrStatuses(repoPath);
    } catch {
      // gh CLI not available or rate limited — fall back to local checks
      return this.checkLocalMergeStatus(repoPath, features);
    }

    // Build lookup maps
    const statusByNumber = new Map<number, (typeof prStatuses)[number]>();
    const statusByBranch = new Map<string, (typeof prStatuses)[number]>();
    for (const pr of prStatuses) {
      statusByNumber.set(pr.number, pr);
      if (pr.headRefName) {
        const existing = statusByBranch.get(pr.headRefName);
        // Prefer Merged PRs for resolution detection
        if (!existing || pr.state === PrStatus.Merged) {
          statusByBranch.set(pr.headRefName, pr);
        }
      }
    }

    for (const feature of features) {
      const resolved = await this.checkFeature(feature, statusByNumber, statusByBranch, repoPath);
      if (resolved) {
        resolvedIds.push(feature.id);
      }
    }

    return resolvedIds;
  }

  private async checkFeature(
    feature: Feature,
    statusByNumber: Map<number, { state: PrStatus }>,
    statusByBranch: Map<string, { state: PrStatus; number: number; url: string }>,
    repoPath: string
  ): Promise<boolean> {
    // Strategy 1: Feature has PR data — check if PR is merged
    if (feature.pr?.number) {
      const prInfo = statusByNumber.get(feature.pr.number);
      if (prInfo?.state === PrStatus.Merged) {
        return this.resolveFeature(feature);
      }
    }

    // Strategy 2: Match by branch name — find a merged PR for this branch
    const branchPr = statusByBranch.get(feature.branch);
    if (branchPr?.state === PrStatus.Merged) {
      // Update the feature's PR data to reflect the merged PR
      const freshFeature = await this.featureRepo.findById(feature.id);
      if (freshFeature && freshFeature.lifecycle === SdlcLifecycle.Review) {
        freshFeature.pr = {
          ...(freshFeature.pr ?? {
            url: branchPr.url,
            number: branchPr.number,
            status: PrStatus.Open,
          }),
          status: PrStatus.Merged,
        };
        await this.featureRepo.update(freshFeature);
      }
      return this.resolveFeature(feature);
    }

    // Strategy 3: No PR match — check if branch is merged locally
    return this.checkLocalMergeForFeature(repoPath, feature);
  }

  private async checkLocalMergeStatus(repoPath: string, features: Feature[]): Promise<string[]> {
    const resolvedIds: string[] = [];
    for (const feature of features) {
      const resolved = await this.checkLocalMergeForFeature(repoPath, feature);
      if (resolved) {
        resolvedIds.push(feature.id);
      }
    }
    return resolvedIds;
  }

  private async checkLocalMergeForFeature(repoPath: string, feature: Feature): Promise<boolean> {
    try {
      const defaultBranch = await this.gitPrService.getDefaultBranch(repoPath);
      const isMerged = await this.gitPrService.verifyMerge(repoPath, feature.branch, defaultBranch);
      if (isMerged && (feature.pr || (await this.hasOwnCommits(repoPath, feature)))) {
        return this.resolveFeature(feature);
      }
    } catch {
      // Branch may not exist locally, git errors — skip silently
    }
    return false;
  }

  /**
   * Whether the branch tip was committed after the feature was created. A
   * feature with PR data skips this (an adopted branch predates its feature).
   * An unreadable date counts as no: leaving a merged feature in Review is
   * recoverable, closing one still waiting at its gate hides it.
   */
  private async hasOwnCommits(repoPath: string, feature: Feature): Promise<boolean> {
    const tip = await this.commitHistory.getCommitDate(repoPath, feature.branch);
    return tip !== null && tip.getTime() > new Date(feature.createdAt).getTime();
  }

  private async resolveFeature(feature: Feature): Promise<boolean> {
    // Re-fetch to avoid races with other processes
    const freshFeature = await this.featureRepo.findById(feature.id);
    if (!freshFeature || freshFeature.lifecycle !== SdlcLifecycle.Review) {
      return false;
    }

    await this.updateLifecycle.execute({
      featureId: feature.id,
      lifecycle: SdlcLifecycle.Maintain,
    });

    // Mark agent run as completed if one exists
    if (freshFeature.agentRunId) {
      try {
        await this.agentRunRepo.updateStatus(freshFeature.agentRunId, AgentRunStatus.completed);
      } catch {
        // Non-critical — agent run may already be completed
      }
    }

    return true;
  }
}
