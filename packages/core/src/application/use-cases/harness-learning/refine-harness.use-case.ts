/**
 * RefineHarnessUseCase (spec 150) — Explore mode: Propose–Probe–Compose on the
 * implement step, the task-level recursion of Harness² (`core/recursion.py`,
 * google-research/harness2, Apache-2.0).
 *
 * k base rollouts, then the parallel or sequential schedule (explore-
 * recursion.ts): exactly 4k rollouts and 3k improver sessions, proven by the
 * ledger. Every rollout is one implementation attempt in its own probe
 * worktree forked from the same commit. The attempt chosen by blind selection
 * is fast-forwarded into the feature worktree and its harness becomes a
 * candidate with real execution contrasts; past the cost cap the best base
 * attempt is used instead. Probes are always disposed.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  HarnessOrigin,
  HarnessRecursion,
  HarnessRefinementStatus,
  LearningMode,
  type AgentType,
  type HarnessRefinementRun,
  type LearnedHarnessVersion,
} from '../../../domain/generated/output.js';
import {
  diffHarness,
  isUnchanged,
  treeFromComponents,
  type HarnessTree,
} from '../../../domain/harness-learning/harness-tree.js';
import { RefinementLedger } from '../../../domain/harness-learning/refinement-ledger.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import type { IHarnessRefinementRepository } from '../../ports/output/repositories/harness-refinement-repository.interface.js';
import type {
  HarnessScopeKey,
  ILearnedHarnessRepository,
} from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type {
  EvidenceFiles,
  IEvidenceWorkspace,
} from '../../ports/output/services/evidence-workspace.interface.js';
import type { IHarnessImprover } from '../../ports/output/services/harness-improver.interface.js';
import type { IProbeWorktreeService } from '../../ports/output/services/probe-worktree.interface.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';
import { BuildEvidenceBundleUseCase } from './build-evidence-bundle.use-case.js';
import {
  PHASE_WIDTH,
  parallelRecursion,
  runFiles,
  sequentialRecursion,
  type RecursionResult,
} from './explore-recursion.js';
import { bestRollout, type IHarnessRolloutRunner, type ProbedRollout } from './explore.types.js';
import { harnessScopeFor } from './harness-scope.js';
import { mapLimit } from './map-limit.js';
import { OfferHarnessCandidateUseCase } from './offer-harness-candidate.use-case.js';
import { poolFiles, recordCandidate, runExperience } from './refinement-records.js';
import { OverBudget, exploreOperations, type RolledProbe } from './explore-operations.js';
import { SelectProbeOutputUseCase } from './select-probe-output.use-case.js';

const NO_SIGNALS = {
  merged: false,
  ciFixAttempts: 0,
  ciFixHistory: [],
  rejectionFeedback: [],
  validationRepairs: 0,
  lastValidationErrors: [],
};
const BASE_PREFIX = 'base';

export interface RefineHarnessInput {
  featureId: string;
  featureName: string;
  repositoryPath: string;
  featureWorktree: string;
  agentType: AgentType;
  agentRunId: string;
  k: number;
  recursion: HarnessRecursion;
  maxCostUsd: number;
  alwaysOnCharCap: number;
  runner: IHarnessRolloutRunner;
}

export interface RefineHarnessResult {
  status: HarnessRefinementStatus;
  refinementRunId: string;
  /** The chosen attempt's commits are now in the feature worktree. */
  adopted: boolean;
  chosenLabel?: string;
  candidateVersionId?: string;
  costUsd: number;
}

interface Session {
  input: RefineHarnessInput;
  run: HarnessRefinementRun;
  ledger: RefinementLedger;
  rolled: RolledProbe[];
  extraCostUsd: number;
}

@injectable()
export class RefineHarnessUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject('IHarnessRefinementRepository') private readonly runs: IHarnessRefinementRepository,
    @inject('IHarnessImprover') private readonly improver: IHarnessImprover,
    @inject('IEvidenceWorkspace') private readonly workspace: IEvidenceWorkspace,
    @inject('IProbeWorktreeService') private readonly probes: IProbeWorktreeService,
    @inject(BuildEvidenceBundleUseCase) private readonly evidence: BuildEvidenceBundleUseCase,
    @inject(SelectProbeOutputUseCase) private readonly select: SelectProbeOutputUseCase,
    @inject(OfferHarnessCandidateUseCase) private readonly offer: OfferHarnessCandidateUseCase,
    @inject(ResolveSpaceContextUseCase) private readonly spaceContext: ResolveSpaceContextUseCase
  ) {}

  async execute(input: RefineHarnessInput): Promise<RefineHarnessResult> {
    const now = new Date();
    const s: Session = {
      input,
      run: {
        id: randomUUID(),
        featureId: input.featureId,
        repositoryPath: normalizeRepositoryPath(input.repositoryPath),
        mode: LearningMode.Explore,
        recursion: input.recursion,
        k: input.k,
        rollouts: 0,
        sessions: 0,
        costUsd: 0,
        status: HarnessRefinementStatus.Running,
        createdAt: now,
        updatedAt: now,
      },
      ledger: new RefinementLedger(input.recursion, input.k),
      rolled: [],
      extraCostUsd: 0,
    };
    await this.runs.createRun(s.run);
    try {
      return await this.explore(s);
    } catch (error) {
      if (error instanceof OverBudget) return this.overBudget(s);
      return this.finish(s, false, {
        status: HarnessRefinementStatus.Failed,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await Promise.all(s.rolled.map((r) => this.probes.dispose(r.probe)));
    }
  }

  private async explore(s: Session): Promise<RefineHarnessResult> {
    const { input, ledger } = s;
    const scope = await harnessScopeFor(this.spaceContext, s.run.repositoryPath);
    const parent = await this.harnesses.findAdopted(scope);
    const baseTree = treeFromComponents(parent?.components ?? []);
    const evidence = await this.evidence.execute(
      {
        featureId: input.featureId,
        repositoryPath: s.run.repositoryPath,
        worktreePath: input.featureWorktree,
        agentType: input.agentType,
        signals: NO_SIGNALS,
      },
      scope
    );
    const baseCommit = await this.probes.headCommit(input.featureWorktree);

    const { roll, stage, guard } = exploreOperations(
      {
        probes: this.probes,
        improver: this.improver,
        workspace: this.workspace,
        runner: input.runner,
        ledger,
      },
      {
        featureId: input.featureId,
        featureWorktree: input.featureWorktree,
        baseCommit,
        k: input.k,
        recursion: input.recursion,
        sequential: input.recursion === HarnessRecursion.Sequential,
        maxCostUsd: input.maxCostUsd,
        alwaysOnCharCap: input.alwaysOnCharCap,
        rolled: s.rolled,
      }
    );

    const bases = await mapLimit(
      Array.from({ length: input.k }, (_, i) => `${BASE_PREFIX}${i + 1}`),
      PHASE_WIDTH,
      (label) => roll(label, baseTree)
    );
    guard();
    const ctx = { k: input.k, evidence, bases, baseTree, roll, stage, guard };
    const recursion =
      input.recursion === HarnessRecursion.Parallel
        ? await parallelRecursion(ctx)
        : await sequentialRecursion(ctx);
    ledger.assertIdentity();
    return this.conclude(s, { scope, parent, baseTree, evidence, bases, recursion });
  }

  private async conclude(
    s: Session,
    c: {
      scope: HarnessScopeKey;
      parent: LearnedHarnessVersion | null;
      baseTree: HarnessTree;
      evidence: EvidenceFiles;
      bases: readonly ProbedRollout[];
      recursion: RecursionResult;
    }
  ): Promise<RefineHarnessResult> {
    const { input } = s;
    const selection = await this.select.execute({
      finals: c.recursion.finals,
      task: c.evidence['task.md'] ?? input.featureName,
      seedKey: `${input.featureId}|${input.k}|${input.recursion}`,
      alwaysOnCharCap: input.alwaysOnCharCap,
      featureId: input.featureId,
    });
    s.extraCostUsd += selection.costUsd;
    const chosen = selection.chosen ?? bestRollout(c.bases);
    if (!chosen) {
      return this.finish(s, false, {
        status: HarnessRefinementStatus.Failed,
        error: 'no attempt delivered a change',
      });
    }
    await this.adoptProbe(s, chosen.label);
    s.run.selectionReason = selection.why;

    const fromFinal = c.recursion.finals.some((f) => f.label === chosen.label);
    if (!fromFinal || isUnchanged(diffHarness(c.baseTree, chosen.tree))) {
      return this.finish(s, true, { status: HarnessRefinementStatus.KeptBase });
    }
    const probeRuns = Object.fromEntries(
      s.rolled.map((r) => [r.label, runFiles([r])[`pool/${r.label}/run.md`]])
    );
    const deps = { improver: this.improver, workspace: this.workspace };
    const experience = await runExperience(deps, {
      evidence: { ...c.evidence, ...runFiles(s.rolled) },
      base: c.baseTree,
      candidate: chosen.tree,
      pool: poolFiles(c.recursion.stages, probeRuns),
      adoption: `Blind selection kept ${chosen.label}. Reason:\n\n${selection.why}`,
      untested: false,
      alwaysOnCharCap: input.alwaysOnCharCap,
      featureId: input.featureId,
    });
    s.extraCostUsd += experience.costUsd;
    const candidate = await recordCandidate(this.harnesses, {
      scope: c.scope,
      parent: c.parent,
      tree: chosen.tree,
      origin: HarnessOrigin.Explore,
      notes: c.recursion.stages.find((st) => st.label === chosen.label)?.notes ?? '',
      featureId: input.featureId,
      refinementRunId: s.run.id,
      experience,
      untested: false,
    });
    await this.offer
      .execute({
        candidate,
        parent: c.parent,
        featureName: input.featureName,
        agentRunId: input.agentRunId,
      })
      .catch(() => undefined);
    return this.finish(s, true, {
      status: HarnessRefinementStatus.Proposed,
      candidateVersionId: candidate.id,
    });
  }

  /** Past the cap: keep the best base attempt (else any attempt) so the feature still gets its change. */
  private async overBudget(s: Session): Promise<RefineHarnessResult> {
    const fallback =
      bestRollout(s.rolled.filter((r) => r.label.startsWith(BASE_PREFIX))) ?? bestRollout(s.rolled);
    if (fallback) await this.adoptProbe(s, fallback.label);
    return this.finish(s, fallback !== undefined, {
      status: HarnessRefinementStatus.OverBudget,
      error: `cost cap of $${s.input.maxCostUsd} reached`,
    });
  }

  private async adoptProbe(s: Session, label: string): Promise<void> {
    const rolled = s.rolled.find((r) => r.label === label);
    if (!rolled) return;
    await this.probes.adopt(rolled.probe, s.input.featureWorktree);
    s.run.chosenLabel = label;
  }

  private async finish(
    s: Session,
    adopted: boolean,
    patch: Partial<HarnessRefinementRun>
  ): Promise<RefineHarnessResult> {
    Object.assign(s.run, patch, {
      rollouts: s.ledger.rollouts,
      sessions: s.ledger.sessions,
      costUsd: s.ledger.costUsd + s.extraCostUsd,
    });
    await this.runs.updateRun(s.run).catch(() => undefined);
    return {
      status: s.run.status,
      refinementRunId: s.run.id,
      adopted,
      ...(s.run.chosenLabel ? { chosenLabel: s.run.chosenLabel } : {}),
      ...(s.run.candidateVersionId ? { candidateVersionId: s.run.candidateVersionId } : {}),
      costUsd: s.run.costUsd,
    };
  }
}
