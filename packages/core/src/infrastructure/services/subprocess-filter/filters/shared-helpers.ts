/**
 * Shared helpers used across all subprocess output filters.
 *
 * These are small, pure functions for text transformation —
 * deduplication, blank-line collapsing, ANSI stripping, and
 * middle-truncation. Each filter composes from these primitives.
 */

/**
 * Strip ANSI escape sequences (colors, cursor movement, etc.).
 * Covers standard SGR sequences: \x1b[0;31m, \x1b[1m, etc.
 */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/**
 * Collapse runs of 3+ consecutive blank lines into a single blank line.
 * Trims trailing whitespace from each line as a side effect.
 */
export function collapseBlankLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let consecutiveBlanks = 0;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) {
      consecutiveBlanks++;
      if (consecutiveBlanks <= 2) {
        result.push('');
      }
    } else {
      consecutiveBlanks = 0;
      result.push(trimmed);
    }
  }

  return result.join('\n');
}

/**
 * Deduplicate consecutive identical lines, appending a count.
 *
 * Example:
 *   "ok\nok\nok\nfail" → "ok (×3)\nfail"
 */
export function deduplicateLines(text: string): string {
  const lines = text.split('\n');
  if (lines.length === 0) return text;

  const result: string[] = [];
  let prevLine = lines[0];
  let count = 1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === prevLine) {
      count++;
    } else {
      result.push(count > 1 ? `${prevLine} (×${count})` : prevLine);
      prevLine = lines[i];
      count = 1;
    }
  }
  result.push(count > 1 ? `${prevLine} (×${count})` : prevLine);

  return result.join('\n');
}

/**
 * Truncate text that exceeds maxLines by keeping the top half and
 * bottom quarter, inserting an omission marker in the middle.
 *
 * Preserves the head (most likely context/setup) and tail (most
 * likely summary/errors) which are the parts LLMs benefit from most.
 */
export function truncateMiddle(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;

  const keepTop = Math.ceil(maxLines * 0.6);
  const keepBottom = maxLines - keepTop - 1;
  const omitted = lines.length - keepTop - keepBottom;

  return [
    ...lines.slice(0, keepTop),
    `... ${omitted} lines omitted ...`,
    ...lines.slice(lines.length - keepBottom),
  ].join('\n');
}
