/**
 * Detect Dev Script
 *
 * Pure utility that reads package.json from a directory, scans for common dev
 * scripts (dev, start, serve), and detects the package manager from lockfile
 * presence. Returns the detected command or an error.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from './deployment-logger.js';

/** Script names to search for, in priority order */
const SCRIPT_PRIORITY = ['dev', 'start', 'serve'] as const;

/** Lockfile-to-package-manager mapping, checked in order.
 *  Bun is listed first — the application-creation workflow scaffolds
 *  every new project via `bunx shadcn@latest init` which writes a
 *  `bun.lock[b]` file, and those projects MUST keep using bun for
 *  dev/build so the preview pane matches what the agent built with. */
const LOCKFILE_MANAGERS = [
  { lockfile: 'bun.lock', manager: 'bun' },
  { lockfile: 'bun.lockb', manager: 'bun' },
  { lockfile: 'pnpm-lock.yaml', manager: 'pnpm' },
  { lockfile: 'yarn.lock', manager: 'yarn' },
  { lockfile: 'package-lock.json', manager: 'npm' },
] as const;

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
  // Read and parse package.json
  let packageJson: { scripts?: Record<string, string> };
  try {
    const raw = readFileSync(join(dirPath, 'package.json'), 'utf-8');
    packageJson = JSON.parse(raw);
  } catch (err) {
    const msg = `No package.json found in ${dirPath}`;
    log.error(msg, err);
    return { success: false, error: msg };
  }

  // Find the first matching script in priority order
  const scripts = packageJson.scripts ?? {};
  const availableScripts = Object.keys(scripts);
  log.info(
    `available scripts: [${availableScripts.join(', ')}], looking for: [${SCRIPT_PRIORITY.join(', ')}]`
  );

  const scriptName = SCRIPT_PRIORITY.find((name) => name in scripts);
  if (!scriptName) {
    const msg = `No dev script found in package.json. Expected one of: ${SCRIPT_PRIORITY.join(', ')}`;
    log.warn(msg);
    return { success: false, error: msg };
  }

  // Detect package manager from lockfile
  const packageManager = detectPackageManager(dirPath);

  // Build the command — pnpm/yarn use `<pm> <script>`; npm and bun both
  // need the explicit `run` prefix (`bun <script>` without `run` would
  // try to execute a binary named `<script>` instead of the package.json
  // script).
  const command =
    packageManager === 'npm' || packageManager === 'bun'
      ? `${packageManager} run ${scriptName}`
      : `${packageManager} ${scriptName}`;

  const needsInstall = !existsSync(join(dirPath, 'node_modules'));
  log.info(
    `detected — packageManager="${packageManager}", scriptName="${scriptName}", command="${command}", needsInstall=${needsInstall}, resolvedDir="${dirPath}"`
  );
  return { success: true, packageManager, scriptName, command, needsInstall, resolvedDir: dirPath };
}

/**
 * Scan immediate subdirectories for a package.json with a dev script.
 * Skips hidden dirs, node_modules, and common non-project directories.
 */
function scanSubdirectories(dirPath: string): DetectDevScriptSuccess | null {
  const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.cache']);

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;

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

/**
 * Detect the package manager by checking for lockfile presence.
 */
function detectPackageManager(dirPath: string): string {
  for (const { lockfile, manager } of LOCKFILE_MANAGERS) {
    if (existsSync(join(dirPath, lockfile))) {
      return manager;
    }
  }
  return 'npm';
}
