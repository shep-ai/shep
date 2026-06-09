/**
 * Cluster Agent Graph
 *
 * LangGraph StateGraph for cluster provisioning with 6 operational nodes
 * plus an error terminal. The graph follows a linear flow with a conditional
 * edge for ArgoCD installation:
 *
 *   START -> prerequisite-check -> provision -> configure-kubectl
 *         -> [install-argocd if enabled] -> health-check -> ready -> END
 *
 * Any node that sets `error` in state routes to the error terminal.
 *
 * Follows the feature-agent-graph.ts factory pattern.
 */

import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ClusterAgentAnnotation, type ClusterAgentState } from './cluster-agent-state.js';
import type { ClusterAgentDeps } from './cluster-agent-deps.js';
import { createPrerequisiteCheckNode } from './nodes/prerequisite-check.js';
import { createProvisionNode } from './nodes/provision.js';
import { createConfigureKubectlNode } from './nodes/configure-kubectl.js';
import { createInstallArgoCdNode } from './nodes/install-argocd.js';
import { createHealthCheckNode } from './nodes/health-check.js';
import { createReadyNode } from './nodes/ready.js';
import { createErrorNode } from './nodes/error.js';

// Re-export state types for consumers
export { ClusterAgentAnnotation, type ClusterAgentState } from './cluster-agent-state.js';
export type { ClusterAgentDeps } from './cluster-agent-deps.js';

/** Node name for the terminal error handler (cannot be 'error' — collides with state channel). */
const ERROR_NODE = 'handle-error';

/**
 * Route to error node if state.error is set, otherwise continue to next node.
 */
function routeOrError(nextNode: string) {
  return (state: ClusterAgentState): string => {
    if (state.error) return ERROR_NODE;
    return nextNode;
  };
}

/**
 * Route from configure-kubectl: if argoCdEnabled, go to install-argocd;
 * otherwise skip to health-check. Routes to error if state.error is set.
 */
function routeAfterConfigureKubectl(state: ClusterAgentState): string {
  if (state.error) return ERROR_NODE;
  if (state.argoCdEnabled) return 'install-argocd';
  return 'health-check';
}

/**
 * Factory function that creates and compiles the cluster-agent LangGraph.
 *
 * @param deps - Infrastructure service dependencies injected for testability
 * @param checkpointer - Optional checkpoint saver for state persistence
 * @returns A compiled LangGraph ready to be invoked
 */
export function createClusterAgentGraph(
  deps: ClusterAgentDeps,
  checkpointer?: BaseCheckpointSaver
) {
  const graph = new StateGraph(ClusterAgentAnnotation)
    // --- Operational nodes ---
    .addNode('prerequisite-check', createPrerequisiteCheckNode(deps))
    .addNode('provision', createProvisionNode(deps))
    .addNode('configure-kubectl', createConfigureKubectlNode(deps))
    .addNode('install-argocd', createInstallArgoCdNode(deps))
    .addNode('health-check', createHealthCheckNode(deps))
    .addNode('ready', createReadyNode(deps))

    // --- Terminal error node ---
    .addNode(ERROR_NODE, createErrorNode(deps))

    // --- Edges ---
    .addEdge(START, 'prerequisite-check')
    .addConditionalEdges('prerequisite-check', routeOrError('provision'))
    .addConditionalEdges('provision', routeOrError('configure-kubectl'))
    .addConditionalEdges('configure-kubectl', routeAfterConfigureKubectl)
    .addConditionalEdges('install-argocd', routeOrError('health-check'))
    .addConditionalEdges('health-check', routeOrError('ready'))
    .addEdge('ready', END)
    .addEdge(ERROR_NODE, END);

  return graph.compile({ checkpointer });
}
