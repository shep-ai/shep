/**
 * Attachment Storage Port Interface
 *
 * Abstracts file storage so implementations can be swapped
 * between local filesystem and S3-compatible backends.
 */
export interface IAttachmentStorage {
  /**
   * Store a file and return its storage path identifier.
   */
  store(input: { filename: string; data: Buffer; mimeType: string }): Promise<string>;

  /**
   * Retrieve a file by its storage path.
   * Returns null if not found.
   */
  retrieve(storagePath: string): Promise<Buffer | null>;

  /**
   * Delete a file by its storage path.
   */
  delete(storagePath: string): Promise<void>;

  /**
   * Check if a file exists at the given storage path.
   */
  exists(storagePath: string): Promise<boolean>;
}
