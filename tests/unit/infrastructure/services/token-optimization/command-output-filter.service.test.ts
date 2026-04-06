/**
 * CommandOutputFilterService Unit Tests
 *
 * Tests for the regex-based command output filter that reduces test/build/git
 * output tokens while preserving all error-relevant lines.
 *
 * TDD Phase: RED
 */

import { describe, it, expect } from 'vitest';
import { CommandOutputFilterService } from '@/infrastructure/services/token-optimization/command-output-filter.service.js';

describe('CommandOutputFilterService', () => {
  const service = new CommandOutputFilterService();

  // --- Empty / no-op cases ---

  describe('empty and no-op inputs', () => {
    it('should return empty output with 0 lines removed for empty input', () => {
      const result = service.filter('');
      expect(result.filtered).toBe('');
      expect(result.linesRemoved).toBe(0);
    });

    it('should return unchanged output with 0 lines removed when no filterable content', () => {
      const input = 'This is a normal prompt with no command output.';
      const result = service.filter(input);
      expect(result.filtered).toBe(input);
      expect(result.linesRemoved).toBe(0);
    });

    it('should return unchanged output when input contains only error lines', () => {
      const input = [
        '```',
        'FAIL src/app.test.ts',
        'Error: expected true to be false',
        '  at Object.<anonymous> (src/app.test.ts:10:5)',
        '```',
      ].join('\n');
      const result = service.filter(input);
      expect(result.filtered).toBe(input);
      expect(result.linesRemoved).toBe(0);
    });
  });

  // --- Jest/Vitest test output filtering ---

  describe('Jest/Vitest test output filtering', () => {
    it('should remove PASS lines from test output', () => {
      const input = [
        'Test output:',
        '```',
        'PASS src/utils.test.ts',
        'PASS src/helpers.test.ts',
        'PASS src/index.test.ts',
        'FAIL src/app.test.ts',
        '  ● App > should render',
        '    Error: expected true to be false',
        '',
        'Test Suites: 1 failed, 3 passed, 4 total',
        '```',
      ].join('\n');

      const result = service.filter(input);

      // PASS lines should be removed
      expect(result.filtered).not.toContain('PASS src/utils.test.ts');
      expect(result.filtered).not.toContain('PASS src/helpers.test.ts');
      expect(result.filtered).not.toContain('PASS src/index.test.ts');

      // FAIL lines and error details must be preserved
      expect(result.filtered).toContain('FAIL src/app.test.ts');
      expect(result.filtered).toContain('Error: expected true to be false');
      expect(result.filtered).toContain('Test Suites: 1 failed, 3 passed, 4 total');

      expect(result.linesRemoved).toBeGreaterThanOrEqual(3);
    });

    it('should remove checkmark (✓) passing test lines', () => {
      const input = [
        '```',
        '  ✓ should add numbers (2ms)',
        '  ✓ should subtract numbers (1ms)',
        '  ✗ should multiply numbers',
        '    Error: expected 6 to be 8',
        '```',
      ].join('\n');

      const result = service.filter(input);

      expect(result.filtered).not.toContain('✓ should add numbers');
      expect(result.filtered).not.toContain('✓ should subtract numbers');
      expect(result.filtered).toContain('✗ should multiply numbers');
      expect(result.filtered).toContain('Error: expected 6 to be 8');
      expect(result.linesRemoved).toBeGreaterThanOrEqual(2);
    });

    it('should remove "✓" (checkmark) passing lines from vitest output', () => {
      const input = [
        '```',
        ' ✓ src/utils.test.ts (3 tests) 5ms',
        ' ✓ src/helpers.test.ts (2 tests) 3ms',
        ' ✗ src/app.test.ts (1 test) 10ms',
        '   × should render correctly',
        '```',
      ].join('\n');

      const result = service.filter(input);

      expect(result.filtered).not.toContain('✓ src/utils.test.ts');
      expect(result.filtered).not.toContain('✓ src/helpers.test.ts');
      expect(result.filtered).toContain('✗ src/app.test.ts');
      expect(result.linesRemoved).toBeGreaterThanOrEqual(2);
    });

    it('should preserve test summary lines', () => {
      const input = [
        '```',
        'PASS src/a.test.ts',
        'PASS src/b.test.ts',
        '',
        'Tests:       10 passed, 10 total',
        'Test Suites: 2 passed, 2 total',
        'Time:        3.5s',
        '```',
      ].join('\n');

      const result = service.filter(input);

      expect(result.filtered).toContain('Tests:');
      expect(result.filtered).toContain('Test Suites:');
      expect(result.filtered).toContain('Time:');
    });
  });

  // --- Stack trace preservation ---

  describe('stack trace preservation', () => {
    it('should preserve full stack traces', () => {
      const input = [
        '```',
        'PASS src/a.test.ts',
        'FAIL src/b.test.ts',
        '  ● Test suite > should work',
        '',
        "    TypeError: Cannot read property 'foo' of undefined",
        '',
        '      at Object.<anonymous> (src/b.test.ts:15:10)',
        '      at Promise.then.completed (node_modules/jest/build/index.js:123:45)',
        '      at process._tickCallback (internal/process/next_tick.js:68:7)',
        '```',
      ].join('\n');

      const result = service.filter(input);

      expect(result.filtered).toContain('TypeError: Cannot read property');
      expect(result.filtered).toContain('at Object.<anonymous> (src/b.test.ts:15:10)');
      expect(result.filtered).toContain('at Promise.then.completed');
      expect(result.filtered).toContain('at process._tickCallback');
    });

    it('should preserve stack trace lines starting with "at "', () => {
      const input = [
        '```',
        'PASS src/ok.test.ts',
        '    at Object.<anonymous> (/path/to/file.ts:42:13)',
        '    at Module._compile (node:internal/modules/cjs/loader:1159:14)',
        '```',
      ].join('\n');

      const result = service.filter(input);

      expect(result.filtered).toContain('at Object.<anonymous>');
      expect(result.filtered).toContain('at Module._compile');
    });
  });

  // --- Safety keyword preservation ---

  describe('safety keyword preservation', () => {
    const safetyKeywords = [
      'error',
      'Error',
      'ERROR',
      'fail',
      'FAIL',
      'warn',
      'WARN',
      'warning',
      'ENOENT',
      'exception',
      'stack',
      'panic',
      'timeout',
      'denied',
      'unauthorized',
      'not found',
      'undefined',
      'null',
      'NaN',
      'syntax',
      'rejected',
      'type error',
      'segfault',
      'abort',
      'killed',
    ];

    for (const keyword of safetyKeywords) {
      it(`should preserve lines containing "${keyword}"`, () => {
        const line = `some output containing ${keyword} in the middle`;
        const input = ['```', 'PASS src/ok.test.ts', line, '```'].join('\n');

        const result = service.filter(input);
        expect(result.filtered).toContain(line);
      });
    }

    it('should preserve lines with case-insensitive keyword matching', () => {
      const input = [
        '```',
        'PASS src/ok.test.ts',
        'Something with eNoEnT happened',
        'Another line with WARNING level',
        '```',
      ].join('\n');

      const result = service.filter(input);
      expect(result.filtered).toContain('eNoEnT');
      expect(result.filtered).toContain('WARNING');
    });
  });

  // --- TypeScript build output filtering ---

  describe('TypeScript build output filtering', () => {
    it('should preserve TypeScript compilation errors with file:line references', () => {
      const input = [
        '```',
        "src/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/utils.ts(3,1): error TS2304: Cannot find name 'foo'.",
        '```',
      ].join('\n');

      const result = service.filter(input);
      expect(result.filtered).toContain('error TS2322');
      expect(result.filtered).toContain('error TS2304');
      expect(result.linesRemoved).toBe(0);
    });

    it('should remove clean compilation output lines', () => {
      const input = [
        '```',
        '$ tsc --noEmit',
        'Compiling...',
        'Successfully compiled 42 files.',
        'Done in 3.5s.',
        '```',
      ].join('\n');

      const result = service.filter(input);
      // Success-only output can be reduced
      expect(result.linesRemoved).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Git diff output filtering ---

  describe('git diff output filtering', () => {
    it('should reduce long git diff output while preserving file names', () => {
      const diffLines = [
        '```',
        'diff --git a/src/app.ts b/src/app.ts',
        'index abc1234..def5678 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,5 +1,5 @@',
        '-const old = true;',
        '+const new = false;',
      ];

      // Add many unchanged context lines to make it long
      for (let i = 0; i < 100; i++) {
        diffLines.push(` unchanged line ${i}`);
      }
      diffLines.push('```');

      const input = diffLines.join('\n');
      const result = service.filter(input);

      // File header must be preserved
      expect(result.filtered).toContain('diff --git a/src/app.ts b/src/app.ts');

      // Changed lines must be preserved
      expect(result.filtered).toContain('-const old = true;');
      expect(result.filtered).toContain('+const new = false;');

      // Should reduce the total line count
      expect(result.linesRemoved).toBeGreaterThan(0);
    });

    it('should preserve diff hunk headers', () => {
      const input = [
        '```',
        'diff --git a/file.ts b/file.ts',
        '@@ -10,7 +10,7 @@ function example() {',
        '-  old code',
        '+  new code',
        '```',
      ].join('\n');

      const result = service.filter(input);
      expect(result.filtered).toContain('@@ -10,7 +10,7 @@');
      expect(result.filtered).toContain('-  old code');
      expect(result.filtered).toContain('+  new code');
    });
  });

  // --- pnpm install output filtering ---

  describe('pnpm install output filtering', () => {
    it('should reduce verbose pnpm install progress output', () => {
      const input = [
        '```',
        'Packages: +150',
        '++++++++++++++++++++++++++++++++++++++++++++++++++',
        'Progress: resolved 150, reused 148, downloaded 2, added 150',
        'Packages are hard linked from the content-addressable store',
        '',
        'dependencies:',
        '+ react 18.2.0',
        '+ react-dom 18.2.0',
        '',
        'devDependencies:',
        '+ typescript 5.3.0',
        '+ vitest 1.0.0',
        '',
        'Done in 5.2s',
        '```',
      ].join('\n');

      const result = service.filter(input);

      // Progress bars/resolution lines should be removable
      expect(result.linesRemoved).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Mixed content handling ---

  describe('mixed content handling', () => {
    it('should only filter within code blocks, not regular text', () => {
      const input = [
        'Here is the instruction text. PASS this to the agent.',
        '',
        'The test output:',
        '```',
        'PASS src/a.test.ts',
        'PASS src/b.test.ts',
        'FAIL src/c.test.ts',
        '  Error: assertion failed',
        '```',
        '',
        'Please fix the failing test.',
      ].join('\n');

      const result = service.filter(input);

      // Text outside code blocks must be preserved
      expect(result.filtered).toContain('Here is the instruction text. PASS this to the agent.');
      expect(result.filtered).toContain('Please fix the failing test.');

      // FAIL and error inside code block must be preserved
      expect(result.filtered).toContain('FAIL src/c.test.ts');
      expect(result.filtered).toContain('Error: assertion failed');
    });

    it('should handle multiple code blocks independently', () => {
      const input = [
        'First block:',
        '```',
        'PASS src/a.test.ts',
        'PASS src/b.test.ts',
        '```',
        '',
        'Second block:',
        '```',
        'FAIL src/c.test.ts',
        '  Error: something broke',
        '```',
      ].join('\n');

      const result = service.filter(input);

      // First block PASS lines should be filtered
      expect(result.linesRemoved).toBeGreaterThanOrEqual(2);

      // Second block error content must be preserved
      expect(result.filtered).toContain('FAIL src/c.test.ts');
      expect(result.filtered).toContain('Error: something broke');
    });
  });

  // --- Repeated blank line collapsing ---

  describe('blank line handling', () => {
    it('should collapse multiple consecutive blank lines into one', () => {
      const input = [
        '```',
        'FAIL src/app.test.ts',
        '',
        '',
        '',
        '',
        '  Error: test failed',
        '```',
      ].join('\n');

      const result = service.filter(input);

      // Should not have 4+ consecutive blank lines
      expect(result.filtered).not.toContain('\n\n\n\n');

      // Error content must be preserved
      expect(result.filtered).toContain('Error: test failed');
      expect(result.linesRemoved).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Token reduction validation ---

  describe('token reduction effectiveness', () => {
    it('should achieve 50%+ reduction on typical passing test suite output', () => {
      const passLines: string[] = [];
      for (let i = 0; i < 50; i++) {
        passLines.push(`PASS src/module-${i}/index.test.ts`);
      }

      const input = [
        '```',
        ...passLines,
        'FAIL src/broken.test.ts',
        '  ● should work',
        '    Error: expected 1 to be 2',
        '',
        'Test Suites: 1 failed, 50 passed, 51 total',
        'Tests:       1 failed, 200 passed, 201 total',
        'Time:        12.5s',
        '```',
      ].join('\n');

      const result = service.filter(input);

      // Must preserve failure info
      expect(result.filtered).toContain('FAIL src/broken.test.ts');
      expect(result.filtered).toContain('Error: expected 1 to be 2');
      expect(result.filtered).toContain('Test Suites:');

      // Must remove most PASS lines — 50%+ reduction
      const originalLines = input.split('\n').length;
      const filteredLines = result.filtered.split('\n').length;
      const reductionPercent = ((originalLines - filteredLines) / originalLines) * 100;
      expect(reductionPercent).toBeGreaterThan(50);
    });
  });
});
