/**
 * @module Shep.Domain.Entities.Cluster
 *
 * Defines the Cluster entity — a managed Kubernetes environment (k3s-in-Docker)
 * that the Shep platform provisions and operates autonomously.
 *
 * Clusters are first-class deployment targets alongside Repositories, Applications,
 * and Features. They link to Repositories and Applications to form the complete
 * SDLC-to-deployment pipeline.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/cluster.tsp";

/**
 * Cluster Entity
 *
 * Represents a managed Kubernetes cluster provisioned via k3s-in-Docker (k3d).
 * The cluster agent handles provisioning, kubectl operations, optional ArgoCD
 * installation, and lifecycle management.
 *
 * ## Lifecycle
 *
 * 1. Created in Stopped state via CreateClusterUseCase
 * 2. Provisioned via ProvisionClusterUseCase (transitions to Provisioning → Ready)
 * 3. Can be stopped/started without reprovisioning (Stopping → Stopped → Ready)
 * 4. Destroyed via DestroyClusterUseCase (transitions to Destroying → Stopped)
 * 5. Soft-deleted via DeleteClusterUseCase (sets deletedAt timestamp)
 *
 * ## Relationships
 *
 * - Many-to-many with Repository via cluster_repositories junction table
 * - Many-to-many with Application via cluster_applications junction table
 *
 * ## Resource Isolation
 *
 * Each cluster runs in its own Docker network with a unique kubeconfig file
 * stored at ~/.shep/clusters/<cluster-id>/kubeconfig. Clusters do not share
 * ports or conflict with each other.
 */
@doc("A managed Kubernetes cluster provisioned via k3s-in-Docker")
model Cluster extends SoftDeletableEntity {
  /**
   * Human-readable cluster name.
   * Used in UI labels and k3d cluster name generation.
   * Can be changed; slug is regenerated when name changes.
   */
  @doc("Human-readable cluster name")
  name: string;

  /**
   * URL-friendly identifier derived from name.
   * Unique among non-deleted clusters (enforced via unique index where deletedAt IS NULL).
   * Automatically regenerated when name changes.
   */
  @doc("URL-friendly identifier (unique among non-deleted clusters)")
  slug: string;

  /**
   * Optional user-provided description of the cluster's purpose.
   * Displayed in cluster detail views and list tables.
   */
  @doc("Optional description of the cluster's purpose")
  description?: string;

  /**
   * Current operational status of the cluster.
   * Transitions: Stopped → Provisioning → Ready → Stopping → Stopped → Destroying.
   * Error state reachable from any state on failure.
   * Default: Stopped (initial state for newly created clusters).
   */
  @doc("Current operational status of the cluster")
  status: ClusterStatus = ClusterStatus.Stopped;

  /**
   * The k3d-internal cluster name.
   * Set during provisioning. Used for k3d CLI commands (k3d cluster start/stop/delete).
   * Typically follows the pattern: shep-<slug> or shep-<id>.
   */
  @doc("The k3d-internal cluster name (set during provisioning)")
  k3dClusterName?: string;

  /**
   * Absolute path to the kubeconfig file for this cluster.
   * Set during provisioning. Stored at ~/.shep/clusters/<cluster-id>/kubeconfig.
   * All kubectl and argocd operations pass --kubeconfig <path> to avoid
   * modifying the global ~/.kube/config.
   */
  @doc("Absolute path to the kubeconfig file")
  kubeconfigPath?: string;

  /**
   * Whether ArgoCD is enabled for this cluster.
   * When true, the cluster agent installs ArgoCD during provisioning.
   * Default: false (ArgoCD is opt-in to avoid overhead for simple clusters).
   */
  @doc("Whether ArgoCD is enabled for this cluster")
  argoCdEnabled: boolean = false;

  /**
   * Kubernetes namespace where ArgoCD is installed.
   * Only meaningful when argoCdEnabled is true.
   * Default: argocd (the ArgoCD standard namespace).
   */
  @doc("Kubernetes namespace where ArgoCD is installed")
  argoCdNamespace: string = "argocd";

  /**
   * Number of k3s nodes in the cluster.
   * v1 only supports single-node clusters (nodeCount = 1).
   * Reserved for future multi-node support.
   * Default: 1.
   */
  @doc("Number of k3s nodes (default 1, reserved for future multi-node support)")
  nodeCount: int32 = 1;

  /**
   * Timestamp when the cluster was last successfully provisioned.
   * Updated each time provisioning completes successfully (status transitions to Ready).
   * Null if the cluster has never been provisioned.
   */
  @doc("Timestamp when the cluster was last successfully provisioned")
  lastProvisionedAt?: utcDateTime;

  /**
   * Timestamp of the most recent health check.
   * Updated by the cluster agent during provisioning and status queries.
   * Null if no health check has been performed yet.
   */
  @doc("Timestamp of the most recent health check")
  lastHealthCheckAt?: utcDateTime;

  /**
   * Error message from the last failed operation.
   * Set when status transitions to Error. Cleared when status leaves Error state.
   * Displayed in cluster detail views and error notifications.
   */
  @doc("Error message from the last failed operation (set when status = Error)")
  errorMessage?: string;
}
