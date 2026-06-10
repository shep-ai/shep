/**
 * Settings Database Mapper Unit Tests
 *
 * Tests for toDatabase() and fromDatabase() mapping functions,
 * specifically for the notification preference columns added in migration v9.
 *
 * TDD Phase: RED
 * - These tests are written BEFORE implementation
 * - Tests for notification mapping should FAIL initially
 */

import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type SettingsRow,
} from '@/infrastructure/persistence/sqlite/mappers/settings.mapper.js';
import type { Settings } from '@/domain/generated/output.js';
import {
  AgentType,
  AgentAuthMethod,
  EditorType,
  Language,
  SkillSourceType,
  SecurityMode,
  TerminalType,
} from '@/domain/generated/output.js';

/**
 * Creates a complete test Settings object with all fields populated,
 * including notification preferences.
 */
function createTestSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 'test-id',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    models: {
      default: 'claude-opus-4',
    },
    user: {
      name: 'Test User',
      email: 'test@example.com',
      githubUsername: 'testuser',
    },
    environment: {
      defaultEditor: EditorType.VsCode,
      shellPreference: 'zsh',
      terminalPreference: TerminalType.System,
    },
    system: {
      autoUpdate: true,
      logLevel: 'info',
    },
    agent: {
      type: AgentType.ClaudeCode,
      authMethod: AgentAuthMethod.Session,
    },
    notifications: {
      inApp: { enabled: true },
      browser: { enabled: true },
      desktop: { enabled: true },
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
        workflowStarted: true,
        workflowCompleted: true,
        workflowFailed: true,
      },
    },
    workflow: {
      openPrOnImplementationComplete: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
      enableEvidence: false,
      commitEvidence: false,
      ciWatchEnabled: true,
      defaultMode: 'Fast',
    },
    security: {
      mode: SecurityMode.Advisory,
    },
    onboardingComplete: false,
    ...overrides,
  };
}

/**
 * Creates a complete test SettingsRow with all columns populated,
 * including notification columns.
 */
function createTestRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    id: 'test-id',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T12:00:00.000Z',
    model_analyze: 'claude-opus-4',
    model_requirements: 'claude-sonnet-4',
    model_plan: 'claude-sonnet-4',
    model_implement: 'claude-sonnet-4',
    model_default: 'claude-opus-4',
    user_name: 'Test User',
    user_email: 'test@example.com',
    user_github_username: 'testuser',
    user_preferred_language: 'en',
    env_default_editor: 'vscode',
    env_shell_preference: 'zsh',
    env_terminal_preference: 'system',
    sys_auto_update: 1,
    sys_log_level: 'info',
    agent_type: 'claude-code',
    agent_auth_method: 'session',
    agent_token: null,
    notif_in_app_enabled: 1,
    notif_browser_enabled: 1,
    notif_desktop_enabled: 1,
    notif_evt_agent_started: 1,
    notif_evt_phase_completed: 1,
    notif_evt_waiting_approval: 1,
    notif_evt_agent_completed: 1,
    notif_evt_agent_failed: 1,
    notif_evt_pr_merged: 1,
    notif_evt_pr_closed: 1,
    notif_evt_pr_checks_passed: 1,
    notif_evt_pr_checks_failed: 1,
    notif_evt_pr_blocked: 1,
    notif_evt_merge_review_ready: 1,
    notif_evt_workflow_started: 1,
    notif_evt_workflow_completed: 1,
    notif_evt_workflow_failed: 1,
    workflow_open_pr_on_impl_complete: 0,
    workflow_enable_evidence: 0,
    workflow_commit_evidence: 0,
    hide_ci_status: 1,
    default_mode: 'Fast',
    ci_watch_enabled: 1,
    ci_max_fix_attempts: null,
    ci_watch_timeout_ms: null,
    ci_log_max_chars: null,
    stage_timeout_analyze_ms: null,
    stage_timeout_requirements_ms: null,
    stage_timeout_research_ms: null,
    stage_timeout_plan_ms: null,
    stage_timeout_implement_ms: null,
    stage_timeout_fast_implement_ms: null,
    stage_timeout_merge_ms: null,
    analyze_repo_timeout_analyze_ms: null,
    onboarding_complete: 0,
    approval_gate_allow_prd: 0,
    approval_gate_allow_plan: 0,
    approval_gate_allow_merge: 0,
    approval_gate_push_on_impl_complete: 0,
    feature_flag_env_deploy: 0,
    feature_flag_debug: 0,
    feature_flag_react_file_manager: 0,
    feature_flag_projects: 0,
    feature_flag_code_review: 0,
    feature_flag_collaboration: 0,
    feature_flag_bedrock_integration: 0,
    feature_flag_whatsapp_dispatch: 0,
    feature_flag_aspm: 0,
    feature_flag_clusters: 0,
    feature_flag_supply_chain_security: 1,
    feature_flag_scheduled_workflows: 0,
    interactive_agent_enabled: 1,
    interactive_agent_auto_timeout_minutes: 15,
    interactive_agent_max_concurrent_sessions: 3,
    auto_archive_delay_minutes: 10,
    fab_position_swapped: 0,
    exploration_max_iterations: null,
    skill_injection_enabled: 0,
    skill_injection_skills: null,
    default_home_page: 'control-center',
    whatsapp_enabled: 0,
    whatsapp_adapter: 'baileys',
    whatsapp_linked_number: null,
    whatsapp_status: null,
    whatsapp_allowed_numbers: null,
    whatsapp_cloud_api_phone_number_id: null,
    whatsapp_cloud_api_access_token: null,
    whatsapp_cloud_api_verify_token: null,
    whatsapp_cloud_api_app_secret: null,
    security_mode: 'Advisory',
    security_last_evaluation_at: null,
    security_policy_source: null,
    // Messaging columns (migration 056) — all default to "unconfigured".
    messaging_enabled: 0,
    messaging_gateway_url: null,
    messaging_device_id: null,
    messaging_gateway_client_id: null,
    messaging_debounce_ms: null,
    messaging_chat_buffer_ms: null,
    messaging_telegram_enabled: 0,
    messaging_telegram_paired: 0,
    messaging_telegram_chat_id: null,
    messaging_telegram_route_id: null,
    messaging_telegram_route_token: null,
    messaging_telegram_public_url: null,
    messaging_telegram_bot_token: null,
    messaging_telegram_pending_code: null,
    messaging_telegram_pending_expires_at: null,
    messaging_whatsapp_enabled: 0,
    messaging_whatsapp_paired: 0,
    messaging_whatsapp_chat_id: null,
    messaging_whatsapp_route_id: null,
    messaging_whatsapp_route_token: null,
    messaging_whatsapp_public_url: null,
    messaging_whatsapp_bot_token: null,
    messaging_whatsapp_pending_code: null,
    messaging_whatsapp_pending_expires_at: null,
    ...overrides,
  };
}

describe('Settings Mapper', () => {
  describe('toDatabase() - notification preferences', () => {
    it('should map notifications.inApp.enabled=true to notif_in_app_enabled=1', () => {
      const settings = createTestSettings({
        notifications: {
          inApp: { enabled: true },
          browser: { enabled: true },
          desktop: { enabled: true },
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
            workflowStarted: true,
            workflowCompleted: true,
            workflowFailed: true,
          },
        },
      });

      const row = toDatabase(settings);

      expect(row.notif_in_app_enabled).toBe(1);
    });

    it('should map notifications.inApp.enabled=false to notif_in_app_enabled=0', () => {
      const settings = createTestSettings({
        notifications: {
          inApp: { enabled: false },
          browser: { enabled: true },
          desktop: { enabled: true },
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
            workflowStarted: true,
            workflowCompleted: true,
            workflowFailed: true,
          },
        },
      });

      const row = toDatabase(settings);

      expect(row.notif_in_app_enabled).toBe(0);
    });

    it('should map all three channel enabled flags', () => {
      const settings = createTestSettings({
        notifications: {
          inApp: { enabled: true },
          browser: { enabled: true },
          desktop: { enabled: true },
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
            workflowStarted: true,
            workflowCompleted: true,
            workflowFailed: true,
          },
        },
      });

      const row = toDatabase(settings);

      expect(row.notif_in_app_enabled).toBe(1);
      expect(row.notif_browser_enabled).toBe(1);
      expect(row.notif_desktop_enabled).toBe(1);
    });

    it('should map all event type flags', () => {
      const settings = createTestSettings({
        notifications: {
          inApp: { enabled: false },
          browser: { enabled: false },
          desktop: { enabled: false },
          events: {
            agentStarted: false,
            phaseCompleted: false,
            waitingApproval: true,
            agentCompleted: true,
            agentFailed: false,
            prMerged: true,
            prClosed: false,
            prChecksPassed: true,
            prChecksFailed: false,
            prBlocked: false,
            mergeReviewReady: false,
            workflowStarted: false,
            workflowCompleted: false,
            workflowFailed: false,
          },
        },
      });

      const row = toDatabase(settings);

      expect(row.notif_evt_agent_started).toBe(0);
      expect(row.notif_evt_phase_completed).toBe(0);
      expect(row.notif_evt_waiting_approval).toBe(1);
      expect(row.notif_evt_agent_completed).toBe(1);
      expect(row.notif_evt_agent_failed).toBe(0);
    });
  });

  describe('fromDatabase() - notification preferences', () => {
    it('should reconstruct notifications.inApp.enabled=true from notif_in_app_enabled=1', () => {
      const row = createTestRow({ notif_in_app_enabled: 1 });

      const settings = fromDatabase(row);

      expect(settings.notifications.inApp.enabled).toBe(true);
    });

    it('should reconstruct notifications.desktop.enabled=true from notif_desktop_enabled=1', () => {
      const row = createTestRow({ notif_desktop_enabled: 1 });

      const settings = fromDatabase(row);

      expect(settings.notifications.desktop.enabled).toBe(true);
    });

    it('should reconstruct all channel configs from columns', () => {
      const row = createTestRow({
        notif_in_app_enabled: 0,
        notif_browser_enabled: 1,
        notif_desktop_enabled: 0,
      });

      const settings = fromDatabase(row);

      expect(settings.notifications.inApp.enabled).toBe(false);
      expect(settings.notifications.browser.enabled).toBe(true);
      expect(settings.notifications.desktop.enabled).toBe(false);
    });

    it('should reconstruct all event type configs from columns', () => {
      const row = createTestRow({
        notif_evt_agent_started: 0,
        notif_evt_phase_completed: 1,
        notif_evt_waiting_approval: 0,
        notif_evt_agent_completed: 1,
        notif_evt_agent_failed: 0,
      });

      const settings = fromDatabase(row);

      expect(settings.notifications.events.agentStarted).toBe(false);
      expect(settings.notifications.events.phaseCompleted).toBe(true);
      expect(settings.notifications.events.waitingApproval).toBe(false);
      expect(settings.notifications.events.agentCompleted).toBe(true);
      expect(settings.notifications.events.agentFailed).toBe(false);
    });
  });

  describe('round-trip - notification preferences', () => {
    it('should preserve all notification values through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        notifications: {
          inApp: { enabled: true },
          browser: { enabled: false },
          desktop: { enabled: true },
          events: {
            agentStarted: false,
            phaseCompleted: true,
            waitingApproval: false,
            agentCompleted: true,
            agentFailed: false,
            prMerged: true,
            prClosed: false,
            prChecksPassed: true,
            prChecksFailed: false,
            prBlocked: false,
            mergeReviewReady: false,
            workflowStarted: false,
            workflowCompleted: false,
            workflowFailed: false,
          },
        },
      });

      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.notifications).toEqual(original.notifications);
    });

    it('should preserve default notification values through round-trip', () => {
      const original = createTestSettings(); // Uses default notifications (all channels on, all events on)

      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.notifications).toEqual({
        inApp: { enabled: true },
        browser: { enabled: true },
        desktop: { enabled: true },
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
          workflowStarted: true,
          workflowCompleted: true,
          workflowFailed: true,
        },
      });
    });
  });

  describe('toDatabase() - preserves existing field mappings', () => {
    it('should still map all pre-existing fields correctly', () => {
      const settings = createTestSettings();

      const row = toDatabase(settings);

      expect(row.id).toBe('test-id');
      expect(row.model_default).toBe('claude-opus-4');
      expect(row.user_name).toBe('Test User');
      expect(row.env_default_editor).toBe('vscode');
      expect(row.sys_auto_update).toBe(1);
      expect(row.agent_type).toBe('claude-code');
    });
  });

  describe('fromDatabase() - preserves existing field mappings', () => {
    it('should still reconstruct all pre-existing fields correctly', () => {
      const row = createTestRow();

      const settings = fromDatabase(row);

      expect(settings.id).toBe('test-id');
      expect(settings.models.default).toBe('claude-opus-4');
      expect(settings.user.name).toBe('Test User');
      expect(settings.environment.defaultEditor).toBe('vscode');
      expect(settings.system.autoUpdate).toBe(true);
      expect(settings.agent.type).toBe('claude-code');
    });
  });

  describe('toDatabase() - onboarding fields', () => {
    it('should map onboardingComplete:true to onboarding_complete:1', () => {
      const settings = createTestSettings({ onboardingComplete: true } as any);
      const row = toDatabase(settings);
      expect(row.onboarding_complete).toBe(1);
    });

    it('should map onboardingComplete:false to onboarding_complete:0', () => {
      const settings = createTestSettings({ onboardingComplete: false } as any);
      const row = toDatabase(settings);
      expect(row.onboarding_complete).toBe(0);
    });

    it('should map approvalGateDefaults fields to integer columns', () => {
      const settings = createTestSettings();
      (settings as any).workflow = {
        ...settings.workflow,
        approvalGateDefaults: {
          allowPrd: true,
          allowPlan: false,
          allowMerge: true,
          pushOnImplementationComplete: false,
        },
      };
      const row = toDatabase(settings);
      expect(row.approval_gate_allow_prd).toBe(1);
      expect(row.approval_gate_allow_plan).toBe(0);
      expect(row.approval_gate_allow_merge).toBe(1);
      expect(row.approval_gate_push_on_impl_complete).toBe(0);
    });
  });

  describe('fromDatabase() - onboarding fields', () => {
    it('should map onboarding_complete:1 to onboardingComplete:true', () => {
      const row = createTestRow({ onboarding_complete: 1 });
      const settings = fromDatabase(row);
      expect(settings.onboardingComplete).toBe(true);
    });

    it('should map onboarding_complete:0 to onboardingComplete:false', () => {
      const row = createTestRow({ onboarding_complete: 0 });
      const settings = fromDatabase(row);
      expect(settings.onboardingComplete).toBe(false);
    });

    it('should reconstruct approvalGateDefaults from columns', () => {
      const row = createTestRow({
        approval_gate_allow_prd: 1,
        approval_gate_allow_plan: 1,
        approval_gate_allow_merge: 0,
        approval_gate_push_on_impl_complete: 1,
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.approvalGateDefaults).toEqual({
        allowPrd: true,
        allowPlan: true,
        allowMerge: false,
        pushOnImplementationComplete: true,
      });
    });
  });

  describe('round-trip - onboarding fields', () => {
    it('should preserve onboardingComplete and approvalGateDefaults through round-trip', () => {
      const original = createTestSettings();
      (original as any).onboardingComplete = true;
      (original as any).workflow = {
        ...original.workflow,
        approvalGateDefaults: {
          allowPrd: true,
          allowPlan: false,
          allowMerge: true,
          pushOnImplementationComplete: true,
        },
      };

      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.onboardingComplete).toBe(true);
      expect(restored.workflow.approvalGateDefaults).toEqual({
        allowPrd: true,
        allowPlan: false,
        allowMerge: true,
        pushOnImplementationComplete: true,
      });
    });
  });

  describe('toDatabase() - terminal preference', () => {
    it('should map terminalPreference to env_terminal_preference', () => {
      const settings = createTestSettings({
        environment: {
          defaultEditor: EditorType.VsCode,
          shellPreference: 'bash',
          terminalPreference: TerminalType.Warp,
        },
      });
      const row = toDatabase(settings);
      expect(row.env_terminal_preference).toBe('warp');
    });

    it('should default to system terminal', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.env_terminal_preference).toBe('system');
    });
  });

  describe('fromDatabase() - terminal preference', () => {
    it('should reconstruct terminalPreference from env_terminal_preference', () => {
      const row = createTestRow({ env_terminal_preference: 'warp' });
      const settings = fromDatabase(row);
      expect(settings.environment.terminalPreference).toBe('warp');
    });

    it('should default to system when column is null', () => {
      const row = createTestRow({ env_terminal_preference: undefined as any });
      const settings = fromDatabase(row);
      expect(settings.environment.terminalPreference).toBe('system');
    });
  });

  describe('round-trip - terminal preference', () => {
    it('should preserve terminalPreference through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        environment: {
          defaultEditor: EditorType.Cursor,
          shellPreference: 'fish',
          terminalPreference: TerminalType.ITerm2,
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.environment.terminalPreference).toBe(TerminalType.ITerm2);
    });
  });

  describe('toDatabase() - per-stage timeouts', () => {
    it('should map stageTimeouts to individual stage_timeout columns', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          stageTimeouts: {
            analyzeMs: 300_000,
            requirementsMs: 600_000,
            researchMs: 900_000,
            planMs: 600_000,
            implementMs: 1_800_000,
            fastImplementMs: 1_200_000,
            mergeMs: 600_000,
          },
        },
      });
      const row = toDatabase(settings);
      expect(row.stage_timeout_analyze_ms).toBe(300_000);
      expect(row.stage_timeout_requirements_ms).toBe(600_000);
      expect(row.stage_timeout_research_ms).toBe(900_000);
      expect(row.stage_timeout_plan_ms).toBe(600_000);
      expect(row.stage_timeout_implement_ms).toBe(1_800_000);
      expect(row.stage_timeout_fast_implement_ms).toBe(1_200_000);
      expect(row.stage_timeout_merge_ms).toBe(600_000);
    });

    it('should map undefined stageTimeouts to nulls', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.stage_timeout_analyze_ms).toBeNull();
      expect(row.stage_timeout_requirements_ms).toBeNull();
      expect(row.stage_timeout_research_ms).toBeNull();
      expect(row.stage_timeout_plan_ms).toBeNull();
      expect(row.stage_timeout_implement_ms).toBeNull();
      expect(row.stage_timeout_fast_implement_ms).toBeNull();
      expect(row.stage_timeout_merge_ms).toBeNull();
    });

    it('should map analyzeRepoTimeouts to analyze_repo_timeout_analyze_ms', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          analyzeRepoTimeouts: { analyzeMs: 900_000 },
        },
      });
      const row = toDatabase(settings);
      expect(row.analyze_repo_timeout_analyze_ms).toBe(900_000);
    });

    it('should map undefined analyzeRepoTimeouts to null', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.analyze_repo_timeout_analyze_ms).toBeNull();
    });
  });

  describe('fromDatabase() - per-stage timeouts', () => {
    it('should reconstruct stageTimeouts from individual columns', () => {
      const row = createTestRow({
        stage_timeout_analyze_ms: 300_000,
        stage_timeout_implement_ms: 1_800_000,
        stage_timeout_fast_implement_ms: 1_200_000,
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.stageTimeouts).toEqual({
        analyzeMs: 300_000,
        implementMs: 1_800_000,
        fastImplementMs: 1_200_000,
      });
    });

    it('should omit stageTimeouts when all columns are null', () => {
      const row = createTestRow();
      const settings = fromDatabase(row);
      expect(settings.workflow.stageTimeouts).toBeUndefined();
    });

    it('should reconstruct analyzeRepoTimeouts from column', () => {
      const row = createTestRow({ analyze_repo_timeout_analyze_ms: 900_000 });
      const settings = fromDatabase(row);
      expect(settings.workflow.analyzeRepoTimeouts).toEqual({ analyzeMs: 900_000 });
    });

    it('should omit analyzeRepoTimeouts when column is null', () => {
      const row = createTestRow();
      const settings = fromDatabase(row);
      expect(settings.workflow.analyzeRepoTimeouts).toBeUndefined();
    });
  });

  describe('round-trip - per-stage timeouts', () => {
    it('should preserve stageTimeouts through round-trip', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          stageTimeouts: {
            analyzeMs: 300_000,
            requirementsMs: 600_000,
            researchMs: 900_000,
            planMs: 600_000,
            implementMs: 1_800_000,
            fastImplementMs: 1_200_000,
            mergeMs: 600_000,
          },
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.stageTimeouts).toEqual(original.workflow.stageTimeouts);
    });

    it('should preserve undefined stageTimeouts through round-trip', () => {
      const original = createTestSettings();
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.stageTimeouts).toBeUndefined();
    });

    it('should preserve analyzeRepoTimeouts through round-trip', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          analyzeRepoTimeouts: { analyzeMs: 900_000 },
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.analyzeRepoTimeouts).toEqual(original.workflow.analyzeRepoTimeouts);
    });
  });

  describe('toDatabase() - hideCiStatus', () => {
    it('should map workflow.hideCiStatus=true to hide_ci_status=1', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          hideCiStatus: true,
        },
      });
      const row = toDatabase(settings);
      expect(row.hide_ci_status).toBe(1);
    });

    it('should map workflow.hideCiStatus=false to hide_ci_status=0', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          hideCiStatus: false,
        },
      });
      const row = toDatabase(settings);
      expect(row.hide_ci_status).toBe(0);
    });

    it('should map workflow.hideCiStatus=undefined to hide_ci_status=1', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.hide_ci_status).toBe(1);
    });
  });

  describe('fromDatabase() - hideCiStatus', () => {
    it('should map hide_ci_status=1 to workflow.hideCiStatus=true', () => {
      const row = createTestRow({ hide_ci_status: 1 });
      const settings = fromDatabase(row);
      expect(settings.workflow.hideCiStatus).toBe(true);
    });

    it('should map hide_ci_status=0 to workflow.hideCiStatus=false', () => {
      const row = createTestRow({ hide_ci_status: 0 });
      const settings = fromDatabase(row);
      expect(settings.workflow.hideCiStatus).toBe(false);
    });
  });

  describe('round-trip - hideCiStatus', () => {
    it('should preserve hideCiStatus=true through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          hideCiStatus: true,
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.hideCiStatus).toBe(true);
    });

    it('should preserve hideCiStatus=false through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          hideCiStatus: false,
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.hideCiStatus).toBe(false);
    });

    it('should preserve hideCiStatus=undefined through toDatabase → fromDatabase as true', () => {
      const original = createTestSettings();
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.hideCiStatus).toBe(true);
    });
  });

  describe('toDatabase() - preferredLanguage', () => {
    it('should map user.preferredLanguage "ru" to user_preferred_language "ru"', () => {
      const settings = createTestSettings({
        user: {
          name: 'Test User',
          email: 'test@example.com',
          githubUsername: 'testuser',
          preferredLanguage: Language.Russian,
        },
      });
      const row = toDatabase(settings);
      expect(row.user_preferred_language).toBe('ru');
    });

    it('should map user.preferredLanguage "ar" to user_preferred_language "ar"', () => {
      const settings = createTestSettings({
        user: {
          name: 'Test User',
          preferredLanguage: Language.Arabic,
        },
      });
      const row = toDatabase(settings);
      expect(row.user_preferred_language).toBe('ar');
    });

    it('should default to "en" when preferredLanguage is undefined', () => {
      const settings = createTestSettings({
        user: {
          name: 'Test User',
        },
      });
      const row = toDatabase(settings);
      expect(row.user_preferred_language).toBe('en');
    });
  });

  describe('fromDatabase() - preferredLanguage', () => {
    it('should reconstruct user.preferredLanguage "ar" from user_preferred_language "ar"', () => {
      const row = createTestRow({ user_preferred_language: 'ar' });
      const settings = fromDatabase(row);
      expect(settings.user.preferredLanguage).toBe('ar');
    });

    it('should reconstruct user.preferredLanguage "he" from user_preferred_language "he"', () => {
      const row = createTestRow({ user_preferred_language: 'he' });
      const settings = fromDatabase(row);
      expect(settings.user.preferredLanguage).toBe('he');
    });

    it('should default to "en" when user_preferred_language is null/undefined', () => {
      const row = createTestRow({ user_preferred_language: undefined as any });
      const settings = fromDatabase(row);
      expect(settings.user.preferredLanguage).toBe('en');
    });
  });

  describe('round-trip - preferredLanguage', () => {
    it('should preserve preferredLanguage through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        user: {
          name: 'Test User',
          email: 'test@example.com',
          githubUsername: 'testuser',
          preferredLanguage: Language.French,
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.user.preferredLanguage).toBe(Language.French);
    });

    it('should preserve default "en" preferredLanguage through round-trip', () => {
      const original = createTestSettings();
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.user.preferredLanguage).toBe('en');
    });

    it('should preserve all 8 language values through round-trip', () => {
      const languages = [
        Language.English,
        Language.Russian,
        Language.Portuguese,
        Language.Spanish,
        Language.Arabic,
        Language.Hebrew,
        Language.French,
        Language.German,
      ];

      for (const lang of languages) {
        const original = createTestSettings({
          user: { preferredLanguage: lang },
        });
        const row = toDatabase(original);
        const restored = fromDatabase(row);
        expect(restored.user.preferredLanguage).toBe(lang);
      }
    });
  });

  describe('toDatabase() - defaultMode', () => {
    it('should map workflow.defaultMode=Fast to default_mode=Fast', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          defaultMode: 'Fast',
        },
      });
      const row = toDatabase(settings);
      expect(row.default_mode).toBe('Fast');
    });

    it('should map workflow.defaultMode=Regular to default_mode=Regular', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          defaultMode: 'Regular',
        },
      });
      const row = toDatabase(settings);
      expect(row.default_mode).toBe('Regular');
    });

    it('should map workflow.defaultMode=Exploration to default_mode=Exploration', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          defaultMode: 'Exploration',
        },
      });
      const row = toDatabase(settings);
      expect(row.default_mode).toBe('Exploration');
    });
  });

  describe('fromDatabase() - defaultMode', () => {
    it('should map default_mode=Fast to workflow.defaultMode=Fast', () => {
      const row = createTestRow({ default_mode: 'Fast' });
      const settings = fromDatabase(row);
      expect(settings.workflow.defaultMode).toBe('Fast');
    });

    it('should map default_mode=Regular to workflow.defaultMode=Regular', () => {
      const row = createTestRow({ default_mode: 'Regular' });
      const settings = fromDatabase(row);
      expect(settings.workflow.defaultMode).toBe('Regular');
    });

    it('should default to Fast when column is null (migration backward compat)', () => {
      const row = createTestRow({ default_mode: undefined as any });
      const settings = fromDatabase(row);
      expect(settings.workflow.defaultMode).toBe('Fast');
    });
  });

  describe('round-trip - defaultMode', () => {
    it('should preserve defaultMode=Fast through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          defaultMode: 'Fast',
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.defaultMode).toBe('Fast');
    });

    it('should preserve defaultMode=Regular through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          defaultMode: 'Regular',
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.defaultMode).toBe('Regular');
    });

    it('should preserve defaultMode=Exploration through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          defaultMode: 'Exploration',
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.defaultMode).toBe('Exploration');
    });
  });

  describe('toDatabase() - explorationMaxIterations', () => {
    it('should map workflow.explorationMaxIterations=10 to exploration_max_iterations=10', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          explorationMaxIterations: 10,
        },
      });
      const row = toDatabase(settings);
      expect(row.exploration_max_iterations).toBe(10);
    });

    it('should map undefined explorationMaxIterations to null', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.exploration_max_iterations).toBeNull();
    });
  });

  describe('fromDatabase() - explorationMaxIterations', () => {
    it('should map exploration_max_iterations=10 to workflow.explorationMaxIterations=10', () => {
      const row = createTestRow({ exploration_max_iterations: 10 });
      const settings = fromDatabase(row);
      expect(settings.workflow.explorationMaxIterations).toBe(10);
    });

    it('should omit explorationMaxIterations when column is null', () => {
      const row = createTestRow({ exploration_max_iterations: null });
      const settings = fromDatabase(row);
      expect(settings.workflow.explorationMaxIterations).toBeUndefined();
    });
  });

  describe('toDatabase() - fabLayout', () => {
    it('should map fabLayout.swapPosition=true to fab_position_swapped=1', () => {
      const settings = createTestSettings({
        fabLayout: { swapPosition: true },
      } as any);
      const row = toDatabase(settings);
      expect(row.fab_position_swapped).toBe(1);
    });

    it('should map fabLayout.swapPosition=false to fab_position_swapped=0', () => {
      const settings = createTestSettings({
        fabLayout: { swapPosition: false },
      } as any);
      const row = toDatabase(settings);
      expect(row.fab_position_swapped).toBe(0);
    });

    it('should default to 0 when fabLayout is undefined', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.fab_position_swapped).toBe(0);
    });
  });

  describe('fromDatabase() - fabLayout', () => {
    it('should map fab_position_swapped=1 to fabLayout.swapPosition=true', () => {
      const row = createTestRow({ fab_position_swapped: 1 });
      const settings = fromDatabase(row);
      expect(settings.fabLayout?.swapPosition).toBe(true);
    });

    it('should map fab_position_swapped=0 to fabLayout.swapPosition=false', () => {
      const row = createTestRow({ fab_position_swapped: 0 });
      const settings = fromDatabase(row);
      expect(settings.fabLayout?.swapPosition).toBe(false);
    });

    it('should default to false when column is null (migration backward compat)', () => {
      const row = createTestRow({ fab_position_swapped: undefined as any });
      const settings = fromDatabase(row);
      expect(settings.fabLayout?.swapPosition).toBe(false);
    });
  });

  describe('round-trip - fabLayout', () => {
    it('should preserve fabLayout.swapPosition=true through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        fabLayout: { swapPosition: true },
      } as any);
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.fabLayout?.swapPosition).toBe(true);
    });

    it('should preserve fabLayout.swapPosition=false through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        fabLayout: { swapPosition: false },
      } as any);
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.fabLayout?.swapPosition).toBe(false);
    });
  });

  describe('toDatabase() - skill injection', () => {
    it('should map skillInjection.enabled=true to skill_injection_enabled=1', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          skillInjection: {
            enabled: true,
            skills: [
              {
                name: 'test-skill',
                type: SkillSourceType.Local,
                source: '.claude/skills/test-skill',
              },
            ],
          },
        },
      });
      const row = toDatabase(settings);
      expect(row.skill_injection_enabled).toBe(1);
    });

    it('should map skillInjection.enabled=false to skill_injection_enabled=0', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          skillInjection: {
            enabled: false,
            skills: [],
          },
        },
      });
      const row = toDatabase(settings);
      expect(row.skill_injection_enabled).toBe(0);
    });

    it('should map undefined skillInjection to skill_injection_enabled=0', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.skill_injection_enabled).toBe(0);
    });

    it('should serialize skills array to JSON string', () => {
      const skills = [
        {
          name: 'arch-reviewer',
          type: SkillSourceType.Local,
          source: '.claude/skills/arch-reviewer',
        },
        {
          name: 'frontend-design',
          type: SkillSourceType.Remote,
          source: '@anthropic/skills',
          remoteSkillName: 'frontend-design',
        },
      ];
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          skillInjection: { enabled: true, skills },
        },
      });
      const row = toDatabase(settings);
      expect(row.skill_injection_skills).toBe(JSON.stringify(skills));
    });

    it('should map empty skills array to null', () => {
      const settings = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          skillInjection: { enabled: false, skills: [] },
        },
      });
      const row = toDatabase(settings);
      expect(row.skill_injection_skills).toBeNull();
    });

    it('should map undefined skillInjection to null skills', () => {
      const settings = createTestSettings();
      const row = toDatabase(settings);
      expect(row.skill_injection_skills).toBeNull();
    });
  });

  describe('fromDatabase() - skill injection', () => {
    it('should reconstruct skillInjection from enabled=1 and valid JSON', () => {
      const skills = [{ name: 'test-skill', type: 'local', source: '.claude/skills/test-skill' }];
      const row = createTestRow({
        skill_injection_enabled: 1,
        skill_injection_skills: JSON.stringify(skills),
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.skillInjection).toEqual({
        enabled: true,
        skills,
      });
    });

    it('should reconstruct skillInjection with enabled=false when flag is 0 but skills exist', () => {
      const skills = [{ name: 'test-skill', type: 'local', source: '.claude/skills/test-skill' }];
      const row = createTestRow({
        skill_injection_enabled: 0,
        skill_injection_skills: JSON.stringify(skills),
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.skillInjection).toEqual({
        enabled: false,
        skills,
      });
    });

    it('should omit skillInjection when both columns are default/null', () => {
      const row = createTestRow({
        skill_injection_enabled: 0,
        skill_injection_skills: null,
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.skillInjection).toBeUndefined();
    });

    it('should fall back to default skills when enabled=1 but skills is null', () => {
      const row = createTestRow({
        skill_injection_enabled: 1,
        skill_injection_skills: null,
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.skillInjection?.enabled).toBe(true);
      expect(settings.workflow.skillInjection?.skills.length).toBeGreaterThan(0);
      expect(settings.workflow.skillInjection?.skills.map((s) => s.name)).toContain(
        'frontend-design'
      );
    });

    it('should deserialize remote skills with remoteSkillName', () => {
      const skills = [
        {
          name: 'frontend-design',
          type: 'remote',
          source: '@anthropic/skills',
          remoteSkillName: 'frontend-design',
        },
      ];
      const row = createTestRow({
        skill_injection_enabled: 1,
        skill_injection_skills: JSON.stringify(skills),
      });
      const settings = fromDatabase(row);
      expect(settings.workflow.skillInjection!.skills[0].remoteSkillName).toBe('frontend-design');
    });
  });

  describe('round-trip - skill injection', () => {
    it('should preserve skillInjection with local and remote skills through round-trip', () => {
      const skillInjection = {
        enabled: true,
        skills: [
          {
            name: 'arch-reviewer',
            type: SkillSourceType.Local,
            source: '.claude/skills/arch-reviewer',
          },
          {
            name: 'frontend-design',
            type: SkillSourceType.Remote,
            source: '@anthropic/skills',
            remoteSkillName: 'frontend-design',
          },
        ],
      };
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          skillInjection,
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.skillInjection).toEqual(skillInjection);
    });

    it('should preserve disabled skillInjection with skills through round-trip', () => {
      const skillInjection = {
        enabled: false,
        skills: [
          { name: 'test-skill', type: SkillSourceType.Local, source: '.claude/skills/test-skill' },
        ],
      };
      const original = createTestSettings({
        workflow: {
          ...createTestSettings().workflow,
          skillInjection,
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.skillInjection).toEqual(skillInjection);
    });

    it('should preserve undefined skillInjection through round-trip', () => {
      const original = createTestSettings();
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.workflow.skillInjection).toBeUndefined();
    });
  });

  describe('toDatabase() - security config', () => {
    it('should map security.mode to security_mode column', () => {
      const settings = createTestSettings({
        security: { mode: SecurityMode.Enforce },
      } as any);
      const row = toDatabase(settings);
      expect(row.security_mode).toBe('Enforce');
    });

    it('should map security.lastEvaluationAt to security_last_evaluation_at column', () => {
      const settings = createTestSettings({
        security: {
          mode: SecurityMode.Advisory,
          lastEvaluationAt: '2026-04-05T10:00:00Z',
        },
      } as any);
      const row = toDatabase(settings);
      expect(row.security_last_evaluation_at).toBe('2026-04-05T10:00:00Z');
    });

    it('should map security.policySource to security_policy_source column', () => {
      const settings = createTestSettings({
        security: {
          mode: SecurityMode.Enforce,
          policySource: 'shep.security.yaml',
        },
      } as any);
      const row = toDatabase(settings);
      expect(row.security_policy_source).toBe('shep.security.yaml');
    });

    it('should default security_mode to Advisory when security is undefined', () => {
      const settings = createTestSettings({ security: undefined } as any);
      const row = toDatabase(settings);
      expect(row.security_mode).toBe('Advisory');
    });

    it('should set nullable columns to null when optional fields are missing', () => {
      const settings = createTestSettings({
        security: { mode: SecurityMode.Advisory },
      } as any);
      const row = toDatabase(settings);
      expect(row.security_last_evaluation_at).toBeNull();
      expect(row.security_policy_source).toBeNull();
    });
  });

  describe('fromDatabase() - security config', () => {
    it('should reconstruct security.mode from security_mode column', () => {
      const row = createTestRow({ security_mode: 'Enforce' });
      const settings = fromDatabase(row);
      expect(settings.security?.mode).toBe(SecurityMode.Enforce);
    });

    it('should reconstruct security.lastEvaluationAt from non-null column', () => {
      const row = createTestRow({
        security_mode: 'Advisory',
        security_last_evaluation_at: '2026-04-05T10:00:00Z',
      });
      const settings = fromDatabase(row);
      expect(settings.security?.lastEvaluationAt).toBe('2026-04-05T10:00:00Z');
    });

    it('should reconstruct security.policySource from non-null column', () => {
      const row = createTestRow({
        security_mode: 'Enforce',
        security_policy_source: 'shep.security.yaml',
      });
      const settings = fromDatabase(row);
      expect(settings.security?.policySource).toBe('shep.security.yaml');
    });

    it('should omit lastEvaluationAt when column is null', () => {
      const row = createTestRow({
        security_mode: 'Advisory',
        security_last_evaluation_at: null,
      });
      const settings = fromDatabase(row);
      expect(settings.security?.lastEvaluationAt).toBeUndefined();
    });

    it('should omit policySource when column is null', () => {
      const row = createTestRow({
        security_mode: 'Advisory',
        security_policy_source: null,
      });
      const settings = fromDatabase(row);
      expect(settings.security?.policySource).toBeUndefined();
    });

    it('should default mode to Advisory when security_mode is null', () => {
      const row = createTestRow({ security_mode: undefined as any });
      const settings = fromDatabase(row);
      expect(settings.security?.mode).toBe(SecurityMode.Advisory);
    });
  });

  describe('round-trip - security config', () => {
    it('should preserve full security config through toDatabase → fromDatabase', () => {
      const original = createTestSettings({
        security: {
          mode: SecurityMode.Enforce,
          lastEvaluationAt: '2026-04-05T12:00:00Z',
          policySource: 'shep.security.yaml',
        },
      } as any);
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.security?.mode).toBe(SecurityMode.Enforce);
      expect(restored.security?.lastEvaluationAt).toBe('2026-04-05T12:00:00Z');
      expect(restored.security?.policySource).toBe('shep.security.yaml');
    });

    it('should preserve minimal security config (mode only) through round-trip', () => {
      const original = createTestSettings({
        security: { mode: SecurityMode.Disabled },
      } as any);
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.security?.mode).toBe(SecurityMode.Disabled);
      expect(restored.security?.lastEvaluationAt).toBeUndefined();
      expect(restored.security?.policySource).toBeUndefined();
    });
  });

  describe('supplyChainSecurity feature flag (migration 056)', () => {
    it('maps featureFlags.supplyChainSecurity=true to feature_flag_supply_chain_security=1', () => {
      const settings = createTestSettings({
        featureFlags: {
          envDeploy: false,
          debug: false,
          reactFileManager: false,
          projects: false,
          codeReview: false,
          collaboration: false,
          bedrockIntegration: false,
          whatsappDispatch: false,
          aspm: false,
          clusters: false,
          supplyChainSecurity: true,
          scheduledWorkflows: false,
          githubImport: true,
        },
      });
      const row = toDatabase(settings);
      expect(row.feature_flag_supply_chain_security).toBe(1);
    });

    it('maps featureFlags.supplyChainSecurity=false to feature_flag_supply_chain_security=0', () => {
      const settings = createTestSettings({
        featureFlags: {
          envDeploy: false,
          debug: false,
          reactFileManager: false,
          projects: false,
          codeReview: false,
          collaboration: false,
          bedrockIntegration: false,
          whatsappDispatch: false,
          aspm: false,
          clusters: false,
          supplyChainSecurity: false,
          scheduledWorkflows: false,
          githubImport: true,
        },
      });
      const row = toDatabase(settings);
      expect(row.feature_flag_supply_chain_security).toBe(0);
    });

    it('reconstructs supplyChainSecurity=true from feature_flag_supply_chain_security=1', () => {
      const row = createTestRow({ feature_flag_supply_chain_security: 1 });
      const settings = fromDatabase(row);
      expect(settings.featureFlags?.supplyChainSecurity).toBe(true);
    });

    it('reconstructs supplyChainSecurity=false from feature_flag_supply_chain_security=0', () => {
      const row = createTestRow({ feature_flag_supply_chain_security: 0 });
      const settings = fromDatabase(row);
      expect(settings.featureFlags?.supplyChainSecurity).toBe(false);
    });

    it('round-trips supplyChainSecurity through toDatabase → fromDatabase', () => {
      const settings = createTestSettings({
        featureFlags: {
          envDeploy: true,
          debug: true,
          reactFileManager: true,
          projects: true,
          codeReview: true,
          collaboration: true,
          bedrockIntegration: true,
          whatsappDispatch: true,
          aspm: true,
          clusters: true,
          supplyChainSecurity: false,
          scheduledWorkflows: false,
          githubImport: true,
        },
      });
      const row = toDatabase(settings);
      const restored = fromDatabase(row);
      expect(restored.featureFlags).toEqual(settings.featureFlags);
    });
  });

  // Messaging remote control persistence (migration 056).
  // Backward-compat requirement: a row written by an older build (all
  // messaging_* columns at their default 0/null) must still decode to a
  // valid MessagingConfig that consumer code can .?chain against.
  describe('messaging remote control persistence', () => {
    it('should default to disabled messaging config when row columns are unset', () => {
      const row = createTestRow(); // defaults: all messaging_* at 0/null
      const restored = fromDatabase(row);
      expect(restored.messaging).toBeDefined();
      expect(restored.messaging?.enabled).toBe(false);
      expect(restored.messaging?.debounceMs).toBe(5000);
      expect(restored.messaging?.chatBufferMs).toBe(3000);
      expect(restored.messaging?.telegram).toBeUndefined();
      expect(restored.messaging?.whatsapp).toBeUndefined();
    });

    it('should round-trip a fully configured Telegram pairing', () => {
      const original = createTestSettings({
        messaging: {
          enabled: true,
          gatewayUrl: 'http://localhost:8080',
          deviceId: 'shep-dev-1',
          gatewayClientId: 'commands-desktop-public',
          debounceMs: 4000,
          chatBufferMs: 2500,
          telegram: {
            enabled: true,
            paired: true,
            chatId: '123456',
            routeId: 'rt_abc',
            routeToken: 'tok_xyz',
            publicUrl: 'http://localhost:8080/integrations/rt_abc/tok_xyz',
            botToken: 'bot:secret',
          },
        },
      });
      const row = toDatabase(original);
      expect(row.messaging_enabled).toBe(1);
      expect(row.messaging_gateway_url).toBe('http://localhost:8080');
      expect(row.messaging_telegram_paired).toBe(1);
      expect(row.messaging_telegram_route_id).toBe('rt_abc');

      const restored = fromDatabase(row);
      expect(restored.messaging?.enabled).toBe(true);
      expect(restored.messaging?.gatewayUrl).toBe('http://localhost:8080');
      expect(restored.messaging?.deviceId).toBe('shep-dev-1');
      expect(restored.messaging?.telegram?.paired).toBe(true);
      expect(restored.messaging?.telegram?.chatId).toBe('123456');
      expect(restored.messaging?.telegram?.routeId).toBe('rt_abc');
      expect(restored.messaging?.telegram?.publicUrl).toBe(
        'http://localhost:8080/integrations/rt_abc/tok_xyz'
      );
      expect(restored.messaging?.telegram?.botToken).toBe('bot:secret');
      expect(restored.messaging?.whatsapp).toBeUndefined();
    });

    it('should preserve a pending pairing (no chatId, no paired) through round-trip', () => {
      const original = createTestSettings({
        messaging: {
          enabled: true,
          gatewayUrl: 'http://localhost:8080',
          deviceId: 'shep-dev-1',
          debounceMs: 5000,
          chatBufferMs: 3000,
          telegram: {
            enabled: true,
            paired: false,
            pendingPairingCode: '482913',
            pendingPairingExpiresAt: '2026-04-09T13:00:00.000Z',
            routeId: 'rt_abc',
            routeToken: 'tok_xyz',
            publicUrl: 'http://localhost:8080/integrations/rt_abc/tok_xyz',
          },
        },
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.messaging?.telegram?.paired).toBe(false);
      expect(restored.messaging?.telegram?.pendingPairingCode).toBe('482913');
      expect(restored.messaging?.telegram?.pendingPairingExpiresAt).toBe(
        '2026-04-09T13:00:00.000Z'
      );
      expect(restored.messaging?.telegram?.chatId).toBeUndefined();
    });

    it('should serialize a Date pendingPairingExpiresAt to ISO string', () => {
      const expires = new Date('2026-04-09T13:00:00.000Z');
      const row = toDatabase(
        createTestSettings({
          messaging: {
            enabled: true,
            gatewayUrl: 'http://localhost:8080',
            deviceId: 'shep-dev-1',
            debounceMs: 5000,
            chatBufferMs: 3000,
            telegram: {
              enabled: true,
              paired: false,
              pendingPairingCode: '111111',
              pendingPairingExpiresAt: expires,
              routeId: 'rt_abc',
            },
          },
        })
      );
      expect(row.messaging_telegram_pending_expires_at).toBe('2026-04-09T13:00:00.000Z');
    });
  });
});
