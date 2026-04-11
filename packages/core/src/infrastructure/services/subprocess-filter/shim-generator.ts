/**
 * Shim generator — creates a per-worker temp directory containing
 * wrapper scripts that shadow real commands (git, npm, pnpm, yarn)
 * and pipe their output through shep-filter.
 *
 * The temp directory is prepended to PATH in the subprocess env so
 * that when Claude Code's Bash tool runs `git status`, it hits our
 * wrapper first. The wrapper:
 *
 * 1. Sets SHEP_FILTER_SHIM_DIR so shep-filter can skip our dir when
 *    resolving the real binary
 * 2. Calls `node <path-to-shep-filter.js> <command> "$@"`
 * 3. Exits with shep-filter's exit code
 *
 * On macOS/Linux the wrappers are bash scripts with +x.
 * On Windows they are .cmd files (not yet implemented — TODO).
 */

import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Commands we generate shims for. */
const SHIMMED_COMMANDS = ['git', 'npm', 'pnpm', 'yarn'] as const;

export interface ShimDirectory {
  /** Absolute path to the temp directory containing the shim scripts. */
  path: string;
  /** The commands that have shims in this directory. */
  commands: readonly string[];
}

/**
 * Create a temp directory with shim scripts for all supported commands.
 *
 * @param shepFilterPath - Absolute path to the compiled shep-filter.js
 * @returns The shim directory info needed for PATH prepending
 */
export function createShimDirectory(shepFilterPath: string): ShimDirectory {
  const shimDir = mkdtempSync(join(tmpdir(), 'shep-filter-'));

  for (const cmd of SHIMMED_COMMANDS) {
    const shimPath = join(shimDir, cmd);
    const script = [
      '#!/usr/bin/env bash',
      '# Auto-generated shep-filter shim — do not edit',
      `export SHEP_FILTER_SHIM_DIR="${shimDir}"`,
      `exec node "${shepFilterPath}" "${cmd}" "$@"`,
    ].join('\n');

    writeFileSync(shimPath, script, 'utf-8');
    chmodSync(shimPath, 0o755);
  }

  return { path: shimDir, commands: SHIMMED_COMMANDS };
}

/**
 * Build a modified PATH string with the shim directory prepended.
 *
 * @param shimDir - The shim directory path
 * @param originalPath - The original PATH from the environment
 * @returns The new PATH value with shimDir first
 */
export function buildFilteredPath(shimDir: string, originalPath: string): string {
  return `${shimDir}:${originalPath}`;
}
