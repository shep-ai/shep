/**
 * @module Shep.Domain.Entities.PmAttachment
 *
 * Defines the PmAttachment entity — file attachment metadata for work items.
 * The actual file is stored on the local filesystem; this entity stores
 * only the metadata and storage path.
 *
 * ## Invariants
 * - Files are stored by UUID filename, not user-supplied name (path traversal prevention)
 * - storagePath is the absolute path to the file on disk
 * - Maximum file size is 25MB (enforced at application layer)
 * - MIME type is validated via magic bytes, not just extension
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("File attachment metadata for a work item — file stored on local filesystem")
model PmAttachment extends SoftDeletableEntity {
  @doc("Work item this attachment belongs to")
  workItemId: UUID;

  @doc("Original filename as provided by the user")
  filename: string;

  @doc("MIME type of the file (validated via magic bytes)")
  mimeType: string;

  @doc("File size in bytes (max 25MB = 26214400)")
  fileSize: int32;

  @doc("Absolute path to the file on disk")
  storagePath: string;
}
