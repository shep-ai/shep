/**
 * Kubectl Service Interface (Output Port)
 *
 * Defines the contract for interacting with Kubernetes clusters via kubectl CLI.
 * All methods require an explicit kubeconfig path to avoid modifying the global
 * kubeconfig (NFR-2: resource isolation).
 */

/** A Kubernetes pod summary. */
export interface KubePod {
  name: string;
  namespace: string;
  status: string;
  ready: boolean;
}

/** A Kubernetes service summary. */
export interface KubeService {
  name: string;
  namespace: string;
  type: string;
  clusterIp: string;
  ports: string;
}

export interface IKubectlService {
  /**
   * Apply a manifest file to the cluster.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param manifestPath - Path to the YAML manifest file
   */
  apply(kubeconfigPath: string, manifestPath: string): Promise<void>;

  /**
   * Apply a YAML manifest from stdin content.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param yamlContent - The YAML manifest content
   */
  applyStdin(kubeconfigPath: string, yamlContent: string): Promise<void>;

  /**
   * List all namespaces in the cluster.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @returns Array of namespace names
   */
  getNamespaces(kubeconfigPath: string): Promise<string[]>;

  /**
   * List pods in a namespace.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param namespace - Kubernetes namespace (defaults to 'default')
   * @returns Array of pod summaries
   */
  getPods(kubeconfigPath: string, namespace?: string): Promise<KubePod[]>;

  /**
   * List services in a namespace.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param namespace - Kubernetes namespace (defaults to 'default')
   * @returns Array of service summaries
   */
  getServices(kubeconfigPath: string, namespace?: string): Promise<KubeService[]>;

  /**
   * Wait for a resource to become ready.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param resource - Resource specifier (e.g., 'pod/my-pod', 'node/my-node')
   * @param timeoutSeconds - Maximum wait time in seconds
   */
  waitForReady(kubeconfigPath: string, resource: string, timeoutSeconds: number): Promise<void>;
}
