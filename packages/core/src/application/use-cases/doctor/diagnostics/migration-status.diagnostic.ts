/**
 * MigrationStatusDiagnostic
 *
 * Reports whether the local SQLite database has at least one applied
 * migration. The DI container runs migrations on bootstrap, so an empty
 * `umzug_migrations` table generally means migrations failed silently or
 * the schema is older than the running code expects.
 */

import { inject, injectable } from 'tsyringe';
import type Database from 'better-sqlite3';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';

@injectable()
export class MigrationStatusDiagnostic implements IDiagnostic {
  readonly name = 'migration-status';

  constructor(
    @inject('Database')
    private readonly db: Database.Database
  ) {}

  async run(): Promise<DiagnosticResult> {
    try {
      const row = this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'umzug_migrations'"
        )
        .get() as { count: number };
      if (row.count === 0) {
        return {
          name: this.name,
          status: DiagnosticStatus.Fail,
          detail: 'No `umzug_migrations` table — migrations have not been bootstrapped',
          fixHint: 'Re-run `pnpm dev:cli` so the DI container can run migrations on startup',
        };
      }
      const counted = this.db.prepare('SELECT COUNT(*) AS count FROM umzug_migrations').get() as {
        count: number;
      };
      if (counted.count === 0) {
        return {
          name: this.name,
          status: DiagnosticStatus.Fail,
          detail: 'umzug_migrations table is empty — schema is not initialized',
          fixHint: 'Re-run `pnpm dev:cli` to apply migrations',
        };
      }
      return {
        name: this.name,
        status: DiagnosticStatus.Ok,
        detail: `${counted.count} migration(s) applied`,
      };
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Could not read migration status: ${err instanceof Error ? err.message : String(err)}`,
        fixHint: 'Check that the SQLite database is reachable and not corrupted',
      };
    }
  }
}
