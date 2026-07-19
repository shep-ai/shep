import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const E2E_SHEP_HOME = 'SHEP_E2E_ISOLATED_HOME';

export function hasAssignedE2eShepHome(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[E2E_SHEP_HOME]);
}

/**
 * Assigns one isolated SHEP_HOME to the entire Playwright run.
 *
 * Playwright evaluates its config in the runner, setup, and worker processes.
 * Those child processes inherit this marker, so they must reuse the first
 * directory instead of deriving another directory from their own PID.
 */
export function resolveE2eShepHome(
  env: NodeJS.ProcessEnv = process.env,
  pid = process.pid,
  tempDirectory = tmpdir()
): string {
  const inheritedHome = env[E2E_SHEP_HOME];
  if (inheritedHome) {
    env.SHEP_HOME = inheritedHome;
    return inheritedHome;
  }

  const isolatedHome = join(tempDirectory, `shep-e2e-web-${pid}`);
  env[E2E_SHEP_HOME] = isolatedHome;
  env.SHEP_HOME = isolatedHome;
  return isolatedHome;
}

/** Removes only a directory that this E2E run marked as its own. */
export function cleanupE2eShepHome(env: NodeJS.ProcessEnv = process.env): void {
  const isolatedHome = env[E2E_SHEP_HOME];
  if (!isolatedHome) return;

  rmSync(isolatedHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  if (env.SHEP_HOME === isolatedHome) delete env.SHEP_HOME;
  delete env[E2E_SHEP_HOME];
}

/** Schedules cleanup in the owner process, after Playwright stops its web server. */
export function cleanupE2eShepHomeOnExit(env: NodeJS.ProcessEnv = process.env): void {
  process.once('exit', () => {
    try {
      cleanupE2eShepHome(env);
    } catch {
      // The test result must not be replaced by a best-effort temp cleanup error.
    }
  });
}
