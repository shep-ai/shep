/**
 * EscalateToUserUseCase
 *
 * Single shared entry point that other use cases call when they need to
 * surface a collaboration-fabric event (supervisor escalation, supervisor
 * failure, blocking question, …) to the user via the existing notification
 * channels and the immutable activity log.
 *
 * Behaviour:
 *
 *  1. Short-circuits when `featureFlags.collaboration` is off so NFR-14
 *     (byte-identical default behaviour) is preserved.
 *  2. Dispatches a single {@link NotificationEvent} via
 *     {@link INotificationService}. The notification service itself is
 *     responsible for honoring per-event preferences and per-channel
 *     enable/disable.
 *  3. Mirrors the escalation as an immutable {@link ActivityEntry} so the
 *     audit trail records who triggered it and what kind of escalation it
 *     was (supervisor:<id>, system, etc.).
 *
 * Centralising this logic keeps {@link AskAgentQuestionUseCase} and
 * {@link EvaluateSupervisorDecisionUseCase} thin — they each call this use
 * case rather than duplicating the notify + audit pair.
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { INotificationService } from '../../ports/output/services/notification-service.interface.js';
import type {
  ActivityEntry,
  NotificationEvent,
  NotificationEventType,
  NotificationSeverity,
} from '../../../domain/generated/output.js';

export interface EscalateToUserInput {
  /** Notification kind to dispatch. */
  eventType: NotificationEventType;
  /** Display severity for the in-app/desktop notifier. */
  severity: NotificationSeverity;
  /** Human-readable description shown to the user. */
  message: string;
  /** Agent run that produced the event (may be empty for system-level). */
  agentRunId: string;
  /** Feature scope of the event. */
  featureId: string;
  /** Display name shown in the notification (caller resolves). */
  featureName: string;
  /**
   * Source event identifier (gate id, question id, message id, decision id)
   * — recorded as the activity-log work item so the audit drawer can list
   * every emission attached to the same source.
   */
  sourceEventId: string;
  /** Actor namespace for the audit row (e.g. `supervisor:<id>`, `system`). */
  actorId: string;
  /** Audit-log field name (e.g. `supervisor.escalation`, `agent.question`). */
  auditField: string;
  /** Optional pre-computed timestamp; defaults to `new Date()`. */
  timestamp?: Date;
}

export interface EscalateToUserResult {
  /** True when the flag was on and the dispatch + audit happened. */
  escalated: boolean;
}

@injectable()
export class EscalateToUserUseCase {
  constructor(
    @inject('INotificationService')
    private readonly notifications: INotificationService,
    @inject('IActivityLogRepository')
    private readonly activityLog: IActivityLogRepository,
    @inject('ISettingsRepository')
    private readonly settings: ISettingsRepository
  ) {}

  async execute(input: EscalateToUserInput): Promise<EscalateToUserResult> {
    if (!(await this.isCollaborationEnabled())) {
      return { escalated: false };
    }

    const now = input.timestamp ?? new Date();

    const event: NotificationEvent = {
      eventType: input.eventType,
      agentRunId: input.agentRunId,
      featureId: input.featureId,
      featureName: input.featureName,
      message: input.message,
      severity: input.severity,
      timestamp: now.toISOString(),
    };
    this.notifications.notify(event);

    const entry: ActivityEntry = {
      id: randomUUID(),
      workItemId: input.sourceEventId,
      fieldName: input.auditField,
      oldValue: undefined,
      newValue: input.eventType,
      actorId: input.actorId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.activityLog.create(entry);
    } catch {
      // Best effort, like the approval gates' audit writes: activity_log rows
      // reference work_items, so an escalation keyed by an agent question or
      // run can be refused. The user has already been notified; a refused audit
      // row must not fail the question that raised it.
    }

    return { escalated: true };
  }

  private async isCollaborationEnabled(): Promise<boolean> {
    const settings = await this.settings.load();
    return settings?.featureFlags?.collaboration === true;
  }
}
