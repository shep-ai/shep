/**
 * Coasts Dev Server Startup & Shutdown
 *
 * Extracted from dev-server.ts for testability. Validates Coasts prerequisites
 * at startup so the UI can offer coasts actions. Build/run/generate are all
 * user-initiated from the Web UI or CLI — nothing happens automatically.
 *
 * All log messages use [dev-server:coasts] prefix per NFR-10.
 */

/* eslint-disable no-console */

import type { ICoastsService } from '@shepai/core/application/ports/output/services/coasts-service.interface';

/**
 * Initialize Coasts mode by validating prerequisites.
 *
 * Only checks that the coast binary, Docker, and coastd daemon are available.
 * Does NOT build, run, or generate anything — all of that is on-demand.
 *
 * @param coastsService - Resolved ICoastsService from the DI container
 * @param workDir - Working directory (repo/worktree root)
 * @throws Error if prerequisites are not met
 */
export async function startCoastsDevServer(
  coastsService: ICoastsService,
  workDir: string
): Promise<void> {
  console.log('[dev-server:coasts] Checking prerequisites...');
  const prereqs = await coastsService.checkPrerequisites(workDir);

  if (!prereqs.allMet) {
    const messages = prereqs.missingMessages.map((m) => `  - ${m}`).join('\n');
    throw new Error(`[dev-server:coasts] Prerequisites not met:\n${messages}`);
  }
  console.log('[dev-server:coasts] All prerequisites met. Build/run available on demand.');
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
