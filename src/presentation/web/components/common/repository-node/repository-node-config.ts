import type { Node } from '@xyflow/react';

export interface RepositoryNodeData {
  [key: string]: unknown;
  /** Repository domain entity ID (UUID), used for delete operations */
  id?: string;
  /** Repository name, e.g. "shep-ai/shep" */
  name: string;
  /** Absolute path to the repository root, used for IDE/shell actions */
  repositoryPath?: string;
  /** Creation timestamp (epoch ms) — used for stable vertical ordering. */
  createdAt?: number;
  /** Current git branch name (e.g. "main", "feat/my-feature") */
  branch?: string;
  /** Commit message of the branch HEAD (first line only) */
  commitMessage?: string;
  /** Name of the person who made the latest commit */
  committer?: string;
  /** Number of commits the current branch is behind the default branch. null if on default branch or unknown. */
  behindCount?: number | null;
  /** Git info resolution status. undefined/'loading' = fetching, 'ready' = resolved, 'not-a-repo' = not a git repo */
  gitInfoStatus?: 'loading' | 'ready' | 'not-a-repo';
  onClick?: () => void;
  onAdd?: () => void;
  onDelete?: (repositoryId: string, options?: { deleteFromDisk?: boolean }) => void;
  showHandles?: boolean;
  /** When true, the "+" add-feature button shows a pulse attention animation. */
  pulseAdd?: boolean;
}

export type RepositoryNodeType = Node<RepositoryNodeData, 'repositoryNode'>;
