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
  /** Callback when the "New SDD feature" action is selected from the
   *  card's hover menu. Wired up by control-center-inner to navigate to
   *  the create drawer pre-scoped to this application in spec mode. */
  onCreateSddFeature?: (id: string) => void;
  /** Whether to render React Flow handles for edge connections */
  showHandles?: boolean;
}

export type ApplicationNodeType = Node<ApplicationNodeData, 'applicationNode'>;
