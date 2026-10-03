/**
 * Eval run listing and the paired comparison report (spec 119, F9).
 */
import { inject, injectable } from 'tsyringe';
import {
  HarnessEvalRunStatus,
  HarnessMode,
  type HarnessEvalResult,
  type HarnessEvalRun,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type HarnessEvalSuiteSummary,
  type IHarnessEvalRepository,
  type IHarnessEvalSuiteSource,
} from '../../ports/output/harness/index.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';
import { HarnessNotFoundError } from './harness-errors.js';
import {
  compareVariants,
  summarizeVariant,
  type EvalComparison,
  type EvalVariantSummary,
} from './harness-eval-scoring.js';

export interface HarnessEvalReport {
  run: HarnessEvalRun;
  results: HarnessEvalResult[];
  variants: EvalVariantSummary[];
  comparison: EvalComparison[];
}

const DEFAULT_LIMIT = 50;
export const ORPHANED_EVAL_ERROR = 'The process running this eval exited before it finished';

@injectable()
export class ListHarnessEvalRunsUseCase {
  constructor(
    @inject(HARNESS_TOKENS.EvalRepository) private readonly evals: IHarnessEvalRepository,
    @inject(HARNESS_TOKENS.EvalSuiteSource) private readonly suites: IHarnessEvalSuiteSource,
    @inject('IProcessLivenessProbe') private readonly liveness: IProcessLivenessProbe
  ) {}

  async execute(
    input: { repoRoot?: string; limit?: number } = {}
  ): Promise<{ runs: HarnessEvalRun[]; suites: HarnessEvalSuiteSummary[] }> {
    const [stored, suites] = await Promise.all([
      this.evals.listRuns(input.limit ?? DEFAULT_LIMIT),
      this.suites.list(input.repoRoot),
    ]);
    const runs = await Promise.all(stored.map((run) => this.failIfOrphaned(run)));
    return { runs, suites };
  }

  /** A run still marked in progress whose process exited will never finish. */
  private async failIfOrphaned(run: HarnessEvalRun): Promise<HarnessEvalRun> {
    const inProgress =
      run.status === HarnessEvalRunStatus.Pending || run.status === HarnessEvalRunStatus.Running;
    if (!inProgress || run.ownerPid === undefined || this.liveness.isProcessAlive(run.ownerPid)) {
      return run;
    }
    const failed: HarnessEvalRun = {
      ...run,
      status: HarnessEvalRunStatus.Failed,
      error: ORPHANED_EVAL_ERROR,
      updatedAt: new Date(),
    };
    await this.evals.putRun(failed);
    return failed;
  }
}

@injectable()
export class GetHarnessEvalReportUseCase {
  constructor(
    @inject(HARNESS_TOKENS.EvalRepository) private readonly evals: IHarnessEvalRepository
  ) {}

  async execute(input: { runId: string }): Promise<HarnessEvalReport> {
    const run = await this.evals.getRun(input.runId);
    if (!run) throw new HarnessNotFoundError('eval run', input.runId);
    const results = await this.evals.listResults(run.id);
    const variants = run.variants.map((v) => summarizeVariant(v, results));
    const comparison = compareVariants(
      variants.find((v) => v.variant === HarnessMode.Baseline),
      variants.find((v) => v.variant === HarnessMode.QueryAware)
    );
    return { run, results, variants, comparison };
  }
}
