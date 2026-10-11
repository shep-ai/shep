/**
 * IAgentQuestionService — Output port for the unified agent-question
 * pipeline (spec 093, FR-6 / FR-7 / FR-8).
 *
 * One service owns:
 *  - persisting an {@link AgentQuestion} row,
 *  - resolving its lifecycle (answered / cancelled / expired),
 *  - bridging the asynchronous DB-backed answer back to an in-process
 *    awaiter when the question was raised by the SDK V2 `canUseTool`
 *    callback (interactive mode).
 *
 * The bridge is split into a sibling primitive — see
 * {@link IDeferredQuestionRegistry} — so this port can be implemented
 * with or without an in-process awaiter (e.g. a CLI-only adapter that
 * never blocks the SDK still satisfies this interface).
 *
 * Cross-app isolation (NFR-7): every read MUST be scoped by `appId`.
 */

import type {
  AgentQuestion,
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  Decision,
  DecisionResponse,
} from '../../../../domain/generated/output.js';

/**
 * Inputs accepted by {@link IAgentQuestionService.ask}. The id and
 * timestamps are managed by the implementation so callers do not need
 * to know about the persistence shape.
 */
export interface AskAgentQuestionInput {
  /** Required app scope (NFR-7). */
  appId: string;
  /** Optional feature scope. */
  featureId?: string;
  /** Agent run that raised this question. */
  agentRunId: string;
  /** Three-tier urgency. */
  kind: AgentQuestionKind;
  /** Free-form question text shown to the answerer. */
  prompt: string;
  /** Optional multiple-choice options (pre-134 shape; prefer `decision`). */
  options?: string[];
  /**
   * Structured questions and options every surface renders (spec 134). Its id
   * is replaced by the question id; its `defaultAfter` becomes `expiresAt` and
   * its recommended options the `defaultAnswer` when those are not given.
   */
  decision?: Decision;
  /** Default answer used on auto-expiry (non-blocking only). */
  defaultAnswer?: string;
  /** Who is permitted to answer this question. */
  answerer: AgentQuestionAnswerer;
  /** Auto-resolution deadline (used together with `defaultAnswer`). */
  expiresAt?: Date;
}

/** Inputs accepted by {@link IAgentQuestionService.answer}. */
export interface AnswerAgentQuestionInput {
  appId: string;
  questionId: string;
  /**
   * The answer as text (must match one of `options` when those are provided).
   * For a question with a decision it is resolved to responses by option id,
   * then label, then custom text. One of `answer` / `responses` is required.
   */
  answer?: string;
  /** Structured answer to the question's decision (spec 134). */
  responses?: DecisionResponse[];
  /** Actor namespace, e.g. `user:abc` or `supervisor:42`. */
  answeredBy: string;
}

/** Inputs accepted by {@link IAgentQuestionService.cancel}. */
export interface CancelAgentQuestionInput {
  appId: string;
  questionId: string;
  /** Actor namespace. */
  cancelledBy: string;
  /** Optional human-readable reason recorded as the answer field. */
  reason?: string;
}

/** Filter for {@link IAgentQuestionService.list}. */
export interface ListAgentQuestionsFilter {
  /** Required app scope (NFR-7). */
  appId: string;
  featureId?: string;
  agentRunId?: string;
  status?: AgentQuestionStatus;
  limit?: number;
}

/**
 * Service contract for the unified agent-question pipeline.
 *
 * Implementations MUST:
 *  - Persist questions via {@link IAgentQuestionRepository}.
 *  - Validate answer values against `options` when provided.
 *  - Update status atomically on answer / cancel / expire.
 *  - Cooperate with {@link IDeferredQuestionRegistry} so a blocking
 *    question raised by the SDK callback can await the answer in-process.
 */
export interface IAgentQuestionService {
  /**
   * Persist a new {@link AgentQuestion}. The returned row carries the
   * generated id, timestamps, and the initial `pending` status.
   */
  ask(input: AskAgentQuestionInput): Promise<AgentQuestion>;

  /**
   * Record an answer and transition the question to `answered`. Resolves
   * the matching {@link IDeferredQuestionRegistry} entry when one exists.
   */
  answer(input: AnswerAgentQuestionInput): Promise<AgentQuestion>;

  /**
   * Mark the question `cancelled`. Rejects any matching deferred awaiter
   * with a typed cancellation error.
   */
  cancel(input: CancelAgentQuestionInput): Promise<AgentQuestion>;

  /**
   * Read questions in a given scope, ordered by createdAt desc.
   */
  list(filter: ListAgentQuestionsFilter): Promise<AgentQuestion[]>;
}

/**
 * Scope key for {@link IDeferredQuestionRegistry.cancelAll}. Either
 * field may be omitted to broaden the cancellation. `appId` is required
 * to preserve NFR-7 even on bulk cancellation.
 */
export interface DeferredQuestionScope {
  appId: string;
  featureId?: string;
  agentRunId?: string;
}

/**
 * Default timeout for a deferred-question awaiter when no per-question
 * timeout is supplied. 30 minutes matches the research-decision figure
 * for blocking-priority questions.
 */
export const DEFAULT_DEFERRED_QUESTION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Errors emitted by the deferred-question registry. Surfaced as typed
 * errors so callers can branch on the cause without string matching.
 */
export class AgentQuestionTimeoutError extends Error {
  readonly code = 'AGENT_QUESTION_TIMEOUT';
  constructor(
    public readonly questionId: string,
    public readonly timeoutMs: number
  ) {
    super(`Agent question ${questionId} timed out after ${timeoutMs}ms with no answer recorded`);
    this.name = 'AgentQuestionTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentQuestionCancelledError extends Error {
  readonly code = 'AGENT_QUESTION_CANCELLED';
  constructor(
    public readonly questionId: string,
    public readonly reason?: string
  ) {
    super(`Agent question ${questionId} was cancelled${reason ? `: ${reason}` : ''}`);
    this.name = 'AgentQuestionCancelledError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * In-process bridge between the SDK V2 `canUseTool` callback (which
 * expects a Promise) and the asynchronous, DB-backed answer that may
 * arrive from a different process (CLI, web).
 *
 * `register` produces the Promise the callback awaits; `resolve`/`reject`
 * settles it. The registry MUST clean up its internal timer on every
 * resolve, reject, or timeout firing — leaking timers would keep the
 * process from exiting cleanly.
 *
 * Scope (`appId` / `featureId` / `agentRunId`) is recorded on register so
 * `cancelAll` can fail every awaiter belonging to a specific worker
 * without touching unrelated ones.
 */
export interface IDeferredQuestionRegistry {
  /**
   * Register a deferred awaiter for the given question id. Returns a
   * Promise that resolves with the answer when {@link resolve} is called,
   * rejects with an {@link AgentQuestionCancelledError} when
   * {@link reject} is called, or rejects with an
   * {@link AgentQuestionTimeoutError} after `timeoutMs`.
   *
   * @param id Question id (matches the persisted row's id).
   * @param scope Scope used by {@link cancelAll}.
   * @param timeoutMs Optional override for the auto-reject timer
   *   (defaults to {@link DEFAULT_DEFERRED_QUESTION_TIMEOUT_MS}).
   */
  register(id: string, scope: DeferredQuestionScope, timeoutMs?: number): Promise<string>;

  /** Resolve the awaiter for `id` with the supplied answer. */
  resolve(id: string, answer: string): void;

  /** Reject the awaiter for `id` with the supplied reason. */
  reject(id: string, reason?: string): void;

  /**
   * Reject every awaiter whose registered scope matches `scope`. Useful
   * when a worker is shutting down and any outstanding awaiters owned by
   * that worker would otherwise leak.
   */
  cancelAll(scope: DeferredQuestionScope, reason?: string): number;

  /** Returns true when an awaiter for `id` is currently registered. */
  has(id: string): boolean;
}
