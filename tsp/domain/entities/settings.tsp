/**
 * @module Shep.Domain.Entities.Settings
 *
 * Defines the global Settings entity for the Shep AI platform. Settings is a
 * singleton entity that stores user preferences, model configuration, and
 * system parameters.
 *
 * ## Singleton Pattern
 *
 * The Settings entity follows a singleton pattern - only one instance exists
 * per Shep installation. This is enforced at the database level with a
 * unique constraint on a sentinel value.
 *
 * ## Settings Structure
 *
 * ```
 * Settings
 * ├── models: ModelConfiguration      (AI model selections for agents)
 * ├── user: UserProfile               (User identity and contact)
 * ├── environment: EnvironmentConfig  (Tooling and shell preferences)
 * ├── system: SystemConfig            (System-level behavior)
 * └── agent: AgentConfig              (AI coding agent selection and auth)
 * ```
 *
 * ## Initialization
 *
 * On first run, Settings is created with sensible defaults:
 * - Default model: claude-sonnet-4-6
 * - Editor defaults to vscode
 * - Shell defaults to bash
 * - Auto-update enabled
 * - Log level set to info
 * - Agent defaults to Claude Code with session auth
 */
import "../../common/base.tsp";
import "../../common/enums/agent-config.tsp";
import "../../common/enums/editor.tsp";
import "../../common/enums/language.tsp";
import "../../common/enums/notification.tsp";
import "../../common/enums/security.tsp";
import "../../common/enums/terminal.tsp";
import "../../common/enums/whatsapp.tsp";
import "../../common/enums/messaging.tsp";
import "../../agents/supervisor-policy.tsp";

/**
 * Model Configuration
 *
 * Specifies the default AI model to use for all agents in the Shep SDLC
 * workflow. The single `default` field replaces the previous per-phase fields
 * (analyze, requirements, plan, implement), simplifying configuration.
 *
 * ## Model Selection
 *
 * Users can configure the model via:
 * - `shep settings model` — interactive CLI prompt
 * - `shep feat new --model <model>` — per-invocation override
 * - Web UI settings panel — model picker component
 *
 * ## Supported Models
 *
 * Valid model IDs depend on the configured agent executor:
 * - claude-code: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
 * - gemini-cli: gemini-3.1-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash
 * - cursor: claude-opus-4-6, claude-sonnet-4-6, gpt-5.4, gpt-5, gpt-5.3-codex, gemini-3.1-pro, composer-1.5, grok-code
 */
@doc("AI model configuration for the SDLC agent")
model ModelConfiguration {
  /**
   * Default model identifier used for all SDLC agents.
   * Can be overridden per-invocation via the --model CLI flag.
   */
  @doc("Default model identifier for all agents")
  default: string = "claude-sonnet-4-6";
}

/**
 * User Profile
 *
 * Stores optional user identity information. This data is used for:
 * - Personalizing CLI messages
 * - Attributing commits and PRs
 * - Providing contact info in generated documentation
 *
 * ## Privacy
 *
 * All fields are optional. Users can choose to remain anonymous
 * or provide as much or as little information as they prefer.
 */
@doc("User profile information")
model UserProfile {
  /**
   * User's display name.
   * Used in generated commit messages and documentation.
   */
  @doc("User's display name (optional)")
  name?: string;

  /**
   * User's email address.
   * Used for commit attribution and generated documentation.
   */
  @doc("User's email address (optional)")
  email?: string;

  /**
   * GitHub username.
   * Used for PR attribution, @mentions in generated code comments,
   * and linking to GitHub profiles in documentation.
   */
  @doc("GitHub username (optional, for PR attribution)")
  githubUsername?: string;

  /**
   * Preferred UI language for internationalization.
   * Controls which language Shep uses for all user-facing strings
   * across CLI, TUI, and Web UI. Defaults to English.
   */
  @doc("Preferred UI language (default: English)")
  preferredLanguage?: Language;
}

/**
 * Environment Configuration
 *
 * Specifies user preferences for development tooling and shell environment.
 * These settings affect how Shep opens files and runs commands.
 *
 * ## Editor Integration
 *
 * The defaultEditor setting controls which editor opens when Shep
 * needs to show code or allow manual edits.
 *
 * ## Shell Preference
 *
 * The shellPreference setting affects:
 * - Which shell syntax is used in generated scripts
 * - How environment variables are handled
 * - Which shell profile files are sourced
 */
@doc("Environment and tooling preferences")
model EnvironmentConfig {
  /**
   * Preferred code editor.
   * Must be one of the supported EditorType values.
   */
  @doc("Preferred code editor")
  defaultEditor: EditorType = EditorType.VsCode;

  /**
   * Preferred shell.
   * Common values: bash, zsh, fish
   */
  @doc("Preferred shell")
  shellPreference: string = "bash";

  /**
   * Preferred terminal emulator.
   * Controls which terminal application opens when Shep launches
   * shell sessions (e.g., from the web UI "Open Terminal" button).
   * "system" uses the OS default (Terminal.app, x-terminal-emulator, PowerShell).
   */
  @doc("Preferred terminal emulator")
  terminalPreference: TerminalType = TerminalType.System;

  @doc("Default directory for cloning GitHub repositories (e.g. ~/repos)")
  defaultCloneDirectory?: string;
}

/**
 * System Configuration
 *
 * Controls system-level behavior of the Shep CLI.
 *
 * ## Auto-Update
 *
 * When enabled, Shep checks for updates on startup and prompts
 * the user to upgrade when a new version is available.
 *
 * ## Log Level
 *
 * Controls verbosity of CLI output:
 * - debug: Everything (verbose debugging)
 * - info: Normal informational messages (default)
 * - warn: Warnings and errors only
 * - error: Errors only
 */
@doc("System configuration")
model SystemConfig {
  /**
   * Whether to check for and prompt for CLI updates.
   * When false, users must manually upgrade.
   */
  @doc("CLI auto-update preference")
  autoUpdate: boolean = true;

  /**
   * Log level for CLI output.
   * Valid values: debug, info, warn, error
   */
  @doc("Log level for CLI output")
  logLevel: string = "info";
}

/**
 * Agent Configuration
 *
 * Specifies which AI coding agent tool Shep uses for all LLM-powered
 * operations and how authentication is handled for that agent.
 *
 * ## Agent Selection
 *
 * Users select their preferred agent via `shep settings agent`. Currently
 * only Claude Code is fully supported; other agents appear as "Coming Soon".
 *
 * ## Authentication
 *
 * Each agent supports different auth methods:
 * - session: Use the agent's existing auth (e.g., Claude Code OAuth)
 * - token: Provide an API token stored in the Shep settings database
 */
/**
 * Workflow Configuration
 *
 * Global defaults for the post-implementation workflow.
 * These settings are DEFAULTS that can be overridden per-feature
 * using CLI flags (--pr, --allow-merge, etc.).
 *
 * Resolution order: CLI flag → Feature entity in DB → Settings default.
 */
@doc("Default approval gate settings for new features")
model ApprovalGateDefaults {
  @doc("Auto-approve requirements phase (default: false)")
  allowPrd: boolean = false;

  @doc("Auto-approve planning phase (default: false)")
  allowPlan: boolean = false;

  @doc("Auto-approve merge phase (default: false)")
  allowMerge: boolean = false;

  @doc("Push branch to remote on implementation complete (default: false)")
  pushOnImplementationComplete: boolean = false;
}

/**
 * Per-stage timeout configuration for the feature agent workflow.
 *
 * Each field controls the maximum execution time (in milliseconds) for
 * a specific agent stage. When a field is omitted, the stage falls back
 * to 600_000 ms (10 minutes).
 */
@doc("Per-stage timeout overrides for the feature agent workflow (all values in milliseconds)")
model StageTimeouts {
  @doc("Timeout for the analyze stage (default: 600000)")
  analyzeMs?: int32;

  @doc("Timeout for the requirements stage (default: 600000)")
  requirementsMs?: int32;

  @doc("Timeout for the research stage (default: 600000)")
  researchMs?: int32;

  @doc("Timeout for the plan stage (default: 600000)")
  planMs?: int32;

  @doc("Timeout for the implement stage (default: 1800000)")
  implementMs?: int32;

  @doc("Timeout for the fast-implement stage (default: 1800000)")
  fastImplementMs?: int32;

  @doc("Timeout for the merge stage (default: 1800000)")
  mergeMs?: int32;
}

/**
 * Timeout configuration for the analyze-repository agent.
 *
 * Controls the maximum execution time (in milliseconds) for the
 * repository analysis stage. When omitted, falls back to 600_000 ms
 * (10 minutes).
 */
@doc("Timeout overrides for the analyze-repository agent (all values in milliseconds)")
model AnalyzeRepoTimeouts {
  @doc("Timeout for the repository analysis stage (default: 600000)")
  analyzeMs?: int32;
}

/**
 * Skill Source Type
 *
 * Indicates how a skill is provisioned into a worktree:
 * - local: Copied from the main repository's .claude/skills/ directory
 * - remote: Installed via `npx skills add` at runtime
 */
@doc("How a skill is provisioned into a worktree")
enum SkillSourceType {
  @doc("Copied from the main repository's .claude/skills/ directory")
  Local: "local",

  @doc("Installed via npx skills add at runtime")
  Remote: "remote",
}

/**
 * Skill Source
 *
 * Defines a single skill to be injected into feature worktrees.
 * Local skills are deep-copied from a path relative to the repository root.
 * Remote skills are installed via `npx skills add <source> --skill <remoteSkillName>`.
 */
@doc("A skill source for injection into feature worktrees")
model SkillSource {
  @doc("Unique skill directory name (e.g. 'architecture-reviewer')")
  name: string;

  @doc("How this skill is provisioned (local copy or remote install)")
  type: SkillSourceType;

  @doc("Source path (local) or npm package/URL (remote)")
  source: string;

  @doc("Remote skill name passed to --skill flag (remote type only)")
  remoteSkillName?: string;
}

/**
 * Skill Injection Configuration
 *
 * Controls whether curated agent skills are injected into feature worktrees
 * during CreateFeatureUseCase execution. When enabled, skills from the
 * configured list are copied/installed into the worktree's .claude/skills/
 * directory with idempotency (existing skills are skipped) and commit
 * prevention (.gitignore management).
 *
 * Disabled by default (opt-in). Users enable via Settings or per-invocation
 * with the --inject-skills CLI flag.
 */
@doc("Skill injection configuration for feature worktrees")
model SkillInjectionConfig {
  @doc("Whether skill injection is enabled (default: false, opt-in)")
  enabled: boolean = false;

  @doc("List of skills to inject into feature worktrees")
  skills: SkillSource[];
}

@doc("Global workflow configuration defaults")
model WorkflowConfig {
  /**
   * Whether to automatically create a PR when implementation completes.
   * Per-feature override: `feat new --pr`
   */
  @doc("Create PR on implementation complete (default: false)")
  openPrOnImplementationComplete: boolean = false;

  /**
   * Default approval gate preferences for new features.
   * Per-feature overrides: `feat new --allow-prd`, `--allow-plan`, etc.
   */
  @doc("Default approval gate preferences for new features")
  approvalGateDefaults: ApprovalGateDefaults;

  @doc("Enable CI watch/fix loop after push (default: true)")
  ciWatchEnabled: boolean = true;

  @doc("Maximum number of CI fix/push/watch iterations before giving up (default: 3)")
  ciMaxFixAttempts?: int32;

  @doc("Timeout in milliseconds for watching a CI run (default: 600000 = 10 minutes)")
  ciWatchTimeoutMs?: int32;

  @doc("Maximum characters of CI failure logs to pass to the executor (default: 50000)")
  ciLogMaxChars?: int32;

  @doc("Poll interval in seconds for gh run watch (default: 30)")
  ciWatchPollIntervalSeconds?: int32;

  @doc("Per-stage timeout overrides for the feature agent (default: 600000 = 10 minutes per stage)")
  stageTimeouts?: StageTimeouts;

  @doc("Timeout overrides for the analyze-repository agent (default: 600000 = 10 minutes)")
  analyzeRepoTimeouts?: AnalyzeRepoTimeouts;

  /**
   * Whether evidence collection is enabled after implementation.
   * When enabled, the agent captures screenshots, test outputs, and other
   * artifacts proving task completion. Evidence is saved to the shep home
   * folder (~/.shep/repos/<hash>/evidence/).
   */
  @doc("Enable evidence collection after implementation (default: false)")
  enableEvidence: boolean = false;

  /**
   * Whether to commit evidence files to the feature branch and include
   * them in the PR body. Only takes effect when enableEvidence is true.
   * When disabled, evidence is saved locally and visible in the merge
   * review UI but not committed to the repository.
   */
  @doc("Commit evidence to PR (default: false, requires enableEvidence)")
  commitEvidence: boolean = false;

  @doc("Maximum number of evidence collection retry attempts when validation fails (default: 3)")
  evidenceRetries?: int32;

  /**
   * Whether to hide CI status badges from the web UI (feature drawer and merge review).
   * When true, the CI status row is hidden from the UI while the underlying data
   * is still fetched and stored. Useful for users who monitor CI status through
   * other means (GitHub notifications, Slack, IDE extensions).
   */
  @doc("Hide CI status badges from UI (default: true)")
  hideCiStatus?: boolean;

  /**
   * Default feature mode for new features.
   * Controls whether `shep feat new` and the web UI create drawer default to
   * regular (full SDLC), fast (skip phases), or exploration (prototype iteration) mode.
   * Per-feature override: `feat new --fast`, `feat new --no-fast`, `feat new --explore`
   */
  @doc("Default feature mode for new features: 'Regular', 'Fast', or 'Exploration' (default: 'Fast')")
  defaultMode: string = "Fast";

  /**
   * Maximum number of feedback iterations allowed in exploration mode.
   * When the limit is reached, the user is prompted to promote or discard.
   * Set to 0 for unlimited iterations.
   */
  @doc("Maximum exploration feedback iterations (default: 10, 0 = unlimited)")
  explorationMaxIterations?: int32;

  /**
   * Automatically archive features that reach the Maintain (completed) lifecycle
   * after this many minutes. When set to 0, auto-archiving is disabled.
   * The timer starts from the feature's updatedAt timestamp (the moment it
   * transitioned to Maintain).
   */
  @doc("Minutes after completion before auto-archiving a feature (default: 10, 0 = disabled)")
  autoArchiveDelayMinutes?: int32;

  /**
   * Skill injection configuration for feature worktrees.
   * When enabled, curated skills are copied/installed into the worktree's
   * .claude/skills/ directory during feature creation.
   * Optional for backward compatibility with pre-migration databases.
   */
  @doc("Skill injection configuration (optional, disabled by default)")
  skillInjection?: SkillInjectionConfig;
}

@doc("AI coding agent configuration")
model AgentConfig {
  /**
   * The AI coding agent tool to use.
   * Defaults to Claude Code as the only currently supported agent.
   */
  @doc("Selected AI coding agent")
  type: AgentType = AgentType.ClaudeCode;

  /**
   * Authentication method for the selected agent.
   * Session auth uses the agent's built-in auth; token auth uses
   * a stored API key.
   */
  @doc("Authentication method for the agent")
  authMethod: AgentAuthMethod = AgentAuthMethod.Session;

  /**
   * API token for token-based authentication.
   * Only used when authMethod is "token". Set via the TUI wizard
   * or --token CLI flag. Stored in the settings database.
   */
  @doc("API token for token-based auth (optional)")
  token?: string;
}

/**
 * Notification Channel Configuration
 *
 * Controls whether a specific notification channel is enabled.
 * Each channel (in-app, browser, desktop) has an independent enable flag.
 * All channels default to disabled (opt-in) to respect user attention.
 */
@doc("Notification channel enable/disable configuration")
model NotificationChannelConfig {
  /**
   * Whether this notification channel is active.
   * Defaults to true (opt-out). Users can explicitly disable each channel.
   */
  @doc("Whether this notification channel is enabled")
  enabled: boolean = true;
}

/**
 * Notification Event Type Filters
 *
 * Controls which agent lifecycle events trigger notifications.
 * All event types default to enabled so that when a user turns on a
 * channel, they receive all relevant notifications immediately.
 * Users can then selectively disable event types they find noisy.
 */
@doc("Notification event type filters")
model NotificationEventConfig {
  @doc("Notify when agent starts running")
  agentStarted: boolean = true;

  @doc("Notify when agent completes a workflow phase")
  phaseCompleted: boolean = true;

  @doc("Notify when agent is waiting for human approval")
  waitingApproval: boolean = true;

  @doc("Notify when agent completes successfully")
  agentCompleted: boolean = true;

  @doc("Notify when agent execution fails")
  agentFailed: boolean = true;

  @doc("Notify when a pull request is merged on GitHub")
  prMerged: boolean = true;

  @doc("Notify when a pull request is closed without merging on GitHub")
  prClosed: boolean = true;

  @doc("Notify when pull request CI checks pass")
  prChecksPassed: boolean = true;

  @doc("Notify when pull request CI checks fail")
  prChecksFailed: boolean = true;

  @doc("Notify when pull request has merge conflicts")
  prBlocked: boolean = true;

  @doc("Notify when feature is ready for merge review")
  mergeReviewReady: boolean = true;

  @doc("Notify when cloud deployment status changes (spec 089)")
  cloudDeploymentUpdated?: boolean = true;

  @doc("Notify when application row changes (setupComplete, status, gitRemoteUrl, cloudDeploymentProvider — spec 090)")
  applicationUpdated?: boolean = true;

  @doc("Notify when a new operation log entry is appended (spec 090)")
  operationLogAppended?: boolean = true;

  @doc("Notify when a non-blocking AgentQuestion is raised by a running agent (spec 093). Default OFF — info-tier events go to the activity feed only unless the user opts in.")
  agentQuestionPending?: boolean = false;

  @doc("Notify when a blocking AgentQuestion pauses an agent and requires an answer (spec 093). Default ON — blocking-tier events MUST reach the user.")
  agentQuestionBlocking?: boolean = true;

  @doc("Notify when an inter-agent message is rejected or undeliverable (spec 093). Default OFF — info-tier event.")
  agentMessageBlocked?: boolean = false;

  @doc("Notify when the supervisor escalates a decision back to the user (spec 093). Default ON — actionable.")
  supervisorEscalated?: boolean = true;

  @doc("Notify when the supervisor evaluator fails and the system falls back to standard human approval (spec 093, FR-22). Default ON — actionable.")
  supervisorFailed?: boolean = true;

  @doc("Notify when a scheduled workflow execution starts")
  workflowStarted?: boolean = true;

  @doc("Notify when a scheduled workflow execution completes successfully")
  workflowCompleted?: boolean = true;

  @doc("Notify when a scheduled workflow execution fails")
  workflowFailed?: boolean = true;
}

/**
 * Notification Preferences
 *
 * Top-level notification configuration nested in Settings.
 * Contains per-channel enable/disable and event type filters.
 *
 * ## Channel Independence
 *
 * Each channel can be enabled/disabled independently:
 * - inApp: Sonner toast notifications in the web UI
 * - browser: Web Notifications API (works when tab is in background)
 * - desktop: Native OS notifications via node-notifier (no browser needed)
 *
 * ## Event Filtering
 *
 * The events config controls which lifecycle transitions trigger
 * notifications across all enabled channels.
 */
@doc("Notification preferences for agent lifecycle events")
model NotificationPreferences {
  @doc("In-app toast notification channel (Sonner)")
  inApp: NotificationChannelConfig;

  @doc("Browser push notification channel (Web Notifications API)")
  browser: NotificationChannelConfig;

  @doc("Desktop OS notification channel (node-notifier)")
  desktop: NotificationChannelConfig;

  @doc("Which event types trigger notifications")
  events: NotificationEventConfig;
}

/**
 * Feature Flags
 *
 * Controls runtime feature visibility in the web UI.
 * Stored in the Settings database as INTEGER columns (0/1).
 * When not set in the database, the feature flags resolution
 * falls back to NEXT_PUBLIC_ environment variables for envDeploy
 * (backward compatibility).
 */
@doc("Feature flag toggles for runtime feature control")
model FeatureFlags {
  @doc("Enable environment deployment features in the web UI")
  envDeploy: boolean = true;

  @doc("Enable debug UI elements and verbose client-side logging")
  debug: boolean = false;

  @doc("Use the built-in React file manager instead of the native OS folder picker")
  reactFileManager: boolean = false;

  @doc("Enable Projects pages and navigation (project management)")
  projects: boolean = true;

  @doc("Enable AI-powered code review for pull requests")
  codeReview: boolean = true;

  @doc("Enable agent collaboration, supervisor agent, and unified question pipeline (spec 093)")
  collaboration: boolean = true;

  @doc("Enable project-bedrock memory integration UI and server actions (spec 098)")
  bedrockIntegration: boolean = true;

  @doc("Enable WhatsApp-native task dispatch and interactive control (spec 101)")
  whatsappDispatch: boolean = false;

  @doc("Enable the Application Security Posture Management (ASPM) module — /aspm web routes, `shep aspm` CLI command tree, and the posture SSE stream (spec 098)")
  aspm: boolean = true;

  @doc("Enable Clusters navigation and Kubernetes cluster management in the web UI")
  clusters: boolean = false;

  @doc("Enable the supply chain security feature (policy engine, badges, settings, CLI, CI gate). When false, the feature is inert regardless of SecurityMode.")
  supplyChainSecurity: boolean = true;

  @doc("Enable scheduled workflows feature — workflow creation, scheduling, and execution")
  scheduledWorkflows: boolean = false;

  @doc("Enable GitHub repository import flow (clone, fork, and add to Shep)")
  githubImport: boolean = true;
}

/**
 * WhatsApp Integration Configuration (spec 101)
 *
 * Configures the WhatsApp task-dispatch surface: which adapter backs the
 * gateway, the linked number, authorization, live status, and the official
 * Cloud API credentials. Provider SDKs never appear here — this is pure
 * configuration consumed by the infrastructure adapters.
 *
 * Optional on Settings for backward compatibility; runtime defaults are applied
 * when absent. Gated by the `whatsappDispatch` feature flag.
 *
 * ## Adapter Selection
 *
 * - `baileys` (default): unofficial WhatsApp Web. Links a personal/business
 *   number via QR/pairing code; multi-file auth state is persisted under the
 *   shep home directory. No Meta approval, but violates WhatsApp ToS (ban risk).
 * - `cloud-api`: official WhatsApp Business Cloud API. Ban-safe; requires the
 *   Cloud API credentials below and a Meta Business account.
 */
@doc("WhatsApp integration configuration (spec 101)")
model WhatsAppConfig {
  @doc("Whether the WhatsApp integration is active (default: false)")
  enabled: boolean = false;

  @doc("Which messaging adapter backs the gateway (default: baileys)")
  adapter: WhatsAppAdapterKind = WhatsAppAdapterKind.Baileys;

  @doc("Linked WhatsApp number in E.164 form (the account shep speaks AS)")
  linkedNumber?: string;

  @doc("Last observed connection status (runtime; not user-edited)")
  status?: WhatsAppConnectionStatus;

  @doc("E.164 numbers authorized to dispatch tasks; empty means only the linked number")
  allowedNumbers?: string[];

  @doc("Cloud API: phone number ID from the Meta app dashboard")
  cloudApiPhoneNumberId?: string;

  @doc("Cloud API: permanent access token (stored in the settings DB)")
  cloudApiAccessToken?: string;

  @doc("Cloud API: webhook verify token (echoed during webhook setup)")
  cloudApiVerifyToken?: string;

  @doc("Cloud API: app secret used to verify inbound webhook signatures")
  cloudApiAppSecret?: string;
}

/**
 * Interactive Agent Configuration
 *
 * Controls the per-feature Chat tab and the interactive agent process lifecycle.
 * All fields have runtime defaults applied via nullish coalescing so no
 * migration of existing settings files is required.
 *
 * ## Default Values (applied at runtime when field is absent)
 *
 * | Field                | Default | Description                              |
 * |----------------------|---------|------------------------------------------|
 * | enabled              | true    | Chat tab is visible by default           |
 * | autoTimeoutMinutes   | 15      | Session auto-stops after 15 min idle     |
 * | maxConcurrentSessions| 3       | At most 3 active sessions at once        |
 *
 * @example
 * ```json
 * {
 *   "enabled": true,
 *   "autoTimeoutMinutes": 15,
 *   "maxConcurrentSessions": 3
 * }
 * ```
 */
@doc("Interactive agent chat tab configuration")
model InteractiveAgentConfig {
  /**
   * Whether the Chat tab is shown in the feature detail page.
   * When false, the tab is hidden from the tab bar entirely (FR-17).
   * @example true
   */
  @doc("Whether the interactive agent Chat tab is enabled (default: true)")
  enabled: boolean = true;

  /**
   * Number of minutes of idle time before the agent process is automatically
   * stopped. Idle is measured from the last user message sent or agent stdout
   * chunk received. Valid range: 1-120 minutes.
   * @example 15
   */
  @doc("Idle timeout in minutes before auto-stopping the agent (default: 15, range: 1-120)")
  autoTimeoutMinutes: int32 = 15;

  /**
   * Maximum number of agent processes allowed to run simultaneously.
   * Attempting to start a session when at the cap returns an error (FR-12).
   * @example 3
   */
  @doc("Maximum number of concurrent active interactive sessions (default: 3)")
  maxConcurrentSessions: int32 = 3;
}

/**
 * Supervisor Configuration (Settings-level defaults, spec 093)
 *
 * Global default supervisor behavior. Per-app and per-feature overrides
 * live on the SupervisorPolicy entity. This sub-block on Settings is the
 * fallback when no policy row exists for a scope and the user wants
 * default-on supervision for newly created apps.
 *
 * All fields are optional and default to disabled / advisory so existing
 * installations behave identically until the user opts in.
 */
@doc("Supervisor agent default configuration (spec 093)")
model SupervisorConfig {
  @doc("Whether a supervisor is enabled by default for newly created apps")
  enabled: boolean = false;

  @doc("Default autonomy level (advisory by default)")
  autonomyLevel: SupervisorAutonomy = SupervisorAutonomy.advisory;

  @doc("Default LLM model identifier (resolved through IAgentExecutorProvider)")
  modelId?: string;

  @doc("Default evaluator prompt version marker")
  promptVersion?: string;
}

/**
 * FAB Layout Configuration
 *
 * Controls the horizontal placement of the two floating action buttons (FABs)
 * in the web UI control center:
 * - Create FAB (+): opens the new-feature/add-repo speed-dial
 * - Chat FAB: opens the global Shep Chat popup
 *
 * By default the Create FAB sits on the start side (left in LTR) and the
 * Chat FAB sits on the end side (right in LTR). When `swapPosition` is true
 * the positions are mirrored so that the Chat FAB moves to the start side
 * and the Create FAB moves to the end side.
 */
/**
 * Pages that can be set as the default home (landing) page in the web UI.
 */
enum DefaultHomePage {
  @doc("Control Center canvas view")
  ControlCenter: "control-center",

  @doc("Applications list")
  Applications: "applications",

  @doc("Feature inventory table")
  Features: "features",
}

@doc("FAB (floating action button) layout configuration")
model FabLayoutConfig {
  /**
   * When true the Create (+) and Chat FABs swap horizontal positions.
   * Default layout: Create = start (left in LTR), Chat = end (right in LTR).
   * Swapped layout: Chat = start (left in LTR), Create = end (right in LTR).
   */
  @doc("Swap Create and Chat FAB positions (default: false)")
  swapPosition: boolean = false;
}

/**
 * Security Configuration
 *
 * Stores the effective security mode and evaluation metadata in the
 * Settings singleton. The mode controls whether supply-chain security
 * checks are disabled, advisory (surface findings), or enforced (block
 * risky actions). Full policy rules live in shep.security.yaml; this
 * model tracks the persisted effective state.
 *
 * ## Fields
 *
 * | Field            | Default    | Description                              |
 * |------------------|------------|------------------------------------------|
 * | mode             | Advisory   | Active security mode                     |
 * | lastEvaluationAt | (none)     | ISO timestamp of last policy evaluation  |
 * | policySource     | (none)     | Where the active policy was loaded from  |
 */
/**
 * Messaging Remote Control Configuration
 *
 * Configuration for controlling Shep remotely via messaging platforms
 * (Telegram, WhatsApp) through the Commands.com Gateway.
 *
 * ## Setup Flow
 *
 * 1. User deploys the Gateway or connects to an existing one
 * 2. `shep settings messaging` wizard configures platform credentials
 * 3. Shep registers integration routes on the Gateway
 * 4. User pairs their messaging chat via a one-time verification code
 * 5. Notifications and commands flow bidirectionally
 */
@doc("Configuration for a single messaging platform connection")
model MessagingPlatformConfig {
  @doc("Whether this platform connection is active")
  enabled: boolean = false;

  @doc("Platform-specific chat ID for message routing (set during pairing)")
  chatId?: string;

  @doc("Whether the chat has been verified via pairing code")
  paired: boolean = false;

  @doc("One-time code shown to the user during pairing, cleared once confirmed")
  pendingPairingCode?: string;

  @doc("Expiry timestamp for the pending pairing code (ISO-8601)")
  pendingPairingExpiresAt?: utcDateTime;

  @doc("Gateway integration route ID allocated during pairing")
  routeId?: string;

  @doc("Gateway integration route token (path-auth) allocated during pairing")
  routeToken?: string;

  @doc("Public webhook URL that the messaging platform should POST updates to")
  publicUrl?: string;

  @doc("Bot API token used by the daemon to send outbound messages (Telegram: 123456:ABC...)")
  botToken?: string;
}

@doc("Messaging remote control configuration")
model MessagingConfig {
  @doc("Whether messaging remote control is enabled")
  enabled: boolean = false;

  @doc("URL of the Commands.com Gateway instance")
  gatewayUrl?: string;

  @doc("Device ID used when registering integration routes and opening the tunnel")
  deviceId?: string;

  @doc("OAuth client ID for fetching gateway access tokens (demo mode uses public client)")
  gatewayClientId?: string;

  @doc("Telegram platform configuration")
  telegram?: MessagingPlatformConfig;

  @doc("WhatsApp platform configuration")
  whatsapp?: MessagingPlatformConfig;

  @doc("Debounce window in milliseconds for notification delivery (default: 5000)")
  debounceMs: int32 = 5000;

  @doc("Buffer interval in milliseconds for chat relay output batching (default: 3000)")
  chatBufferMs: int32 = 3000;
}

/**
 * Security Configuration
 *
 * Stores the effective security mode and evaluation metadata in the
 * Settings singleton. The mode controls whether supply-chain security
 * checks are disabled, advisory (surface findings), or enforced (block
 * risky actions). Full policy rules live in shep.security.yaml; this
 * model tracks the persisted effective state.
 *
 * ## Fields
 *
 * | Field            | Default    | Description                              |
 * |------------------|------------|------------------------------------------|
 * | mode             | Advisory   | Active security mode                     |
 * | lastEvaluationAt | (none)     | ISO timestamp of last policy evaluation  |
 * | policySource     | (none)     | Where the active policy was loaded from  |
 */
@doc("Supply-chain security configuration persisted in settings")
model SecurityConfig {
  /**
   * Effective security mode for this installation.
   * Advisory by default — surfaces findings without blocking.
   */
  @doc("Effective security mode (default: Advisory)")
  mode: SecurityMode = SecurityMode.Advisory;

  /**
   * ISO timestamp of the last successful policy evaluation.
   * Null when no evaluation has been run yet.
   */
  @doc("ISO timestamp of last policy evaluation (null if never evaluated)")
  lastEvaluationAt?: string;

  /**
   * Where the effective policy was sourced from.
   * Typical values: "shep.security.yaml", "settings-default".
   * Null when no evaluation has been run yet.
   */
  @doc("Source of the active security policy (null if never evaluated)")
  policySource?: string;
}

/**
 * Settings Entity
 *
 * Global Shep platform settings stored as a singleton. This entity contains
 * all user preferences, model configurations, and system parameters.
 *
 * ## Properties
 *
 * | Property    | Type                    | Required | Description                          |
 * |-------------|-------------------------|----------|--------------------------------------|
 * | id          | UUID                    | Yes      | Unique identifier (from BaseEntity)  |
 * | models      | ModelConfiguration      | Yes      | AI model configuration for agents    |
 * | user        | UserProfile             | Yes      | User profile information             |
 * | environment | EnvironmentConfig       | Yes      | Environment and tooling preferences  |
 * | system      | SystemConfig            | Yes      | System-level parameters              |
 * | agent       | AgentConfig             | Yes      | AI coding agent selection and auth   |
 * | notifications | NotificationPreferences | Yes   | Notification preferences             |
 * | featureFlags | FeatureFlags           | No       | Feature flag toggles                 |
 * | createdAt   | utcDateTime             | Yes      | When created (from BaseEntity)       |
 * | updatedAt   | utcDateTime             | Yes      | When last updated (from BaseEntity)  |
 *
 * ## Example
 *
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "models": {
 *     "default": "claude-sonnet-4-6"
 *   },
 *   "user": {
 *     "name": "Jane Doe",
 *     "email": "jane@example.com",
 *     "githubUsername": "janedoe"
 *   },
 *   "environment": {
 *     "defaultEditor": "vscode",
 *     "shellPreference": "bash",
 *     "terminalPreference": "system"
 *   },
 *   "system": {
 *     "autoUpdate": true,
 *     "logLevel": "info"
 *   },
 *   "agent": {
 *     "type": "claude-code",
 *     "authMethod": "session"
 *   },
 *   "createdAt": "2026-02-03T10:00:00Z",
 *   "updatedAt": "2026-02-03T10:00:00Z"
 * }
 * ```
 *
 * ## Singleton Enforcement
 *
 * The database layer enforces singleton behavior:
 * - Table has a UNIQUE constraint on a sentinel column
 * - Only one row can ever exist
 * - Updates modify the single row
 * - Initialization creates the row if it doesn't exist
 */
@doc("Global Shep platform settings (singleton)")
model Settings extends BaseEntity {
  /**
   * AI model configuration for different SDLC agents.
   * Specifies which models to use for analysis, requirements,
   * planning, and implementation.
   */
  @doc("AI model configuration for different agents")
  models: ModelConfiguration;

  /**
   * User profile information.
   * All fields are optional and used for personalization,
   * commit attribution, and documentation generation.
   */
  @doc("User profile information")
  user: UserProfile;

  /**
   * Environment and tooling preferences.
   * Controls which editor and shell Shep uses.
   */
  @doc("Environment and tooling preferences")
  environment: EnvironmentConfig;

  /**
   * System-level configuration parameters.
   * Controls auto-update behavior and logging verbosity.
   */
  @doc("System-level parameters")
  system: SystemConfig;

  /**
   * AI coding agent configuration.
   * Controls which agent tool Shep uses and how it authenticates.
   */
  @doc("AI coding agent selection and authentication")
  agent: AgentConfig;

  /**
   * Notification preferences for agent lifecycle events.
   * Controls which channels (in-app, browser, desktop) are enabled
   * and which event types trigger notifications.
   * All channels default to disabled (opt-in).
   */
  @doc("Notification preferences for agent lifecycle events")
  notifications: NotificationPreferences;

  /**
   * Workflow configuration defaults.
   * Controls global PR creation and auto-merge behavior.
   * Per-feature flags override these defaults.
   */
  @doc("Global workflow configuration defaults")
  workflow: WorkflowConfig;

  /**
   * Feature flag toggles for runtime feature control.
   * Controls visibility of features in the web UI.
   * Optional for backward compatibility with pre-migration databases.
   */
  @doc("Feature flag toggles for runtime feature control")
  featureFlags?: FeatureFlags;

  /**
   * Whether the first-run onboarding wizard has been completed.
   * When false, CLI bootstrap gates all commands until the wizard runs.
   */
  @doc("Whether first-run onboarding has been completed (default: false)")
  onboardingComplete: boolean = false;

  /**
   * Interactive agent chat configuration.
   * Controls the Chat tab feature: enable/disable toggle, idle auto-timeout,
   * and maximum concurrent active sessions.
   * Optional for backward compatibility — defaults applied at runtime.
   */
  @doc("Interactive agent chat configuration (optional, defaults applied at runtime)")
  interactiveAgent?: InteractiveAgentConfig;

  /**
   * FAB layout configuration.
   * Controls the horizontal placement of the Create (+) and Chat floating
   * action buttons in the web UI.
   * Optional for backward compatibility — defaults applied at runtime.
   */
  @doc("FAB layout configuration (optional, defaults applied at runtime)")
  fabLayout?: FabLayoutConfig;

  /**
   * Supervisor agent default configuration (spec 093).
   * Per-app and per-feature overrides live on the SupervisorPolicy entity.
   * Optional for backward compatibility — defaults applied at runtime.
   */
  @doc("Supervisor agent default configuration (optional, defaults applied at runtime)")
  supervisor?: SupervisorConfig;

  /**
   * The page shown when the user navigates to the root URL.
   * Optional for backward compatibility — defaults to control-center at runtime.
   */
  @doc("Default landing page when opening the web UI (default: control-center)")
  defaultHomePage?: DefaultHomePage;

  /**
   * WhatsApp integration configuration (spec 101).
   * Optional for backward compatibility — defaults applied at runtime.
   * Gated by the `whatsappDispatch` feature flag.
   */
  @doc("WhatsApp integration configuration (optional, defaults applied at runtime)")
  whatsapp?: WhatsAppConfig;

  /**
   * Supply-chain security configuration.
   * Controls security mode (Disabled/Advisory/Enforce) and tracks
   * evaluation metadata. Full policy rules live in shep.security.yaml.
   * Optional for backward compatibility — defaults applied at runtime.
   */
  @doc("Supply-chain security configuration (optional, defaults applied at runtime)")
  security?: SecurityConfig;

  /**
   * Messaging remote control configuration.
   * Controls external messaging integration (Telegram, WhatsApp) via
   * the Commands.com Gateway for remote notifications and commands.
   * Optional for backward compatibility — defaults applied at runtime.
   */
  @doc("Messaging remote control configuration (optional, defaults applied at runtime)")
  messaging?: MessagingConfig;
}
