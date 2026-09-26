/**
 * Agent Run Repository Integration Tests
 *
 * Tests for the SQLite implementation of IAgentRunRepository.
 * Verifies CRUD operations, query methods, and database mapping.
 *
 * TDD Phase: RED
 * - Tests written BEFORE implementation
 * - All tests should FAIL initially
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { AgentType, AgentRunStatus, AgentEffort } from '@/domain/generated/output.js';

describe('SQLiteAgentRunRepository', () => {
  let db: Database.Database;
  let repository: SQLiteAgentRunRepository;

  const createTestAgentRun = (overrides?: Partial<AgentRun>): AgentRun => ({
    id: 'run-001',
    agentType: AgentType.ClaudeCode,
    agentName: 'analyze-repository',
    status: AgentRunStatus.pending,
    prompt: 'Analyze the repository structure',
    threadId: 'thread-abc-123',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'agent_runs')).toBe(true);
    repository = new SQLiteAgentRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create()', () => {
    it('should create agent run record', async () => {
      const agentRun = createTestAgentRun();

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.id).toBe('run-001');
      expect(row.agent_type).toBe('claude-code');
      expect(row.agent_name).toBe('analyze-repository');
      expect(row.status).toBe('pending');
      expect(row.prompt).toBe('Analyze the repository structure');
      expect(row.thread_id).toBe('thread-abc-123');
    });

    it('should store optional fields as NULL when not provided', async () => {
      const agentRun = createTestAgentRun();

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.result).toBeNull();
      expect(row.session_id).toBeNull();
      expect(row.pid).toBeNull();
      expect(row.last_heartbeat).toBeNull();
      expect(row.started_at).toBeNull();
      expect(row.completed_at).toBeNull();
      expect(row.error).toBeNull();
    });

    it('should store all optional fields when provided', async () => {
      const agentRun = createTestAgentRun({
        result: 'Analysis complete',
        sessionId: 'session-xyz',
        pid: 12345,
        lastHeartbeat: new Date('2025-01-01T01:00:00Z'),
        startedAt: new Date('2025-01-01T00:30:00Z'),
        completedAt: new Date('2025-01-01T01:00:00Z'),
        error: 'Some warning',
      });

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.result).toBe('Analysis complete');
      expect(row.session_id).toBe('session-xyz');
      expect(row.pid).toBe(12345);
      expect(row.last_heartbeat).toBe(new Date('2025-01-01T01:00:00Z').getTime());
      expect(row.started_at).toBe(new Date('2025-01-01T00:30:00Z').getTime());
      expect(row.completed_at).toBe(new Date('2025-01-01T01:00:00Z').getTime());
      expect(row.error).toBe('Some warning');
    });

    it('should store timestamps as unix milliseconds', async () => {
      const agentRun = createTestAgentRun();

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.created_at).toBe(new Date('2025-01-01T00:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2025-01-01T00:00:00Z').getTime());
    });
  });

  describe('findById()', () => {
    it('should find agent run by ID', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      const found = await repository.findById('run-001');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('run-001');
      expect(found?.agentType).toBe(AgentType.ClaudeCode);
      expect(found?.agentName).toBe('analyze-repository');
      expect(found?.status).toBe(AgentRunStatus.pending);
      expect(found?.prompt).toBe('Analyze the repository structure');
      expect(found?.threadId).toBe('thread-abc-123');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent');

      expect(found).toBeNull();
    });

    it('should correctly map timestamps back to Date objects', async () => {
      const agentRun = createTestAgentRun({
        startedAt: new Date('2025-01-01T00:30:00Z'),
        completedAt: new Date('2025-01-01T01:00:00Z'),
        lastHeartbeat: new Date('2025-01-01T00:45:00Z'),
      });
      await repository.create(agentRun);

      const found = await repository.findById('run-001');

      expect(found?.createdAt).toBeInstanceOf(Date);
      expect(found?.updatedAt).toBeInstanceOf(Date);
      expect(found?.startedAt).toBeInstanceOf(Date);
      expect(found?.completedAt).toBeInstanceOf(Date);
      expect(found?.lastHeartbeat).toBeInstanceOf(Date);
      expect((found?.createdAt as Date).toISOString()).toBe('2025-01-01T00:00:00.000Z');
      expect((found?.startedAt as Date).toISOString()).toBe('2025-01-01T00:30:00.000Z');
    });

    it('should not include optional fields when they are NULL', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      const found = await repository.findById('run-001');

      expect(found?.result).toBeUndefined();
      expect(found?.sessionId).toBeUndefined();
      expect(found?.pid).toBeUndefined();
      expect(found?.lastHeartbeat).toBeUndefined();
      expect(found?.startedAt).toBeUndefined();
      expect(found?.completedAt).toBeUndefined();
      expect(found?.error).toBeUndefined();
    });
  });

  describe('findByThreadId()', () => {
    it('should find agent run by thread ID', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      const found = await repository.findByThreadId('thread-abc-123');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('run-001');
      expect(found?.threadId).toBe('thread-abc-123');
    });

    it('should return null for non-existent thread ID', async () => {
      const found = await repository.findByThreadId('non-existent-thread');

      expect(found).toBeNull();
    });
  });

  describe('updateStatus()', () => {
    it('should update agent run status', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      await repository.updateStatus('run-001', AgentRunStatus.running);

      const found = await repository.findById('run-001');
      expect(found?.status).toBe(AgentRunStatus.running);
    });

    it('should update status with additional fields', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      await repository.updateStatus('run-001', AgentRunStatus.completed, {
        result: 'Successfully analyzed',
        completedAt: new Date('2025-01-01T01:00:00Z'),
      });

      const found = await repository.findById('run-001');
      expect(found?.status).toBe(AgentRunStatus.completed);
      expect(found?.result).toBe('Successfully analyzed');
      expect(found?.completedAt).toBeInstanceOf(Date);
      expect((found?.completedAt as Date).toISOString()).toBe('2025-01-01T01:00:00.000Z');
    });

    it('should update status to failed with error message', async () => {
      const agentRun = createTestAgentRun({ status: AgentRunStatus.running });
      await repository.create(agentRun);

      await repository.updateStatus('run-001', AgentRunStatus.failed, {
        error: 'Connection timeout',
        completedAt: new Date('2025-01-01T01:00:00Z'),
      });

      const found = await repository.findById('run-001');
      expect(found?.status).toBe(AgentRunStatus.failed);
      expect(found?.error).toBe('Connection timeout');
    });

    it('should update the updatedAt timestamp', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      await repository.updateStatus('run-001', AgentRunStatus.running, {
        updatedAt: new Date('2025-01-02T00:00:00Z'),
      });

      const found = await repository.findById('run-001');
      expect((found?.updatedAt as Date).toISOString()).toBe('2025-01-02T00:00:00.000Z');
    });
  });

  describe('effort', () => {
    it('round-trips a pinned effort', async () => {
      await repository.create(createTestAgentRun({ effort: AgentEffort.xhigh }));
      expect((await repository.findById('run-001'))?.effort).toBe(AgentEffort.xhigh);
    });

    it('leaves effort absent when none was pinned', async () => {
      await repository.create(createTestAgentRun());
      const found = await repository.findById('run-001');
      expect(found?.effort).toBeUndefined();
      const row = db.prepare('SELECT effort FROM agent_runs WHERE id = ?').get('run-001') as {
        effort: string | null;
      };
      expect(row.effort).toBeNull();
    });

    it('reads an unknown stored value back as absent', async () => {
      await repository.create(createTestAgentRun());
      db.prepare('UPDATE agent_runs SET effort = ? WHERE id = ?').run('ultra', 'run-001');
      expect((await repository.findById('run-001'))?.effort).toBeUndefined();
    });

    it('keeps the pinned effort when the pinned agent/model changes', async () => {
      await repository.create(createTestAgentRun({ effort: AgentEffort.low }));
      await repository.updatePinnedConfig('run-001', {
        agentType: AgentType.ClaudeCode,
        modelId: 'claude-opus-5-5',
        updatedAt: new Date('2025-01-02T00:00:00Z'),
      });
      expect((await repository.findById('run-001'))?.effort).toBe(AgentEffort.low);
    });
  });

  describe('updatePinnedConfig()', () => {
    it('should update agent type, model ID, and updatedAt', async () => {
      const agentRun = createTestAgentRun({
        agentType: AgentType.ClaudeCode,
        modelId: 'claude-sonnet-4-6',
      });
      await repository.create(agentRun);

      await repository.updatePinnedConfig('run-001', {
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
        updatedAt: new Date('2025-01-02T00:00:00Z'),
      });

      const found = await repository.findById('run-001');
      expect(found?.agentType).toBe(AgentType.CodexCli);
      expect(found?.modelId).toBe('gpt-5.4');
      expect((found?.updatedAt as Date).toISOString()).toBe('2025-01-02T00:00:00.000Z');
    });

    it('should not alter status-oriented or runtime fields when updating pinned config', async () => {
      const agentRun = createTestAgentRun({
        status: AgentRunStatus.failed,
        result: 'node:merge',
        sessionId: 'session-123',
        pid: 4321,
        lastHeartbeat: new Date('2025-01-01T00:45:00Z'),
        startedAt: new Date('2025-01-01T00:30:00Z'),
        completedAt: new Date('2025-01-01T01:00:00Z'),
        error: 'merge conflict',
        threadId: 'thread-original',
        modelId: 'claude-sonnet-4-6',
      });
      await repository.create(agentRun);

      await repository.updatePinnedConfig('run-001', {
        agentType: AgentType.Cursor,
        modelId: 'gpt-5.4-high',
        updatedAt: new Date('2025-01-03T00:00:00Z'),
      });

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;

      expect(row.agent_type).toBe('cursor');
      expect(row.model_id).toBe('gpt-5.4-high');
      expect(row.updated_at).toBe(new Date('2025-01-03T00:00:00Z').getTime());
      expect(row.status).toBe(AgentRunStatus.failed);
      expect(row.result).toBe('node:merge');
      expect(row.session_id).toBe('session-123');
      expect(row.pid).toBe(4321);
      expect(row.last_heartbeat).toBe(new Date('2025-01-01T00:45:00Z').getTime());
      expect(row.started_at).toBe(new Date('2025-01-01T00:30:00Z').getTime());
      expect(row.completed_at).toBe(new Date('2025-01-01T01:00:00Z').getTime());
      expect(row.error).toBe('merge conflict');
      expect(row.thread_id).toBe('thread-original');
    });
  });

  describe('findRunningByPid()', () => {
    it('should find running agents by PID', async () => {
      const run1 = createTestAgentRun({
        id: 'run-001',
        status: AgentRunStatus.running,
        pid: 12345,
      });
      const run2 = createTestAgentRun({
        id: 'run-002',
        status: AgentRunStatus.running,
        pid: 12345,
        threadId: 'thread-def-456',
      });
      const run3 = createTestAgentRun({
        id: 'run-003',
        status: AgentRunStatus.completed,
        pid: 12345,
        threadId: 'thread-ghi-789',
      });
      await repository.create(run1);
      await repository.create(run2);
      await repository.create(run3);

      const found = await repository.findRunningByPid(12345);

      expect(found).toHaveLength(2);
      expect(found.map((r) => r.id)).toContain('run-001');
      expect(found.map((r) => r.id)).toContain('run-002');
    });

    it('should return empty array when no running agents match PID', async () => {
      const found = await repository.findRunningByPid(99999);

      expect(found).toEqual([]);
    });
  });

  describe('list()', () => {
    it('should list all agent runs', async () => {
      const run1 = createTestAgentRun({ id: 'run-001' });
      const run2 = createTestAgentRun({ id: 'run-002', threadId: 'thread-def-456' });
      await repository.create(run1);
      await repository.create(run2);

      const all = await repository.list();

      expect(all).toHaveLength(2);
    });

    it('should return empty array when no agent runs exist', async () => {
      const all = await repository.list();

      expect(all).toEqual([]);
    });

    it('should return only runs in the requested statuses', async () => {
      await repository.create(createTestAgentRun({ id: 'run-a', status: AgentRunStatus.running }));
      await repository.create(
        createTestAgentRun({ id: 'run-b', threadId: 't-b', status: AgentRunStatus.completed })
      );
      await repository.create(
        createTestAgentRun({ id: 'run-c', threadId: 't-c', status: AgentRunStatus.waitingApproval })
      );

      const active = await repository.list({
        statuses: [AgentRunStatus.running, AgentRunStatus.waitingApproval],
      });

      expect(active.map((r) => r.id).sort()).toEqual(['run-a', 'run-c']);
      expect(await repository.list({ statuses: [] })).toEqual([]);
    });
  });

  describe('approval gates fields', () => {
    it('should store approvalGates as JSON when creating agent run', async () => {
      const agentRun = createTestAgentRun({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      });

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.approval_gates).toBe('{"allowPrd":false,"allowPlan":false,"allowMerge":false}');
    });

    it('should store approval_gates as NULL when not provided', async () => {
      const agentRun = createTestAgentRun();

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.approval_gates).toBeNull();
    });

    it('should return approvalGates object via findById', async () => {
      const agentRun = createTestAgentRun({
        approvalGates: { allowPrd: true, allowPlan: false, allowMerge: false },
      });
      await repository.create(agentRun);

      const found = await repository.findById('run-001');

      expect(found?.approvalGates).toEqual({ allowPrd: true, allowPlan: false, allowMerge: false });
    });

    it('should not include approvalGates when it is NULL', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      const found = await repository.findById('run-001');

      expect(found?.approvalGates).toBeUndefined();
    });

    it('should update approvalGates via updateStatus', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      await repository.updateStatus('run-001', AgentRunStatus.running, {
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
      });

      const found = await repository.findById('run-001');
      expect(found?.approvalGates).toEqual({ allowPrd: true, allowPlan: true, allowMerge: false });
    });

    it('should update status to waiting_approval with approval gates', async () => {
      const agentRun = createTestAgentRun({
        status: AgentRunStatus.running,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      });
      await repository.create(agentRun);

      await repository.updateStatus('run-001', AgentRunStatus.waitingApproval);

      const found = await repository.findById('run-001');
      expect(found?.status).toBe(AgentRunStatus.waitingApproval);
      expect(found?.approvalGates).toEqual({
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
      });
    });
  });

  describe('feature reference fields', () => {
    it('should store featureId and repositoryPath when creating agent run', async () => {
      const agentRun = createTestAgentRun({
        featureId: 'feat-001',
        repositoryPath: '/test/repo',
      });

      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.feature_id).toBe('feat-001');
      expect(row.repository_path).toBe('/test/repo');
    });

    it('should return featureId and repositoryPath via findById', async () => {
      const agentRun = createTestAgentRun({
        featureId: 'feat-001',
        repositoryPath: '/test/repo',
      });
      await repository.create(agentRun);

      const found = await repository.findById('run-001');

      expect(found?.featureId).toBe('feat-001');
      expect(found?.repositoryPath).toBe('/test/repo');
    });

    it('should store feature fields as NULL when not provided', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run-001') as Record<
        string,
        unknown
      >;
      expect(row.feature_id).toBeNull();
      expect(row.repository_path).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should delete agent run', async () => {
      const agentRun = createTestAgentRun();
      await repository.create(agentRun);

      await repository.delete('run-001');

      const found = await repository.findById('run-001');
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent ID', async () => {
      await expect(repository.delete('non-existent')).resolves.not.toThrow();
    });
  });
});
