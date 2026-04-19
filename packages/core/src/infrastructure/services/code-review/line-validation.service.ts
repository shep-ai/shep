/**
 * Line Validation Utility
 *
 * Validates review comment line numbers against parsed diff hunk ranges.
 * Comments referencing lines outside the diff are partitioned out and
 * reformatted for inclusion in the review summary body.
 *
 * Pure function — no side effects.
 */

import type { FileDiff } from '../../../application/ports/output/services/git-pr-service.interface.js';
import type { ReviewOutputComment } from './review-output-parser.service.js';

/**
 * Map of valid line numbers per file per side.
 * Key is file path, value has left (old) and right (new) line sets.
 */
export type ValidLineMap = Record<
  string,
  {
    left: Set<number>;
    right: Set<number>;
  }
>;

/**
 * Result of partitioning comments into valid (in-diff) and invalid (out-of-diff).
 */
export interface ValidatedComments {
  valid: ReviewOutputComment[];
  invalid: ReviewOutputComment[];
}

/**
 * Build a map of valid line numbers per file per side from FileDiff[].
 *
 * - RIGHT side: newNumber for added and context lines
 * - LEFT side: oldNumber for removed and context lines
 *
 * @param diffs - Array of per-file diffs
 * @returns Map of valid line numbers per file per side
 */
export function buildValidLineMap(diffs: FileDiff[]): ValidLineMap {
  const map: ValidLineMap = {};

  for (const diff of diffs) {
    const left = new Set<number>();
    const right = new Set<number>();

    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'added' && line.newNumber !== undefined) {
          right.add(line.newNumber);
        } else if (line.type === 'removed' && line.oldNumber !== undefined) {
          left.add(line.oldNumber);
        } else if (line.type === 'context') {
          if (line.newNumber !== undefined) right.add(line.newNumber);
          if (line.oldNumber !== undefined) left.add(line.oldNumber);
        }
      }
    }

    const entry = { left, right };
    map[diff.path] = entry;

    // Also index by oldPath for renamed files
    if (diff.oldPath) {
      map[diff.oldPath] = entry;
    }
  }

  return map;
}

/**
 * Validate review comments against diff hunk ranges.
 *
 * Comments with valid line numbers (matching a line in the diff for their side)
 * get inDiffRange=true. Comments with lines outside the diff or for files not
 * in the diff get inDiffRange=false.
 *
 * @param comments - Comments from the reviewer agent
 * @param validLineMap - Map built from buildValidLineMap()
 * @returns Partitioned valid and invalid comments
 */
export function validateComments(
  comments: ReviewOutputComment[],
  validLineMap: ValidLineMap
): ValidatedComments {
  const valid: ReviewOutputComment[] = [];
  const invalid: ReviewOutputComment[] = [];

  for (const comment of comments) {
    const fileEntry = validLineMap[comment.path];

    if (!fileEntry) {
      // File not in diff at all
      invalid.push(comment);
      continue;
    }

    // Determine which side to check
    const side = comment.side === 'LEFT' ? 'left' : 'right';
    const validLines = fileEntry[side];

    if (validLines.has(comment.line)) {
      valid.push(comment);
    } else {
      invalid.push(comment);
    }
  }

  return { valid, invalid };
}

/**
 * Format an invalid comment for inclusion in the review summary body.
 *
 * @param comment - Comment that references a line outside the diff
 * @returns Formatted string suitable for the summary body
 */
export function formatInvalidComment(comment: ReviewOutputComment): string {
  const location = `${comment.path}:${comment.line}`;
  return `- **${location}**: ${comment.body}`;
}

/**
 * Validate comments and partition them in one call.
 * Convenience function combining buildValidLineMap + validateComments.
 *
 * @param comments - Comments from the reviewer agent
 * @param diffs - Array of per-file diffs
 * @returns Partitioned valid and invalid comments
 */
export function validateAndPartitionComments(
  comments: ReviewOutputComment[],
  diffs: FileDiff[]
): ValidatedComments {
  const lineMap = buildValidLineMap(diffs);
  return validateComments(comments, lineMap);
}
