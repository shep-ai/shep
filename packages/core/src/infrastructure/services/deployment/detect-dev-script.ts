/**
 * Detect Dev Script — composition layer over the ecosystem detector registry.
 *
 * Per-ecosystem logic lives in `detectors/`; this module owns the walk (the
 * given directory, then one level of subdirectories) and exposes TWO
 * projections over ONE registry walk:
 *
 * - {@link detectRunPlan} — rich. Carries the WINNING detector's identity
 *   beside the result so the analyze node can name the tier in the deployment
 *   log stream (NFR-11) and persist `language`/`framework`/`expectedPort`/
 *   `setupCommands` on a Deterministic plan.
 * - {@link detectDevScript} — the historical shape, returned verbatim, for
 *   `deployment-spawner.spawnFromDetection`.
 *
 * That split is not duplication: two consumers that both already exist need
 * different things, and returning provenance BESIDE the result rather than
 * INSIDE it is what keeps the pinned `detect-dev-script.test.ts` assertions
 * byte-identical. That suite is the strongest guard this feature has against
 * silently changing what an existing repository starts (NFR-5).
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from './deployment-logger.js';
import {
  DETECTOR_REGISTRY,
  Ecosystem,
  MAX_SCANNED_SUBDIRS,
  isSkippedDir,
} from './detectors/registry.js';
import type { DetectorError, DetectorResult, DetectorSuccess } from './detectors/types.js';

export type DetectDevScriptSuccess = DetectorSuccess;
export type DetectDevScriptError = DetectorError;
export type DetectDevScriptResult = DetectorResult;

/** A detection result together with the detector that produced it. */
export interface DetectionOutcome {
  /** The winning ecosystem, or the one whose error is being reported. */
  ecosystem: Ecosystem;
  result: DetectorResult;
}

const log = createDeploymentLogger('[detectDevScript]');

/**
 * Resolve a dev command for a project directory, with detector provenance.
 *
 * @param dirPath - Absolute path to the project directory.
 * @returns The winning ecosystem and its result. On total fall-through, the
 *          Node detector's error for the given directory — so the message the
 *          user sees stays the one they have always seen.
 */
export function detectRunPlan(dirPath: string): DetectionOutcome {
  log.info(`scanning dirPath="${dirPath}"`);

  // Try the given directory first
  const direct = detectInDir(dirPath);
  if (direct.result.success) {
    log.info(`detector "${direct.ecosystem}" won in "${dirPath}"`);
    return direct;
  }

  // Fallback: scan immediate subdirectories. This handles monorepos and
  // projects where the app lives in a subdirectory (e.g., the worktree root
  // has no manifest but `site/` or `app/` does), and it applies to EVERY
  // ecosystem, not just Node (FR-7).
  log.info(`no dev command at root, scanning subdirectories of "${dirPath}"`);
  const nested = scanSubdirectories(dirPath);
  if (nested) return nested;

  return direct;
}

/**
 * Detect the dev script and package manager for a project directory.
 *
 * @param dirPath - Absolute path to the project directory
 * @returns Detection result with command info, or an error
 */
export function detectDevScript(dirPath: string): DetectDevScriptResult {
  return detectRunPlan(dirPath).result;
}

/**
 * Walk the ordered registry against a single directory, first success wins.
 *
 * On total fall-through the NODE detector's error is returned: it is the
 * message every existing caller and test already expects, and it is the most
 * actionable one for the overwhelmingly common case.
 */
function detectInDir(dirPath: string): DetectionOutcome {
  let fallThrough: DetectorError = {
    success: false,
    error: `No dev server detected in ${dirPath}`,
  };

  for (const { ecosystem, detect } of DETECTOR_REGISTRY) {
    const result = detect(dirPath);
    if (result.success) return { ecosystem, result };
    if (ecosystem === Ecosystem.Node) fallThrough = result;
  }

  return { ecosystem: Ecosystem.Node, result: fallThrough };
}

/**
 * Scan immediate subdirectories for a detectable project.
 *
 * Skips hidden dirs, node_modules and common build output, and stops after
 * MAX_SCANNED_SUBDIRS entries so a wide repository root cannot turn detection
 * into a filesystem sweep. Truncation is logged — a silently dropped
 * directory reads as "we looked everywhere" when we did not.
 */
function scanSubdirectories(dirPath: string): DetectionOutcome | null {
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return null;
  }

  const candidates = entries.filter((entry) => !isSkippedDir(entry));
  if (candidates.length > MAX_SCANNED_SUBDIRS) {
    log.warn(
      `"${dirPath}" has ${candidates.length} candidate subdirectories — scanning only the first ${MAX_SCANNED_SUBDIRS}`
    );
  }

  for (const entry of candidates.slice(0, MAX_SCANNED_SUBDIRS)) {
    const subPath = join(dirPath, entry);
    try {
      if (!statSync(subPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const outcome = detectInDir(subPath);
    if (outcome.result.success) {
      log.info(
        `detector "${outcome.ecosystem}" won in subdirectory "${entry}" — resolvedDir="${subPath}"`
      );
      return outcome;
    }
  }

  return null;
}
