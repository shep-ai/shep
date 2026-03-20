/**
 * Coasts Dev Server Startup & Shutdown
 *
 * Extracted from dev-server.ts for testability. Provides the Coasts startup
 * sequence (prerequisite checks, Coastfile existence check, build, run) and
 * graceful shutdown logic.
 *
 * All log messages use [dev-server:coasts] prefix per NFR-10.
 */

/* eslint-disable no-console */

import type {
  ICoastsService,
  CoastInstance,
} from '@shepai/core/application/ports/output/services/coasts-service.interface';

/**
 * Start the dev server in Coasts mode.
 *
 * Sequence:
 * 1. Check prerequisites (coast binary, Docker, coastd daemon)
 * 2. Check for Coastfile — fail if missing
 * 3. Build the coast container image
 * 4. Run the coast instance
 *
 * @param coastsService - Resolved ICoastsService from the DI container
 * @param workDir - Working directory (repo/worktree root)
 * @returns The running CoastInstance with port and URL
 * @throws Error if prerequisites are not met or any step fails
 */
export async function startCoastsDevServer(
  coastsService: ICoastsService,
  workDir: string
): Promise<CoastInstance> {
  // Step 1: Check prerequisites
  console.log('[dev-server:coasts] Checking prerequisites...');
  const prereqs = await coastsService.checkPrerequisites(workDir);

  if (!prereqs.allMet) {
    const messages = prereqs.missingMessages.map((m) => `  - ${m}`).join('\n');
    throw new Error(`[dev-server:coasts] Prerequisites not met:\n${messages}`);
  }
  console.log('[dev-server:coasts] All prerequisites met.');

  // Step 2: Check for Coastfile — fail if missing (generate on-demand via CLI or web UI)
  const hasCoastfile = await coastsService.hasCoastfile(workDir);
  if (!hasCoastfile) {
    throw new Error(
      `[dev-server:coasts] No Coastfile found in ${workDir} (expected: Coastfile).\n` +
        'Generate one with:\n' +
        '  - CLI:    shep coasts init\n' +
        '  - Web UI: Use the "Generate Coastfile" button on the repository node'
    );
  }

  // Step 3: Build the coast container image
  console.log('[dev-server:coasts] Building coast container...');
  await coastsService.build(workDir);
  console.log('[dev-server:coasts] Build complete.');

  // Step 4: Run the coast instance
  console.log('[dev-server:coasts] Starting coast instance...');
  const instance = await coastsService.run(workDir);
  console.log(`[dev-server:coasts] Ready at ${instance.url}`);

  return instance;
}

/**
 * Gracefully shut down the Coasts instance.
 * Catches and logs errors to prevent shutdown failures.
 *
 * @param coastsService - The ICoastsService instance, or null if not in Coasts mode
 * @param workDir - Working directory for the coast instance
 */
export async function shutdownCoasts(
  coastsService: ICoastsService | null,
  workDir: string
): Promise<void> {
  if (!coastsService) return;

  try {
    console.log('[dev-server:coasts] Stopping coast instance...');
    await coastsService.stop(workDir);
    console.log('[dev-server:coasts] Coast instance stopped.');
  } catch (error) {
    console.warn('[dev-server:coasts] Failed to stop coast instance:', error);
  }
}
