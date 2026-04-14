/**
 * ChatStateAssembler Unit Tests
 *
 * TDD: RED → GREEN → REFACTOR
 *
 * Covers the assemble() read-side DTO logic.
 * Pure read — no mutations. All deps are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ChatStateAssembler } from '@/infrastructure/services/interactive/api/chat-state.assembler.js';
import { SessionRegistry } from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionState } from '@/infrastructure/services/interactive/core/session-registry.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import type { InteractiveSession, InteractiveMessage } from '@/domain/generated/output.js';
import {
  InteractiveSessionStatus,
  InteractiveMessageRole,
  WorkflowStepStatus,
} from '@/domain/generated/output.js';

function makeSessionRepo(
  overrides: Partial<IInteractiveSessionRepository> = {}
): IInteractiveSessionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByFeatureId: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateLastActivity: vi.fn().mockResolvedValue(undefined),
    markAllActiveStopped: vi.fn().mockResolvedValue(undefined),
    countActiveSessions: vi.fn().mockResolvedValue(0),
    updateAgentSessionId: vi.fn().mockResolvedValue(undefined),
    getAgentSessionId: vi.fn().mockResolvedValue(null),
    findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    updateTurnStatus: vi.fn().mockResolvedValue(undefined),
    getTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    getAllActiveTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    accumulateUsage: vi.fn().mockResolvedValue(undefined),
    getUsage: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as IInteractiveSessionRepository;
}

function makeMessageRepo(messages: InteractiveMessage[] = []): IInteractiveMessageRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByFeatureId: vi.fn().mockResolvedValue(messages),
    findBySessionId: vi.fn().mockResolvedValue([]),
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
  };
}

function makeWorkflowStepRepo(): IWorkflowStepRepository {
  return {
    create: vi.fn(),
    ensureSteps: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    listBySession: vi.fn().mockResolvedValue([]),
    listByFeature: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    markAllRunningAsInterrupted: vi.fn().mockResolvedValue(0),
    deleteByFeatureId: vi.fn(),
  } as unknown as IWorkflowStepRepository;
}

function makeSessionState(
  sessionId: string,
  featureId: string,
  overrides: Partial<SessionState> = {}
): SessionState {
  return {
    sessionId,
    featureId,
    worktreePath: '/tmp/test',
    model: 'claude-sonnet-4-6',
    agentType: 'claude-code',
    handle: null as any,
    currentAssistantBuffer: '',
    toolEventsLog: [],
    subscribers: new Set(),
    turnInProgress: false,
    turnQueue: [],
    pendingInteraction: null,
    pendingInteractionResolver: null,
    ...overrides,
  };
}

function makeMsg(featureId: string, content: string): InteractiveMessage {
  return {
    id: 'msg-1',
    featureId,
    role: InteractiveMessageRole.user,
    content,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as InteractiveMessage;
}

describe('ChatStateAssembler', () => {
  let registry: SessionRegistry;
  let sessionRepo: IInteractiveSessionRepository;
  let messageRepo: IInteractiveMessageRepository;
  let workflowStepRepo: IWorkflowStepRepository;
  let assembler: ChatStateAssembler;

  beforeEach(() => {
    registry = new SessionRegistry();
    sessionRepo = makeSessionRepo();
    messageRepo = makeMessageRepo();
    workflowStepRepo = makeWorkflowStepRepo();

    assembler = new ChatStateAssembler(messageRepo, sessionRepo, workflowStepRepo, registry);
  });

  describe('assemble — no active session', () => {
    it('returns empty messages and null sessionStatus when no DB session', async () => {
      const state = await assembler.assemble('feat-none');

      expect(state.messages).toEqual([]);
      expect(state.sessionStatus).toBeNull();
      expect(state.streamingText).toBeNull();
      expect(state.sessionInfo).toBeNull();
      expect(state.turnStatus).toBe('idle');
    });

    it('includes messages from DB', async () => {
      const msg = makeMsg('feat-1', 'hello');
      vi.mocked(messageRepo.findByFeatureId).mockResolvedValueOnce([msg]);

      const state = await assembler.assemble('feat-1');

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe('hello');
    });

    it('sets sessionStatus from DB when session exists but is stopped', async () => {
      vi.mocked(sessionRepo.findByFeatureId).mockResolvedValueOnce({
        id: 'old-session',
        featureId: 'feat-1',
        status: InteractiveSessionStatus.stopped,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      } as InteractiveSession);

      const state = await assembler.assemble('feat-1');

      expect(state.sessionStatus).toBe(InteractiveSessionStatus.stopped);
      expect(state.sessionInfo).toBeNull(); // stopped sessions don't get sessionInfo
    });
  });

  describe('assemble — active in-memory session', () => {
    it('populates sessionInfo from registry and DB', async () => {
      const sessionId = 'session-active-1';
      const featureId = 'feat-active-1';

      registry.set(sessionId, makeSessionState(sessionId, featureId));

      const dbSession: InteractiveSession = {
        id: sessionId,
        featureId,
        status: InteractiveSessionStatus.ready,
        startedAt: new Date('2025-01-01T00:00:00Z'),
        lastActivityAt: new Date('2025-01-01T01:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as InteractiveSession;

      vi.mocked(sessionRepo.findById).mockResolvedValueOnce(dbSession);
      vi.mocked(sessionRepo.getUsage).mockResolvedValueOnce({
        totalCostUsd: 0.05,
        totalInputTokens: 100,
        totalOutputTokens: 200,
      } as any);
      vi.mocked(sessionRepo.getTurnStatuses).mockResolvedValueOnce(
        new Map([[featureId, 'processing']])
      );

      const state = await assembler.assemble(featureId);

      expect(state.sessionStatus).toBe(InteractiveSessionStatus.ready);
      expect(state.sessionInfo).not.toBeNull();
      expect(state.sessionInfo!.model).toBe('claude-sonnet-4-6');
      expect(state.sessionInfo!.totalCostUsd).toBe(0.05);
      expect(state.turnStatus).toBe('processing');
    });

    it('includes streamingText from buffer', async () => {
      const sessionId = 'session-streaming-1';
      const featureId = 'feat-streaming';

      registry.set(sessionId, makeSessionState(sessionId, featureId));

      // Set buffer on the registered state
      const state = registry.get(sessionId)!;
      state.currentAssistantBuffer = 'partial response...';

      vi.mocked(sessionRepo.findById).mockResolvedValueOnce({
        id: sessionId,
        featureId,
        status: InteractiveSessionStatus.ready,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      } as InteractiveSession);
      vi.mocked(sessionRepo.getTurnStatuses).mockResolvedValueOnce(new Map());

      const chatState = await assembler.assemble(featureId);

      expect(chatState.streamingText).toBe('partial response...');
    });

    it('includes pendingInteraction if present', async () => {
      const sessionId = 'session-interact-1';
      const featureId = 'feat-interact';

      registry.set(sessionId, makeSessionState(sessionId, featureId));

      const s = registry.get(sessionId)!;
      s.pendingInteraction = { type: 'question', questions: [] } as any;

      vi.mocked(sessionRepo.findById).mockResolvedValueOnce({
        id: sessionId,
        featureId,
        status: InteractiveSessionStatus.ready,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      } as InteractiveSession);
      vi.mocked(sessionRepo.getTurnStatuses).mockResolvedValueOnce(new Map());

      const chatState = await assembler.assemble(featureId);

      expect(chatState.pendingInteraction).toBeDefined();
    });
  });

  describe('assemble — workflow steps', () => {
    it('builds workflow DTO from DB steps', async () => {
      const featureId = 'feat-workflow';

      vi.mocked(workflowStepRepo.listByFeature).mockResolvedValueOnce([
        {
          id: 'step-1',
          workflowId: 'wf-1',
          featureId,
          status: WorkflowStepStatus.running,
          name: 'Step 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 'step-2',
          workflowId: 'wf-1',
          featureId,
          status: WorkflowStepStatus.done,
          name: 'Step 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const state = await assembler.assemble(featureId);

      expect(state.workflow).not.toBeNull();
      expect(state.workflow!.workflowId).toBe('wf-1');
      expect(state.workflow!.steps).toHaveLength(2);
      expect(state.workflow!.currentStepId).toBe('step-1');
      expect(state.turnStatus).toBe('processing');
    });

    it('returns null workflow when no steps exist', async () => {
      const state = await assembler.assemble('feat-no-wf');

      expect(state.workflow).toBeNull();
    });
  });
});
