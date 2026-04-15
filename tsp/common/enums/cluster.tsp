/**
 * @module Shep.Common.Enums.Cluster
 *
 * Defines enums for cluster lifecycle states in the Shep AI platform.
 * Clusters are managed Kubernetes environments (k3s-in-Docker) that the
 * platform provisions and operates autonomously.
 */
/**
 * Cluster Status Transition Flow:
 * ```
 *                     +-------------+
 *                     | Stopped     |<-----------+
 *                     +------+------+            |
 *                            |                   |
 *                            | provision         |
 *                            v                   |
 *                     +------+-------+           |
 *                +----| Provisioning |           |
 *                |    +--------------+           |
 *                |           |                   |
 *                |           | success           |
 *                |           v                   |
 *                |    +------+------+            |
 *                |    | Ready       |            |
 *                |    +------+------+            |
 *                |           |                   |
 *                |           | stop              |
 *                |           v                   |
 *                |    +------+------+            |
 *                |    | Stopping    |            |
 *                |    +------+------+            |
 *                |           |                   |
 *                |           +-------------------+
 *                |
 *                | failure at any stage
 *                |           +-------------------+
 *                |           |                   |
 *                |           v                   |
 *                |    +------+------+            |
 *                +--->| Error       |            |
 *                     +------+------+            |
 *                            |                   |
 *                            | destroy           |
 *                            v                   |
 *                     +------+-------+           |
 *                     | Destroying   |-----------+
 *                     +--------------+
 * ```
 */
@doc("Operational states for managed Kubernetes clusters")
enum ClusterStatus {
  /**
   * Cluster is actively being provisioned.
   * The cluster agent is creating Docker resources, starting k3s,
   * and optionally installing ArgoCD. Provisioning typically takes
   * 30-120 seconds.
   */
  @doc("Cluster is being provisioned (creating k3d cluster, installing components)")
  Provisioning,

  /**
   * Cluster is fully operational and ready to accept workloads.
   * The k3s API is responsive, core pods are running, and the
   * kubeconfig is available. Deployments can be applied.
   */
  @doc("Cluster is operational and ready to accept workloads")
  Ready,

  /**
   * Cluster is in the process of shutting down.
   * Graceful stop is in progress. Pods are being terminated,
   * and the k3s container will be stopped but not removed.
   */
  @doc("Cluster is gracefully shutting down")
  Stopping,

  /**
   * Cluster has been stopped.
   * The k3s container exists but is not running. Can be started
   * again without reprovisioning. This is the initial state for
   * newly created cluster entities.
   */
  @doc("Cluster is stopped (container exists but not running)")
  Stopped,

  /**
   * Cluster encountered an error during provisioning or operation.
   * The error message is stored in the Cluster entity's errorMessage
   * field. May require manual intervention or retry. Can be destroyed
   * and reprovisioned.
   */
  @doc("Cluster encountered an error (check errorMessage field)")
  Error,

  /**
   * Cluster is being destroyed.
   * The k3d cluster and all associated Docker resources are being
   * removed. This is a terminal operation. After completion, the
   * cluster transitions back to Stopped.
   */
  @doc("Cluster is being destroyed (removing all Docker resources)")
  Destroying,
}
