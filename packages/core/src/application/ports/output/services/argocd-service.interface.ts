/**
 * ArgoCD Service Interface (Output Port)
 *
 * Defines the contract for managing ArgoCD installations and applications
 * within Kubernetes clusters. ArgoCD is installed via kubectl apply of the
 * official manifests (no separate argocd CLI binary required).
 */

/** ArgoCD installation/sync status. */
export interface ArgoCdStatus {
  /** Whether ArgoCD pods are running and ready. */
  installed: boolean;
  /** Number of running ArgoCD pods. */
  podCount: number;
  /** Whether the ArgoCD server is reachable. */
  serverReady: boolean;
}

/** ArgoCD application sync state. */
export interface ArgoCdAppStatus {
  /** The application name. */
  name: string;
  /** Current sync status (e.g., 'Synced', 'OutOfSync', 'Unknown'). */
  syncStatus: string;
  /** Current health status (e.g., 'Healthy', 'Progressing', 'Degraded'). */
  healthStatus: string;
}

export interface IArgoCDService {
  /**
   * Install ArgoCD into a cluster using kubectl apply of official manifests.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param namespace - Kubernetes namespace for ArgoCD (defaults to 'argocd')
   */
  install(kubeconfigPath: string, namespace?: string): Promise<void>;

  /**
   * Get the status of an ArgoCD installation.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param namespace - Kubernetes namespace for ArgoCD (defaults to 'argocd')
   * @returns ArgoCD status information
   */
  getStatus(kubeconfigPath: string, namespace?: string): Promise<ArgoCdStatus>;

  /**
   * Create an ArgoCD application.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param appName - Name for the ArgoCD application
   * @param repoUrl - Git repository URL for the application source
   * @param path - Path within the repo containing manifests
   * @param namespace - ArgoCD namespace (defaults to 'argocd')
   */
  createApp(
    kubeconfigPath: string,
    appName: string,
    repoUrl: string,
    path: string,
    namespace?: string
  ): Promise<void>;

  /**
   * Sync an ArgoCD application.
   *
   * @param kubeconfigPath - Path to the kubeconfig file
   * @param appName - The ArgoCD application name to sync
   */
  syncApp(kubeconfigPath: string, appName: string): Promise<void>;
}
