import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_audit_log'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE pm_audit_log (
        id            TEXT PRIMARY KEY,
        actor_id      TEXT NOT NULL,
        action        TEXT NOT NULL,
        target_id     TEXT,
        target_type   TEXT,
        metadata      TEXT,
        ip_address    TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        FOREIGN KEY (actor_id) REFERENCES pm_users(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(pm_audit_log)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_pm_audit_log_actor')) {
    db.exec('CREATE INDEX idx_pm_audit_log_actor ON pm_audit_log(actor_id)');
  }

  if (!indexNames.has('idx_pm_audit_log_action')) {
    db.exec('CREATE INDEX idx_pm_audit_log_action ON pm_audit_log(action)');
  }

  if (!indexNames.has('idx_pm_audit_log_target')) {
    db.exec('CREATE INDEX idx_pm_audit_log_target ON pm_audit_log(target_id)');
  }

  if (!indexNames.has('idx_pm_audit_log_created')) {
    db.exec('CREATE INDEX idx_pm_audit_log_created ON pm_audit_log(created_at)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_audit_log');
}
