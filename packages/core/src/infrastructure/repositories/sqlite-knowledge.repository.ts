/** SQLite knowledge source and document repositories (spec 125). */

import type Database from 'better-sqlite3';
import type { KnowledgeDocument, KnowledgeSource } from '../../domain/generated/output.js';
import type {
  IKnowledgeDocumentRepository,
  IKnowledgeSourceRepository,
} from '../../application/ports/output/repositories/knowledge-repository.interface.js';
import {
  knowledgeDocumentFromDatabase,
  knowledgeDocumentToDatabase,
  knowledgeSourceFromDatabase,
  knowledgeSourceToDatabase,
  type KnowledgeDocumentRow,
  type KnowledgeSourceRow,
} from '../persistence/sqlite/mappers/knowledge.mapper.js';

export class SQLiteKnowledgeSourceRepository implements IKnowledgeSourceRepository {
  constructor(private readonly db: Database.Database) {}

  async list(connectionId?: string): Promise<KnowledgeSource[]> {
    const rows = (
      connectionId === undefined
        ? this.db.prepare('SELECT * FROM knowledge_sources ORDER BY created_at ASC').all()
        : this.db
            .prepare(
              'SELECT * FROM knowledge_sources WHERE connection_id = ? ORDER BY created_at ASC'
            )
            .all(connectionId)
    ) as KnowledgeSourceRow[];
    return rows.map(knowledgeSourceFromDatabase);
  }

  async findById(id: string): Promise<KnowledgeSource | null> {
    const row = this.db.prepare('SELECT * FROM knowledge_sources WHERE id = ?').get(id) as
      | KnowledgeSourceRow
      | undefined;
    return row ? knowledgeSourceFromDatabase(row) : null;
  }

  async create(source: KnowledgeSource): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO knowledge_sources (id, connection_id, space_id, product_line_id, scope_id,
           scope_kind, scope_title, interval_minutes, enabled, last_run_at, last_run, last_error,
           created_at, updated_at)
         VALUES (@id, @connection_id, @space_id, @product_line_id, @scope_id, @scope_kind,
           @scope_title, @interval_minutes, @enabled, @last_run_at, @last_run, @last_error,
           @created_at, @updated_at)`
      )
      .run(knowledgeSourceToDatabase(source));
  }

  async update(source: KnowledgeSource): Promise<void> {
    this.db
      .prepare(
        `UPDATE knowledge_sources SET connection_id = @connection_id, space_id = @space_id,
           product_line_id = @product_line_id, scope_id = @scope_id, scope_kind = @scope_kind,
           scope_title = @scope_title, interval_minutes = @interval_minutes, enabled = @enabled,
           last_run_at = @last_run_at, last_run = @last_run, last_error = @last_error,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run(knowledgeSourceToDatabase(source));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
  }
}

export class SQLiteKnowledgeDocumentRepository implements IKnowledgeDocumentRepository {
  constructor(private readonly db: Database.Database) {}

  async listBySource(sourceId: string): Promise<KnowledgeDocument[]> {
    return this.query('SELECT * FROM knowledge_documents WHERE source_id = ? ORDER BY title', [
      sourceId,
    ]);
  }

  async listVisible(spaceId: string, productLineId?: string): Promise<KnowledgeDocument[]> {
    return productLineId === undefined
      ? this.query(
          `SELECT * FROM knowledge_documents
           WHERE space_id = ? AND product_line_id IS NULL ORDER BY title`,
          [spaceId]
        )
      : this.query(
          `SELECT * FROM knowledge_documents
           WHERE space_id = ? AND (product_line_id IS NULL OR product_line_id = ?) ORDER BY title`,
          [spaceId, productLineId]
        );
  }

  async listBySpace(spaceId: string): Promise<KnowledgeDocument[]> {
    return this.query('SELECT * FROM knowledge_documents WHERE space_id = ? ORDER BY title', [
      spaceId,
    ]);
  }

  async create(document: KnowledgeDocument): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO knowledge_documents (id, source_id, space_id, product_line_id, page_id,
           title, url, content, page_edited_at, created_at, updated_at)
         VALUES (@id, @source_id, @space_id, @product_line_id, @page_id, @title, @url, @content,
           @page_edited_at, @created_at, @updated_at)`
      )
      .run(knowledgeDocumentToDatabase(document));
  }

  async update(document: KnowledgeDocument): Promise<void> {
    this.db
      .prepare(
        `UPDATE knowledge_documents SET source_id = @source_id, space_id = @space_id,
           product_line_id = @product_line_id, page_id = @page_id, title = @title, url = @url,
           content = @content, page_edited_at = @page_edited_at, updated_at = @updated_at
         WHERE id = @id`
      )
      .run(knowledgeDocumentToDatabase(document));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
  }

  async deleteBySource(sourceId: string): Promise<void> {
    this.db.prepare('DELETE FROM knowledge_documents WHERE source_id = ?').run(sourceId);
  }

  private query(sql: string, params: unknown[]): KnowledgeDocument[] {
    return (this.db.prepare(sql).all(...params) as KnowledgeDocumentRow[]).map(
      knowledgeDocumentFromDatabase
    );
  }
}
