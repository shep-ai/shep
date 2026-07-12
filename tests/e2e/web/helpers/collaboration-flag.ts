import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Resolves the path to the singleton Shep SQLite database the dev server uses.
 * Mirrors the `SHEP_HOME ?? homedir/.shep` lookup the rest of the e2e suite
 * relies on (see `feature-create-drawer.spec.ts` for the same pattern).
 */
export function getShepDbPath(): string {
  return process.env.SHEP_HOME
    ? join(process.env.SHEP_HOME, 'data')
    : join(homedir(), '.shep', 'data');
}

export function openShepDb(): Database.Database {
  const dbPath = getShepDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  return new Database(dbPath);
}

/**
 * Idempotently flips the `feature_flag_collaboration` column on the singleton
 * `settings` row.
 *
 * The dev server caches `Settings` in memory at boot — so changing this column
 * at runtime only takes effect after a server restart. Playwright's webServer
 * starts fresh in CI (`reuseExistingServer: !process.env.CI`), so the global
 * setup writes this column BEFORE the webServer boots and picks up the value.
 *
 * Local-dev caveat: if a `pnpm dev:web` server is already running, run
 * `pnpm dev:web` again after this helper is invoked, otherwise the page will
 * still see the cached `false` value and return 404.
 */
export function setCollaborationFlag(db: Database.Database, enabled: boolean): void {
  const value = enabled ? 1 : 0;
  const result = db
    .prepare('UPDATE settings SET feature_flag_collaboration = ? WHERE 1')
    .run(value);

  // Settings is a singleton row created by InitializeSettingsUseCase. If for
  // some reason the row does not yet exist (fresh test environment), flipping
  // the flag is a no-op — the dev server will create defaults at boot. We do
  // not insert a synthetic row here to avoid colliding with the other
  // mandatory columns.
  if (result.changes === 0) {
    // No row to update yet; the dev server will create defaults on boot.
  }
}
