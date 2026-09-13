/**
 * EvaluateSupervisorDecisionUseCase
 *
 * Single entry point used by the supervisor worker (and any other caller
 * that needs an evaluation) to:
 *
 *   1. Short-circuit when the `collaboration` feature flag is off
 *      (NFR-14 byte-identical default behaviour).
 *   2. Resolve the effective {@link SupervisorPolicy} for the event's
 *      scope via {@link GetSupervisorPolicyUseCase} (feature-then-scope
 *      fallback). When no policy exists the caller is told nothing was
 *      done.
 *   3. Call {@link ISupervisorAgent.evaluate} for the LLM (or stub)
 *      verdict.
 *   4. Persist the immutable {@link SupervisorDecision} via
 *      {@link ISupervisorDecisionRepository}.
 *   5. Mirror the decision into `activity_log` with `actor_id =
 *      supervisor:<supervisorRunId>` for audit reproducibility (research
 *      decision 8).
 *
 * Persistence is centralised here so the LangGraph adapter and the
 * in-memory adapter remain pure evaluators (no side effects).
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { ISupervisorDecisionRepository } from '../../ports/output/repositories/supervisor-decision-repository.interface.js';
import type {
  ISupervisorAgent,
  SupervisorEvent,
} from '../../ports/output/agents/supervisor-agent.interface.js';
import {
  NotificationEventType,
  NotificationSeverity,
  SupervisorVerdict,
  type ActivityEntry,
  type SupervisorDecision,
  type SupervisorPolicy,
} from '../../../domain/generated/output.js';
import { GetSupervisorPolicyUseCase } from './get-supervisor-policy.use-case.js';
import { EscalateToUserUseCase } from './escalate-to-user.use-case.js';

export interface EvaluateSupervisorDecisionInput {
  /** Source event being evaluated. */
  event: SupervisorEvent;
  /**
   * AgentRun id of the supervisor itself (the worker's own run). Stored
   * on the decision row and embedded in the audit `actorId` namespace.
   */
  supervisorRunId: string;
}

export interface EvaluateSupervisorDecisionResult {
  /** True when an evaluation actually ran (flag on + policy found). */
  evaluated: boolean;
  /** The persisted decision — populated only when `evaluated` is true. */
  decision?: SupervisorDecision;
  /**
   * Diagnostic reason returned when `evaluated` is false. Stable string
   * so the caller can branch deterministically.
   */
  skippedReason?: 'flag-off' | 'no-policy' | 'disabled' | 'supervisor-failed';
  /**
   * Populated when the underlying evaluator threw or timed out (FR-22). The
   * use case absorbs the error so the caller is never crashed by a
   * supervisor failure; the failure is surfaced via the
   * `SupervisorFailed` notification and an audit-log entry instead.
   */
  failureReason?: string;
}

@injectable()
export class EvaluateSupervisorDecisionUseCase {
  constructor(
    @inject('ISupervisorAgent')
    private readonly supervisorAgent: ISupervisorAgent,
    @inject('ISupervisorDecisionRepository')
    private readonly decisionRepository: ISupervisorDecisionRepository,
    @inject('IActivityLogRepository')
    private readonly activityLog: IActivityLogRepository,
    @inject('ISettingsRepository')
    private readonly settings: ISettingsRepository,
    @inject(GetSupervisorPolicyUseCase)
    private readonly getPolicy: GetSupervisorPolicyUseCase,
    @inject(EscalateToUserUseCase)
    private readonly escalateToUser: EscalateToUserUseCase
  ) {}

  async execute(input: EvaluateSupervisorDecisionInput): Promise<EvaluateSupervisorDecisionResult> {
    if (!(await this.isCollaborationEnabled())) {
      return { evaluated: false, skippedReason: 'flag-off' };
    }

    const { event, supervisorRunId } = input;

    const policy = await this.getPolicy.execute({
      scopeType: event.scopeType,
      scopeId: event.scopeId,
      featureId: event.featureId,
    });
    if (!policy) {
      return { evaluated: false, skippedReason: 'no-policy' };
    }
    // A disabled policy is inert: `shep supervisor disable` flips this flag,
    // and `shep supervisor status` reports it, so honouring it here is what
    // makes the command mean anything. Previously the flag was written,
    // displayed and even echoed into the evaluator prompt, but never read —
    // an `autonomous` policy kept evaluating and auto-closing gates after it
    // had been disabled.
    if (!policy.enabled) {
      return { evaluated: false, skippedReason: 'disabled' };
    }

    const now = new Date();

    let result;
    try {
      result = await this.supervisorAgent.evaluate({ event, policy });
    } catch (err) {
      // FR-22: a supervisor evaluator failure (timeout, model error,
      // exception) MUST NOT crash the caller. Fall back to the standard
      // human approval path by surfacing a SupervisorFailed notification
      // and recording an audit-log entry. No SupervisorDecision row is
      // written because there is no verdict to record.
      const failureReason = err instanceof Error ? err.message : String(err);
      await this.escalateToUser.execute({
        eventType: NotificationEventType.SupervisorFailed,
        severity: NotificationSeverity.Error,
        message: `Supervisor evaluation failed: ${failureReason}`,
        agentRunId: this.resolveAgentRunId(event),
        featureId: event.featureId ?? '',
        featureName: event.featureId ?? '',
        sourceEventId: event.sourceEventId,
        actorId: `supervisor:${supervisorRunId}`,
        auditField: `supervisor.failed.${event.kind}`,
        timestamp: now,
      });
      return { evaluated: false, skippedReason: 'supervisor-failed', failureReason };
    }

    const decision: SupervisorDecision = {
      id: randomUUID(),
      scopeType: event.scopeType,
      scopeId: event.scopeId,
      featureId: event.featureId,
      supervisorRunId,
      sourceEventKind: event.kind,
      sourceEventId: event.sourceEventId,
      verdict: result.verdict,
      rationale: result.rationale,
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      ruleRef: result.ruleRef,
      confidence: result.confidence,
      createdAt: now,
      updatedAt: now,
    };

    await this.decisionRepository.create(decision);
    await this.mirrorToActivityLog(decision, policy, now);

    if (result.verdict === SupervisorVerdict.escalate) {
      // The supervisor punted back to the user — surface that via the
      // notification surface so the user can pick up the gate / question
      // promptly (research decision 9).
      await this.escalateToUser.execute({
        eventType: NotificationEventType.SupervisorEscalated,
        severity: NotificationSeverity.Warning,
        message: result.rationale,
        agentRunId: this.resolveAgentRunId(event),
        featureId: event.featureId ?? '',
        featureName: event.featureId ?? '',
        sourceEventId: event.sourceEventId,
        actorId: `supervisor:${supervisorRunId}`,
        auditField: `supervisor.escalated.${event.kind}`,
        timestamp: now,
      });
    }

    return { evaluated: true, decision };
  }

  private resolveAgentRunId(event: SupervisorEvent): string {
    if ('agentRunId' in event && typeof event.agentRunId === 'string') {
      return event.agentRunId;
    }
    return '';
  }

  /**
   * Append a single audit row describing the decision. The mirror lives
   * here (rather than in the repository) so the activity-log shape is
   * not coupled to supervisor concerns and so a future audit-target
   * (PmAuditLog, structured logger, etc.) can be swapped in via DI.
   */
  private async mirrorToActivityLog(
    decision: SupervisorDecision,
    policy: SupervisorPolicy,
    timestamp: Date
  ): Promise<void> {
    const entry: ActivityEntry = {
      id: randomUUID(),
      // The source event id — gate id, question id, message id — is the
      // closest analogue to a "work item" in the supervisor flow. We
      // intentionally reuse this field so the audit drawer can list every
      // decision attached to the same source event.
      workItemId: decision.sourceEventId,
      fieldName: `supervisor.${decision.sourceEventKind}`,
      oldValue: undefined,
      newValue: decision.verdict,
      actorId: `supervisor:${decision.supervisorRunId}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.activityLog.create(entry);
    // Touch policy so static type-checkers know the parameter is used —
    // future auditing rules may reference policy.id / autonomyLevel.
    void policy.id;
  }

  private async isCollaborationEnabled(): Promise<boolean> {
    const settings = await this.settings.load();
    return settings?.featureFlags?.collaboration === true;
  }
}
