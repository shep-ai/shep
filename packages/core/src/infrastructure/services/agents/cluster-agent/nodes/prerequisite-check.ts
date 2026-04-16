/**
 * Prerequisite Check Node
 *
 * Verifies that Docker is running and k3d CLI is available
 * before proceeding with cluster provisioning.
 */

import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'prerequisite-check';

export function createPrerequisiteCheckNode(deps: ClusterAgentDeps) {
  return async (_state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    // Check Docker daemon availability
    const dockerAvailable = await deps.dockerHealthService.isAvailable();
    if (!dockerAvailable) {
      return {
        currentNode: NODE_NAME,
        error: 'Docker is not running. Please start Docker and try again.',
        messages: [`[${NODE_NAME}] FAILED: Docker daemon not available`],
        completedPhases: [NODE_NAME],
      };
    }

    // Check k3d binary availability by attempting a lightweight operation
    try {
      // getClusterStatus with a non-existent name will succeed (returning null)
      // if k3d is installed, or throw BINARY_NOT_FOUND if not
      await deps.k3dService.getClusterStatus('__shep-probe__');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'BINARY_NOT_FOUND') {
        return {
          currentNode: NODE_NAME,
          error: 'k3d is not installed. Install it from https://k3d.io/ and try again.',
          messages: [`[${NODE_NAME}] FAILED: k3d binary not found`],
          completedPhases: [NODE_NAME],
        };
      }
      // Any other error from the probe is fine — it means k3d is available
    }

    return {
      currentNode: NODE_NAME,
      messages: [`[${NODE_NAME}] Docker and k3d prerequisites verified`],
      completedPhases: [NODE_NAME],
    };
  };
}
