/**
 * @module Shep.Domain.Entities.PmAuditLog
 *
 * Defines the PmAuditLog entity — an immutable record of security-relevant
 * actions in the PM system. Used for compliance and accountability.
 *
 * ## Invariants
 * - Audit log entries are append-only — no updates or deletes (NFR-8 pattern)
 * - actorId references the user who performed the action
 * - metadata stores action-specific JSON details (e.g., old/new role values)
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("Immutable audit log entry recording a security-relevant action")
model PmAuditLog extends BaseEntity {
  @doc("ID of the user who performed the action")
  actorId: UUID;

  @doc("Category of the audited action")
  action: AuditAction;

  @doc("ID of the target entity (project, user, etc.) — optional")
  targetId?: UUID;

  @doc("Type of the target entity (e.g., 'PmProject', 'PmUser', 'PmProjectMember')")
  targetType?: string;

  @doc("JSON metadata with action-specific details (old/new values, etc.)")
  metadata?: string;

  @doc("IP address or client identifier of the actor — optional")
  ipAddress?: string;
}
