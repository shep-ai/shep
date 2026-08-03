/**
 * Repository Discovery Service Interface
 *
 * Output port for enumerating candidate repositories under a parent directory.
 *
 * Deliberately separate from `IFileSystemService`, which is a small
 * mutation-oriented port (`removeDirectory`, `pathExists`) injected into many
 * use cases. Adding read/enumerate semantics there would widen a port all of
 * those consumers depend on; keeping discovery its own boundary gives the
 * bulk-import use cases a single mockable seam.
 *
 * Enumeration is intentionally NOT recursive: the product decision is to list
 * a directory's immediate children and let the user choose, rather than walking
 * a tree and guessing which nesting level the user meant.
 */

/**
 * A single directory entry offered as an import candidate.
 */
export interface DiscoveredDirectory {
  /** Directory name as it appears on disk (e.g. "my-project") */
  name: string;
  /** Absolute path to the directory */
  path: string;
  /** Whether the directory contains a `.git` entry, making it a git repository */
  isGitRepository: boolean;
}

/**
 * Raised when the requested directory cannot be enumerated.
 *
 * A typed error keeps callers from having to interpret raw `node:fs` errno
 * values, which would leak infrastructure detail into the application layer.
 */
export class DirectoryNotReadableError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string
  ) {
    super(`Cannot read directory "${path}": ${reason}`);
    this.name = 'DirectoryNotReadableError';
  }
}

/**
 * Port for discovering importable directories on the local filesystem.
 */
export interface IRepositoryDiscoveryService {
  /**
   * List the immediate subdirectories of the given absolute path.
   *
   * Does not recurse. Non-directory entries are omitted. Symlinked
   * directories are included, since a symlinked checkout is still a valid
   * repository to track.
   *
   * @param directoryPath - Absolute path to enumerate
   * @returns Directory entries sorted by name, each annotated with git detection
   * @throws {DirectoryNotReadableError} When the path is missing, not a
   *   directory, or not readable
   */
  listSubdirectories(directoryPath: string): Promise<DiscoveredDirectory[]>;
}
