/**
 * Install ArgoCD Node
 *
 * Conditionally installs ArgoCD into the cluster when argoCdEnabled is true.
 * Uses IArgoCDService.install which applies the official ArgoCD manifests
 * via kubectl (no separate argocd CLI binary required).
 */

import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'install-argocd';

export function createInstallArgoCdNode(deps: ClusterAgentDeps) {
  return async (state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    if (!state.kubeconfigPath) {
      return {
        currentNode: NODE_NAME,
        error: 'Cannot install ArgoCD: kubeconfig path not set',
        messages: [`[${NODE_NAME}] FAILED: no kubeconfig path`],
        completedPhases: [NODE_NAME],
      };
    }

    try {
      await deps.argoCdService.install(state.kubeconfigPath, state.argoCdNamespace);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        currentNode: NODE_NAME,
        error: `Failed to install ArgoCD: ${message}`,
        messages: [`[${NODE_NAME}] FAILED: ${message}`],
        completedPhases: [NODE_NAME],
      };
    }

    return {
      currentNode: NODE_NAME,
      messages: [`[${NODE_NAME}] ArgoCD installed in namespace "${state.argoCdNamespace}"`],
      completedPhases: [NODE_NAME],
    };
  };
}
