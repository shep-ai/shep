/**
 * AiChangeRiskSignal Repository Interface (Output Port)
 *
 * Feature 098, phase 7 — narrow contract used by the posture dashboard
 * (task-40) to report the open AI-review queue depth. The full set of
 * methods (record / graduate / dismiss / list) is added in phase 8 when
 * the AI review queue lands.
 */

export interface IAiChangeRiskSignalRepository {
  /**
   * Count signals in the {@link AiSignalState.Open} or
   * {@link AiSignalState.Acknowledged} states. Used by the dashboard's
   * "AI review queue" tile. Phase 8 will add filtering + listing.
   */
  countOpen(): Promise<number>;
}
