/**
 * SQLite Page Version Repository Implementation
 *
 * Implements IPageVersionRepository using better-sqlite3.
 * Tracks version history for wiki-style page content.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPageVersionRepository } from '../../application/ports/output/repositories/page-version-repository.interface.js';
import type { PageVersion } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PageVersionRow,
} from '../persistence/sqlite/mappers/page-version.mapper.js';

@injectable()
export class SQLitePageVersionRepository implements IPageVersionRepository {
  constructor(private readonly db: Database.Database) {}

  async create(version: PageVersion): Promise<void> {
    const row = toDatabase(version);
    const stmt = this.db.prepare(`
      INSERT INTO page_versions (
        id, page_id, version_number, title, content,
        created_at, updated_at
      ) VALUES (
        @id, @page_id, @version_number, @title, @content,
        @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async listByPage(pageId: string): Promise<PageVersion[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM page_versions WHERE page_id = ? ORDER BY version_number DESC'
    );
    const rows = stmt.all(pageId) as PageVersionRow[];
    return rows.map(fromDatabase);
  }

  async findLatest(pageId: string): Promise<PageVersion | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM page_versions WHERE page_id = ? ORDER BY version_number DESC LIMIT 1'
    );
    const row = stmt.get(pageId) as PageVersionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByVersion(pageId: string, versionNumber: number): Promise<PageVersion | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM page_versions WHERE page_id = ? AND version_number = ?'
    );
    const row = stmt.get(pageId, versionNumber) as PageVersionRow | undefined;
    return row ? fromDatabase(row) : null;
  }
}
