/**
 * SQLite Product Line Repository (spec 120). Implements IProductLineRepository.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IProductLineRepository } from '../../application/ports/output/repositories/product-line-repository.interface.js';
import type { ProductLine } from '../../domain/generated/output.js';
import {
  productLineFromDatabase,
  productLineToDatabase,
  type ProductLineRow,
} from '../persistence/sqlite/mappers/space.mapper.js';

@injectable()
export class SQLiteProductLineRepository implements IProductLineRepository {
  constructor(private readonly db: Database.Database) {}

  async listAll(): Promise<ProductLine[]> {
    const rows = this.db
      .prepare('SELECT * FROM product_lines ORDER BY space_id ASC, name COLLATE NOCASE ASC')
      .all() as ProductLineRow[];
    return rows.map(productLineFromDatabase);
  }

  async listBySpace(spaceId: string): Promise<ProductLine[]> {
    const rows = this.db
      .prepare('SELECT * FROM product_lines WHERE space_id = ? ORDER BY name COLLATE NOCASE ASC')
      .all(spaceId) as ProductLineRow[];
    return rows.map(productLineFromDatabase);
  }

  async findById(id: string): Promise<ProductLine | null> {
    const row = this.db.prepare('SELECT * FROM product_lines WHERE id = ?').get(id) as
      | ProductLineRow
      | undefined;
    return row ? productLineFromDatabase(row) : null;
  }

  async findBySlug(spaceId: string, slug: string): Promise<ProductLine | null> {
    const row = this.db
      .prepare('SELECT * FROM product_lines WHERE space_id = ? AND slug = ?')
      .get(spaceId, slug) as ProductLineRow | undefined;
    return row ? productLineFromDatabase(row) : null;
  }

  async create(line: ProductLine): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO product_lines (id, space_id, name, slug, description, created_at, updated_at)
         VALUES (@id, @space_id, @name, @slug, @description, @created_at, @updated_at)`
      )
      .run(productLineToDatabase(line));
  }

  async update(line: ProductLine): Promise<void> {
    const row = productLineToDatabase(line);
    this.db
      .prepare(
        `UPDATE product_lines SET name = @name, slug = @slug, description = @description,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        updated_at: row.updated_at,
      });
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM product_lines WHERE id = ?').run(id);
  }

  async deleteBySpace(spaceId: string): Promise<void> {
    this.db.prepare('DELETE FROM product_lines WHERE space_id = ?').run(spaceId);
  }
}
