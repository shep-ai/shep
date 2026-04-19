/**
 * Diff Annotation Service
 *
 * Transforms FileDiff[] (from IGitPrService) into line-annotated diff strings
 * where each line is prefixed with its absolute file line number.
 *
 * Format:
 *   +42:code     — added line at line 42
 *   -15:code     — removed line at line 15
 *    30:code     — context line at line 30
 *
 * This format eliminates agent line-counting errors when referencing
 * specific positions in the diff (inspired by Nominal Code).
 */

import type {
  FileDiff,
  DiffLine,
} from '../../../application/ports/output/services/git-pr-service.interface.js';

/**
 * Build the file header for an annotated diff.
 */
function formatFileHeader(diff: FileDiff): string {
  if (diff.status === 'renamed' && diff.oldPath) {
    return `--- ${diff.oldPath}\n+++ ${diff.path}`;
  }
  if (diff.status === 'deleted') {
    return `--- ${diff.path}\n+++ /dev/null`;
  }
  if (diff.status === 'added') {
    return `--- /dev/null\n+++ ${diff.path}`;
  }
  return `--- ${diff.path}\n+++ ${diff.path}`;
}

/**
 * Annotate a single DiffLine with its absolute line number.
 */
function annotateLine(line: DiffLine): string {
  switch (line.type) {
    case 'added':
      return `+${line.newNumber}:${line.content}`;
    case 'removed':
      return `-${line.oldNumber}:${line.content}`;
    case 'context':
    default:
      return ` ${line.newNumber}:${line.content}`;
  }
}

/**
 * Check if a FileDiff represents a binary file.
 * Binary files have no hunks and typically show as modified/added with 0 additions/deletions,
 * or have a hunk with a single "Binary files differ" context line.
 */
function isBinaryDiff(diff: FileDiff): boolean {
  if (diff.hunks.length === 0 && diff.additions === 0 && diff.deletions === 0) {
    return true;
  }
  if (
    diff.hunks.length === 1 &&
    diff.hunks[0].lines.length === 1 &&
    diff.hunks[0].lines[0].content.includes('Binary file')
  ) {
    return true;
  }
  return false;
}

/**
 * Transform an array of FileDiff objects into a single line-annotated diff string.
 *
 * Pure function with no side effects. Handles:
 * - Multi-hunk files
 * - Binary files (skip with descriptive note)
 * - Renamed files (show both old and new paths)
 * - No-newline-at-EOF markers (filtered out)
 *
 * @param diffs - Array of per-file diffs from IGitPrService
 * @returns Line-annotated diff string
 */
export function annotateFileDiffs(diffs: FileDiff[]): string {
  if (diffs.length === 0) {
    return '';
  }

  const sections: string[] = [];

  for (const diff of diffs) {
    const header = formatFileHeader(diff);

    if (isBinaryDiff(diff)) {
      sections.push(`${header}\n[Binary file — skipped]`);
      continue;
    }

    const hunkLines: string[] = [];

    for (const hunk of diff.hunks) {
      // Include hunk header for context
      hunkLines.push(hunk.header);

      for (const line of hunk.lines) {
        // Skip "No newline at end of file" markers
        if (line.content === '\\ No newline at end of file') {
          continue;
        }
        hunkLines.push(annotateLine(line));
      }
    }

    if (hunkLines.length > 0) {
      sections.push(`${header}\n${hunkLines.join('\n')}`);
    } else {
      sections.push(header);
    }
  }

  return sections.join('\n\n');
}
