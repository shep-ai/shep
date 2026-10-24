/**
 * Collect Gate Metrics Use Case
 *
 * Gathers the measurable gate context that guardrails are judged against: the
 * diff the feature produced, the files it touched, and whether CI passed.
 *
 * This is the shared probe for both judge paths — the supervisor's
 * deterministic pre-LLM pass and `shep fleet approve --low-risk`. Keeping one
 * definition matters: a second copy that resolved the worktree differently
 * would let the two paths disagree about what "the diff" is.
 *
 * Returns `undefined` when any piece cannot be established, so callers treat
 * "unknown" as "not provably within bounds" rather than as zero.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependencies: IFeatureRepository, IGitPrService
 */

import { injectable, inject } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import { CiStatus } from '../../../domain/generated/output.js';

export interface CollectGateMetricsInput {
  featureId: string;
  /** Repository checkout, used when the feature has no worktree of its own. */
  repositoryPath?: string;
}

export interface GateMetrics {
  /** Additions + deletions against the default branch. */
  diffLines: number;
  filesChanged: number;
  /** Repository-relative paths, as the git service reports them. */
  modifiedFiles: string[];
  /** True only when a PR exists and its CI is green. */
  ciPassed: boolean;
}

@injectable()
export class CollectGateMetricsUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService
  ) {}

  async execute(input: CollectGateMetricsInput): Promise<GateMetrics | undefined> {
    try {
      const feature = await this.featureRepo.findById(input.featureId);
      if (!feature) return undefined;

      const cwd = feature.worktreePath ?? input.repositoryPath;
      if (!cwd) return undefined;

      const baseBranch = await this.gitPrService.getDefaultBranch(cwd);
      const [summary, fileDiffs] = await Promise.all([
        this.gitPrService.getPrDiffSummary(cwd, baseBranch),
        this.gitPrService.getFileDiffs(cwd, baseBranch),
      ]);

      return {
        diffLines: summary.additions + summary.deletions,
        filesChanged: summary.filesChanged,
        modifiedFiles: fileDiffs.map((diff) => diff.path),
        // No PR yet (prd/plan gates) means CI has demonstrably not passed.
        ciPassed: feature.pr?.ciStatus === CiStatus.Success,
      };
    } catch {
      return undefined;
    }
  }
}
