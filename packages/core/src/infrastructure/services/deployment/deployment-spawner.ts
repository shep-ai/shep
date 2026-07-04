/**
 * Spawn helpers for dev server processes.
 *
 * Two paths:
 * - Run plan: spawn the plan's full shell command verbatim in its cwd.
 * - Detection: detect the dev script from package.json and spawn it via the
 *   detected package manager.
 *
 * Neither path installs dependencies — installation is the dev-server-agent
 * graph's job (spec 103).
 */

import type { ChildProcess, SpawnOptions } from 'node:child_process';
import type { RunPlanOverride } from '@/application/ports/output/services/deployment-service.interface.js';
import { buildDevServerEnv } from './dev-server-env.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { IS_WINDOWS } from '../../platform.js';
import type { DeploymentServiceDeps } from './deployment-service-deps.js';

const log = createDeploymentLogger('[DeploymentService]');

type SpawnDeps = Pick<DeploymentServiceDeps, 'spawn' | 'detectDevScript'>;

/**
 * Common spawn options for dev server processes.
 *
 * - shell: true — run plans are full shell command strings.
 * - On Unix, detached: true creates a process group via setsid() so we can
 *   kill the entire tree with process.kill(-pid). On Windows this flag causes
 *   CREATE_NEW_CONSOLE which opens a visible terminal window and disconnects
 *   stdout/stderr — we don't need it because taskkill /F /T handles tree kill.
 * - buildDevServerEnv strips cli-only vars (NEXT_ASSET_PREFIX, PORT,
 *   Anthropic creds) so user dev servers don't inherit them — chiefly
 *   NEXT_ASSET_PREFIX=/cli, which otherwise makes a user's Next.js app emit
 *   /cli/_next/... asset URLs that 404 on the preview origin. Overrides
 *   (SHEP_SKIP_RECOVERY + any runPlan.env) are applied AFTER the scrub.
 *   SHEP_SKIP_RECOVERY prevents child shep instances (e.g. worktree dev
 *   servers) from running recoverAll() on the shared ~/.shep/data DB and
 *   killing our processes.
 */
function buildSpawnOptions(cwd: string, envOverrides: Record<string, string>): SpawnOptions {
  return {
    shell: true,
    cwd,
    ...(IS_WINDOWS ? { windowsHide: true } : { detached: true }),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildDevServerEnv(process.env, { SHEP_SKIP_RECOVERY: '1', ...envOverrides }),
  };
}

/** Spawn an explicit run-plan command verbatim (no detection, no install). */
export function spawnFromRunPlan(deps: SpawnDeps, runPlan: RunPlanOverride): ChildProcess {
  log.info(`Spawning dev server from run plan: command="${runPlan.command}", cwd="${runPlan.cwd}"`);
  return deps.spawn(runPlan.command, buildSpawnOptions(runPlan.cwd, runPlan.env ?? {}));
}

/**
 * Detect the dev script from package.json and spawn it.
 * @throws Error when detection fails.
 */
export function spawnFromDetection(deps: SpawnDeps, targetPath: string): ChildProcess {
  const detection = deps.detectDevScript(targetPath);
  if (!detection.success) {
    log.error(`Dev script detection failed: ${detection.error}`);
    throw new Error(detection.error);
  }

  const { packageManager, scriptName, command, resolvedDir } = detection;
  // `bun <script>` resolves to the binary `<script>` on PATH; to run
  // the package.json script we need `bun run <script>` — same shape
  // as npm. pnpm/yarn accept the script name directly.
  const args =
    packageManager === 'npm' || packageManager === 'bun' ? ['run', scriptName] : [scriptName];

  log.info(
    `Spawning dev server: command="${command}", packageManager="${packageManager}", scriptName="${scriptName}", cwd="${resolvedDir}"`
  );

  return deps.spawn(packageManager, args, buildSpawnOptions(resolvedDir, {}));
}
