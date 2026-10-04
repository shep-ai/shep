/**
 * Migration 158: Knowledge sources (spec 125).
 *
 * - knowledge_sources: a Notion page tree or database kept in sync as a
 *   space's knowledge; last_run is a JSON summary of the previous sync.
 * - knowledge_documents: one row per page and source, the page as Markdown.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      product_line_id TEXT,
      scope_id TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_title TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      last_run TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_connection
      ON knowledge_sources (connection_id);

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      product_line_id TEXT,
      page_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      content TEXT NOT NULL,
      page_edited_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (source_id, page_id)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_space
      ON knowledge_documents (space_id, product_line_id);
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables are harmless to an older build.
}
