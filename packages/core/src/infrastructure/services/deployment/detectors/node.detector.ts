/**
 * Node detector — `package.json` dev scripts.
 *
 * This is today's `detect-dev-script` logic moved verbatim, and it must stay
 * that way: every repository shep runs right now resolves through this
 * detector, so any change here silently changes what those repositories start.
 * The pinned `detect-dev-script.test.ts` suite is the guard — it asserts whole
 * result objects with `toEqual`, so this detector must NOT populate any field
 * beyond the six it produces today (NFR-5).
 *
 * Unlike every other detector, this one reads `package.json` WITHOUT a
 * stat-before-read gate. That is deliberate and load-bearing: `package.json`
 * is the only manifest whose absence is the chain's terminal error message, so
 * the read failure IS the signal, and the pinned suite drives exactly that
 * path by mocking `readFileSync` to throw.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';

/** Script names to search for, in priority order */
export const SCRIPT_PRIORITY = ['dev', 'start', 'serve'] as const;

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

const log = createDeploymentLogger('[detectNode]');

/**
 * Detect the dev script and package manager for a Node project directory.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns A success carrying `packageManager`, `scriptName`, `command`,
 *          `needsInstall` and `resolvedDir`, or a fall-through error.
 */
export const detectNode: Detector = (dirPath: string): DetectorResult => {
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
};

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
