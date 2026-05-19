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
  CanonicalSeverity,
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

/**
 * Aggregate row used by posture summary / application-posture / risk trend.
 * The repository computes these in SQL so dashboards meet NFR-7 (<1s on 50k).
 */
export interface SeverityCount {
  severity: CanonicalSeverity;
  count: number;
}

/** Top at-risk applications, ordered by descending current-risk-score sum. */
export interface AtRiskApplication {
  applicationId: string;
  openFindingCount: number;
  riskScoreSum: number;
}

/**
 * SLA-breach threshold per severity supplied by the caller (derived from
 * the active SecurityPolicy). Findings with discoveredAt ≤ `now -
 * windowDays days` are considered Breached for the count.
 */
export interface SlaBreachThreshold {
  severity: CanonicalSeverity;
  windowDays: number;
}

/** A single time-bucketed posture sample for the risk-trend chart. */
export interface PostureTrendBucket {
  /** Inclusive start of the bucket. */
  bucketStart: Date;
  /** Open finding counts per canonical severity within the bucket. */
  countsBySeverity: SeverityCount[];
}

/**
 * A finding alongside its current risk-score total. `riskScoreTotal` is
 * `null` when no RiskScore row has been computed yet — used by
 * `rank-findings` to order findings by composite risk (NFR-8).
 */
export interface RankedFinding {
  finding: SecurityFinding;
  riskScoreTotal: number | null;
}

export interface ListRankedFindingsResult {
  items: RankedFinding[];
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

  /**
   * Resolve the canonical finding id for a dedup tuple. Used after
   * {@link bulkInsertOrIgnore} so callers can attach side-effects
   * (compliance control links, AI signal graduations) to whichever id
   * survived deduplication — the one we just inserted, OR the prior row
   * if it was a duplicate. Returns null when the tuple has never been
   * observed.
   *
   * The query rides the `idx_security_findings_dedup_unique` partial
   * unique index (migration 108).
   */
  findIdByDedupTuple(input: {
    applicationId: string;
    findingDomain: string;
    ruleId: string;
    locationPath?: string;
    locationLine?: number;
    cveId?: string;
  }): Promise<string | null>;

  /** Paged + filterable list with total count. */
  list(filter: FindingFilter, cursor: ListFindingsCursor): Promise<ListFindingsResult>;

  /**
   * Paged + filterable list joined with the latest risk_scores row, ordered
   * by `risk_scores.total` descending. Findings without a current risk
   * score sort last and report `riskScoreTotal: null`.
   *
   * NFR-8: must return in <300ms on a 50k-finding dataset by joining via
   * the `current_risk_score_id` pointer rather than a window function.
   */
  listRanked(filter: FindingFilter, cursor: ListFindingsCursor): Promise<ListRankedFindingsResult>;

  /** Count rows matching a filter (without paging). */
  count(filter: FindingFilter): Promise<number>;

  /** Partial update by id. */
  update(id: string, fields: FindingUpdateInput): Promise<void>;

  /** Soft-delete the finding. */
  softDelete(id: string): Promise<void>;

  // ──────────────────────────────────────────────────────────────────────
  // Aggregate / posture helpers (feature 098, phase 7, task-40 / task-41)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Count open findings grouped by canonical severity. Open is the union
   * of {@link FindingState.Open} / Triaged / InProgress. Optional filter
   * narrows by application or other axes.
   */
  countOpenBySeverity(filter?: FindingFilter): Promise<SeverityCount[]>;

  /**
   * Top-N applications ordered by descending sum of `risk_scores.total`
   * over their open findings. Used by the dashboard's at-risk apps tile.
   */
  topAtRiskApplications(limit: number): Promise<AtRiskApplication[]>;

  /**
   * Count open findings whose CVE is KEV-listed (NFR-7 budget).
   */
  countOpenKev(): Promise<number>;

  /**
   * Count open findings whose `discoveredAt` is more than the policy
   * window for their severity ago (i.e. SLA-Breached). Findings with an
   * active exception are excluded by passing their ids in
   * `excludeFindingIds`.
   */
  countSlaBreached(
    thresholds: SlaBreachThreshold[],
    now: Date,
    excludeFindingIds?: readonly string[]
  ): Promise<number>;

  /** Most-recent `lastSeenAt` across all findings, or null when empty. */
  latestLastSeenAt(): Promise<Date | null>;

  /**
   * Per-application open-finding counts grouped by canonical severity.
   * Used by {@link GetApplicationPostureUseCase} to render top-N
   * application cards.
   */
  countOpenBySeverityForApplication(applicationId: string): Promise<SeverityCount[]>;

  /**
   * Time-bucketed open-finding counts derived from `discovered_at`. Each
   * sample is the count of findings whose `discovered_at < bucketStart`
   * and whose `first_fixed_at` is null or `>= bucketStart` (i.e. open at
   * that instant). Buckets are daily-aligned UTC starts.
   */
  postureTrend(buckets: readonly Date[]): Promise<PostureTrendBucket[]>;
}
