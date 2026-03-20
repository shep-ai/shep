/**
 * Settings Database Mapper
 *
 * Maps between Settings domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) ↔ SQL columns (snake_case)
 * - Nested objects flattened to columns (e.g., models.analyze → model_analyze)
 * - Booleans stored as INTEGER (0 = false, 1 = true)
 * - Dates stored as ISO 8601 strings
 * - Optional fields stored as NULL when missing
 */

import type { Settings } from '../../../../domain/generated/output.js';
import {
  type AgentType,
  type AgentAuthMethod,
  type EditorType,
  type TerminalType,
} from '../../../../domain/generated/output.js';

/**
 * Database row type matching the settings table schema.
 * Uses snake_case column names with flattened nested objects.
 */
export interface SettingsRow {
  // Base entity
  id: string;
  created_at: string;
  updated_at: string;

  // ModelConfiguration (models.*)
  // Legacy columns kept for backward compat; model_default is the source of truth after migration 024.
  model_analyze: string;
  model_requirements: string;
  model_plan: string;
  model_implement: string;
  model_default: string;

  // UserProfile (user.*) - all nullable
  user_name: string | null;
  user_email: string | null;
  user_github_username: string | null;

  // EnvironmentConfig (environment.*)
  env_default_editor: string;
  env_shell_preference: string;
  env_terminal_preference: string;

  // SystemConfig (system.*)
  sys_auto_update: number; // Boolean stored as INTEGER
  sys_log_level: string;

  // AgentConfig (agent.*)
  agent_type: string;
  agent_auth_method: string;
  agent_token: string | null;

  // NotificationPreferences (notifications.*)
  notif_in_app_enabled: number; // Boolean stored as INTEGER
  notif_browser_enabled: number;
  notif_desktop_enabled: number;
  notif_evt_agent_started: number;
  notif_evt_phase_completed: number;
  notif_evt_waiting_approval: number;
  notif_evt_agent_completed: number;
  notif_evt_agent_failed: number;
  notif_evt_pr_merged: number;
  notif_evt_pr_closed: number;
  notif_evt_pr_checks_passed: number;
  notif_evt_pr_checks_failed: number;
  notif_evt_pr_blocked: number;
  notif_evt_merge_review_ready: number;

  // WorkflowConfig (workflow.*)
  workflow_open_pr_on_impl_complete: number;

  // WorkflowConfig CI settings (workflow.ci*)
  ci_max_fix_attempts: number | null;
  ci_watch_timeout_ms: number | null;
  ci_log_max_chars: number | null;
  ci_watch_enabled: number;

  // WorkflowConfig per-stage timeouts (workflow.stageTimeouts.*)
  stage_timeout_analyze_ms: number | null;
  stage_timeout_requirements_ms: number | null;
  stage_timeout_research_ms: number | null;
  stage_timeout_plan_ms: number | null;
  stage_timeout_implement_ms: number | null;
  stage_timeout_merge_ms: number | null;

  // WorkflowConfig analyze-repo timeouts (workflow.analyzeRepoTimeouts.*)
  analyze_repo_timeout_analyze_ms: number | null;

  // Onboarding
  onboarding_complete: number;

  // ApprovalGateDefaults (workflow.approvalGateDefaults.*)
  approval_gate_allow_prd: number;
  approval_gate_allow_plan: number;
  approval_gate_allow_merge: number;
  approval_gate_push_on_impl_complete: number;

  // WorkflowConfig evidence settings (workflow.*)
  workflow_enable_evidence: number;
  workflow_commit_evidence: number;
  hide_ci_status: number;

  // FeatureFlags (featureFlags.*)
  feature_flag_skills: number;
  feature_flag_env_deploy: number;
  feature_flag_debug: number;
  feature_flag_github_import: number;
  feature_flag_adopt_branch: number;
  feature_flag_git_rebase_sync: number;
  feature_flag_react_file_manager: number;
  feature_flag_coasts_dev_server: number;
}

/**
 * Maps Settings domain object to database row.
 * Flattens nested objects and converts types for SQL storage.
 *
 * @param settings - Settings domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(settings: Settings): SettingsRow {
  return {
    // Base entity
    id: settings.id,
    created_at:
      settings.createdAt instanceof Date ? settings.createdAt.toISOString() : settings.createdAt,
    updated_at:
      settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt,

    // ModelConfiguration (legacy columns kept for backward compat; model_default is the source of truth)
    model_analyze: settings.models.default,
    model_requirements: settings.models.default,
    model_plan: settings.models.default,
    model_implement: settings.models.default,
    model_default: settings.models.default,

    // UserProfile (optional fields → NULL)
    user_name: settings.user.name ?? null,
    user_email: settings.user.email ?? null,
    user_github_username: settings.user.githubUsername ?? null,

    // EnvironmentConfig
    env_default_editor: settings.environment.defaultEditor,
    env_shell_preference: settings.environment.shellPreference,
    env_terminal_preference: settings.environment.terminalPreference,

    // SystemConfig
    sys_auto_update: settings.system.autoUpdate ? 1 : 0,
    sys_log_level: settings.system.logLevel,

    // AgentConfig (optional token → NULL)
    agent_type: settings.agent.type,
    agent_auth_method: settings.agent.authMethod,
    agent_token: settings.agent.token ?? null,

    // NotificationPreferences (boolean → 0/1)
    notif_in_app_enabled: settings.notifications.inApp.enabled ? 1 : 0,
    notif_browser_enabled: settings.notifications.browser.enabled ? 1 : 0,
    notif_desktop_enabled: settings.notifications.desktop.enabled ? 1 : 0,
    notif_evt_agent_started: settings.notifications.events.agentStarted ? 1 : 0,
    notif_evt_phase_completed: settings.notifications.events.phaseCompleted ? 1 : 0,
    notif_evt_waiting_approval: settings.notifications.events.waitingApproval ? 1 : 0,
    notif_evt_agent_completed: settings.notifications.events.agentCompleted ? 1 : 0,
    notif_evt_agent_failed: settings.notifications.events.agentFailed ? 1 : 0,
    notif_evt_pr_merged: settings.notifications.events.prMerged ? 1 : 0,
    notif_evt_pr_closed: settings.notifications.events.prClosed ? 1 : 0,
    notif_evt_pr_checks_passed: settings.notifications.events.prChecksPassed ? 1 : 0,
    notif_evt_pr_checks_failed: settings.notifications.events.prChecksFailed ? 1 : 0,
    notif_evt_pr_blocked: settings.notifications.events.prBlocked ? 1 : 0,
    notif_evt_merge_review_ready: settings.notifications.events.mergeReviewReady ? 1 : 0,

    // WorkflowConfig (boolean → INTEGER)
    workflow_open_pr_on_impl_complete: settings.workflow.openPrOnImplementationComplete ? 1 : 0,

    // WorkflowConfig CI settings (optional number → INTEGER | null)
    ci_max_fix_attempts: settings.workflow.ciMaxFixAttempts ?? null,
    ci_watch_timeout_ms: settings.workflow.ciWatchTimeoutMs ?? null,
    ci_log_max_chars: settings.workflow.ciLogMaxChars ?? null,
    ci_watch_enabled: settings.workflow.ciWatchEnabled !== false ? 1 : 0,

    // WorkflowConfig per-stage timeouts (optional number → INTEGER | null)
    stage_timeout_analyze_ms: settings.workflow.stageTimeouts?.analyzeMs ?? null,
    stage_timeout_requirements_ms: settings.workflow.stageTimeouts?.requirementsMs ?? null,
    stage_timeout_research_ms: settings.workflow.stageTimeouts?.researchMs ?? null,
    stage_timeout_plan_ms: settings.workflow.stageTimeouts?.planMs ?? null,
    stage_timeout_implement_ms: settings.workflow.stageTimeouts?.implementMs ?? null,
    stage_timeout_merge_ms: settings.workflow.stageTimeouts?.mergeMs ?? null,

    // WorkflowConfig analyze-repo timeouts (optional number → INTEGER | null)
    analyze_repo_timeout_analyze_ms: settings.workflow.analyzeRepoTimeouts?.analyzeMs ?? null,

    // WorkflowConfig evidence settings (boolean → INTEGER)
    workflow_enable_evidence: settings.workflow.enableEvidence ? 1 : 0,
    workflow_commit_evidence: settings.workflow.commitEvidence ? 1 : 0,
    hide_ci_status: settings.workflow.hideCiStatus !== false ? 1 : 0,

    // Onboarding (boolean → INTEGER)
    onboarding_complete: settings.onboardingComplete ? 1 : 0,

    // ApprovalGateDefaults (boolean → INTEGER)
    approval_gate_allow_prd: settings.workflow.approvalGateDefaults.allowPrd ? 1 : 0,
    approval_gate_allow_plan: settings.workflow.approvalGateDefaults.allowPlan ? 1 : 0,
    approval_gate_allow_merge: settings.workflow.approvalGateDefaults.allowMerge ? 1 : 0,
    approval_gate_push_on_impl_complete: settings.workflow.approvalGateDefaults
      .pushOnImplementationComplete
      ? 1
      : 0,

    // FeatureFlags (boolean → 0/1, defaults to 0 when featureFlags undefined)
    feature_flag_skills: settings.featureFlags?.skills ? 1 : 0,
    feature_flag_env_deploy: settings.featureFlags?.envDeploy ? 1 : 0,
    feature_flag_debug: settings.featureFlags?.debug ? 1 : 0,
    feature_flag_github_import: settings.featureFlags?.githubImport ? 1 : 0,
    feature_flag_adopt_branch: settings.featureFlags?.adoptBranch ? 1 : 0,
    feature_flag_git_rebase_sync: settings.featureFlags?.gitRebaseSync ? 1 : 0,
    feature_flag_react_file_manager: settings.featureFlags?.reactFileManager ? 1 : 0,
    feature_flag_coasts_dev_server: settings.featureFlags?.coastsDevServer ? 1 : 0,
  };
}

/**
 * Build the stageTimeouts spread from DB row columns.
 * Returns `{ stageTimeouts: { ... } }` when at least one column is non-null,
 * or an empty object `{}` when all are null (so the field stays undefined).
 */
function buildStageTimeoutsFromRow(
  row: SettingsRow
): { stageTimeouts: Record<string, number> } | Record<string, never> {
  const entries: [string, number][] = [];
  if (row.stage_timeout_analyze_ms !== null)
    entries.push(['analyzeMs', row.stage_timeout_analyze_ms]);
  if (row.stage_timeout_requirements_ms !== null)
    entries.push(['requirementsMs', row.stage_timeout_requirements_ms]);
  if (row.stage_timeout_research_ms !== null)
    entries.push(['researchMs', row.stage_timeout_research_ms]);
  if (row.stage_timeout_plan_ms !== null) entries.push(['planMs', row.stage_timeout_plan_ms]);
  if (row.stage_timeout_implement_ms !== null)
    entries.push(['implementMs', row.stage_timeout_implement_ms]);
  if (row.stage_timeout_merge_ms !== null) entries.push(['mergeMs', row.stage_timeout_merge_ms]);

  if (entries.length === 0) return {};
  return { stageTimeouts: Object.fromEntries(entries) };
}

/**
 * Build the analyzeRepoTimeouts spread from DB row columns.
 * Returns `{ analyzeRepoTimeouts: { ... } }` when the column is non-null,
 * or an empty object `{}` when null (so the field stays undefined).
 */
function buildAnalyzeRepoTimeoutsFromRow(
  row: SettingsRow
): { analyzeRepoTimeouts: Record<string, number> } | Record<string, never> {
  if (row.analyze_repo_timeout_analyze_ms === null) return {};
  return { analyzeRepoTimeouts: { analyzeMs: row.analyze_repo_timeout_analyze_ms } };
}

/**
 * Maps database row to Settings domain object.
 * Reconstructs nested objects and converts types from SQL.
 *
 * @param row - Database row with snake_case columns
 * @returns Settings domain object with camelCase properties
 */
export function fromDatabase(row: SettingsRow): Settings {
  return {
    // Base entity
    id: row.id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),

    // ModelConfiguration — model_default is the source of truth (added in migration 024)
    models: {
      default: row.model_default,
    },

    // UserProfile (NULL → undefined, exclude from object)
    user: {
      ...(row.user_name !== null && { name: row.user_name }),
      ...(row.user_email !== null && { email: row.user_email }),
      ...(row.user_github_username !== null && { githubUsername: row.user_github_username }),
    },

    // EnvironmentConfig
    environment: {
      defaultEditor: row.env_default_editor as EditorType,
      shellPreference: row.env_shell_preference,
      terminalPreference: (row.env_terminal_preference ?? 'system') as TerminalType,
    },

    // SystemConfig (INTEGER → boolean)
    system: {
      autoUpdate: row.sys_auto_update === 1,
      logLevel: row.sys_log_level,
    },

    // AgentConfig (NULL → undefined for optional token)
    agent: {
      type: row.agent_type as AgentType,
      authMethod: row.agent_auth_method as AgentAuthMethod,
      ...(row.agent_token !== null && { token: row.agent_token }),
    },

    // NotificationPreferences (INTEGER 0/1 → boolean)
    notifications: {
      inApp: { enabled: row.notif_in_app_enabled === 1 },
      browser: { enabled: row.notif_browser_enabled === 1 },
      desktop: { enabled: row.notif_desktop_enabled === 1 },
      events: {
        agentStarted: row.notif_evt_agent_started === 1,
        phaseCompleted: row.notif_evt_phase_completed === 1,
        waitingApproval: row.notif_evt_waiting_approval === 1,
        agentCompleted: row.notif_evt_agent_completed === 1,
        agentFailed: row.notif_evt_agent_failed === 1,
        prMerged: row.notif_evt_pr_merged === 1,
        prClosed: row.notif_evt_pr_closed === 1,
        prChecksPassed: row.notif_evt_pr_checks_passed === 1,
        prChecksFailed: row.notif_evt_pr_checks_failed === 1,
        prBlocked: row.notif_evt_pr_blocked === 1,
        mergeReviewReady: row.notif_evt_merge_review_ready === 1,
      },
    },

    // WorkflowConfig (INTEGER → boolean)
    workflow: {
      openPrOnImplementationComplete: row.workflow_open_pr_on_impl_complete === 1,
      approvalGateDefaults: {
        allowPrd: row.approval_gate_allow_prd === 1,
        allowPlan: row.approval_gate_allow_plan === 1,
        allowMerge: row.approval_gate_allow_merge === 1,
        pushOnImplementationComplete: row.approval_gate_push_on_impl_complete === 1,
      },
      ...(row.ci_max_fix_attempts !== null && { ciMaxFixAttempts: row.ci_max_fix_attempts }),
      ...(row.ci_watch_timeout_ms !== null && { ciWatchTimeoutMs: row.ci_watch_timeout_ms }),
      ...(row.ci_log_max_chars !== null && { ciLogMaxChars: row.ci_log_max_chars }),
      ...buildStageTimeoutsFromRow(row),
      ...buildAnalyzeRepoTimeoutsFromRow(row),
      ciWatchEnabled: row.ci_watch_enabled !== 0,
      enableEvidence: row.workflow_enable_evidence === 1,
      commitEvidence: row.workflow_commit_evidence === 1,
      hideCiStatus: row.hide_ci_status === 1,
    },

    // FeatureFlags (INTEGER 0/1 → boolean)
    featureFlags: {
      skills: row.feature_flag_skills === 1,
      envDeploy: row.feature_flag_env_deploy === 1,
      debug: row.feature_flag_debug === 1,
      githubImport: row.feature_flag_github_import === 1,
      adoptBranch: row.feature_flag_adopt_branch === 1,
      gitRebaseSync: row.feature_flag_git_rebase_sync === 1,
      reactFileManager: row.feature_flag_react_file_manager === 1,
      coastsDevServer: row.feature_flag_coasts_dev_server === 1,
    },

    // Onboarding (INTEGER → boolean)
    onboardingComplete: row.onboarding_complete === 1,
  };
}
