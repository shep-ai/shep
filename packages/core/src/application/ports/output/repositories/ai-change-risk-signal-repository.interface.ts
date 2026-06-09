/**
 * AiChangeRiskSignal Repository Interface (Output Port)
 *
 * Feature 098. Phase 7 introduced the narrow `countOpen()` method used by
 * the dashboard tile. Phase 8 (tasks 49-51) expands the contract to cover
 * the full record / graduate / dismiss / list flow surfaced by the
 * `/aspm/ai-review` queue (FR-29 to FR-32).
 */

import type {
  AiChangeRiskSignal,
  AiSignalState,
  AiSignalType,
} from '../../../../domain/generated/output.js';

/** Filter shape used by list-ai-signals (UI queue + JSON queries). */
export interface AiSignalListFilter {
  /** Restrict to a single application. */
  applicationId?: string;
  /** Restrict to a single agent session (drill-back). */
  agentSessionId?: string;
  /** Restrict to the supplied state set (defaults to Open + Acknowledged). */
  states?: AiSignalState[];
  /** Restrict to the supplied signal type set. */
  signalTypes?: AiSignalType[];
  /** Page size (default 50). */
  limit?: number;
  /** Page offset (default 0). */
  offset?: number;
}

export interface IAiChangeRiskSignalRepository {
  /**
   * Count signals in the {@link AiSignalState.Open} or
   * {@link AiSignalState.Acknowledged} states. Used by the dashboard's
   * "AI review queue" tile.
   */
  countOpen(): Promise<number>;

  /** Persist a new AiChangeRiskSignal. */
  create(signal: AiChangeRiskSignal): Promise<void>;

  /** Fetch a signal by id (excludes soft-deleted). */
  findById(id: string): Promise<AiChangeRiskSignal | null>;

  /** List signals matching the supplied filter, ordered newest-first. */
  list(filter?: AiSignalListFilter): Promise<AiChangeRiskSignal[]>;

  /**
   * Transition a signal to {@link AiSignalState.GraduatedToFinding}, set
   * the back-link to the new finding, and stamp `resolvedAt`. Implementations
   * MUST be transactional.
   */
  markGraduated(id: string, graduatedFindingId: string, now: Date): Promise<void>;

  /**
   * Transition a signal to {@link AiSignalState.Dismissed} and stamp
   * `resolvedAt`. The use case rolls the dismissal justification into the
   * `evidence` payload before calling — the repository persists the
   * updated evidence atomically alongside the state change.
   */
  markDismissed(id: string, evidence: string | undefined, now: Date): Promise<void>;

  /**
   * Transition a signal to a new state without graduation or dismissal
   * (e.g. Open → Acknowledged). Stamps `resolvedAt` when transitioning
   * into a terminal state.
   */
  updateState(id: string, state: AiSignalState, now: Date): Promise<void>;

  /** Soft-delete the signal. The row is preserved for audit. */
  softDelete(id: string): Promise<void>;
}
