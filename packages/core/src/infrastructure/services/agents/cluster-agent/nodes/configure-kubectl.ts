/**
 * Configure Kubectl Node
 *
 * Extracts the kubeconfig from the k3d cluster and writes it to a
 * per-cluster directory at ~/.shep/clusters/<clusterId>/kubeconfig.
 * Sets file permissions to 0600 (NFR-10: security).
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import type { ClusterAgentState } from '../cluster-agent-state.js';
import type { ClusterAgentDeps } from '../cluster-agent-deps.js';

const NODE_NAME = 'configure-kubectl';
const KUBECONFIG_PERMISSIONS = 0o600;

export function createConfigureKubectlNode(deps: ClusterAgentDeps) {
  return async (state: ClusterAgentState): Promise<Partial<ClusterAgentState>> => {
    const k3dName = `shep-${state.clusterName}`;
    const kubeconfigDir = join(homedir(), '.shep', 'clusters', state.clusterId);
    const kubeconfigPath = join(kubeconfigDir, 'kubeconfig');

    try {
      // Extract kubeconfig from k3d
      const kubeconfigContent = await deps.k3dService.getKubeconfig(k3dName);

      // Write to per-cluster directory with secure permissions
      mkdirSync(kubeconfigDir, { recursive: true });
      writeFileSync(kubeconfigPath, kubeconfigContent, { mode: KUBECONFIG_PERMISSIONS });
      chmodSync(kubeconfigPath, KUBECONFIG_PERMISSIONS);

      // Store the kubeconfig path on the cluster entity
      await deps.clusterRepo.update(state.clusterId, { kubeconfigPath });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        currentNode: NODE_NAME,
        error: `Failed to configure kubeconfig: ${message}`,
        messages: [`[${NODE_NAME}] FAILED: ${message}`],
        completedPhases: [NODE_NAME],
      };
    }

    return {
      currentNode: NODE_NAME,
      kubeconfigPath,
      messages: [`[${NODE_NAME}] Kubeconfig extracted to ${kubeconfigPath}`],
      completedPhases: [NODE_NAME],
    };
  };
}
