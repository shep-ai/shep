/**
 * Pure helper: convert new {@link SupervisorDecision} rows into
 * {@link SupervisorDecisionStreamEvent} entries for the SSE pipeline
 * (spec 093, task 30).
 *
 * Mirrors the existing computeMessageDeltas shape: caller owns the
 * cache, helper is pure beyond mutating that cache, never queries
 * repositories. Decisions are immutable audit rows so we only need a
 * `deliveredIds` set and a high-water `lastSeenAt` mark — there is no
 * status transition to track (unlike {@link AgentQuestion}).
 */

import type { SupervisorDecision } from '../../../../domain/generated/output.js';
import {
  createdAtMillis,
  retainDeliveredAtCursor,
} from '../../../../domain/shared/delivery-cursor.js';
import type {
  StreamedAgentEvent,
  SupervisorDecisionStreamEvent,
} from './stream-agent-events.types.js';

/** Per-connection cached state for the supervisor-decision stream. */
export interface CachedSupervisorDecisionState {
  /** High-water mark — millis of the most-recent decision we emitted. */
  lastSeenAt: number;
  /**
   * Ids already emitted AT `lastSeenAt` — the only ones the next
   * `since = lastSeenAt` read can return again. Trimmed after every batch, so
   * it never outgrows the rows sharing one millisecond (spec 116).
   */
  deliveredIds: Set<string>;
}

export interface ComputeDecisionDeltasArgs {
  /** Decisions returned by ISupervisorDecisionRepository for the current scope. */
  decisions: SupervisorDecision[];
  cache: CachedSupervisorDecisionState;
}

function toIsoString(value: SupervisorDecision['createdAt']): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date(0).toISOString();
}

export function computeDecisionDeltas(args: ComputeDecisionDeltasArgs): StreamedAgentEvent[] {
  const { decisions, cache } = args;
  const events: SupervisorDecisionStreamEvent[] = [];

  for (const d of decisions) {
    if (cache.deliveredIds.has(d.id)) continue;

    const createdMs = createdAtMillis(d.createdAt);
    cache.deliveredIds.add(d.id);
    if (createdMs > cache.lastSeenAt) cache.lastSeenAt = createdMs;

    events.push({
      kind: 'supervisor_decision',
      decisionId: d.id,
      scopeType: d.scopeType,
      scopeId: d.scopeId,
      featureId: d.featureId,
      supervisorRunId: d.supervisorRunId,
      sourceEventKind: d.sourceEventKind,
      sourceEventId: d.sourceEventId,
      verdict: d.verdict,
      rationale: d.rationale,
      modelId: d.modelId,
      promptVersion: d.promptVersion,
      ruleRef: d.ruleRef,
      confidence: d.confidence,
      createdAt: toIsoString(d.createdAt),
    });
  }

  retainDeliveredAtCursor(cache.deliveredIds, decisions, cache.lastSeenAt);
  return events;
}
