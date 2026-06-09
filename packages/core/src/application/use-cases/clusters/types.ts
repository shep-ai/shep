/**
 * Cluster Use Case Types
 *
 * Input and output types for all cluster use cases.
 * Uses discriminated union result types following the codebase pattern.
 */

import type {
  Cluster,
  ClusterStatus,
  ClusterRepository,
  ClusterApplication,
} from '../../../domain/generated/output.js';
import type {
  KubePod,
  KubeService,
} from '../../ports/output/services/kubectl-service.interface.js';
import type { ArgoCdAppStatus } from '../../ports/output/services/argocd-service.interface.js';

// --- Create ---

export interface CreateClusterInput {
  name: string;
  description?: string;
  argoCdEnabled?: boolean;
  argoCdNamespace?: string;
}

export type CreateClusterResult = { ok: true; cluster: Cluster } | { ok: false; error: string };

// --- Get ---

export type GetClusterResult = { ok: true; cluster: Cluster } | { ok: false; error: string };

// --- List ---

export interface ListClustersInput {
  status?: ClusterStatus;
}

// --- Update ---

export interface UpdateClusterInput {
  name?: string;
  description?: string;
  argoCdEnabled?: boolean;
  argoCdNamespace?: string;
}

export type UpdateClusterResult = { ok: true; cluster: Cluster } | { ok: false; error: string };

// --- Delete ---

export type DeleteClusterResult = { ok: true } | { ok: false; error: string };

// --- Link/Unlink ---

export interface LinkEntityInput {
  clusterId: string;
  entityId: string;
}

export type LinkRepositoryResult =
  | { ok: true; link: ClusterRepository }
  | { ok: false; error: string };

export type UnlinkRepositoryResult = { ok: true } | { ok: false; error: string };

export type LinkApplicationResult =
  | { ok: true; link: ClusterApplication }
  | { ok: false; error: string };

export type UnlinkApplicationResult = { ok: true } | { ok: false; error: string };

// --- Provision ---

export type ProvisionClusterResult = { ok: true } | { ok: false; error: string };

// --- Destroy ---

export type DestroyClusterResult = { ok: true } | { ok: false; error: string };

// --- Status ---

export interface ClusterStatusResult {
  cluster: Cluster;
  live?: {
    pods: KubePod[];
    services: KubeService[];
    podCount: number;
    serviceCount: number;
    argocd?: ArgoCdAppStatus[];
  };
  error?: string;
}

export type GetClusterStatusResult =
  | { ok: true; status: ClusterStatusResult }
  | { ok: false; error: string };
