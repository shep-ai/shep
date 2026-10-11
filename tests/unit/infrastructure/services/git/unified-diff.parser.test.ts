// @vitest-environment node

/**
 * Unified diff parser — shared by GitPrService (branch diffs), the GitHub
 * review service (API patches) and GitCheckpointService (checkpoint diffs).
 */

import { describe, it, expect } from 'vitest';
import {
  parseUnifiedDiff,
  parseDiffHunks,
} from '@/infrastructure/services/git/unified-diff.parser.js';

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,3 @@ export function a() {',
  ' const x = 1;',
  '-const y = 2;',
  '+const y = 3;',
  ' return x;',
  '@@ -10,2 +10,3 @@',
  ' a',
  '+b',
  ' c',
  '\\ No newline at end of file',
  'diff --git a/new.txt b/new.txt',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/new.txt',
  '@@ -0,0 +1 @@',
  '+hello',
  'diff --git a/gone.txt b/gone.txt',
  'deleted file mode 100644',
  '--- a/gone.txt',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-bye',
  'diff --git a/old name.txt b/new name.txt',
  'similarity index 100%',
  'rename from old name.txt',
  'rename to new name.txt',
  '',
].join('\n');

describe('parseUnifiedDiff', () => {
  it('returns [] for empty output', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('\n  \n')).toEqual([]);
  });

  it('parses status, counts and hunks per file', () => {
    const files = parseUnifiedDiff(RAW);
    expect(files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ['src/a.ts', 'modified', 2, 1],
      ['new.txt', 'added', 1, 0],
      ['gone.txt', 'deleted', 0, 1],
      ['new name.txt', 'renamed', 0, 0],
    ]);
    expect(files[3].oldPath).toBe('old name.txt');
    expect(files[0].oldPath).toBeUndefined();
  });

  it('numbers lines from the hunk headers', () => {
    const [file] = parseUnifiedDiff(RAW);
    expect(file.hunks).toHaveLength(2);
    expect(file.hunks[0].lines).toEqual([
      { type: 'context', content: 'const x = 1;', oldNumber: 1, newNumber: 1 },
      { type: 'removed', content: 'const y = 2;', oldNumber: 2 },
      { type: 'added', content: 'const y = 3;', newNumber: 2 },
      { type: 'context', content: 'return x;', oldNumber: 3, newNumber: 3 },
    ]);
    expect(file.hunks[1].lines.map((l) => l.newNumber)).toEqual([10, 11, 12]);
  });
});

describe('parseDiffHunks', () => {
  it('parses a bare patch (GitHub API shape) and ignores "\\ No newline" markers', () => {
    const result = parseDiffHunks('@@ -1,2 +1,2 @@\n-a\n+b\n c\n\\ No newline at end of file');
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.hunks[0].lines).toHaveLength(3);
  });

  it('returns an empty result for an empty patch', () => {
    expect(parseDiffHunks('')).toEqual({ hunks: [], additions: 0, deletions: 0 });
  });
});
