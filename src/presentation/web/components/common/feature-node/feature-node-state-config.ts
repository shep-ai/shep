import {
  Loader2,
  CircleAlert,
  CircleCheck,
  Ban,
  CircleX,
  Trash2,
  Clock,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type {
  PrStatus,
  CiStatus,
  DeploymentState,
  FeatureMode,
} from '@shepai/core/domain/generated/output';
import type { AgentTypeValue } from './agent-type-icons';

export type FeatureNodeState =
  | 'creating'
  | 'running'
  | 'action-required'
  | 'done'
  | 'blocked'
  | 'pending'
  | 'error'
  | 'deleting'
  | 'archived';

export type FeatureLifecyclePhase =
  | 'pending'
  | 'requirements'
  | 'research'
  | 'implementation'
  | 'review'
  | 'awaitingUpstream'
  | 'deploy'
  | 'maintain'
  | 'exploring';

/** Human-readable display labels for lifecycle phases. */
export const lifecycleDisplayLabels: Record<FeatureLifecyclePhase, string> = {
  pending: 'PENDING',
  requirements: 'REQUIREMENTS',
  research: 'RESEARCH',
  implementation: 'IMPLEMENTATION',
  review: 'REVIEW',
  awaitingUpstream: 'AWAITING UPSTREAM',
  deploy: 'DEPLOY & QA',
  maintain: 'COMPLETED',
  exploring: 'EXPLORING',
};

/** Inline-start border color for each lifecycle phase. */
export const lifecycleBorderColors: Record<FeatureLifecyclePhase, string> = {
  pending: 'border-s-slate-400',
  requirements: 'border-s-violet-500',
  research: 'border-s-cyan-500',
  implementation: 'border-s-blue-500',
  review: 'border-s-amber-500',
  awaitingUpstream: 'border-s-amber-500',
  deploy: 'border-s-emerald-500',
  maintain: 'border-s-gray-400',
  exploring: 'border-s-amber-400',
};

/** Accent bar background color for each lifecycle phase. */
export const lifecycleAccentColors: Record<FeatureLifecyclePhase, string> = {
  pending: 'bg-slate-400',
  requirements: 'bg-violet-500',
  research: 'bg-cyan-500',
  implementation: 'bg-blue-500',
  review: 'bg-amber-500',
  awaitingUpstream: 'bg-amber-500',
  deploy: 'bg-emerald-500',
  maintain: 'bg-gray-400',
  exploring: 'bg-amber-400',
};

/** Phase badge: short letter, color classes, and user-friendly tooltip. */
export const lifecyclePhaseBadge: Record<
  FeatureLifecyclePhase,
  {
    letter: string;
    bg: string;
    text: string;
    dot: string;
    tooltip: string;
    description: string;
  }
> = {
  pending: {
    letter: 'P',
    bg: 'bg-stone-100 dark:bg-stone-800',
    text: 'text-stone-500 dark:text-stone-400',
    dot: 'bg-stone-400',
    tooltip: 'Pending',
    description: 'Waiting to start — the feature is queued and ready to go.',
  },
  requirements: {
    letter: 'R',
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40',
    text: 'text-fuchsia-600 dark:text-fuchsia-300',
    dot: 'bg-fuchsia-500',
    tooltip: 'Requirements',
    description:
      'Gathering what to build — the AI is writing a product requirements document (PRD) based on your request.',
  },
  research: {
    letter: 'D',
    bg: 'bg-teal-100 dark:bg-teal-900/40',
    text: 'text-teal-600 dark:text-teal-300',
    dot: 'bg-teal-500',
    tooltip: 'Research',
    description:
      'Exploring your codebase — the AI is analyzing existing code, patterns, and dependencies to plan the best approach.',
  },
  implementation: {
    letter: 'I',
    bg: 'bg-indigo-100 dark:bg-indigo-900/40',
    text: 'text-indigo-600 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    tooltip: 'Implementation',
    description:
      'Writing code — the AI is implementing the feature, writing tests, and making sure everything compiles.',
  },
  review: {
    letter: 'M',
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    text: 'text-orange-600 dark:text-orange-300',
    dot: 'bg-orange-500',
    tooltip: 'Merge Review',
    description:
      'Ready to merge — the code is complete. Review the changes and approve to merge into your repository.',
  },
  awaitingUpstream: {
    letter: 'U',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-600 dark:text-amber-300',
    dot: 'bg-amber-500',
    tooltip: 'Awaiting upstream merge',
    description:
      'PR submitted to upstream — waiting for the upstream maintainer to review and merge.',
  },
  deploy: {
    letter: 'Q',
    bg: 'bg-lime-100 dark:bg-lime-900/40',
    text: 'text-lime-600 dark:text-lime-300',
    dot: 'bg-lime-500',
    tooltip: 'Deploy & QA',
    description:
      'Deploying and testing — the feature is being deployed to a preview environment for quality checks.',
  },
  maintain: {
    letter: '✓',
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-500 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    tooltip: 'Completed',
    description: 'All done — the feature has been merged and delivered successfully.',
  },
  exploring: {
    letter: 'E',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-600 dark:text-amber-300',
    dot: 'bg-amber-400',
    tooltip: 'Exploring',
    description:
      'Prototyping — the AI is generating a quick prototype. Review it and provide feedback to iterate.',
  },
};

/** State-based inline-start border overrides (takes precedence over lifecycle). */
export const stateBorderColors: Partial<Record<FeatureNodeState, string>> = {
  blocked: 'border-s-gray-400',
  error: 'border-s-red-500',
  deleting: 'border-s-gray-300',
};

/** State-based accent bar overrides (takes precedence over lifecycle). */
export const stateAccentColors: Partial<Record<FeatureNodeState, string>> = {
  blocked: 'bg-gray-400',
  error: 'bg-red-500',
  deleting: 'bg-gray-300',
};

/** Present-participle verbs for the running badge, keyed by lifecycle phase. */
export const lifecycleRunningVerbs: Record<FeatureLifecyclePhase, string> = {
  pending: 'Waiting to start',
  requirements: 'Analyzing',
  research: 'Researching',
  implementation: 'Implementing',
  review: 'Reviewing',
  awaitingUpstream: 'Awaiting upstream',
  deploy: 'Deploying',
  maintain: 'Maintaining',
  exploring: 'Prototyping',
};

export interface FeatureNodeData {
  [key: string]: unknown;
  name: string;
  description?: string;
  featureId: string;
  lifecycle: FeatureLifecyclePhase;
  state: FeatureNodeState;
  progress: number;
  /** Absolute path to the repository on disk */
  repositoryPath: string;
  /** Git branch name for this feature */
  branch: string;
  /** Absolute path to the git worktree for this feature (sessions use this path) */
  worktreePath?: string;
  /** Absolute path to the specs folder on disk */
  specPath?: string;
  /** Epoch ms when the current agent run started (for elapsed-time in sidebar) */
  startedAt?: number;
  /** Human-readable runtime for done state (e.g. "2h 15m") */
  runtime?: string;
  /** Feature name this node is blocked by */
  blockedBy?: string;
  /** Short error message for error state */
  errorMessage?: string;
  /** Whether the feature was created in fast mode (skip SDLC phases). */
  fastMode?: boolean;
  /** Feature execution mode (Regular, Fast, Exploration). */
  mode?: FeatureMode;
  /** Current feedback iteration count in exploration mode. */
  iterationCount?: number;
  /** Agent executor type (e.g. "claude-code", "cursor"). */
  agentType?: AgentTypeValue;
  /** LLM model identifier used for this feature's agent run. */
  modelId?: string;
  /** Feature summary / user query */
  summary?: string;
  /** Epoch ms or ISO string when the feature was created */
  createdAt?: string | number;
  /** Repository display name (e.g. "my-repo") */
  repositoryName?: string;
  /** Remote URL for the repository (HTTPS, suitable for browser linking) */
  remoteUrl?: string;
  /** Base branch the feature was branched from (e.g. "main") */
  baseBranch?: string;
  /** AI-generated one-line description of the feature (from spec artifact) */
  oneLiner?: string;
  /** Original user query that initiated this feature */
  userQuery?: string;
  /** PR metadata for features with an associated pull request */
  pr?: {
    url: string;
    number: number;
    status: PrStatus;
    ciStatus?: CiStatus;
    commitHash?: string;
    mergeable?: boolean;
  };
  /** Approval gates configuration for phase transitions */
  approvalGates?: {
    allowPrd: boolean;
    allowPlan: boolean;
    allowMerge: boolean;
  };
  /** Whether to push branch to remote after implementation */
  push?: boolean;
  /** Whether to open a PR after implementation */
  openPr?: boolean;
  /** Whether CI watch/fix loop is enabled after push */
  ciWatchEnabled?: boolean;
  /** Whether evidence collection is enabled for this feature */
  enableEvidence?: boolean;
  /** Whether evidence is committed to the PR body */
  commitEvidence?: boolean;
  /** Whether to fork the repo and create a PR to upstream */
  forkAndPr?: boolean;
  /** Whether to commit specs into the repository */
  commitSpecs?: boolean;
  /** Whether to hide CI status badges from UI */
  hideCiStatus?: boolean;
  /** Whether the feature has an associated agent run (for log tab visibility) */
  hasAgentRun?: boolean;
  /** Whether the feature has plan data available */
  hasPlan?: boolean;
  /** Deployment status for features with an active deployment */
  deployment?: {
    status: DeploymentState;
    url?: string;
  };
  onAction?: () => void;
  onSettings?: () => void;
  hasChildren?: boolean;
  /** Whether skill injection was enabled for this feature */
  injectSkills?: boolean;
  /** Skills that were injected into this feature's worktree */
  injectedSkills?: string[];
  onDelete?: (
    featureId: string,
    cleanup?: boolean,
    cascadeDelete?: boolean,
    closePr?: boolean
  ) => void;
  onRetry?: (featureId: string) => void;
  onStart?: (featureId: string) => void;
  onStop?: (featureId: string) => void;
  onArchive?: (featureId: string) => void;
  onUnarchive?: (featureId: string) => void;
  showHandles?: boolean;
}

export type FeatureNodeType = Node<FeatureNodeData, 'featureNode'>;

export interface FeatureNodeStateConfig {
  icon: LucideIcon;
  borderClass: string;
  labelClass: string;
  progressClass: string;
  badgeClass: string;
  badgeBgClass: string;
  label: string;
  showProgressBar: boolean;
}

export const featureNodeStateConfig: Record<FeatureNodeState, FeatureNodeStateConfig> = {
  creating: {
    icon: Loader2,
    borderClass: 'border-s-blue-500',
    labelClass: 'text-blue-500',
    progressClass: 'bg-blue-500',
    badgeClass: 'text-blue-700',
    badgeBgClass: 'bg-blue-50',
    label: 'Creating...',
    showProgressBar: false,
  },
  running: {
    icon: Loader2,
    borderClass: 'border-s-blue-500',
    labelClass: 'text-blue-500',
    progressClass: 'bg-blue-500',
    badgeClass: 'text-blue-700',
    badgeBgClass: 'bg-blue-50',
    label: 'Running',
    showProgressBar: false,
  },
  'action-required': {
    icon: CircleAlert,
    borderClass: 'border-s-amber-500',
    labelClass: 'text-amber-500',
    progressClass: 'bg-amber-500',
    badgeClass: 'text-amber-700',
    badgeBgClass: 'bg-amber-50',
    label: 'User action required',
    showProgressBar: false,
  },
  done: {
    icon: CircleCheck,
    borderClass: 'border-s-emerald-500',
    labelClass: 'text-emerald-500',
    progressClass: 'bg-emerald-500',
    badgeClass: 'text-emerald-700',
    badgeBgClass: 'bg-emerald-50',
    label: 'Done',
    showProgressBar: false,
  },
  blocked: {
    icon: Ban,
    borderClass: 'border-s-gray-400',
    labelClass: 'text-gray-400',
    progressClass: 'bg-gray-400',
    badgeClass: 'text-gray-600',
    badgeBgClass: 'bg-gray-100',
    label: 'Blocked',
    showProgressBar: false,
  },
  pending: {
    icon: Clock,
    borderClass: 'border-s-slate-400',
    labelClass: 'text-slate-400',
    progressClass: 'bg-slate-400',
    badgeClass: 'text-slate-600',
    badgeBgClass: 'bg-slate-100',
    label: 'Pending',
    showProgressBar: false,
  },
  error: {
    icon: CircleX,
    borderClass: 'border-s-red-500',
    labelClass: 'text-red-500',
    progressClass: 'bg-red-500',
    badgeClass: 'text-red-700',
    badgeBgClass: 'bg-red-50',
    label: 'Error',
    showProgressBar: false,
  },
  deleting: {
    icon: Trash2,
    borderClass: 'border-s-gray-400',
    labelClass: 'text-gray-400',
    progressClass: 'bg-gray-400',
    badgeClass: 'text-gray-600',
    badgeBgClass: 'bg-gray-100',
    label: 'Deleting...',
    showProgressBar: false,
  },
  archived: {
    icon: Archive,
    borderClass: 'border-s-gray-500',
    labelClass: 'text-gray-500',
    progressClass: 'bg-gray-500',
    badgeClass: 'text-gray-600',
    badgeBgClass: 'bg-gray-100',
    label: 'Archived',
    showProgressBar: false,
  },
};
