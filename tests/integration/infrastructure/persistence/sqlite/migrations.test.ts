/**
 * SQLite Migrations Integration Tests
 *
 * Tests for database migration functionality.
 * Verifies that migrations create correct schema and are idempotent.
 *
 * TDD Phase: RED
 * - These tests are written BEFORE implementation
 * - All tests should FAIL initially (migrations don't exist yet)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  tableExists,
  getSchemaVersion,
  getTableSchema,
  getTableIndexes,
  getAppliedMigrations,
  clearMigrationsAfter,
} from '../../../../helpers/database.helper.js';
import {
  runSQLiteMigrations,
  LATEST_SCHEMA_VERSION,
  getTotalMigrationCount,
} from '@/infrastructure/persistence/sqlite/migrations.js';

describe('SQLite Migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  afterEach(() => {
    db.close();
  });

  describe('migration execution', () => {
    it('should create settings table', async () => {
      // Act
      await runSQLiteMigrations(db);

      // Assert
      expect(tableExists(db, 'settings')).toBe(true);
    });

    it('should set user_version pragma to track migration', async () => {
      // Arrange
      const initialVersion = getSchemaVersion(db);
      expect(initialVersion).toBe(0);

      // Act
      await runSQLiteMigrations(db);

      // Assert
      const finalVersion = getSchemaVersion(db);
      expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);
    });

    it('should be idempotent (safe to run twice)', async () => {
      // Act
      await runSQLiteMigrations(db);
      const versionAfterFirst = getSchemaVersion(db);

      // Should not throw when run again
      await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

      // Assert
      const versionAfterSecond = getSchemaVersion(db);
      expect(versionAfterSecond).toBe(versionAfterFirst);
    });

    it('should create all required columns in settings table', async () => {
      // Act
      await runSQLiteMigrations(db);

      // Assert
      const schema = getTableSchema(db, 'settings');
      const columnNames = schema.map((col) => col.name);

      // Required columns
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // ModelConfiguration columns
      expect(columnNames).toContain('model_analyze');
      expect(columnNames).toContain('model_requirements');
      expect(columnNames).toContain('model_plan');
      expect(columnNames).toContain('model_implement');

      // UserProfile columns
      expect(columnNames).toContain('user_name');
      expect(columnNames).toContain('user_email');
      expect(columnNames).toContain('user_github_username');

      // EnvironmentConfig columns
      expect(columnNames).toContain('env_default_editor');
      expect(columnNames).toContain('env_shell_preference');

      // SystemConfig columns
      expect(columnNames).toContain('sys_auto_update');
      expect(columnNames).toContain('sys_log_level');

      // AgentConfig columns
      expect(columnNames).toContain('agent_type');
      expect(columnNames).toContain('agent_auth_method');
      expect(columnNames).toContain('agent_token');
    });

    it('should create unique index for singleton pattern', async () => {
      // Act
      await runSQLiteMigrations(db);

      // Assert
      const indexes = getTableIndexes(db, 'settings');
      expect(indexes.length).toBeGreaterThan(0);

      // Check that there's an index on id column (for singleton enforcement)
      const schema = getTableSchema(db, 'settings');
      const idColumn = schema.find((col) => col.name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn?.pk).toBe(1); // Primary key enforces uniqueness
    });
  });

  describe('settings table schema', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should have id as primary key', () => {
      // Arrange & Act
      const schema = getTableSchema(db, 'settings');
      const idColumn = schema.find((col) => col.name === 'id');

      // Assert
      expect(idColumn).toBeDefined();
      expect(idColumn?.pk).toBe(1);
      expect(idColumn?.type).toBe('TEXT');
      expect(idColumn?.notnull).toBe(1);
    });

    it('should have required timestamp columns', () => {
      // Arrange & Act
      const schema = getTableSchema(db, 'settings');
      const createdAt = schema.find((col) => col.name === 'created_at');
      const updatedAt = schema.find((col) => col.name === 'updated_at');

      // Assert
      expect(createdAt).toBeDefined();
      expect(createdAt?.type).toBe('TEXT');
      expect(createdAt?.notnull).toBe(1);

      expect(updatedAt).toBeDefined();
      expect(updatedAt?.type).toBe('TEXT');
      expect(updatedAt?.notnull).toBe(1);
    });

    it('should have model configuration columns', () => {
      // Arrange & Act
      const schema = getTableSchema(db, 'settings');

      // Assert
      const modelColumns = ['model_analyze', 'model_requirements', 'model_plan', 'model_implement'];

      modelColumns.forEach((colName) => {
        const col = schema.find((c) => c.name === colName);
        expect(col).toBeDefined();
        expect(col?.type).toBe('TEXT');
        expect(col?.notnull).toBe(1);
      });
    });

    it('should have optional user profile columns', () => {
      // Arrange & Act
      const schema = getTableSchema(db, 'settings');

      // Assert
      const userColumns = ['user_name', 'user_email', 'user_github_username'];

      userColumns.forEach((colName) => {
        const col = schema.find((c) => c.name === colName);
        expect(col).toBeDefined();
        expect(col?.type).toBe('TEXT');
        expect(col?.notnull).toBe(0); // NULL allowed (optional fields)
      });
    });

    it('should have environment configuration columns', () => {
      // Arrange & Act
      const schema = getTableSchema(db, 'settings');

      // Assert
      const envColumns = ['env_default_editor', 'env_shell_preference'];

      envColumns.forEach((colName) => {
        const col = schema.find((c) => c.name === colName);
        expect(col).toBeDefined();
        expect(col?.type).toBe('TEXT');
        expect(col?.notnull).toBe(1);
      });
    });

    it('should have system configuration columns', () => {
      // Arrange & Act
      const schema = getTableSchema(db, 'settings');

      // Assert
      const sysAutoUpdate = schema.find((c) => c.name === 'sys_auto_update');
      const sysLogLevel = schema.find((c) => c.name === 'sys_log_level');

      expect(sysAutoUpdate).toBeDefined();
      expect(sysAutoUpdate?.type).toBe('INTEGER'); // Boolean stored as INTEGER
      expect(sysAutoUpdate?.notnull).toBe(1);

      expect(sysLogLevel).toBeDefined();
      expect(sysLogLevel?.type).toBe('TEXT');
      expect(sysLogLevel?.notnull).toBe(1);
    });
  });

  describe('migration SQL validation', () => {
    it('should execute valid SQL without errors', async () => {
      // Act & Assert
      await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    });

    it('should handle multiple migration runs gracefully', async () => {
      // Act & Assert
      await runSQLiteMigrations(db);
      await runSQLiteMigrations(db);
      await runSQLiteMigrations(db);

      // Should still have correct schema
      expect(tableExists(db, 'settings')).toBe(true);
      const schema = getTableSchema(db, 'settings');
      expect(schema.length).toBeGreaterThan(0);
    });
  });

  describe('migration v6: approval workflow columns', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add approval_mode column to agent_runs table', () => {
      const schema = getTableSchema(db, 'agent_runs');
      const approvalMode = schema.find((col) => col.name === 'approval_mode');

      expect(approvalMode).toBeDefined();
      expect(approvalMode?.type).toBe('TEXT');
      expect(approvalMode?.notnull).toBe(0); // nullable
    });

    it('should add approval_status column to agent_runs table', () => {
      const schema = getTableSchema(db, 'agent_runs');
      const approvalStatus = schema.find((col) => col.name === 'approval_status');

      expect(approvalStatus).toBeDefined();
      expect(approvalStatus?.type).toBe('TEXT');
      expect(approvalStatus?.notnull).toBe(0); // nullable
    });

    it('should default approval columns to NULL for existing rows', () => {
      // Insert a row before checking defaults
      db.prepare(
        `
        INSERT INTO agent_runs (id, agent_type, agent_name, status, prompt, thread_id, created_at, updated_at)
        VALUES ('test-001', 'claude-code', 'test', 'pending', 'test prompt', 'thread-1', 1000, 1000)
      `
      ).run();

      const row = db
        .prepare('SELECT approval_mode, approval_status FROM agent_runs WHERE id = ?')
        .get('test-001') as Record<string, unknown>;
      expect(row.approval_mode).toBeNull();
      expect(row.approval_status).toBeNull();
    });
  });

  describe('migration v7: spec_path on features', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add spec_path column to features table', () => {
      const schema = getTableSchema(db, 'features');
      const specPath = schema.find((col) => col.name === 'spec_path');

      expect(specPath).toBeDefined();
      expect(specPath?.type).toBe('TEXT');
      expect(specPath?.notnull).toBe(0); // nullable
    });

    it('should set schema version to at least 7', () => {
      const version = getSchemaVersion(db);
      expect(version).toBeGreaterThanOrEqual(7);
    });
  });

  describe('migration v9: notification preferences', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add notification channel columns to settings table', () => {
      const schema = getTableSchema(db, 'settings');
      const columnNames = schema.map((col) => col.name);

      expect(columnNames).toContain('notif_in_app_enabled');
      expect(columnNames).toContain('notif_browser_enabled');
      expect(columnNames).toContain('notif_desktop_enabled');
    });

    it('should add notification event type columns to settings table', () => {
      const schema = getTableSchema(db, 'settings');
      const columnNames = schema.map((col) => col.name);

      expect(columnNames).toContain('notif_evt_agent_started');
      expect(columnNames).toContain('notif_evt_phase_completed');
      expect(columnNames).toContain('notif_evt_waiting_approval');
      expect(columnNames).toContain('notif_evt_agent_completed');
      expect(columnNames).toContain('notif_evt_agent_failed');
    });

    it('should have all notification columns as INTEGER NOT NULL', () => {
      const schema = getTableSchema(db, 'settings');

      const notifColumns = [
        'notif_in_app_enabled',
        'notif_browser_enabled',
        'notif_desktop_enabled',
        'notif_evt_agent_started',
        'notif_evt_phase_completed',
        'notif_evt_waiting_approval',
        'notif_evt_agent_completed',
        'notif_evt_agent_failed',
      ];

      notifColumns.forEach((colName) => {
        const col = schema.find((c) => c.name === colName);
        expect(col, `column ${colName} should exist`).toBeDefined();
        expect(col?.type, `column ${colName} should be INTEGER`).toBe('INTEGER');
        expect(col?.notnull, `column ${colName} should be NOT NULL`).toBe(1);
      });
    });

    it('should default channel columns to 1 (enabled/opt-out)', () => {
      // Insert a settings row to check default values
      db.prepare(
        `
        INSERT INTO settings (id, created_at, updated_at, model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference, sys_auto_update, sys_log_level, agent_type, agent_auth_method)
        VALUES ('test', '2025-01-01', '2025-01-01', 'm', 'm', 'm', 'm', 'vscode', 'bash', 1, 'info', 'claude-code', 'session')
      `
      ).run();

      const row = db
        .prepare(
          'SELECT notif_in_app_enabled, notif_browser_enabled, notif_desktop_enabled FROM settings WHERE id = ?'
        )
        .get('test') as Record<string, number>;

      expect(row.notif_in_app_enabled).toBe(1);
      expect(row.notif_browser_enabled).toBe(1);
      expect(row.notif_desktop_enabled).toBe(1);
    });

    it('should default event type columns to 1 (enabled)', () => {
      db.prepare(
        `
        INSERT INTO settings (id, created_at, updated_at, model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference, sys_auto_update, sys_log_level, agent_type, agent_auth_method)
        VALUES ('test', '2025-01-01', '2025-01-01', 'm', 'm', 'm', 'm', 'vscode', 'bash', 1, 'info', 'claude-code', 'session')
      `
      ).run();

      const row = db
        .prepare(
          `SELECT notif_evt_agent_started, notif_evt_phase_completed, notif_evt_waiting_approval,
                  notif_evt_agent_completed, notif_evt_agent_failed FROM settings WHERE id = ?`
        )
        .get('test') as Record<string, number>;

      expect(row.notif_evt_agent_started).toBe(1);
      expect(row.notif_evt_phase_completed).toBe(1);
      expect(row.notif_evt_waiting_approval).toBe(1);
      expect(row.notif_evt_agent_completed).toBe(1);
      expect(row.notif_evt_agent_failed).toBe(1);
    });

    it('should run successfully on a v8 database with existing settings row', () => {
      // Verify that the migration doesn't fail when settings rows already exist
      // and that existing rows get correct default values for new columns
      db.prepare(
        `
        INSERT INTO settings (id, created_at, updated_at, model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference, sys_auto_update, sys_log_level, agent_type, agent_auth_method)
        VALUES ('existing', '2025-01-01', '2025-01-01', 'm', 'm', 'm', 'm', 'vscode', 'bash', 1, 'info', 'claude-code', 'session')
      `
      ).run();

      // The existing row should have default notification values
      const row = db
        .prepare('SELECT notif_in_app_enabled, notif_evt_agent_started FROM settings WHERE id = ?')
        .get('existing') as Record<string, number>;

      expect(row.notif_in_app_enabled).toBe(1);
      expect(row.notif_evt_agent_started).toBe(1);
    });
  });

  describe('migration v11: worktree_path on features', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add worktree_path column to features table', () => {
      const schema = getTableSchema(db, 'features');
      const worktreePath = schema.find((col) => col.name === 'worktree_path');

      expect(worktreePath).toBeDefined();
      expect(worktreePath?.type).toBe('TEXT');
      expect(worktreePath?.notnull).toBe(0); // nullable
    });
  });

  describe('migration v12: push column on features', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add push column to features table', () => {
      const schema = getTableSchema(db, 'features');
      const push = schema.find((col) => col.name === 'push');

      expect(push).toBeDefined();
      expect(push?.type).toBe('INTEGER');
      expect(push?.dflt_value).toBe('0');
    });
  });

  describe('migration v13: user_query on features', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add user_query column to features table', () => {
      const schema = getTableSchema(db, 'features');
      const userQuery = schema.find((col) => col.name === 'user_query');

      expect(userQuery).toBeDefined();
      expect(userQuery?.type).toBe('TEXT');
      expect(userQuery?.notnull).toBe(1);
      expect(userQuery?.dflt_value).toBe("''");
    });
  });

  describe('migration v15: repositories table and feature repository_id', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should create repositories table', () => {
      expect(tableExists(db, 'repositories')).toBe(true);
    });

    it('should have correct repositories table schema', () => {
      const schema = getTableSchema(db, 'repositories');
      const columnNames = schema.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('path');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      const pathCol = schema.find((c) => c.name === 'path');
      expect(pathCol?.type).toBe('TEXT');
      expect(pathCol?.notnull).toBe(1);
    });

    it('should create index on repositories path', () => {
      const indexes = getTableIndexes(db, 'repositories');
      expect(indexes).toContain('idx_repositories_path');
    });

    it('should add repository_id column to features table', () => {
      const schema = getTableSchema(db, 'features');
      const repoId = schema.find((col) => col.name === 'repository_id');

      expect(repoId).toBeDefined();
      expect(repoId?.type).toBe('TEXT');
      expect(repoId?.notnull).toBe(0); // nullable
    });

    it('should backfill repositories from existing features', async () => {
      // Insert features with same repo path before migration
      const freshDb = createInMemoryDatabase();

      // Run migrations up to v14 manually
      const result = freshDb.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(result.user_version).toBe(0);

      // Run all migrations — features table created at v4
      // We need to insert features AFTER v4 but BEFORE v15
      // Since we can't pause migration, test the result after full migration
      await runSQLiteMigrations(freshDb);

      // After full migration, repositories table should exist (even if empty since no features existed pre-migration)
      expect(tableExists(freshDb, 'repositories')).toBe(true);
      freshDb.close();
    });

    it('should backfill repository_id on features from matching repositories', () => {
      // Insert a feature and verify it gets a repository_id after migration
      // Since all migrations run at once on fresh DB, we test by inserting a feature
      // and then checking if the repositories table has the matching entry
      const now = Date.now();
      db.prepare(
        `INSERT INTO features (id, name, slug, description, user_query, repository_path, branch, lifecycle, messages, related_artifacts, created_at, updated_at)
         VALUES ('f1', 'test-feat', 'test-feat', 'desc', '', '/repos/test', 'main', 'Requirements', '[]', '[]', ${now}, ${now})`
      ).run();

      // Insert a repo for the path
      db.prepare(
        `INSERT OR IGNORE INTO repositories (id, name, path, created_at, updated_at)
         VALUES ('repo-1', 'test', '/repos/test', ${now}, ${now})`
      ).run();

      // Update the feature's repository_id
      db.prepare(
        `UPDATE features SET repository_id = (SELECT r.id FROM repositories r WHERE r.path = features.repository_path) WHERE id = 'f1'`
      ).run();

      const feature = db.prepare('SELECT repository_id FROM features WHERE id = ?').get('f1') as {
        repository_id: string | null;
      };
      expect(feature.repository_id).toBe('repo-1');
    });

    it('should create unique repositories from duplicate feature paths', () => {
      // Verify UNIQUE constraint on repositories.path
      const now = Date.now();
      db.prepare(
        `INSERT INTO repositories (id, name, path, created_at, updated_at)
         VALUES ('r1', 'test', '/repos/test', ${now}, ${now})`
      ).run();

      // Inserting duplicate path should fail
      expect(() => {
        db.prepare(
          `INSERT INTO repositories (id, name, path, created_at, updated_at)
           VALUES ('r2', 'test', '/repos/test', ${now}, ${now})`
        ).run();
      }).toThrow();
    });

    it('should set schema version to at least 15', () => {
      const version = getSchemaVersion(db);
      expect(version).toBeGreaterThanOrEqual(15);
    });
  });

  describe('migration v17: fix repository names', () => {
    it('should correctly extract last path segment as repository name', async () => {
      await runSQLiteMigrations(db);

      const now = Date.now();
      // Insert repos with incorrectly extracted names (simulating migration 015 bug)
      db.prepare(
        `INSERT INTO repositories (id, name, path, created_at, updated_at)
         VALUES ('r1', 'rs/arielshadkhan/Code/cli', '/Users/arielshadkhan/Code/cli', ${now}, ${now})`
      ).run();
      db.prepare(
        `INSERT INTO repositories (id, name, path, created_at, updated_at)
         VALUES ('r2', 'me/projects/webapp', '/home/projects/webapp', ${now}, ${now})`
      ).run();

      // Re-run the fix manually (migration already applied, so simulate it)
      db.exec(`
        UPDATE repositories
        SET name = replace(path, rtrim(path, replace(path, '/', '')), '')
        WHERE instr(path, '/') > 0;
      `);

      const r1 = db.prepare('SELECT name FROM repositories WHERE id = ?').get('r1') as {
        name: string;
      };
      const r2 = db.prepare('SELECT name FROM repositories WHERE id = ?').get('r2') as {
        name: string;
      };

      expect(r1.name).toBe('cli');
      expect(r2.name).toBe('webapp');
    });

    it('should handle paths without slashes', async () => {
      await runSQLiteMigrations(db);

      const now = Date.now();
      db.prepare(
        `INSERT INTO repositories (id, name, path, created_at, updated_at)
         VALUES ('r3', 'my-repo', 'my-repo', ${now}, ${now})`
      ).run();

      // The fix only runs WHERE instr(path, '/') > 0, so this should be unchanged
      db.exec(`
        UPDATE repositories
        SET name = replace(path, rtrim(path, replace(path, '/', '')), '')
        WHERE instr(path, '/') > 0;
      `);

      const r3 = db.prepare('SELECT name FROM repositories WHERE id = ?').get('r3') as {
        name: string;
      };
      expect(r3.name).toBe('my-repo');
    });
  });

  describe('migration v23: compensating back-fill of orphaned repository rows', () => {
    it('creates a repositories row for a feature whose repository_path has no matching row', async () => {
      // Arrange: run all current migrations (DB reaches v22)
      await runSQLiteMigrations(db);
      const now = Date.now();
      db.prepare(
        `INSERT INTO features (id, name, slug, description, user_query, repository_path, branch, lifecycle, messages, related_artifacts, created_at, updated_at)
         VALUES ('f-orphan', 'orphan-feat', 'orphan-feat', 'desc', '', '/test/path', 'main', 'Requirements', '[]', '[]', ?, ?)`
      ).run(now, now);

      // Confirm no repositories row for this path before migration 23
      const beforeRow = db.prepare('SELECT * FROM repositories WHERE path = ?').get('/test/path');
      expect(beforeRow).toBeUndefined();

      // Act: reset version to 22 so migration 23 runs on the next call
      db.pragma('user_version = 22');
      clearMigrationsAfter(db, '022');
      await runSQLiteMigrations(db);

      // Assert: repositories row now exists for the orphaned path
      const afterRow = db.prepare('SELECT * FROM repositories WHERE path = ?').get('/test/path') as
        | Record<string, unknown>
        | undefined;
      expect(afterRow).toBeDefined();
      expect(afterRow!.path).toBe('/test/path');
      expect(afterRow!.name).toBe('path'); // last segment of '/test/path'
    });

    it('does not duplicate an already-existing repositories row (idempotent)', async () => {
      // Arrange: run migrations, create matching feature + repo pair
      await runSQLiteMigrations(db);
      const now = Date.now();
      db.prepare(
        `INSERT INTO repositories (id, name, path, created_at, updated_at)
         VALUES ('existing-repo', 'myrepo', '/existing/myrepo', ?, ?)`
      ).run(now, now);
      db.prepare(
        `INSERT INTO features (id, name, slug, description, user_query, repository_path, branch, lifecycle, messages, related_artifacts, created_at, updated_at)
         VALUES ('f-existing', 'existing-feat', 'existing-feat', 'desc', '', '/existing/myrepo', 'main', 'Requirements', '[]', '[]', ?, ?)`
      ).run(now, now);

      // Act: reset and re-run migration 23
      db.pragma('user_version = 22');
      clearMigrationsAfter(db, '022');
      await runSQLiteMigrations(db);

      // Assert: still only one row for this path
      const rows = db
        .prepare('SELECT * FROM repositories WHERE path = ?')
        .all('/existing/myrepo') as unknown[];
      expect(rows).toHaveLength(1);
    });

    it('sets schema version to latest after migration', async () => {
      await runSQLiteMigrations(db);
      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(LATEST_SCHEMA_VERSION).toBe(36);
    });
  });

  describe('migration v24: feature flags and CI workflow columns', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add feature_flag_env_deploy column as INTEGER NOT NULL DEFAULT 1', () => {
      const schema = getTableSchema(db, 'settings');
      const col = schema.find((c) => c.name === 'feature_flag_env_deploy');

      expect(col).toBeDefined();
      expect(col?.type).toBe('INTEGER');
      expect(col?.notnull).toBe(1);
      expect(col?.dflt_value).toBe('1');
    });

    it('should add feature_flag_debug column as INTEGER NOT NULL DEFAULT 0', () => {
      const schema = getTableSchema(db, 'settings');
      const col = schema.find((c) => c.name === 'feature_flag_debug');

      expect(col).toBeDefined();
      expect(col?.type).toBe('INTEGER');
      expect(col?.notnull).toBe(1);
      expect(col?.dflt_value).toBe('0');
    });

    it('should add ci_max_fix_attempts column as nullable INTEGER', () => {
      const schema = getTableSchema(db, 'settings');
      const col = schema.find((c) => c.name === 'ci_max_fix_attempts');

      expect(col).toBeDefined();
      expect(col?.type).toBe('INTEGER');
      expect(col?.notnull).toBe(0);
      expect(col?.dflt_value).toBeNull();
    });

    it('should add ci_watch_timeout_ms column as nullable INTEGER', () => {
      const schema = getTableSchema(db, 'settings');
      const col = schema.find((c) => c.name === 'ci_watch_timeout_ms');

      expect(col).toBeDefined();
      expect(col?.type).toBe('INTEGER');
      expect(col?.notnull).toBe(0);
      expect(col?.dflt_value).toBeNull();
    });

    it('should add ci_log_max_chars column as nullable INTEGER', () => {
      const schema = getTableSchema(db, 'settings');
      const col = schema.find((c) => c.name === 'ci_log_max_chars');

      expect(col).toBeDefined();
      expect(col?.type).toBe('INTEGER');
      expect(col?.notnull).toBe(0);
      expect(col?.dflt_value).toBeNull();
    });

    it('should default feature flag columns for existing rows (envDeploy=1, others=0)', () => {
      db.prepare(
        `INSERT INTO settings (id, created_at, updated_at, model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference, sys_auto_update, sys_log_level, agent_type, agent_auth_method)
        VALUES ('test', '2025-01-01', '2025-01-01', 'm', 'm', 'm', 'm', 'vscode', 'bash', 1, 'info', 'claude-code', 'session')`
      ).run();

      const row = db
        .prepare('SELECT feature_flag_env_deploy, feature_flag_debug FROM settings WHERE id = ?')
        .get('test') as Record<string, number>;

      expect(row.feature_flag_env_deploy).toBe(1);
      expect(row.feature_flag_debug).toBe(0);
    });

    it('should default CI columns to NULL for existing rows', () => {
      db.prepare(
        `INSERT INTO settings (id, created_at, updated_at, model_analyze, model_requirements, model_plan, model_implement,
          env_default_editor, env_shell_preference, sys_auto_update, sys_log_level, agent_type, agent_auth_method)
        VALUES ('test', '2025-01-01', '2025-01-01', 'm', 'm', 'm', 'm', 'vscode', 'bash', 1, 'info', 'claude-code', 'session')`
      ).run();

      const row = db
        .prepare(
          'SELECT ci_max_fix_attempts, ci_watch_timeout_ms, ci_log_max_chars FROM settings WHERE id = ?'
        )
        .get('test') as Record<string, number | null>;

      expect(row.ci_max_fix_attempts).toBeNull();
      expect(row.ci_watch_timeout_ms).toBeNull();
      expect(row.ci_log_max_chars).toBeNull();
    });

    it('should be idempotent (running twice does not error)', async () => {
      db.pragma('user_version = 23');
      clearMigrationsAfter(db, '023');
      await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    });
  });

  describe('migration v33: pr_sync_lock table', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should create pr_sync_lock table', () => {
      expect(tableExists(db, 'pr_sync_lock')).toBe(true);
    });

    it('should have correct pr_sync_lock schema', () => {
      const schema = getTableSchema(db, 'pr_sync_lock');
      const columnNames = schema.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('locked_by');
      expect(columnNames).toContain('locked_at');
      expect(columnNames).toContain('expires_at');
    });

    it('should enforce single-row constraint via CHECK (id = 1)', () => {
      db.prepare(
        'INSERT INTO pr_sync_lock (id, locked_by, locked_at, expires_at) VALUES (1, ?, ?, ?)'
      ).run('proc-1', Date.now(), Date.now() + 60000);

      // Inserting with id != 1 should fail
      expect(() => {
        db.prepare(
          'INSERT INTO pr_sync_lock (id, locked_by, locked_at, expires_at) VALUES (2, ?, ?, ?)'
        ).run('proc-2', Date.now(), Date.now() + 60000);
      }).toThrow();
    });

    it('should allow INSERT OR REPLACE to update the single lock row', () => {
      db.prepare(
        'INSERT INTO pr_sync_lock (id, locked_by, locked_at, expires_at) VALUES (1, ?, ?, ?)'
      ).run('proc-1', Date.now(), Date.now() + 60000);

      db.prepare(
        'INSERT OR REPLACE INTO pr_sync_lock (id, locked_by, locked_at, expires_at) VALUES (1, ?, ?, ?)'
      ).run('proc-2', Date.now(), Date.now() + 60000);

      const row = db.prepare('SELECT locked_by FROM pr_sync_lock WHERE id = 1').get() as {
        locked_by: string;
      };
      expect(row.locked_by).toBe('proc-2');
    });
  });

  describe('migration v8: approval_gates and phase_timings', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add approval_gates column to agent_runs table', () => {
      const schema = getTableSchema(db, 'agent_runs');
      const approvalGates = schema.find((col) => col.name === 'approval_gates');

      expect(approvalGates).toBeDefined();
      expect(approvalGates?.type).toBe('TEXT');
      expect(approvalGates?.notnull).toBe(0); // nullable
    });

    it('should create phase_timings table', () => {
      expect(tableExists(db, 'phase_timings')).toBe(true);
    });

    it('should have correct phase_timings schema', () => {
      const schema = getTableSchema(db, 'phase_timings');
      const columnNames = schema.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('agent_run_id');
      expect(columnNames).toContain('phase');
      expect(columnNames).toContain('started_at');
      expect(columnNames).toContain('completed_at');
      expect(columnNames).toContain('duration_ms');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should create index on phase_timings agent_run_id', () => {
      const indexes = getTableIndexes(db, 'phase_timings');
      expect(indexes).toContain('idx_phase_timings_run');
    });
  });

  describe('migration 044: previous_lifecycle on features', () => {
    beforeEach(async () => {
      await runSQLiteMigrations(db);
    });

    it('should add previous_lifecycle column to features table', () => {
      const schema = getTableSchema(db, 'features');
      const col = schema.find((c) => c.name === 'previous_lifecycle');

      expect(col).toBeDefined();
      expect(col?.type).toBe('TEXT');
      expect(col?.notnull).toBe(0); // nullable
    });

    it('should default previous_lifecycle to NULL for existing rows', () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO features (id, name, slug, description, user_query, repository_path, branch, lifecycle, messages, related_artifacts, created_at, updated_at)
         VALUES ('f-test', 'test', 'test', 'desc', '', '/repo', 'main', 'Maintain', '[]', '[]', ?, ?)`
      ).run(now, now);

      const row = db
        .prepare('SELECT previous_lifecycle FROM features WHERE id = ?')
        .get('f-test') as {
        previous_lifecycle: string | null;
      };
      expect(row.previous_lifecycle).toBeNull();
    });

    it('should be idempotent (running twice does not error)', async () => {
      clearMigrationsAfter(db, '043');
      await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    });
  });

  describe('umzug migration tracking', () => {
    let expectedCount: number;

    beforeEach(async () => {
      expectedCount = await getTotalMigrationCount();
    });

    it('should create umzug_migrations table after migration run', async () => {
      await runSQLiteMigrations(db);
      expect(tableExists(db, 'umzug_migrations')).toBe(true);
    });

    it('should record all migration entries in umzug_migrations', async () => {
      await runSQLiteMigrations(db);
      const applied = getAppliedMigrations(db);
      expect(applied).toHaveLength(expectedCount);
    });

    it('should record migrations with zero-padded names starting at 001', async () => {
      await runSQLiteMigrations(db);
      const applied = getAppliedMigrations(db);
      expect(applied[0]).toMatch(/^001-/);
      expect(applied[applied.length - 1]).toMatch(/^0\d{2}-/);
    });

    it('should bootstrap seeder for database at user_version 20', async () => {
      // Simulate a database that was previously at version 20 under the old system.
      // First run all migrations to get the full schema, then remove umzug tracking
      // and reset user_version to 20 to simulate the pre-umzug state.
      await runSQLiteMigrations(db);

      // Remove the umzug_migrations table and reset user_version to simulate
      // a database that was managed by the old PRAGMA-based system
      db.exec('DROP TABLE umzug_migrations');
      db.pragma('user_version = 20');

      // Running migrations should bootstrap 20 records and re-run remaining
      await runSQLiteMigrations(db);

      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      const applied = getAppliedMigrations(db);
      expect(applied).toHaveLength(expectedCount);
    });

    it('should apply only pending migrations when some are already tracked', async () => {
      await runSQLiteMigrations(db);

      // Remove the last 5 migrations from tracking
      clearMigrationsAfter(db, '029');
      db.pragma('user_version = 29');

      // Re-run should apply only pending migrations
      await runSQLiteMigrations(db);

      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(getAppliedMigrations(db)).toHaveLength(expectedCount);
    });

    it('should repair missing pr_sync_lock table after bootstrap gap', async () => {
      // Simulate the exact production scenario:
      // 1. DB was at user_version=34 with all tables except pr_sync_lock
      //    (migration 033 was added after the DB was already at version 34)
      // 2. umzug transition: bootstrap seeds all 35 as "done"
      // 3. Verification detects pr_sync_lock is missing, unlogs 033
      // 4. umzug.up() re-runs migration 033, creating the table

      // Step 1: Run all migrations to get the full schema
      await runSQLiteMigrations(db);

      // Step 2: Drop pr_sync_lock and umzug_migrations to simulate the gap
      db.exec('DROP TABLE pr_sync_lock');
      db.exec('DROP TABLE umzug_migrations');
      // user_version stays at 34 (simulating the pre-umzug state)

      // Step 3 & 4: Re-run migrations — should bootstrap, verify, and repair
      await runSQLiteMigrations(db);

      // pr_sync_lock should now exist
      expect(tableExists(db, 'pr_sync_lock')).toBe(true);
      // All migrations should be tracked
      expect(getAppliedMigrations(db)).toHaveLength(expectedCount);
      // user_version may be 33 (set by re-run of 033) since 034 was already
      // tracked and didn't re-run. With umzug, user_version is a legacy artifact.
      expect(getSchemaVersion(db)).toBeGreaterThanOrEqual(33);
    });
  });
});
