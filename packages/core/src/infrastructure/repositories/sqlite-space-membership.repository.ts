/**
 * SQLite Space Membership Repository (spec 120).
 *
 * Space rules and explicit repository assignments. Assignment paths are
 * normalised on write by the mapper and on lookup here, so the primary key is
 * compared directly (no function around the column).
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ISpaceMembershipRepository } from '../../application/ports/output/repositories/space-membership-repository.interface.js';
import type { RepositorySpaceAssignment, SpaceRule } from '../../domain/generated/output.js';
import { normalizeRepositoryPath } from '../../domain/shared/repository-path.js';
import {
  assignmentFromDatabase,
  assignmentToDatabase,
  spaceRuleFromDatabase,
  spaceRuleToDatabase,
  type RepositorySpaceAssignmentRow,
  type SpaceRuleRow,
} from '../persistence/sqlite/mappers/space.mapper.js';

const RULE_ORDER = 'ORDER BY priority ASC, created_at ASC, id ASC';

@injectable()
export class SQLiteSpaceMembershipRepository implements ISpaceMembershipRepository {
  constructor(private readonly db: Database.Database) {}

  async listRules(spaceId?: string): Promise<SpaceRule[]> {
    const rows = (
      spaceId
        ? this.db.prepare(`SELECT * FROM space_rules WHERE space_id = ? ${RULE_ORDER}`).all(spaceId)
        : this.db.prepare(`SELECT * FROM space_rules ${RULE_ORDER}`).all()
    ) as SpaceRuleRow[];
    return rows.map(spaceRuleFromDatabase);
  }

  async findRuleById(id: string): Promise<SpaceRule | null> {
    const row = this.db.prepare('SELECT * FROM space_rules WHERE id = ?').get(id) as
      | SpaceRuleRow
      | undefined;
    return row ? spaceRuleFromDatabase(row) : null;
  }

  async createRule(rule: SpaceRule): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO space_rules (id, space_id, product_line_id, kind, pattern, priority, created_at, updated_at)
         VALUES (@id, @space_id, @product_line_id, @kind, @pattern, @priority, @created_at, @updated_at)`
      )
      .run(spaceRuleToDatabase(rule));
  }

  async deleteRule(id: string): Promise<void> {
    this.db.prepare('DELETE FROM space_rules WHERE id = ?').run(id);
  }

  async deleteRulesForSpace(spaceId: string): Promise<void> {
    this.db.prepare('DELETE FROM space_rules WHERE space_id = ?').run(spaceId);
  }

  async findAssignment(repositoryPath: string): Promise<RepositorySpaceAssignment | null> {
    const row = this.db
      .prepare('SELECT * FROM repository_space_assignments WHERE repository_path = ?')
      .get(normalizeRepositoryPath(repositoryPath)) as RepositorySpaceAssignmentRow | undefined;
    return row ? assignmentFromDatabase(row) : null;
  }

  async listAssignments(spaceId?: string): Promise<RepositorySpaceAssignment[]> {
    const rows = (
      spaceId
        ? this.db
            .prepare(
              'SELECT * FROM repository_space_assignments WHERE space_id = ? ORDER BY repository_path ASC'
            )
            .all(spaceId)
        : this.db
            .prepare('SELECT * FROM repository_space_assignments ORDER BY repository_path ASC')
            .all()
    ) as RepositorySpaceAssignmentRow[];
    return rows.map(assignmentFromDatabase);
  }

  async upsertAssignment(assignment: RepositorySpaceAssignment): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO repository_space_assignments (repository_path, space_id, product_line_id, created_at, updated_at)
         VALUES (@repository_path, @space_id, @product_line_id, @created_at, @updated_at)
         ON CONFLICT (repository_path) DO UPDATE SET
           space_id = excluded.space_id,
           product_line_id = excluded.product_line_id,
           updated_at = excluded.updated_at`
      )
      .run(assignmentToDatabase(assignment));
  }

  async deleteAssignment(repositoryPath: string): Promise<void> {
    this.db
      .prepare('DELETE FROM repository_space_assignments WHERE repository_path = ?')
      .run(normalizeRepositoryPath(repositoryPath));
  }

  async deleteAssignmentsForSpace(spaceId: string): Promise<void> {
    this.db.prepare('DELETE FROM repository_space_assignments WHERE space_id = ?').run(spaceId);
  }

  async clearProductLine(productLineId: string): Promise<void> {
    const now = Date.now();
    this.db
      .transaction(() => {
        this.db
          .prepare(
            'UPDATE space_rules SET product_line_id = NULL, updated_at = ? WHERE product_line_id = ?'
          )
          .run(now, productLineId);
        this.db
          .prepare(
            'UPDATE repository_space_assignments SET product_line_id = NULL, updated_at = ? WHERE product_line_id = ?'
          )
          .run(now, productLineId);
      })
      .immediate();
  }
}
