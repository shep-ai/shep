/**
 * npm/pnpm/yarn output filter — strips boilerplate from package
 * manager commands, keeping errors and actionable output.
 *
 * Covers: install, test, run (build/lint/etc.), list/ls.
 * Unrecognized subcommands fall through to basic cleanup.
 */

import {
  stripAnsi,
  collapseBlankLines,
  deduplicateLines,
  truncateMiddle,
} from './shared-helpers.js';

const MAX_LINES = 80;

/**
 * Filter npm/pnpm/yarn output. The `manager` param is the binary name
 * ("npm", "pnpm", or "yarn") — filtering logic is the same for all.
 */
export function filterNpm(subcommand: string, output: string): string {
  const clean = stripAnsi(output).trim();
  if (clean.length === 0) return 'ok';

  // Preserve error output unfiltered
  if (hasErrors(clean)) {
    return collapseBlankLines(truncateMiddle(clean, MAX_LINES));
  }

  switch (subcommand) {
    case 'install':
    case 'i':
    case 'ci':
    case 'add':
      return filterInstall(clean);
    case 'test':
    case 'run':
    case 'exec':
      return filterRun(clean);
    case 'list':
    case 'ls':
      return filterList(clean);
    case 'outdated':
      return filterOutdated(clean);
    default:
      return collapseBlankLines(truncateMiddle(clean, MAX_LINES));
  }
}

/** Check for error indicators that mean we should preserve full output. */
function hasErrors(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes('err!') ||
    lower.includes('error') ||
    lower.includes('enoent') ||
    lower.includes('eacces') ||
    lower.includes('npm warn') ||
    lower.includes('failed')
  );
}

/**
 * Filter install output — strip download/resolution progress, keep
 * the final summary.
 */
function filterInstall(output: string): string {
  const lines = output.split('\n');
  const result = lines.filter(
    (l) =>
      !l.startsWith('npm warn deprecated') &&
      !l.match(/^\s*$/) &&
      !l.includes('packages in') &&
      !l.includes('added ') &&
      !l.includes('removed ') &&
      !l.includes('up to date') &&
      !l.includes('reused ') &&
      !l.includes('Resolving') &&
      !l.includes('Downloading') &&
      !l.includes('looking for funding')
  );

  if (result.length === 0) return 'ok (installed)';
  return truncateMiddle(result.join('\n'), MAX_LINES);
}

/**
 * Filter test/run output — strip lifecycle boilerplate, keep test
 * results and errors.
 */
function filterRun(output: string): string {
  const lines = output.split('\n');
  const result = lines.filter(
    (l) =>
      !l.match(/^> [\w@/.-]+ /) && // Strip "> project@1.0.0 test" prefix
      !l.match(/^\s*$/)
  );

  const filtered = deduplicateLines(result.join('\n'));
  return collapseBlankLines(truncateMiddle(filtered, MAX_LINES));
}

/**
 * Filter list output — truncate to top-level deps only.
 */
function filterList(output: string): string {
  const lines = output.split('\n');
  // Keep only depth-0 lines (no leading whitespace beyond the tree markers)
  const topLevel = lines.filter(
    (l) => !l.startsWith('  ') || l.startsWith('├─') || l.startsWith('└─')
  );
  return truncateMiddle(topLevel.join('\n'), MAX_LINES);
}

/**
 * Filter outdated — keep the table but truncate.
 */
function filterOutdated(output: string): string {
  return truncateMiddle(output, MAX_LINES);
}
