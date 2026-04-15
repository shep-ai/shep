/**
 * Cluster Defaults Factory
 *
 * Factory function for creating Cluster entities with sensible defaults
 * matching the TypeSpec model specification.
 *
 * This factory ensures:
 * - Default status: Stopped (initial state)
 * - ArgoCd disabled by default (opt-in)
 * - Node count: 1 (single-node clusters)
 * - Slug generated from name
 * - UUID and timestamps generated
 */

import { randomUUID } from 'node:crypto';
import type { Cluster } from '../generated/output';
import { ClusterStatus } from '../generated/output';

/**
 * Converts a string to a URL-friendly slug.
 * Follows the same pattern as feature name slugification.
 *
 * @param text - The text to convert to a slug
 * @returns URL-friendly slug (lowercase, alphanumeric + hyphens)
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Options for customizing default cluster creation.
 * All fields are optional and override the factory defaults.
 */
export interface ClusterDefaults {
  /**
   * Optional cluster description.
   * Displayed in cluster detail views and list tables.
   */
  description?: string;

  /**
   * Whether ArgoCD should be enabled for this cluster.
   * Default: false (ArgoCD is opt-in)
   */
  argoCdEnabled?: boolean;

  /**
   * Kubernetes namespace for ArgoCD installation.
   * Only used when argoCdEnabled is true.
   * Default: "argocd"
   */
  argoCdNamespace?: string;

  /**
   * Number of k3s nodes in the cluster.
   * v1 only supports single-node (nodeCount = 1).
   * Default: 1
   */
  nodeCount?: number;
}

/**
 * Creates a Cluster entity with sensible defaults.
 *
 * Default values match the TypeSpec model specification:
 * - Status: Stopped (initial state)
 * - argoCdEnabled: false (opt-in)
 * - argoCdNamespace: "argocd"
 * - nodeCount: 1 (single-node)
 * - Slug generated from name via slugify
 * - UUID and timestamps generated
 *
 * @param name - Human-readable cluster name (required)
 * @param options - Optional overrides for default values
 * @returns Cluster entity with default values
 *
 * @example
 * ```typescript
 * const cluster = createDefaultCluster('production');
 * console.log(cluster.name);           // "production"
 * console.log(cluster.slug);           // "production"
 * console.log(cluster.status);         // ClusterStatus.Stopped
 * console.log(cluster.argoCdEnabled);  // false
 * ```
 *
 * @example
 * ```typescript
 * const cluster = createDefaultCluster('My Cluster', {
 *   description: 'Production deployment target',
 *   argoCdEnabled: true,
 * });
 * console.log(cluster.name);           // "My Cluster"
 * console.log(cluster.slug);           // "my-cluster"
 * console.log(cluster.argoCdEnabled);  // true
 * ```
 */
export function createDefaultCluster(name: string, options?: ClusterDefaults): Cluster {
  const now = new Date();

  // Generate slug from name
  const slug = toSlug(name);

  return {
    id: randomUUID(),
    name,
    slug,
    description: options?.description,
    status: ClusterStatus.Stopped,
    k3dClusterName: undefined,
    kubeconfigPath: undefined,
    argoCdEnabled: options?.argoCdEnabled ?? false,
    argoCdNamespace: options?.argoCdNamespace ?? 'argocd',
    nodeCount: options?.nodeCount ?? 1,
    lastProvisionedAt: undefined,
    lastHealthCheckAt: undefined,
    errorMessage: undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: undefined,
  };
}
