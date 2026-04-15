/**
 * @module Shep.Domain.Entities.ClusterRepository
 *
 * Defines the ClusterRepository junction entity that establishes a
 * many-to-many relationship between Clusters and Repositories.
 *
 * This entity enables Repositories to deploy to multiple Clusters,
 * and Clusters to serve multiple Repositories.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

/**
 * ClusterRepository Junction Entity
 *
 * Represents a link between a Cluster and a Repository. This junction table
 * enables the many-to-many relationship where:
 * - A Repository can deploy to multiple Clusters
 * - A Cluster can serve multiple Repositories
 *
 * ## Lifecycle
 *
 * Junction records are created via LinkRepositoryUseCase and hard-deleted
 * (not soft-deleted) via UnlinkRepositoryUseCase. Unlike the Cluster entity,
 * there is no deletedAt field — unlinked records are removed from the database.
 *
 * ## Database Constraints
 *
 * The cluster_repositories table enforces:
 * - Compound unique index on (cluster_id, repository_id) to prevent duplicate links
 * - Foreign key constraints to both clusters and repositories tables
 * - Individual indexes on cluster_id and repository_id for efficient lookups
 *
 * ## Usage
 *
 * This entity is typically not exposed directly to presentation layers.
 * Instead, use cases (LinkRepositoryUseCase, GetLinkedRepositoriesUseCase)
 * and repository methods (linkRepository, unlinkRepository, getLinkedRepositories)
 * manage the junction records internally.
 */
@doc("Junction entity linking Clusters to Repositories (many-to-many)")
model ClusterRepository extends BaseEntity {
  /**
   * The ID of the cluster in this relationship.
   * References the clusters.id column via foreign key.
   */
  @doc("The cluster ID")
  clusterId: UUID;

  /**
   * The ID of the repository in this relationship.
   * References the repositories.id column via foreign key.
   */
  @doc("The repository ID")
  repositoryId: UUID;
}
