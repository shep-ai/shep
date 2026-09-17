/**
 * SpawnFeatureAgentUseCase
 *
 * The single path from a persisted Feature to a running feature agent.
 *
 * Three call sites used to build the spawn options bag by hand — manual start,
 * dependency auto-unblock, and capacity admission — and they had already
 * drifted: the auto-unblock path omitted `agentType` and `model`, so a feature
 * created against a non-default agent silently resumed under the default one.
 * Anything a UI button and a background reconciler both do WILL diverge, so the
 * options bag lives here and nowhere else.
 *
 * What this use case owns:
 * - resolving the agent run (and refusing to spawn without one)
 * - bringing the branch in sync before the agent starts (optional, best-effort)
 * - resolving the worktree path, deriving it when the record has none
 * - building the per-feature options bag
 * - the spawn call itself
 *
 * What it does NOT own: lifecycle transitions and gate decisions. Callers
 * decide *whether* a feature may start; this decides *how* it starts.
 */

import { injectable, inject } from 'tsyringe';
import type { Feature, AgentRun } from '../../../domain/generated/output.js';
import { BuildMode } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { SyncFeatureBranchUseCase } from './sync-feature-branch.use-case.js';

export interface SpawnFeatureAgentInput {
  /** The feature to start. Must already carry `agentRunId` and `specPath`. */
  feature: Feature;
  /**
   * Bring the branch in sync before spawning. Default true.
   *
   * Set false only when the caller has already performed an instrumented
   * rebase of its own (the auto-unblock path records one in the activity
   * timeline) — otherwise the agent would rebase twice.
   */
  syncBranch?: boolean;
  /** Branch this feature's work depends on, when it has a parent. */
  parentBranch?: string;
}

export interface SpawnFeatureAgentResult {
  /** False when the feature was missing the agent run or spec path needed to start. */
  spawned: boolean;
  /** The agent run the feature was started under, when it started. */
  agentRun?: AgentRun;
}

@injectable()
export class SpawnFeatureAgentUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject('IFeatureAgentProcessService')
    private readonly processService: IFeatureAgentProcessService,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject(SyncFeatureBranchUseCase)
    private readonly syncFeatureBranch: SyncFeatureBranchUseCase
  ) {}

  async execute(input: SpawnFeatureAgentInput): Promise<SpawnFeatureAgentResult> {
    const { feature, syncBranch = true, parentBranch } = input;

    // Defensive: a feature that never finished initialization has no run or
    // spec to hand the worker. Callers treat this as "did not start" rather
    // than as an error, matching the previous per-call-site guards.
    if (!feature.agentRunId || !feature.specPath) {
      return { spawned: false };
    }

    const agentRun = await this.runRepo.findById(feature.agentRunId);
    if (!agentRun) {
      return { spawned: false };
    }

    if (syncBranch) {
      // Commit whatever is already in the worktree and rebase so the agent
      // starts in sync — onto the parent's work when this feature depends on
      // another, onto the base branch otherwise. Best-effort: a repo without a
      // remote, or a rebase that needs a human, must not block the agent.
      try {
        await this.syncFeatureBranch.execute({
          repositoryPath: feature.repositoryPath,
          branch: feature.branch,
          ...(parentBranch ? { parentBranch } : {}),
        });
      } catch {
        // Sync failure is non-fatal — the agent starts from the current tree.
        // Any work in progress was either committed or left untouched.
      }
    }

    // A feature created as Blocked or queued never went through worktree setup,
    // so the stored path is often empty — derive it rather than letting the
    // agent run in the repository root.
    const storedWorktreePath = feature.worktreePath ?? '';
    const worktreePath =
      storedWorktreePath.length > 0
        ? storedWorktreePath
        : this.worktreeService.getWorktreePath(feature.repositoryPath, feature.branch);

    const settings = await this.settingsRepository.load();

    this.processService.spawn(
      feature.id,
      feature.agentRunId,
      feature.repositoryPath,
      feature.specPath,
      worktreePath,
      {
        approvalGates: feature.approvalGates,
        threadId: agentRun.threadId,
        push: feature.push,
        openPr: feature.openPr,
        forkAndPr: feature.forkAndPr,
        commitSpecs: feature.commitSpecs,
        ciWatchEnabled: feature.ciWatchEnabled,
        enableEvidence: feature.enableEvidence,
        commitEvidence: feature.commitEvidence,
        agentType: agentRun.agentType,
        ...(feature.fast || feature.buildMode === BuildMode.Fast ? { fast: true } : {}),
        ...(feature.buildMode === BuildMode.Exploration ? { exploration: true } : {}),
        ...(agentRun.modelId ? { model: agentRun.modelId } : {}),
        securityMode: settings?.security?.mode,
      }
    );

    return { spawned: true, agentRun };
  }

  /**
   * Convenience overload for callers holding an id rather than the entity.
   * Returns `{ spawned: false }` for a missing or soft-deleted feature.
   */
  async executeById(
    featureId: string,
    options?: Omit<SpawnFeatureAgentInput, 'feature'>
  ): Promise<SpawnFeatureAgentResult> {
    const feature = await this.featureRepo.findById(featureId);
    if (!feature) {
      return { spawned: false };
    }
    return this.execute({ feature, ...options });
  }
}
