/**
 * @module Shep.Domain.Entities.PmNotification
 *
 * Defines the PmNotification entity — in-app notification for PM events.
 * Named PmNotification to avoid collision with existing NotificationEvent
 * value object used by the agent system.
 *
 * ## Invariants
 * - A notification has exactly one recipient
 * - referenceId + referenceType link to the source entity (work item, comment, etc.)
 * - isRead tracks whether the user has seen the notification
 * - isArchived allows hiding without deletion
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("In-app notification for project management events")
model PmNotification extends SoftDeletableEntity {
  @doc("Project this notification belongs to")
  projectId: UUID;

  @doc("User ID of the notification recipient")
  recipientId: string;

  @doc("Type of notification event")
  type: PmNotificationType;

  @doc("Short title for the notification")
  title: string;

  @doc("Detailed notification body text")
  body?: string;

  @doc("Whether the notification has been read")
  isRead: boolean;

  @doc("Whether the notification has been archived")
  isArchived: boolean;

  @doc("ID of the referenced entity (work item, comment, etc.)")
  referenceId?: UUID;

  @doc("Type of the referenced entity (e.g., 'WorkItem', 'Comment', 'IntakeItem')")
  referenceType?: string;
}
