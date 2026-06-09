/**
 * Migration 120: Create project_memory table (102-shep-brain — "Shep Brain").
 *
 * Persistent, per-repository project memory. Each row is one durable,
 * categorised unit of project knowledge (a convention, library choice, naming
 * pattern, architecture decision, or past CI-fix resolution) that feature
 * agents read at the start of every feature. Rows are upserted on
 * (repository_path, category, entry_key) so the post-merge extraction step
 * updates learnings in place instead of accumulating duplicates.
 *
 * Columns:
 *  - id                TEXT PK (UUID)
 *  - repository_path   TEXT NOT NULL — normalised repo path scoping the memory
 *  - category          TEXT NOT NULL — MemoryCategory enum value
 *  - entry_key         TEXT NOT NULL — stable upsert key within (repo, category)
 *  - content           TEXT NOT NULL — the memory text injected into prompts
 *  - source_feature_id TEXT — optional FK to the feature whose merge taught it
 *  - created_at        INTEGER NOT NULL (unix ms)
 *  - updated_at        INTEGER NOT NULL (unix ms)
 *
 * Indexes:
 *  - unique (repository_path, category, entry_key) — idempotency / upsert target
 *  - non-unique (repository_path)                  — listByRepository lookups
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_memory'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE project_memory (
        id                TEXT PRIMARY KEY,
        repository_path   TEXT NOT NULL,
        category          TEXT NOT NULL,
        entry_key         TEXT NOT NULL,
        content           TEXT NOT NULL,
        source_feature_id TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(project_memory)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_project_memory_unique_repo_category_key')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_project_memory_unique_repo_category_key ON project_memory(repository_path, category, entry_key)'
    );
  }
  if (!indexNames.has('idx_project_memory_repository_path')) {
    db.exec('CREATE INDEX idx_project_memory_repository_path ON project_memory(repository_path)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS project_memory');
}
