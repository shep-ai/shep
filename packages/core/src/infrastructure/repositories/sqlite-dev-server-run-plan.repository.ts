/**
 * SQLite DevServerRunPlan Repository Implementation
 *
 * Implements IDevServerRunPlanRepository using better-sqlite3.
 *
 * NOTE (LESSONS.md): the INSERT column list, VALUES list, and the
 * ON CONFLICT UPDATE SET clause each include EVERY column the mapper
 * produces — a missing column silently drops writes.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IDevServerRunPlanRepository } from '../../application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { DevServerRunPlan } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type DevServerRunPlanRow,
} from '../persistence/sqlite/mappers/dev-server-run-plan.mapper.js';

@injectable()
export class SQLiteDevServerRunPlanRepository implements IDevServerRunPlanRepository {
  constructor(private readonly db: Database.Database) {}

  async findByRepoPath(repoPath: string): Promise<DevServerRunPlan | null> {
    const stmt = this.db.prepare('SELECT * FROM dev_server_run_plans WHERE repo_path = ?');
    const row = stmt.get(repoPath) as DevServerRunPlanRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async upsert(plan: DevServerRunPlan): Promise<void> {
    const row = toDatabase(plan);
    const stmt = this.db.prepare(`
      INSERT INTO dev_server_run_plans (
        repo_path, plan_source, command, cwd, package_manager,
        expected_port, language, framework, setup_commands,
        config_hash, install_stamp_hash, created_at, updated_at
      ) VALUES (
        @repo_path, @plan_source, @command, @cwd, @package_manager,
        @expected_port, @language, @framework, @setup_commands,
        @config_hash, @install_stamp_hash, @created_at, @updated_at
      )
      ON CONFLICT(repo_path) DO UPDATE SET
        plan_source        = excluded.plan_source,
        command            = excluded.command,
        cwd                = excluded.cwd,
        package_manager    = excluded.package_manager,
        expected_port      = excluded.expected_port,
        language           = excluded.language,
        framework          = excluded.framework,
        setup_commands     = excluded.setup_commands,
        config_hash        = excluded.config_hash,
        install_stamp_hash = excluded.install_stamp_hash,
        updated_at         = excluded.updated_at
    `);
    stmt.run(row);
  }

  async deleteByRepoPath(repoPath: string): Promise<void> {
    this.db.prepare('DELETE FROM dev_server_run_plans WHERE repo_path = ?').run(repoPath);
  }

  async stampInstallHash(repoPath: string, hash: string): Promise<void> {
    const stmt = this.db.prepare(
      'UPDATE dev_server_run_plans SET install_stamp_hash = ?, updated_at = ? WHERE repo_path = ?'
    );
    stmt.run(hash, new Date().toISOString(), repoPath);
  }
}
