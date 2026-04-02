export type UUID = string;

/**
 * Base model providing identity and timestamp fields for all domain entities
 */
export type BaseEntity = {
  /**
   * Unique identifier for this entity (UUID v4 format)
   */
  id: UUID;
  /**
   * Timestamp when this entity was created (read-only, set by system)
   */
  createdAt: any;
  /**
   * Timestamp when this entity was last updated (read-only, set by system)
   */
  updatedAt: any;
};

/**
 * Entity that supports soft deletion with a deletedAt timestamp
 */
export type SoftDeletableEntity = BaseEntity & {
  /**
   * Timestamp when this entity was soft-deleted (null if not deleted)
   */
  deletedAt?: any;
};

/**
 * Entity with audit trail tracking who created and modified it
 */
export type AuditableEntity = BaseEntity & {
  /**
   * UUID of the user who created this entity (null for system-created)
   */
  createdBy?: UUID;
  /**
   * UUID of the user who last updated this entity (null for system-updated)
   */
  updatedBy?: UUID;
};

/**
 * Request model for conversational AI interactions
 */
export type AskRequest = {
  /**
   * The natural language query to be processed by the AI agent
   */
  query: string;
};

/**
 * Response model for conversational AI interactions
 */
export type AskResponse = {
  /**
   * The AI-generated response content (typically Markdown-formatted)
   */
  content: string;
  /**
   * Whether the operation completed successfully
   */
  success: boolean;
};

/**
 * Acceptance criterion for validating completion of an action item
 */
export type AcceptanceCriteria = BaseEntity & {
  /**
   * Description of what must be true for this criterion to be satisfied
   */
  description: string;
  /**
   * Whether this criterion has been verified as complete
   */
  verified: boolean;
};

/**
 * Granular, atomic step within a Task representing a single unit of work
 */
export type ActionItem = BaseEntity & {
  /**
   * Short name describing the action (verb-noun pattern recommended)
   */
  name: string;
  /**
   * Detailed description of the work to be performed
   */
  description: string;
  /**
   * Git branch name where this action item's work is performed
   */
  branch: string;
  /**
   * Action items that must complete before this one can start
   */
  dependsOn: ActionItem[];
  /**
   * Acceptance criteria for verifying completion of this action item
   */
  acceptanceCriteria: AcceptanceCriteria[];
};
export enum ArtifactCategory {
  PRD = 'PRD',
  API = 'API',
  Design = 'Design',
  Other = 'Other',
}
export enum ArtifactFormat {
  Markdown = 'md',
  Text = 'txt',
  Yaml = 'yaml',
  Other = 'Other',
}
export enum ArtifactState {
  Todo = 'Todo',
  Elaborating = 'Elaborating',
  Done = 'Done',
}

/**
 * Generated document or file attached to a Feature
 */
export type Artifact = BaseEntity & {
  /**
   * Human-readable name identifying this artifact
   */
  name: string;
  /**
   * Type description providing additional context (e.g., 'documentation', 'api-spec')
   */
  type: string;
  /**
   * Category classification (PRD, API, Design, or Other)
   */
  category: ArtifactCategory;
  /**
   * File format for the artifact content
   */
  format: ArtifactFormat;
  /**
   * Brief summary of the artifact's content and purpose
   */
  summary: string;
  /**
   * Relative file path where the artifact is stored
   */
  path: string;
  /**
   * Current state in the artifact generation lifecycle
   */
  state: ArtifactState;
};
export enum MessageRole {
  Assistant = 'assistant',
  User = 'user',
}

/**
 * A message in a conversation thread between user and AI assistant
 */
export type Message = BaseEntity & {
  /**
   * Role of the message sender (User or Assistant)
   */
  role: MessageRole;
  /**
   * The text content of the message
   */
  content: string;
  /**
   * Optional choices presented to the user for selection
   */
  options?: string[];
  /**
   * Optional user's freeform text answer
   */
  answer?: string;
  /**
   * Optional index of the selected option from the options array (0-based)
   */
  selectedOption?: number;
};
export enum RequirementType {
  Functional = 'Functional',
  NonFunctional = 'NonFunctional',
}
export enum ResearchState {
  NotStarted = 'NotStarted',
  Running = 'Running',
  Finished = 'Finished',
}

/**
 * A research topic exploration for gathering technical information
 */
export type Research = BaseEntity & {
  /**
   * The topic or subject being researched
   */
  topic: string;
  /**
   * Current state of the research activity (NotStarted, Running, Finished)
   */
  state: ResearchState;
  /**
   * Summary of research findings and recommendations
   */
  summary: string;
  /**
   * Artifacts produced during the research activity
   */
  artifacts: Artifact[];
};

/**
 * A user or inferred requirement attached to a feature
 */
export type Requirement = BaseEntity & {
  /**
   * URL-friendly short identifier for the requirement
   */
  slug: string;
  /**
   * The original user query that generated this requirement
   */
  userQuery: string;
  /**
   * Classification type of the requirement (Functional or NonFunctional)
   */
  type: RequirementType;
  /**
   * Research activities conducted to clarify or validate this requirement
   */
  researches: Research[];
};

/**
 * AI model configuration for the SDLC agent
 */
export type ModelConfiguration = {
  /**
   * Default model identifier for all agents
   */
  default: string;
};
export enum Language {
  English = 'en',
  Russian = 'ru',
  Portuguese = 'pt',
  Spanish = 'es',
  Arabic = 'ar',
  Hebrew = 'he',
  French = 'fr',
  German = 'de',
}

/**
 * User profile information
 */
export type UserProfile = {
  /**
   * User's display name (optional)
   */
  name?: string;
  /**
   * User's email address (optional)
   */
  email?: string;
  /**
   * GitHub username (optional, for PR attribution)
   */
  githubUsername?: string;
  /**
   * Preferred UI language (default: English)
   */
  preferredLanguage?: Language;
};
export enum EditorType {
  VsCode = 'vscode',
  Cursor = 'cursor',
  Windsurf = 'windsurf',
  Zed = 'zed',
  Antigravity = 'antigravity',
}
export enum TerminalType {
  System = 'system',
  Warp = 'warp',
  ITerm2 = 'iterm2',
  Alacritty = 'alacritty',
  Kitty = 'kitty',
}

/**
 * Environment and tooling preferences
 */
export type EnvironmentConfig = {
  /**
   * Preferred code editor
   */
  defaultEditor: EditorType;
  /**
   * Preferred shell
   */
  shellPreference: string;
  /**
   * Preferred terminal emulator
   */
  terminalPreference: TerminalType;
  /**
   * Default directory for cloning GitHub repositories (e.g. ~/repos)
   */
  defaultCloneDirectory?: string;
};

/**
 * System configuration
 */
export type SystemConfig = {
  /**
   * CLI auto-update preference
   */
  autoUpdate: boolean;
  /**
   * Log level for CLI output
   */
  logLevel: string;
};

/**
 * Default approval gate settings for new features
 */
export type ApprovalGateDefaults = {
  /**
   * Auto-approve requirements phase (default: false)
   */
  allowPrd: boolean;
  /**
   * Auto-approve planning phase (default: false)
   */
  allowPlan: boolean;
  /**
   * Auto-approve merge phase (default: false)
   */
  allowMerge: boolean;
  /**
   * Push branch to remote on implementation complete (default: false)
   */
  pushOnImplementationComplete: boolean;
};

/**
 * Per-stage timeout overrides for the feature agent workflow (all values in milliseconds)
 */
export type StageTimeouts = {
  /**
   * Timeout for the analyze stage (default: 600000)
   */
  analyzeMs?: number;
  /**
   * Timeout for the requirements stage (default: 600000)
   */
  requirementsMs?: number;
  /**
   * Timeout for the research stage (default: 600000)
   */
  researchMs?: number;
  /**
   * Timeout for the plan stage (default: 600000)
   */
  planMs?: number;
  /**
   * Timeout for the implement stage (default: 1800000)
   */
  implementMs?: number;
  /**
   * Timeout for the fast-implement stage (default: 1800000)
   */
  fastImplementMs?: number;
  /**
   * Timeout for the merge stage (default: 1800000)
   */
  mergeMs?: number;
};

/**
 * Timeout overrides for the analyze-repository agent (all values in milliseconds)
 */
export type AnalyzeRepoTimeouts = {
  /**
   * Timeout for the repository analysis stage (default: 600000)
   */
  analyzeMs?: number;
};
export enum SkillSourceType {
  Local = 'local',
  Remote = 'remote',
}

/**
 * A skill source for injection into feature worktrees
 */
export type SkillSource = {
  /**
   * Unique skill directory name (e.g. 'architecture-reviewer')
   */
  name: string;
  /**
   * How this skill is provisioned (local copy or remote install)
   */
  type: SkillSourceType;
  /**
   * Source path (local) or npm package/URL (remote)
   */
  source: string;
  /**
   * Remote skill name passed to --skill flag (remote type only)
   */
  remoteSkillName?: string;
};

/**
 * Skill injection configuration for feature worktrees
 */
export type SkillInjectionConfig = {
  /**
   * Whether skill injection is enabled (default: false, opt-in)
   */
  enabled: boolean;
  /**
   * List of skills to inject into feature worktrees
   */
  skills: SkillSource[];
};

/**
 * Global workflow configuration defaults
 */
export type WorkflowConfig = {
  /**
   * Create PR on implementation complete (default: false)
   */
  openPrOnImplementationComplete: boolean;
  /**
   * Default approval gate preferences for new features
   */
  approvalGateDefaults: ApprovalGateDefaults;
  /**
   * Enable CI watch/fix loop after push (default: true)
   */
  ciWatchEnabled: boolean;
  /**
   * Maximum number of CI fix/push/watch iterations before giving up (default: 3)
   */
  ciMaxFixAttempts?: number;
  /**
   * Timeout in milliseconds for watching a CI run (default: 600000 = 10 minutes)
   */
  ciWatchTimeoutMs?: number;
  /**
   * Maximum characters of CI failure logs to pass to the executor (default: 50000)
   */
  ciLogMaxChars?: number;
  /**
   * Poll interval in seconds for gh run watch (default: 30)
   */
  ciWatchPollIntervalSeconds?: number;
  /**
   * Per-stage timeout overrides for the feature agent (default: 600000 = 10 minutes per stage)
   */
  stageTimeouts?: StageTimeouts;
  /**
   * Timeout overrides for the analyze-repository agent (default: 600000 = 10 minutes)
   */
  analyzeRepoTimeouts?: AnalyzeRepoTimeouts;
  /**
   * Enable evidence collection after implementation (default: false)
   */
  enableEvidence: boolean;
  /**
   * Commit evidence to PR (default: false, requires enableEvidence)
   */
  commitEvidence: boolean;
  /**
   * Maximum number of evidence collection retry attempts when validation fails (default: 3)
   */
  evidenceRetries?: number;
  /**
   * Hide CI status badges from UI (default: true)
   */
  hideCiStatus?: boolean;
  /**
   * Default feature mode for new features: 'Regular', 'Fast', or 'Exploration' (default: 'Fast')
   */
  defaultMode: string;
  /**
   * Maximum exploration feedback iterations (default: 10, 0 = unlimited)
   */
  explorationMaxIterations?: number;
  /**
   * Minutes after completion before auto-archiving a feature (default: 10, 0 = disabled)
   */
  autoArchiveDelayMinutes?: number;
  /**
   * Skill injection configuration (optional, disabled by default)
   */
  skillInjection?: SkillInjectionConfig;
};
export enum AgentType {
  ClaudeCode = 'claude-code',
  CodexCli = 'codex-cli',
  GeminiCli = 'gemini-cli',
  Aider = 'aider',
  Continue = 'continue',
  Cursor = 'cursor',
  Dev = 'dev',
}
export enum AgentAuthMethod {
  Session = 'session',
  Token = 'token',
}

/**
 * AI coding agent configuration
 */
export type AgentConfig = {
  /**
   * Selected AI coding agent
   */
  type: AgentType;
  /**
   * Authentication method for the agent
   */
  authMethod: AgentAuthMethod;
  /**
   * API token for token-based auth (optional)
   */
  token?: string;
};

/**
 * Notification channel enable/disable configuration
 */
export type NotificationChannelConfig = {
  /**
   * Whether this notification channel is enabled
   */
  enabled: boolean;
};

/**
 * Notification event type filters
 */
export type NotificationEventConfig = {
  /**
   * Notify when agent starts running
   */
  agentStarted: boolean;
  /**
   * Notify when agent completes a workflow phase
   */
  phaseCompleted: boolean;
  /**
   * Notify when agent is waiting for human approval
   */
  waitingApproval: boolean;
  /**
   * Notify when agent completes successfully
   */
  agentCompleted: boolean;
  /**
   * Notify when agent execution fails
   */
  agentFailed: boolean;
  /**
   * Notify when a pull request is merged on GitHub
   */
  prMerged: boolean;
  /**
   * Notify when a pull request is closed without merging on GitHub
   */
  prClosed: boolean;
  /**
   * Notify when pull request CI checks pass
   */
  prChecksPassed: boolean;
  /**
   * Notify when pull request CI checks fail
   */
  prChecksFailed: boolean;
  /**
   * Notify when pull request has merge conflicts
   */
  prBlocked: boolean;
  /**
   * Notify when feature is ready for merge review
   */
  mergeReviewReady: boolean;
};

/**
 * Notification preferences for agent lifecycle events
 */
export type NotificationPreferences = {
  /**
   * In-app toast notification channel (Sonner)
   */
  inApp: NotificationChannelConfig;
  /**
   * Browser push notification channel (Web Notifications API)
   */
  browser: NotificationChannelConfig;
  /**
   * Desktop OS notification channel (node-notifier)
   */
  desktop: NotificationChannelConfig;
  /**
   * Which event types trigger notifications
   */
  events: NotificationEventConfig;
};

/**
 * Feature flag toggles for runtime feature control
 */
export type FeatureFlags = {
  /**
   * Enable Skills navigation and functionality in the web UI
   */
  skills: boolean;
  /**
   * Enable environment deployment features in the web UI
   */
  envDeploy: boolean;
  /**
   * Enable debug UI elements and verbose client-side logging
   */
  debug: boolean;
  /**
   * Enable GitHub repository import in the web UI
   */
  githubImport: boolean;
  /**
   * Enable adopt branch feature to import existing branches as tracked features
   */
  adoptBranch: boolean;
  /**
   * Enable git rebase-on-main and sync-main operations in the web UI
   */
  gitRebaseSync: boolean;
  /**
   * Use the built-in React file manager instead of the native OS folder picker
   */
  reactFileManager: boolean;
  /**
   * Enable the Inventory page showing all repositories and features
   */
  inventory: boolean;
};

/**
 * Interactive agent chat tab configuration
 */
export type InteractiveAgentConfig = {
  /**
   * Whether the interactive agent Chat tab is enabled (default: true)
   */
  enabled: boolean;
  /**
   * Idle timeout in minutes before auto-stopping the agent (default: 15, range: 1-120)
   */
  autoTimeoutMinutes: number;
  /**
   * Maximum number of concurrent active interactive sessions (default: 3)
   */
  maxConcurrentSessions: number;
};

/**
 * FAB (floating action button) layout configuration
 */
export type FabLayoutConfig = {
  /**
   * Swap Create and Chat FAB positions (default: false)
   */
  swapPosition: boolean;
};

/**
 * Global Shep platform settings (singleton)
 */
export type Settings = BaseEntity & {
  /**
   * AI model configuration for different agents
   */
  models: ModelConfiguration;
  /**
   * User profile information
   */
  user: UserProfile;
  /**
   * Environment and tooling preferences
   */
  environment: EnvironmentConfig;
  /**
   * System-level parameters
   */
  system: SystemConfig;
  /**
   * AI coding agent selection and authentication
   */
  agent: AgentConfig;
  /**
   * Notification preferences for agent lifecycle events
   */
  notifications: NotificationPreferences;
  /**
   * Global workflow configuration defaults
   */
  workflow: WorkflowConfig;
  /**
   * Feature flag toggles for runtime feature control
   */
  featureFlags?: FeatureFlags;
  /**
   * Whether first-run onboarding has been completed (default: false)
   */
  onboardingComplete: boolean;
  /**
   * Interactive agent chat configuration (optional, defaults applied at runtime)
   */
  interactiveAgent?: InteractiveAgentConfig;
  /**
   * FAB layout configuration (optional, defaults applied at runtime)
   */
  fabLayout?: FabLayoutConfig;
};
export enum TaskState {
  Todo = 'Todo',
  WIP = 'Work in Progress',
  Done = 'Done',
  Review = 'Review',
}

/**
 * A discrete unit of work within an implementation plan
 */
export type Task = BaseEntity & {
  /**
   * Optional human-readable title for the task
   */
  title?: string;
  /**
   * Optional detailed description of what the task entails
   */
  description?: string;
  /**
   * Tasks that must be completed before this task can begin
   */
  dependsOn: Task[];
  /**
   * Granular action items that comprise this task
   */
  actionItems: ActionItem[];
  /**
   * The base branch from which this task's working branch was created
   */
  baseBranch: string;
  /**
   * Current state of task execution (Todo, WIP, Review, Done)
   */
  state: TaskState;
  /**
   * Git branch where work for this task is performed
   */
  branch: string;
};

/**
 * A significant event in the feature's timeline tracking user interactions and milestones
 */
export type TimelineEvent = BaseEntity & {
  /**
   * The user query or action that triggered this timeline event
   */
  userQuery: string;
  /**
   * Timestamp when this event occurred (read-only, set by system)
   */
  timestamp: any;
};
export enum PlanState {
  Requirements = 'Requirements',
  ClarificationRequired = 'ClarificationRequired',
  Ready = 'Ready',
}

/**
 * Individual task representation within a Gantt chart visualization
 */
export type GanttTask = {
  /**
   * Unique identifier for the Gantt task
   */
  id: UUID;
  /**
   * Display name of the task shown in the Gantt chart
   */
  name: string;
  /**
   * Scheduled start time for the task
   */
  start: any;
  /**
   * Scheduled end time for the task
   */
  end: any;
  /**
   * IDs of tasks that this task depends on (must complete before this task can start)
   */
  dependencies: UUID[];
  /**
   * Completion progress as a fraction (0.0 = not started, 1.0 = complete)
   */
  progress: number;
};

/**
 * Container for Gantt chart visualization data including tasks and time bounds
 */
export type GanttViewData = {
  /**
   * Collection of tasks to display in the Gantt chart
   */
  tasks: GanttTask[];
  /**
   * Start date of the overall work plan (left boundary of the chart)
   */
  startDate: any;
  /**
   * End date of the overall work plan (right boundary of the chart)
   */
  endDate: any;
};

/**
 * Implementation plan for a feature containing tasks, artifacts, and requirements
 */
export type Plan = BaseEntity & {
  /**
   * High-level overview describing the implementation approach
   */
  overview: string;
  /**
   * User and inferred requirements that this plan addresses
   */
  requirements: Requirement[];
  /**
   * Documents and artifacts to be produced as part of this plan
   */
  artifacts: Artifact[];
  /**
   * Work items (tasks) that comprise this implementation plan
   */
  tasks: Task[];
  /**
   * Current state of the plan execution lifecycle
   */
  state: PlanState;
  /**
   * Optional Gantt chart visualization data for work scheduling
   */
  workPlan?: GanttViewData;
};
export enum SdlcLifecycle {
  Started = 'Started',
  Analyze = 'Analyze',
  Requirements = 'Requirements',
  Research = 'Research',
  Planning = 'Planning',
  Implementation = 'Implementation',
  Review = 'Review',
  Maintain = 'Maintain',
  Blocked = 'Blocked',
  Pending = 'Pending',
  Exploring = 'Exploring',
  Deleting = 'Deleting',
  AwaitingUpstream = 'AwaitingUpstream',
  Archived = 'Archived',
}
export enum FeatureMode {
  Regular = 'Regular',
  Fast = 'Fast',
  Exploration = 'Exploration',
}

/**
 * Configuration for human-in-the-loop approval gates
 */
export type ApprovalGates = {
  /**
   * Skip human review after requirements phase
   */
  allowPrd: boolean;
  /**
   * Skip human review after plan phase
   */
  allowPlan: boolean;
  /**
   * Skip human review after merge phase
   */
  allowMerge: boolean;
};
export enum PrStatus {
  Open = 'Open',
  Merged = 'Merged',
  Closed = 'Closed',
}
export enum CiStatus {
  Pending = 'Pending',
  Success = 'Success',
  Failure = 'Failure',
}

/**
 * Record of one CI fix attempt in the watch/fix loop
 */
export type CiFixRecord = {
  /**
   * 1-based attempt number
   */
  attempt: number;
  /**
   * ISO timestamp when this attempt started
   */
  startedAt: string;
  /**
   * First 500 chars of failure logs for this attempt
   */
  failureSummary: string;
  /**
   * Outcome of this attempt: fixed, failed, or timeout
   */
  outcome: string;
};

/**
 * Pull request tracking data for a feature
 */
export type PullRequest = {
  /**
   * GitHub PR URL
   */
  url: string;
  /**
   * GitHub PR number
   */
  number: number;
  /**
   * Current PR status
   */
  status: PrStatus;
  /**
   * Final commit SHA after push
   */
  commitHash?: string;
  /**
   * CI pipeline status
   */
  ciStatus?: CiStatus;
  /**
   * Number of CI fix attempts made
   */
  ciFixAttempts?: number;
  /**
   * History of CI fix attempts
   */
  ciFixHistory?: CiFixRecord[];
  /**
   * Whether the PR can be merged (false = merge conflicts)
   */
  mergeable?: boolean;
  /**
   * URL of the PR created on the upstream repo (fork-and-PR flow only)
   */
  upstreamPrUrl?: string;
  /**
   * PR number on the upstream repo
   */
  upstreamPrNumber?: number;
  /**
   * Status of the upstream PR
   */
  upstreamPrStatus?: PrStatus;
};

/**
 * File attachment metadata for a feature (value object, embedded in Feature)
 */
export type Attachment = {
  /**
   * Unique identifier for this attachment (UUID v4)
   */
  id: UUID;
  /**
   * Original filename of the attached file
   */
  name: string;
  /**
   * File size in bytes
   */
  size: bigint;
  /**
   * MIME type of the file (e.g. image/png, application/pdf)
   */
  mimeType: string;
  /**
   * File path relative to the repository root
   */
  path: string;
  /**
   * Timestamp when the attachment was created
   */
  createdAt: any;
  /**
   * Optional user notes or annotations for this attachment
   */
  notes?: string;
};

/**
 * Central entity tracking a piece of work through the SDLC lifecycle (Aggregate Root)
 */
export type Feature = SoftDeletableEntity & {
  /**
   * Human-readable name identifying this feature
   */
  name: string;
  /**
   * The exact user input that initiated this feature, preserved verbatim
   */
  userQuery: string;
  /**
   * URL-friendly identifier derived from name (unique within repository)
   */
  slug: string;
  /**
   * Detailed description explaining the feature's purpose and scope
   */
  description: string;
  /**
   * Absolute file system path to the repository
   */
  repositoryPath: string;
  /**
   * Git branch name where this feature's work is performed
   */
  branch: string;
  /**
   * Current stage in the SDLC lifecycle
   */
  lifecycle: SdlcLifecycle;
  /**
   * Conversation history with the AI assistant
   */
  messages: Message[];
  /**
   * Implementation plan containing tasks, artifacts, and requirements (optional)
   */
  plan?: Plan;
  /**
   * Generated documents and artifacts attached to this feature
   */
  relatedArtifacts: Artifact[];
  /**
   * Associated agent run ID for process tracking (optional)
   */
  agentRunId?: string;
  /**
   * Skills that were injected into this feature's worktree during creation
   */
  injectedSkills?: string[];
  /**
   * Absolute path to the feature spec directory inside the worktree
   */
  specPath?: string;
  /**
   * ID of the Repository entity this feature belongs to
   */
  repositoryId?: UUID;
  /**
   * Execution mode determining the workflow: Regular (full SDLC), Fast (direct implementation), or Exploration (iterative prototyping)
   */
  mode: FeatureMode;
  /**
   * Push branch to remote after implementation (default: false)
   */
  push: boolean;
  /**
   * Create PR after implementation (default: false)
   */
  openPr: boolean;
  /**
   * Fork repo and create PR to upstream at merge time (default: false)
   */
  forkAndPr: boolean;
  /**
   * Commit specs/evidences into the repo (defaults false when forkAndPr is enabled)
   */
  commitSpecs: boolean;
  /**
   * Enable CI watch/fix loop after push (default: true)
   */
  ciWatchEnabled: boolean;
  /**
   * Enable evidence collection after implementation (default: false)
   */
  enableEvidence: boolean;
  /**
   * Inject curated skills into the feature worktree (default: false)
   */
  injectSkills: boolean;
  /**
   * Commit evidence to PR (default: false, requires enableEvidence)
   */
  commitEvidence: boolean;
  /**
   * Approval gates configuration (embedded value object)
   */
  approvalGates: ApprovalGates;
  /**
   * Absolute path to the git worktree for this feature
   */
  worktreePath?: string;
  /**
   * Current feedback iteration count in exploration mode (0 when not exploring)
   */
  iterationCount: number;
  /**
   * Maximum allowed iterations for exploration mode (only set when mode is Exploration)
   */
  maxIterations?: number;
  /**
   * Pull request data (null until PR created)
   */
  pr?: PullRequest;
  /**
   * Parent feature ID for dependency tracking (optional)
   */
  parentId?: UUID;
  /**
   * Lifecycle state prior to archiving, used to restore on unarchive (only set when lifecycle is Archived)
   */
  previousLifecycle?: SdlcLifecycle;
  /**
   * Files attached by the user when creating or messaging this feature
   */
  attachments?: Attachment[];
};

/**
 * External link with title and URL
 */
export type RelatedLink = {
  /**
   * Human-readable title describing the linked resource
   */
  title: string;
  /**
   * URL to the external documentation, reference, or resource
   */
  url: string;
};

/**
 * Option for resolving an open question
 */
export type QuestionOption = {
  /**
   * The option text describing the potential approach or answer
   */
  option: string;
  /**
   * Description explaining this option's benefits and approach
   */
  description: string;
  /**
   * Whether this option was the one ultimately selected
   */
  selected: boolean;
};

/**
 * Open question with resolution via options or direct answer
 */
export type OpenQuestion = {
  /**
   * The question text that needs to be answered
   */
  question: string;
  /**
   * Whether this question has been resolved (false = blocking)
   */
  resolved: boolean;
  /**
   * Structured options for resolving this question (spec.yaml pattern)
   */
  options?: QuestionOption[];
  /**
   * Rationale explaining which option was selected and why
   */
  selectionRationale?: string;
  /**
   * Free-text answer or resolution (research.yaml pattern)
   */
  answer?: string;
};

/**
 * Base entity for spec artifacts with common metadata fields
 */
export type SpecArtifactBase = BaseEntity & {
  /**
   * Artifact title / feature name
   */
  name: string;
  /**
   * Short description of the artifact's purpose
   */
  summary: string;
  /**
   * Raw Markdown body containing the human-written spec content
   */
  content: string;
  /**
   * Key technologies mentioned or evaluated in this artifact
   */
  technologies: string[];
  /**
   * References to other spec IDs (e.g., '008-agent-configuration')
   */
  relatedFeatures: string[];
  /**
   * URLs to external documentation, references, or comparisons
   */
  relatedLinks: RelatedLink[];
  /**
   * Structured open questions for validation gate checks
   */
  openQuestions: OpenQuestion[];
};

/**
 * Technology or approach decision with rationale
 */
export type TechDecision = {
  /**
   * Title or name of the decision being made
   */
  title: string;
  /**
   * The chosen technology, library, or approach
   */
  chosen: string;
  /**
   * Alternative options that were considered but rejected
   */
  rejected: string[];
  /**
   * Rationale explaining why the chosen option was selected
   */
  rationale: string;
};

/**
 * Rejection feedback entry for iteration tracking
 */
export type RejectionFeedbackEntry = {
  /**
   * Iteration number (1-based)
   */
  iteration: number;
  /**
   * User's feedback message explaining what needs to change
   */
  message: string;
  /**
   * Which phase was rejected (e.g. 'requirements', 'plan')
   */
  phase?: string;
  /**
   * When the rejection occurred
   */
  timestamp: any;
  /**
   * File attachment paths included with the rejection feedback
   */
  attachments?: string[];
};

/**
 * Implementation phase grouping related tasks
 */
export type PlanPhase = {
  /**
   * Unique identifier for this phase (e.g., 'phase-1')
   */
  id: string;
  /**
   * Display name of the phase
   */
  name: string;
  /**
   * Description of what this phase accomplishes and why it's ordered this way
   */
  description?: string;
  /**
   * Whether tasks in this phase can be executed in parallel
   */
  parallel: boolean;
  /**
   * Task IDs belonging to this phase (e.g., ['task-1', 'task-2']). Optional — not present in plan.yaml phases.
   */
  taskIds?: string[];
};

/**
 * Test-Driven Development cycle phases for a task
 */
export type TddCycle = {
  /**
   * RED phase: tests to write FIRST (before implementation)
   */
  red: string[];
  /**
   * GREEN phase: minimal implementation to pass tests
   */
  green: string[];
  /**
   * REFACTOR phase: code improvements while keeping tests green
   */
  refactor: string[];
};

/**
 * Task definition within a spec's task breakdown
 */
export type SpecTask = {
  /**
   * Unique identifier for this task (e.g., 'task-1')
   */
  id: string;
  /**
   * ID of the phase this task belongs to (e.g., 'phase-1')
   */
  phaseId: string;
  /**
   * Task title or name
   */
  title: string;
  /**
   * Detailed description of what this task accomplishes
   */
  description: string;
  /**
   * Current state of the task
   */
  state: TaskState;
  /**
   * IDs of other SpecTasks that must complete before this task starts
   */
  dependencies: string[];
  /**
   * List of acceptance criteria that define task completion
   */
  acceptanceCriteria: string[];
  /**
   * TDD cycle definition for this task (if applicable)
   */
  tdd?: TddCycle;
  /**
   * Estimated effort (e.g., '2 hours', '1 day')
   */
  estimatedEffort: string;
};

/**
 * Feature specification artifact (PRD) defining requirements and scope
 */
export type FeatureArtifact = SpecArtifactBase & {
  /**
   * Spec number (e.g., 11 for spec 011)
   */
  number: number;
  /**
   * Git branch name for this feature (e.g., 'feat/011-feature-name')
   */
  branch: string;
  /**
   * One-line description of the feature
   */
  oneLiner: string;
  /**
   * Current phase in the SDLC lifecycle
   */
  phase: SdlcLifecycle;
  /**
   * Size estimate: XS, S, M, L, or XL
   */
  sizeEstimate: string;
  /**
   * Rejection feedback history for PRD iterations (append-only)
   */
  rejectionFeedback?: RejectionFeedbackEntry[];
};

/**
 * Research artifact documenting technical analysis and decisions
 */
export type ResearchArtifact = SpecArtifactBase & {
  /**
   * Structured technology decisions with rationale
   */
  decisions: TechDecision[];
};

/**
 * Technical implementation plan artifact defining strategy and file changes
 */
export type TechnicalPlanArtifact = SpecArtifactBase & {
  /**
   * Structured implementation phases
   */
  phases: PlanPhase[];
  /**
   * New files planned to be created
   */
  filesToCreate: string[];
  /**
   * Existing files planned to be modified
   */
  filesToModify: string[];
};

/**
 * Task breakdown artifact defining implementation tasks grouped into phases
 */
export type TasksArtifact = SpecArtifactBase & {
  /**
   * Structured task list with acceptance criteria and TDD phases
   */
  tasks: SpecTask[];
  /**
   * Overall effort estimate for all tasks combined
   */
  totalEstimate: string;
};

/**
 * Feature identity metadata in feature.yaml
 */
export type FeatureIdentity = {
  /**
   * Feature ID slug (e.g., '012-autonomous-pr-review-loop')
   */
  id: string;
  /**
   * Human-readable feature name
   */
  name: string;
  /**
   * Feature number (e.g., 12)
   */
  number: number;
  /**
   * Git branch for this feature
   */
  branch: string;
  /**
   * Current lifecycle phase (e.g., 'research', 'implementation', 'complete')
   */
  lifecycle: string;
  /**
   * When the feature was created
   */
  createdAt: string;
};

/**
 * Task completion progress counters
 */
export type FeatureStatusProgress = {
  /**
   * Number of completed tasks
   */
  completed: number;
  /**
   * Total number of tasks
   */
  total: number;
  /**
   * Completion percentage (0-100)
   */
  percentage: number;
};

/**
 * Feature execution status
 */
export type FeatureStatusInfo = {
  /**
   * Current SDLC phase
   */
  phase: string;
  /**
   * Phases that have been completed
   */
  completedPhases?: string[];
  /**
   * Task completion progress
   */
  progress: FeatureStatusProgress;
  /**
   * ID of the task currently being executed (null if none)
   */
  currentTask?: string;
  /**
   * ISO timestamp of last status update
   */
  lastUpdated: string;
  /**
   * Agent or skill that last updated the status
   */
  lastUpdatedBy: string;
};

/**
 * Validation gate results
 */
export type FeatureValidation = {
  /**
   * ISO timestamp of last validation run (null if never run)
   */
  lastRun?: string;
  /**
   * Names of validation gates that passed
   */
  gatesPassed: string[];
  /**
   * Descriptions of auto-fixes that were applied
   */
  autoFixesApplied: string[];
};

/**
 * Task execution tracking state
 */
export type FeatureTaskTracking = {
  /**
   * ID of the task currently being worked on (null if none)
   */
  current?: string;
  /**
   * IDs of tasks blocked by unmet dependencies
   */
  blocked: string[];
  /**
   * IDs of tasks that failed execution
   */
  failed: string[];
};

/**
 * Milestone checkpoint for phase completion
 */
export type FeatureCheckpoint = {
  /**
   * Phase name (e.g., 'feature-created', 'research-complete')
   */
  phase: string;
  /**
   * ISO timestamp when this checkpoint was reached
   */
  completedAt: string;
  /**
   * Agent or skill that completed this phase
   */
  completedBy: string;
};

/**
 * Error tracking for feature execution
 */
export type FeatureErrors = {
  /**
   * Current error message (null if no active error)
   */
  current?: string;
  /**
   * History of past error messages
   */
  history: string[];
};

/**
 * Feature status tracking artifact (feature.yaml)
 */
export type FeatureStatus = BaseEntity & {
  /**
   * Feature identity metadata
   */
  feature: FeatureIdentity;
  /**
   * Current execution status and progress
   */
  status: FeatureStatusInfo;
  /**
   * PR URL if a pull request has been created
   */
  prUrl?: string;
  /**
   * ISO timestamp when the feature was merged
   */
  mergedAt?: string;
  /**
   * Validation gate results
   */
  validation: FeatureValidation;
  /**
   * Task execution tracking
   */
  tasks: FeatureTaskTracking;
  /**
   * Milestone checkpoints recording phase completions
   */
  checkpoints: FeatureCheckpoint[];
  /**
   * Error tracking state
   */
  errors: FeatureErrors;
};
export enum ToolType {
  VsCode = 'vscode',
  Cursor = 'cursor',
  Windsurf = 'windsurf',
  Zed = 'zed',
  Antigravity = 'antigravity',
  CursorCli = 'cursor-cli',
  ClaudeCode = 'claude-code',
}

/**
 * IDE or CLI tool entity with installation tracking
 */
export type Tool = BaseEntity & {
  /**
   * Display name of the tool
   */
  toolName: string;
  /**
   * Tool type classification
   */
  type: ToolType;
  /**
   * Installed version number
   */
  installedVersion?: string;
  /**
   * Tool installation timestamp
   */
  installedAt?: any;
};
export enum NotificationEventType {
  AgentStarted = 'agent_started',
  PhaseCompleted = 'phase_completed',
  WaitingApproval = 'waiting_approval',
  AgentCompleted = 'agent_completed',
  AgentFailed = 'agent_failed',
  PrMerged = 'pr_merged',
  PrClosed = 'pr_closed',
  PrChecksPassed = 'pr_checks_passed',
  PrChecksFailed = 'pr_checks_failed',
  PrBlocked = 'pr_blocked',
  MergeReviewReady = 'merge_review_ready',
}
export enum NotificationSeverity {
  Info = 'info',
  Warning = 'warning',
  Success = 'success',
  Error = 'error',
}

/**
 * Notification event emitted for agent lifecycle transitions
 */
export type NotificationEvent = {
  /**
   * Type of lifecycle event
   */
  eventType: NotificationEventType;
  /**
   * ID of the agent run that triggered this event
   */
  agentRunId: string;
  /**
   * ID of the feature that triggered this event
   */
  featureId: string;
  /**
   * Human-readable feature name
   */
  featureName: string;
  /**
   * Phase name (only for phaseCompleted events)
   */
  phaseName?: string;
  /**
   * Human-readable event description
   */
  message: string;
  /**
   * Display severity for notification rendering
   */
  severity: NotificationSeverity;
  /**
   * When the event occurred
   */
  timestamp: any;
};

/**
 * A code repository tracked by the Shep platform
 */
export type Repository = SoftDeletableEntity & {
  /**
   * Human-readable name for the repository (typically the directory name)
   */
  name: string;
  /**
   * Absolute file system path to the repository root (unique)
   */
  path: string;
  /**
   * Remote GitHub URL this repository was cloned from (normalized: lowercase, no .git suffix)
   */
  remoteUrl?: string;
};

/**
 * Single installation suggestion for a tool
 */
export type InstallationSuggestion = {
  /**
   * Package manager or installation method
   */
  packageManager: string;
  /**
   * Installation command
   */
  command: string;
  /**
   * Official documentation URL
   */
  documentationUrl: string;
  /**
   * Additional notes for installation
   */
  notes?: string;
};

/**
 * Installation status and suggestions for a tool
 */
export type ToolInstallationStatus = {
  /**
   * Current installation status
   */
  status: 'available' | 'missing' | 'error';
  /**
   * Tool name
   */
  toolName: string;
  /**
   * Error message if status is error
   */
  errorMessage?: string;
  /**
   * Installation suggestions
   */
  suggestions?: InstallationSuggestion[];
};

/**
 * Executable installation command for a tool
 */
export type ToolInstallCommand = {
  /**
   * Shell command string to execute
   */
  command: string;
  /**
   * Target platform identifier
   */
  platform: string;
  /**
   * Execution timeout in milliseconds
   */
  timeout: number;
  /**
   * Tool name
   */
  toolName: string;
  /**
   * Package manager identifier
   */
  packageManager: string;
};
export enum EvidenceType {
  Screenshot = 'Screenshot',
  Video = 'Video',
  TestOutput = 'TestOutput',
  TerminalRecording = 'TerminalRecording',
}

/**
 * Record of evidence captured to prove task completion
 */
export type Evidence = {
  /**
   * Category of evidence captured
   */
  type: EvidenceType;
  /**
   * ISO 8601 timestamp when the evidence was captured
   */
  capturedAt: string;
  /**
   * Human-readable description of what this evidence proves
   */
  description: string;
  /**
   * Path relative to repo root for GitHub rendering
   */
  relativePath: string;
  /**
   * Optional reference to the task this evidence proves
   */
  taskRef?: string;
};
export enum AgentStatus {
  Idle = 'Idle',
  Running = 'Running',
  Paused = 'Paused',
  Stopped = 'Stopped',
}

/**
 * A running agent instance that processes work and responds to queries
 */
export type AgentInstance = {
  /**
   * Unique identifier for this agent instance
   */
  id: UUID;
  /**
   * Git branch this agent is operating on for code changes
   */
  branch: string;
  /**
   * Current operational status of the agent (Idle, Running, Paused, or Stopped)
   */
  status: AgentStatus;
  /**
   * Timestamp when this agent instance was created
   */
  createdAt: any;
};

/**
 * Deployment target wrapping a single ActionItem for granular deployments
 */
export type DeployTargetActionItem = {
  /**
   * Discriminator indicating this is an action item target
   */
  kind: 'actionItem';
  /**
   * The action item to deploy - represents an atomic unit of work
   */
  actionItem: ActionItem;
};

/**
 * Deployment target wrapping a single Task for task-level deployments
 */
export type DeployTargetTask = {
  /**
   * Discriminator indicating this is a task target
   */
  kind: 'task';
  /**
   * The task to deploy - includes all action items within the task
   */
  task: Task;
};

/**
 * Deployment target wrapping multiple Tasks for batch deployments
 */
export type DeployTargetTasks = {
  /**
   * Discriminator indicating this is a multi-task target
   */
  kind: 'tasks';
  /**
   * The tasks to deploy - enables batch deployment of related work
   */
  tasks: Task[];
};
export enum FeatureAgentState {
  GatheringRequirements = 'GatheringRequirements',
  ClarificationsRequired = 'ClarificationsRequired',
  DoingResearch = 'DoingResearch',
  AwaitingReview = 'AwaitingReview',
  ExecutingWorkPlan = 'ExecutingWorkPlan',
  Ready = 'Ready',
}

/**
 * Main orchestrating agent - the 'brain' that manages the complete SDLC workflow for a feature
 */
export type FeatureAgent = {
  /**
   * Unique identifier for this feature agent instance
   */
  id: UUID;
  /**
   * The feature being managed by this agent throughout its lifecycle
   */
  feature: Feature;
  /**
   * Sub-agents spawned to handle specific tasks within the workflow
   */
  agents: AgentInstance[];
  /**
   * Current operational state determining what the agent is doing
   */
  state: FeatureAgentState;
  /**
   * Timestamp when this feature agent was created
   */
  createdAt: any;
};

/**
 * Agent for handling local deployment of features, tasks, or action items
 */
export type LocalDeployAgent = {
  /**
   * Unique identifier for this deployment agent instance
   */
  id: UUID;
  /**
   * URL where the deployment is accessible once available (null before deployment)
   */
  url?: string;
  /**
   * Timestamp when this deployment agent was created
   */
  createdAt: any;
};
export enum PortProtocol {
  TCP = 'TCP',
  UDP = 'UDP',
}

/**
 * Port mapping configuration for exposing container services to the network
 */
export type PortMap = {
  /**
   * Service name identifier (e.g., 'web', 'api', 'db', 'redis')
   */
  name: string;
  /**
   * Port number to expose on the host or container network
   */
  port: number;
  /**
   * Network protocol for the port (defaults to TCP if not specified)
   */
  protocol?: PortProtocol;
};
export enum DeployMethod {
  DockerCompose = 'DockerCompose',
  Docker = 'Docker',
  Kubernetes = 'Kubernetes',
  Script = 'Script',
  Manual = 'Manual',
}

/**
 * Configuration defining how to deploy an application with method and instructions
 */
export type DeploySkill = {
  /**
   * Unique identifier for the deployment skill configuration
   */
  id: UUID;
  /**
   * List of port mappings for services to expose when deployed
   */
  ports: PortMap[];
  /**
   * Method to use for deployment (DockerCompose, Docker, Kubernetes, Script, or Manual)
   */
  method: DeployMethod;
  /**
   * Deployment instructions or commands to execute for this deployment method
   */
  instructions: string;
  /**
   * Timestamp when the deployment skill was created
   */
  createdAt: any;
};
export enum DeploymentState {
  Booting = 'Booting',
  Ready = 'Ready',
  Stopped = 'Stopped',
}

/**
 * A running deployment instance with network configuration and lifecycle management
 */
export type Deployment = {
  /**
   * Unique identifier for the deployment instance
   */
  id: UUID;
  /**
   * Current state of the deployment (Booting, Ready, or Stopped)
   */
  state: DeploymentState;
  /**
   * URL where the deployment is accessible (e.g., 'http://localhost:30100/' or 'http://172.33.0.20:5173')
   */
  url: string;
  /**
   * List of port mappings for services exposed by this deployment
   */
  ports: PortMap[];
  /**
   * Timestamp when the deployment was created
   */
  createdAt: any;
  /**
   * Timestamp when the deployment was stopped (only present when state is Stopped)
   */
  stoppedAt?: any;
};
export enum AgentRunStatus {
  pending = 'pending',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
  interrupted = 'interrupted',
  cancelled = 'cancelled',
  waitingApproval = 'waiting_approval',
}

/**
 * Agent execution run record
 */
export type AgentRun = BaseEntity & {
  /**
   * Agent executor type used (claude-code, gemini-cli, etc.)
   */
  agentType: AgentType;
  /**
   * Agent workflow name (analyze-repository, requirements, etc.)
   */
  agentName: string;
  /**
   * Current execution status
   */
  status: AgentRunStatus;
  /**
   * Input prompt sent to agent executor
   */
  prompt: string;
  /**
   * Final result output (optional, populated on completion)
   */
  result?: string;
  /**
   * Executor session ID for resumption (optional)
   */
  sessionId?: string;
  /**
   * LangGraph thread_id for checkpoint lookup and crash resume
   */
  threadId: string;
  /**
   * Process ID for crash recovery (optional)
   */
  pid?: number;
  /**
   * Last heartbeat timestamp for crash detection (optional)
   */
  lastHeartbeat?: any;
  /**
   * Execution start timestamp (optional)
   */
  startedAt?: any;
  /**
   * Execution completion timestamp (optional)
   */
  completedAt?: any;
  /**
   * Error message if execution failed (optional)
   */
  error?: string;
  /**
   * Associated feature ID for feature agent runs (optional)
   */
  featureId?: string;
  /**
   * Repository path for context scoping (optional)
   */
  repositoryPath?: string;
  /**
   * Approval gate configuration for human-in-the-loop review (optional)
   */
  approvalGates?: ApprovalGates;
  /**
   * LLM model identifier used for this run (optional, set at creation)
   */
  modelId?: string;
};

/**
 * Streaming event emitted during agent execution
 */
export type AgentRunEvent = {
  /**
   * Event type: progress, result, or error
   */
  type: 'progress' | 'result' | 'error';
  /**
   * Event content
   */
  content: string;
  /**
   * Event timestamp
   */
  timestamp: any;
};

/**
 * Agent workflow registration metadata
 */
export type AgentDefinition = {
  /**
   * Unique agent workflow name (e.g., analyze-repository)
   */
  name: string;
  /**
   * Human-readable description of what this agent does
   */
  description: string;
};
export type float = any;
export type float64 = float;

/**
 * Execution record for a single agent graph node. Tracks timing, prompt, token usage, and outcome.
 */
export type PhaseTiming = BaseEntity & {
  /**
   * Agent run this timing belongs to
   */
  agentRunId: string;
  /**
   * Graph node name: analyze, requirements, research, plan, implement
   */
  phase: string;
  /**
   * When the phase started executing
   */
  startedAt: any;
  /**
   * When the phase finished executing (null if still running)
   */
  completedAt?: any;
  /**
   * Duration in milliseconds (computed on completion)
   */
  durationMs?: bigint;
  /**
   * When the phase started waiting for user approval (null if no approval needed)
   */
  waitingApprovalAt?: any;
  /**
   * Duration in milliseconds the phase waited for user approval (null if no approval needed)
   */
  approvalWaitMs?: bigint;
  /**
   * The composed prompt sent to the agent for this phase
   */
  prompt?: string;
  /**
   * Model identifier used for this phase execution
   */
  modelId?: string;
  /**
   * Agent executor type: claude-code, cursor, gemini-cli
   */
  agentType?: string;
  /**
   * Number of input tokens consumed (prompt + context)
   */
  inputTokens?: bigint;
  /**
   * Number of output tokens generated by the agent
   */
  outputTokens?: bigint;
  /**
   * Tokens used to populate the prompt cache (cache misses)
   */
  cacheCreationInputTokens?: bigint;
  /**
   * Tokens served from the prompt cache (cache hits)
   */
  cacheReadInputTokens?: bigint;
  /**
   * Estimated cost in USD for this phase execution
   */
  costUsd?: float64;
  /**
   * Number of agentic turns (tool-call round-trips) in this phase
   */
  numTurns?: number;
  /**
   * Time spent waiting for the API (excludes tool execution)
   */
  durationApiMs?: bigint;
  /**
   * Execution outcome: success, error, timeout, interrupted
   */
  exitCode?: string;
  /**
   * Error details when exitCode is not success
   */
  errorMessage?: string;
};

/**
 * Change to a question's selected option during PRD review
 */
export type QuestionSelectionChange = {
  /**
   * ID of the open question being changed (the question text)
   */
  questionId: string;
  /**
   * The option text that the user selected
   */
  selectedOption: string;
};

/**
 * Payload sent when user approves a PRD with optional selection changes
 */
export type PrdApprovalPayload = {
  /**
   * Always true for approval payloads
   */
  approved: boolean;
  /**
   * List of selection changes the user made during review (empty if no changes)
   */
  changedSelections?: QuestionSelectionChange[];
};

/**
 * Payload sent when user rejects a PRD with feedback for iteration
 */
export type PrdRejectionPayload = {
  /**
   * Always true for rejection payloads
   */
  rejected: boolean;
  /**
   * User's feedback explaining what needs to change
   */
  feedback: string;
  /**
   * Iteration number (1-based, derived from PhaseTiming row count)
   */
  iteration: number;
  /**
   * File attachment paths included with the rejection feedback
   */
  attachments?: string[];
};

/**
 * A single question with its options as presented in the review TUI
 */
export type ReviewQuestion = {
  /**
   * The question text
   */
  question: string;
  /**
   * Available options with selection state
   */
  options: QuestionOption[];
  /**
   * The option text that was selected by the user
   */
  selectedOption: string;
  /**
   * Whether the user changed the selection from the AI default
   */
  changed: boolean;
};

/**
 * Result of the PRD review TUI interaction
 */
export type PrdReviewResult = {
  /**
   * All questions with their final selection state
   */
  questions: ReviewQuestion[];
  /**
   * User action: approve or reject
   */
  action: string;
  /**
   * Rejection feedback (only present when action is 'reject')
   */
  feedback?: string;
};

/**
 * A single message within an agent provider CLI session
 */
export type AgentSessionMessage = {
  /**
   * Provider-native message UUID
   */
  uuid: string;
  /**
   * Message role — user turn or assistant turn
   */
  role: 'user' | 'assistant';
  /**
   * Normalized message content as plain text (tool calls and thinking blocks excluded)
   */
  content: string;
  /**
   * Timestamp when the message was recorded
   */
  timestamp: any;
};

/**
 * An agent provider CLI session (conversation record read from provider local storage)
 */
export type AgentSession = BaseEntity & {
  /**
   * Agent executor type that owns this session (e.g. claude-code)
   */
  agentType: AgentType;
  /**
   * Tilde-abbreviated working directory path for the session (e.g. ~/repos/my-project)
   */
  projectPath: string;
  /**
   * Total number of user and assistant messages in the session
   */
  messageCount: number;
  /**
   * Truncated first user message text used as a session summary preview (optional)
   */
  preview?: string;
  /**
   * Conversation messages — populated only in the detail view (shep session show)
   */
  messages?: AgentSessionMessage[];
  /**
   * Timestamp of the first message in the session (optional)
   */
  firstMessageAt?: any;
  /**
   * Timestamp of the most recent message in the session (optional)
   */
  lastMessageAt?: any;
};
export enum InteractiveSessionStatus {
  booting = 'booting',
  ready = 'ready',
  stopped = 'stopped',
  error = 'error',
}

/**
 * Per-feature interactive agent session record
 */
export type InteractiveSession = BaseEntity & {
  /**
   * Polymorphic scope key: feature UUID, 'repo-<id>', or 'global'. Future: rename to scopeId + scopeType.
   */
  featureId: UUID;
  /**
   * Current lifecycle status of the interactive session
   */
  status: InteractiveSessionStatus;
  /**
   * Timestamp when the agent process was spawned
   */
  startedAt: any;
  /**
   * Timestamp when the session ended (null if still active)
   */
  stoppedAt?: any;
  /**
   * Timestamp of last user message or agent stdout activity
   */
  lastActivityAt: any;
};
export enum InteractiveMessageRole {
  user = 'user',
  assistant = 'assistant',
}

/**
 * A single chat message in a per-feature interactive agent session
 */
export type InteractiveMessage = BaseEntity & {
  /**
   * Polymorphic scope key: feature UUID, 'repo-<id>', or 'global'. Future: rename to scopeId + scopeType.
   */
  featureId: string;
  /**
   * Session ID during which this message was sent (optional)
   */
  sessionId?: string;
  /**
   * Author role: user or assistant
   */
  role: InteractiveMessageRole;
  /**
   * Full message content (finalised after streaming for assistant messages)
   */
  content: string;
};

/**
 * A selectable option within a PRD questionnaire question
 */
export type PrdOption = {
  /**
   * Unique identifier for this option
   */
  id: string;
  /**
   * Display label for this option
   */
  label: string;
  /**
   * Explanation of why this option is relevant
   */
  rationale: string;
  /**
   * Whether this option is recommended by AI analysis
   */
  recommended?: boolean;
  /**
   * Whether this option was newly added after refinement
   */
  isNew?: boolean;
};

/**
 * A single question in the PRD questionnaire with selectable options
 */
export type PrdQuestion = {
  /**
   * Unique identifier for this question
   */
  id: string;
  /**
   * The question text displayed to the user
   */
  question: string;
  /**
   * Question interaction type (currently only single-select)
   */
  type: 'select';
  /**
   * Available options for this question
   */
  options: PrdOption[];
};

/**
 * Configuration for the final action button in the questionnaire
 */
export type PrdFinalAction = {
  /**
   * Unique identifier for this action
   */
  id: string;
  /**
   * Button label text
   */
  label: string;
  /**
   * Description of what this action does
   */
  description: string;
};

/**
 * Complete data for rendering a PRD questionnaire
 */
export type PrdQuestionnaireData = {
  /**
   * Header title text for the questionnaire
   */
  question: string;
  /**
   * Header context/description text
   */
  context: string;
  /**
   * Array of questions to display
   */
  questions: PrdQuestion[];
  /**
   * Configuration for the finalize/approve action button
   */
  finalAction: PrdFinalAction;
};
export enum AgentFeature {
  sessionResume = 'session-resume',
  streaming = 'streaming',
  toolScoping = 'tool-scoping',
  structuredOutput = 'structured-output',
  systemPrompt = 'system-prompt',
  sessionListing = 'session-listing',
}
export type DeployTarget = DeployTargetActionItem | DeployTargetTask | DeployTargetTasks;

export type Askable = {
  Ask(request: AskRequest): AskResponse;
};

export type FeatureAgentOperations = {
  NewFeatureWizard(): Feature;
  GatherRequirements(): Requirement[];
  DoResearch(): Research;
  CreatePlan(): Plan;
  BeginImplementation(): void;
  Ask(query: string): AskResponse;
};

export type LocalDeployAgentOperations = {
  Deploy(target: DeployTarget, skill: DeploySkill): Deployment;
  Analyze(repositoryPath: string): DeploySkill;
  Ask(query: string): AskResponse;
};
