/**
 * Evidence Output Parser
 *
 * Extracts structured Evidence records from free-form agent text output.
 * Looks for a fenced JSON code block containing an array of evidence objects.
 * Returns empty array gracefully on any parsing failure.
 *
 * Also provides validation to ensure UI-related evidence includes app-level
 * proof (not just Storybook screenshots), evidence completeness by task type,
 * and file existence verification.
 */

import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Evidence } from '../../../../../domain/generated/output.js';
import { EvidenceType } from '../../../../../domain/generated/output.js';

// Matches a fenced JSON code block: ```json ... ```
const JSON_BLOCK_RE = /```json\s*\n([\s\S]*?)\n\s*```/;

const VALID_EVIDENCE_TYPES = new Set<string>(Object.values(EvidenceType));

function isValidRecord(record: unknown): record is Evidence {
  if (record === null || typeof record !== 'object') return false;

  const r = record as Record<string, unknown>;

  if (typeof r.type !== 'string' || !VALID_EVIDENCE_TYPES.has(r.type)) return false;
  if (typeof r.capturedAt !== 'string') return false;
  if (typeof r.description !== 'string') return false;
  if (typeof r.relativePath !== 'string') return false;

  // Block path traversal
  if (r.relativePath.includes('..')) return false;

  return true;
}

/**
 * Extract Evidence records from agent text output.
 * Looks for a fenced JSON code block containing a JSON array of evidence objects.
 * Returns empty array when no block found, JSON is malformed, or no valid records exist.
 */
export function parseEvidenceRecords(output: string): Evidence[] {
  const match = output.match(JSON_BLOCK_RE);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isValidRecord);
}

/**
 * Patterns that indicate a screenshot is from Storybook rather than the actual app.
 * Checked case-insensitively against description and relativePath.
 */
const STORYBOOK_PATTERNS = [/storybook/i, /story\b/i, /stories/i, /\b6006\b/];

/**
 * Patterns that indicate a screenshot is from the actual running application.
 * Checked case-insensitively against description and relativePath.
 */
const APP_PROOF_PATTERNS = [/\bapp[:\-\s]/i, /dev\s*server/i, /running\s*app/i, /actual\s*app/i];

function isScreenshot(e: Evidence): boolean {
  return e.type === EvidenceType.Screenshot || e.type === EvidenceType.Video;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function isStorybookEvidence(e: Evidence): boolean {
  return (
    matchesAny(e.description, STORYBOOK_PATTERNS) || matchesAny(e.relativePath, STORYBOOK_PATTERNS)
  );
}

function isAppEvidence(e: Evidence): boolean {
  // Explicitly marked as app-level evidence
  if (
    matchesAny(e.description, APP_PROOF_PATTERNS) ||
    matchesAny(e.relativePath, APP_PROOF_PATTERNS)
  ) {
    return true;
  }
  // A screenshot that is NOT storybook is treated as app-level evidence
  return !isStorybookEvidence(e);
}

export interface UiEvidenceValidationResult {
  valid: boolean;
  hasScreenshots: boolean;
  hasAppScreenshots: boolean;
  hasOnlyStorybookScreenshots: boolean;
  warnings: string[];
}

/**
 * Validate that UI-related evidence includes app-level proof, not just Storybook screenshots.
 *
 * Returns a validation result indicating whether the evidence set meets the requirement
 * for app-level proof. Screenshots/videos are considered "Storybook-only" if their
 * description or path contains storybook-related keywords and NO screenshots have
 * app-level indicators.
 *
 * This validation is informational — it produces warnings but does not filter out records.
 */
export function validateUiEvidenceHasAppProof(evidence: Evidence[]): UiEvidenceValidationResult {
  const screenshots = evidence.filter(isScreenshot);
  const warnings: string[] = [];

  if (screenshots.length === 0) {
    return {
      valid: true,
      hasScreenshots: false,
      hasAppScreenshots: false,
      hasOnlyStorybookScreenshots: false,
      warnings,
    };
  }

  const appScreenshots = screenshots.filter(isAppEvidence);
  const storybookScreenshots = screenshots.filter(isStorybookEvidence);
  const hasOnlyStorybook = storybookScreenshots.length > 0 && appScreenshots.length === 0;

  if (hasOnlyStorybook) {
    warnings.push(
      'UI evidence contains only Storybook screenshots. App-level screenshots from the running application are REQUIRED for UI features.'
    );
  }

  if (screenshots.length > 0 && appScreenshots.length === 0 && storybookScreenshots.length === 0) {
    // Screenshots exist but none clearly identified as app or storybook — warn to be explicit
    warnings.push(
      'UI screenshots lack clear app-level indicators. Include "app" in the description or filename to confirm they are from the actual running application.'
    );
  }

  return {
    valid: !hasOnlyStorybook,
    hasScreenshots: screenshots.length > 0,
    hasAppScreenshots: appScreenshots.length > 0,
    hasOnlyStorybookScreenshots: hasOnlyStorybook,
    warnings,
  };
}

// =====================================================================
// Evidence Validation — Task Type Inference & Completeness
// =====================================================================

/** Minimal task shape needed for evidence validation (subset of PhaseTask). */
export interface TaskForValidation {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  tdd: { red: string[]; green: string[]; refactor: string[] } | null;
}

export type TaskType = 'ui' | 'test' | 'cli';

export interface ValidationError {
  type: 'ui' | 'completeness' | 'fileExistence';
  taskId?: string;
  taskTitle?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Keyword patterns for task type inference (compiled once at module level)
const UI_KEYWORDS = /\b(component|ui|page|style|layout|markup|visual)\b/i;
const TEST_KEYWORDS = /\b(tests?|specs?|unit tests?|integration tests?)\b/i;
const CLI_KEYWORDS = /\b(cli|command|terminal|shell)\b/i;

/**
 * Infer task types from a task's description, acceptance criteria, and tdd field.
 * Returns an array of inferred types. Tasks can have multiple types.
 * Tasks without clear signals return an empty array (no completeness requirement).
 */
export function inferTaskTypes(task: TaskForValidation): TaskType[] {
  const types = new Set<TaskType>();
  const textSources = [task.description, ...task.acceptanceCriteria];
  const combined = textSources.join(' ');

  if (UI_KEYWORDS.test(combined)) {
    types.add('ui');
  }

  if (TEST_KEYWORDS.test(combined) || task.tdd !== null) {
    types.add('test');
  }

  if (CLI_KEYWORDS.test(combined)) {
    types.add('cli');
  }

  return [...types];
}

/**
 * Validate evidence completeness against task requirements.
 * Checks three dimensions:
 * 1. UI tasks have app-level screenshots (not just Storybook)
 * 2. Test tasks have TestOutput evidence
 * 3. CLI tasks have TerminalRecording evidence
 *
 * Pure function — no side effects, no I/O.
 */
export function validateEvidenceCompleteness(
  evidence: Evidence[],
  tasks: TaskForValidation[]
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const task of tasks) {
    const types = inferTaskTypes(task);

    if (types.includes('ui')) {
      // Check for app-level screenshots (not just Storybook)
      const screenshots = evidence.filter(isScreenshot);
      const appScreenshots = screenshots.filter(isAppEvidence);
      if (appScreenshots.length === 0) {
        errors.push({
          type: 'ui',
          taskId: task.id,
          taskTitle: task.title,
          message: `Missing app-level screenshot for ${task.id} (UI task '${task.title}'). Storybook-only screenshots are insufficient.`,
        });
      }
    }

    if (types.includes('test')) {
      const hasTestOutput = evidence.some((e) => e.type === EvidenceType.TestOutput);
      if (!hasTestOutput) {
        errors.push({
          type: 'completeness',
          taskId: task.id,
          taskTitle: task.title,
          message: `No TestOutput evidence for ${task.id} (test task '${task.title}'). Test results are required.`,
        });
      }
    }

    if (types.includes('cli')) {
      const hasTerminalRecording = evidence.some((e) => e.type === EvidenceType.TerminalRecording);
      if (!hasTerminalRecording) {
        errors.push({
          type: 'completeness',
          taskId: task.id,
          taskTitle: task.title,
          message: `No TerminalRecording evidence for ${task.id} (CLI task '${task.title}'). Terminal output is required.`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Resolve an Evidence record's path to something `stat` can trust.
 *
 * Records carry either a repo-relative path (`specs/<slug>/evidence/x.png`,
 * used when evidence is committed) or an absolute shep-home path (used when it
 * is not). Relative paths MUST be resolved against the directory the agent
 * actually ran in — the worktree — because the host daemon's `process.cwd()` is
 * an unrelated directory, and resolving there reports every committed file as
 * missing.
 */
function resolveEvidencePath(relativePath: string, baseDir?: string): string {
  if (isAbsolute(relativePath)) return relativePath;
  return baseDir ? resolve(baseDir, relativePath) : relativePath;
}

/**
 * Verify that each Evidence record's file exists on disk with non-zero size.
 * Returns an array of error messages for missing or empty files.
 * Never throws — all errors are caught and returned as strings (NFR-10).
 *
 * @param baseDir Directory that repo-relative paths resolve against (the
 *   agent's worktree). Omitted only by legacy callers, which keep the previous
 *   `process.cwd()` behaviour.
 */
export async function validateFileExistence(
  evidence: Evidence[],
  baseDir?: string
): Promise<string[]> {
  if (evidence.length === 0) return [];

  const results = await Promise.all(
    evidence.map(async (e) => {
      try {
        const stats = await stat(resolveEvidencePath(e.relativePath, baseDir));
        if (stats.size === 0) {
          return `Evidence file has zero size: ${e.relativePath} (${e.description})`;
        }
        return null;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return `Evidence file not found: ${e.relativePath} (${e.description})`;
        }
        if (code === 'EACCES') {
          return `Evidence file not accessible (permission denied): ${e.relativePath} (${e.description})`;
        }
        return `Evidence file error: ${e.relativePath} (${e.description}) — ${err instanceof Error ? err.message : String(err)}`;
      }
    })
  );

  return results.filter((r): r is string => r !== null);
}

/**
 * Full validation pipeline: runs completeness checks and file existence checks,
 * returns a unified ValidationResult with all detected issues.
 */
export async function validateEvidence(
  evidence: Evidence[],
  tasks: TaskForValidation[],
  baseDir?: string
): Promise<ValidationResult> {
  const completenessResult = validateEvidenceCompleteness(evidence, tasks);
  const fileErrors = await validateFileExistence(evidence, baseDir);

  const fileValidationErrors: ValidationError[] = fileErrors.map((msg) => ({
    type: 'fileExistence' as const,
    message: msg,
  }));

  const allErrors = [...completenessResult.errors, ...fileValidationErrors];
  return { valid: allErrors.length === 0, errors: allErrors };
}
