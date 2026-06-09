/**
 * Pure-domain input shape for every in-house scanner stage (Phase 11).
 *
 * Scanners receive an already-materialized list of file blobs rather than a
 * directory handle so the domain layer stays free of fs/path I/O — the
 * orchestrator (infrastructure) handles glob walks + reading + the size
 * cap before invoking pure functions.
 */

export interface ScanInputFile {
  /** Repo-relative path, POSIX-normalized (forward slashes). */
  path: string;
  /** Decoded UTF-8 content of the file. */
  content: string;
}
