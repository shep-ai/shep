/**
 * Activity Host Reporter port (spec 148).
 *
 * A terminal host that shows each pane's agent state — Herdr marks panes
 * working, blocked or idle and notifies when one needs the user — learns
 * shep's state through this port. Outside such a host the adapter is a no-op.
 */

import type { AgentActivityState } from '../../../../domain/generated/output.js';

export interface HostActivityReport {
  state: AgentActivityState;
  /** One short line the host may show, e.g. "2 features need you". */
  message?: string;
}

export interface IActivityHostReporter {
  /** True when this process runs inside a host that shows agent state. */
  readonly available: boolean;
  /**
   * Tell the host the current state. Returns at once: delivery happens in the
   * background, a newer report supersedes one still queued, and failures are
   * swallowed — the host must never slow or break shep.
   */
  report(report: HostActivityReport): void;
  /** Tell the host shep no longer occupies the pane. Resolves even on failure. */
  release(): Promise<void>;
}
