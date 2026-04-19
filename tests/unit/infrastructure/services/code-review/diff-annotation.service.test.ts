import { describe, it, expect } from 'vitest';
import { annotateFileDiffs } from '@/infrastructure/services/code-review/diff-annotation.service.js';
import type {
  FileDiff,
  DiffHunk,
  DiffLine,
} from '@/application/ports/output/services/git-pr-service.interface.js';

/**
 * Helper to create a DiffLine for tests.
 */
function line(
  type: DiffLine['type'],
  content: string,
  oldNumber?: number,
  newNumber?: number
): DiffLine {
  return { type, content, oldNumber, newNumber };
}

/**
 * Helper to create a DiffHunk for tests.
 */
function hunk(header: string, lines: DiffLine[]): DiffHunk {
  return { header, lines };
}

/**
 * Helper to create a FileDiff for tests.
 */
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

describe('DiffAnnotationService', () => {
  describe('annotateFileDiffs', () => {
    it('returns empty string for empty diff array', () => {
      expect(annotateFileDiffs([])).toBe('');
    });

    it('annotates single-hunk added-only diff', () => {
      const diffs: FileDiff[] = [
        fileDiff('src/new-file.ts', 'added', [
          hunk('@@ -0,0 +1,3 @@', [
            line('added', 'const x = 1;', undefined, 1),
            line('added', 'const y = 2;', undefined, 2),
            line('added', 'export { x, y };', undefined, 3),
          ]),
        ]),
      ];

      const result = annotateFileDiffs(diffs);

      expect(result).toContain('--- /dev/null');
      expect(result).toContain('+++ src/new-file.ts');
      expect(result).toContain('+1:const x = 1;');
      expect(result).toContain('+2:const y = 2;');
      expect(result).toContain('+3:export { x, y };');
    });

    it('annotates mixed added/removed/context lines with correct line numbers', () => {
      const diffs: FileDiff[] = [
        fileDiff('src/utils.ts', 'modified', [
          hunk('@@ -10,5 +10,6 @@', [
            line('context', 'function helper() {', 10, 10),
            line('removed', '  return null;', 11, undefined),
            line('added', '  return undefined;', undefined, 11),
            line('added', '  // fixed return value', undefined, 12),
            line('context', '}', 12, 13),
          ]),
        ]),
      ];

      const result = annotateFileDiffs(diffs);

      expect(result).toContain('--- src/utils.ts');
      expect(result).toContain('+++ src/utils.ts');
      expect(result).toContain(' 10:function helper() {');
      expect(result).toContain('-11:  return null;');
      expect(result).toContain('+11:  return undefined;');
      expect(result).toContain('+12:  // fixed return value');
      expect(result).toContain(' 13:}');
    });

    it('handles multi-hunk file correctly', () => {
      const diffs: FileDiff[] = [
        fileDiff('src/app.ts', 'modified', [
          hunk('@@ -1,3 +1,4 @@', [
            line('context', 'import { x } from "./x";', 1, 1),
            line('added', 'import { y } from "./y";', undefined, 2),
            line('context', '', 2, 3),
            line('context', 'const app = {', 3, 4),
          ]),
          hunk('@@ -20,4 +21,5 @@', [
            line('context', 'function run() {', 20, 21),
            line('removed', '  console.log("old");', 21, undefined),
            line('added', '  console.log("new");', undefined, 22),
            line('added', '  console.log("extra");', undefined, 23),
            line('context', '}', 22, 24),
          ]),
        ]),
      ];

      const result = annotateFileDiffs(diffs);

      // First hunk
      expect(result).toContain('@@ -1,3 +1,4 @@');
      expect(result).toContain(' 1:import { x } from "./x";');
      expect(result).toContain('+2:import { y } from "./y";');

      // Second hunk
      expect(result).toContain('@@ -20,4 +21,5 @@');
      expect(result).toContain(' 21:function run() {');
      expect(result).toContain('-21:  console.log("old");');
      expect(result).toContain('+22:  console.log("new");');
      expect(result).toContain('+23:  console.log("extra");');
      expect(result).toContain(' 24:}');
    });

    it('shows both paths for renamed files', () => {
      const diffs: FileDiff[] = [
        fileDiff(
          'src/new-name.ts',
          'renamed',
          [
            hunk('@@ -1,2 +1,2 @@', [
              line('removed', 'const old = 1;', 1, undefined),
              line('added', 'const renamed = 1;', undefined, 1),
            ]),
          ],
          { oldPath: 'src/old-name.ts' }
        ),
      ];

      const result = annotateFileDiffs(diffs);

      expect(result).toContain('--- src/old-name.ts');
      expect(result).toContain('+++ src/new-name.ts');
      expect(result).toContain('-1:const old = 1;');
      expect(result).toContain('+1:const renamed = 1;');
    });

    it('skips binary files with a descriptive note', () => {
      const diffs: FileDiff[] = [
        fileDiff('assets/logo.png', 'modified', [], { additions: 0, deletions: 0 }),
      ];

      const result = annotateFileDiffs(diffs);

      expect(result).toContain('--- assets/logo.png');
      expect(result).toContain('+++ assets/logo.png');
      expect(result).toContain('[Binary file — skipped]');
    });

    it('skips binary files detected via "Binary file" content', () => {
      const diffs: FileDiff[] = [
        fileDiff(
          'assets/image.jpg',
          'modified',
          [hunk('', [line('context', 'Binary file assets/image.jpg differs', 1, 1)])],
          { additions: 0, deletions: 0 }
        ),
      ];

      const result = annotateFileDiffs(diffs);
      expect(result).toContain('[Binary file — skipped]');
    });

    it('handles deleted files correctly', () => {
      const diffs: FileDiff[] = [
        fileDiff('src/removed.ts', 'deleted', [
          hunk('@@ -1,2 +0,0 @@', [
            line('removed', 'const a = 1;', 1, undefined),
            line('removed', 'export { a };', 2, undefined),
          ]),
        ]),
      ];

      const result = annotateFileDiffs(diffs);

      expect(result).toContain('--- src/removed.ts');
      expect(result).toContain('+++ /dev/null');
      expect(result).toContain('-1:const a = 1;');
      expect(result).toContain('-2:export { a };');
    });

    it('filters out no-newline-at-EOF markers', () => {
      const diffs: FileDiff[] = [
        fileDiff('src/file.ts', 'modified', [
          hunk('@@ -1,2 +1,2 @@', [
            line('removed', 'old line', 1, undefined),
            line('context', '\\ No newline at end of file', undefined, undefined),
            line('added', 'new line', undefined, 1),
          ]),
        ]),
      ];

      const result = annotateFileDiffs(diffs);

      expect(result).not.toContain('No newline at end of file');
      expect(result).toContain('-1:old line');
      expect(result).toContain('+1:new line');
    });

    it('handles multiple files in a single diff', () => {
      const diffs: FileDiff[] = [
        fileDiff('src/a.ts', 'modified', [
          hunk('@@ -1,1 +1,1 @@', [
            line('removed', 'old a', 1, undefined),
            line('added', 'new a', undefined, 1),
          ]),
        ]),
        fileDiff('src/b.ts', 'added', [
          hunk('@@ -0,0 +1,1 @@', [line('added', 'new b', undefined, 1)]),
        ]),
      ];

      const result = annotateFileDiffs(diffs);

      // Both files present with separator
      expect(result).toContain('--- src/a.ts');
      expect(result).toContain('--- /dev/null');
      expect(result).toContain('+++ src/b.ts');

      // Sections separated by blank line
      const sections = result.split('\n\n');
      expect(sections.length).toBe(2);
    });

    it('processes a large diff within performance bounds', () => {
      // Generate a diff with ~10,000 lines
      const largeDiff: FileDiff[] = [];
      for (let f = 0; f < 20; f++) {
        const lines: DiffLine[] = [];
        for (let i = 1; i <= 500; i++) {
          lines.push(line('added', `const var${i} = ${i};`, undefined, i));
        }
        largeDiff.push(fileDiff(`src/file-${f}.ts`, 'added', [hunk(`@@ -0,0 +1,500 @@`, lines)]));
      }

      const start = performance.now();
      const result = annotateFileDiffs(largeDiff);
      const elapsed = performance.now() - start;

      // NFR-2: must process 10,000 lines in under 500ms
      expect(elapsed).toBeLessThan(500);
      expect(result.length).toBeGreaterThan(0);
      // Verify first and last file present
      expect(result).toContain('+++ src/file-0.ts');
      expect(result).toContain('+++ src/file-19.ts');
    });
  });
});
