/**
 * Provision Node
 *
 * Creates a k3d cluster via IK3dService.createCluster and updates
 * the cluster entity with the k3d-internal cluster name.
 */

import { ClusterStatus } from '../../../../../domain/generated/output.js';
import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'provision';

export function createProvisionNode(deps: ClusterAgentDeps) {
  return async (state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    const k3dName = `shep-${state.clusterName}`;

    try {
      await deps.k3dService.createCluster(k3dName, {
        noLb: true,
        wait: true,
        timeoutSeconds: 120,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        currentNode: NODE_NAME,
        error: `Failed to create k3d cluster: ${message}`,
        messages: [`[${NODE_NAME}] FAILED: ${message}`],
        completedPhases: [NODE_NAME],
      };
    }

    // Update the cluster entity with the k3d cluster name
    await deps.clusterRepo.update(state.clusterId, {
      k3dClusterName: k3dName,
      lastProvisionedAt: new Date(),
    });

    return {
      currentNode: NODE_NAME,
      status: ClusterStatus.Provisioning,
      messages: [`[${NODE_NAME}] k3d cluster "${k3dName}" created successfully`],
      completedPhases: [NODE_NAME],
    };
  };
}
