/**
 * Cluster Database Mapper
 *
 * Maps between Cluster domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Booleans stored as INTEGER (0/1)
 */

import type { Cluster, ClusterStatus } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the clusters table schema.
 */
export interface ClusterRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  k3d_cluster_name: string | null;
  kubeconfig_path: string | null;
  argocd_enabled: number;
  argocd_namespace: string;
  node_count: number;
  last_provisioned_at: number | null;
  last_health_check_at: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function dateOrNumberToMs(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime();
  return value;
}

/**
 * Maps Cluster domain object to database row.
 */
export function toDatabase(cluster: Cluster): ClusterRow {
  return {
    id: cluster.id,
    name: cluster.name,
    slug: cluster.slug,
    description: cluster.description ?? null,
    status: cluster.status,
    k3d_cluster_name: cluster.k3dClusterName ?? null,
    kubeconfig_path: cluster.kubeconfigPath ?? null,
    argocd_enabled: cluster.argoCdEnabled ? 1 : 0,
    argocd_namespace: cluster.argoCdNamespace,
    node_count: cluster.nodeCount,
    last_provisioned_at:
      cluster.lastProvisionedAt !== undefined && cluster.lastProvisionedAt !== null
        ? dateOrNumberToMs(cluster.lastProvisionedAt)
        : null,
    last_health_check_at:
      cluster.lastHealthCheckAt !== undefined && cluster.lastHealthCheckAt !== null
        ? dateOrNumberToMs(cluster.lastHealthCheckAt)
        : null,
    error_message: cluster.errorMessage ?? null,
    created_at: dateOrNumberToMs(cluster.createdAt),
    updated_at: dateOrNumberToMs(cluster.updatedAt),
    deleted_at: cluster.deletedAt ? dateOrNumberToMs(cluster.deletedAt) : null,
  };
}

/**
 * Maps database row to Cluster domain object.
 */
export function fromDatabase(row: ClusterRow): Cluster {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    status: row.status as ClusterStatus,
    k3dClusterName: row.k3d_cluster_name ?? undefined,
    kubeconfigPath: row.kubeconfig_path ?? undefined,
    argoCdEnabled: row.argocd_enabled === 1,
    argoCdNamespace: row.argocd_namespace,
    nodeCount: row.node_count,
    lastProvisionedAt:
      row.last_provisioned_at !== null && row.last_provisioned_at !== undefined
        ? new Date(row.last_provisioned_at)
        : undefined,
    lastHealthCheckAt:
      row.last_health_check_at !== null && row.last_health_check_at !== undefined
        ? new Date(row.last_health_check_at)
        : undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
