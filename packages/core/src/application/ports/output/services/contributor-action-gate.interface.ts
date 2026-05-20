/**
 * Contributor Action Gate Port — spec 097, NFR-5.
 *
 * Narrow approval-gate abstraction wrapping `ISupervisorAgent` for the
 * contributor pipeline. Every external side-effect (label / comment /
 * assign / Discord post / recap publish) flows through this port before
 * execution so the supervisor approval flow is enforced at one chokepoint.
 *
 * Why a separate port instead of injecting `ISupervisorAgent` directly:
 *   - The supervisor's `evaluate(event, policy)` API is generic across the
 *     full agent-collaboration fabric and forces every caller to construct
 *     a `SupervisorEvent` + resolve a `SupervisorPolicy` snapshot. That
 *     ceremony is a poor fit for tiny "is this label change OK?" calls.
 *   - The narrow port keeps the contributor use cases readable, isolates
 *     the policy-resolution concern in the infra adapter, and lets the
 *     adapter add channel-specific defaults (e.g. auto-approve labels in
 *     autonomous mode) without changing every caller.
 */

/**
 * Discriminator for the kind of side-effect being gated. Used by adapters
 * to apply per-kind policy overrides (e.g. auto-approve labels but always
 * escalate Discord posts).
 */
export type ContributorActionKind =
  | 'github-label'
  | 'github-comment'
  | 'github-assign'
  | 'discord-post'
  | 'recap-publish-file'
  | 'recap-publish-discord'
  | 'recap-publish-github-discussion';

export interface ContributorGateInput {
  /** Kind of action being gated. */
  kind: ContributorActionKind;
  /** Human-readable summary safe to surface in approval UIs / logs. */
  summary: string;
  /** Optional structured context for the supervisor (no PII / secrets). */
  context?: Record<string, unknown>;
}

export interface ContributorGateDecision {
  /** True iff the supervisor approved the action. */
  approved: boolean;
  /** Human-readable rationale; safe to surface in audit logs. */
  rationale: string;
}

/**
 * Output port for gating contributor pipeline side-effects.
 */
export interface IContributorActionGate {
  /**
   * Decide whether the proposed contributor action should proceed.
   * Implementations MUST resolve (never throw) so callers can short-
   * circuit cleanly on denial without a try/catch.
   */
  gate(input: ContributorGateInput): Promise<ContributorGateDecision>;
}
