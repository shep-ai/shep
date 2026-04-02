/**
 * Prototype-Generate Prompt Builder
 *
 * Builds the prompt for exploration mode prototype generation.
 * Emphasizes quick prototyping, minimal scope, and throwaway quality.
 * Includes iteration context (feedback history) for subsequent rounds.
 *
 * The prompt instructs the executor to produce a working prototype that
 * demonstrates the idea — prioritizing concept demonstration over
 * production quality.
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
  if (!specContent) {
    // For exploration mode, also check feature.yaml for the prompt
    const featureContent = readSpecFile(specDir, 'feature.yaml');
    if (!featureContent) return '';
    try {
      const data = yaml.load(featureContent) as Record<string, unknown>;
      const userQuery = data?.userQuery ?? (data?.feature as Record<string, unknown>)?.description;
      if (typeof userQuery === 'string' && userQuery.trim()) {
        return userQuery.trim();
      }
    } catch {
      // Fall through
    }
    return featureContent;
  }

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

/** Maximum number of recent feedback entries to include in full detail. */
const MAX_FULL_FEEDBACK_ENTRIES = 3;

/**
 * Build a feedback history section for the prompt.
 * Recent feedback (last 3) gets full detail; older entries are summarized.
 */
export function buildFeedbackHistorySection(feedbackHistory: string[]): string {
  if (feedbackHistory.length === 0) return '';

  const sections: string[] = [];

  if (feedbackHistory.length > MAX_FULL_FEEDBACK_ENTRIES) {
    const older = feedbackHistory.slice(0, -MAX_FULL_FEEDBACK_ENTRIES);
    sections.push('### Earlier feedback (summarized)');
    older.forEach((fb, i) => {
      // Truncate each older entry to a single line summary
      const summary = fb.length > 100 ? `${fb.slice(0, 100)}...` : fb;
      sections.push(`- Iteration ${i + 1}: ${summary}`);
    });
    sections.push('');
  }

  const recent = feedbackHistory.slice(-MAX_FULL_FEEDBACK_ENTRIES);
  const startIdx = feedbackHistory.length - recent.length;
  sections.push('### Recent feedback (act on these)');
  recent.forEach((fb, i) => {
    sections.push(`**Iteration ${startIdx + i + 1}:** ${fb}`);
  });

  return `## Feedback History\n\n${sections.join('\n')}`;
}

/**
 * Build the prototype-generate prompt.
 *
 * The prompt includes:
 * 1. Exploration mode instructions (speed over quality)
 * 2. User's idea/query
 * 3. Iteration context (feedback history from prior rounds)
 * 4. CLAUDE.md content (if exists)
 * 5. Shallow directory listing
 *
 * Instructs the executor to produce a quick, working prototype.
 */
export function buildPrototypeGeneratePrompt(state: FeatureAgentState): string {
  const cwd = state.worktreePath || state.repositoryPath;
  const userQuery = extractUserQuery(state.specDir);
  const iterationCount = state.iterationCount ?? 0;
  const feedbackHistory = state.feedbackHistory ?? [];

  // Read optional context files
  const claudeMd = readWorktreeFile(cwd, 'CLAUDE.md');
  const dirListing = buildDirectoryListing(cwd);

  const isFirstIteration = iterationCount === 0;

  const sections: string[] = [];

  // Main instruction
  sections.push(`You are a senior software engineer in EXPLORATION MODE — generating a quick prototype.

## Mode: Exploration (Prototype)

**Priority: SPEED over quality. Show the concept, don't build for production.**

- Generate a working prototype that demonstrates the idea
- Keep scope minimal — focus on the core concept
- Skip edge cases, error handling, and production polish
- Write just enough code to show how the idea would work
- This is throwaway code — it will be rewritten if the idea is promoted to a real feature`);

  // User request
  if (isFirstIteration) {
    sections.push(`## User's Idea

${userQuery}`);
  } else {
    sections.push(`## User's Idea (Original)

${userQuery}

## Current Iteration: ${iterationCount + 1}

This is iteration ${iterationCount + 1} of the prototype. Review the feedback below and update the prototype accordingly.`);
  }

  // Feedback history
  const feedbackSection = buildFeedbackHistorySection(feedbackHistory);
  if (feedbackSection) {
    sections.push(feedbackSection);
  }

  // Implementation instructions
  sections.push(`## Implementation Instructions

1. ${isFirstIteration ? 'Create' : 'Update'} the prototype based on ${isFirstIteration ? 'the idea above' : 'the feedback above'}
2. Make the code functional — it should compile and demonstrate the concept
3. Commit your work with a conventional commit message (e.g. \`feat(domain): prototype workspace grouping\`)
4. Do NOT write tests — this is a prototype
5. Do NOT run linters or builds — speed is the priority
6. Do NOT push to remote

## Working Directory

${cwd}`);

  if (claudeMd) {
    sections.push(`## Project Guidelines (CLAUDE.md)

${claudeMd}`);
  }

  if (dirListing && dirListing !== '(unable to list directory)') {
    sections.push(`## Project Structure

\`\`\`
${dirListing}
\`\`\``);
  }

  sections.push(`## Constraints

- SPEED is the priority — generate a working prototype quickly
- Keep changes minimal and focused on demonstrating the concept
- Do NOT modify any spec YAML files
- Do NOT enter plan mode — implement directly
- Do NOT ask questions — make reasonable assumptions and proceed
- You MUST create or modify actual code files — a plan or summary alone is not acceptable`);

  return sections.join('\n\n');
}
