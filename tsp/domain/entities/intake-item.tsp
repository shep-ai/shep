/**
 * @module Shep.Domain.Entities.IntakeItem
 *
 * Defines the IntakeItem entity — an incoming request awaiting triage.
 * IntakeItems are separate from WorkItems until explicitly accepted.
 * On acceptance, an IntakeItem is converted into a WorkItem.
 *
 * ## Invariants
 * - An IntakeItem belongs to exactly one project
 * - Status transitions: Pending → Accepted | Declined | Duplicate
 * - Once accepted, the resultingWorkItemId is set
 * - Once declined, the declineReason should be set
 * - Once marked duplicate, the duplicateOfWorkItemId should be set
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("Incoming request awaiting triage — separate from committed WorkItems")
model IntakeItem extends SoftDeletableEntity {
  @doc("Project this intake item belongs to")
  projectId: UUID;

  @doc("Title of the incoming request")
  title: string;

  @doc("Description of the incoming request (plain text or rich text JSON)")
  description?: string;

  @doc("Source of the intake (e.g., 'manual', 'email', 'api')")
  source: string;

  @doc("Triage status of the intake item")
  status: IntakeStatus;

  @doc("Notes from the triage process (AI or human)")
  triageNotes?: string;

  @doc("Suggested state ID from AI triage")
  suggestedStateId?: UUID;

  @doc("Suggested priority from AI triage")
  suggestedPriority?: string;

  @doc("Suggested label IDs from AI triage (JSON array)")
  suggestedLabels?: string;

  @doc("Suggested assignee ID from AI triage")
  suggestedAssigneeId?: string;

  @doc("ID of the work item created on acceptance")
  resultingWorkItemId?: UUID;

  @doc("Reason for declining the intake item")
  declineReason?: string;

  @doc("ID of the existing work item this is a duplicate of")
  duplicateOfWorkItemId?: UUID;
}
