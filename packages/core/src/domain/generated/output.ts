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
  Ukrainian = 'uk',
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
   * Default new features to fast mode (default: true)
   */
  defaultFastMode: boolean;
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
  CopilotCli = 'copilot-cli',
  GeminiCli = 'gemini-cli',
  Aider = 'aider',
  Continue = 'continue',
  Cursor = 'cursor',
  Cline = 'cline',
  OpenRouter = 'openrouter',
  TogetherAi = 'together-ai',
  Ollama = 'ollama',
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
  /**
   * Notify when cloud deployment status changes (spec 089)
   */
  cloudDeploymentUpdated?: boolean;
  /**
   * Notify when application row changes (setupComplete, status, gitRemoteUrl, cloudDeploymentProvider — spec 090)
   */
  applicationUpdated?: boolean;
  /**
   * Notify when a new operation log entry is appended (spec 090)
   */
  operationLogAppended?: boolean;
  /**
   * Notify when a non-blocking AgentQuestion is raised by a running agent (spec 093). Default OFF — info-tier events go to the activity feed only unless the user opts in.
   */
  agentQuestionPending?: boolean;
  /**
   * Notify when a blocking AgentQuestion pauses an agent and requires an answer (spec 093). Default ON — blocking-tier events MUST reach the user.
   */
  agentQuestionBlocking?: boolean;
  /**
   * Notify when an inter-agent message is rejected or undeliverable (spec 093). Default OFF — info-tier event.
   */
  agentMessageBlocked?: boolean;
  /**
   * Notify when the supervisor escalates a decision back to the user (spec 093). Default ON — actionable.
   */
  supervisorEscalated?: boolean;
  /**
   * Notify when the supervisor evaluator fails and the system falls back to standard human approval (spec 093, FR-22). Default ON — actionable.
   */
  supervisorFailed?: boolean;
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
   * Enable environment deployment features in the web UI
   */
  envDeploy: boolean;
  /**
   * Enable debug UI elements and verbose client-side logging
   */
  debug: boolean;
  /**
   * Use the built-in React file manager instead of the native OS folder picker
   */
  reactFileManager: boolean;
  /**
   * Enable Projects pages and navigation (project management)
   */
  projects: boolean;
  /**
   * Enable AI-powered code review for pull requests
   */
  codeReview: boolean;
  /**
   * Enable agent collaboration, supervisor agent, and unified question pipeline (spec 093)
   */
  collaboration: boolean;
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
export enum SupervisorAutonomy {
  advisory = 'advisory',
  cosign = 'cosign',
  autonomous = 'autonomous',
}

/**
 * Supervisor agent default configuration (spec 093)
 */
export type SupervisorConfig = {
  /**
   * Whether a supervisor is enabled by default for newly created apps
   */
  enabled: boolean;
  /**
   * Default autonomy level (advisory by default)
   */
  autonomyLevel: SupervisorAutonomy;
  /**
   * Default LLM model identifier (resolved through IAgentExecutorProvider)
   */
  modelId?: string;
  /**
   * Default evaluator prompt version marker
   */
  promptVersion?: string;
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
export enum DefaultHomePage {
  ControlCenter = 'control-center',
  Applications = 'applications',
  Features = 'features',
}

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
  /**
   * Supervisor agent default configuration (optional, defaults applied at runtime)
   */
  supervisor?: SupervisorConfig;
  /**
   * Default landing page when opening the web UI (default: control-center)
   */
  defaultHomePage?: DefaultHomePage;
};
export enum SupervisorScopeType {
  global = 'global',
  repo = 'repo',
  app = 'app',
}

/**
 * Supervisor policy with cascading scope: global → repo → app → feature
 */
export type SupervisorPolicy = BaseEntity & {
  /**
   * Level at which this policy applies (global, repo, or app)
   */
  scopeType: SupervisorScopeType;
  /**
   * Scope identifier — app or repo UUID (null for global policies)
   */
  scopeId?: string;
  /**
   * Feature scope identifier (optional per-feature override)
   */
  featureId?: string;
  /**
   * Master enable toggle
   */
  enabled: boolean;
  /**
   * Default autonomy level (advisory by default)
   */
  autonomyLevel: SupervisorAutonomy;
  /**
   * JSON map: per-gate autonomy override (e.g. { prd: 'advisory', merge: 'autonomous' })
   */
  gateAuthorityJson?: string;
  /**
   * LLM model identifier resolved through IAgentExecutorProvider
   */
  modelId?: string;
  /**
   * Evaluator prompt version marker for audit reproducibility
   */
  promptVersion?: string;
  /**
   * JSON array of structured policy rules
   */
  policyRulesJson?: string;
  /**
   * JSON object overriding the user's notification preferences for supervisor events
   */
  notificationOverridesJson?: string;
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
  Deleting = 'Deleting',
  AwaitingUpstream = 'AwaitingUpstream',
  Archived = 'Archived',
}
export enum BuildMode {
  Application = 'application',
  Fast = 'fast',
  Spec = 'spec',
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
   * Parent application ID when this feature was launched scoped to an Application (optional)
   */
  applicationId?: UUID;
  /**
   * Build mode controlling which SDLC pipeline the feature follows
   */
  buildMode: BuildMode;
  /**
   * When true, SDLC phases were skipped and the feature was implemented directly from the prompt
   */
  fast: boolean;
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
export enum ApplicationStatus {
  Idle = 'Idle',
  Active = 'Active',
  Error = 'Error',
}
export enum CloudDeploymentProvider {
  CloudflarePages = 'CloudflarePages',
  Vercel = 'Vercel',
  Netlify = 'Netlify',
  AwsAmplify = 'AwsAmplify',
  GcpCloudRun = 'GcpCloudRun',
}

/**
 * Scoped payload for an ApplicationUpdated notification — carries only the fields the client patches in-place. Deltas for unchanged fields are omitted.
 */
export type ApplicationUpdatePayload = {
  /**
   * The application whose row changed
   */
  applicationId: string;
  /**
   * Current setup_complete flag (after the transition)
   */
  setupComplete: boolean;
  /**
   * Current application status (after the transition)
   */
  status: ApplicationStatus;
  /**
   * Current git remote URL, if one is set
   */
  gitRemoteUrl?: string;
  /**
   * Selected cloud deployment provider, if one is set
   */
  cloudDeploymentProvider?: CloudDeploymentProvider;
};
export enum OperationLogKind {
  CloudDeploy = 'CloudDeploy',
  GitRemoteCreate = 'GitRemoteCreate',
  RepoSync = 'RepoSync',
  ApplicationSetup = 'ApplicationSetup',
}
export enum OperationLogLevel {
  Debug = 'Debug',
  Info = 'Info',
  Warn = 'Warn',
  Error = 'Error',
}

/**
 * A single timestamped line of progress for a long-running operation
 */
export type OperationLogEntry = BaseEntity & {
  /**
   * Kind of operation this entry belongs to
   */
  operationKind: OperationLogKind;
  /**
   * Stable id that scopes the operation — typically the application id
   */
  operationId: string;
  /**
   * Severity / level of this entry
   */
  level: OperationLogLevel;
  /**
   * Human-readable single-line message
   */
  message: string;
  /**
   * Optional structured detail (JSON-serialised) — multi-line stderr, error codes, etc.
   */
  detail?: string;
};

/**
 * Scoped payload for an OperationLogAppended notification — carries the newly-appended entry so clients can patch their log list in-place without a refetch.
 */
export type OperationLogAppendPayload = {
  /**
   * The newly-appended operation log entry
   */
  entry: OperationLogEntry;
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
  CloudDeploymentUpdated = 'cloud_deployment_updated',
  ApplicationUpdated = 'application_updated',
  OperationLogAppended = 'operation_log_appended',
  AgentQuestionPending = 'agent_question_pending',
  AgentQuestionBlocking = 'agent_question_blocking',
  AgentMessageBlocked = 'agent_message_blocked',
  SupervisorEscalated = 'supervisor_escalated',
  SupervisorFailed = 'supervisor_failed',
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
  /**
   * Scoped payload for ApplicationUpdated events — present iff eventType === ApplicationUpdated
   */
  applicationUpdate?: ApplicationUpdatePayload;
  /**
   * Scoped payload for OperationLogAppended events — present iff eventType === OperationLogAppended
   */
  operationLogAppend?: OperationLogAppendPayload;
};
export enum CloudDeploymentStatus {
  NotDeployed = 'NotDeployed',
  Building = 'Building',
  Uploading = 'Uploading',
  Deploying = 'Deploying',
  Deployed = 'Deployed',
  Failed = 'Failed',
}

/**
 * A persistent AI-powered application workspace
 */
export type Application = SoftDeletableEntity & {
  /**
   * Human-readable application name
   */
  name: string;
  /**
   * URL-friendly identifier (unique)
   */
  slug: string;
  /**
   * Original user prompt / purpose description
   */
  description: string;
  /**
   * Absolute path to the primary repository
   */
  repositoryPath: string;
  /**
   * Additional linked repository/directory paths (JSON array)
   */
  additionalPaths: string[];
  /**
   * Chosen agent executor type override
   */
  agentType?: string;
  /**
   * Chosen model override
   */
  modelOverride?: string;
  /**
   * Current application status
   */
  status: ApplicationStatus;
  /**
   * Whether the initial setup workflow has completed successfully
   */
  setupComplete: boolean;
  /**
   * Persistent agent SDK session ID — set once on first session boot, never changes
   */
  agentSessionId?: string;
  /**
   * Git remote URL (e.g. https://github.com/user/repo) once a remote is attached
   */
  gitRemoteUrl?: string;
  /**
   * Selected cloud deployment provider for this application
   */
  cloudDeploymentProvider?: CloudDeploymentProvider;
  /**
   * Current lifecycle state of the cloud deployment
   */
  cloudDeploymentStatus?: CloudDeploymentStatus;
  /**
   * Provider-specific deployment id used to poll status
   */
  cloudDeploymentId?: string;
  /**
   * Public URL of the most recent successful deployment
   */
  cloudDeploymentUrl?: string;
  /**
   * Error message from the last failed deployment attempt
   */
  cloudDeploymentError?: string;
  /**
   * Timestamp of the last deployment attempt (success or failure)
   */
  lastDeployedAt?: any;
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
  /**
   * Whether this repository was auto-forked by shep because the user lacked push access
   */
  isFork?: boolean;
  /**
   * Original upstream URL when isFork is true (normalized: lowercase, no .git suffix)
   */
  upstreamUrl?: string;
};
export enum EstimateType {
  None = 'None',
  Category = 'Category',
  Points = 'Points',
}

/**
 * A project management container for work items, cycles, and modules
 */
export type PmProject = SoftDeletableEntity & {
  /**
   * Human-readable project name
   */
  name: string;
  /**
   * URL-friendly identifier derived from name
   */
  slug: string;
  /**
   * Project description
   */
  description?: string;
  /**
   * Short prefix for work item IDs (2-5 uppercase letters, e.g., PROJ)
   */
  identifierPrefix: string;
  /**
   * Atomic counter for sequential work item ID generation
   */
  workItemCounter: number;
  /**
   * Estimation system used by this project
   */
  estimateType: EstimateType;
  /**
   * Optional link to an Application (AI workspace)
   */
  applicationId?: UUID;
  /**
   * Project start date
   */
  startDate?: any;
  /**
   * Project end date
   */
  endDate?: any;
  /**
   * Feature toggles JSON — enables/disables cycles, modules, epics, pages, intake, time tracking
   */
  featureToggles?: string;
};
export enum Priority {
  Urgent = 'Urgent',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  None = 'None',
}
export type float = any;
export type float64 = float;

/**
 * A unit of work within a project — issue, task, bug, or story
 */
export type WorkItem = SoftDeletableEntity & {
  /**
   * Project this work item belongs to
   */
  projectId: UUID;
  /**
   * Sequential number within the project (e.g., 42 in PROJ-42)
   */
  sequenceId: number;
  /**
   * Denormalized project prefix for display (e.g., 'PROJ')
   */
  identifierPrefix: string;
  /**
   * Work item title (required)
   */
  title: string;
  /**
   * Rich text description stored as JSON (TipTap/ProseMirror format)
   */
  description?: string;
  /**
   * Current workflow state ID
   */
  stateId: UUID;
  /**
   * Priority level
   */
  priority: Priority;
  /**
   * Parent work item ID for sub-item hierarchy (max 3 levels)
   */
  parentId?: UUID;
  /**
   * Manual sort order (float64 for insertion between items)
   */
  sortOrder: float64;
  /**
   * Planned start date
   */
  startDate?: any;
  /**
   * Target due date
   */
  dueDate?: any;
  /**
   * Estimate value — category label (XS/S/M/L/XL) or numeric string
   */
  estimateValue?: string;
  /**
   * Custom property values as JSON object keyed by property ID
   */
  customPropertyValues?: string;
};
export enum StateGroup {
  Backlog = 'Backlog',
  Unstarted = 'Unstarted',
  Started = 'Started',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

/**
 * A customizable workflow state within a project, belonging to a fixed semantic group
 */
export type WorkItemState = SoftDeletableEntity & {
  /**
   * Project this state belongs to
   */
  projectId: UUID;
  /**
   * Display name for the state (e.g., 'In Review', 'QA Testing')
   */
  name: string;
  /**
   * Hex color code for UI rendering (e.g., '#3b82f6')
   */
  color: string;
  /**
   * Position in the state list for ordering
   */
  displayOrder: number;
  /**
   * Semantic group this state belongs to — used for analytics and burndown
   */
  stateGroup: StateGroup;
  /**
   * Whether this is the default state for new work items in the project
   */
  isDefault: boolean;
};
export enum WorkItemTypeName {
  Task = 'Task',
  Bug = 'Bug',
  Story = 'Story',
  Feature = 'Feature',
}

/**
 * A work item type classification within a project
 */
export type WorkItemType = SoftDeletableEntity & {
  /**
   * Project this type belongs to
   */
  projectId: UUID;
  /**
   * Type name (Task, Bug, Story, Feature)
   */
  name: WorkItemTypeName;
  /**
   * Optional description of when to use this type
   */
  description?: string;
  /**
   * Optional icon identifier for UI rendering
   */
  icon?: string;
  /**
   * Whether this is the default type for new work items
   */
  isDefault: boolean;
};

/**
 * A project-scoped label for categorizing work items
 */
export type Label = SoftDeletableEntity & {
  /**
   * Project this label belongs to
   */
  projectId: UUID;
  /**
   * Label display name
   */
  name: string;
  /**
   * Hex color code for UI rendering (e.g., '#ef4444')
   */
  color: string;
  /**
   * Optional parent label ID for one-level grouping
   */
  parentId?: UUID;
};

/**
 * A threaded comment on a work item
 */
export type Comment = SoftDeletableEntity & {
  /**
   * Work item this comment belongs to
   */
  workItemId: UUID;
  /**
   * Parent comment ID for threading (null for top-level comments)
   */
  parentId?: UUID;
  /**
   * Comment content — rich text JSON or plain text
   */
  content: string;
  /**
   * ID of the comment author
   */
  authorId: string;
};
export enum ViewLayout {
  List = 'List',
  Board = 'Board',
  Table = 'Table',
  Calendar = 'Calendar',
  Timeline = 'Timeline',
}

/**
 * A saved view configuration for work items in a project
 */
export type SavedView = SoftDeletableEntity & {
  /**
   * Project this view belongs to
   */
  projectId: UUID;
  /**
   * Display name for the saved view
   */
  name: string;
  /**
   * Optional description
   */
  description?: string;
  /**
   * Whether this view is visible to all project members
   */
  isPublic: boolean;
  /**
   * Layout type for this view
   */
  layout: ViewLayout;
  /**
   * Full view configuration as JSON (filters, grouping, sorting, display properties)
   */
  configuration: string;
  /**
   * ID of the user who created this view
   */
  createdBy?: string;
};
export enum CycleStatus {
  Upcoming = 'Upcoming',
  Active = 'Active',
  Completed = 'Completed',
}

/**
 * A time-boxed iteration (sprint) within a project
 */
export type Cycle = SoftDeletableEntity & {
  /**
   * Parent project this cycle belongs to
   */
  projectId: UUID;
  /**
   * Human-readable cycle name (e.g., Sprint 1)
   */
  name: string;
  /**
   * Optional description of sprint goals
   */
  description?: string;
  /**
   * Current lifecycle status
   */
  status: CycleStatus;
  /**
   * Sprint start date
   */
  startDate?: any;
  /**
   * Sprint end date
   */
  endDate?: any;
};
export enum ModuleStatus {
  Backlog = 'Backlog',
  Planned = 'Planned',
  InProgress = 'InProgress',
  Paused = 'Paused',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

/**
 * An epic-like grouping of related work items within a project
 */
export type PmModule = SoftDeletableEntity & {
  /**
   * Parent project this module belongs to
   */
  projectId: UUID;
  /**
   * Human-readable module name
   */
  name: string;
  /**
   * Optional description of module scope and goals
   */
  description?: string;
  /**
   * Current lifecycle status
   */
  status: ModuleStatus;
  /**
   * Optional lead/owner for this module
   */
  leadId?: string;
  /**
   * Module start date
   */
  startDate?: any;
  /**
   * Module end date
   */
  endDate?: any;
};

/**
 * A wiki/documentation page within a project
 */
export type Page = SoftDeletableEntity & {
  /**
   * Project this page belongs to
   */
  projectId: UUID;
  /**
   * Page title
   */
  title: string;
  /**
   * Rich text content stored as TipTap JSON (ProseMirror document model)
   */
  content?: string;
  /**
   * Parent page ID for hierarchical nesting (null for top-level pages)
   */
  parentId?: UUID;
  /**
   * Display order among sibling pages
   */
  sortOrder: float64;
  /**
   * Whether this page is marked as a favorite
   */
  isFavorite: boolean;
};

/**
 * An immutable content snapshot of a page at a specific version
 */
export type PageVersion = BaseEntity & {
  /**
   * Page this version belongs to
   */
  pageId: UUID;
  /**
   * Sequential version number within the page
   */
  versionNumber: number;
  /**
   * Page title at this version
   */
  title: string;
  /**
   * Full content snapshot as TipTap JSON
   */
  content?: string;
};
export enum EpicStatus {
  Backlog = 'Backlog',
  Planned = 'Planned',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

/**
 * A large container within a project that groups related work items
 */
export type Epic = SoftDeletableEntity & {
  /**
   * Project this epic belongs to
   */
  projectId: UUID;
  /**
   * Epic name
   */
  name: string;
  /**
   * Optional description of the epic's scope and goals
   */
  description?: string;
  /**
   * Current lifecycle status
   */
  status: EpicStatus;
  /**
   * Planned start date
   */
  startDate?: any;
  /**
   * Target end date
   */
  endDate?: any;
};

/**
 * File attachment metadata for a work item — file stored on local filesystem
 */
export type PmAttachment = SoftDeletableEntity & {
  /**
   * Work item this attachment belongs to
   */
  workItemId: UUID;
  /**
   * Original filename as provided by the user
   */
  filename: string;
  /**
   * MIME type of the file (validated via magic bytes)
   */
  mimeType: string;
  /**
   * File size in bytes (max 25MB = 26214400)
   */
  fileSize: number;
  /**
   * Absolute path to the file on disk
   */
  storagePath: string;
};
export enum IntakeStatus {
  Pending = 'Pending',
  Accepted = 'Accepted',
  Declined = 'Declined',
  Duplicate = 'Duplicate',
}

/**
 * Incoming request awaiting triage — separate from committed WorkItems
 */
export type IntakeItem = SoftDeletableEntity & {
  /**
   * Project this intake item belongs to
   */
  projectId: UUID;
  /**
   * Title of the incoming request
   */
  title: string;
  /**
   * Description of the incoming request (plain text or rich text JSON)
   */
  description?: string;
  /**
   * Source of the intake (e.g., 'manual', 'email', 'api')
   */
  source: string;
  /**
   * Triage status of the intake item
   */
  status: IntakeStatus;
  /**
   * Notes from the triage process (AI or human)
   */
  triageNotes?: string;
  /**
   * Suggested state ID from AI triage
   */
  suggestedStateId?: UUID;
  /**
   * Suggested priority from AI triage
   */
  suggestedPriority?: string;
  /**
   * Suggested label IDs from AI triage (JSON array)
   */
  suggestedLabels?: string;
  /**
   * Suggested assignee ID from AI triage
   */
  suggestedAssigneeId?: string;
  /**
   * ID of the work item created on acceptance
   */
  resultingWorkItemId?: UUID;
  /**
   * Reason for declining the intake item
   */
  declineReason?: string;
  /**
   * ID of the existing work item this is a duplicate of
   */
  duplicateOfWorkItemId?: UUID;
};
export enum PmNotificationType {
  Assignment = 'Assignment',
  Mention = 'Mention',
  StateChange = 'StateChange',
  Comment = 'Comment',
  DueDateApproaching = 'DueDateApproaching',
}

/**
 * In-app notification for project management events
 */
export type PmNotification = SoftDeletableEntity & {
  /**
   * Project this notification belongs to
   */
  projectId: UUID;
  /**
   * User ID of the notification recipient
   */
  recipientId: string;
  /**
   * Type of notification event
   */
  type: PmNotificationType;
  /**
   * Short title for the notification
   */
  title: string;
  /**
   * Detailed notification body text
   */
  body?: string;
  /**
   * Whether the notification has been read
   */
  isRead: boolean;
  /**
   * Whether the notification has been archived
   */
  isArchived: boolean;
  /**
   * ID of the referenced entity (work item, comment, etc.)
   */
  referenceId?: UUID;
  /**
   * Type of the referenced entity (e.g., 'WorkItem', 'Comment', 'IntakeItem')
   */
  referenceType?: string;
};

/**
 * A user account in the project management system
 */
export type PmUser = SoftDeletableEntity & {
  /**
   * User's email address — unique identifier for login
   */
  email: string;
  /**
   * Bcrypt-hashed password — never exposed to presentation layer
   */
  passwordHash: string;
  /**
   * Display name shown in UI (avatars, assignments, comments)
   */
  displayName: string;
  /**
   * Whether this is the default system user created for single-user backward compatibility
   */
  isSystemUser: boolean;
};

/**
 * An authenticated user session with a secure token and expiry
 */
export type PmSession = SoftDeletableEntity & {
  /**
   * ID of the user who owns this session
   */
  userId: UUID;
  /**
   * Secure session token used for authentication
   */
  token: string;
  /**
   * When this session expires — after this time, the session is invalid
   */
  expiresAt: any;
};
export enum ProjectRole {
  Admin = 'Admin',
  Member = 'Member',
  Guest = 'Guest',
}

/**
 * Links a user to a project with a specific role for access control
 */
export type PmProjectMember = SoftDeletableEntity & {
  /**
   * ID of the project this membership belongs to
   */
  projectId: UUID;
  /**
   * ID of the user who is a member
   */
  userId: UUID;
  /**
   * Role determining the user's permissions within the project
   */
  role: ProjectRole;
};
export enum AuditAction {
  UserRegistered = 'UserRegistered',
  UserLoggedIn = 'UserLoggedIn',
  UserLoggedOut = 'UserLoggedOut',
  SessionInvalidated = 'SessionInvalidated',
  MemberAdded = 'MemberAdded',
  MemberRemoved = 'MemberRemoved',
  RoleChanged = 'RoleChanged',
  ProjectSettingsChanged = 'ProjectSettingsChanged',
  ProjectDeleted = 'ProjectDeleted',
  BulkOperation = 'BulkOperation',
}

/**
 * Immutable audit log entry recording a security-relevant action
 */
export type PmAuditLog = BaseEntity & {
  /**
   * ID of the user who performed the action
   */
  actorId: UUID;
  /**
   * Category of the audited action
   */
  action: AuditAction;
  /**
   * ID of the target entity (project, user, etc.) — optional
   */
  targetId?: UUID;
  /**
   * Type of the target entity (e.g., 'PmProject', 'PmUser', 'PmProjectMember')
   */
  targetType?: string;
  /**
   * JSON metadata with action-specific details (old/new values, etc.)
   */
  metadata?: string;
  /**
   * IP address or client identifier of the actor — optional
   */
  ipAddress?: string;
};

/**
 * Token usage tracking for an AI agent invocation
 */
export type TokenUsage = {
  /**
   * Number of input tokens consumed by the agent
   */
  inputTokens: number;
  /**
   * Number of output tokens produced by the agent
   */
  outputTokens: number;
};
export enum CommentSide {
  Left = 'LEFT',
  Right = 'RIGHT',
}

/**
 * Inline review comment targeting a specific file and line in the diff
 */
export type ReviewComment = {
  /**
   * File path relative to the repository root
   */
  path: string;
  /**
   * Line number in the file where the comment applies
   */
  line: number;
  /**
   * Comment body describing the finding (markdown)
   */
  body: string;
  /**
   * Which side of the diff the comment targets (LEFT = old, RIGHT = new)
   */
  side: CommentSide;
  /**
   * Suggested replacement code (rendered as GitHub suggestion block)
   */
  suggestion?: string;
  /**
   * Start line for multi-line comments (used with line as the end line)
   */
  startLine?: number;
  /**
   * Whether the comment targets a line within the actual diff range
   */
  inDiffRange: boolean;
};
export enum CodeReviewStatus {
  Pending = 'Pending',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Posted = 'Posted',
  Failed = 'Failed',
}

/**
 * AI-powered code review of a pull request
 */
export type CodeReview = BaseEntity & {
  /**
   * Optional link to the Shep Feature that owns this PR
   */
  featureId?: UUID;
  /**
   * Absolute path to the repository being reviewed
   */
  repositoryPath: string;
  /**
   * Pull request number on GitHub
   */
  prNumber: number;
  /**
   * Full GitHub pull request URL
   */
  prUrl?: string;
  /**
   * Current lifecycle status of the review
   */
  status: CodeReviewStatus;
  /**
   * Agent's overall summary assessment of the PR
   */
  summary?: string;
  /**
   * Inline review comments targeting specific diff lines
   */
  comments?: ReviewComment[];
  /**
   * GitHub review URL after findings are posted
   */
  reviewUrl?: string;
  /**
   * AI model identifier used for the review (e.g. claude-sonnet-4-6)
   */
  agentModel?: string;
  /**
   * Token usage tracking for cost monitoring
   */
  tokenUsage?: TokenUsage;
  /**
   * Error details when status is Failed
   */
  errorMessage?: string;
};
export enum ContributorLane {
  Docs = 'docs',
  Agents = 'agents',
  Ui = 'ui',
  Cli = 'cli',
  Infra = 'infra',
}
export enum ContributorLevel {
  User = 'user',
  Contributor = 'contributor',
  Core = 'core',
  Maintainer = 'maintainer',
}

/**
 * External OSS contributor to a repository Shep is helping run
 */
export type Contributor = BaseEntity & {
  /**
   * GitHub login (e.g., 'octocat') — unique across contributors
   */
  githubLogin: string;
  /**
   * Display name — public profile name on GitHub if available
   */
  displayName?: string;
  /**
   * Avatar URL from GitHub's public profile
   */
  avatarUrl?: string;
  /**
   * Primary lane the contributor works in (set by classify-into-lane or manually)
   */
  lane?: ContributorLane;
  /**
   * Position on the contributor ladder
   */
  level: ContributorLevel;
  /**
   * ISO timestamp of the contributor's first interaction (first PR or issue)
   */
  firstContributionAt: any;
  /**
   * ISO timestamp of the contributor's most recent interaction
   */
  lastContributionAt: any;
  /**
   * Number of merged PRs authored by this contributor in this repository
   */
  prCount: number;
  /**
   * Number of accepted issues opened by this contributor in this repository
   */
  issueCount: number;
};
export enum RecognitionKind {
  FirstPR = 'firstPR',
  NthPR = 'nthPR',
  FirstIssue = 'firstIssue',
  MonthlyShoutout = 'monthlyShoutout',
}

/**
 * Durable record that a contributor was recognized for a specific contribution
 */
export type RecognitionEvent = BaseEntity & {
  /**
   * Contributor this recognition event belongs to
   */
  contributorId: UUID;
  /**
   * Kind of recognition
   */
  kind: RecognitionKind;
  /**
   * ISO timestamp when the recognition was awarded
   */
  occurredAt: any;
  /**
   * PR number for PR-bound kinds (FirstPR, NthPR); 0 for non-PR kinds
   */
  prNumber: number;
  /**
   * Identifier of the monthly recap artifact when kind = MonthlyShoutout
   */
  monthRecapId?: string;
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

/**
 * An immutable record of a field change on a work item
 */
export type ActivityEntry = BaseEntity & {
  /**
   * Work item this activity belongs to
   */
  workItemId: UUID;
  /**
   * Name of the field that changed (e.g., 'state', 'priority', 'title')
   */
  fieldName: string;
  /**
   * Previous value as text (null for creation events)
   */
  oldValue?: string;
  /**
   * New value as text
   */
  newValue?: string;
  /**
   * ID of the actor who made the change
   */
  actorId: string;
};
export enum CustomPropertyType {
  Text = 'Text',
  Number = 'Number',
  Dropdown = 'Dropdown',
  Boolean = 'Boolean',
  Date = 'Date',
  MemberPicker = 'MemberPicker',
}

/**
 * A user-defined custom field schema for work items in a project
 */
export type CustomProperty = SoftDeletableEntity & {
  /**
   * Project this property belongs to
   */
  projectId: UUID;
  /**
   * Display name for the property
   */
  name: string;
  /**
   * Data type of the property value
   */
  propertyType: CustomPropertyType;
  /**
   * JSON array of options for Dropdown type (e.g., '["Option A", "Option B"]')
   */
  options?: string;
  /**
   * Whether this property is required on work items
   */
  isRequired: boolean;
  /**
   * Position in the property list for ordering
   */
  displayOrder: number;
};
export enum RelationType {
  Blocking = 'Blocking',
  RelatesTo = 'RelatesTo',
  Duplicate = 'Duplicate',
  StartsBefore = 'StartsBefore',
  FinishesBefore = 'FinishesBefore',
}

/**
 * A directional relationship between two work items
 */
export type WorkItemRelation = BaseEntity & {
  /**
   * Source work item ID (the 'from' side)
   */
  sourceWorkItemId: UUID;
  /**
   * Target work item ID (the 'to' side)
   */
  targetWorkItemId: UUID;
  /**
   * Type of relationship
   */
  relationType: RelationType;
};

/**
 * A record of time logged against a work item
 */
export type TimeEntry = BaseEntity & {
  /**
   * Work item this time entry is logged against
   */
  workItemId: UUID;
  /**
   * Duration of work in minutes
   */
  durationMinutes: number;
  /**
   * Optional note describing the work performed
   */
  note?: string;
  /**
   * When the work was performed
   */
  loggedAt: any;
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
  /**
   * Optional workflow step ID this message was produced for
   */
  stepId?: string;
};
export enum WorkflowStepStatus {
  pending = 'pending',
  running = 'running',
  done = 'done',
  failed = 'failed',
  interrupted = 'interrupted',
}

/**
 * A persisted step of a multi-step workflow executed inside an interactive session
 */
export type WorkflowStep = BaseEntity & {
  /**
   * Parent interactive session id
   */
  sessionId: string;
  /**
   * Polymorphic scope key: matches InteractiveMessage.featureId
   */
  featureId: string;
  /**
   * Logical workflow id (e.g. 'application-creation-v1')
   */
  workflowId: string;
  /**
   * Stable key inside the workflow (e.g. 'scaffold', 'deps')
   */
  stepKey: string;
  /**
   * Order of this step within the workflow, starting at 0
   */
  stepIndex: number;
  /**
   * Non-technical title shown to the user
   */
  title: string;
  /**
   * Non-technical subtitle shown to the user
   */
  description: string;
  /**
   * Current lifecycle status
   */
  status: WorkflowStepStatus;
  /**
   * When the step transitioned to running
   */
  startedAt?: any;
  /**
   * When the step transitioned to done/failed/interrupted
   */
  finishedAt?: any;
  /**
   * JSON blob with summary, details, error — populated when done/failed
   */
  metadata?: string;
};
export enum AgentMessageKind {
  status = 'status',
  request = 'request',
  reply = 'reply',
  blocked = 'blocked',
  info = 'info',
}

/**
 * Inter-agent / agent↔user / agent↔supervisor message persisted on the bus
 */
export type AgentMessage = BaseEntity & {
  /**
   * App scope identifier (set when message originates in an app context)
   */
  appId?: string;
  /**
   * Repository scope identifier (set for standalone-repo agent work)
   */
  repositoryId?: string;
  /**
   * Optional feature scope identifier
   */
  featureId?: string;
  /**
   * Sending agent run id (omitted when sender is user or supervisor)
   */
  fromAgentRunId?: string;
  /**
   * Sender actor namespace: e.g. 'agent:<runId>', 'user:<id>', 'supervisor:<id>'
   */
  fromActor: string;
  /**
   * Target identifier — agent run id, 'broadcast', 'supervisor', or 'user'
   */
  toTarget: string;
  /**
   * Target kind: 'agent' | 'broadcast' | 'supervisor' | 'user'
   */
  toKind: string;
  /**
   * Discriminator for the meaning of the payload
   */
  messageKind: AgentMessageKind;
  /**
   * JSON-encoded payload (untrusted content, validated at boundaries)
   */
  payload: string;
  /**
   * Pairs a request with its reply (optional)
   */
  correlationId?: string;
  /**
   * Timestamp when the bus marked this message delivered to subscribers
   */
  deliveredAt?: any;
};
export enum AgentQuestionKind {
  info = 'info',
  question = 'question',
  blocking = 'blocking',
}
export enum AgentQuestionAnswerer {
  user = 'user',
  supervisor = 'supervisor',
  either = 'either',
}
export enum AgentQuestionStatus {
  pending = 'pending',
  answered = 'answered',
  expired = 'expired',
  cancelled = 'cancelled',
}

/**
 * A question raised by an agent toward the user, supervisor, or either
 */
export type AgentQuestion = BaseEntity & {
  /**
   * App scope identifier (set when question originates in app context)
   */
  appId?: string;
  /**
   * Repository scope identifier (set for standalone-repo agent work)
   */
  repositoryId?: string;
  /**
   * Optional feature scope identifier
   */
  featureId?: string;
  /**
   * Agent run that raised this question
   */
  agentRunId: string;
  /**
   * Three-tier urgency
   */
  kind: AgentQuestionKind;
  /**
   * Free-form question text shown to the answerer
   */
  prompt: string;
  /**
   * JSON-encoded array of multiple-choice options (optional)
   */
  optionsJson?: string;
  /**
   * Default answer used when expiresAt fires (non-blocking kinds only)
   */
  defaultAnswer?: string;
  /**
   * Who is permitted to answer this question
   */
  answerer: AgentQuestionAnswerer;
  /**
   * Current lifecycle state
   */
  status: AgentQuestionStatus;
  /**
   * Final answer text, set when status transitions to answered or expired
   */
  answer?: string;
  /**
   * Actor namespace of the answerer, e.g. 'user:<id>' or 'supervisor:<id>'
   */
  answeredBy?: string;
  /**
   * Timestamp when the answer was recorded
   */
  answeredAt?: any;
  /**
   * Auto-resolution deadline (optional, used with defaultAnswer)
   */
  expiresAt?: any;
};
export enum SupervisorVerdict {
  approve = 'approve',
  reject = 'reject',
  escalate = 'escalate',
  advise = 'advise',
}

/**
 * Immutable audit record of a supervisor decision
 */
export type SupervisorDecision = BaseEntity & {
  /**
   * Scope level of the policy that triggered this decision (global, repo, app)
   */
  scopeType: string;
  /**
   * App or repo UUID from the triggering policy (null for global)
   */
  scopeId?: string;
  /**
   * Optional feature scope identifier
   */
  featureId?: string;
  /**
   * Agent run id of the supervisor that produced this decision
   */
  supervisorRunId: string;
  /**
   * Kind of source event: 'gate' | 'question' | 'message' | 'lifecycle'
   */
  sourceEventKind: string;
  /**
   * Id of the source event row this decision was about
   */
  sourceEventId: string;
  /**
   * Decision outcome
   */
  verdict: SupervisorVerdict;
  /**
   * Free-form rationale string written by the evaluator
   */
  rationale: string;
  /**
   * LLM model used at decision time (snapshot for reproducibility)
   */
  modelId: string;
  /**
   * Evaluator prompt version snapshot
   */
  promptVersion: string;
  /**
   * Optional reference to the policy rule that fired
   */
  ruleRef?: string;
  /**
   * Optional 0..1 confidence reported by the evaluator
   */
  confidence?: float64;
};

/**
 * User-supplied override for a built-in agent prompt
 */
export type AgentPromptOverride = BaseEntity & {
  /**
   * Agent type the prompt belongs to (e.g. 'feature-agent')
   */
  agentType: string;
  /**
   * Stable prompt identifier within the agent (e.g. 'implement')
   */
  promptId: string;
  /**
   * Override prompt body
   */
  body: string;
  /**
   * Monotonic version counter, bumped on every upsert
   */
  version: number;
  /**
   * Author of the override
   */
  createdBy: string;
};

/**
 * User-supplied override for a built-in agent LangGraph descriptor
 */
export type AgentGraphOverride = BaseEntity & {
  /**
   * Agent type the descriptor belongs to (e.g. 'feature-agent')
   */
  agentType: string;
  /**
   * JSON-encoded array of node descriptors ({id,label,description?})
   */
  nodesJson: string;
  /**
   * JSON-encoded array of edge descriptors ({from,to,label?})
   */
  edgesJson: string;
  /**
   * Monotonic version counter, bumped on every upsert
   */
  version: number;
  /**
   * Author of the override
   */
  createdBy: string;
};

/**
 * User-created agent type, editable in the agent editor
 */
export type CustomAgent = BaseEntity & {
  /**
   * Stable agent type identifier (kebab-case, unique)
   */
  agentType: string;
  /**
   * Human-readable display name
   */
  name: string;
  /**
   * Short description of what this agent does
   */
  description: string;
  /**
   * Author of the agent
   */
  createdBy: string;
};
export enum ContributionDifficulty {
  GoodFirst = 'goodFirst',
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

/**
 * Structured output produced by the contributor-onboarding custom agent
 */
export type ContributorOnboardingAgentOutput = {
  /**
   * Lane assignment — must match ContributorLane enum verbatim
   */
  lane: ContributorLane;
  /**
   * Difficulty rating — must match ContributionDifficulty enum verbatim
   */
  difficulty: ContributionDifficulty;
  /**
   * Markdown checklist of acceptance criteria; each line begins with '- [ ] '
   */
  acceptanceCriteria: string;
  /**
   * Suggested labels to apply; MUST include lane:<lane> and difficulty:<difficulty>
   */
  suggestedLabels: string[];
  /**
   * Optional welcome comment body — present only when difficulty === goodFirst
   */
  welcomeComment?: string;
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
export enum InteractiveSessionEventType {
  Booting = 'interactive_session_booting',
  Ready = 'interactive_session_ready',
  Stopped = 'interactive_session_stopped',
  Error = 'interactive_session_error',
}
export enum RecapChannel {
  File = 'file',
  Discord = 'discord',
  GithubDiscussion = 'githubDiscussion',
}
export enum DiagnosticStatus {
  Ok = 'ok',
  Warn = 'warn',
  Fail = 'fail',
}
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
