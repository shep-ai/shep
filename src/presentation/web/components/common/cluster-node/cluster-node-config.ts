import type { Node } from '@xyflow/react';
import { ClusterStatus } from '@shepai/core/domain/generated/output';

export interface ClusterNodeData {
  [key: string]: unknown;
  /** Cluster domain entity ID (UUID) */
  id: string;
  /** Cluster name */
  name: string;
  /** Short description of the cluster */
  description?: string;
  /** Current cluster status */
  status: ClusterStatus;
  /** Number of linked repositories */
  linkedRepoCount: number;
  /** Number of linked applications */
  linkedAppCount: number;
  /** Whether ArgoCD is enabled */
  argoCdEnabled?: boolean;
  /** Callback when the node is clicked */
  onClick?: () => void;
  /** Callback when the delete button is confirmed */
  onDelete?: (id: string) => void;
  /** Whether to render React Flow handles for edge connections */
  showHandles?: boolean;
}

export type ClusterNodeType = Node<ClusterNodeData, 'clusterNode'>;

/** Status-to-style mapping for ClusterStatus badges. */
export interface ClusterStatusStyle {
  /** Tailwind class for the dot/badge background */
  dotClass: string;
  /** Tailwind class for the text color */
  textClass: string;
  /** Whether the dot should pulse */
  pulse: boolean;
  /** i18n key suffix for the status label */
  labelKey: string;
}

export const clusterStatusStyles: Record<ClusterStatus, ClusterStatusStyle> = {
  [ClusterStatus.Provisioning]: {
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-600 dark:text-blue-400',
    pulse: true,
    labelKey: 'cluster.status.provisioning',
  },
  [ClusterStatus.Ready]: {
    dotClass: 'bg-green-500',
    textClass: 'text-green-600 dark:text-green-400',
    pulse: false,
    labelKey: 'cluster.status.ready',
  },
  [ClusterStatus.Stopping]: {
    dotClass: 'bg-yellow-500',
    textClass: 'text-yellow-600 dark:text-yellow-400',
    pulse: true,
    labelKey: 'cluster.status.stopping',
  },
  [ClusterStatus.Stopped]: {
    dotClass: 'bg-gray-400',
    textClass: 'text-gray-500 dark:text-gray-400',
    pulse: false,
    labelKey: 'cluster.status.stopped',
  },
  [ClusterStatus.Error]: {
    dotClass: 'bg-red-500',
    textClass: 'text-red-600 dark:text-red-400',
    pulse: false,
    labelKey: 'cluster.status.error',
  },
  [ClusterStatus.Destroying]: {
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-600 dark:text-orange-400',
    pulse: true,
    labelKey: 'cluster.status.destroying',
  },
};
