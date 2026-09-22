/**
 * Feature Repository Interface
 *
 * Output port for Feature persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type {
  AgentRunStatus,
  Feature,
  SdlcLifecycle,
} from '../../../../domain/generated/output.js';

/**
 * Filters for listing features.
 */
export interface FeatureListFilters {
  repositoryPath?: string;
  lifecycle?: SdlcLifecycle;
  /** When true, include soft-deleted features in results. Default: false. */
  includeDeleted?: boolean;
  /** When true, include archived features in results. Default: false. */
  includeArchived?: boolean;
}

/**
 * The conditions a start claim must still hold when it reaches the database.
 *
 * Admission is a read-then-write — "is there a free slot / is this feature
 * still queued?" followed by "take it" — and between those two halves another
 * process can admit the same feature or fill the last slot. Every condition
 * here is therefore evaluated INSIDE the write, so the answer and the action
 * cannot be separated.
 */
/** Refinements to {@link IFeatureRepository.countByLifecycles}. */
export interface CountByLifecyclesOptions {
  /**
   * Do not count a feature whose current agent run (`features.agent_run_id`)
   * has one of these statuses. A worker that died or was stopped leaves the
   * lifecycle in a running phase; its run's status is what says nothing is
   * working on it any more. A feature with no run recorded is still counted.
   */
  releasingRunStatuses?: readonly AgentRunStatus[];
}

export interface FeatureStartClaim {
  /** The feature to claim. */
  featureId: string;
  /** Lifecycle the feature moves to when the claim is won. */
  targetLifecycle: SdlcLifecycle;
  /** Stamp written to `updatedAt` by the winning claim. */
  updatedAt: Date;
  /**
   * Require the row to still carry its queue marker.
   *
   * This is what stops two drains from admitting the same queued feature:
   * the first claim clears `queuedAt`, so the second finds nothing to claim.
   */
  requireQueued?: boolean;
  /**
   * Require the row to still be in this lifecycle.
   *
   * The manual start path uses it: a feature another process already started
   * is no longer Pending, and must not be started a second time.
   */
  requireLifecycle?: SdlcLifecycle;
  /**
   * Require the row to still point at this agent run.
   *
   * Resume uses it: two resumes of one feature both read the same finished
   * run, and only the first may replace it — the second finds the pointer
   * already moved and claims nothing.
   */
  requireAgentRunId?: string;
  /**
   * Point the feature at this agent run in the same statement. A feature whose
   * current run is live occupies a slot, so switching to the new run IS taking
   * the slot, and must not be a separate write.
   */
  agentRunId?: string;
  /**
   * Enforce the parallel-feature cap as part of the same statement.
   *
   * The count is still DERIVED (see IFeatureRepository.countByLifecycles) —
   * what changes is that it is derived in the same statement as the write it
   * authorises, instead of in an earlier, separate one.
   */
  capacity?: {
    /** Configured limit. 0 (unlimited) skips the check. */
    limit: number;
    /** Lifecycles that occupy a slot. */
    runningLifecycles: readonly SdlcLifecycle[];
    /**
     * Statuses of a feature's current agent run that release its slot even
     * though its lifecycle is still a running one (see
     * {@link CountByLifecyclesOptions.releasingRunStatuses}).
     */
    releasingRunStatuses?: readonly AgentRunStatus[];
  };
}

/**
 * Repository interface for Feature entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Support query by slug + repositoryPath for uniqueness
 * - Exclude soft-deleted features from queries by default
 */
export interface IFeatureRepository {
  /**
   * Create a new feature record.
   *
   * @param feature - The feature to persist
   */
  create(feature: Feature): Promise<void>;

  /**
   * Find a feature by its unique ID (excludes soft-deleted).
   *
   * @param id - The feature ID
   * @returns The feature or null if not found
   */
  findById(id: string): Promise<Feature | null>;

  /**
   * Find a feature by an ID prefix (e.g. first 8 chars from `feat ls`).
   * Excludes soft-deleted features.
   *
   * @param prefix - A prefix of the feature UUID
   * @returns The feature if exactly one match, null if none, throws if ambiguous
   */
  findByIdPrefix(prefix: string): Promise<Feature | null>;

  /**
   * Find a feature by its slug within a repository (excludes soft-deleted).
   *
   * @param slug - The URL-friendly feature identifier
   * @param repositoryPath - The repository path to scope the search
   * @returns The feature or null if not found
   */
  findBySlug(slug: string, repositoryPath: string): Promise<Feature | null>;

  /**
   * Find a feature by its branch name within a repository (excludes soft-deleted).
   *
   * Used for duplicate adoption detection — ensures a branch is not already
   * tracked as a feature before adopting it.
   *
   * @param branch - The exact git branch name
   * @param repositoryPath - The repository path to scope the search
   * @returns The feature or null if not found
   */
  findByBranch(branch: string, repositoryPath: string): Promise<Feature | null>;

  /**
   * List features with optional filters.
   * Excludes soft-deleted features unless includeDeleted is true.
   *
   * @param filters - Optional filters for repositoryPath, lifecycle, and includeDeleted
   * @returns Array of matching features
   */
  list(filters?: FeatureListFilters): Promise<Feature[]>;

  /**
   * Update an existing feature.
   *
   * @param feature - The feature with updated fields
   */
  update(feature: Feature): Promise<void>;

  /**
   * Returns all direct (non-recursive) children of the given parent feature ID.
   * Children are ordered by creation time ascending.
   * Includes children regardless of soft-delete status (for cascade operations).
   *
   * @param parentId - The parent feature ID
   * @returns Array of direct child features
   */
  findByParentId(parentId: string): Promise<Feature[]>;

  /**
   * Count non-deleted features currently in any of the given lifecycles.
   *
   * Exists so parallel-capacity admission can ask "how many features are
   * running" without loading every feature into the process. The count is
   * derived rather than tracked precisely because a derived count is
   * self-healing: a crashed or force-deleted feature stops being counted the
   * moment its row changes, whereas a maintained counter would leak that slot
   * forever.
   *
   * @param lifecycles - The lifecycles to count. An empty array counts nothing.
   * @param options - Optionally exclude features whose current run has finished
   * @returns Number of matching, non-soft-deleted features
   */
  countByLifecycles(
    lifecycles: SdlcLifecycle[],
    options?: CountByLifecyclesOptions
  ): Promise<number>;

  /**
   * Returns features waiting for a parallel-capacity slot, oldest first.
   *
   * A feature is queued exactly when it carries a `queuedAt` timestamp; the
   * lifecycle alone cannot say so, because a user-deferred (`--pending`)
   * feature sits in the same lifecycle and must never be started automatically.
   * Ordered by `queuedAt` so the queue is FIFO by when the user asked for the
   * feature to run.
   *
   * @returns Queued features in admission order, excluding soft-deleted rows
   */
  listQueued(): Promise<Feature[]>;

  /**
   * Atomically claim a feature for starting.
   *
   * Clears the queue marker and moves the feature into its target lifecycle,
   * but ONLY while every condition in the claim still holds. The caller may
   * spawn an agent exactly when this returns true — an unconditional update
   * followed by a spawn lets two processes put two detached workers in one
   * git worktree, sharing one agent run and one log file.
   *
   * @param claim - What must still be true at the moment of the write
   * @returns True when this call performed the write and owns the spawn
   */
  claimForStart(claim: FeatureStartClaim): Promise<boolean>;

  /**
   * Delete a feature by ID (hard delete).
   *
   * @param id - The feature ID to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Soft-delete a feature by setting deletedAt timestamp.
   *
   * @param id - The feature ID to soft-delete
   */
  softDelete(id: string): Promise<void>;
}
