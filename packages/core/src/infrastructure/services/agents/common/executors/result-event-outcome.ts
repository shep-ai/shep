/**
 * Result-Event Outcome
 *
 * The Claude CLI and the Cursor agent CLI end a turn with the same final event:
 * `{"type":"result","subtype":…,"is_error":…,"result":…}`. A run that gave up
 * (turn limit, internal error) still emits it — and exits 0 — so neither the
 * exit code nor the presence of a `result` event says the turn finished. Both
 * executors, in both their `execute()` and `executeStream()` paths, read the
 * event's own error signal through this one helper so the rule cannot drift.
 */

/**
 * Prefix the CLIs use on every failing `result` subtype
 * (`error_max_turns`, `error_during_execution`, …).
 */
const RESULT_ERROR_SUBTYPE_PREFIX = 'error_';

/**
 * Subtype of a turn that ran out of `--max-turns`. Re-running it spends the
 * same budget on the same work, so retry classification never re-runs it.
 */
export const MAX_TURNS_SUBTYPE = 'error_max_turns';

/** Text of every {@link describeResultEventError} message; retry classification matches on it. */
export const RESULT_EVENT_FAILURE_TEXT = 'run did not complete successfully';

/** Shown when a failing result carried no text and nothing reached stderr. */
const NO_DETAIL = 'no detail provided';

/** The failure a `result` event reported. */
export interface ResultEventError {
  /** The failing subtype, when the event named one. */
  readonly subtype?: string;
}

/**
 * Read a parsed `result` event's own error signal.
 *
 * @returns The failure it reports, or `undefined` when it reports success.
 */
export function resultEventError(parsed: Record<string, unknown>): ResultEventError | undefined {
  const subtype = typeof parsed.subtype === 'string' ? parsed.subtype : undefined;
  const isError =
    parsed.is_error === true || (subtype?.startsWith(RESULT_ERROR_SUBTYPE_PREFIX) ?? false);
  if (!isError) return undefined;
  return subtype ? { subtype } : {};
}

/**
 * Compose the message for a turn whose `result` event reported a failure.
 *
 * @param agentName - Human name of the agent CLI, e.g. "Claude Code"
 * @param error - What {@link resultEventError} returned
 * @param resultText - The event's `result` text, which names the reason
 * @param stderrText - Fallback detail when the result text is empty
 */
export function describeResultEventError(
  agentName: string,
  error: ResultEventError,
  resultText: string,
  stderrText = ''
): string {
  const subtype = error.subtype ? ` (${error.subtype})` : '';
  const detail = resultText.trim() || stderrText.trim() || NO_DETAIL;
  return `${agentName} ${RESULT_EVENT_FAILURE_TEXT}${subtype}: ${detail}`;
}
