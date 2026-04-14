/**
 * Operation Log Service (port)
 *
 * Thin façade injected into orchestrating use cases. Provides the convenience
 * methods for appending Debug/Info/Warn/Error entries scoped to a
 * (kind, id) pair. The implementation persists via IOperationLogRepository.
 *
 * Why a separate port instead of just injecting the repo?
 *   - Use cases shouldn't import "Repository" — they speak the language of
 *     the application layer (services).
 *   - Convenience methods (debug/info/warn/error) make call sites read like
 *     plain logging, not "construct DTO + call repo".
 *   - Tests can stub the service with a simple in-memory recorder.
 */

import type { OperationLogEntry, OperationLogKind } from '../../../../domain/generated/output.js';

export interface IOperationLogService {
  /**
   * Append a Debug-level entry (developer-facing diagnostic detail). Hidden
   * by default in the UI but surfaced in the "show all" view.
   */
  debug(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry>;

  /**
   * Append an Info-level entry — normal user-facing progress.
   */
  info(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry>;

  /**
   * Append a Warn-level entry — recoverable issue, the operation continued.
   */
  warn(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry>;

  /**
   * Append an Error-level entry — fatal failure, the operation stopped here.
   * Use this on the catch path of the orchestrating use case so the user can
   * see exactly what blew up without having to read server logs.
   */
  error(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry>;

  /**
   * Read back every entry for the given operation, oldest first.
   */
  list(kind: OperationLogKind, id: string): Promise<readonly OperationLogEntry[]>;
}
