/**
 * Error Node
 *
 * Terminal node that transitions the cluster status to Error
 * in the database and persists the error message. This is the
 * failure exit point of the graph — any node that sets `error`
 * in state is routed here.
 */

import { ClusterStatus } from '../../../../../domain/generated/output.js';
import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'handle-error';

export function createErrorNode(deps: ClusterAgentDeps) {
  return async (state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    const errorMessage = state.error ?? 'Unknown error during cluster provisioning';

    await deps.clusterRepo.update(state.clusterId, {
      status: ClusterStatus.Error,
      errorMessage,
    });

    return {
      currentNode: NODE_NAME,
      status: ClusterStatus.Error,
      messages: [`[${NODE_NAME}] Cluster "${state.clusterName}" failed: ${errorMessage}`],
      completedPhases: [NODE_NAME],
    };
  };
}
