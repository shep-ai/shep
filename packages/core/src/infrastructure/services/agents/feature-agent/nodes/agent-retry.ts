/**
 * Agent-call retry for feature-agent graph nodes.
 *
 * `classifyError` decides from an executor's error message whether re-running
 * the whole agent turn can help; `retryExecute` applies that decision with
 * exponential back-off. The ORDER of the checks is the policy: outcomes that a
 * re-run cannot change are tested first, because their messages routinely
 * carry an API error text from a sub-request the CLI already recovered from
 * (a stderr tail, a result text) that would otherwise read as transient.
 */

import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  AGENT_ABORTED_MESSAGE,
  AGENT_TIMEOUT_MESSAGE_PREFIX,
  SIGNAL_TERMINATION_MESSAGE_PREFIX,
  TURN_CUT_SHORT_CLAUSE,
} from '../../common/executors/process-stream.js';
import {
  MAX_TURNS_SUBTYPE,
  RESULT_EVENT_FAILURE_TEXT,
} from '../../common/executors/result-event-outcome.js';
import type { NodeLogger } from './node-helpers.js';

export type ErrorCategory =
  | 'retryable-api'
  | 'retryable-network'
  | 'retryable-truncated'
  | 'non-retryable'
  | 'unknown';

/** Transient API failures: rate limit, overload, server error (Claude CLI and AI SDK shapes). */
const API_ERROR_RE = /API Error: (400|429|5\d{2})|\(HTTP (429|5\d{2})\)/;

/** Network-level failures (Node error codes, AI SDK "Connection failed"). */
const NETWORK_ERROR_RE = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network timed out|Connection failed/i;

/**
 * Credentials the provider refused. A re-run sends the same credentials, so
 * it can only fail the same way (and a 403 re-sent three times can escalate
 * into an account lock).
 */
const AUTH_ERROR_RE =
  /API Error: 40[13]|\(HTTP 40[13]\)|authentication[ _]?(error|failed)|invalid api key|please run \/login/i;

/** Failures a re-run cannot fix, recognised after the transient checks. */
const NON_RETRYABLE_RE = new RegExp(
  `Process exited with code|ENOENT|SyntaxError|${RESULT_EVENT_FAILURE_TEXT}`
);

/**
 * Categories retried at most this many attempts in total, whatever the
 * caller's budget. A cut stream is re-run once: its usual causes (a dropped
 * pipe, a line over the size cap) rarely repeat, and when they do the second
 * failure is the signal.
 */
const CATEGORY_MAX_ATTEMPTS: Partial<Record<ErrorCategory, number>> = {
  'retryable-truncated': 2,
};

/** Categories {@link retryExecute} retries when the caller does not narrow them. */
const DEFAULT_RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'retryable-api',
  'retryable-network',
  'retryable-truncated',
  'unknown',
]);

/**
 * Only the failures that happen *around* an agent turn — the provider
 * refused or dropped a request — never ones that may have happened after the
 * agent acted. For calls whose side effects must not be repeated blind.
 */
export const TRANSIENT_ERROR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'retryable-api',
  'retryable-network',
]);

/** Default number of attempts. */
const DEFAULT_MAX_ATTEMPTS = 3;

/** Default delay before the first retry; doubles on each subsequent one. */
const DEFAULT_BASE_DELAY_MS = 2000;

/** True when the message reports an outcome that a re-run cannot change. */
function isDefinitivelyNonRetryable(errorMessage: string): boolean {
  return (
    errorMessage.includes(AGENT_ABORTED_MESSAGE) ||
    errorMessage.includes(AGENT_TIMEOUT_MESSAGE_PREFIX) ||
    errorMessage.includes(SIGNAL_TERMINATION_MESSAGE_PREFIX) ||
    errorMessage.includes(MAX_TURNS_SUBTYPE) ||
    AUTH_ERROR_RE.test(errorMessage)
  );
}

/**
 * Classify an error message into a retry category.
 *
 * - **non-retryable** (checked first): aborts by the caller, timeouts (total or idle), signal kills
 *   (OOM killer, container stop, a user's Stop), the turn limit, rejected
 *   credentials — whatever API text their detail carries.
 * - **retryable-api**: transient API errors (rate-limit, overload, 5xx).
 * - **retryable-network**: network-level failures.
 * - **retryable-truncated**: the turn ended without its terminal event.
 * - **non-retryable**: exits, failing result events, missing binaries, syntax.
 * - **unknown**: anything unrecognised (callers may choose to retry cautiously).
 */
export function classifyError(errorMessage: string): ErrorCategory {
  if (isDefinitivelyNonRetryable(errorMessage)) return 'non-retryable';
  if (API_ERROR_RE.test(errorMessage)) return 'retryable-api';
  if (NETWORK_ERROR_RE.test(errorMessage)) return 'retryable-network';
  if (errorMessage.includes(TURN_CUT_SHORT_CLAUSE)) return 'retryable-truncated';
  if (NON_RETRYABLE_RE.test(errorMessage)) return 'non-retryable';
  return 'unknown';
}

export interface RetryOptions {
  /** Maximum number of execution attempts (default 3). */
  maxAttempts?: number;
  /** Base delay in ms before the first retry (default 2000). Doubles each retry. */
  baseDelayMs?: number;
  /** Optional logger for retry messages. */
  logger?: NodeLogger;
  /**
   * Categories worth a retry. Defaults to every category except
   * `non-retryable`; pass {@link TRANSIENT_ERROR_CATEGORIES} for a call that
   * must not be repeated after the agent may have acted.
   */
  retryOn?: ReadonlySet<ErrorCategory>;
}

/**
 * Execute a prompt via the given executor with automatic retry and
 * exponential back-off for transient errors.
 *
 * Non-retryable errors, and categories outside `retryOn`, are thrown
 * immediately. Unknown errors are retried by default (conservative stance:
 * could be transient).
 */
export async function retryExecute(
  executor: IAgentExecutor,
  prompt: string,
  options: AgentExecutionOptions,
  retryOpts?: RetryOptions
): Promise<AgentExecutionResult> {
  const maxAttempts = retryOpts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = retryOpts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryOn = retryOpts?.retryOn ?? DEFAULT_RETRYABLE_CATEGORIES;
  const log = retryOpts?.logger;

  for (let attempt = 1; ; attempt++) {
    // A caller that aborted (a failed sibling task) must not get a fresh
    // attempt — not even one started after a back-off it slept through.
    if (options.abortSignal?.aborted) throw new Error(AGENT_ABORTED_MESSAGE);
    try {
      return await executor.execute(prompt, options);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const category = classifyError(error.message);
      const attemptsAllowed = Math.min(maxAttempts, CATEGORY_MAX_ATTEMPTS[category] ?? maxAttempts);

      if (!retryOn.has(category) || attempt >= attemptsAllowed) throw error;

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      log?.info(
        `Attempt ${attempt}/${attemptsAllowed} failed (${category}), retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
