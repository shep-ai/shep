/**
 * IFileTreeReaderPort (Phase 11, task-74). Reads scan input files from the
 * local working tree so the orchestrator stays free of fs I/O.
 *
 * The adapter is responsible for: walking the directory recursively, applying
 * the exclude globs (defaults: node_modules, dist, .git, build artifacts),
 * skipping binary files / files over `maxFileBytes`, and POSIX-normalizing
 * paths before returning them.
 */

import type { ScanInputFile } from '../../../../domain/aspm/scan/scan-input';

export interface ReadScanFilesInput {
  /** Absolute path to the repo root. */
  repoRoot: string;
  /** Additional glob excludes from the application's ScannerProfile. */
  excludes?: readonly string[];
  /** Per-file byte cap; anything larger is skipped. */
  maxFileBytes?: number;
}

export interface IFileTreeReaderPort {
  read(input: ReadScanFilesInput): Promise<ScanInputFile[]>;
}
