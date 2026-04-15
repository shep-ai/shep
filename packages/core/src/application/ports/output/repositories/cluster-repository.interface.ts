/**
 * Cluster Repository Interface (Output Port)
 *
 * Defines the contract for Cluster entity persistence operations
 * including CRUD and junction table management for many-to-many
 * relationships with Repositories and Applications.
 */

import type {
  Cluster,
  ClusterStatus,
  ClusterRepository,
  ClusterApplication,
  Application,
} from '../../../../domain/generated/output.js';
import type { Repository } from '../../../../domain/generated/output.js';

export interface IClusterRepository {
  create(cluster: Cluster): Promise<void>;
  findById(id: string): Promise<Cluster | null>;
  findBySlug(slug: string): Promise<Cluster | null>;
  list(status?: ClusterStatus): Promise<Cluster[]>;
  update(
    id: string,
    fields: Partial<
      Pick<
        Cluster,
        | 'name'
        | 'slug'
        | 'description'
        | 'status'
        | 'k3dClusterName'
        | 'kubeconfigPath'
        | 'argoCdEnabled'
        | 'argoCdNamespace'
        | 'nodeCount'
        | 'lastProvisionedAt'
        | 'lastHealthCheckAt'
        | 'errorMessage'
      >
    >
  ): Promise<void>;
  softDelete(id: string): Promise<void>;

  linkRepository(clusterId: string, repositoryId: string): Promise<ClusterRepository>;
  unlinkRepository(clusterId: string, repositoryId: string): Promise<void>;
  getLinkedRepositories(clusterId: string): Promise<Repository[]>;

  linkApplication(clusterId: string, applicationId: string): Promise<ClusterApplication>;
  unlinkApplication(clusterId: string, applicationId: string): Promise<void>;
  getLinkedApplications(clusterId: string): Promise<Application[]>;
}
