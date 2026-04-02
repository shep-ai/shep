/**
 * Promote Exploration Use Case
 *
 * Transitions an exploration feature to Regular or Fast mode via in-place
 * mode transition. Changes the mode field, transitions lifecycle from
 * Exploring to Requirements (regular) or Implementation (fast), optionally
 * scaffolds missing spec YAMLs when promoting to regular, and spawns the
 * appropriate agent graph.
 *
 * Business Rules:
 * - Feature must be in Exploration mode and Exploring lifecycle
 * - Promotion preserves existing worktree and branch (prototype code)
 * - Promoting to Regular scaffolds missing spec YAMLs (spec, research, plan, tasks)
 * - Promoting to Fast does not scaffold spec YAMLs
 * - Spawns the appropriate agent graph after transition
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Feature } from '../../../../domain/generated/output.js';
import { SdlcLifecycle, FeatureMode, AgentRunStatus } from '../../../../domain/generated/output.js';
import { EXPLORING_TRANSITIONS } from '../../../../domain/lifecycle-gates.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../../ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '../../../ports/output/agents/agent-run-repository.interface.js';
import type { ISpecInitializerService } from '../../../ports/output/services/spec-initializer.interface.js';
import type { IWorktreeService } from '../../../ports/output/services/worktree-service.interface.js';
import { getSettings } from '../../../../infrastructure/services/settings.service.js';

export interface PromoteExplorationInput {
  featureId: string;
  targetMode: FeatureMode.Regular | FeatureMode.Fast;
}

export interface PromoteExplorationResult {
  feature: Feature;
}

@injectable()
export class PromoteExplorationUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IFeatureAgentProcessService')
    private readonly processService: IFeatureAgentProcessService,
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject('ISpecInitializerService')
    private readonly specInitializer: ISpecInitializerService,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService
  ) {}

  async execute(input: PromoteExplorationInput): Promise<PromoteExplorationResult> {
    const feature =
      (await this.featureRepo.findById(input.featureId)) ??
      (await this.featureRepo.findByIdPrefix(input.featureId));
    if (!feature) {
      throw new Error(`Feature not found: ${input.featureId}`);
    }

    if (feature.mode !== FeatureMode.Exploration) {
      throw new Error(
        `Feature "${feature.name}" is not in Exploration mode (current: ${feature.mode}). Only exploration features can be promoted.`
      );
    }

    if (feature.lifecycle !== SdlcLifecycle.Exploring) {
      throw new Error(
        `Feature "${feature.name}" is not in Exploring lifecycle (current: ${feature.lifecycle}). Only features in Exploring state can be promoted.`
      );
    }

    const targetLifecycle =
      input.targetMode === FeatureMode.Fast
        ? SdlcLifecycle.Implementation
        : SdlcLifecycle.Requirements;

    // Validate the transition is allowed
    if (!EXPLORING_TRANSITIONS.has(targetLifecycle)) {
      throw new Error(`Invalid promotion target lifecycle: ${targetLifecycle}`);
    }

    // Scaffold missing spec YAMLs when promoting to regular mode
    if (input.targetMode === FeatureMode.Regular && feature.specPath) {
      const worktreePath =
        feature.worktreePath ??
        this.worktreeService.getWorktreePath(feature.repositoryPath, feature.branch);
      await this.specInitializer.initialize(
        worktreePath,
        feature.slug,
        0, // Feature number hint — resolveNextNumber will use existing dir
        feature.userQuery
      );
    }

    // Create a new agent run for the promoted mode
    const settings = getSettings();
    const runId = randomUUID();
    const agentRun = {
      id: runId,
      agentType: settings.agent.type,
      agentName: 'feature-agent',
      status: AgentRunStatus.pending,
      prompt: feature.userQuery,
      threadId: randomUUID(),
      featureId: feature.id,
      repositoryPath: feature.repositoryPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.runRepo.create(agentRun);

    // Update the feature: mode, lifecycle, and agent run reference
    const updatedFeature: Feature = {
      ...feature,
      mode: input.targetMode,
      lifecycle: targetLifecycle,
      agentRunId: runId,
      updatedAt: new Date(),
    };
    await this.featureRepo.update(updatedFeature);

    // Spawn the appropriate agent graph
    const worktreePath =
      feature.worktreePath ??
      this.worktreeService.getWorktreePath(feature.repositoryPath, feature.branch);

    this.processService.spawn(
      feature.id,
      runId,
      feature.repositoryPath,
      feature.specPath ?? '',
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
        ...(input.targetMode !== FeatureMode.Regular ? { mode: input.targetMode } : {}),
      }
    );

    return { feature: updatedFeature };
  }
}
