/**
 * SQLiteFleetRepository Integration Tests (spec 111)
 *
 * Exercises the fleet read model against a real migrated in-memory SQLite
 * database. The repository derives every count from `features`, `agent_runs`,
 * and `agent_questions`, so these tests seed those tables directly and assert
 * the derived projection.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFleetRepository } from '@/infrastructure/repositories/sqlite-fleet.repository.js';
import { normalizeRepositoryPath } from '@/domain/shared/repository-path.js';
import {
  AgentQuestionKind,
  AgentQuestionStatus,
  AgentRunStatus,
  CiStatus,
  FleetTriageCategory,
  FleetTriagePriority,
  SdlcLifecycle,
} from '@/domain/generated/output.js';

const REPO_A = '/Users/dev/projects/alpha';
/** A Windows-style path as a CALLER spells it — stored normalised, like production. */
const REPO_B = 'C:\\Users\\dev\\projects\\beta';
const NOW = Date.now();
const MINUTE = 60_000;

describe('SQLiteFleetRepository', () => {
  let db: Database.Database;
  let repo: SQLiteFleetRepository;

  function seedFeature(options: {
    id: string;
    lifecycle?: SdlcLifecycle;
    repositoryPath?: string;
    agentRunId?: string | null;
    prNumber?: number | null;
    prMergeable?: number | null;
    ciStatus?: CiStatus | null;
    deletedAt?: number | null;
    updatedAt?: number;
  }): void {
    db.prepare(
      `INSERT INTO features (
         id, name, slug, description, repository_path, branch, lifecycle,
         agent_run_id, pr_number, pr_mergeable, ci_status, deleted_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      options.id,
      `Feature ${options.id}`,
      `feat-${options.id}`,
      // Paths are canonicalised on write by the feature mapper (and existing
      // rows by migration 144), so the seeder stores what production stores —
      // seeding a raw backslash path here would test a row shape the
      // application can no longer produce.
      normalizeRepositoryPath(options.repositoryPath ?? REPO_A),
      `feat/${options.id}`,
      options.lifecycle ?? SdlcLifecycle.Implementation,
      options.agentRunId ?? null,
      options.prNumber ?? null,
      options.prMergeable ?? null,
      options.ciStatus ?? null,
      options.deletedAt ?? null,
      NOW,
      options.updatedAt ?? NOW
    );
  }

  function seedRun(options: {
    id: string;
    status: AgentRunStatus;
    featureId?: string;
    result?: string | null;
    error?: string | null;
    startedAt?: number | null;
    completedAt?: number | null;
  }): void {
    db.prepare(
      `INSERT INTO agent_runs (
         id, agent_type, agent_name, status, prompt, thread_id,
         feature_id, result, error, started_at, completed_at, created_at, updated_at
       ) VALUES (?, 'claude-code', 'feature-agent', ?, 'do work', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      options.id,
      options.status,
      `thread-${options.id}`,
      options.featureId ?? null,
      options.result ?? null,
      options.error ?? null,
      options.startedAt ?? null,
      options.completedAt ?? null,
      NOW,
      NOW
    );
  }

  function seedQuestion(options: {
    id: string;
    featureId: string;
    agentRunId: string;
    kind: AgentQuestionKind;
    status?: AgentQuestionStatus;
    prompt?: string;
  }): void {
    db.prepare(
      `INSERT INTO agent_questions (
         id, app_id, feature_id, agent_run_id, kind, prompt, answerer,
         status, created_at, updated_at
       ) VALUES (?, 'app-1', ?, ?, ?, ?, 'user', ?, ?, ?)`
    ).run(
      options.id,
      options.featureId,
      options.agentRunId,
      options.kind,
      options.prompt ?? 'Which database should we use?',
      options.status ?? AgentQuestionStatus.pending,
      NOW,
      NOW
    );
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteFleetRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getOverview', () => {
    it('should roll up one feature per lifecycle/run state', async () => {
      seedRun({ id: 'r-run', status: AgentRunStatus.running, startedAt: NOW });
      seedRun({ id: 'r-wait', status: AgentRunStatus.waitingApproval, result: 'node:plan' });
      seedRun({ id: 'r-fail', status: AgentRunStatus.failed, completedAt: NOW });

      seedFeature({ id: 'f-run', agentRunId: 'r-run' });
      seedFeature({ id: 'f-wait', agentRunId: 'r-wait' });
      seedFeature({ id: 'f-fail', agentRunId: 'r-fail' });
      seedFeature({ id: 'f-queued', lifecycle: SdlcLifecycle.Pending, agentRunId: null });

      const overview = await repo.getOverview();

      expect(overview.counts.total).toBe(4);
      expect(overview.counts.cruising).toBe(1);
      expect(overview.counts.queued).toBe(1);
      expect(overview.counts.waitingApproval).toBe(1);
      expect(overview.counts.failed).toBe(1);
    });

    it('should exclude soft-deleted and archived features', async () => {
      seedFeature({ id: 'f-live' });
      seedFeature({ id: 'f-deleted', deletedAt: NOW });
      seedFeature({ id: 'f-archived', lifecycle: SdlcLifecycle.Archived });

      const overview = await repo.getOverview();

      expect(overview.counts.total).toBe(1);
    });

    it('should scope counts to a repository path regardless of separator style', async () => {
      seedFeature({ id: 'f-a', repositoryPath: REPO_A });
      seedFeature({ id: 'f-b', repositoryPath: REPO_B });

      const scopedA = await repo.getOverview(REPO_A);
      const scopedB = await repo.getOverview('C:/Users/dev/projects/beta');

      expect(scopedA.counts.total).toBe(1);
      expect(scopedB.counts.total).toBe(1);
    });

    it('should count distinct features needing attention separately from triage items', async () => {
      seedRun({
        id: 'r-wait',
        status: AgentRunStatus.waitingApproval,
        featureId: 'f-both',
        result: 'node:merge',
      });
      seedFeature({ id: 'f-both', agentRunId: 'r-wait', prNumber: 12, ciStatus: CiStatus.Failure });
      seedQuestion({
        id: 'q-1',
        featureId: 'f-both',
        agentRunId: 'r-wait',
        kind: AgentQuestionKind.blocking,
      });

      const overview = await repo.getOverview();

      // One feature, but three actionable exceptions (gate, question, CI failure).
      expect(overview.counts.attentionNeeded).toBe(1);
      expect(overview.activeTriageCount).toBe(3);
      expect(overview.counts.blockedQuestions).toBe(1);
    });

    it('should ignore answered questions', async () => {
      seedRun({ id: 'r-1', status: AgentRunStatus.running, featureId: 'f-1', startedAt: NOW });
      seedFeature({ id: 'f-1', agentRunId: 'r-1' });
      seedQuestion({
        id: 'q-answered',
        featureId: 'f-1',
        agentRunId: 'r-1',
        kind: AgentQuestionKind.blocking,
        status: AgentQuestionStatus.answered,
      });

      const overview = await repo.getOverview();

      expect(overview.counts.blockedQuestions).toBe(0);
    });
  });

  describe('listTriageItems', () => {
    it('should derive the pending gate from the run interrupt marker', async () => {
      seedRun({
        id: 'r-plan',
        status: AgentRunStatus.waitingApproval,
        featureId: 'f-plan',
        result: 'node:plan',
      });
      seedFeature({ id: 'f-plan', agentRunId: 'r-plan' });

      const items = await repo.listTriageItems();

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        featureId: 'f-plan',
        priority: FleetTriagePriority.p1,
        category: FleetTriageCategory.gate,
        runId: 'r-plan',
        gateType: 'plan',
      });
    });

    it('should surface blocking questions, CI failures, conflicts, crashes and stalls', async () => {
      seedRun({
        id: 'r-q',
        status: AgentRunStatus.waitingApproval,
        featureId: 'f-q',
        result: 'node:prd',
      });
      seedRun({
        id: 'r-crash',
        status: AgentRunStatus.failed,
        featureId: 'f-crash',
        error: 'boom',
        completedAt: NOW,
      });
      seedRun({
        id: 'r-stall',
        status: AgentRunStatus.running,
        featureId: 'f-stall',
        startedAt: NOW - 90 * MINUTE,
      });

      seedFeature({ id: 'f-q', agentRunId: 'r-q' });
      seedFeature({ id: 'f-crash', agentRunId: 'r-crash' });
      seedFeature({ id: 'f-stall', agentRunId: 'r-stall' });
      seedFeature({ id: 'f-ci', prNumber: 7, ciStatus: CiStatus.Failure });
      seedFeature({ id: 'f-conflict', prNumber: 8, prMergeable: 0 });
      seedFeature({ id: 'f-cruising' });

      seedQuestion({
        id: 'q-1',
        featureId: 'f-q',
        agentRunId: 'r-q',
        kind: AgentQuestionKind.blocking,
      });

      const items = await repo.listTriageItems();
      const byCategory = new Map(items.map((item) => [item.category, item]));

      expect(byCategory.get(FleetTriageCategory.gate)?.priority).toBe(FleetTriagePriority.p1);
      expect(byCategory.get(FleetTriageCategory.question)?.priority).toBe(FleetTriagePriority.p1);
      expect(byCategory.get(FleetTriageCategory.crash)?.priority).toBe(FleetTriagePriority.p2);
      expect(byCategory.get(FleetTriageCategory.ci_failed)?.priority).toBe(FleetTriagePriority.p2);
      expect(byCategory.get(FleetTriageCategory.conflict)?.priority).toBe(FleetTriagePriority.p2);
      expect(byCategory.get(FleetTriageCategory.warning)?.priority).toBe(FleetTriagePriority.p3);

      // The cruising feature contributes nothing.
      expect(items.some((item) => item.featureId === 'f-cruising')).toBe(false);
    });

    it('should order items P1 before P2 before P3', async () => {
      seedRun({
        id: 'r-crash',
        status: AgentRunStatus.failed,
        featureId: 'f-crash',
        completedAt: NOW,
      });
      seedRun({
        id: 'r-stall',
        status: AgentRunStatus.running,
        featureId: 'f-stall',
        startedAt: NOW - 90 * MINUTE,
      });
      seedRun({
        id: 'r-gate',
        status: AgentRunStatus.waitingApproval,
        featureId: 'f-gate',
        result: 'node:merge',
      });

      seedFeature({ id: 'f-stall', agentRunId: 'r-stall' });
      seedFeature({ id: 'f-crash', agentRunId: 'r-crash' });
      seedFeature({ id: 'f-gate', agentRunId: 'r-gate' });

      const items = await repo.listTriageItems();

      expect(items.map((item) => item.priority)).toEqual([
        FleetTriagePriority.p1,
        FleetTriagePriority.p2,
        FleetTriagePriority.p3,
      ]);
    });

    it('should filter by priority and by repository path', async () => {
      seedRun({
        id: 'r-gate',
        status: AgentRunStatus.waitingApproval,
        featureId: 'f-a',
        result: 'node:plan',
      });
      seedFeature({ id: 'f-a', agentRunId: 'r-gate', repositoryPath: REPO_A });
      seedRun({ id: 'r-crash', status: AgentRunStatus.failed, featureId: 'f-b', completedAt: NOW });
      seedFeature({ id: 'f-b', agentRunId: 'r-crash', repositoryPath: REPO_B });

      const p1Only = await repo.listTriageItems({ priority: FleetTriagePriority.p1 });
      const scopedToB = await repo.listTriageItems({
        repositoryPath: 'C:/Users/dev/projects/beta',
      });

      expect(p1Only.map((item) => item.featureId)).toEqual(['f-a']);
      expect(scopedToB.map((item) => item.featureId)).toEqual(['f-b']);
    });

    it('should honour the limit after ordering', async () => {
      seedRun({
        id: 'r-gate',
        status: AgentRunStatus.waitingApproval,
        featureId: 'f-a',
        result: 'node:plan',
      });
      seedFeature({ id: 'f-a', agentRunId: 'r-gate' });
      seedRun({ id: 'r-crash', status: AgentRunStatus.failed, featureId: 'f-b', completedAt: NOW });
      seedFeature({ id: 'f-b', agentRunId: 'r-crash' });

      const items = await repo.listTriageItems({ limit: 1 });

      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe(FleetTriagePriority.p1);
    });
  });

  // Regression for the review on #860: the overview counts were scoped to a
  // repository but the breaker metrics were not, so a scoped view of a healthy
  // repo could report TRIPPED because of a different repo's failures.
  describe('circuit breaker metrics — repository scoping', () => {
    function seedRunIn(
      repoPath: string,
      id: string,
      status: AgentRunStatus,
      minutesAgo: number
    ): void {
      seedRun({
        id: `run-${id}`,
        status,
        featureId: `feat-${id}`,
        completedAt: NOW - minutesAgo * MINUTE,
      });
      seedFeature({
        id: `feat-${id}`,
        agentRunId: `run-${id}`,
        repositoryPath: repoPath,
      });
    }

    const seedFailureIn = (repoPath: string, id: string, minutesAgo: number): void =>
      seedRunIn(repoPath, id, AgentRunStatus.failed, minutesAgo);

    const seedCompletedIn = (repoPath: string, id: string, minutesAgo: number): void =>
      seedRunIn(repoPath, id, AgentRunStatus.completed, minutesAgo);

    it('does not count another repository failures against a scoped view', async () => {
      for (let i = 1; i <= 4; i++) seedFailureIn(REPO_B, `b${i}`, i);

      expect(await repo.getConsecutiveFailures(REPO_A, 15)).toBe(0);

      const rate = await repo.getRollingFailureRate(REPO_A, 15);
      expect(rate).toEqual({ totalCompleted: 0, failedCount: 0, failureRatePercent: 0 });
    });

    it('counts the scoped repository own failures', async () => {
      for (let i = 1; i <= 4; i++) seedFailureIn(REPO_A, `a${i}`, i);

      expect(await repo.getConsecutiveFailures(REPO_A, 15)).toBe(4);

      const rate = await repo.getRollingFailureRate(REPO_A, 15);
      expect(rate.totalCompleted).toBe(4);
      expect(rate.failedCount).toBe(4);
    });

    it('keeps a failure streak per repository, and the break within it', async () => {
      // Newest first overall: b2, a2, b1, a1.
      seedFailureIn(REPO_A, 'a1', 4);
      seedFailureIn(REPO_B, 'b1', 3);
      seedCompletedIn(REPO_A, 'a2', 2);
      seedFailureIn(REPO_B, 'b2', 1);

      // Same rows, three different answers depending on scope: repo A's newest
      // run succeeded, repo B has two consecutive failures, and the global
      // view stops at repo A's success.
      expect(await repo.getConsecutiveFailures(REPO_A, 15)).toBe(0);
      expect(await repo.getConsecutiveFailures(REPO_B, 15)).toBe(2);
      expect(await repo.getConsecutiveFailures(undefined, 15)).toBe(1);
    });

    it('leaves the unscoped metric unchanged, including runs with no feature', async () => {
      seedFailureIn(REPO_A, 'a1', 2);
      seedRun({ id: 'run-orphan', status: AgentRunStatus.failed, completedAt: NOW - MINUTE });

      expect(await repo.getConsecutiveFailures(undefined, 15)).toBe(2);
      // The orphan run belongs to no repository, so no scope claims it.
      expect(await repo.getConsecutiveFailures(REPO_A, 15)).toBe(1);
    });

    it('excludes runs whose feature was soft-deleted from a scoped count', async () => {
      seedRun({
        id: 'run-gone',
        status: AgentRunStatus.failed,
        featureId: 'feat-gone',
        completedAt: NOW - MINUTE,
      });
      seedFeature({
        id: 'feat-gone',
        agentRunId: 'run-gone',
        repositoryPath: REPO_A,
        deletedAt: NOW,
      });

      expect(await repo.getConsecutiveFailures(REPO_A, 15)).toBe(0);
    });
  });

  describe('circuit breaker metrics', () => {
    it('should count only the leading consecutive failures inside the window', async () => {
      seedRun({ id: 'r-1', status: AgentRunStatus.completed, completedAt: NOW - 3 * MINUTE });
      seedRun({ id: 'r-2', status: AgentRunStatus.failed, completedAt: NOW - 2 * MINUTE });
      seedRun({ id: 'r-3', status: AgentRunStatus.failed, completedAt: NOW - 1 * MINUTE });
      // Outside the rolling window — must not be counted.
      seedRun({ id: 'r-old', status: AgentRunStatus.failed, completedAt: NOW - 40 * MINUTE });

      expect(await repo.getConsecutiveFailures(undefined, 15)).toBe(2);
    });

    it('should stop counting consecutive failures at the first success', async () => {
      // Newest first: failed (counted) -> completed (stops the run) -> failed (never reached).
      seedRun({ id: 'r-1', status: AgentRunStatus.failed, completedAt: NOW - 3 * MINUTE });
      seedRun({ id: 'r-2', status: AgentRunStatus.completed, completedAt: NOW - 2 * MINUTE });
      seedRun({ id: 'r-3', status: AgentRunStatus.failed, completedAt: NOW - 1 * MINUTE });

      expect(await repo.getConsecutiveFailures(undefined, 15)).toBe(1);
    });

    it('should compute the rolling failure rate over the window only', async () => {
      seedRun({ id: 'r-1', status: AgentRunStatus.completed, completedAt: NOW - 3 * MINUTE });
      seedRun({ id: 'r-2', status: AgentRunStatus.failed, completedAt: NOW - 2 * MINUTE });
      seedRun({ id: 'r-3', status: AgentRunStatus.completed, completedAt: NOW - 1 * MINUTE });
      seedRun({ id: 'r-old', status: AgentRunStatus.failed, completedAt: NOW - 90 * MINUTE });
      seedRun({ id: 'r-running', status: AgentRunStatus.running, startedAt: NOW });

      const rate = await repo.getRollingFailureRate(undefined, 15);

      expect(rate.totalCompleted).toBe(3);
      expect(rate.failedCount).toBe(1);
      expect(rate.failureRatePercent).toBeCloseTo(33.33, 1);
    });

    it('should report a zero failure rate when nothing finished in the window', async () => {
      seedRun({ id: 'r-running', status: AgentRunStatus.running, startedAt: NOW });

      const rate = await repo.getRollingFailureRate(undefined, 15);

      expect(rate).toEqual({ totalCompleted: 0, failedCount: 0, failureRatePercent: 0 });
    });

    /**
     * `interrupted` is written by StopAgentRunUseCase when the user stops an
     * agent, and by crash/liveness reconciliation after a daemon restart. It
     * belongs in the triage feed — it is a real thing to show and offer to retry
     * — but it must not trip the breaker now that a trip PARKS THE WHOLE FLEET.
     * Otherwise stopping four agents in a row, or restarting the daemon with
     * four running, parks every repo by doing something deliberate.
     */
    it('should not count interrupted runs as breaker failures', async () => {
      seedRun({ id: 'r-int-1', status: AgentRunStatus.interrupted, completedAt: NOW - 3 * MINUTE });
      seedRun({ id: 'r-int-2', status: AgentRunStatus.interrupted, completedAt: NOW - 2 * MINUTE });
      seedRun({ id: 'r-int-3', status: AgentRunStatus.interrupted, completedAt: NOW - 1 * MINUTE });

      expect(await repo.getConsecutiveFailures(undefined, 15)).toBe(0);

      const rate = await repo.getRollingFailureRate(undefined, 15);
      expect(rate.totalCompleted).toBe(3);
      expect(rate.failedCount).toBe(0);
      expect(rate.failureRatePercent).toBe(0);
    });

    it('should still count interrupted runs in the triage feed', async () => {
      // The breaker's narrower definition must not narrow the feed: a stopped
      // run is something the user may well want to retry. Triage reaches a run
      // through `features.agent_run_id`, so the feature must point at it.
      seedFeature({ id: 'f-int', agentRunId: 'r-int' });
      seedRun({
        id: 'r-int',
        featureId: 'f-int',
        status: AgentRunStatus.interrupted,
        completedAt: NOW - MINUTE,
      });

      const items = await repo.listTriageItems();

      expect(items.some((item) => item.featureId === 'f-int')).toBe(true);
    });

    /**
     * The maintainer's finding: nothing recorded that the user had already
     * looked at the failures, so `fleet resume` was undone by the very next read
     * while the same runs were still inside the window.
     */
    it('should ignore runs that finished before the acknowledgement', async () => {
      seedRun({ id: 'r-old-1', status: AgentRunStatus.failed, completedAt: NOW - 10 * MINUTE });
      seedRun({ id: 'r-old-2', status: AgentRunStatus.failed, completedAt: NOW - 8 * MINUTE });
      seedRun({ id: 'r-new', status: AgentRunStatus.failed, completedAt: NOW - 1 * MINUTE });

      const acknowledgedAt = new Date(NOW - 5 * MINUTE);

      // The two acknowledged failures are invisible; only the later one counts.
      expect(await repo.getConsecutiveFailures(undefined, 15, { since: acknowledgedAt })).toBe(1);

      const rate = await repo.getRollingFailureRate(undefined, 15, { since: acknowledgedAt });
      expect(rate.totalCompleted).toBe(1);
      expect(rate.failedCount).toBe(1);
    });

    it('should let a fresh failure trip again after an acknowledgement', async () => {
      // Resume clears the pause, and the NEXT failure must still be caught —
      // otherwise acknowledging once would disarm the breaker forever.
      seedRun({ id: 'r-old', status: AgentRunStatus.failed, completedAt: NOW - 10 * MINUTE });
      const acknowledgedAt = new Date(NOW - 5 * MINUTE);
      expect(await repo.getConsecutiveFailures(undefined, 15, { since: acknowledgedAt })).toBe(0);

      seedRun({ id: 'r-new', status: AgentRunStatus.failed, completedAt: NOW - MINUTE });
      expect(await repo.getConsecutiveFailures(undefined, 15, { since: acknowledgedAt })).toBe(1);
    });

    it('should never let the acknowledgement widen the window', async () => {
      // An acknowledgement older than the window start (or one from a machine
      // with a fast clock) must not make the breaker look further back than the
      // window it advertises.
      seedRun({ id: 'r-old', status: AgentRunStatus.failed, completedAt: NOW - 40 * MINUTE });
      seedRun({ id: 'r-new', status: AgentRunStatus.failed, completedAt: NOW - MINUTE });

      const longAgo = new Date(NOW - 24 * 60 * MINUTE);
      expect(await repo.getConsecutiveFailures(undefined, 15, { since: longAgo })).toBe(1);

      const future = new Date(NOW + 60 * MINUTE);
      expect(await repo.getConsecutiveFailures(undefined, 15, { since: future })).toBe(0);
    });
  });
});
