/**
 * @module Shep.Domain.Entities.Comment
 *
 * Defines the Comment entity — a threaded comment on a work item.
 * Comments support rich text content (stored as TipTap JSON) and
 * threading via parentId.
 *
 * ## Invariants
 * - workItemId must reference an existing work item
 * - parentId enables one level of threading (replies to comments)
 * - content is stored as TipTap JSON for rich text, or plain text for CLI-created comments
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("A threaded comment on a work item")
model Comment extends SoftDeletableEntity {
  @doc("Work item this comment belongs to")
  workItemId: UUID;

  @doc("Parent comment ID for threading (null for top-level comments)")
  parentId?: UUID;

  @doc("Comment content — rich text JSON or plain text")
  content: string;

  @doc("ID of the comment author")
  authorId: string;
}
