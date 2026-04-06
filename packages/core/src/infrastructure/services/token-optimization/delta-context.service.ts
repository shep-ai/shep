/**
 * Delta-Context Service
 *
 * Hash-based spec file change detection using SHA-256. Compares current
 * file contents against hashes from the previous phase. Unchanged files
 * are replaced with compact summaries to reduce repeated context tokens
 * across multi-phase workflows.
 *
 * Safety: changed files and first-phase files always pass through with
 * full content. Only verified-unchanged files are summarized.
 */

import { createHash } from 'node:crypto';
import type {
  IDeltaContextService,
  SpecFileEntry,
  DeltaContextResult,
} from '@/application/ports/output/services/delta-context.interface.js';

/**
 * Compute the SHA-256 hex digest of a string.
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export class DeltaContextService implements IDeltaContextService {
  /**
   * Diff spec files against previous phase hashes.
   *
   * For unchanged files: replaces content with a compact summary.
   * For changed files or first phase (no previous hashes): returns full content.
   */
  diff(
    files: SpecFileEntry[],
    previousHashes: Record<string, string>,
    previousPhaseName?: string
  ): DeltaContextResult {
    const optimizedFiles: Record<string, string> = {};
    const currentHashes: Record<string, string> = {};
    let filesSkipped = 0;

    const hasPreviousHashes = Object.keys(previousHashes).length > 0;

    for (const file of files) {
      const hash = computeHash(file.content);
      currentHashes[file.fileName] = hash;

      const previousHash = previousHashes[file.fileName];
      const isUnchanged = hasPreviousHashes && previousHash === hash;

      if (isUnchanged) {
        const lineCount = file.content.split('\n').length;
        const shortHash = hash.slice(0, 8);
        const phase = previousPhaseName ?? 'previous';
        optimizedFiles[file.fileName] =
          `[${file.fileName} unchanged since ${phase} - ${lineCount} lines, hash ${shortHash}]`;
        filesSkipped++;
      } else {
        optimizedFiles[file.fileName] = file.content;
      }
    }

    return { optimizedFiles, currentHashes, filesSkipped };
  }
}
