/**
 * @module Shep.Domain.Entities.Page
 *
 * Defines the Page entity — a wiki/documentation page within a project.
 *
 * Pages support hierarchical nesting via parentId for wiki-like structure.
 * Content is stored as TipTap JSON (ProseMirror document model) for
 * full-fidelity rich text preservation.
 *
 * ## Invariants
 * - Content is stored as TipTap JSON string, not raw HTML
 * - Pages can be nested via parentId for wiki-like hierarchy
 * - Version history is tracked via the PageVersion entity
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("A wiki/documentation page within a project")
model Page extends SoftDeletableEntity {
  @doc("Project this page belongs to")
  projectId: UUID;

  @doc("Page title")
  title: string;

  @doc("Rich text content stored as TipTap JSON (ProseMirror document model)")
  content?: string;

  @doc("Parent page ID for hierarchical nesting (null for top-level pages)")
  parentId?: UUID;

  @doc("Display order among sibling pages")
  sortOrder: float64 = 0;

  @doc("Whether this page is marked as a favorite")
  isFavorite: boolean = false;
}
