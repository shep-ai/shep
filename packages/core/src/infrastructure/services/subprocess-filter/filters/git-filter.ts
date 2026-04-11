/**
 * Git output filter — filters the output of git subcommands to reduce
 * token consumption when Claude Code ingests tool results.
 *
 * Covers: status, log, diff, show, add, commit, push, pull, fetch,
 * branch, stash, worktree. Unrecognized subcommands fall through to
 * the generic filter.
 */

import { stripAnsi, collapseBlankLines, truncateMiddle } from './shared-helpers.js';

const MAX_DIFF_LINES = 200;
const MAX_LOG_LINES = 100;

/**
 * Filter git command output. Dispatches to a subcommand-specific
 * handler when one exists, otherwise returns the input with basic
 * cleanup (ANSI strip + blank collapse).
 */
export function filterGit(subcommand: string, output: string): string {
  const clean = stripAnsi(output).trimEnd();
  if (clean.trim().length === 0) return 'ok';

  switch (subcommand) {
    case 'status':
      return filterStatus(clean);
    case 'log':
      return filterLog(clean);
    case 'diff':
      return filterDiff(clean);
    case 'show':
      return filterShow(clean);
    case 'add':
      return filterSimpleOk(clean, 'added');
    case 'commit':
      return filterCommit(clean);
    case 'push':
      return filterPush(clean);
    case 'pull':
      return filterPull(clean);
    case 'fetch':
      return filterSimpleOk(clean, 'fetched');
    case 'branch':
      return filterBranch(clean);
    case 'stash':
      return filterSimpleOk(clean, 'stash');
    case 'worktree':
      return collapseBlankLines(clean);
    default:
      return collapseBlankLines(truncateMiddle(clean, MAX_LOG_LINES));
  }
}

/**
 * Parse git status output into a compact format.
 * Handles both porcelain and human-readable output.
 */
function filterStatus(output: string): string {
  const lines = output.split('\n').filter((l) => l.trim().length > 0);

  // Detect porcelain format (lines start with XY + space)
  const porcelainPattern = /^[ MADRCU?!]{2} /;
  const isPorcelain = lines.length > 0 && lines.every((l) => porcelainPattern.test(l));

  if (isPorcelain) {
    return lines
      .map((line) => {
        const status = line.slice(0, 2).trim();
        const file = line.slice(3);
        return `[${status || '?'}] ${file}`;
      })
      .join('\n');
  }

  // Human-readable format: keep but compress. Remove "On branch" and
  // "Your branch is up to date" boilerplate; keep the file lists.
  const result = lines.filter(
    (l) =>
      !l.startsWith('On branch') &&
      !l.startsWith('Your branch is up to date') &&
      !l.startsWith('  (use "git')
  );

  return result.length > 0 ? collapseBlankLines(result.join('\n')) : 'clean';
}

/**
 * Compress git log to one-line-per-commit format, capped at MAX_LOG_LINES.
 */
function filterLog(output: string): string {
  // If already one-line format (--oneline), just truncate
  const lines = output.split('\n');
  const isOneline = lines.every((l) => !l.startsWith('commit ') && !l.startsWith('Author:'));

  if (isOneline) {
    return truncateMiddle(output, MAX_LOG_LINES);
  }

  // Full log format: extract hash + subject from each commit block
  const commits: string[] = [];
  let currentHash = '';

  for (const line of lines) {
    const commitMatch = line.match(/^commit ([a-f0-9]{7,40})/);
    if (commitMatch) {
      currentHash = commitMatch[1].slice(0, 7);
      continue;
    }
    if (line.startsWith('    ') && currentHash) {
      commits.push(`${currentHash} ${line.trim()}`);
      currentHash = '';
    }
  }

  return commits.length > 0
    ? truncateMiddle(commits.join('\n'), MAX_LOG_LINES)
    : truncateMiddle(output, MAX_LOG_LINES);
}

/**
 * Compact git diff by removing context lines (unchanged lines starting
 * with space in unified format) and capping total length.
 */
function filterDiff(output: string): string {
  const lines = output.split('\n');
  const result: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    // Keep diff/file headers
    if (
      line.startsWith('diff --git') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('@@')
    ) {
      result.push(line);
      inHunk = line.startsWith('@@');
      continue;
    }

    // Inside a hunk: keep only changed lines (+ and -)
    if (inHunk) {
      if (line.startsWith('+') || line.startsWith('-')) {
        result.push(line);
      }
      // Skip context lines (start with space)
      continue;
    }

    // Outside hunks: keep (e.g., binary file notices, mode changes)
    result.push(line);
  }

  return truncateMiddle(result.join('\n'), MAX_DIFF_LINES);
}

/**
 * Filter git show — use --stat format when possible, otherwise
 * treat as diff.
 */
function filterShow(output: string): string {
  // If output looks like a stat summary (has " | " column), keep as-is
  if (output.includes(' | ')) {
    return truncateMiddle(output, MAX_LOG_LINES);
  }
  // Otherwise treat as a diff
  return filterDiff(output);
}

/** Extract the commit hash from git commit output. */
function filterCommit(output: string): string {
  const match = output.match(/\[[\w/.-]+ ([a-f0-9]{7,})\]/);
  return match ? `ok ${match[1]}` : 'ok';
}

/** Extract branch/remote info from git push output. */
function filterPush(output: string): string {
  const branchMatch = output.match(/(\S+)\s*->\s*(\S+)/);
  if (branchMatch) return `ok ${branchMatch[1]} → ${branchMatch[2]}`;

  // "Everything up-to-date" case
  if (output.toLowerCase().includes('up-to-date') || output.toLowerCase().includes('up to date')) {
    return 'ok (up-to-date)';
  }
  return 'ok';
}

/** Extract stats from git pull output. */
function filterPull(output: string): string {
  if (output.includes('Already up to date')) return 'ok (up-to-date)';

  const statsMatch = output.match(
    /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
  );
  if (statsMatch) {
    const files = statsMatch[1];
    const ins = statsMatch[2] ?? '0';
    const del = statsMatch[3] ?? '0';
    return `ok ${files} files +${ins} -${del}`;
  }
  return 'ok';
}

/** Filter git branch — just the branch names, no decoration noise. */
function filterBranch(output: string): string {
  return output
    .split('\n')
    .map((l) => l.replace(/^\*?\s+/, '').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

/** Simple "ok" filter for commands whose output we mostly don't need. */
function filterSimpleOk(output: string, label: string): string {
  if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fatal')) {
    return output;
  }
  return `ok (${label})`;
}
