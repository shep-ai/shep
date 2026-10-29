/**
 * SQLite learned-harness repository (spec 150).
 *
 * Implements ILearnedHarnessRepository over learned_harness_versions,
 * learned_harness_edits and learned_harness_lessons (migration 176).
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  HarnessScopeKey,
  ILearnedHarnessRepository,
} from '../../application/ports/output/repositories/learned-harness-repository.interface.js';
import {
  LearnedHarnessStatus,
  MemoryScope,
  type HarnessEditRecord,
  type HarnessLesson,
  type LearnedHarnessVersion,
} from '../../domain/generated/output.js';
import {
  editFromRow,
  editToRow,
  lessonFromRow,
  lessonToRow,
  versionFromRow,
  versionToRow,
  type HarnessEditRow,
  type HarnessLessonRow,
  type LearnedHarnessVersionRow,
} from '../persistence/sqlite/mappers/learned-harness.mapper.js';

const DEFAULT_LIST_LIMIT = 100;

/** The column that identifies a version's placement for its scope. */
const PLACEMENT_COLUMN: Readonly<Record<MemoryScope, string>> = {
  [MemoryScope.Project]: 'repository_path',
  [MemoryScope.ProductLine]: 'product_line_id',
  [MemoryScope.Space]: 'space_id',
  [MemoryScope.Organization]: 'space_id',
};

@injectable()
export class SQLiteLearnedHarnessRepository implements ILearnedHarnessRepository {
  constructor(private readonly db: Database.Database) {}

  async createVersion(version: LearnedHarnessVersion): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO learned_harness_versions (
          id, scope, repository_path, space_id, product_line_id, parent_version_id, status,
          origin, components, notes, source_feature_id, refinement_run_id, status_reason,
          created_at, updated_at
        ) VALUES (
          @id, @scope, @repository_path, @space_id, @product_line_id, @parent_version_id, @status,
          @origin, @components, @notes, @source_feature_id, @refinement_run_id, @status_reason,
          @created_at, @updated_at
        )`
      )
      .run(versionToRow(version));
  }

  async findVersion(id: string): Promise<LearnedHarnessVersion | null> {
    const row = this.db.prepare('SELECT * FROM learned_harness_versions WHERE id = ?').get(id) as
      | LearnedHarnessVersionRow
      | undefined;
    return row ? versionFromRow(row) : null;
  }

  async listVersions(
    repositoryPath: string,
    limit = DEFAULT_LIST_LIMIT
  ): Promise<LearnedHarnessVersion[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM learned_harness_versions WHERE repository_path = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(repositoryPath, limit) as LearnedHarnessVersionRow[];
    return rows.map(versionFromRow);
  }

  async findAdopted(scope: HarnessScopeKey): Promise<LearnedHarnessVersion | null> {
    const candidates: [MemoryScope, string | undefined][] = [
      [MemoryScope.Project, scope.repositoryPath],
      [MemoryScope.ProductLine, scope.productLineId],
      [MemoryScope.Space, scope.spaceId],
    ];
    for (const [memoryScope, value] of candidates) {
      if (!value) continue;
      const row = this.db
        .prepare(
          `SELECT * FROM learned_harness_versions
           WHERE scope = ? AND ${PLACEMENT_COLUMN[memoryScope]} = ? AND status = ?
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(memoryScope, value, LearnedHarnessStatus.Adopted) as
        | LearnedHarnessVersionRow
        | undefined;
      if (row) return versionFromRow(row);
    }
    return null;
  }

  async adopt(id: string): Promise<void> {
    const adopt = this.db.transaction((versionId: string) => {
      const row = this.db
        .prepare('SELECT * FROM learned_harness_versions WHERE id = ?')
        .get(versionId) as LearnedHarnessVersionRow | undefined;
      if (!row) throw new Error(`learned harness version ${versionId} not found`);
      const column = PLACEMENT_COLUMN[row.scope as MemoryScope];
      const placement = row[column as keyof LearnedHarnessVersionRow];
      const now = Date.now();
      this.db
        .prepare(
          `UPDATE learned_harness_versions SET status = ?, updated_at = ?
           WHERE scope = ? AND ${column} = ? AND status = ? AND id != ?`
        )
        .run(
          LearnedHarnessStatus.Superseded,
          now,
          row.scope,
          placement,
          LearnedHarnessStatus.Adopted,
          versionId
        );
      this.db
        .prepare('UPDATE learned_harness_versions SET status = ?, updated_at = ? WHERE id = ?')
        .run(LearnedHarnessStatus.Adopted, now, versionId);
    });
    adopt(id);
  }

  async updateStatus(id: string, status: LearnedHarnessStatus, reason?: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE learned_harness_versions
         SET status = ?, status_reason = COALESCE(?, status_reason), updated_at = ? WHERE id = ?`
      )
      .run(status, reason ?? null, Date.now(), id);
  }

  async createEditRecords(records: HarnessEditRecord[]): Promise<void> {
    const insert = this.db.prepare(
      `INSERT INTO learned_harness_edits (
        id, version_id, refinement_run_id, dimension, component_path, change, observed,
        verdict, created_at, updated_at
      ) VALUES (
        @id, @version_id, @refinement_run_id, @dimension, @component_path, @change, @observed,
        @verdict, @created_at, @updated_at
      )`
    );
    this.db.transaction((rows: HarnessEditRecord[]) => {
      for (const record of rows) insert.run(editToRow(record));
    })(records);
  }

  async listEditRecords(versionId: string): Promise<HarnessEditRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM learned_harness_edits WHERE version_id = ? ORDER BY created_at, id')
      .all(versionId) as HarnessEditRow[];
    return rows.map(editFromRow);
  }

  async createLesson(lesson: HarnessLesson): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO learned_harness_lessons (
          id, scope, repository_path, space_id, product_line_id, cue, lesson, evidence,
          confidence, source_feature_id, version_id, created_at, updated_at
        ) VALUES (
          @id, @scope, @repository_path, @space_id, @product_line_id, @cue, @lesson, @evidence,
          @confidence, @source_feature_id, @version_id, @created_at, @updated_at
        )`
      )
      .run(lessonToRow(lesson));
  }

  async listLessons(scope: HarnessScopeKey): Promise<HarnessLesson[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM learned_harness_lessons
         WHERE (scope = @project AND repository_path = @repositoryPath)
            OR (scope = @productLine AND product_line_id = @productLineId)
            OR (scope IN (@space, @organization) AND space_id = @spaceId)
         ORDER BY created_at DESC, id DESC`
      )
      .all({
        project: MemoryScope.Project,
        productLine: MemoryScope.ProductLine,
        space: MemoryScope.Space,
        organization: MemoryScope.Organization,
        repositoryPath: scope.repositoryPath,
        productLineId: scope.productLineId ?? null,
        spaceId: scope.spaceId ?? null,
      }) as HarnessLessonRow[];
    return rows.map(lessonFromRow);
  }
}
