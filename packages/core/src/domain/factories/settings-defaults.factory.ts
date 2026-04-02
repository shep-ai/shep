/**
 * Settings Defaults Factory
 *
 * Factory function for creating Settings entities with sensible defaults
 * matching the TypeSpec model specification.
 *
 * This factory ensures:
 * - Default model: claude-sonnet-4-6
 * - User profile fields are optional (empty object)
 * - Editor defaults to vscode, shell to bash
 * - Auto-update enabled, log level set to info
 * - Unique IDs and timestamps generated for each instance
 */

import type {
  Settings,
  ModelConfiguration,
  UserProfile,
  EnvironmentConfig,
  SystemConfig,
  AgentConfig,
  NotificationPreferences,
  WorkflowConfig,
  ApprovalGateDefaults,
  FeatureFlags,
  SkillInjectionConfig,
} from '../generated/output';
import {
  AgentType,
  AgentAuthMethod,
  EditorType,
  SkillSourceType,
  TerminalType,
} from '../generated/output';

/**
 * Default AI model for all SDLC agents.
 * Provides balanced performance and cost for all workflow stages.
 */
const DEFAULT_MODEL = 'claude-sonnet-4-6' as const;

/**
 * Default code editor preference.
 * Most widely used editor in the development community.
 */
const DEFAULT_EDITOR = EditorType.VsCode;

/**
 * Default shell preference.
 * Most common shell across Unix-like systems.
 */
const DEFAULT_SHELL = 'bash' as const;

/**
 * Default terminal emulator preference.
 * Uses the OS default terminal (Terminal.app on macOS, etc.).
 */
const DEFAULT_TERMINAL = TerminalType.System;

/**
 * Default log level for CLI output.
 * Provides informational messages without overwhelming verbosity.
 */
const DEFAULT_LOG_LEVEL = 'info' as const;

/**
 * Default AI coding agent.
 * Claude Code is the only currently supported agent.
 */
const DEFAULT_AGENT_TYPE = AgentType.ClaudeCode;

/**
 * Default agent authentication method.
 * Session auth uses the agent's built-in authentication.
 */
const DEFAULT_AUTH_METHOD = AgentAuthMethod.Session;

/**
 * Creates a Settings entity with sensible defaults.
 *
 * Default values match the TypeSpec model specification:
 * - Default AI model: claude-sonnet-4-6
 * - Editor: vscode
 * - Shell: bash
 * - Auto-update: enabled
 * - Log level: info
 * - User profile: empty (all fields optional)
 * - Agent: Claude Code with session auth
 *
 * @returns Settings entity with default values
 *
 * @example
 * ```typescript
 * const settings = createDefaultSettings();
 * console.log(settings.models.default); // "claude-sonnet-4-6"
 * console.log(settings.environment.defaultEditor); // "vscode"
 * ```
 */
export function createDefaultSettings(): Settings {
  const now = new Date();

  const models: ModelConfiguration = {
    default: DEFAULT_MODEL,
  };

  const user: UserProfile = {};

  const environment: EnvironmentConfig = {
    defaultEditor: DEFAULT_EDITOR,
    shellPreference: DEFAULT_SHELL,
    terminalPreference: DEFAULT_TERMINAL,
    defaultCloneDirectory: '~/repos',
  };

  const system: SystemConfig = {
    autoUpdate: true,
    logLevel: DEFAULT_LOG_LEVEL,
  };

  const agent: AgentConfig = {
    type: DEFAULT_AGENT_TYPE,
    authMethod: DEFAULT_AUTH_METHOD,
  };

  const notifications: NotificationPreferences = {
    inApp: { enabled: true },
    browser: { enabled: true },
    desktop: { enabled: false },
    events: {
      agentStarted: true,
      phaseCompleted: true,
      waitingApproval: true,
      agentCompleted: true,
      agentFailed: true,
      prMerged: true,
      prClosed: true,
      prChecksPassed: true,
      prChecksFailed: true,
      prBlocked: true,
      mergeReviewReady: true,
    },
  };

  const approvalGateDefaults: ApprovalGateDefaults = {
    allowPrd: false,
    allowPlan: false,
    allowMerge: false,
    pushOnImplementationComplete: false,
  };

  const skillInjection: SkillInjectionConfig = {
    enabled: false,
    skills: [
      {
        name: 'architecture-reviewer',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'architecture-reviewer',
      },
      {
        name: 'cross-validate-artifacts',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'cross-validate-artifacts',
      },
      {
        name: 'mermaid-diagrams',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'mermaid-diagrams',
      },
      {
        name: 'react-flow',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'react-flow',
      },
      {
        name: 'shadcn-ui',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'shadcn-ui',
      },
      {
        name: 'tsp-model',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'tsp-model',
      },
      {
        name: 'vercel-react-best-practices',
        type: SkillSourceType.Remote,
        source: 'shep-ai/shep',
        remoteSkillName: 'vercel-react-best-practices',
      },
      {
        name: 'frontend-design',
        type: SkillSourceType.Remote,
        source: 'anthropics/claude-code',
        remoteSkillName: 'frontend-design',
      },
    ],
  };

  const workflow: WorkflowConfig = {
    openPrOnImplementationComplete: false,
    approvalGateDefaults,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    defaultMode: 'Fast',
    explorationMaxIterations: 10,
    autoArchiveDelayMinutes: 10,
    skillInjection,
  };

  const featureFlags: FeatureFlags = {
    skills: false,
    envDeploy: true,
    debug: false,
    githubImport: false,
    adoptBranch: false,
    gitRebaseSync: false,
    reactFileManager: false,
    inventory: false,
  };

  return {
    id: globalThis.crypto.randomUUID(),
    models,
    user,
    environment,
    system,
    agent,
    notifications,
    workflow,
    featureFlags,
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };
}
