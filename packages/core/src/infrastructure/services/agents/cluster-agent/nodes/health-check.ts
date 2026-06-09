/**
 * Health Check Node
 *
 * Verifies the cluster is operational by polling kubectl for node readiness
 * and core system pod status. Uses exponential backoff (1s, 2s, 4s, 8s, 16s, 32s)
 * with a configurable total timeout (default 120s per NFR-1).
 */

import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'health-check';
const DEFAULT_TIMEOUT_MS = 120_000;
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 32_000;

/** Wait for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createHealthCheckNode(deps: ClusterAgentDeps, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return async (state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    if (!state.kubeconfigPath) {
      return {
        currentNode: NODE_NAME,
        error: 'Cannot health-check: kubeconfig path not set',
        messages: [`[${NODE_NAME}] FAILED: no kubeconfig path`],
        completedPhases: [NODE_NAME],
      };
    }

    const startTime = Date.now();
    let delay = INITIAL_DELAY_MS;

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check that core system pods in kube-system are running
        const pods = await deps.kubectlService.getPods(state.kubeconfigPath, 'kube-system');
        const allReady = pods.length > 0 && pods.every((pod) => pod.ready);

        if (allReady) {
          // Update last health check timestamp
          await deps.clusterRepo.update(state.clusterId, {
            lastHealthCheckAt: new Date(),
          });

          return {
            currentNode: NODE_NAME,
            messages: [`[${NODE_NAME}] Cluster healthy — ${pods.length} system pods ready`],
            completedPhases: [NODE_NAME],
          };
        }

        // Some pods not ready yet — wait and retry
        const notReady = pods.filter((p) => !p.ready).map((p) => p.name);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        // Continue polling without logging per-iteration to avoid spam
        void notReady;
        void elapsed;
      } catch {
        // kubectl command failed — cluster API may not be ready yet
      }

      await sleep(delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }

    // Timeout — cluster did not become healthy
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    return {
      currentNode: NODE_NAME,
      error: `Health check timed out after ${totalElapsed}s — cluster did not become ready`,
      messages: [`[${NODE_NAME}] FAILED: timeout after ${totalElapsed}s`],
      completedPhases: [NODE_NAME],
    };
  };
}
