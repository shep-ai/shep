/**
 * ReflectOnFeatureRunUseCase (spec 150) — Reflect mode, the harnessing-level
 * recursion of Harness² without probes.
 *
 * After a feature run that reached implement (merged, failed or stopped):
 * INV and DOM proposers edit the current harness concurrently from the run's
 * evidence; a composer merges what the evidence supports; the result, when it
 * differs, becomes a Candidate version with edit records (all Untested — no
 * edited harness was executed) and at most one Low-confidence lesson, and is
 * offered for adoption. Every outcome is recorded as a refinement run.
 *
 * Learning must never break a feature: this use case never throws.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  HarnessEditDimension,
  HarnessImproverStage,
  HarnessOrigin,
  HarnessRefinementStatus,
  LearningMode,
  type HarnessRefinementRun,
} from '../../../domain/generated/output.js';
import { treeFromComponents } from '../../../domain/harness-learning/harness-tree.js';
import { resolveLearningConfig } from '../../../domain/harness-learning/learning-config.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IHarnessRefinementRepository } from '../../ports/output/repositories/harness-refinement-repository.interface.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IEvidenceWorkspace } from '../../ports/output/services/evidence-workspace.interface.js';
import type { IHarnessImprover } from '../../ports/output/services/harness-improver.interface.js';
import type { ITelemetry } from '../../ports/output/services/telemetry.interface.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';
import { BuildEvidenceBundleUseCase } from './build-evidence-bundle.use-case.js';
import { harnessScopeFor } from './harness-scope.js';
import { recordRefinementFinished } from './harness-telemetry.js';
import { OfferHarnessCandidateUseCase } from './offer-harness-candidate.use-case.js';
import { poolFiles, recordCandidate, runExperience } from './refinement-records.js';
import type { ReflectOnFeatureRunInput } from './reflection.types.js';
import { runImproverStage, type StageResult } from './run-improver-stage.js';

/** Reflect has no task-level budget: one propose-compose pass, no probes. */
const REFLECT_K = 0;
const SINGLE = 1;
const IMPLEMENT_PHASES = ['implement', 'fast-implement'];
const SKIP_FLAG_OFF = 'self-learning is turned off';
const SKIP_MODE_OFF = 'the learning mode is Off';
const SKIP_NO_IMPLEMENT = 'the run never reached implementation, so there is nothing to learn from';

export interface ReflectOnFeatureRunResult {
  /** Nothing ran: learning was off, or the run left nothing to learn from. */
  skipped: boolean;
  /** Why it was skipped. */
  reason?: string;
  status?: HarnessRefinementStatus;
  refinementRunId?: string;
  candidateVersionId?: string;
  autoAdopted?: boolean;
  costUsd: number;
}

@injectable()
export class ReflectOnFeatureRunUseCase {
  constructor(
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject('IHarnessRefinementRepository') private readonly runs: IHarnessRefinementRepository,
    @inject('IHarnessImprover') private readonly improver: IHarnessImprover,
    @inject('IEvidenceWorkspace') private readonly workspace: IEvidenceWorkspace,
    @inject(BuildEvidenceBundleUseCase) private readonly evidence: BuildEvidenceBundleUseCase,
    @inject(ResolveSpaceContextUseCase) private readonly spaceContext: ResolveSpaceContextUseCase,
    @inject(OfferHarnessCandidateUseCase) private readonly offer: OfferHarnessCandidateUseCase,
    @inject('IPhaseTimingRepository') private readonly timings: IPhaseTimingRepository,
    @inject('ITelemetry') private readonly telemetry: ITelemetry
  ) {}

  /** Only runs that reached implementation leave evidence worth reflecting on. */
  private async reachedImplement(featureId: string): Promise<boolean> {
    const timings = await this.timings.findByFeatureId(featureId).catch(() => []);
    return timings.some((t) => IMPLEMENT_PHASES.some((p) => t.phase.startsWith(p)));
  }

  async execute(
    input: ReflectOnFeatureRunInput,
    agentRunId: string
  ): Promise<ReflectOnFeatureRunResult> {
    const settings = await this.settings.load().catch(() => null);
    const config = resolveLearningConfig(settings?.learning);
    if (settings?.featureFlags?.selfLearning !== true) {
      return { skipped: true, reason: SKIP_FLAG_OFF, costUsd: 0 };
    }
    if (config.mode === LearningMode.Off && input.manual !== true) {
      return { skipped: true, reason: SKIP_MODE_OFF, costUsd: 0 };
    }
    if (!(await this.reachedImplement(input.featureId))) {
      return { skipped: true, reason: SKIP_NO_IMPLEMENT, costUsd: 0 };
    }

    const now = new Date();
    const repositoryPath = normalizeRepositoryPath(input.repositoryPath);
    const run: HarnessRefinementRun = {
      id: randomUUID(),
      featureId: input.featureId,
      repositoryPath,
      mode: LearningMode.Reflect,
      k: REFLECT_K,
      rollouts: 0,
      sessions: 0,
      costUsd: 0,
      status: HarnessRefinementStatus.Running,
      createdAt: now,
      updatedAt: now,
    };
    await this.runs.createRun(run);

    try {
      return await this.reflect(input, agentRunId, repositoryPath, run, config.alwaysOnCharCap);
    } catch (error) {
      await this.finish(run, {
        status: HarnessRefinementStatus.Failed,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        skipped: false,
        status: HarnessRefinementStatus.Failed,
        refinementRunId: run.id,
        costUsd: run.costUsd,
      };
    }
  }

  private async reflect(
    input: ReflectOnFeatureRunInput,
    agentRunId: string,
    repositoryPath: string,
    run: HarnessRefinementRun,
    alwaysOnCharCap: number
  ): Promise<ReflectOnFeatureRunResult> {
    const scope = await harnessScopeFor(this.spaceContext, repositoryPath);
    const parent = await this.harnesses.findAdopted(scope);
    const current = treeFromComponents(parent?.components ?? []);
    const evidence = await this.evidence.execute({ ...input, repositoryPath }, scope);
    const deps = { improver: this.improver, workspace: this.workspace };
    const spec = (stage: HarnessImproverStage, dimension?: HarnessEditDimension) => ({
      stage,
      ...(dimension ? { dimension } : {}),
      k: SINGLE,
      index: SINGLE,
      untested: true,
      alwaysOnCharCap,
    });

    const proposals = await Promise.all(
      (
        [
          ['inv1', HarnessEditDimension.Inv],
          ['dom1', HarnessEditDimension.Dom],
        ] as const
      ).map(([label, dimension]) =>
        runImproverStage(deps, {
          label,
          spec: spec(HarnessImproverStage.Propose, dimension),
          files: evidence,
          current,
          featureId: input.featureId,
        })
      )
    );
    const compose = await runImproverStage(deps, {
      label: 'agg1',
      spec: spec(HarnessImproverStage.Compose),
      files: { ...evidence, ...poolFiles(proposals) },
      current,
      featureId: input.featureId,
    });
    const stages: StageResult[] = [...proposals, compose];
    this.account(run, stages);

    if (compose.keptBase || compose.fellBack) {
      await this.finish(run, {
        status: compose.fellBack
          ? HarnessRefinementStatus.FellBack
          : HarnessRefinementStatus.KeptBase,
        ...(compose.error ? { error: compose.error } : {}),
      });
      return { skipped: false, status: run.status, refinementRunId: run.id, costUsd: run.costUsd };
    }

    const experience = await runExperience(deps, {
      evidence,
      base: current,
      candidate: compose.tree,
      pool: poolFiles(proposals),
      adoption: `The composer produced this candidate. Its notes:\n\n${compose.notes}`,
      untested: true,
      alwaysOnCharCap,
      featureId: input.featureId,
    });
    run.sessions += experience.sessions;
    run.costUsd += experience.costUsd;

    const candidate = await recordCandidate(this.harnesses, {
      scope,
      parent,
      tree: compose.tree,
      origin: HarnessOrigin.Reflect,
      notes: compose.notes,
      featureId: input.featureId,
      refinementRunId: run.id,
      experience,
      untested: true,
    });
    await this.finish(run, {
      status: HarnessRefinementStatus.Proposed,
      candidateVersionId: candidate.id,
    });

    const feature = await this.features.findById(input.featureId).catch(() => null);
    // The candidate is stored and listed either way; offering is best-effort.
    const offered = await this.offer
      .execute({ candidate, parent, featureName: feature?.name ?? input.featureId, agentRunId })
      .catch(() => ({ autoAdopted: false }));
    return {
      skipped: false,
      status: HarnessRefinementStatus.Proposed,
      refinementRunId: run.id,
      candidateVersionId: candidate.id,
      autoAdopted: offered.autoAdopted,
      costUsd: run.costUsd,
    };
  }

  private account(run: HarnessRefinementRun, stages: readonly StageResult[]): void {
    for (const s of stages) {
      run.sessions += s.sessions;
      run.costUsd += s.costUsd;
    }
  }

  private async finish(
    run: HarnessRefinementRun,
    patch: Partial<Pick<HarnessRefinementRun, 'status' | 'error' | 'candidateVersionId'>>
  ): Promise<void> {
    Object.assign(run, patch);
    await this.runs.updateRun(run).catch(() => undefined);
    recordRefinementFinished(this.telemetry, run);
  }
}
