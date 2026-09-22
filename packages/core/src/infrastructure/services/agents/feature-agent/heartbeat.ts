/**
 * Heartbeat context for current-node tracking.
 *
 * The worker sets the context (runId + repository), and node-helpers
 * call reportNodeStart() to update the DB with the current node name.
 * This is a module-level singleton since only one worker runs per process.
 */

import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import { ConsoleLogger } from '../../logging/console-logger.js';
import { TelemetryFailureCounter } from './telemetry-failure-counter.js';
import { writeRunHeartbeat } from './worker-run-status.js';

/**
 * One counter per worker process — the worker runs exactly one feature, so
 * module scope is the right lifetime. An empty catch here made a run whose
 * heartbeat writes were failing indistinguishable from one that finished.
 */
const heartbeatFailures = new TelemetryFailureCounter('heartbeat', new ConsoleLogger());

let contextRunId: string | undefined;
let contextRepository: IAgentRunRepository | undefined;

/**
 * Set the heartbeat context. Called once by the worker after DI init.
 */
export function setHeartbeatContext(runId: string, repository: IAgentRunRepository): void {
  contextRunId = runId;
  contextRepository = repository;
}

/**
 * Report that a graph node has started executing.
 * Updates the run record with the current node name and a fresh heartbeat.
 * Non-blocking: errors are swallowed so graph execution is not affected.
 */
export function reportNodeStart(nodeName: string): void {
  if (!contextRunId || !contextRepository) return;

  const runId = contextRunId;
  const repo = contextRepository;

  // Fire-and-forget — don't await in the graph's hot path. Guarded so a node
  // that starts after a Stop cannot turn `interrupted` back into `running`.
  writeRunHeartbeat(repo, runId, {
    result: `node:${nodeName}`,
    lastHeartbeat: new Date(),
    updatedAt: new Date(),
  })
    .then(() => heartbeatFailures.recordSuccess())
    .catch((error: unknown) => heartbeatFailures.recordFailure(error));
}
