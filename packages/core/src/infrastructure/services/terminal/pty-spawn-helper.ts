/**
 * node-pty 1.1.0 ships its macOS `spawn-helper` binary without the execute bit
 * (microsoft/node-pty#919) and npm preserves the mode as published, so every
 * terminal spawn on a global install fails with a bare `posix_spawnp failed.`.
 * Restoring the bit before the first spawn makes the terminal work regardless
 * of how the package was installed.
 */
import { chmodSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SPAWN_HELPER = 'spawn-helper';
const EXEC_BITS = 0o111;
const EXECUTABLE_MODE = 0o755;
const POSIX_SPAWN_FAILURE = 'posix_spawnp failed';

/**
 * Make node-pty's `spawn-helper` executable. Best-effort: a read-only install
 * or a package without a helper (Linux, Windows) must never break the terminal.
 */
export function ensureSpawnHelperExecutable(
  packageDir: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): void {
  const candidates = [
    join(packageDir, 'prebuilds', `${platform}-${arch}`, SPAWN_HELPER),
    join(packageDir, 'build', 'Release', SPAWN_HELPER),
  ];
  for (const helper of candidates) {
    try {
      if (existsSync(helper) && (statSync(helper).mode & EXEC_BITS) === 0) {
        chmodSync(helper, EXECUTABLE_MODE);
      }
    } catch {
      // Read-only filesystem: the spawn error below carries the manual fix.
    }
  }
}

/** Turn node-pty's opaque spawn failure into one the user can act on. */
export function explainSpawnError(message: string): string {
  if (!message.includes(POSIX_SPAWN_FAILURE)) return message;
  return `${message} node-pty's ${SPAWN_HELPER} binary is probably not executable; run: chmod +x <node-pty>/prebuilds/*/${SPAWN_HELPER}`;
}
