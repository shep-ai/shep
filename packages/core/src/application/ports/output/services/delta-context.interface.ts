/**
 * Delta-Context Service Interface
 *
 * Output port for hash-based spec file change detection. Compares
 * SHA-256 hashes of spec files against previous phase hashes and
 * replaces unchanged files with compact summaries to reduce repeated
 * context tokens across multi-phase workflows.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides hash-based implementation
 */

/**
 * Description of a spec file to be checked for changes.
 */
export interface SpecFileEntry {
  /** File name (e.g., 'spec.yaml', 'research.yaml') */
  fileName: string;
  /** Full file content as read from disk */
  content: string;
}

/**
 * Result of applying delta-context diffing to spec files.
 */
export interface DeltaContextResult {
  /** Map of file names to their optimized content (full or summary) */
  optimizedFiles: Record<string, string>;
  /** Updated SHA-256 hashes for all files (store in LangGraph state) */
  currentHashes: Record<string, string>;
  /** Number of files that were replaced with compact summaries */
  filesSkipped: number;
}

/**
 * Service interface for delta-context spec file diffing.
 *
 * Computes SHA-256 hashes of spec file contents and compares them
 * against hashes from the previous phase. Unchanged files are replaced
 * with compact summaries (file name, line count, last-modified phase).
 * Changed files and first-phase files are returned with full content.
 */
export interface IDeltaContextService {
  /**
   * Diff spec files against previous phase hashes.
   *
   * For unchanged files: replaces content with a compact summary
   * "[file unchanged since {previousPhase} - {lineCount} lines, hash {shortHash}]"
   *
   * For changed files or first phase (no previous hashes): returns full content.
   *
   * @param files - Spec files with their current content
   * @param previousHashes - SHA-256 hashes from the previous phase (empty for first phase)
   * @param previousPhaseName - Name of the previous phase (for summary text)
   * @returns Optimized file contents, updated hashes, and count of skipped files
   */
  diff(
    files: SpecFileEntry[],
    previousHashes: Record<string, string>,
    previousPhaseName?: string
  ): DeltaContextResult;
}
