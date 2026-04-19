import { describe, it, expect } from 'vitest';
import {
  buildValidLineMap,
  validateComments,
  validateAndPartitionComments,
  formatInvalidComment,
} from '@/infrastructure/services/code-review/line-validation.service.js';
import type {
  FileDiff,
  DiffHunk,
  DiffLine,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { ReviewOutputComment } from '@/infrastructure/services/code-review/review-output-parser.service.js';

function line(
  type: DiffLine['type'],
  content: string,
  oldNumber?: number,
  newNumber?: number
): DiffLine {
  return { type, content, oldNumber, newNumber };
}

function hunk(header: string, lines: DiffLine[]): DiffHunk {
  return { header, lines };
}

function fileDiff(
  path: string,
  status: FileDiff['status'],
  hunks: DiffHunk[],
  overrides?: Partial<FileDiff>
): FileDiff {
  const additions = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'added').length;
  const deletions = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'removed').length;
  return { path, status, hunks, additions, deletions, ...overrides };
}

function comment(
  path: string,
  lineNum: number,
  body: string,
  side?: 'LEFT' | 'RIGHT'
): ReviewOutputComment {
  return { path, line: lineNum, body, ...(side ? { side: side as any } : {}) };
}

describe('LineValidationService', () => {
  const sampleDiffs: FileDiff[] = [
    fileDiff('src/utils.ts', 'modified', [
      hunk('@@ -10,5 +10,6 @@', [
        line('context', 'function helper() {', 10, 10),
        line('removed', '  return null;', 11, undefined),
        line('added', '  return undefined;', undefined, 11),
        line('added', '  // comment', undefined, 12),
        line('context', '}', 12, 13),
      ]),
    ]),
    fileDiff('src/app.ts', 'added', [
      hunk('@@ -0,0 +1,3 @@', [
        line('added', 'const x = 1;', undefined, 1),
        line('added', 'const y = 2;', undefined, 2),
        line('added', 'export { x, y };', undefined, 3),
      ]),
    ]),
  ];

  describe('buildValidLineMap', () => {
    it('builds valid line sets from diff hunks', () => {
      const map = buildValidLineMap(sampleDiffs);

      // src/utils.ts
      expect(map['src/utils.ts']).toBeDefined();
      // RIGHT side: context(10), added(11), added(12), context(13)
      expect(map['src/utils.ts'].right.has(10)).toBe(true);
      expect(map['src/utils.ts'].right.has(11)).toBe(true);
      expect(map['src/utils.ts'].right.has(12)).toBe(true);
      expect(map['src/utils.ts'].right.has(13)).toBe(true);
      // LEFT side: context(10), removed(11), context(12)
      expect(map['src/utils.ts'].left.has(10)).toBe(true);
      expect(map['src/utils.ts'].left.has(11)).toBe(true);
      expect(map['src/utils.ts'].left.has(12)).toBe(true);

      // src/app.ts — only RIGHT side
      expect(map['src/app.ts'].right.has(1)).toBe(true);
      expect(map['src/app.ts'].right.has(2)).toBe(true);
      expect(map['src/app.ts'].right.has(3)).toBe(true);
    });

    it('indexes renamed files by both old and new path', () => {
      const diffs: FileDiff[] = [
        fileDiff(
          'src/new-name.ts',
          'renamed',
          [
            hunk('@@ -1,1 +1,1 @@', [
              line('removed', 'old', 1, undefined),
              line('added', 'new', undefined, 1),
            ]),
          ],
          { oldPath: 'src/old-name.ts' }
        ),
      ];

      const map = buildValidLineMap(diffs);

      expect(map['src/new-name.ts']).toBeDefined();
      expect(map['src/old-name.ts']).toBeDefined();
      expect(map['src/new-name.ts']).toBe(map['src/old-name.ts']);
    });
  });

  describe('validateComments', () => {
    it('marks comment on valid added line (RIGHT side) as valid', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [comment('src/utils.ts', 11, 'Bug here.', 'RIGHT')];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(0);
    });

    it('marks comment on valid removed line (LEFT side) as valid', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [comment('src/utils.ts', 11, 'Old code issue.', 'LEFT')];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(0);
    });

    it('marks comment on context line (RIGHT side) as valid', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [comment('src/utils.ts', 10, 'Consider renaming.', 'RIGHT')];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(1);
    });

    it('defaults to RIGHT side when side is not specified', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [comment('src/app.ts', 1, 'Issue.')];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(1);
    });

    it('marks comment on line outside any hunk as invalid', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [comment('src/utils.ts', 50, 'Not in diff.', 'RIGHT')];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(1);
    });

    it('marks comment on file not in diff as invalid', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [comment('src/unknown.ts', 1, 'Unknown file.')];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(1);
    });

    it('handles multi-file diff with mixed valid/invalid comments', () => {
      const map = buildValidLineMap(sampleDiffs);
      const comments = [
        comment('src/utils.ts', 11, 'Valid RIGHT.', 'RIGHT'),
        comment('src/utils.ts', 99, 'Invalid line.', 'RIGHT'),
        comment('src/app.ts', 2, 'Valid added.', 'RIGHT'),
        comment('src/missing.ts', 1, 'No such file.'),
      ];

      const result = validateComments(comments, map);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(2);
      expect(result.valid[0].body).toBe('Valid RIGHT.');
      expect(result.valid[1].body).toBe('Valid added.');
      expect(result.invalid[0].body).toBe('Invalid line.');
      expect(result.invalid[1].body).toBe('No such file.');
    });
  });

  describe('formatInvalidComment', () => {
    it('formats invalid comment for summary body', () => {
      const c = comment('src/utils.ts', 50, 'Potential memory leak.');
      const formatted = formatInvalidComment(c);

      expect(formatted).toBe('- **src/utils.ts:50**: Potential memory leak.');
    });
  });

  describe('validateAndPartitionComments', () => {
    it('combines buildValidLineMap and validateComments', () => {
      const comments = [
        comment('src/utils.ts', 11, 'Valid.', 'RIGHT'),
        comment('src/nowhere.ts', 1, 'Invalid.'),
      ];

      const result = validateAndPartitionComments(comments, sampleDiffs);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
    });
  });
});
