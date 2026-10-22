/**
 * Reject Agent Run Use Case
 *
 * Rejects a paused agent run (waiting_approval status) and
 * spawns a resume worker to iterate with user feedback.
 * Appends rejection feedback to spec.yaml for tracking.
 */

import { injectable, inject } from 'tsyringe';
import yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';
import type {
  PrdRejectionPayload,
  RejectionFeedbackEntry,
} from '../../../domain/generated/output.js';
import { writeSpecFileAtomic } from '../../../infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import { recordLifecycleEvent } from '../../../infrastructure/services/agents/feature-agent/phase-timing-context.js';
import { computeWorktreePath } from '../../../infrastructure/services/ide-launchers/compute-worktree-path.js';

@injectable()
export class RejectAgentRunUseCase {
  constructor(
    @inject('IAgentRunRepository')
    private readonly agentRunRepository: IAgentRunRepository,
    @inject('IFeatureAgentProcessService')
    private readonly processService: IFeatureAgentProcessService,
    @inject('IFeatureRepository')
    private readonly featureRepository: IFeatureRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepository: IPhaseTimingRepository
  ) {}

  async execute(
    id: string,
    feedback: string,
    attachments?: string[]
  ): Promise<{
    rejected: boolean;
    reason: string;
    iteration?: number;
    iterationWarning?: boolean;
  }> {
    const run = await this.agentRunRepository.findById(id);
    if (!run) {
      return { rejected: false, reason: 'Agent run not found' };
    }

    if (run.status !== AgentRunStatus.waitingApproval) {
      return {
        rejected: false,
        reason: `Agent run is not waiting for approval (status: ${run.status})`,
      };
    }

    // Validate non-empty feedback
    if (!feedback?.trim()) {
      return { rejected: false, reason: 'Feedback is required for rejection' };
    }

    // Look up feature for spec path
    const feature = run.featureId ? await this.featureRepository.findById(run.featureId) : null;
    if (!feature?.specPath) {
      return { rejected: false, reason: 'Feature has no spec path' };
    }

    // Read and update spec.yaml with rejection feedback
    const specDir = feature.specPath;
    let iteration = 1;
    try {
      const specContent = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
      const spec = yaml.load(specContent) as Record<string, unknown>;

      const existingFeedback = Array.isArray(spec?.rejectionFeedback)
        ? (spec.rejectionFeedback as RejectionFeedbackEntry[])
        : [];
      iteration = existingFeedback.length + 1;

      // Derive the rejected phase from the agent run's current node
      const rejectedPhase = run.result?.startsWith('node:') ? run.result.slice(5) : undefined;

      const newEntry: RejectionFeedbackEntry = {
        iteration,
        message: feedback,
        phase: rejectedPhase,
        timestamp: new Date().toISOString(),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      };

      spec.rejectionFeedback = [...existingFeedback, newEntry];
      writeSpecFileAtomic(specDir, 'spec.yaml', yaml.dump(spec));
    } catch {
      // If spec.yaml can't be read, still proceed with iteration 1
    }

    // Update run status to running (NOT cancelled)
    const now = new Date();
    await this.agentRunRepository.updateStatus(id, AgentRunStatus.running, {
      updatedAt: now,
    });

    // Record approval wait duration
    try {
      const timings = await this.phaseTimingRepository.findByRunId(id);
      const waitingTiming = timings.find((t) => t.waitingApprovalAt && !t.approvalWaitMs);
      if (waitingTiming) {
        const waitStart =
          waitingTiming.waitingApprovalAt instanceof Date
            ? waitingTiming.waitingApprovalAt.getTime()
            : Number(waitingTiming.waitingApprovalAt);
        const approvalWaitMs = BigInt(now.getTime() - waitStart);
        await this.phaseTimingRepository.updateApprovalWait(waitingTiming.id, {
          approvalWaitMs,
        });
      }
    } catch {
      // Non-fatal
    }

    // Record rejected lifecycle event
    await recordLifecycleEvent('run:rejected', id, this.phaseTimingRepository);

    // Spawn worker with rejection payload
    const rejectionPayload: PrdRejectionPayload = {
      rejected: true,
      feedback,
      iteration,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };

    // Derive worktree path with fallback — the mapper conditionally sets
    // worktreePath only when the DB column is non-null, so compute it if missing.
    const worktreePath =
      feature.worktreePath ?? computeWorktreePath(feature.repositoryPath, feature.branch);

    this.processService.spawn(
      run.featureId ?? '',
      id,
      feature.repositoryPath,
      feature.specPath,
      worktreePath,
      {
        resume: true,
        approvalGates: run.approvalGates,
        threadId: run.threadId,
        resumeFromInterrupt: true,
        push: feature?.push ?? false,
        openPr: feature?.openPr ?? false,
        resumePayload: JSON.stringify(rejectionPayload),
        ...(feature.fast ? { fast: true } : {}),
      }
    );

    return {
      rejected: true,
      reason: 'Rejected and iterating',
      iteration,
      iterationWarning: iteration >= 5,
    };
  }
}
