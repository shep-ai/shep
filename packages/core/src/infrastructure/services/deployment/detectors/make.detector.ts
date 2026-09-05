/**
 * Make detector — a `dev`/`start`/`serve`/`run` target in a Makefile.
 *
 * A hand-written Make target is a strong statement of author intent, so this
 * detector sits directly after Node/Deno in the registry. It is a
 * line-anchored scan, never a Make parser: a target rule must begin at column
 * zero, which is exactly what distinguishes it from a recipe body (tab
 * indented) and from a word appearing mid-line.
 */

import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';

/**
 * Makefile names GNU Make itself resolves, in order.
 *
 * All three are checked because casing varies by project; on a
 * case-insensitive filesystem the first hit simply answers for all of them.
 */
const MAKEFILE_NAMES = ['Makefile', 'makefile', 'GNUmakefile'] as const;

/** Target names to look for, in priority order. */
const TARGET_PRIORITY = ['dev', 'start', 'serve', 'run'] as const;

/**
 * A target rule: a name at column zero followed by `:`.
 *
 * - Anchored at column zero, so tab-indented recipe lines never match.
 * - `(?!=)` rejects `dev := something`, which is a variable assignment.
 * - The captured name is compared against TARGET_PRIORITY, so `.PHONY: dev`
 *   contributes the name `.PHONY` and is correctly ignored.
 */
const TARGET_RULE = /^([A-Za-z0-9._%/-]+)\s*:(?!=)/;

const log = createDeploymentLogger('[detectMake]');

/**
 * Detect a Make dev target.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `make <target>` for the highest-priority declared target, or a
 *          fall-through error.
 */
export const detectMake: Detector = (dirPath: string): DetectorResult => {
  const manifestPath = findManifest(dirPath, MAKEFILE_NAMES);
  if (manifestPath === null) {
    return { success: false, error: `No Makefile found in ${dirPath}` };
  }

  const contents = readManifest(manifestPath);
  if (contents === null) {
    log.warn(`could not read ${manifestPath} — falling through`);
    return { success: false, error: `Could not read ${manifestPath}` };
  }

  const targets = collectTargets(contents);
  const target = TARGET_PRIORITY.find((name) => targets.has(name));
  if (!target) {
    return {
      success: false,
      error: `No dev target found in Makefile. Expected one of: ${TARGET_PRIORITY.join(', ')}`,
    };
  }

  const command = `make ${target}`;
  log.info(`detected — command="${command}", resolvedDir="${dirPath}"`);

  return {
    success: true,
    scriptName: target,
    command,
    // Make targets declare their own prerequisites; there is no separate
    // dependency directory whose absence means "not installed".
    needsInstall: false,
    resolvedDir: dirPath,
    runtime: 'make',
  };
};

/** Collect every target name declared at column zero. */
function collectTargets(contents: string): Set<string> {
  const targets = new Set<string>();

  for (const line of contents.split('\n')) {
    const match = TARGET_RULE.exec(line);
    if (match) targets.add(match[1]);
  }

  return targets;
}
