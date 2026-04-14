/**
 * Operation Log Repository (port)
 *
 * Persists OperationLogEntry rows for long-running operations. Implementations
 * are expected to be append-only — log entries are never mutated after
 * insertion. Reads are scoped by (operationKind, operationId) and ordered by
 * createdAt ascending.
 *
 * The use case is the only thing that decides what gets written here.
 * Infrastructure providers must never call this repository directly — they
 * emit progress callbacks that the orchestrating use case translates into
 * append() calls.
 *
 * Spec 089 — one-click-cloud-deploy / operation logs.
 */

import type {
  OperationLogEntry,
  OperationLogKind,
  OperationLogLevel,
} from '../../../../domain/generated/output.js';

/**
 * Input for appending a single log entry. The repository assigns id +
 * createdAt + updatedAt — callers don't get to spoof timestamps.
 */
export interface AppendOperationLogEntryInput {
  operationKind: OperationLogKind;
  operationId: string;
  level: OperationLogLevel;
  message: string;
  /** Optional structured detail (multi-line stderr, error envelope, etc.). */
  detail?: string;
}

export interface IOperationLogRepository {
  /**
   * Append a single entry. Returns the persisted entry with its new id +
   * createdAt fields populated. Always succeeds unless the database itself is
   * unavailable — log writes must NEVER throw inside a use case in a way that
   * masks the original operation error.
   */
  append(input: AppendOperationLogEntryInput): Promise<OperationLogEntry>;

  /**
   * List every entry for the given operation, oldest first. Returns an empty
   * array if no entries exist yet (the operation may still be in progress
   * before its first entry, or it may never have run at all).
   */
  listByScope(
    operationKind: OperationLogKind,
    operationId: string
  ): Promise<readonly OperationLogEntry[]>;

  /**
   * Optional housekeeping — delete every entry older than the given timestamp.
   * Returns the number of rows deleted. Implementations may treat this as a
   * no-op if they prefer indefinite retention.
   */
  pruneBefore(timestamp: number): Promise<number>;
}
