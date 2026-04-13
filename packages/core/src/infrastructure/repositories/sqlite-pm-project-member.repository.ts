import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmProjectMemberRepository } from '../../application/ports/output/repositories/pm-project-member-repository.interface.js';
import type { PmProjectMember, ProjectRole } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmProjectMemberRow,
} from '../persistence/sqlite/mappers/pm-project-member.mapper.js';

@injectable()
export class SQLitePmProjectMemberRepository implements IPmProjectMemberRepository {
  constructor(private readonly db: Database.Database) {}

  async create(member: PmProjectMember): Promise<void> {
    const row = toDatabase(member);
    const stmt = this.db.prepare(`
      INSERT INTO pm_project_members (
        id, project_id, user_id, role,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @user_id, @role,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findByProjectAndUser(projectId: string, userId: string): Promise<PmProjectMember | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_project_members WHERE project_id = ? AND user_id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(projectId, userId) as PmProjectMemberRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<PmProjectMember[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_project_members WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all(projectId) as PmProjectMemberRow[];
    return rows.map(fromDatabase);
  }

  async listByUser(userId: string): Promise<PmProjectMember[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_project_members WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all(userId) as PmProjectMemberRow[];
    return rows.map(fromDatabase);
  }

  async updateRole(id: string, role: ProjectRole): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_project_members SET role = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    );
    stmt.run(role, now, id);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE pm_project_members SET deleted_at = ? WHERE id = ?');
    stmt.run(now, id);
  }

  async countAdmins(projectId: string): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM pm_project_members WHERE project_id = ? AND role = 'Admin' AND deleted_at IS NULL"
    );
    const result = stmt.get(projectId) as { count: number };
    return result.count;
  }
}
