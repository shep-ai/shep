/**
 * K3d Service Interface (Output Port)
 *
 * Defines the contract for managing k3s-in-Docker clusters via the k3d CLI.
 * Infrastructure layer provides the concrete implementation wrapping k3d
 * binary calls via execFile.
 */

/** Options for creating a k3d cluster. */
export interface K3dCreateClusterOptions {
  /** Disable the default load balancer (--no-lb). */
  noLb?: boolean;
  /** Wait for cluster to be ready (--wait). */
  wait?: boolean;
  /** Timeout for waiting in seconds (--timeout). */
  timeoutSeconds?: number;
}

/** Status information returned by k3d for a cluster. */
export interface K3dClusterStatus {
  /** Whether the cluster exists in k3d. */
  exists: boolean;
  /** Whether the cluster's containers are running. */
  running: boolean;
  /** Number of server (control plane) nodes. */
  serverCount: number;
}

export interface IK3dService {
  /**
   * Create a new k3d cluster.
   *
   * @param name - The k3d cluster name
   * @param options - Optional creation options
   */
  createCluster(name: string, options?: K3dCreateClusterOptions): Promise<void>;

  /**
   * Delete a k3d cluster.
   *
   * @param name - The k3d cluster name
   */
  deleteCluster(name: string): Promise<void>;

  /**
   * Start a stopped k3d cluster.
   *
   * @param name - The k3d cluster name
   */
  startCluster(name: string): Promise<void>;

  /**
   * Stop a running k3d cluster.
   *
   * @param name - The k3d cluster name
   */
  stopCluster(name: string): Promise<void>;

  /**
   * Get the status of a k3d cluster.
   *
   * @param name - The k3d cluster name
   * @returns Cluster status or null if not found
   */
  getClusterStatus(name: string): Promise<K3dClusterStatus | null>;

  /**
   * Extract the kubeconfig for a k3d cluster.
   *
   * @param name - The k3d cluster name
   * @returns The kubeconfig YAML content
   */
  getKubeconfig(name: string): Promise<string>;
}
