/**
 * Process Liveness Probe (port)
 *
 * Minimal check for whether a given OS process id is still alive. Used by
 * the agent-events stream to detect crashed agents when the DB still shows
 * an in-flight run but the owning process has died.
 *
 * Extracted from `infrastructure/services/process/is-process-alive.ts` so
 * the application layer (and the SSE route) never imports infrastructure
 * directly (clean-arch violation #5 in spec 089).
 */

export interface IProcessLivenessProbe {
  /**
   * Returns true when a process with the given PID is still running on the
   * host. Returns false for unknown/zombie PIDs and for any error condition
   * (e.g. permission denied) — callers treat "unknown" as "not alive".
   */
  isProcessAlive(pid: number): boolean;
}
