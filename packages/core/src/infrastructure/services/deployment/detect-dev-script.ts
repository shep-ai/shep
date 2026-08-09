/**
 * Detect Dev Script
 *
 * Composition layer over the ecosystem detector registry. The per-ecosystem
 * logic lives in `detectors/`; this module owns the walk (root directory, then
 * one level of subdirectories) and the public result shape.
 *
 * NOTE: this file currently composes only the Node detector. The ordered
 * registry walk and the rich `detectRunPlan` projection land with the registry
 * composition task.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from './deployment-logger.js';
import { isSkippedDir } from './detectors/registry.js';
import { detectNode } from './detectors/node.detector.js';

export interface DetectDevScriptSuccess {
  success: true;
  packageManager: string;
  scriptName: string;
  command: string;
  needsInstall: boolean;
  /** The directory where package.json was found (may differ from input when scanning subdirs) */
  resolvedDir: string;
}

export interface DetectDevScriptError {
  success: false;
  error: string;
}

export type DetectDevScriptResult = DetectDevScriptSuccess | DetectDevScriptError;

const log = createDeploymentLogger('[detectDevScript]');

/**
 * Detect the dev script and package manager for a project directory.
 *
 * @param dirPath - Absolute path to the project directory
 * @returns Detection result with command info, or an error
 */
export function detectDevScript(dirPath: string): DetectDevScriptResult {
  log.info(`scanning dirPath="${dirPath}"`);

  // Try the given directory first
  const directResult = detectDevScriptInDir(dirPath);
  if (directResult.success) return directResult;

  // Fallback: scan immediate subdirectories for a package.json with a dev script.
  // This handles monorepos and projects where the app lives in a subdirectory
  // (e.g., worktree root has no package.json but `site/` or `app/` does).
  log.info(`no dev script at root, scanning subdirectories of "${dirPath}"`);
  const subdirResult = scanSubdirectories(dirPath);
  if (subdirResult) return subdirResult;

  return directResult;
}

/**
 * Attempt detection in a single directory.
 */
function detectDevScriptInDir(dirPath: string): DetectDevScriptResult {
  const result = detectNode(dirPath);
  if (!result.success) return result;

  return {
    success: true,
    packageManager: result.packageManager as string,
    scriptName: result.scriptName as string,
    command: result.command,
    needsInstall: result.needsInstall,
    resolvedDir: result.resolvedDir,
  };
}

/**
 * Scan immediate subdirectories for a package.json with a dev script.
 * Skips hidden dirs, node_modules, and common non-project directories.
 */
function scanSubdirectories(dirPath: string): DetectDevScriptSuccess | null {
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (isSkippedDir(entry)) continue;

    const subPath = join(dirPath, entry);
    try {
      if (!statSync(subPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const result = detectDevScriptInDir(subPath);
    if (result.success) {
      log.info(`found dev script in subdirectory "${entry}" — resolvedDir="${subPath}"`);
      return result;
    }
  }

  return null;
}
