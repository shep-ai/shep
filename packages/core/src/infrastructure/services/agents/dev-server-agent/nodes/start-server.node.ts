/**
 * start_server node — spawn the dev server via DeploymentService with the
 * resolved run-plan override.
 *
 * The node passes the plan VERBATIM to `IDeploymentService.start()` — it
 * never re-detects, rewrites, or augments the command. The exact command is
 * logged before spawning (security requirement: the executed command must be
 * inspectable in the SSE log). A spawn throw becomes a `failureReason` so
 * the graph can route to remediation; success contributes only the log line
 * to `capturedLogs` (verify owns readiness).
 */

import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import type { DevServerAgentNodeFn } from '../types.js';

/** Dependencies for the start_server node. */
export interface StartServerNodeDeps {
  /** Deployment service used to spawn the run plan verbatim. */
  deploymentService: Pick<IDeploymentService, 'start'>;
  /** Live log sink (SSE trail). */
  log: (l: string) => void;
}

/** Build the start_server node from injected dependencies. */
export const createStartServerNode =
  (deps: StartServerNodeDeps): DevServerAgentNodeFn =>
  async (state) => {
    const plan = state.runPlan;
    if (plan === null) {
      const reason = 'No run plan available to start the dev server';
      deps.log(reason);
      return { failureReason: reason };
    }

    // Security requirement: log the exact command verbatim BEFORE spawning
    // so the executed command is always inspectable in the SSE log.
    const commandLine = `starting dev server: ${plan.command} (cwd: ${plan.cwd})`;
    deps.log(commandLine);

    try {
      deps.deploymentService.start(state.targetId, state.targetPath, state.targetType, {
        runPlan: { command: plan.command, cwd: plan.cwd },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = `Failed to spawn dev server: ${message}`;
      deps.log(reason);
      return { failureReason: reason };
    }

    return { capturedLogs: [commandLine] };
  };
