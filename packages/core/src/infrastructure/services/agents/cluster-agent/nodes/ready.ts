/**
 * Ready Node
 *
 * Terminal node that transitions the cluster status to Ready
 * in the database. This is the success exit point of the graph.
 */

import { ClusterStatus } from '../../../../../domain/generated/output.js';
import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'ready';

export function createReadyNode(deps: ClusterAgentDeps) {
  return async (state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    await deps.clusterRepo.update(state.clusterId, {
      status: ClusterStatus.Ready,
      errorMessage: undefined,
    });

    return {
      currentNode: NODE_NAME,
      status: ClusterStatus.Ready,
      messages: [`[${NODE_NAME}] Cluster "${state.clusterName}" is now ready`],
      completedPhases: [NODE_NAME],
    };
  };
}
