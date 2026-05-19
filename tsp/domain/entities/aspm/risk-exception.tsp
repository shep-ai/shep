/**
 * @module Shep.Domain.Entities.Aspm.RiskException
 *
 * A RiskException temporarily masks a [[SecurityFinding]] from posture
 * rollups and SLA math. Exceptions are self-declared with a typed
 * reason, justification text, and a required expiry date. Once
 * expired the finding automatically re-enters the active backlog —
 * the read-side effective-state computation re-includes it.
 *
 * Audit log of state transitions lives in a separate immutable log
 * (operation_logs / pm_audit_log infrastructure), not as embedded
 * fields on this entity.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/exception-reason.tsp";

@doc("Lifecycle status of a risk exception")
enum RiskExceptionStatus {
  @doc("Exception is currently active and excludes the finding from posture")
  Active: "Active",

  @doc("Exception has passed its expiry — the finding is re-included")
  Expired: "Expired",

  @doc("Exception was explicitly revoked before expiry")
  Revoked: "Revoked",
}

@doc("Self-declared risk exception masking a finding from posture and SLA math")
model RiskException extends SoftDeletableEntity {
  @doc("Finding this exception applies to")
  findingId: UUID;

  @doc("Typed reason from the exception taxonomy")
  reason: ExceptionReason;

  @doc("Human-readable justification (free-form)")
  justification: string;

  @doc("Who declared the exception (owner id)")
  declaredBy: UUID;

  @doc("When the exception was declared")
  declaredAt: utcDateTime;

  @doc("Expiry date — once passed the finding re-enters posture rollups")
  expiresAt: utcDateTime;

  @doc("Current lifecycle status")
  status: RiskExceptionStatus;
}
