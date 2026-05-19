/**
 * SecurityFinding Repository Interface (Output Port)
 *
 * Feature 098, phase 3 (SecurityFinding Entity + SARIF Ingestion). The
 * repository is the only persistence boundary for findings — use cases
 * resolve this port from the DI container and never touch SQLite directly.
 *
 * Conventions:
 *  - Soft-delete by default (NFR-12); listing/finding excludes deleted rows.
 *  - `list` takes a FindingFilter value object so the same primitive serves
 *    the rank/list/campaign-progress use cases (research decision 9).
 *  - `bulkInsertOrIgnore` is wrapped in a single SQLite transaction by the
 *    implementation so ingestion is atomic (NFR-6 / FR-8).
 */

import type {
  FindingFilter,
  FindingState,
  SecurityFinding,
} from '../../../../domain/generated/output.js';

export interface ListFindingsCursor {
  /** Zero-based page offset. */
  offset: number;
  /** Page size. */
  limit: number;
}

export interface ListFindingsResult {
  items: SecurityFinding[];
  total: number;
}

export interface FindingUpdateInput {
  state?: FindingState;
  ownerId?: string;
  currentRiskScoreId?: string;
  workItemId?: string;
  lastSeenAt?: Date;
  firstFixedAt?: Date;
}

export interface IFindingRepository {
  /** Insert a single finding. */
  create(finding: SecurityFinding): Promise<void>;

  /**
   * Insert many findings under a single transaction, ignoring rows that
   * collide with the dedup unique index. Returns the count of rows that
   * actually landed (vs. were ignored as duplicates).
   */
  bulkInsertOrIgnore(
    findings: SecurityFinding[]
  ): Promise<{ inserted: number; duplicates: number }>;

  /** Find a finding by id (excludes soft-deleted). */
  findById(id: string): Promise<SecurityFinding | null>;

  /** Paged + filterable list with total count. */
  list(filter: FindingFilter, cursor: ListFindingsCursor): Promise<ListFindingsResult>;

  /** Count rows matching a filter (without paging). */
  count(filter: FindingFilter): Promise<number>;

  /** Partial update by id. */
  update(id: string, fields: FindingUpdateInput): Promise<void>;

  /** Soft-delete the finding. */
  softDelete(id: string): Promise<void>;
}
