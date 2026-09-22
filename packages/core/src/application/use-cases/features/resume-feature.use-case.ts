/**
 * Resume Feature Use Case
 *
 * Resumes an interrupted, failed, or waiting_approval feature agent run.
 * Creates a new AgentRun record and spawns a worker with --resume flag.
 *
 * A finished run releases its parallel-feature slot, so a resume is a start:
 * it claims a slot like every other start path, and a resume refused by the
 * cap fails with the reason instead of pushing the machine past it.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Feature, AgentRun } from '../../../domain/generated/output.js';
import { AgentRunStatus, BuildMode } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { isRunningLifecycle } from '../../../domain/shared/parallel-feature-limit.js';
import { FeatureCapacityService } from './capacity/feature-capacity.service.js';

const RESUMABLE_STATUSES = new Set<string>([
  AgentRunStatus.interrupted,
  AgentRunStatus.failed,
  AgentRunStatus.waitingApproval,
]);

export interface ResumeFeatureResult {
  feature: Feature;
  newRun: AgentRun;
}

@injectable()
export class ResumeFeatureUseCase {
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
    @inject(FeatureCapacityService)
    private readonly capacity: FeatureCapacityService
  ) {}

  async execute(
    featureId: string,
    options?: {
      promptPrefix?: string;
      /** The user's explicit "resume anyway" — skips the parallel-feature cap only. */
      bypassCapacityLimit?: boolean;
    }
  ): Promise<ResumeFeatureResult> {
    // Resolve feature by exact ID or prefix
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Load the most recent agent run
    if (!feature.agentRunId) {
      throw new Error(`No agent run found for feature "${feature.name}"`);
    }

    const lastRun = await this.runRepo.findById(feature.agentRunId);
    if (!lastRun) {
      throw new Error(`No agent run found for feature "${feature.name}"`);
    }

    // Detect crashed processes: if DB says "running" but the process is dead,
    // mark it as interrupted so it becomes resumable
    if (
      (lastRun.status === AgentRunStatus.running || lastRun.status === AgentRunStatus.pending) &&
      feature.agentRunId
    ) {
      await this.processService.checkAndMarkCrashed(feature.agentRunId);
      // Re-read after potential status change
      const refreshed = await this.runRepo.findById(feature.agentRunId);
      if (refreshed) {
        Object.assign(lastRun, refreshed);
      }
    }

    // Validate the run is in a resumable state
    if (lastRun.status === AgentRunStatus.running) {
      throw new Error('Agent is still running — stop it first before resuming');
    }
    if (lastRun.status === AgentRunStatus.completed) {
      throw new Error('Agent already completed successfully');
    }
    if (!RESUMABLE_STATUSES.has(lastRun.status)) {
      throw new Error(`Agent run is not in a resumable state (status: ${lastRun.status})`);
    }

    if (!feature.specPath) {
      throw new Error(`Feature "${feature.name}" is missing specPath — cannot resume`);
    }
    const specPath = feature.specPath;

    // Create a new agent run record that continues the same thread
    const now = new Date();
    const newRunId = randomUUID();
    const newRun: AgentRun = {
      id: newRunId,
      agentType: lastRun.agentType,
      agentName: lastRun.agentName,
      status: AgentRunStatus.pending,
      prompt: options?.promptPrefix
        ? `${options.promptPrefix}\n\n${lastRun.prompt}`
        : lastRun.prompt,
      threadId: lastRun.threadId, // Same thread for checkpoint continuity
      featureId: feature.id,
      repositoryPath: feature.repositoryPath,
      approvalGates: lastRun.approvalGates,
      ...(lastRun.modelId ? { modelId: lastRun.modelId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.runRepo.create(newRun);

    // Taking a parallel-feature slot and pointing the feature at the new run
    // are ONE statement: the finished run released the slot, and the new
    // pending run takes it back the moment the feature references it. The
    // same statement requires the feature to still reference the run this
    // call read, so of two concurrent resumes only one wins.
    const claimed = await this.capacity.claimSlot({
      featureId: feature.id,
      targetLifecycle: feature.lifecycle,
      requireLifecycle: feature.lifecycle,
      requireAgentRunId: lastRun.id,
      agentRunId: newRunId,
      // A lifecycle outside the running set never occupies a slot, so the cap
      // has nothing to say about it (e.g. resuming a failed merge in Review).
      bypassLimit: options?.bypassCapacityLimit === true || !isRunningLifecycle(feature.lifecycle),
      now,
    });
    if (!claimed) {
      // The unreferenced run would only clutter the history.
      await this.runRepo.delete(newRunId);
      throw new Error(await this.describeRefusedClaim(feature, lastRun.id));
    }
    const resumedFeature: Feature = { ...feature, agentRunId: newRunId, updatedAt: now };

    // Derive worktree path and spec dir for resume worker
    const worktreePath = this.worktreeService.getWorktreePath(
      feature.repositoryPath,
      feature.branch
    );

    this.processService.spawn(
      feature.id,
      newRunId,
      feature.repositoryPath,
      specPath,
      worktreePath,
      {
        resume: true,
        approvalGates: lastRun.approvalGates,
        threadId: lastRun.threadId,
        resumeFromInterrupt: lastRun.status === AgentRunStatus.waitingApproval,
        push: feature.push,
        openPr: feature.openPr,
        forkAndPr: feature.forkAndPr,
        commitSpecs: feature.commitSpecs,
        ciWatchEnabled: feature.ciWatchEnabled,
        enableEvidence: feature.enableEvidence,
        commitEvidence: feature.commitEvidence,
        agentType: lastRun.agentType,
        ...(feature.fast ? { fast: true } : {}),
        ...(feature.buildMode === BuildMode.Exploration ? { exploration: true } : {}),
        ...(lastRun.modelId ? { model: lastRun.modelId } : {}),
        resumeReason: lastRun.status,
        securityMode: (await this.settingsRepository.load())?.security?.mode,
      }
    );

    return { feature: resumedFeature, newRun };
  }

  /** Why a resume claim was refused: another resume won, or the cap is full. */
  private async describeRefusedClaim(feature: Feature, readRunId: string): Promise<string> {
    const fresh = await this.featureRepo.findById(feature.id);
    if (fresh?.agentRunId !== readRunId || fresh?.lifecycle !== feature.lifecycle) {
      return `Feature "${feature.name}" was resumed or changed by another process — nothing to resume`;
    }
    const { running, limit } = await this.capacity.snapshot();
    return (
      `Cannot resume "${feature.name}": ${running} of ${limit} parallel features are already ` +
      `running (workflow.maxParallelFeatures). Resume it when one finishes, or raise the limit.`
    );
  }
}
