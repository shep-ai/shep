/**
 * Agent-run status groupings.
 *
 * Note the import convention for `domain/`: generated types only, no I/O, and
 * relative imports carry no file extension — the web package consumes this
 * directory as raw TypeScript and its bundler cannot resolve a `.js` specifier.
 */

import { AgentRunStatus } from '../generated/output';

/** Statuses a run never leaves on its own: its process is gone for good. */
export const TERMINAL_AGENT_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  AgentRunStatus.completed,
  AgentRunStatus.failed,
  AgentRunStatus.interrupted,
  AgentRunStatus.cancelled,
]);

/**
 * True while a run may still write to its log or be resumed — including a run
 * parked at an approval gate, which can sit idle for weeks.
 */
export function isActiveAgentRunStatus(status: AgentRunStatus): boolean {
  return !TERMINAL_AGENT_RUN_STATUSES.has(status);
}

/**
 * Every status that is not terminal, derived from the enum so a new
 * AgentRunStatus member is non-terminal unless it is added to
 * {@link TERMINAL_AGENT_RUN_STATUSES}, and the two lists cannot drift apart.
 * The `allowedFrom` guard for a write that may only leave a live run.
 */
export const NON_TERMINAL_AGENT_RUN_STATUSES: readonly AgentRunStatus[] = Object.values(
  AgentRunStatus
).filter((status) => !TERMINAL_AGENT_RUN_STATUSES.has(status));
