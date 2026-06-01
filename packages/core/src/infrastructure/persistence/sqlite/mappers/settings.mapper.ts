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

import type {
  Settings,
  SkillInjectionConfig,
  SkillSource,
} from '../../../../domain/generated/output.js';
import { createDefaultSettings } from '../../../../domain/factories/settings-defaults.factory.js';
import {
  type AgentType,
  type AgentAuthMethod,
  type EditorType,
  type Language,
  type TerminalType,
  type DefaultHomePage,
  type WhatsAppConfig,
  type WhatsAppAdapterKind,
  type WhatsAppConnectionStatus,
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

  // UserProfile (user.*) - all nullable except language
  user_name: string | null;
  user_email: string | null;
  user_github_username: string | null;
  user_preferred_language: string;

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
  stage_timeout_fast_implement_ms: number | null;
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
  default_fast_mode: number;

  // FeatureFlags (featureFlags.*)
  feature_flag_env_deploy: number;
  feature_flag_debug: number;
  feature_flag_react_file_manager: number;
  feature_flag_projects: number;
  feature_flag_code_review: number;
  feature_flag_collaboration: number;
  feature_flag_bedrock_integration: number;
  feature_flag_whatsapp_dispatch: number;
  // Interactive agent config (added in migration 046)
  interactive_agent_enabled: number;
  interactive_agent_auto_timeout_minutes: number;
  interactive_agent_max_concurrent_sessions: number;

  // Auto-archive config (added in migration 049)
  auto_archive_delay_minutes: number;

  // FAB layout config (added in migration 050)
  fab_position_swapped: number;

  // Skill injection config (added in migration 051)
  skill_injection_enabled: number;
  skill_injection_skills: string | null;

  // Default home page (added in migration 095)
  default_home_page: string;

  // WhatsApp integration config (added in migration 107, spec 101)
  whatsapp_enabled: number;
  whatsapp_adapter: string;
  whatsapp_linked_number: string | null;
  whatsapp_status: string | null;
  whatsapp_allowed_numbers: string | null; // JSON array of E.164 strings
  whatsapp_cloud_api_phone_number_id: string | null;
  whatsapp_cloud_api_access_token: string | null;
  whatsapp_cloud_api_verify_token: string | null;
  whatsapp_cloud_api_app_secret: string | null;
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

    // UserProfile (optional fields → NULL, language defaults to 'en')
    user_name: settings.user.name ?? null,
    user_email: settings.user.email ?? null,
    user_github_username: settings.user.githubUsername ?? null,
    user_preferred_language: settings.user.preferredLanguage ?? 'en',

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
    stage_timeout_fast_implement_ms: settings.workflow.stageTimeouts?.fastImplementMs ?? null,
    stage_timeout_merge_ms: settings.workflow.stageTimeouts?.mergeMs ?? null,

    // WorkflowConfig analyze-repo timeouts (optional number → INTEGER | null)
    analyze_repo_timeout_analyze_ms: settings.workflow.analyzeRepoTimeouts?.analyzeMs ?? null,

    // WorkflowConfig evidence settings (boolean → INTEGER)
    workflow_enable_evidence: settings.workflow.enableEvidence ? 1 : 0,
    workflow_commit_evidence: settings.workflow.commitEvidence ? 1 : 0,
    hide_ci_status: settings.workflow.hideCiStatus !== false ? 1 : 0,
    default_fast_mode: settings.workflow.defaultFastMode !== false ? 1 : 0,

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
    feature_flag_env_deploy: settings.featureFlags?.envDeploy ? 1 : 0,
    feature_flag_debug: settings.featureFlags?.debug ? 1 : 0,
    feature_flag_react_file_manager: settings.featureFlags?.reactFileManager ? 1 : 0,
    feature_flag_projects: settings.featureFlags?.projects ? 1 : 0,
    feature_flag_code_review: settings.featureFlags?.codeReview ? 1 : 0,
    feature_flag_collaboration: settings.featureFlags?.collaboration ? 1 : 0,
    feature_flag_bedrock_integration: settings.featureFlags?.bedrockIntegration ? 1 : 0,
    feature_flag_whatsapp_dispatch: settings.featureFlags?.whatsappDispatch ? 1 : 0,

    // InteractiveAgentConfig (boolean → 0/1, integer fields; defaults applied here)
    interactive_agent_enabled: (settings.interactiveAgent?.enabled ?? true) ? 1 : 0,
    interactive_agent_auto_timeout_minutes: settings.interactiveAgent?.autoTimeoutMinutes ?? 15,
    interactive_agent_max_concurrent_sessions:
      settings.interactiveAgent?.maxConcurrentSessions ?? 3,

    // Auto-archive config (default: 10 minutes)
    auto_archive_delay_minutes: settings.workflow.autoArchiveDelayMinutes ?? 10,

    // FAB layout config (default: not swapped)
    fab_position_swapped: (settings.fabLayout?.swapPosition ?? false) ? 1 : 0,

    // Skill injection config (default: disabled, no skills)
    skill_injection_enabled: settings.workflow.skillInjection?.enabled ? 1 : 0,
    skill_injection_skills: settings.workflow.skillInjection?.skills?.length
      ? JSON.stringify(settings.workflow.skillInjection.skills)
      : null,

    // Default home page (default: control-center)
    default_home_page: settings.defaultHomePage ?? 'control-center',

    // WhatsApp integration config (spec 101; optional secrets → NULL)
    whatsapp_enabled: settings.whatsapp?.enabled ? 1 : 0,
    whatsapp_adapter: settings.whatsapp?.adapter ?? 'baileys',
    whatsapp_linked_number: settings.whatsapp?.linkedNumber ?? null,
    whatsapp_status: settings.whatsapp?.status ?? null,
    whatsapp_allowed_numbers: settings.whatsapp?.allowedNumbers?.length
      ? JSON.stringify(settings.whatsapp.allowedNumbers)
      : null,
    whatsapp_cloud_api_phone_number_id: settings.whatsapp?.cloudApiPhoneNumberId ?? null,
    whatsapp_cloud_api_access_token: settings.whatsapp?.cloudApiAccessToken ?? null,
    whatsapp_cloud_api_verify_token: settings.whatsapp?.cloudApiVerifyToken ?? null,
    whatsapp_cloud_api_app_secret: settings.whatsapp?.cloudApiAppSecret ?? null,
  };
}

/**
 * Build the WhatsAppConfig spread from DB row columns (spec 101).
 *
 * Always returns a `whatsapp` object so callers get a stable shape; required
 * fields fall back to their defaults (disabled, baileys adapter) and optional
 * secrets / runtime fields are omitted when NULL.
 */
function buildWhatsAppFromRow(row: SettingsRow): WhatsAppConfig {
  const allowedNumbers: string[] | undefined =
    row.whatsapp_allowed_numbers !== null
      ? (JSON.parse(row.whatsapp_allowed_numbers) as string[])
      : undefined;

  return {
    enabled: row.whatsapp_enabled === 1,
    adapter: (row.whatsapp_adapter ?? 'baileys') as WhatsAppAdapterKind,
    ...(row.whatsapp_linked_number !== null && { linkedNumber: row.whatsapp_linked_number }),
    ...(row.whatsapp_status !== null && {
      status: row.whatsapp_status as WhatsAppConnectionStatus,
    }),
    ...(allowedNumbers !== undefined && { allowedNumbers }),
    ...(row.whatsapp_cloud_api_phone_number_id !== null && {
      cloudApiPhoneNumberId: row.whatsapp_cloud_api_phone_number_id,
    }),
    ...(row.whatsapp_cloud_api_access_token !== null && {
      cloudApiAccessToken: row.whatsapp_cloud_api_access_token,
    }),
    ...(row.whatsapp_cloud_api_verify_token !== null && {
      cloudApiVerifyToken: row.whatsapp_cloud_api_verify_token,
    }),
    ...(row.whatsapp_cloud_api_app_secret !== null && {
      cloudApiAppSecret: row.whatsapp_cloud_api_app_secret,
    }),
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
  if (row.stage_timeout_fast_implement_ms !== null)
    entries.push(['fastImplementMs', row.stage_timeout_fast_implement_ms]);
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
 * Build the skillInjection spread from DB row columns.
 * Returns `{ skillInjection: { ... } }` when the enabled flag or skills JSON is present,
 * or an empty object `{}` when both are default/null (so the field stays undefined).
 */
function buildSkillInjectionFromRow(
  row: SettingsRow
): { skillInjection: SkillInjectionConfig } | Record<string, never> {
  const hasSkills = row.skill_injection_skills !== null;
  const isEnabled = row.skill_injection_enabled === 1;

  if (!isEnabled && !hasSkills) return {};

  const skills: SkillSource[] = hasSkills
    ? JSON.parse(row.skill_injection_skills!)
    : (createDefaultSettings().workflow.skillInjection?.skills ?? []);

  return {
    skillInjection: {
      enabled: isEnabled,
      skills,
    },
  };
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

    // UserProfile (NULL → undefined, exclude from object; language defaults to 'en')
    user: {
      ...(row.user_name !== null && { name: row.user_name }),
      ...(row.user_email !== null && { email: row.user_email }),
      ...(row.user_github_username !== null && { githubUsername: row.user_github_username }),
      preferredLanguage: (row.user_preferred_language ?? 'en') as Language,
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
      ...buildSkillInjectionFromRow(row),
      ciWatchEnabled: row.ci_watch_enabled !== 0,
      enableEvidence: row.workflow_enable_evidence === 1,
      commitEvidence: row.workflow_commit_evidence === 1,
      hideCiStatus: row.hide_ci_status === 1,
      defaultFastMode: (row.default_fast_mode ?? 1) !== 0,
      autoArchiveDelayMinutes: row.auto_archive_delay_minutes ?? 10,
    },

    // FeatureFlags (INTEGER 0/1 → boolean)
    featureFlags: {
      envDeploy: row.feature_flag_env_deploy === 1,
      debug: row.feature_flag_debug === 1,
      reactFileManager: row.feature_flag_react_file_manager === 1,
      projects: row.feature_flag_projects === 1,
      codeReview: row.feature_flag_code_review === 1,
      collaboration: row.feature_flag_collaboration === 1,
      bedrockIntegration: row.feature_flag_bedrock_integration === 1,
      whatsappDispatch: row.feature_flag_whatsapp_dispatch === 1,
    },

    // InteractiveAgentConfig (INTEGER 0/1 → boolean, integer → number)
    interactiveAgent: {
      enabled: (row.interactive_agent_enabled ?? 1) !== 0,
      autoTimeoutMinutes: row.interactive_agent_auto_timeout_minutes ?? 15,
      maxConcurrentSessions: row.interactive_agent_max_concurrent_sessions ?? 3,
    },

    // FabLayoutConfig (INTEGER 0/1 → boolean)
    fabLayout: {
      swapPosition: (row.fab_position_swapped ?? 0) !== 0,
    },

    // Default home page
    defaultHomePage: (row.default_home_page ?? 'control-center') as DefaultHomePage,

    // WhatsApp integration config (spec 101)
    whatsapp: buildWhatsAppFromRow(row),

    // Onboarding (INTEGER → boolean)
    onboardingComplete: row.onboarding_complete === 1,
  };
}
