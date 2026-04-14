/**
 * @module Shep.Domain.Entities.OperationLogEntry
 *
 * Defines the OperationLogEntry entity — a single timestamped line of
 * progress / diagnostic output for a long-running operation (cloud deploy,
 * git remote creation, etc.). Persisted in SQLite so the UI can render the
 * full history of an operation after the fact, not just live tail.
 *
 * ## Scope
 *
 * Entries are scoped by `(operationKind, operationId)` — typically:
 *   • CloudDeploy / <applicationId>
 *   • GitRemoteCreate / <applicationId>
 *
 * The `(operationKind, operationId)` pair is queried as a composite key
 * for log rendering. We keep the application id as the operationId for v1
 * because both deploy + remote-create are 1-per-application.
 *
 * ## Lifecycle ownership
 *
 * Use cases own the lifecycle: an orchestrating use case (e.g.
 * InitiateCloudDeploymentUseCase) appends entries at meaningful steps via
 * the IOperationLogService port. Infrastructure providers do NOT touch the
 * log store directly — they emit progress callbacks that the use case
 * translates into entries. This keeps clean architecture intact: the
 * application layer is the only thing that decides what gets persisted.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/operation-log.tsp";

@doc("A single timestamped line of progress for a long-running operation")
model OperationLogEntry extends BaseEntity {
  @doc("Kind of operation this entry belongs to")
  operationKind: OperationLogKind;

  @doc("Stable id that scopes the operation — typically the application id")
  operationId: string;

  @doc("Severity / level of this entry")
  level: OperationLogLevel;

  @doc("Human-readable single-line message")
  message: string;

  @doc("Optional structured detail (JSON-serialised) — multi-line stderr, error codes, etc.")
  detail?: string;
}
