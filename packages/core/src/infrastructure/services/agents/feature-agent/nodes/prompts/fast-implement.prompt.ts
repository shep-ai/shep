/**
 * Fast-Implement Prompt Builder
 *
 * Builds a single-pass implementation prompt for fast mode.
 * Combines the user's raw query with lightweight codebase context
 * (CLAUDE.md, package.json, shallow directory listing).
 *
 * The prompt instructs the executor to implement changes and run tests,
 * but NOT to commit, push, or create PRs (that's the merge node's job).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { readSpecFile } from '../node-helpers.js';
import type { FeatureAgentState } from '../../state.js';

/**
 * Read a file from the worktree, returning empty string if not found.
 */
function readWorktreeFile(worktreePath: string, filename: string): string {
  try {
    return readFileSync(join(worktreePath, filename), 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Build a shallow directory listing (depth 1-2) of the worktree.
 * Returns a tree-style string. Skips common noise directories.
 */
function buildDirectoryListing(worktreePath: string): string {
  const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'coverage',
    '.turbo',
    '.cache',
    '.shep',
  ]);

  const lines: string[] = [];

  try {
    const topLevel = readdirSync(worktreePath);
    for (const entry of topLevel) {
      if (SKIP_DIRS.has(entry)) continue;

      const fullPath = join(worktreePath, entry);
      let isDir = false;
      try {
        isDir = statSync(fullPath).isDirectory();
      } catch {
        continue;
      }

      if (isDir) {
        lines.push(`${entry}/`);
        try {
          const children = readdirSync(fullPath);
          for (const child of children) {
            if (SKIP_DIRS.has(child)) continue;
            const childPath = join(fullPath, child);
            let childIsDir = false;
            try {
              childIsDir = statSync(childPath).isDirectory();
            } catch {
              continue;
            }
            lines.push(`  ${child}${childIsDir ? '/' : ''}`);
          }
        } catch {
          // Cannot read subdirectory — skip
        }
      } else {
        lines.push(entry);
      }
    }
  } catch {
    return '(unable to list directory)';
  }

  return lines.join('\n');
}

/**
 * Extract the user query from spec.yaml's userQuery field.
 * Falls back to the raw YAML content if parsing fails.
 */
function extractUserQuery(specDir: string): string {
  const specContent = readSpecFile(specDir, 'spec.yaml');
  if (!specContent) return '';

  try {
    const data = yaml.load(specContent) as Record<string, unknown>;
    const userQuery = data?.userQuery;
    if (typeof userQuery === 'string' && userQuery.trim()) {
      return userQuery.trim();
    }
  } catch {
    // Fall through to raw content
  }

  return specContent;
}

/**
 * Extract rejection feedback from spec.yaml for merge-phase rejections.
 * Returns a formatted prompt section if feedback exists, empty string otherwise.
 */
function getRejectionFeedback(specDir: string): string {
  try {
    const specContent = readSpecFile(specDir, 'spec.yaml');
    if (!specContent) return '';

    const specData = yaml.load(specContent) as Record<string, unknown> | null;
    const rejectionFeedback = specData?.rejectionFeedback as
      | { iteration: number; message: string; phase?: string; timestamp: string }[]
      | undefined;
    if (rejectionFeedback && rejectionFeedback.length > 0) {
      const mergeRejections = rejectionFeedback.filter((e) => e.phase === 'merge');
      if (mergeRejections.length > 0) {
        const latest = mergeRejections[mergeRejections.length - 1];
        const older = mergeRejections.slice(0, -1);
        const olderSection =
          older.length > 0
            ? `\n### Earlier feedback (for context only)\n${older.map((e) => `- Iteration ${e.iteration}: ${e.message}`).join('\n')}\n`
            : '';
        return `
## CRITICAL — User Rejection Feedback (MUST ADDRESS)

**YOUR PRIMARY TASK: The user rejected the previous result and gave this feedback. You MUST act on it:**

> ${latest.message}

(Iteration ${latest.iteration}, ${latest.timestamp})

Do NOT just record this feedback — you must actually make the changes the user requested.
${olderSection}`;
      }
    }
  } catch {
    // Continue without rejection feedback
  }
  return '';
}

/**
 * Build the fast-implement prompt from user query + codebase context.
 *
 * The prompt includes:
 * 1. User's raw query (from spec.yaml userQuery field)
 * 2. CLAUDE.md content (if exists)
 * 3. package.json (if exists)
 * 4. Shallow directory listing (depth 1-2)
 *
 * Instructs the executor to implement, test, and validate — but NOT
 * commit/push/PR (that's the merge node's job).
 */
export function buildFastImplementPrompt(state: FeatureAgentState): string {
  const cwd = state.worktreePath || state.repositoryPath;
  const userQuery = extractUserQuery(state.specDir);

  // Read optional context files
  const claudeMd = readWorktreeFile(cwd, 'CLAUDE.md');
  const packageJson = readWorktreeFile(cwd, 'package.json');
  const dirListing = buildDirectoryListing(cwd);

  // Check for rejection feedback from prior merge rejection
  const rejectionSection = getRejectionFeedback(state.specDir);

  // Build sections conditionally
  const sections: string[] = [];

  sections.push(`You are a senior software engineer implementing a change directly from a user request.
${rejectionSection}
## User Request

${userQuery}

## Implementation Instructions

1. ${rejectionSection ? 'Address the rejection feedback above by modifying the existing implementation' : 'Implement the requested changes in the codebase'}
2. Write tests for your changes where appropriate
3. Run the test suite and fix any failures
4. Run the linter and fix any issues
5. Ensure the project builds successfully
6. Do NOT commit, push, or create a PR — just make the code changes

## Working Directory

${cwd}`);

  if (claudeMd) {
    sections.push(`## Project Guidelines (CLAUDE.md)

${claudeMd}`);
  }

  if (packageJson) {
    // Truncate large package.json to stay within prompt budget
    const truncated =
      packageJson.length > 3000 ? `${packageJson.slice(0, 3000)}\n...(truncated)` : packageJson;
    sections.push(`## Package Configuration (package.json)

\`\`\`json
${truncated}
\`\`\``);
  }

  if (dirListing && dirListing !== '(unable to list directory)') {
    sections.push(`## Project Structure

\`\`\`
${dirListing}
\`\`\``);
  }

  sections.push(`## Constraints

- Implement ONLY what the user requested — nothing more
- Follow existing codebase conventions and patterns
- Do NOT commit, push, or create pull requests
- Do NOT modify any spec YAML files
- Keep changes focused and minimal`);

  return sections.join('\n\n');
}
