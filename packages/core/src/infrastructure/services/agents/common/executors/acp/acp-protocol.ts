/**
 * ACP Protocol Decisions
 *
 * The stateless rules {@link AcpInteractiveSession} applies to Agent Client
 * Protocol messages: which permission option to pick, how to read an error,
 * which stop reasons are failures, and how to select a model from the agent's
 * advertised config options. Kept pure so each rule is testable on its own.
 */

import {
  RequestError,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type StopReason,
} from '@agentclientprotocol/sdk';
import type { AcpAgentProfile } from './acp-interactive-executor.js';

/** JSON-RPC error code ACP agents use for "Authentication required". */
const AUTH_REQUIRED_CODE = -32000;

/** Permission kinds to pick, in order; `allow_once` writes no allowlist entry. */
const APPROVAL_KIND_PREFERENCE = ['allow_once', 'allow_always'] as const;

/** Config option category (and id) ACP agents use for the model picker. */
const MODEL_CONFIG = 'model';

/** Why a turn stopped, for every stop reason that is not a normal answer. */
const STOP_REASON_FAILURES: Partial<Record<StopReason, string>> = {
  refusal: 'refused to continue this request.',
  max_tokens: 'stopped: it reached the maximum number of tokens for this turn.',
  max_turn_requests: 'stopped: it reached the maximum number of turn requests.',
};

/**
 * Approve a tool call once — the Cursor one-shot executor's `--yolo` and the
 * Claude executor's auto-allow, without writing a permanent allowlist entry
 * into the user's agent configuration.
 */
export function approveOnce(request: RequestPermissionRequest): RequestPermissionResponse {
  const option =
    APPROVAL_KIND_PREFERENCE.map((kind) => request.options.find((o) => o.kind === kind)).find(
      Boolean
    ) ?? request.options[0];
  return option
    ? { outcome: { outcome: 'selected', optionId: option.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}

/** True for the agent's "Authentication required" error. */
export function isAuthRequired(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === AUTH_REQUIRED_CODE;
}

/** A JSON-RPC error's message plus the agent's own detail, when it sent one. */
export function describeRequestError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const data = error instanceof RequestError ? error.data : undefined;
  const detail =
    data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
      ? (data as { message: string }).message
      : '';
  return detail && !error.message.includes(detail) ? `${error.message}: ${detail}` : error.message;
}

/** Why a turn that ended with `stopReason` failed, or null when it answered. */
export function stopReasonFailure(agentName: string, stopReason: StopReason): string | null {
  const failure = STOP_REASON_FAILURES[stopReason];
  return failure ? `${agentName} ${failure}` : null;
}

/** What to do about the model the user asked for. */
export type ModelChoice =
  /** Already selected (or nothing requested): nothing to do. */
  | { kind: 'keep' }
  /** Send `session/set_config_option` with these values. */
  | { kind: 'set'; configId: string; value: string }
  /** The agent cannot give us this model; tell the user what is used instead. */
  | { kind: 'unavailable'; notice: string };

/** Decide how to select `wanted` from the agent's advertised config options. */
export function chooseModel(
  configOptions: readonly SessionConfigOption[],
  wanted: string,
  agentName: string
): ModelChoice {
  const option = configOptions.find(
    (candidate) =>
      candidate.type === 'select' &&
      (candidate.category === MODEL_CONFIG || candidate.id === MODEL_CONFIG)
  );
  if (option?.type !== 'select') {
    return {
      kind: 'unavailable',
      notice: `${agentName} does not let chat choose a model — using its default.`,
    };
  }
  if (option.currentValue === wanted) return { kind: 'keep' };

  const offered = option.options.flatMap((entry) =>
    'value' in entry ? [entry.value] : entry.options.map((grouped) => grouped.value)
  );
  if (!offered.includes(wanted)) {
    return {
      kind: 'unavailable',
      notice: `${agentName} does not offer model "${wanted}" in chat — using "${option.currentValue}".`,
    };
  }
  return { kind: 'set', configId: option.id, value: wanted };
}

/**
 * The error a failed handshake reports to the caller.
 *
 * The profile's handshake hint (usually "update the CLI") applies only when
 * the agent never spoke ACP — it exited or stayed silent. An agent that
 * answered with an error is current enough; its own reason is the message.
 */
export function handshakeFailure(
  error: unknown,
  context: {
    profile: Pick<
      AcpAgentProfile,
      'agentName' | 'loginHint' | 'notFoundMessage' | 'handshakeFailureHint'
    >;
    processDeath: Error | null;
    timedOut: boolean;
  }
): Error {
  const { profile, processDeath, timedOut } = context;
  if (isAuthRequired(error)) return new Error(profile.loginHint);
  const silent = processDeath ?? (timedOut && error instanceof Error ? error : null);
  if (!silent) {
    return new Error(
      `${profile.agentName} could not start a chat session: ${describeRequestError(error)}`
    );
  }
  if (silent.message === profile.notFoundMessage || !profile.handshakeFailureHint) return silent;
  return new Error(`${silent.message} ${profile.handshakeFailureHint}`);
}
