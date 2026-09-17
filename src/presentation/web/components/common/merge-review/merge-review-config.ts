import type { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import type { RejectAttachment } from '@/components/common/drawer-action-bar';

/** Diff summary statistics for the PR */
export interface MergeReviewDiffSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
  commitCount: number;
}

/** A line within a diff hunk */
export interface MergeReviewDiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldNumber?: number;
  newNumber?: number;
}

/** A hunk within a file diff */
export interface MergeReviewDiffHunk {
  header: string;
  lines: MergeReviewDiffLine[];
}

/** Per-file diff showing what changed in a single file */
export interface MergeReviewFileDiff {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: MergeReviewDiffHunk[];
}

/** PR metadata extracted from Feature.pr */
export interface MergeReviewPr {
  url: string;
  number: number;
  status: PrStatus;
  commitHash?: string;
  ciStatus?: CiStatus;
  /** false = merge conflicts, true = mergeable, undefined = unknown */
  mergeable?: boolean;
}

/** Branch merge direction info */
export interface MergeReviewBranch {
  /** Feature branch name */
  source: string;
  /** Target branch name (e.g. 'main') */
  target: string;
}

/** An evidence record captured during implementation */
export interface MergeReviewEvidence {
  type: 'Screenshot' | 'Video' | 'TestOutput' | 'TerminalRecording';
  capturedAt: string;
  description: string;
  relativePath: string;
  taskRef?: string;
}

/** Data returned by the getMergeReviewData server action */
export interface MergeReviewData {
  /** PR metadata (omitted when the feature has no PR) */
  pr?: MergeReviewPr;
  /** Aggregate diff statistics (omitted when worktree is unavailable) */
  diffSummary?: MergeReviewDiffSummary;
  /** Per-file diffs with line-level changes (omitted when worktree is unavailable) */
  fileDiffs?: MergeReviewFileDiff[];
  /** Branch merge direction */
  branch?: MergeReviewBranch;
  /** Warning message when diff summary could not be retrieved */
  warning?: string;
  /** Evidence captured during implementation (paths are absolute) */
  evidence?: MergeReviewEvidence[];
  /** Whether to hide CI status badges from UI (global workflow setting) */
  hideCiStatus?: boolean;
}

/** Props for the merge review content component */
export interface MergeReviewProps {
  /** Merge review data from the server action */
  data: MergeReviewData;
  /** When true, hides the action bar and shows archival header text (post-merge history mode) */
  readOnly?: boolean;
  /** Approve merge callback */
  onApprove: () => void;
  /** Reject merge callback — opens feedback dialog when provided; also used for inline text rejection */
  onReject?: (feedback: string, attachments: RejectAttachment[]) => void;
  /** Controls disabled state during approval */
  isProcessing?: boolean;
  /** Whether a reject operation is in flight */
  isRejecting?: boolean;
  /** Controlled chat input for the revision input. */
  chatInput?: string;
  /** Handler for chat input changes. */
  onChatInputChange?: (value: string) => void;
}

/** Props for the merge review drawer (shell wrapper) */
export interface MergeReviewDrawerProps extends Omit<MergeReviewProps, 'data'> {
  /** Merge review data — null while loading */
  data: MergeReviewData | null;
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
  /** Feature name shown in drawer header */
  featureName: string;
  /** Feature ID shown below the name */
  featureId?: string;
  /** Absolute path to the repository on disk */
  repositoryPath?: string;
  /** Git branch name — passed to ReviewDrawerShell for actions */
  branch?: string;
  /** Absolute path to the specs folder on disk */
  specPath?: string;
  /** Callback to delete the feature — shows delete button when provided */
  onDelete?: (featureId: string) => void;
  /** Whether a delete operation is in progress */
  isDeleting?: boolean;
}
