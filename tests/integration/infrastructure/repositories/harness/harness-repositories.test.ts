/**
 * Harness SQLite repositories (spec 119, migrations 148–150).
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteHarnessSessionRepository } from '@/infrastructure/repositories/harness/sqlite-harness-session.repository.js';
import { SQLiteHarnessContextRepository } from '@/infrastructure/repositories/harness/sqlite-harness-context.repository.js';
import { SQLiteHarnessExecutionRepository } from '@/infrastructure/repositories/harness/sqlite-harness-execution.repository.js';
import { SQLiteHarnessPermissionRepository } from '@/infrastructure/repositories/harness/sqlite-harness-permission.repository.js';
import { SQLiteHarnessEvalRepository } from '@/infrastructure/repositories/harness/sqlite-harness-eval.repository.js';
import {
  ChunkKind,
  ChunkVisibility,
  GrantScope,
  HarnessDecisionKind,
  HarnessEvalRunStatus,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessTaskStatus,
  PermissionEffect,
  PermissionRequestStatus,
} from '@/domain/generated/output.js';
import {
  T0,
  makeChunk,
  makeDecision,
  makeModelCall,
  makePermission,
  makePlan,
  makeSession,
  makeTask,
  makeToolCall,
} from '../../../../helpers/harness/factories.js';

const HARNESS_TABLES = [
  'harness_sessions',
  'harness_tasks',
  'harness_events',
  'harness_repo_snapshots',
  'harness_chunks',
  'harness_chunk_views',
  'harness_context_plans',
  'harness_decisions',
  'harness_model_calls',
  'harness_tool_calls',
  'harness_permission_decisions',
  'harness_permission_grants',
  'harness_eval_runs',
  'harness_eval_results',
];

describe('harness repositories', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('creates every harness table and the settings columns', () => {
    for (const t of HARNESS_TABLES) expect(tableExists(db, t), t).toBe(true);
    const cols = (db.pragma('table_info(settings)') as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('feature_flag_query_aware_harness');
    expect(cols).toContain('harness_config');
  });

  describe('sessions, tasks and snapshots', () => {
    it('round-trips a session field-for-field with Date timestamps', async () => {
      const repo = new SQLiteHarnessSessionRepository(db);
      const s = makeSession({
        agentRunId: 'run-1',
        featureId: 'feat-1',
        origin: HarnessSessionOrigin.Feature,
        worktreePath: '/wt',
        modelId: 'm',
        shadowContext: true,
      });
      await repo.createSession(s);
      const back = await repo.getSession(s.id);
      expect(back).toEqual(s);
      expect(back?.createdAt).toBeInstanceOf(Date);
      expect(await repo.findSessionByAgentRun('run-1')).toEqual(s);
    });

    it('lists sessions newest first, filtered by origin', async () => {
      const repo = new SQLiteHarnessSessionRepository(db);
      const old = makeSession({ updatedAt: new Date(T0.getTime() - 1000) });
      const fresh = makeSession();
      const evalSession = makeSession({ origin: HarnessSessionOrigin.Eval });
      for (const s of [old, fresh, evalSession]) await repo.createSession(s);
      const listed = await repo.listSessions({
        origins: [HarnessSessionOrigin.Standalone, HarnessSessionOrigin.Feature],
      });
      expect(listed.map((s) => s.id)).toEqual([fresh.id, old.id]);
    });

    it('updates tasks in place and lists them in creation order', async () => {
      const repo = new SQLiteHarnessSessionRepository(db);
      const s = makeSession();
      await repo.createSession(s);
      const t1 = makeTask(s.id, { phase: 'analyze' });
      const t2 = makeTask(s.id, { phase: 'implement:phase-1' });
      await repo.createTask(t1);
      await repo.createTask(t2);
      await repo.updateTask({ ...t1, status: HarnessTaskStatus.Running, turnCount: 3 });
      const tasks = await repo.listTasks(s.id);
      expect(tasks.map((t) => t.phase)).toEqual(['analyze', 'implement:phase-1']);
      expect(tasks[0]).toMatchObject({ status: HarnessTaskStatus.Running, turnCount: 3 });
    });

    it('returns the latest snapshot of a session', async () => {
      const repo = new SQLiteHarnessSessionRepository(db);
      const base = { sessionId: 's', root: '/r', workingTreeHash: 'h', fileCount: 0 };
      await repo.putSnapshot({ ...base, id: 'a', createdAt: T0, updatedAt: T0 });
      const later = new Date(T0.getTime() + 5);
      await repo.putSnapshot({ ...base, id: 'b', createdAt: later, updatedAt: later });
      expect((await repo.latestSnapshot('s'))?.id).toBe('b');
    });
  });

  describe('context', () => {
    it('filters chunks by task and kind and hides superseded ones', async () => {
      const repo = new SQLiteHarnessContextRepository(db);
      const a = makeChunk('s', { taskId: 't', path: 'src/a.ts' });
      const b = makeChunk('s', { taskId: 't', path: 'src/a.ts' });
      const log = makeChunk('s', { taskId: 't', kind: ChunkKind.TestResult, path: undefined });
      for (const c of [a, b, log]) await repo.putChunk(c);
      await repo.markSuperseded(a.id, b.id);

      expect((await repo.listChunks({ sessionId: 's' })).map((c) => c.id)).toEqual([b.id, log.id]);
      expect(
        (await repo.listChunks({ sessionId: 's', includeSuperseded: true })).map((c) => c.id)
      ).toEqual([a.id, b.id, log.id]);
      expect(
        (await repo.listChunks({ sessionId: 's', kinds: [ChunkKind.TestResult] })).map((c) => c.id)
      ).toEqual([log.id]);
      expect((await repo.findLatestChunkByPath('s', 'src/a.ts', ChunkKind.File))?.id).toBe(b.id);
      expect(await repo.findLatestChunkByPath('s', 'src/a.ts', ChunkKind.FileExcerpt)).toBeNull();
      expect((await repo.getChunk(a.id))?.supersededBy).toBe(b.id);
      expect((await repo.getChunk(b.id))?.supersedes).toBe(a.id);
    });

    it('getChunks preserves the requested order and skips unknown ids', async () => {
      const repo = new SQLiteHarnessContextRepository(db);
      const a = makeChunk('s');
      const b = makeChunk('s');
      await repo.putChunk(a);
      await repo.putChunk(b);
      expect((await repo.getChunks([b.id, 'missing', a.id])).map((c) => c.id)).toEqual([
        b.id,
        a.id,
      ]);
    });

    it('keeps one view per (chunk, fingerprint, visibility, renderer)', async () => {
      const repo = new SQLiteHarnessContextRepository(db);
      const base = {
        chunkId: 'c',
        queryFingerprint: 'fp',
        visibility: ChunkVisibility.Short,
        rendererId: 'file@1',
        estimatedTokens: 3,
        sourceHash: 'h',
        truncated: false,
        createdAt: T0,
        updatedAt: T0,
      };
      await repo.putView({ ...base, id: 'v1', content: 'one' });
      await repo.putView({ ...base, id: 'v2', content: 'two' });
      const found = await repo.findView('c', 'fp', ChunkVisibility.Short, 'file@1');
      expect(found?.content).toBe('two');
      const count = db.prepare('SELECT COUNT(*) AS n FROM harness_chunk_views').get() as {
        n: number;
      };
      expect(count.n).toBe(1);
    });

    it('round-trips plans and lists them by turn', async () => {
      const repo = new SQLiteHarnessContextRepository(db);
      const p2 = makePlan('t', { turn: 2 });
      const p1 = makePlan('t', { turn: 1 });
      await repo.putPlan(p2);
      await repo.putPlan(p1);
      expect(await repo.getPlan(p1.id)).toEqual(p1);
      expect((await repo.listPlans('t')).map((p) => p.turn)).toEqual([1, 2]);
    });
  });

  describe('execution', () => {
    it('round-trips decisions, model calls and tool calls', async () => {
      const repo = new SQLiteHarnessExecutionRepository(db);
      const d1 = makeDecision({ taskId: 't', kind: HarnessDecisionKind.ChunkVisibility });
      const d2 = makeDecision({ taskId: 't', kind: HarnessDecisionKind.CapabilityChoice });
      await repo.putDecision(d1);
      await repo.putDecision(d2);
      expect(await repo.getDecision(d1.id)).toEqual(d1);
      expect(
        (await repo.listDecisions('t', HarnessDecisionKind.CapabilityChoice)).map((d) => d.id)
      ).toEqual([d2.id]);

      const mc = makeModelCall('t', { inputTokens: 900, cachedInputTokens: 300 });
      await repo.putModelCall(mc);
      expect(await repo.listModelCalls('t')).toEqual([mc]);

      const started = new Date(T0.getTime() + 10);
      const tc = makeToolCall('t', { idempotencyKey: 'k1', startedAt: started });
      await repo.putToolCall(tc);
      const back = await repo.findToolCallByIdempotencyKey('k1');
      expect(back).toEqual(tc);
      expect(back?.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('permissions', () => {
    it('resolves a pending request exactly once', async () => {
      const repo = new SQLiteHarnessPermissionRepository(db);
      const p = makePermission('s', 't');
      await repo.putPermission(p);
      expect((await repo.listPending()).map((x) => x.id)).toEqual([p.id]);

      const resolved = {
        ...p,
        status: PermissionRequestStatus.Resolved,
        result: PermissionEffect.Allow,
        resolvedBy: 'user',
        scope: GrantScope.Once,
      };
      const [first, second] = await Promise.all([
        repo.resolvePending(resolved),
        repo.resolvePending({ ...resolved, result: PermissionEffect.Deny }),
      ]);
      expect([first, second].filter(Boolean)).toHaveLength(1);
      expect((await repo.getPermission(p.id))?.result).toBe(PermissionEffect.Allow);
      expect(await repo.listPending()).toEqual([]);
    });

    it('lists active grants and consumes them', async () => {
      const repo = new SQLiteHarnessPermissionRepository(db);
      const grant = {
        id: 'g1',
        sessionId: 's',
        scope: GrantScope.Once,
        capabilityId: 'run_command',
        actionPattern: 'pnpm add jsonwebtoken@9',
        consumed: false,
        createdAt: T0,
        updatedAt: T0,
      };
      await repo.putGrant(grant);
      expect(await repo.listActiveGrants('s')).toHaveLength(1);
      await repo.consumeGrant('g1');
      expect(await repo.listActiveGrants('s')).toEqual([]);
    });
  });

  describe('evals', () => {
    it('round-trips runs and results', async () => {
      const repo = new SQLiteHarnessEvalRepository(db);
      const run = {
        id: 'r1',
        suite: 'seed',
        variants: [HarnessMode.Baseline, HarnessMode.QueryAware],
        repeats: 1,
        status: HarnessEvalRunStatus.Completed,
        createdAt: T0,
        updatedAt: T0,
      };
      await repo.putRun(run);
      await repo.putResult({
        id: 'x',
        runId: 'r1',
        caseId: 'fix-test',
        variant: HarnessMode.Baseline,
        repeat: 0,
        success: true,
        scores: { inputTokens: 1000, turns: 4 },
        createdAt: T0,
        updatedAt: T0,
      });
      expect(await repo.getRun('r1')).toEqual(run);
      expect((await repo.listResults('r1'))[0].scores).toEqual({ inputTokens: 1000, turns: 4 });
    });
  });
});
