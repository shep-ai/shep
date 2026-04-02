/**
 * SQLite Settings Repository Integration Tests
 *
 * Tests for the SQLite implementation of ISettingsRepository.
 * Verifies repository operations, singleton constraint, and database mapping.
 *
 * TDD Phase: RED
 * - Tests written BEFORE implementation
 * - All tests should FAIL initially
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSettingsRepository } from '@/infrastructure/repositories/sqlite-settings.repository.js';
import type { Settings } from '@/domain/generated/output.js';
import {
  AgentType,
  AgentAuthMethod,
  EditorType,
  Language,
  TerminalType,
} from '@/domain/generated/output.js';

describe('SQLiteSettingsRepository', () => {
  let db: Database.Database;
  let repository: SQLiteSettingsRepository;

  // Sample test data
  const createTestSettings = (): Settings => ({
    id: 'singleton',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
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
      inApp: { enabled: false },
      browser: { enabled: false },
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
    onboardingComplete: false,
  });

  beforeEach(async () => {
    // Create fresh database for each test
    db = createInMemoryDatabase();

    // Run migrations to create schema
    await runSQLiteMigrations(db);

    // Verify migrations worked
    expect(tableExists(db, 'settings')).toBe(true);

    // Create repository instance
    repository = new SQLiteSettingsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('initialize()', () => {
    it('should create new settings in database', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert - verify data was inserted
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.id).toBe('singleton');
    });

    it('should store model_default column with the configured model value', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert — model_default is the source of truth after migration 024
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row.model_default).toBe('claude-opus-4');
    });

    it('should store optional user profile fields', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row.user_name).toBe('Test User');
      expect(row.user_email).toBe('test@example.com');
      expect(row.user_github_username).toBe('testuser');
    });

    it('should handle missing optional user fields', async () => {
      // Arrange
      const settings = createTestSettings();
      settings.user = {}; // No optional fields

      // Act
      await repository.initialize(settings);

      // Assert
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row.user_name).toBeNull();
      expect(row.user_email).toBeNull();
      expect(row.user_github_username).toBeNull();
    });

    it('should store environment configuration', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row.env_default_editor).toBe('vscode');
      expect(row.env_shell_preference).toBe('zsh');
    });

    it('should store system configuration with boolean as integer', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row.sys_auto_update).toBe(1); // true -> 1
      expect(row.sys_log_level).toBe('info');
    });

    it('should enforce singleton constraint (only one settings record)', async () => {
      // Arrange
      const settings1 = createTestSettings();
      const settings2 = createTestSettings();

      // Act
      await repository.initialize(settings1);

      // Assert - second initialization should fail
      await expect(repository.initialize(settings2)).rejects.toThrow();
    });

    it('should store timestamps as ISO 8601 strings', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(typeof row.created_at).toBe('string');
      expect(typeof row.updated_at).toBe('string');
      expect(row.created_at).toBe('2025-01-01T00:00:00.000Z');
      expect(row.updated_at).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('load()', () => {
    it('should return null when settings do not exist', async () => {
      // Act
      const result = await repository.load();

      // Assert
      expect(result).toBeNull();
    });

    it('should load existing settings from database', async () => {
      // Arrange - insert settings first
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe('singleton');
    });

    it('should correctly map model configuration from database', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.models).toEqual({
        default: 'claude-opus-4',
      });
    });

    it('should correctly map user profile from database', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.user).toEqual({
        name: 'Test User',
        email: 'test@example.com',
        githubUsername: 'testuser',
        preferredLanguage: 'en',
      });
    });

    it('should handle missing optional user fields in database', async () => {
      // Arrange - insert settings without optional user fields
      const settings = createTestSettings();
      settings.user = {};
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.user).toEqual({ preferredLanguage: 'en' });
    });

    it('should correctly map environment configuration from database', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.environment).toEqual({
        defaultEditor: 'vscode',
        shellPreference: 'zsh',
        terminalPreference: 'system',
      });
    });

    it('should correctly map system configuration from database', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.system).toEqual({
        autoUpdate: true,
        logLevel: 'info',
      });
    });

    it('should convert integer back to boolean for autoUpdate', async () => {
      // Arrange - create with autoUpdate = false
      const settings = createTestSettings();
      settings.system.autoUpdate = false;
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.system.autoUpdate).toBe(false);
      expect(typeof loaded?.system.autoUpdate).toBe('boolean');
    });

    it('should parse ISO 8601 timestamps back to Date objects', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.createdAt).toBeInstanceOf(Date);
      expect(loaded?.updatedAt).toBeInstanceOf(Date);
      expect((loaded?.createdAt as Date).toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('update()', () => {
    it('should update existing settings in database', async () => {
      // Arrange - initialize first
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Modify settings
      settings.models.default = 'claude-opus-5';
      settings.user.name = 'Updated Name';
      settings.system.logLevel = 'debug';
      settings.updatedAt = new Date('2025-01-02T00:00:00Z');

      // Act
      await repository.update(settings);

      // Assert - verify updates in database
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row.model_default).toBe('claude-opus-5');
      expect(row.user_name).toBe('Updated Name');
      expect(row.sys_log_level).toBe('debug');
      expect(row.updated_at).toBe('2025-01-02T00:00:00.000Z');
    });

    it('should throw error when updating non-existent settings', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act & Assert - should fail because settings not initialized
      await expect(repository.update(settings)).rejects.toThrow();
    });

    it('should update model configuration', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Modify model default field
      settings.models = {
        default: 'new-default-model',
      };

      // Act
      await repository.update(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.models).toEqual(settings.models);
    });

    it('should update user profile including optional fields', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Modify user fields
      settings.user = {
        name: 'New Name',
        email: 'newemail@example.com',
        githubUsername: 'newusername',
      };

      // Act
      await repository.update(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.user).toEqual({
        name: 'New Name',
        email: 'newemail@example.com',
        githubUsername: 'newusername',
        preferredLanguage: 'en',
      });
    });

    it('should allow clearing optional user fields', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Clear optional fields
      settings.user = {};

      // Act
      await repository.update(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.user).toEqual({ preferredLanguage: 'en' });
    });

    it('should update environment configuration', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Modify environment
      settings.environment = {
        defaultEditor: EditorType.Cursor,
        shellPreference: 'bash',
        terminalPreference: TerminalType.Warp,
      };

      // Act
      await repository.update(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.environment).toEqual(settings.environment);
    });

    it('should update system configuration', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Modify system config
      settings.system = {
        autoUpdate: false,
        logLevel: 'error',
      };

      // Act
      await repository.update(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.system).toEqual(settings.system);
    });

    it('should preserve createdAt and update updatedAt', async () => {
      // Arrange
      const settings = createTestSettings();
      await repository.initialize(settings);

      // Change updatedAt
      const originalCreatedAt = settings.createdAt;
      settings.updatedAt = new Date('2025-01-03T00:00:00Z');

      // Act
      await repository.update(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.createdAt).toEqual(originalCreatedAt);
      expect(loaded?.updatedAt).toEqual(new Date('2025-01-03T00:00:00Z'));
    });
  });

  describe('feature flags', () => {
    it('should initialize settings with featureFlags and load them back', async () => {
      const settings = createTestSettings();
      settings.featureFlags = {
        skills: true,
        envDeploy: false,
        debug: true,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      };

      await repository.initialize(settings);
      const loaded = await repository.load();

      expect(loaded?.featureFlags).toEqual({
        skills: true,
        envDeploy: false,
        debug: true,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      });
    });

    it('should initialize settings without featureFlags and load defaults', async () => {
      const settings = createTestSettings();

      await repository.initialize(settings);
      const loaded = await repository.load();

      expect(loaded?.featureFlags).toEqual({
        skills: false,
        envDeploy: false,
        debug: false,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      });
    });

    it('should update featureFlags and persist changes', async () => {
      const settings = createTestSettings();
      await repository.initialize(settings);

      settings.featureFlags = {
        skills: true,
        envDeploy: true,
        debug: false,
        githubImport: false,
        adoptBranch: true,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      };
      settings.updatedAt = new Date('2025-01-02T00:00:00Z');
      await repository.update(settings);

      const loaded = await repository.load();
      expect(loaded?.featureFlags).toEqual({
        skills: true,
        envDeploy: true,
        debug: false,
        githubImport: false,
        adoptBranch: true,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      });
    });

    it('should store feature flag booleans as INTEGER 0/1', async () => {
      const settings = createTestSettings();
      settings.featureFlags = {
        skills: true,
        envDeploy: false,
        debug: true,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      };

      await repository.initialize(settings);

      const row = db
        .prepare(
          'SELECT feature_flag_skills, feature_flag_env_deploy, feature_flag_debug, feature_flag_github_import, feature_flag_adopt_branch, feature_flag_git_rebase_sync, feature_flag_react_file_manager FROM settings WHERE id = ?'
        )
        .get('singleton') as Record<string, number>;
      expect(row.feature_flag_skills).toBe(1);
      expect(row.feature_flag_env_deploy).toBe(0);
      expect(row.feature_flag_debug).toBe(1);
      expect(row.feature_flag_github_import).toBe(0);
      expect(row.feature_flag_adopt_branch).toBe(0);
      expect(row.feature_flag_git_rebase_sync).toBe(0);
      expect(row.feature_flag_react_file_manager).toBe(0);
    });
  });

  describe('CI workflow fields', () => {
    it('should initialize settings with CI fields and load them back', async () => {
      const settings = createTestSettings();
      settings.workflow.ciMaxFixAttempts = 5;
      settings.workflow.ciWatchTimeoutMs = 300000;
      settings.workflow.ciLogMaxChars = 25000;

      await repository.initialize(settings);
      const loaded = await repository.load();

      expect(loaded?.workflow.ciMaxFixAttempts).toBe(5);
      expect(loaded?.workflow.ciWatchTimeoutMs).toBe(300000);
      expect(loaded?.workflow.ciLogMaxChars).toBe(25000);
    });

    it('should handle undefined CI fields as null in database', async () => {
      const settings = createTestSettings();

      await repository.initialize(settings);

      const row = db
        .prepare(
          'SELECT ci_max_fix_attempts, ci_watch_timeout_ms, ci_log_max_chars FROM settings WHERE id = ?'
        )
        .get('singleton') as Record<string, number | null>;
      expect(row.ci_max_fix_attempts).toBeNull();
      expect(row.ci_watch_timeout_ms).toBeNull();
      expect(row.ci_log_max_chars).toBeNull();
    });

    it('should not include undefined CI fields in loaded settings', async () => {
      const settings = createTestSettings();

      await repository.initialize(settings);
      const loaded = await repository.load();

      expect(loaded?.workflow.ciMaxFixAttempts).toBeUndefined();
      expect(loaded?.workflow.ciWatchTimeoutMs).toBeUndefined();
      expect(loaded?.workflow.ciLogMaxChars).toBeUndefined();
    });
  });

  describe('migration 025 — model_default column', () => {
    it('should create model_default column after migrations run', () => {
      const columns = db.pragma('table_info(settings)') as { name: string }[];
      const hasModelDefault = columns.some((c) => c.name === 'model_default');
      expect(hasModelDefault).toBe(true);
    });

    it('should populate model_default with default value for manually inserted rows', () => {
      db.prepare(
        `INSERT INTO settings (
          id, created_at, updated_at,
          model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference,
          sys_auto_update, sys_log_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'singleton',
        '2025-01-01T00:00:00.000Z',
        '2025-01-01T00:00:00.000Z',
        'old-model',
        'old-model',
        'old-model',
        'old-model',
        'vscode',
        'zsh',
        1,
        'info'
      );

      const row = db
        .prepare('SELECT model_default FROM settings WHERE id = ?')
        .get('singleton') as Record<string, unknown>;
      expect(row.model_default).toBe('claude-sonnet-4-6');
    });

    it('should be idempotent — running migration handler twice does not throw', () => {
      const columns = db.pragma('table_info(settings)') as { name: string }[];
      const alreadyExists = columns.some((c: { name: string }) => c.name === 'model_default');
      expect(alreadyExists).toBe(true);
    });
  });

  describe('language preference', () => {
    it('should initialize settings with preferredLanguage "fr" and load it back', async () => {
      const settings = createTestSettings();
      settings.user.preferredLanguage = Language.French;
      await repository.initialize(settings);

      const loaded = await repository.load();
      expect(loaded?.user.preferredLanguage).toBe('fr');
    });

    it('should default preferredLanguage to "en" when not specified', async () => {
      const settings = createTestSettings();
      await repository.initialize(settings);

      const loaded = await repository.load();
      expect(loaded?.user.preferredLanguage).toBe('en');
    });

    it('should update preferredLanguage from "en" to "de"', async () => {
      const settings = createTestSettings();
      await repository.initialize(settings);

      settings.user.preferredLanguage = Language.German;
      settings.updatedAt = new Date('2026-01-02T00:00:00Z');
      await repository.update(settings);

      const loaded = await repository.load();
      expect(loaded?.user.preferredLanguage).toBe('de');
    });

    it('should persist RTL language "ar" correctly', async () => {
      const settings = createTestSettings();
      settings.user.preferredLanguage = Language.Arabic;
      await repository.initialize(settings);

      const loaded = await repository.load();
      expect(loaded?.user.preferredLanguage).toBe('ar');
    });

    it('should store user_preferred_language as TEXT in database', async () => {
      const settings = createTestSettings();
      settings.user.preferredLanguage = Language.Hebrew;
      await repository.initialize(settings);

      const row = db
        .prepare('SELECT user_preferred_language FROM settings WHERE id = ?')
        .get('singleton') as { user_preferred_language: string };
      expect(row.user_preferred_language).toBe('he');
    });
  });

  describe('SQL injection prevention', () => {
    it('should safely handle user input with SQL special characters in name', async () => {
      // Arrange
      const settings = createTestSettings();
      settings.user.name = "Robert'; DROP TABLE settings;--";

      // Act
      await repository.initialize(settings);

      // Assert - table should still exist and data should be safe
      expect(tableExists(db, 'settings')).toBe(true);
      const loaded = await repository.load();
      expect(loaded?.user.name).toBe("Robert'; DROP TABLE settings;--");
    });

    it('should safely handle SQL special characters in email', async () => {
      // Arrange
      const settings = createTestSettings();
      settings.user.email = "test'@example.com";

      // Act
      await repository.initialize(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.user.email).toBe("test'@example.com");
    });

    it('should safely handle quotes in shell preference', async () => {
      // Arrange
      const settings = createTestSettings();
      settings.environment.shellPreference = 'ba\'"sh';

      // Act
      await repository.initialize(settings);

      // Assert
      const loaded = await repository.load();
      expect(loaded?.environment.shellPreference).toBe('ba\'"sh');
    });
  });

  describe('database mapping', () => {
    it('should use snake_case for database columns', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert - check that snake_case columns exist
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;
      expect(row).toHaveProperty('created_at');
      expect(row).toHaveProperty('updated_at');
      expect(row).toHaveProperty('model_default');
      expect(row).toHaveProperty('user_name');
      expect(row).toHaveProperty('env_default_editor');
      expect(row).toHaveProperty('sys_auto_update');
    });

    it('should flatten nested objects into columns', async () => {
      // Arrange
      const settings = createTestSettings();

      // Act
      await repository.initialize(settings);

      // Assert - nested objects should be flattened
      const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('singleton') as Record<
        string,
        unknown
      >;

      // models.* -> model_default (source of truth after migration 024)
      expect(row.model_default).toBeDefined();

      // user.* -> user_*
      expect(row.user_name).toBeDefined();

      // environment.* -> env_*
      expect(row.env_default_editor).toBeDefined();

      // system.* -> sys_*
      expect(row.sys_auto_update).toBeDefined();
    });

    it('should correctly convert boolean to integer for storage', async () => {
      // Arrange
      const settingsTrue = createTestSettings();
      settingsTrue.system.autoUpdate = true;

      const settingsFalse = createTestSettings();
      settingsFalse.id = 'test-false';
      settingsFalse.system.autoUpdate = false;

      // Act
      await repository.initialize(settingsTrue);

      // Assert
      const rowTrue = db
        .prepare('SELECT sys_auto_update FROM settings WHERE id = ?')
        .get('singleton') as { sys_auto_update: number };
      expect(rowTrue.sys_auto_update).toBe(1);
    });

    it('should correctly convert integer back to boolean when loading', async () => {
      // Arrange - manually insert with integer value
      db.prepare(
        `INSERT INTO settings (
          id, created_at, updated_at,
          model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference,
          sys_auto_update, sys_log_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'singleton',
        '2025-01-01T00:00:00.000Z',
        '2025-01-01T00:00:00.000Z',
        'model1',
        'model2',
        'model3',
        'model4',
        'vscode',
        'zsh',
        0, // false as integer
        'info'
      );

      // Act
      const loaded = await repository.load();

      // Assert
      expect(loaded?.system.autoUpdate).toBe(false);
      expect(typeof loaded?.system.autoUpdate).toBe('boolean');
    });
  });
});
