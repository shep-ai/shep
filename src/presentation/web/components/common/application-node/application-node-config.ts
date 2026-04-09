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
  /** Callback when the card is clicked */
  onClick?: () => void;
  /** Callback when the delete button is confirmed */
  onDelete?: (id: string) => void;
  /** Whether to render React Flow handles for edge connections */
  showHandles?: boolean;
}

export type ApplicationNodeType = Node<ApplicationNodeData, 'applicationNode'>;
