/**
 * AgentQuestion Repository Interface (Output Port)
 *
 * Defines the contract for AgentQuestion persistence (spec 093).
 * The state machine is enforced at the use-case layer; this port
 * exposes the minimal CRUD + scoped queries the use cases need.
 *
 * Every list/find query MUST be scoped by appId (NFR-7).
 */

import type { AgentQuestion, AgentQuestionStatus } from '../../../../domain/generated/output.js';

/**
 * Filter options for listing agent questions.
 */
export interface AgentQuestionListFilters {
  /** When set, only rows whose status equals this value are returned */
  status?: AgentQuestionStatus;
  /** Maximum number of rows to return */
  limit?: number;
}

/**
 * Repository contract for AgentQuestion persistence.
 *
 * Implementations MUST:
 * - Scope every query by appId at the SQL layer.
 * - Persist the row's full state (status transitions are recorded by the
 *   use case via {@link updateStatus}).
 */
export interface IAgentQuestionRepository {
  /** Create a new question. Throws on duplicate id. */
  create(question: AgentQuestion): Promise<void>;

  /** Find one question by id within an app scope. Returns null if not found. */
  findById(appId: string, id: string): Promise<AgentQuestion | null>;

  /**
   * List questions for an app (and optionally a feature) ordered by
   * createdAt desc, suitable for inbox surfaces.
   */
  listByScope(
    appId: string,
    featureId: string | undefined,
    filters?: AgentQuestionListFilters
  ): Promise<AgentQuestion[]>;

  /**
   * List questions raised by a specific agent run. Useful when an agent
   * needs to inspect its own outstanding asks (e.g., before raising
   * another).
   */
  listByAgentRun(appId: string, agentRunId: string): Promise<AgentQuestion[]>;

  /**
   * Persist a status transition (and the answer fields when answered).
   * Implementations MUST update updatedAt on every call.
   */
  updateStatus(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields?: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>>
  ): Promise<void>;

  /**
   * Settle a question that is STILL pending — the status check and the write
   * are one statement, so of two concurrent answers (CLI + web) or an answer
   * racing a cancel, exactly one wins and the other changes nothing.
   *
   * @returns true when this call settled the row
   */
  settlePending(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields?: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>>
  ): Promise<boolean>;

  /**
   * Find pending questions whose expiresAt is at or before the cutoff.
   * Used by the auto-expiry sweep.
   */
  findExpired(cutoff: Date, limit?: number): Promise<AgentQuestion[]>;
}
