/**
 * Cluster Agent Process Service Interface (Output Port)
 *
 * Manages background worker processes for cluster agent execution.
 * Follows the IFeatureAgentProcessService pattern: spawn detached
 * Node.js workers, check liveness via PID, and support cleanup.
 */

/** Options for spawning a cluster agent worker. */
export interface ClusterAgentSpawnOptions {
  /** Whether ArgoCD should be installed during provisioning. */
  argoCdEnabled?: boolean;
  /** ArgoCD namespace (defaults to 'argocd'). */
  argoCdNamespace?: string;
  /** Whether this is a resume of a previously failed provisioning. */
  resume?: boolean;
  /** Thread ID for checkpoint resume. */
  threadId?: string;
}

export interface IClusterAgentProcessService {
  /**
   * Spawn a background worker process for cluster provisioning.
   *
   * @param clusterId - The cluster ID to provision
   * @param runId - The agent run ID for tracking
   * @param options - Optional spawn options
   * @returns The PID of the spawned process
   */
  spawn(clusterId: string, runId: string, options?: ClusterAgentSpawnOptions): number;

  /**
   * Check if a process is still alive.
   *
   * @param pid - The process ID to check
   * @returns true if the process is running
   */
  isAlive(pid: number): boolean;

  /**
   * Kill a running cluster agent worker process.
   *
   * @param pid - The process ID to kill
   */
  kill(pid: number): void;
}
