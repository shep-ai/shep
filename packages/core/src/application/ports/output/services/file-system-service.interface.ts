/**
 * File System Service Interface
 *
 * Output port for filesystem mutations performed by use cases.
 * Keeps the application layer free of direct `node:fs` imports.
 */

export interface IFileSystemService {
  /**
   * Recursively remove a directory and all its contents.
   *
   * Idempotent: succeeds silently if the path does not exist.
   *
   * @param dirPath - Absolute path to the directory to remove
   * @throws Error if removal fails for reasons other than non-existence
   */
  removeDirectory(dirPath: string): Promise<void>;

  /**
   * Check whether a file or directory exists at the given absolute path.
   *
   * @param path - Absolute filesystem path to check
   * @returns true if the path exists, false otherwise
   */
  pathExists(path: string): boolean;
}
