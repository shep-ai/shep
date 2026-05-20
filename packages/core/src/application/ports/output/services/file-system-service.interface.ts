/**
 * File System Service Interface
 *
 * Output port for filesystem mutations performed by use cases.
 * Keeps the application layer free of direct `node:fs` imports.
 */

export interface IFileSystemService {
  /**
   * Read a UTF-8 text file.
   *
   * @param filePath - Absolute path to the file to read
   */
  readTextFile(filePath: string): Promise<string>;

  /**
   * Write a UTF-8 text file, replacing its previous contents.
   *
   * @param filePath - Absolute path to the file to write
   * @param contents - UTF-8 text contents
   */
  writeTextFile(filePath: string, contents: string): Promise<void>;

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
