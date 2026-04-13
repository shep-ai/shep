/**
 * Onboarding Flow Integration Tests
 *
 * Validates the full first-run onboarding lifecycle:
 *   1. Fresh database → onboarding shows as incomplete
 *   2. Complete onboarding → persisted to SQLite
 *   3. Subsequent check → onboarding shows as complete (wizard should NOT appear again)
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
import { CheckOnboardingStatusUseCase } from '@/application/use-cases/settings/check-onboarding-status.use-case.js';
import {
  CompleteOnboardingUseCase,
  type CompleteOnboardingInput,
} from '@/application/use-cases/settings/complete-onboarding.use-case.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';

describe('Onboarding flow (integration)', () => {
  let db: Database.Database;
  let repository: SQLiteSettingsRepository;

  const wizardInput: CompleteOnboardingInput = {
    agent: {
      type: AgentType.ClaudeCode,
      authMethod: AgentAuthMethod.Session,
    },
    ide: 'vscode',
    workflowDefaults: {
      allowPrd: true,
      allowPlan: true,
      allowMerge: false,
      pushOnImplementationComplete: true,
      openPrOnImplementationComplete: true,
    },
  };

  beforeEach(async () => {
    resetSettings();
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SQLiteSettingsRepository(db);
  });

  afterEach(() => {
    resetSettings();
    db.close();
  });

  it('should report onboarding incomplete on a fresh database', async () => {
    // Initialize settings (simulates first CLI bootstrap on fresh SHEP_HOME)
    const initUseCase = new InitializeSettingsUseCase(repository);
    const settings = await initUseCase.execute();
    initializeSettings(settings);

    // Fresh settings → onboarding should be incomplete
    const checkUseCase = new CheckOnboardingStatusUseCase(repository);
    const { isComplete } = await checkUseCase.execute();

    expect(isComplete).toBe(false);
  });

  it('should report onboarding complete after wizard finishes', async () => {
    // Bootstrap: initialize + load settings into singleton
    const initUseCase = new InitializeSettingsUseCase(repository);
    const settings = await initUseCase.execute();
    initializeSettings(settings);

    // Simulate wizard completion
    const completeUseCase = new CompleteOnboardingUseCase(repository);
    const updated = await completeUseCase.execute(wizardInput);

    // Refresh the in-memory singleton (same as the real wizard does)
    resetSettings();
    initializeSettings(updated);

    // Now onboarding should be complete
    const checkUseCase = new CheckOnboardingStatusUseCase(repository);
    const { isComplete } = await checkUseCase.execute();

    expect(isComplete).toBe(true);
  });

  it('should persist onboarding_complete=true so subsequent runs skip the wizard', async () => {
    // === First run: initialize + complete onboarding ===
    const initUseCase = new InitializeSettingsUseCase(repository);
    const settings = await initUseCase.execute();
    initializeSettings(settings);

    const completeUseCase = new CompleteOnboardingUseCase(repository);
    await completeUseCase.execute(wizardInput);

    // === Simulate second CLI run: clear singleton, reload from DB ===
    resetSettings();

    const reloaded = await repository.load();
    expect(reloaded).not.toBeNull();
    initializeSettings(reloaded!);

    // Second run should see onboarding as complete (wizard must NOT appear)
    const checkUseCase = new CheckOnboardingStatusUseCase(repository);
    const { isComplete } = await checkUseCase.execute();

    expect(isComplete).toBe(true);
  });

  it('should persist all wizard choices to the database', async () => {
    const initUseCase = new InitializeSettingsUseCase(repository);
    const settings = await initUseCase.execute();
    initializeSettings(settings);

    const completeUseCase = new CompleteOnboardingUseCase(repository);
    await completeUseCase.execute(wizardInput);

    // Reload from DB and verify wizard choices survived the round-trip
    const persisted = await repository.load();
    expect(persisted).not.toBeNull();

    expect(persisted!.onboardingComplete).toBe(true);
    expect(persisted!.agent.type).toBe(AgentType.ClaudeCode);
    expect(persisted!.agent.authMethod).toBe(AgentAuthMethod.Session);
    expect(persisted!.environment.defaultEditor).toBe('vscode');
    expect(persisted!.workflow.approvalGateDefaults.allowPrd).toBe(true);
    expect(persisted!.workflow.approvalGateDefaults.allowPlan).toBe(true);
    expect(persisted!.workflow.approvalGateDefaults.allowMerge).toBe(false);
    expect(persisted!.workflow.approvalGateDefaults.pushOnImplementationComplete).toBe(true);
    expect(persisted!.workflow.openPrOnImplementationComplete).toBe(true);
  });
});
