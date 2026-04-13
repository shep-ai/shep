/**
 * @module Shep.Domain.Entities.PageVersion
 *
 * Defines the PageVersion entity — an immutable snapshot of a page's
 * content at a point in time. Used for version history and rollback.
 *
 * ## Invariants
 * - PageVersions are append-only: no updates or deletes
 * - Each version stores the full content snapshot (not a diff)
 * - versionNumber is sequentially incremented per page
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("An immutable content snapshot of a page at a specific version")
model PageVersion extends BaseEntity {
  @doc("Page this version belongs to")
  pageId: UUID;

  @doc("Sequential version number within the page")
  versionNumber: int32;

  @doc("Page title at this version")
  title: string;

  @doc("Full content snapshot as TipTap JSON")
  content?: string;
}
