/**
 * SQLite Space Repository (spec 120). Implements ISpaceRepository.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ISpaceRepository } from '../../application/ports/output/repositories/space-repository.interface.js';
import type { Space } from '../../domain/generated/output.js';
import {
  spaceFromDatabase,
  spaceToDatabase,
  type SpaceRow,
} from '../persistence/sqlite/mappers/space.mapper.js';

@injectable()
export class SQLiteSpaceRepository implements ISpaceRepository {
  constructor(private readonly db: Database.Database) {}

  async list(): Promise<Space[]> {
    const rows = this.db
      .prepare('SELECT * FROM spaces ORDER BY is_default DESC, name COLLATE NOCASE ASC')
      .all() as SpaceRow[];
    return rows.map(spaceFromDatabase);
  }

  async findById(id: string): Promise<Space | null> {
    const row = this.db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) as
      | SpaceRow
      | undefined;
    return row ? spaceFromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<Space | null> {
    const row = this.db.prepare('SELECT * FROM spaces WHERE slug = ?').get(slug) as
      | SpaceRow
      | undefined;
    return row ? spaceFromDatabase(row) : null;
  }

  async getDefault(): Promise<Space> {
    const row = this.db
      .prepare('SELECT * FROM spaces WHERE is_default = 1 ORDER BY created_at ASC LIMIT 1')
      .get() as SpaceRow | undefined;
    if (!row) throw new Error('No default space exists; migration 152 has not run.');
    return spaceFromDatabase(row);
  }

  async create(space: Space): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO spaces (id, name, slug, description, color, is_default,
           claude_config_dir, gh_config_dir, git_author_name, git_author_email, aws_profile,
           use_bedrock, allowed_agent_types, created_at, updated_at)
         VALUES (@id, @name, @slug, @description, @color, @is_default,
           @claude_config_dir, @gh_config_dir, @git_author_name, @git_author_email, @aws_profile,
           @use_bedrock, @allowed_agent_types, @created_at, @updated_at)`
      )
      .run(spaceToDatabase(space));
  }

  async update(space: Space): Promise<void> {
    const row = spaceToDatabase(space);
    this.db
      .prepare(
        `UPDATE spaces SET name = @name, slug = @slug, description = @description,
           color = @color, claude_config_dir = @claude_config_dir, gh_config_dir = @gh_config_dir,
           git_author_name = @git_author_name, git_author_email = @git_author_email,
           aws_profile = @aws_profile, use_bedrock = @use_bedrock,
           allowed_agent_types = @allowed_agent_types, updated_at = @updated_at
         WHERE id = @id`
      )
      .run({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        color: row.color,
        claude_config_dir: row.claude_config_dir,
        gh_config_dir: row.gh_config_dir,
        git_author_name: row.git_author_name,
        git_author_email: row.git_author_email,
        aws_profile: row.aws_profile,
        use_bedrock: row.use_bedrock,
        allowed_agent_types: row.allowed_agent_types,
        updated_at: row.updated_at,
      });
  }

  async setDefault(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .transaction(() => {
        this.db
          .prepare(
            'UPDATE spaces SET is_default = 0, updated_at = ? WHERE is_default = 1 AND id <> ?'
          )
          .run(now, id);
        this.db
          .prepare('UPDATE spaces SET is_default = 1, updated_at = ? WHERE id = ?')
          .run(now, id);
      })
      .immediate();
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
  }
}
