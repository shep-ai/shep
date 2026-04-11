/**
 * Generic output filter — fallback for commands without a dedicated
 * filter. Applies ANSI stripping, blank-line collapsing, line
 * deduplication, and middle-truncation.
 *
 * This is intentionally conservative: it never drops content that
 * might be meaningful, it only compresses repeated/blank/color noise.
 */

import {
  stripAnsi,
  collapseBlankLines,
  deduplicateLines,
  truncateMiddle,
} from './shared-helpers.js';

const MAX_LINES = 150;

/**
 * Apply generic output cleanup. Safe for any command.
 */
export function filterGeneric(output: string): string {
  const clean = stripAnsi(output).trim();
  if (clean.length === 0) return '';

  const deduped = deduplicateLines(clean);
  const collapsed = collapseBlankLines(deduped);
  return truncateMiddle(collapsed, MAX_LINES);
}
