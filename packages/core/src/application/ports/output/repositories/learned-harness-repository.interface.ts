/**
 * Learned Harness Repository Interface (Output Port, spec 150)
 *
 * Persists learned-harness versions, the edit records written by reflection,
 * and the lessons later refinements read. Every read is scoped (repository,
 * product line, space) with the same isolation as Shep Brain: nothing ever
 * crosses a space.
 */

import type {
  HarnessEditRecord,
  HarnessLesson,
  LearnedHarnessStatus,
  LearnedHarnessVersion,
} from '../../../../domain/generated/output.js';

/** Where a run happens: its repository and, when it has them, its space and product line. */
export interface HarnessScopeKey {
  /** Normalised repository path. */
  repositoryPath: string;
  spaceId?: string;
  productLineId?: string;
}

export interface ILearnedHarnessRepository {
  /** Insert a version (id and timestamps set by the caller). */
  createVersion(version: LearnedHarnessVersion): Promise<void>;

  findVersion(id: string): Promise<LearnedHarnessVersion | null>;

  /** Versions whose id starts with `prefix`, at most `limit` of them. */
  findVersionsByIdPrefix(prefix: string, limit: number): Promise<LearnedHarnessVersion[]>;

  /** Versions learned in one repository, newest first. */
  listVersions(repositoryPath: string, limit?: number): Promise<LearnedHarnessVersion[]>;

  /**
   * The adopted version that applies to a run in this scope: the repository's
   * own (Project) version first, then its product line's, then its space's.
   * Null when nothing is adopted — the run uses no learned overlay.
   */
  findAdopted(scope: HarnessScopeKey): Promise<LearnedHarnessVersion | null>;

  /**
   * Adopt a version in one transaction: the version currently adopted at the
   * same scope placement becomes Superseded, this one Adopted.
   */
  adopt(id: string): Promise<void>;

  /** Set a version's status (and optional reason), bumping updatedAt. */
  updateStatus(id: string, status: LearnedHarnessStatus, reason?: string): Promise<void>;

  /** Insert edit records written by one reflection. */
  createEditRecords(records: HarnessEditRecord[]): Promise<void>;

  listEditRecords(versionId: string): Promise<HarnessEditRecord[]>;

  createLesson(lesson: HarnessLesson): Promise<void>;

  /** Lessons reaching this scope (repository, product line, space), newest first. */
  listLessons(scope: HarnessScopeKey): Promise<HarnessLesson[]>;
}
