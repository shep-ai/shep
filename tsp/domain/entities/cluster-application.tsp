/**
 * @module Shep.Domain.Entities.ClusterApplication
 *
 * Defines the ClusterApplication junction entity that establishes a
 * many-to-many relationship between Clusters and Applications.
 *
 * This entity enables Applications to deploy to multiple Clusters,
 * and Clusters to serve multiple Applications.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

/**
 * ClusterApplication Junction Entity
 *
 * Represents a link between a Cluster and an Application. This junction table
 * enables the many-to-many relationship where:
 * - An Application can deploy to multiple Clusters
 * - A Cluster can serve multiple Applications
 *
 * ## Lifecycle
 *
 * Junction records are created via LinkApplicationUseCase and hard-deleted
 * (not soft-deleted) via UnlinkApplicationUseCase. Unlike the Cluster entity,
 * there is no deletedAt field — unlinked records are removed from the database.
 *
 * ## Database Constraints
 *
 * The cluster_applications table enforces:
 * - Compound unique index on (cluster_id, application_id) to prevent duplicate links
 * - Foreign key constraints to both clusters and applications tables
 * - Individual indexes on cluster_id and application_id for efficient lookups
 *
 * ## Usage
 *
 * This entity is typically not exposed directly to presentation layers.
 * Instead, use cases (LinkApplicationUseCase, GetLinkedApplicationsUseCase)
 * and repository methods (linkApplication, unlinkApplication, getLinkedApplications)
 * manage the junction records internally.
 */
@doc("Junction entity linking Clusters to Applications (many-to-many)")
model ClusterApplication extends BaseEntity {
  /**
   * The ID of the cluster in this relationship.
   * References the clusters.id column via foreign key.
   */
  @doc("The cluster ID")
  clusterId: UUID;

  /**
   * The ID of the application in this relationship.
   * References the applications.id column via foreign key.
   */
  @doc("The application ID")
  applicationId: UUID;
}
