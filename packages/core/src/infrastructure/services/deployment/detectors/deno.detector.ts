/**
 * Deno detector — `deno.json` / `deno.jsonc` tasks.
 *
 * Deno's task table is the direct analogue of package.json's scripts, so the
 * same `dev` → `start` → `serve` priority applies and the canonical
 * invocation is `deno task <name>`.
 */

import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest } from './shared/manifest-read.js';
import { readJsonManifest } from './shared/json-manifest.js';
import { extractExplicitPort } from './shared/command-port.js';
import { SCRIPT_PRIORITY } from './node.detector.js';

/** Manifest filenames, in the order Deno itself resolves them. */
const DENO_MANIFESTS = ['deno.json', 'deno.jsonc'] as const;

const log = createDeploymentLogger('[detectDeno]');

/**
 * Detect a Deno dev task.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `deno task <name>` for the highest-priority declared task, or a
 *          fall-through error when no manifest or no matching task exists.
 */
export const detectDeno: Detector = (dirPath: string): DetectorResult => {
  const manifestPath = findManifest(dirPath, DENO_MANIFESTS);
  if (manifestPath === null) {
    return { success: false, error: `No deno.json found in ${dirPath}` };
  }

  const manifest = readJsonManifest(manifestPath);
  if (manifest === null) {
    log.warn(`could not parse ${manifestPath} — falling through`);
    return { success: false, error: `Could not parse ${manifestPath}` };
  }

  const tasks = manifest.tasks;
  if (typeof tasks !== 'object' || tasks === null || Array.isArray(tasks)) {
    return { success: false, error: `No tasks declared in ${manifestPath}` };
  }

  const table = tasks as Record<string, unknown>;
  const taskName = SCRIPT_PRIORITY.find((name) => name in table);
  if (!taskName) {
    return {
      success: false,
      error: `No dev task found in deno.json. Expected one of: ${SCRIPT_PRIORITY.join(', ')}`,
    };
  }

  // The port, if any, is declared inside the task's own command — `deno task
  // dev` never carries one itself.
  const definition = table[taskName];
  const expectedPort = typeof definition === 'string' ? extractExplicitPort(definition) : undefined;

  const command = `deno task ${taskName}`;
  log.info(`detected — command="${command}", resolvedDir="${dirPath}"`);

  return {
    success: true,
    packageManager: 'deno',
    scriptName: taskName,
    command,
    // Deno caches dependencies on first run; there is no install directory
    // whose absence would mean "dependencies are missing".
    needsInstall: false,
    resolvedDir: dirPath,
    language: 'TypeScript',
    runtime: 'deno',
    ...(expectedPort !== undefined ? { expectedPort } : {}),
  };
};
