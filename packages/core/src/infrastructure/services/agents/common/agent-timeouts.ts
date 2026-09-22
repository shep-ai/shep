/**
 * Agent Call Time Budgets
 *
 * The one place that says how long shep lets an agent call run, and how long
 * it may stay silent, when the caller has no more specific budget. Every
 * agent call without its own bound used to wait forever on a wedged agent CLI
 * — repair, conflict resolution, structured calls, the supervisor evaluator.
 */

/** Milliseconds in one minute. */
const MS_PER_MINUTE = 60_000;

/**
 * Default overall budget for one agent call (30 minutes).
 *
 * It is a backstop against a hung process, not a performance target: long
 * enough that no healthy spec phase, repair or conflict resolution comes near
 * it, short enough that a wedged agent frees its worktree the same session.
 * Feature-agent stages use it unless `workflow.stageTimeouts` overrides it.
 */
export const DEFAULT_AGENT_CALL_TIMEOUT_MS = 30 * MS_PER_MINUTE;

/**
 * Default no-output budget for one agent call (15 minutes).
 *
 * Agent CLIs legitimately go quiet: Claude Code prints nothing on stdout while
 * a Bash tool call runs, and that tool's own ceiling is 10 minutes; extended
 * thinking adds more silence before the next event. 15 minutes clears the
 * longest single silent step with margin, and still ends a stalled stream half
 * an hour before a 30-minute budget would — or hours before a long
 * implement budget from `workflow.stageTimeouts`.
 */
export const DEFAULT_AGENT_IDLE_TIMEOUT_MS = 15 * MS_PER_MINUTE;
