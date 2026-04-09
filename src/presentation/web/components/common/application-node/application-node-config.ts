import type { Node } from '@xyflow/react';

export interface ApplicationNodeData {
  [key: string]: unknown;
  /** Application domain entity ID (UUID), used for delete operations */
  id: string;
  /** Application name */
  name: string;
  /** Short description of the application */
  description: string;
  /** Current application status */
  status: string; // 'Idle' | 'Active' | 'Error'
  /** Primary repository path associated with this application */
  repositoryPath: string;
  /** Number of additional repository paths beyond the primary one */
  additionalPathCount: number;
  /**
   * Dev-server URL when the application is currently Running (via the
   * shared `DeploymentService`). When present, the card renders a real
   * scaled-down iframe of the running app instead of the wireframe
   * skeleton. Populated server-side from the persistent `dev_servers`
   * SQLite table so a page reload still surfaces a live preview.
   */
  deploymentUrl?: string;
  /** Callback when the card is clicked */
  onClick?: () => void;
  /** Callback when the delete button is confirmed */
  onDelete?: (id: string) => void;
  /** Whether to render React Flow handles for edge connections */
  showHandles?: boolean;
}

export type ApplicationNodeType = Node<ApplicationNodeData, 'applicationNode'>;
