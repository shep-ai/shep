/**
 * Unified diff parser.
 *
 * One implementation for every place Shep turns `git diff` output into the
 * `FileDiff` shape the merge review and checkpoint views render: branch diffs
 * (GitPrService), GitHub API patches (GitHubReviewService) and checkpoint
 * diffs (GitCheckpointService).
 */

import type {
  DiffHunk,
  DiffLine,
  FileDiff,
} from '../../../application/ports/output/services/git-pr-service.interface.js';

const HUNK_HEADER = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/;
const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const FILE_BOUNDARY = /^(?=diff --git )/m;

export interface ParsedHunks {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

/**
 * Parse the hunk lines of one file's diff (or a bare GitHub `patch`). Lines
 * before the first `@@` header (file headers) and `\ No newline` markers are
 * ignored.
 */
export function parseDiffHunks(patch: string): ParsedHunks {
  const result: ParsedHunks = { hunks: [], additions: 0, deletions: 0 };
  if (!patch?.trim()) return result;

  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = { header: line, lines: [] };
      result.hunks.push(current);
      oldLine = parseInt(header[1], 10);
      newLine = parseInt(header[2], 10);
      continue;
    }
    if (!current) continue;

    let diffLine: DiffLine | null = null;
    if (line.startsWith('+')) {
      diffLine = { type: 'added', content: line.slice(1), newNumber: newLine++ };
      result.additions++;
    } else if (line.startsWith('-')) {
      diffLine = { type: 'removed', content: line.slice(1), oldNumber: oldLine++ };
      result.deletions++;
    } else if (line.startsWith(' ')) {
      diffLine = {
        type: 'context',
        content: line.slice(1),
        oldNumber: oldLine++,
        newNumber: newLine++,
      };
    }
    if (diffLine) current.lines.push(diffLine);
  }
  return result;
}

function parseFileSection(section: string): FileDiff | null {
  const lines = section.split('\n');
  const header = FILE_HEADER.exec(lines[0] ?? '');
  if (!header) return null;

  const [, oldPath, newPath] = header;
  const isRenamed = lines.some((l) => l.startsWith('rename from'));
  let status: FileDiff['status'] = 'modified';
  if (lines.some((l) => l.startsWith('new file mode'))) status = 'added';
  else if (lines.some((l) => l.startsWith('deleted file mode'))) status = 'deleted';
  else if (isRenamed) status = 'renamed';

  const { hunks, additions, deletions } = parseDiffHunks(section);
  return {
    path: newPath,
    oldPath: isRenamed || oldPath !== newPath ? oldPath : undefined,
    additions,
    deletions,
    status,
    hunks,
  };
}

/** Parse the output of `git diff` (one or more `diff --git` sections). */
export function parseUnifiedDiff(rawDiff: string): FileDiff[] {
  if (!rawDiff.trim()) return [];
  return rawDiff
    .split(FILE_BOUNDARY)
    .filter((section) => section.trim())
    .map(parseFileSection)
    .filter((file): file is FileDiff => file !== null);
}
