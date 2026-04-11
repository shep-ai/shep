/**
 * Subprocess Filter Context
 *
 * Lazily creates and caches a shim directory for the lifetime of the
 * worker process. The shim dir contains wrapper scripts (git, npm,
 * pnpm, yarn) that pipe command output through shep-filter before
 * returning it to Claude Code.
 *
 * The shim dir is created once on the first call to
 * resolveSubprocessFilterShimDir(true) and reused for all subsequent
 * calls. It's automatically cleaned up when the worker process exits
 * (via process.on('exit')).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { createShimDirectory } from '../../subprocess-filter/shim-generator.js';

let cachedShimDir: string | undefined;

/**
 * Resolve the path to the compiled shep-filter.js entry point.
 * This is relative to the current file's location in the dist tree.
 */
function resolveShepFilterPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  // From dist/.../agents/feature-agent/ → dist/.../subprocess-filter/shep-filter.js
  return join(thisDir, '..', '..', 'subprocess-filter', 'shep-filter.js');
}

/**
 * Resolve the shim directory path, creating it lazily if needed.
 *
 * @param enabled - Whether subprocess filtering is enabled in settings
 * @returns The absolute path to the shim directory, or undefined if disabled
 */
export function resolveSubprocessFilterShimDir(enabled: boolean): string | undefined {
  if (!enabled) return undefined;

  if (!cachedShimDir) {
    const shepFilterPath = resolveShepFilterPath();
    const shim = createShimDirectory(shepFilterPath);
    cachedShimDir = shim.path;

    // Register cleanup on process exit
    process.on('exit', () => {
      try {
        if (cachedShimDir) rmSync(cachedShimDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    });
  }

  return cachedShimDir;
}

/**
 * Clear the cached shim directory. Useful for testing.
 */
export function clearSubprocessFilterContext(): void {
  if (cachedShimDir) {
    try {
      rmSync(cachedShimDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
  cachedShimDir = undefined;
}
