/**
 * Workflow Command Integration Tests
 *
 * Validates that `shep settings workflow` (non-interactive mode)
 * correctly updates workflow defaults in the database, and that
 * those updated defaults flow through to the feature command.
 *
 * Uses a real in-memory SQLite database with migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSettingsRepository } from '@/infrastructure/repositories/sqlite-settings.repository.js';
import { InitializeSettingsUseCase } from '@/application/use-cases/settings/initialize-settings.use-case.js';
import {
  CompleteOnboardingUseCase,
  type CompleteOnboardingInput,
} from '@/application/use-cases/settings/complete-onboarding.use-case.js';
import { UpdateSettingsUseCase } from '@/application/use-cases/settings/update-settings.use-case.js';
import {
  getSettings,
  hasSettings,
  initializeSettings,
  resetSettings,
} from '@/infrastructure/services/settings.service.js';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';
import type { WorkflowDefaultsResult } from '../../../../../src/presentation/tui/wizards/onboarding/types.js';

/**
 * Mirrors the non-interactive flag resolution from workflow.command.ts
 */
function applyWorkflowFlags(flags: {
  allowPrd?: true;
  allowPlan?: true;
  allowMerge?: true;
  allowAll?: true;
  push?: boolean;
  pr?: boolean;
}): WorkflowDefaultsResult {
  const settings = getSettings();
  const current = settings.workflow;
  const gates = current.approvalGateDefaults;

  if (flags.allowAll) {
    return {
      allowPrd: true,
      allowPlan: true,
      allowMerge: true,
      pushOnImplementationComplete: flags.push ?? gates.pushOnImplementationComplete,
      openPrOnImplementationComplete: flags.pr ?? current.openPrOnImplementationComplete,
    };
  }

  return {
    allowPrd: flags.allowPrd ?? gates.allowPrd,
    allowPlan: flags.allowPlan ?? gates.allowPlan,
    allowMerge: flags.allowMerge ?? gates.allowMerge,
    pushOnImplementationComplete: flags.push ?? gates.pushOnImplementationComplete,
    openPrOnImplementationComplete: flags.pr ?? current.openPrOnImplementationComplete,
  };
}

/**
 * Applies workflow defaults to settings and persists (mirrors workflow.command.ts action).
 */
async function persistWorkflowDefaults(
  repository: SQLiteSettingsRepository,
  workflowDefaults: WorkflowDefaultsResult
) {
  const settings = getSettings();

  settings.workflow.approvalGateDefaults = {
    allowPrd: workflowDefaults.allowPrd,
    allowPlan: workflowDefaults.allowPlan,
    allowMerge: workflowDefaults.allowMerge,
    pushOnImplementationComplete: workflowDefaults.pushOnImplementationComplete,
  };
  settings.workflow.openPrOnImplementationComplete =
    workflowDefaults.openPrOnImplementationComplete;

  const useCase = new UpdateSettingsUseCase(repository, {
    execute: async () => ({ admittedFeatureIds: [] }),
  } as never);
  const updated = await useCase.execute(settings);

  resetSettings();
  initializeSettings(updated);
}

/**
 * Mirrors getWorkflowDefaults() from new.command.ts — reads settings for feature defaults.
 */
function getFeatureDefaults() {
  if (!hasSettings()) {
    return { openPr: false, allowPrd: false, allowPlan: false, allowMerge: false, push: false };
  }
  const settings = getSettings();
  const gates = settings.workflow.approvalGateDefaults;
  return {
    openPr: settings.workflow.openPrOnImplementationComplete,
    allowPrd: gates.allowPrd,
    allowPlan: gates.allowPlan,
    allowMerge: gates.allowMerge,
    push: gates.pushOnImplementationComplete,
  };
}

describe('Workflow command → feature defaults flow (integration)', () => {
  let db: Database.Database;
  let repository: SQLiteSettingsRepository;

  const baseOnboarding: CompleteOnboardingInput = {
    agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
    ide: 'vscode',
    workflowDefaults: {
      allowPrd: false,
      allowPlan: false,
      allowMerge: false,
      pushOnImplementationComplete: false,
      openPrOnImplementationComplete: false,
    },
  };

  beforeEach(async () => {
    resetSettings();
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SQLiteSettingsRepository(db);

    // Complete onboarding first (prerequisite for workflow command)
    const initUseCase = new InitializeSettingsUseCase(repository);
    const settings = await initUseCase.execute();
    initializeSettings(settings);

    const completeUseCase = new CompleteOnboardingUseCase(repository);
    const updated = await completeUseCase.execute(baseOnboarding);
    resetSettings();
    initializeSettings(updated);
  });

  afterEach(() => {
    resetSettings();
    db.close();
  });

  describe('non-interactive flag application', () => {
    it('should enable individual approval gates with flags', async () => {
      const workflowDefaults = applyWorkflowFlags({ allowPrd: true });
      await persistWorkflowDefaults(repository, workflowDefaults);

      const defaults = getFeatureDefaults();
      expect(defaults.allowPrd).toBe(true);
      expect(defaults.allowPlan).toBe(false);
      expect(defaults.allowMerge).toBe(false);
    });

    it('should enable all gates with --allow-all', async () => {
      const workflowDefaults = applyWorkflowFlags({ allowAll: true });
      await persistWorkflowDefaults(repository, workflowDefaults);

      const defaults = getFeatureDefaults();
      expect(defaults.allowPrd).toBe(true);
      expect(defaults.allowPlan).toBe(true);
      expect(defaults.allowMerge).toBe(true);
    });

    it('should enable push with --push flag', async () => {
      const workflowDefaults = applyWorkflowFlags({ push: true });
      await persistWorkflowDefaults(repository, workflowDefaults);

      const defaults = getFeatureDefaults();
      expect(defaults.push).toBe(true);
    });

    it('should enable PR with --pr flag', async () => {
      const workflowDefaults = applyWorkflowFlags({ pr: true });
      await persistWorkflowDefaults(repository, workflowDefaults);

      const defaults = getFeatureDefaults();
      expect(defaults.openPr).toBe(true);
    });

    it('should compose multiple flags together', async () => {
      const workflowDefaults = applyWorkflowFlags({
        allowPrd: true,
        allowPlan: true,
        push: true,
        pr: true,
      });
      await persistWorkflowDefaults(repository, workflowDefaults);

      const defaults = getFeatureDefaults();
      expect(defaults.allowPrd).toBe(true);
      expect(defaults.allowPlan).toBe(true);
      expect(defaults.allowMerge).toBe(false);
      expect(defaults.push).toBe(true);
      expect(defaults.openPr).toBe(true);
    });
  });

  describe('flags preserve unset values from current settings', () => {
    it('should preserve existing push=true when only setting approval gates', async () => {
      // First: enable push via workflow command
      const step1 = applyWorkflowFlags({ push: true });
      await persistWorkflowDefaults(repository, step1);

      // Second: set allowPrd only — push should remain true
      const step2 = applyWorkflowFlags({ allowPrd: true });
      await persistWorkflowDefaults(repository, step2);

      const defaults = getFeatureDefaults();
      expect(defaults.allowPrd).toBe(true);
      expect(defaults.push).toBe(true); // preserved from step 1
    });

    it('should preserve existing PR=true when setting --allow-all', async () => {
      // First: enable PR
      const step1 = applyWorkflowFlags({ pr: true });
      await persistWorkflowDefaults(repository, step1);

      // Second: --allow-all should keep PR=true
      const step2 = applyWorkflowFlags({ allowAll: true });
      await persistWorkflowDefaults(repository, step2);

      const defaults = getFeatureDefaults();
      expect(defaults.allowPrd).toBe(true);
      expect(defaults.allowPlan).toBe(true);
      expect(defaults.allowMerge).toBe(true);
      expect(defaults.openPr).toBe(true); // preserved from step 1
    });
  });

  describe('--no-push and --no-pr negation', () => {
    it('should disable push with --no-push (push=false)', async () => {
      // Enable push first
      const step1 = applyWorkflowFlags({ push: true });
      await persistWorkflowDefaults(repository, step1);
      expect(getFeatureDefaults().push).toBe(true);

      // Disable with --no-push
      const step2 = applyWorkflowFlags({ push: false });
      await persistWorkflowDefaults(repository, step2);

      expect(getFeatureDefaults().push).toBe(false);
    });

    it('should disable PR with --no-pr (pr=false)', async () => {
      // Enable PR first
      const step1 = applyWorkflowFlags({ pr: true });
      await persistWorkflowDefaults(repository, step1);
      expect(getFeatureDefaults().openPr).toBe(true);

      // Disable with --no-pr
      const step2 = applyWorkflowFlags({ pr: false });
      await persistWorkflowDefaults(repository, step2);

      expect(getFeatureDefaults().openPr).toBe(false);
    });
  });

  describe('database round-trip after workflow command', () => {
    it('should persist workflow changes across settings reload', async () => {
      const workflowDefaults = applyWorkflowFlags({
        allowPrd: true,
        allowMerge: true,
        push: true,
        pr: true,
      });
      await persistWorkflowDefaults(repository, workflowDefaults);

      // Simulate next CLI run: clear singleton, reload from DB
      resetSettings();
      const reloaded = await repository.load();
      expect(reloaded).not.toBeNull();
      initializeSettings(reloaded!);

      const defaults = getFeatureDefaults();
      expect(defaults.allowPrd).toBe(true);
      expect(defaults.allowPlan).toBe(false);
      expect(defaults.allowMerge).toBe(true);
      expect(defaults.push).toBe(true);
      expect(defaults.openPr).toBe(true);
    });
  });

  describe('workflow command does not affect non-workflow settings', () => {
    it('should preserve agent and IDE settings after workflow update', async () => {
      const workflowDefaults = applyWorkflowFlags({ allowAll: true, push: true, pr: true });
      await persistWorkflowDefaults(repository, workflowDefaults);

      const settings = getSettings();
      expect(settings.agent.type).toBe(AgentType.ClaudeCode);
      expect(settings.agent.authMethod).toBe(AgentAuthMethod.Session);
      expect(settings.environment.defaultEditor).toBe('vscode');
      expect(settings.onboardingComplete).toBe(true);
    });
  });
});
