/**
 * SQLite Fleet Repository
 *
 * Infrastructure adapter implementing {@link IFleetRepository} (spec 111).
 *
 * Every count is derived at query time from the existing `features`,
 * `agent_runs`, and `agent_questions` tables rather than maintained as a
 * mutable counter, so a crashed process can never leave a stale fleet state
 * behind. The composite indexes added by migration 143 keep the aggregates
 * inside the interactive budget described in the research artifact.
 *
 * Read-model only: this repository performs no writes and owns no state.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IFleetRepository,
  FleetTriageFilters,
} from '../../application/ports/output/repositories/fleet-repository.interface.js';
import {
  type FleetOverview,
  type FleetTriageItem,
  FleetTriagePriority,
  FleetTriageCategory,
  GuardrailGateType,
  AgentRunStatus,
  SdlcLifecycle,
  CiStatus,
  AgentQuestionKind,
  AgentQuestionStatus,
} from '../../domain/generated/output.js';

/** Rolling window used by the circuit breaker when no override is supplied. */
const DEFAULT_WINDOW_MINUTES = 15;

/** A `running` agent older than this is reported as a P3 advisory warning. */
const STALLED_RUN_THRESHOLD_MINUTES = 45;

/**
 * A run left in `waiting_approval` stores `node:<gate>` in `result`
 * (see `feature-agent-worker.ts`), which is how the feed recovers which
 * lifecycle gate a feature is parked on.
 */
const INTERRUPT_NODE_PREFIX = 'node:';

const MILLIS_PER_MINUTE = 60_000;

/** Statuses that represent a terminal, unsuccessful run. */
const FAILURE_STATUSES: AgentRunStatus[] = [AgentRunStatus.failed, AgentRunStatus.interrupted];

/** Lifecycles that are still part of the active fleet. */
const EXCLUDED_LIFECYCLES: SdlcLifecycle[] = [SdlcLifecycle.Archived];

interface FeatureRunRow {
  feature_id: string;
  feature_name: string;
  slug: string;
  worktree_path: string | null;
  run_id: string;
  run_result: string | null;
  created_at: number;
}

interface QuestionRow {
  feature_id: string;
  feature_name: string;
  slug: string;
  worktree_path: string | null;
  run_id: string;
  prompt: string;
  created_at: number;
}

interface FeatureIssueRow {
  feature_id: string;
  feature_name: string;
  slug: string;
  worktree_path: string | null;
  run_id: string | null;
  detail: string | null;
  created_at: number;
}

interface CountRow {
  total: number;
  queued: number;
  cruising: number;
  waiting_approval: number;
  failed: number;
}

/**
 * Normalizes a path to forward slashes so Windows and Unix spellings of the
 * same repository compare equal.
 */
function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * SQLite has no portable backslash literal; `char(92)` renders one on every
 * platform, which keeps the stored path comparison separator-agnostic.
 */
const NORMALIZED_REPO_PATH = "REPLACE(f.repository_path, char(92), '/')";

function toIsoString(epochMillis: number): string {
  return new Date(epochMillis).toISOString();
}

/**
 * Recovers the lifecycle gate from an interrupt marker such as `node:plan`.
 * Returns `undefined` for runs that are not parked on a known gate.
 */
function gateTypeFromRunResult(result: string | null): string | undefined {
  if (!result?.startsWith(INTERRUPT_NODE_PREFIX)) return undefined;
  const node = result.slice(INTERRUPT_NODE_PREFIX.length);
  return (Object.values(GuardrailGateType) as string[]).includes(node) ? node : undefined;
}

function compareTriageItems(a: FleetTriageItem, b: FleetTriageItem): number {
  const rank: Record<FleetTriagePriority, number> = {
    [FleetTriagePriority.p1]: 1,
    [FleetTriagePriority.p2]: 2,
    [FleetTriagePriority.p3]: 3,
  };
  const byPriority = (rank[a.priority] ?? 99) - (rank[b.priority] ?? 99);
  if (byPriority !== 0) return byPriority;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

@injectable()
export class SQLiteFleetRepository implements IFleetRepository {
  constructor(private readonly db: Database.Database) {}

  async getOverview(repositoryPath?: string): Promise<FleetOverview> {
    const scope = repositoryPath ? normalizePath(repositoryPath) : undefined;
    const scopeClause = scope ? ` AND ${NORMALIZED_REPO_PATH} = ?` : '';
    const scopeParams = scope ? [scope] : [];
    const excluded = EXCLUDED_LIFECYCLES.map(() => '?').join(', ');

    const counts = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN f.lifecycle = ? THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN r.status = ? THEN 1 ELSE 0 END) AS cruising,
          SUM(CASE WHEN r.status = ? THEN 1 ELSE 0 END) AS waiting_approval,
          SUM(CASE WHEN r.status IN (${FAILURE_STATUSES.map(() => '?').join(', ')}) THEN 1 ELSE 0 END) AS failed
        FROM features f
        LEFT JOIN agent_runs r ON r.id = f.agent_run_id
        WHERE f.deleted_at IS NULL
          AND f.lifecycle NOT IN (${excluded})
          ${scopeClause}
      `
      )
      .get(
        SdlcLifecycle.Pending,
        AgentRunStatus.running,
        AgentRunStatus.waitingApproval,
        ...FAILURE_STATUSES,
        ...EXCLUDED_LIFECYCLES,
        ...scopeParams
      ) as CountRow;

    const blockedQuestions = this.db
      .prepare(
        `
        SELECT COUNT(*) AS total
        FROM agent_questions q
        JOIN features f ON f.id = q.feature_id
        WHERE q.status = ?
          AND q.kind = ?
          AND f.deleted_at IS NULL
          AND f.lifecycle NOT IN (${excluded})
          ${scopeClause}
      `
      )
      .get(
        AgentQuestionStatus.pending,
        AgentQuestionKind.blocking,
        ...EXCLUDED_LIFECYCLES,
        ...scopeParams
      ) as { total: number };

    const triageItems = await this.listTriageItems(scope ? { repositoryPath: scope } : undefined);
    const attentionFeatureIds = new Set(triageItems.map((item) => item.featureId));

    const circular = {
      waitingApproval: counts.waiting_approval ?? 0,
      failed: counts.failed ?? 0,
      blockedQuestions: blockedQuestions.total,
    };

    return {
      counts: {
        total: counts.total ?? 0,
        cruising: counts.cruising ?? 0,
        queued: counts.queued ?? 0,
        attentionNeeded: attentionFeatureIds.size,
        failed: circular.failed,
        waitingApproval: circular.waitingApproval,
        blockedQuestions: circular.blockedQuestions,
      },
      activeTriageCount: triageItems.length,
      circuitBreakerTripped: false,
      consecutiveFailures: 0,
      timestamp: new Date().toISOString(),
    };
  }

  async listTriageItems(filters?: FleetTriageFilters): Promise<FleetTriageItem[]> {
    const scope = filters?.repositoryPath ? normalizePath(filters.repositoryPath) : undefined;
    const scopeClause = scope ? ` AND ${NORMALIZED_REPO_PATH} = ?` : '';
    const scopeParams = scope ? [scope] : [];
    const excluded = EXCLUDED_LIFECYCLES.map(() => '?').join(', ');
    const baseScope = `f.deleted_at IS NULL AND f.lifecycle NOT IN (${excluded})${scopeClause}`;

    const items: FleetTriageItem[] = [];

    // ── P1: parked on a lifecycle approval gate ──────────────────────────────
    const gateRows = this.db
      .prepare(
        `
        SELECT f.id AS feature_id, f.name AS feature_name, f.slug, f.worktree_path,
               r.id AS run_id, r.result AS run_result, r.updated_at AS created_at
        FROM features f
        JOIN agent_runs r ON r.id = f.agent_run_id
        WHERE ${baseScope} AND r.status = ?
      `
      )
      .all(
        ...EXCLUDED_LIFECYCLES,
        ...scopeParams,
        AgentRunStatus.waitingApproval
      ) as FeatureRunRow[];

    for (const row of gateRows) {
      const gateType = gateTypeFromRunResult(row.run_result);
      items.push({
        featureId: row.feature_id,
        featureName: row.feature_name,
        slug: row.slug,
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        reason: gateType
          ? `Waiting on the ${gateType} approval gate`
          : 'Waiting on an approval gate',
        runId: row.run_id,
        ...(gateType ? { gateType } : {}),
        ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
        createdAt: toIsoString(row.created_at),
      });
    }

    // ── P1: unanswered blocking question ─────────────────────────────────────
    const questionRows = this.db
      .prepare(
        `
        SELECT f.id AS feature_id, f.name AS feature_name, f.slug, f.worktree_path,
               q.agent_run_id AS run_id, q.prompt, q.created_at
        FROM agent_questions q
        JOIN features f ON f.id = q.feature_id
        WHERE ${baseScope} AND q.status = ? AND q.kind = ?
      `
      )
      .all(
        ...EXCLUDED_LIFECYCLES,
        ...scopeParams,
        AgentQuestionStatus.pending,
        AgentQuestionKind.blocking
      ) as QuestionRow[];

    for (const row of questionRows) {
      items.push({
        featureId: row.feature_id,
        featureName: row.feature_name,
        slug: row.slug,
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.question,
        reason: `Blocking question: ${row.prompt}`,
        runId: row.run_id,
        ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
        createdAt: toIsoString(row.created_at),
      });
    }

    // ── P2: terminal run failure / crash ─────────────────────────────────────
    const failureRows = this.db
      .prepare(
        `
        SELECT f.id AS feature_id, f.name AS feature_name, f.slug, f.worktree_path,
               r.id AS run_id, r.error AS detail, r.completed_at AS created_at
        FROM features f
        JOIN agent_runs r ON r.id = f.agent_run_id
        WHERE ${baseScope} AND r.status IN (${FAILURE_STATUSES.map(() => '?').join(', ')})
      `
      )
      .all(...EXCLUDED_LIFECYCLES, ...scopeParams, ...FAILURE_STATUSES) as FeatureIssueRow[];

    for (const row of failureRows) {
      items.push({
        featureId: row.feature_id,
        featureName: row.feature_name,
        slug: row.slug,
        priority: FleetTriagePriority.p2,
        category: FleetTriageCategory.crash,
        reason: row.detail ? `Agent run failed: ${row.detail}` : 'Agent run failed',
        ...(row.run_id ? { runId: row.run_id } : {}),
        ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
        createdAt: toIsoString(row.created_at ?? Date.now()),
      });
    }

    // ── P2: open PR that cannot be merged ────────────────────────────────────
    const conflictRows = this.db
      .prepare(
        `
        SELECT f.id AS feature_id, f.name AS feature_name, f.slug, f.worktree_path,
               f.agent_run_id AS run_id, f.pr_url AS detail, f.updated_at AS created_at
        FROM features f
        WHERE ${baseScope} AND f.pr_number IS NOT NULL AND f.pr_mergeable = 0
      `
      )
      .all(...EXCLUDED_LIFECYCLES, ...scopeParams) as FeatureIssueRow[];

    for (const row of conflictRows) {
      items.push({
        featureId: row.feature_id,
        featureName: row.feature_name,
        slug: row.slug,
        priority: FleetTriagePriority.p2,
        category: FleetTriageCategory.conflict,
        reason: 'Pull request has merge conflicts',
        ...(row.run_id ? { runId: row.run_id } : {}),
        ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
        createdAt: toIsoString(row.created_at),
      });
    }

    // ── P2: CI failed on the pull request ────────────────────────────────────
    const ciRows = this.db
      .prepare(
        `
        SELECT f.id AS feature_id, f.name AS feature_name, f.slug, f.worktree_path,
               f.agent_run_id AS run_id, f.pr_url AS detail, f.updated_at AS created_at
        FROM features f
        WHERE ${baseScope} AND f.pr_number IS NOT NULL AND f.ci_status = ?
      `
      )
      .all(...EXCLUDED_LIFECYCLES, ...scopeParams, CiStatus.Failure) as FeatureIssueRow[];

    for (const row of ciRows) {
      items.push({
        featureId: row.feature_id,
        featureName: row.feature_name,
        slug: row.slug,
        priority: FleetTriagePriority.p2,
        category: FleetTriageCategory.ci_failed,
        reason: 'CI is failing on the pull request',
        ...(row.run_id ? { runId: row.run_id } : {}),
        ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
        createdAt: toIsoString(row.created_at),
      });
    }

    // ── P3: advisory — a run that has been going for an unusually long time ──
    const stalledBefore = Date.now() - STALLED_RUN_THRESHOLD_MINUTES * MILLIS_PER_MINUTE;
    const stalledRows = this.db
      .prepare(
        `
        SELECT f.id AS feature_id, f.name AS feature_name, f.slug, f.worktree_path,
               r.id AS run_id, NULL AS detail, r.started_at AS created_at
        FROM features f
        JOIN agent_runs r ON r.id = f.agent_run_id
        WHERE ${baseScope} AND r.status = ? AND r.started_at IS NOT NULL AND r.started_at <= ?
      `
      )
      .all(
        ...EXCLUDED_LIFECYCLES,
        ...scopeParams,
        AgentRunStatus.running,
        stalledBefore
      ) as FeatureIssueRow[];

    for (const row of stalledRows) {
      items.push({
        featureId: row.feature_id,
        featureName: row.feature_name,
        slug: row.slug,
        priority: FleetTriagePriority.p3,
        category: FleetTriageCategory.warning,
        reason: `Agent run has been running for more than ${STALLED_RUN_THRESHOLD_MINUTES} minutes`,
        ...(row.run_id ? { runId: row.run_id } : {}),
        ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
        createdAt: toIsoString(row.created_at ?? Date.now()),
      });
    }

    const filtered = filters?.priority
      ? items.filter((item) => item.priority === filters.priority)
      : items;

    filtered.sort(compareTriageItems);

    return typeof filters?.limit === 'number' ? filtered.slice(0, filters.limit) : filtered;
  }

  async getConsecutiveFailures(windowMinutes = DEFAULT_WINDOW_MINUTES): Promise<number> {
    const since = Date.now() - windowMinutes * MILLIS_PER_MINUTE;
    const rows = this.db
      .prepare(
        `
        SELECT status FROM agent_runs
        WHERE completed_at IS NOT NULL AND completed_at >= ?
        ORDER BY completed_at DESC
      `
      )
      .all(since) as { status: AgentRunStatus }[];

    let consecutive = 0;
    for (const row of rows) {
      if (!FAILURE_STATUSES.includes(row.status)) break;
      consecutive++;
    }
    return consecutive;
  }

  async getRollingFailureRate(
    windowMinutes = DEFAULT_WINDOW_MINUTES
  ): Promise<{ totalCompleted: number; failedCount: number; failureRatePercent: number }> {
    const since = Date.now() - windowMinutes * MILLIS_PER_MINUTE;
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS total_completed,
          SUM(CASE WHEN status IN (${FAILURE_STATUSES.map(() => '?').join(', ')}) THEN 1 ELSE 0 END) AS failed_count
        FROM agent_runs
        WHERE completed_at IS NOT NULL AND completed_at >= ?
      `
      )
      .get(...FAILURE_STATUSES, since) as {
      total_completed: number;
      failed_count: number | null;
    };

    const totalCompleted = row.total_completed ?? 0;
    const failedCount = row.failed_count ?? 0;

    return {
      totalCompleted,
      failedCount,
      failureRatePercent: totalCompleted > 0 ? (failedCount / totalCompleted) * 100 : 0,
    };
  }
}
