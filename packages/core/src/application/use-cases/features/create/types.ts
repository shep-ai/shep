import type { ApprovalGates, Attachment, Feature } from '../../../../domain/generated/output.js';
import { type FeatureMode } from '../../../../domain/generated/output.js';

export interface CreateFeatureInput {
  userInput: string;
  repositoryPath: string;
  approvalGates?: ApprovalGates;
  push?: boolean;
  openPr?: boolean;
  /** Optional ID of the parent feature. When set, child may be created in Blocked state. */
  parentId?: string;
  /** Pre-supplied name (skips AI metadata extraction for name). */
  name?: string;
  /** Pre-supplied description (skips AI metadata extraction for description). */
  description?: string;
  /** Execution mode: Regular (full SDLC), Fast (direct implementation), or Exploration (iterative prototyping). */
  mode?: FeatureMode;
  /** Fork repo and create PR to upstream at merge time (default: false). */
  forkAndPr?: boolean;
  /** Commit specs/evidences into the repo (default: true, auto-false when forkAndPr). */
  commitSpecs?: boolean;
  /** Enable CI watch/fix loop after push (default: true). */
  ciWatchEnabled?: boolean;
  /** Enable evidence collection after implementation (default: false). */
  enableEvidence?: boolean;
  /** Commit evidence to PR (default: false, requires enableEvidence). */
  commitEvidence?: boolean;
  /** When true, create feature in Pending state — fully initialized but agent not spawned. */
  pending?: boolean;
  /** Optional agent type override (overrides settings.agent.type). */
  agentType?: string;
  /** Optional model identifier forwarded to the agent executor for this invocation. */
  model?: string;
  /** Attachment records to persist with the feature. */
  attachments?: Attachment[];
  /** Session ID for committing pending uploads (web UI flow). */
  sessionId?: string;
  /** Absolute file paths to attach (CLI --attach flow). */
  attachmentPaths?: string[];
  /** Sync the default branch from remote before creating the feature branch (default: true). */
  rebaseBeforeBranch?: boolean;
  /** Inject curated skills into the worktree (overrides settings.workflow.skillInjection.enabled). */
  injectSkills?: boolean;
}

export interface CreateFeatureResult {
  feature: Feature;
  warning?: string;
}

/** Result of the fast createRecord phase (before metadata/worktree/agent). */
export interface CreateRecordResult {
  feature: Feature;
  /** Whether the agent should be spawned (false when child is blocked). */
  shouldSpawn: boolean;
}
