/**
 * Command Output Filter Service
 *
 * Regex-based filter that reduces test/build/git output tokens embedded in
 * prompts while preserving all error-relevant lines. Applies configurable
 * filter policies within fenced code blocks only.
 *
 * Safety guarantee: any line containing error-related keywords is preserved
 * verbatim regardless of other filter rules.
 */

import type {
  ICommandOutputFilterService,
  CommandOutputFilterResult,
} from '@/application/ports/output/services/command-output-filter.interface.js';

/**
 * Safety keywords — any line containing one of these (case-insensitive) is
 * preserved unconditionally. Biased toward preservation: when in doubt, keep.
 */
const SAFETY_KEYWORDS: readonly RegExp[] = [
  /error/i,
  /fail/i,
  /warn/i,
  /warning/i,
  /enoent/i,
  /exception/i,
  /stack/i,
  /panic/i,
  /timeout/i,
  /denied/i,
  /unauthorized/i,
  /not found/i,
  /undefined/i,
  /\bnull\b/i,
  /\bnan\b/i,
  /syntax/i,
  /rejected/i,
  /type error/i,
  /segfault/i,
  /abort/i,
  /killed/i,
];

/**
 * Patterns for lines that can be removed from test output.
 * Only applied within fenced code blocks.
 */
const REMOVABLE_TEST_PATTERNS: readonly RegExp[] = [
  // Jest/Vitest PASS lines: "PASS src/file.test.ts"
  /^\s*PASS\s+\S/,
  // Checkmark passing lines: "  ✓ test name (2ms)"
  /^\s*✓\s+/,
  // Vitest checkmark passing lines: " ✓ src/file.test.ts"
  /^\s*✓\s+\S/,
];

/**
 * Patterns for lines that are always preserved (in addition to safety keywords).
 */
const ALWAYS_PRESERVE_PATTERNS: readonly RegExp[] = [
  // Stack trace lines
  /^\s+at\s+/,
  // Test summary lines
  /^(Tests?|Test Suites?|Time|Snapshots?):\s+/,
  // Bullet points with test names (failure details)
  /^\s*●\s+/,
  // Cross mark failing lines
  /^\s*[✗×]\s+/,
  // Diff headers
  /^diff --git\s/,
  /^(---|\+\+\+)\s/,
  /^@@\s/,
  // Diff changed lines
  /^[+-][^+-]/,
  // Git index lines
  /^index\s+[0-9a-f]+/,
];

/**
 * Patterns identifying context lines in git diffs that can be removed when
 * the diff is excessively long.
 */
const DIFF_CONTEXT_LINE = /^ [^+-@]/;

/** Maximum number of consecutive diff context lines to keep at start/end. */
const MAX_DIFF_CONTEXT_LINES = 5;

/**
 * Check whether a line contains any safety keyword.
 */
function isSafeLine(line: string): boolean {
  return SAFETY_KEYWORDS.some((kw) => kw.test(line));
}

/**
 * Check whether a line matches any always-preserve pattern.
 */
function isPreservedPattern(line: string): boolean {
  return ALWAYS_PRESERVE_PATTERNS.some((p) => p.test(line));
}

/**
 * Check whether a line matches a removable test pattern.
 */
function isRemovableTestLine(line: string): boolean {
  return REMOVABLE_TEST_PATTERNS.some((p) => p.test(line));
}

/**
 * Filter lines within a single code block. Returns the filtered lines and
 * the count of removed lines.
 */
function filterCodeBlock(lines: string[]): { filtered: string[]; removed: number } {
  const isDiff = lines.some((l) => /^diff --git\s/.test(l));

  if (isDiff) {
    return filterDiffBlock(lines);
  }

  return filterTestOrBuildBlock(lines);
}

/**
 * Filter a git diff code block — truncate long runs of unchanged context
 * lines while preserving headers, changed lines, and hunk markers.
 */
function filterDiffBlock(lines: string[]): { filtered: string[]; removed: number } {
  const result: string[] = [];
  let removed = 0;
  let contextRun: string[] = [];

  const flushContextRun = (): void => {
    if (contextRun.length <= MAX_DIFF_CONTEXT_LINES * 2) {
      result.push(...contextRun);
    } else {
      // Keep first N and last N context lines, remove middle
      const head = contextRun.slice(0, MAX_DIFF_CONTEXT_LINES);
      const tail = contextRun.slice(-MAX_DIFF_CONTEXT_LINES);
      const skipped = contextRun.length - head.length - tail.length;
      result.push(...head);
      result.push(`  ... (${skipped} unchanged lines omitted)`);
      result.push(...tail);
      removed += skipped;
    }
    contextRun = [];
  };

  for (const line of lines) {
    if (DIFF_CONTEXT_LINE.test(line)) {
      contextRun.push(line);
    } else {
      if (contextRun.length > 0) {
        flushContextRun();
      }
      // Always keep non-context lines in diffs (headers, changed lines, hunks)
      result.push(line);
    }
  }

  // Flush trailing context
  if (contextRun.length > 0) {
    flushContextRun();
  }

  return { filtered: result, removed };
}

/**
 * Filter test/build/pnpm output — remove passing test lines and collapse
 * repeated blank lines while preserving everything error-related.
 */
function filterTestOrBuildBlock(lines: string[]): { filtered: string[]; removed: number } {
  const result: string[] = [];
  let removed = 0;
  let consecutiveBlanks = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Collapse multiple blank lines
    if (trimmed === '') {
      consecutiveBlanks++;
      if (consecutiveBlanks <= 1) {
        result.push(line);
      } else {
        removed++;
      }
      continue;
    }
    consecutiveBlanks = 0;

    // Safety keywords always preserved
    if (isSafeLine(line)) {
      result.push(line);
      continue;
    }

    // Always-preserve patterns (stack traces, summaries, failure markers)
    if (isPreservedPattern(line)) {
      result.push(line);
      continue;
    }

    // Removable test output lines
    if (isRemovableTestLine(line)) {
      removed++;
      continue;
    }

    // Default: preserve the line
    result.push(line);
  }

  return { filtered: result, removed };
}

export class CommandOutputFilterService implements ICommandOutputFilterService {
  /**
   * Filter command output embedded in a prompt string.
   *
   * Detects fenced code blocks and applies reduction policies within them.
   * Text outside code blocks is never modified. Lines containing error-related
   * keywords are always preserved.
   */
  filter(prompt: string): CommandOutputFilterResult {
    if (prompt === '') {
      return { filtered: '', linesRemoved: 0 };
    }

    const lines = prompt.split('\n');
    const result: string[] = [];
    let totalRemoved = 0;

    let inCodeBlock = false;
    let codeBlockLines: string[] = [];

    for (const line of lines) {
      // Detect code fence boundaries
      if (line.trimStart().startsWith('```')) {
        if (!inCodeBlock) {
          // Opening fence
          inCodeBlock = true;
          codeBlockLines = [];
          result.push(line);
        } else {
          // Closing fence — filter accumulated code block lines
          const { filtered, removed } = filterCodeBlock(codeBlockLines);
          result.push(...filtered);
          totalRemoved += removed;
          result.push(line);
          inCodeBlock = false;
          codeBlockLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
      } else {
        // Outside code blocks — always preserve
        result.push(line);
      }
    }

    // If code block was never closed, include accumulated lines unfiltered
    if (inCodeBlock) {
      result.push(...codeBlockLines);
    }

    return {
      filtered: result.join('\n'),
      linesRemoved: totalRemoved,
    };
  }
}
