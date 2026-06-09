/**
 * Approve Agent Run Use Case
 *
 * Approves a paused agent run (waiting_approval status) and
 * spawns a new resume worker to continue graph execution.
 * Optionally accepts a PrdApprovalPayload to update spec.yaml
 * selections before resuming.
 *
 * Optionally accepts a {@link SupervisorActor}. When provided, the
 * approval is attributed to that actor in the audit log
 * (`actor_id = user:<id>` or `supervisor:<id>`) and the "user always
 * wins" invariant from spec 093 is enforced:
 *  - a supervisor actor cannot override a prior user decision on the
 *    same gate (the call returns `{ approved: false }`),
 *  - a user actor proceeds even when a prior supervisor decision
 *    exists; both rows remain in `activity_log` for audit.
 *
 * Existing user-only callers that omit `actor` are unaffected — no
 * activity-log row is written and the behaviour is byte-identical to
 * the pre-spec-093 implementation.
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
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';
import type { ActivityEntry, PrdApprovalPayload } from '../../../domain/generated/output.js';
import {
  SUPERVISOR_ACTOR_NAMESPACE_SUPERVISOR,
  SUPERVISOR_ACTOR_NAMESPACE_USER,
  type SupervisorActor,
} from '../../../domain/value-objects/supervisor-actor.js';

const GATE_DECISION_FIELD = 'gate.approval';

function isGateDecisionField(field: string | undefined): boolean {
  if (!field) return false;
  return field === 'gate.approval' || field === 'gate.rejection';
}

@injectable()
export class ApproveAgentRunUseCase {
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
    @inject('IActivityLogRepository')
    private readonly activityLog: IActivityLogRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(
    id: string,
    payload?: PrdApprovalPayload,
    actor?: SupervisorActor
  ): Promise<{ approved: boolean; reason: string }> {
    const run = await this.agentRunRepository.findById(id);
    if (!run) {
      return { approved: false, reason: 'Agent run not found' };
    }

    if (actor?.namespace === SUPERVISOR_ACTOR_NAMESPACE_SUPERVISOR) {
      const blockedBy = await this.findPriorUserGateDecision(id);
      if (blockedBy) {
        return {
          approved: false,
          reason: 'User has already acted on this gate; supervisor cannot override',
        };
      }
    }

    const APPROVABLE_STATUSES = new Set([
      AgentRunStatus.waitingApproval,
      AgentRunStatus.failed,
      AgentRunStatus.interrupted,
    ]);
    if (!APPROVABLE_STATUSES.has(run.status)) {
      return {
        approved: false,
        reason: `Agent run is not in an approvable state (status: ${run.status})`,
      };
    }

    // Look up the feature to get specPath
    const feature = run.featureId ? await this.featureRepository.findById(run.featureId) : null;

    // Write updated selections to spec.yaml if changedSelections provided
    if (payload?.changedSelections && payload.changedSelections.length > 0 && feature?.specPath) {
      try {
        const specDir = feature.specPath;
        const specContent = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
        const spec = yaml.load(specContent) as Record<string, unknown>;

        if (Array.isArray(spec?.openQuestions)) {
          for (const change of payload.changedSelections) {
            const question = (spec.openQuestions as Record<string, unknown>[]).find(
              (q) => q.question === change.questionId
            );
            if (question && Array.isArray(question.options)) {
              for (const opt of question.options as Record<string, unknown>[]) {
                opt.selected = opt.option === change.selectedOption;
              }
              question.answer = change.selectedOption;
            }
          }
        }

        this.nodeHelpers.writeSpecFileAtomic(
          specDir,
          'spec.yaml',
          this.nodeHelpers.safeYamlDump(spec)
        );
      } catch {
        // Non-fatal: selection update failure should not block approval
      }
    }

    const now = new Date();
    await this.agentRunRepository.updateStatus(id, AgentRunStatus.running, {
      updatedAt: now,
    });

    // Compute and record approval wait duration
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
      // Non-fatal: approval wait timing failure should not block approval
    }

    // Derive worktree path with fallback — the mapper conditionally sets
    // worktreePath only when the DB column is non-null, so compute it if missing.
    const worktreePath =
      feature?.worktreePath ??
      (feature?.repositoryPath && feature?.branch
        ? this.worktreePaths.getWorktreePath(feature.repositoryPath, feature.branch)
        : undefined);

    this.processService.spawn(
      run.featureId ?? '',
      id,
      feature?.repositoryPath ?? run.repositoryPath ?? '',
      feature?.specPath ?? '',
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
        ...(payload ? { resumePayload: JSON.stringify(payload) } : {}),
        agentType: run.agentType,
        ...(run.modelId ? { model: run.modelId } : {}),
        ...(feature?.fast ? { fast: true } : {}),
        securityMode: (await this.settingsRepository.load())?.security?.mode,
      }
    );

    if (actor) {
      await this.recordGateDecision(id, actor, 'approved', now);
    }

    return { approved: true, reason: 'Approved and resumed' };
  }

  /**
   * Returns the first user-actor gate decision recorded for `runId`, or
   * `undefined` when no user has acted yet. Used to block a supervisor
   * actor from overriding a prior user decision (the "user always wins"
   * invariant runs in BOTH directions: user beats prior supervisor AND
   * supervisor cannot beat prior user).
   */
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
      // Audit-log outages must not block legitimate gate progression.
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
