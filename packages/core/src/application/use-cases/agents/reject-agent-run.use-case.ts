/**
 * Reject Agent Run Use Case
 *
 * Rejects a paused agent run (waiting_approval status) and
 * spawns a resume worker to iterate with user feedback.
 * Appends rejection feedback to spec.yaml for tracking.
 *
 * Optionally accepts a {@link SupervisorActor}. When provided, the
 * rejection is attributed to that actor in the audit log
 * (`actor_id = user:<id>` or `supervisor:<id>`) and the "user always
 * wins" invariant from spec 093 is enforced — see
 * {@link ApproveAgentRunUseCase} for the full description.
 */

import { injectable, inject } from 'tsyringe';
import yaml from 'js-yaml';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import type { INodeHelpers } from '../../ports/output/services/node-helpers.interface.js';
import type { IPhaseTimingContext } from '../../ports/output/services/phase-timing-context.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';
import type {
  ActivityEntry,
  PrdRejectionPayload,
  RejectionFeedbackEntry,
} from '../../../domain/generated/output.js';
import {
  SUPERVISOR_ACTOR_NAMESPACE_SUPERVISOR,
  SUPERVISOR_ACTOR_NAMESPACE_USER,
  type SupervisorActor,
} from '../../../domain/value-objects/supervisor-actor.js';

const GATE_DECISION_FIELD = 'gate.rejection';

function isGateDecisionField(field: string | undefined): boolean {
  if (!field) return false;
  return field === 'gate.approval' || field === 'gate.rejection';
}

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
    private readonly phaseTimingRepository: IPhaseTimingRepository,
    @inject('IWorktreePathProvider')
    private readonly worktreePaths: IWorktreePathProvider,
    @inject('INodeHelpers')
    private readonly nodeHelpers: INodeHelpers,
    @inject('IPhaseTimingContext')
    private readonly phaseTimingContext: IPhaseTimingContext,
    @inject('IActivityLogRepository')
    private readonly activityLog: IActivityLogRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(
    id: string,
    feedback: string,
    attachments?: string[],
    actor?: SupervisorActor
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

    if (actor?.namespace === SUPERVISOR_ACTOR_NAMESPACE_SUPERVISOR) {
      const blockedBy = await this.findPriorUserGateDecision(id);
      if (blockedBy) {
        return {
          rejected: false,
          reason: 'User has already acted on this gate; supervisor cannot override',
        };
      }
    }

    const REJECTABLE_STATUSES = new Set([
      AgentRunStatus.waitingApproval,
      AgentRunStatus.failed,
      AgentRunStatus.interrupted,
    ]);
    if (!REJECTABLE_STATUSES.has(run.status)) {
      return {
        rejected: false,
        reason: `Agent run is not in a rejectable state (status: ${run.status})`,
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
      this.nodeHelpers.writeSpecFileAtomic(
        specDir,
        'spec.yaml',
        this.nodeHelpers.safeYamlDump(spec)
      );
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
    await this.phaseTimingContext.recordLifecycleEvent(
      'run:rejected',
      id,
      this.phaseTimingRepository
    );

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
      feature.worktreePath ??
      this.worktreePaths.getWorktreePath(feature.repositoryPath, feature.branch);

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
        forkAndPr: feature?.forkAndPr ?? false,
        commitSpecs: feature?.commitSpecs ?? true,
        ciWatchEnabled: feature?.ciWatchEnabled ?? true,
        enableEvidence: feature?.enableEvidence ?? false,
        commitEvidence: feature?.commitEvidence ?? false,
        resumePayload: JSON.stringify(rejectionPayload),
        agentType: run.agentType,
        ...(run.modelId ? { model: run.modelId } : {}),
        ...(feature.fast ? { fast: true } : {}),
        securityMode: (await this.settingsRepository.load())?.security?.mode,
      }
    );

    if (actor) {
      await this.recordGateDecision(id, actor, 'rejected', now);
    }

    return {
      rejected: true,
      reason: 'Rejected and iterating',
      iteration,
      iterationWarning: iteration >= 5,
    };
  }

  /** See {@link ApproveAgentRunUseCase} for the rationale. */
  private async findPriorUserGateDecision(runId: string): Promise<ActivityEntry | undefined> {
    try {
      const entries = await this.activityLog.listByWorkItem(runId);
      return entries.find(
        (e) =>
          isGateDecisionField(e.fieldName) &&
          typeof e.actorId === 'string' &&
          e.actorId.startsWith(`${SUPERVISOR_ACTOR_NAMESPACE_USER}:`)
      );
    } catch {
      return undefined;
    }
  }

  private async recordGateDecision(
    runId: string,
    actor: SupervisorActor,
    verdict: 'approved' | 'rejected',
    timestamp: Date
  ): Promise<void> {
    try {
      const entry: ActivityEntry = {
        id: randomUUID(),
        workItemId: runId,
        fieldName: GATE_DECISION_FIELD,
        oldValue: undefined,
        newValue: verdict,
        actorId: actor.value,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.activityLog.create(entry);
    } catch {
      // Audit-log outage must not block the gate transition itself.
    }
  }
}
