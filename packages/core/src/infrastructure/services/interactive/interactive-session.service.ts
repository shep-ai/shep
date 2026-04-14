/**
 * Interactive Session Service
 *
 * Thin facade that implements `IInteractiveSessionService` by delegating
 * to extracted collaborators. Phase 5 of the strangler refactor — see
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 *
 * The following collaborators handle the heavy lifting:
 * - `SessionBootstrapper`        — startSession + completeBootAsync
 * - `SessionTerminator`          — stopSession + stopByFeature
 * - `TurnExecutor`               — executeAndPersistTurn + queue drain
 * - `UserInteractionCoordinator` — buildOnUserQuestionCallback + respondToInteraction
 * - `BootPromptResolver`         — three-case boot-prompt logic
 * - `AgentStreamConsumer`        — SDK stream event loop (phase 4)
 * - `AgentConfigResolver`        — agent type/auth/cap resolution (phase 3)
 * - `SessionPersistence`         — monotonic-clock DB writes (phase 2)
 * - `SessionRegistry`            — in-memory state (phase 1)
 * - `StreamEventDispatcher`      — SSE fan-out (phase 1)
 *
 * Remaining direct logic: sendMessage, sendUserMessage, getChatState,
 * getSession, getMessages, clearMessages, markRead, getTurnStatuses,
 * getAllActiveTurnStatuses, setActiveStep, clearActiveStep,
 * notifyWorkflowStep, waitForTurnDone, subscribe, subscribeByFeature,
 * subscribeAll — these are slated for phases 6+7.
 *
 * Dependencies are injected via constructor for testability (no real
 * processes are spawned in unit tests — the factory is replaced with a
 * test double).
 */

import * as crypto from 'node:crypto';
import type {
  IInteractiveSessionService,
  StreamChunk,
  UnsubscribeFn,
  ChatState,
} from '../../../application/ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '../../../application/ports/output/repositories/workflow-step-repository.interface.js';
import type {
  InteractiveSession,
  InteractiveMessage,
  WorkflowStep,
} from '../../../domain/generated/output.js';
import {
  InteractiveSessionStatus,
  InteractiveMessageRole,
  WorkflowStepStatus,
} from '../../../domain/generated/output.js';
import type { SessionRegistry } from './core/session-registry.js';
import type { StreamEventDispatcher } from './core/stream-event-dispatcher.js';
import type { SessionPersistence } from './core/session-persistence.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import type { SessionBootstrapper } from './lifecycle/session-bootstrapper.js';
import type { SessionTerminator } from './lifecycle/session-terminator.js';
import type { TurnExecutor } from './runtime/turn.executor.js';
import type { UserInteractionCoordinator } from './runtime/user-interaction.coordinator.js';

/**
 * Core service managing interactive agent session lifecycles.
 * Must be registered as a singleton in the DI container.
 *
 * **Polymorphic `featureId` scope key:** The `featureId` parameter accepted
 * by public methods (`sendUserMessage`, `getChatState`, `subscribeByFeature`,
 * etc.) is a polymorphic scope key — not necessarily a feature UUID:
 * - Feature chat: actual feature UUID (e.g. `"feat-abc123"`)
 * - Repository chat: repo identifier (e.g. `"repo-<repoId>"`)
 * - Global chat: literal string `"global"`
 *
 * Sessions and messages are isolated by this key regardless of chat type.
 *
 * @todo Consider renaming to `scopeId` + adding a `scopeType` discriminator.
 */
export class InteractiveSessionService implements IInteractiveSessionService {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly messageRepo: IInteractiveMessageRepository,
    _featureRepo: unknown, // owned by SessionBootstrapper — kept for signature arity
    _contextBuilder: unknown, // owned by BootPromptResolver — kept for signature arity
    private readonly workflowStepRepo: IWorkflowStepRepository,
    private readonly registry: SessionRegistry,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly persistence: SessionPersistence,
    _logger: ILogger, // owned by collaborators — kept for signature arity
    private readonly bootstrapper: SessionBootstrapper,
    private readonly terminator: SessionTerminator,
    private readonly turnExecutor: TurnExecutor,
    private readonly interactionCoordinator: UserInteractionCoordinator
  ) {}

  // ---------------------------------------------------------------------------
  // Public API — delegated to collaborators
  // ---------------------------------------------------------------------------

  async startSession(
    featureId: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    initialUserMessage?: string
  ): Promise<InteractiveSession> {
    return this.bootstrapper.startSession(
      featureId,
      worktreePath,
      model,
      agentType,
      systemPrompt,
      initialUserMessage
    );
  }

  async stopSession(sessionId: string): Promise<void> {
    return this.terminator.stop(sessionId);
  }

  async sendMessage(sessionId: string, content: string): Promise<InteractiveMessage> {
    const dbSession = await this.sessionRepo.findById(sessionId);
    if (!dbSession || dbSession.status !== InteractiveSessionStatus.ready) {
      throw new Error(`Session ${sessionId} is not ready — cannot send message`);
    }

    const state = this.registry.get(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} is not ready — cannot send message`);
    }

    // Persist user message
    const now = new Date();
    const message: InteractiveMessage = {
      id: crypto.randomUUID(),
      featureId: state.featureId,
      sessionId,
      role: InteractiveMessageRole.user,
      content,
      createdAt: now,
      updatedAt: now,
    };
    await this.persistence.persistMessage(message);

    await this.sessionRepo.updateLastActivity(sessionId, now);

    // Delegate turn execution to TurnExecutor (guarded: one turn at a time)
    void this.turnExecutor.enqueueTurn(state, content);

    return message;
  }

  async getMessages(featureId: string, limit?: number): Promise<InteractiveMessage[]> {
    return this.messageRepo.findByFeatureId(featureId, limit);
  }

  async clearMessages(featureId: string): Promise<void> {
    // Stop any active session so the agent doesn't retain old context
    const state = this.registry.findActiveStateForFeature(featureId);
    if (state) {
      await this.terminator.stop(state.sessionId);
    }
    // Also clear the cached agentSessionId so next session starts fresh
    this.registry.deleteStoppedAgentSessionId(featureId);
    await this.workflowStepRepo.deleteByFeatureId(featureId);
    this.registry.clearActiveStep(featureId);
    return this.messageRepo.deleteByFeatureId(featureId);
  }

  async getSession(sessionId: string): Promise<InteractiveSession | null> {
    return this.sessionRepo.findById(sessionId);
  }

  subscribe(sessionId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn {
    return this.dispatcher.subscribeSession(sessionId, onChunk);
  }

  // ---------------------------------------------------------------------------
  // Feature-scoped API (frontend doesn't manage sessions)
  // ---------------------------------------------------------------------------

  async sendUserMessage(
    featureId: string,
    content: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    agentKickoffOverride?: string,
    persistUserMessage = true
  ): Promise<InteractiveMessage> {
    // 1. Persist user message to DB immediately — this is the source
    //    of truth. SKIPPED when `persistUserMessage === false`, which
    //    the application-creation flow uses to boot the session on top
    //    of a user message it already wrote in the foreground.
    const now = new Date();
    const userMsg: InteractiveMessage = {
      id: crypto.randomUUID(),
      featureId,
      role: InteractiveMessageRole.user,
      content,
      createdAt: now,
      updatedAt: now,
    };
    if (persistUserMessage) {
      await this.persistence.persistMessage(userMsg);
    }

    // 2. Find active session for this feature
    let state = this.registry.findActiveStateForFeature(featureId);

    // If the caller requested a different model/agent than the running session,
    // silently stop the current session so a new one boots with the new config.
    if (state && model && state.model !== model) {
      await this.terminator.stop(state.sessionId);
      this.registry.deleteStoppedAgentSessionId(featureId);
      state = undefined;
    } else if (state && agentType && state.agentType !== agentType) {
      await this.terminator.stop(state.sessionId);
      this.registry.deleteStoppedAgentSessionId(featureId);
      state = undefined;
    }

    if (state) {
      const dbSession = await this.sessionRepo.findById(state.sessionId);
      if (dbSession?.status === InteractiveSessionStatus.ready) {
        // Session ready — send to agent (guarded: one turn at a time)
        await this.sessionRepo.updateLastActivity(state.sessionId, now);
        void this.turnExecutor.enqueueTurn(state, content);
      } else if (dbSession?.status === InteractiveSessionStatus.booting) {
        // Session booting — queue the message
        state.pendingUserContent = content;
      }
    } else {
      // No in-memory session — check DB for an orphaned active session (e.g. after
      // service restart / hot-reload) and mark it stopped before booting a new one.
      const dbSession = await this.sessionRepo.findByFeatureId(featureId);
      if (
        dbSession &&
        (dbSession.status === InteractiveSessionStatus.ready ||
          dbSession.status === InteractiveSessionStatus.booting)
      ) {
        await this.persistence.updateSessionStatusAndNotify(
          dbSession.id,
          featureId,
          InteractiveSessionStatus.stopped,
          new Date()
        );
      }

      // Boot a new session. Pass the first-turn content as `initialUserMessage`
      // so it's written to the session state atomically BEFORE completeBootAsync
      // is dispatched.
      const firstTurnContent = agentKickoffOverride ?? content;
      await this.startSession(
        featureId,
        worktreePath,
        model,
        agentType,
        systemPrompt,
        firstTurnContent
      );
    }

    return userMsg;
  }

  async getChatState(featureId: string): Promise<ChatState> {
    // DB messages
    const messages = await this.messageRepo.findByFeatureId(featureId);

    // Find active in-memory session
    const state = this.registry.findActiveStateForFeature(featureId);
    let sessionStatus: string | null = null;
    let streamingText: string | null = null;
    let sessionInfo: ChatState['sessionInfo'] = null;

    if (state) {
      const dbSession = await this.sessionRepo.findById(state.sessionId);
      sessionStatus = dbSession?.status ?? null;
      if (state.currentAssistantBuffer) {
        streamingText = state.currentAssistantBuffer;
      }
      // Resolve model display: explicit override > default
      const displayModel = state.model ?? 'claude-sonnet-4-6';

      const usage = await this.sessionRepo.getUsage(state.sessionId);
      sessionInfo = {
        pid: null, // SDK manages process internally
        sessionId: state.agentSessionId ?? state.sessionId,
        model: displayModel,
        startedAt: dbSession?.startedAt
          ? new Date(dbSession.startedAt as unknown as string).toISOString()
          : new Date().toISOString(),
        lastActivityAt: dbSession?.lastActivityAt
          ? new Date(dbSession.lastActivityAt as unknown as string).toISOString()
          : new Date().toISOString(),
        totalCostUsd: usage?.totalCostUsd ?? null,
        totalInputTokens: usage?.totalInputTokens ?? null,
        totalOutputTokens: usage?.totalOutputTokens ?? null,
      };
    } else {
      // No in-memory state — check DB for last session (e.g. after server restart)
      const latest = await this.sessionRepo.findByFeatureId(featureId);
      if (latest) {
        sessionStatus = latest.status as string;
        if (
          latest.status !== InteractiveSessionStatus.stopped &&
          latest.status !== InteractiveSessionStatus.error
        ) {
          const latestUsage = await this.sessionRepo.getUsage(latest.id);
          sessionInfo = {
            pid: null,
            sessionId: latest.id,
            model: null,
            startedAt: latest.startedAt
              ? new Date(latest.startedAt as unknown as string).toISOString()
              : new Date().toISOString(),
            lastActivityAt: latest.lastActivityAt
              ? new Date(latest.lastActivityAt as unknown as string).toISOString()
              : new Date().toISOString(),
            totalCostUsd: latestUsage?.totalCostUsd ?? null,
            totalInputTokens: latestUsage?.totalInputTokens ?? null,
            totalOutputTokens: latestUsage?.totalOutputTokens ?? null,
          };
        }
      }
    }

    // Resolve turn status from DB
    let turnStatus = 'idle';
    const activeState = state;
    if (activeState) {
      const statuses = await this.sessionRepo.getTurnStatuses([featureId]);
      turnStatus = statuses.get(featureId) ?? 'idle';
    } else {
      const latest = await this.sessionRepo.findByFeatureId(featureId);
      if (latest) {
        const statuses = await this.sessionRepo.getTurnStatuses([featureId]);
        turnStatus = statuses.get(featureId) ?? 'idle';
      }
    }

    // Include pending interaction if one exists
    const pendingInteraction = state?.pendingInteraction ?? null;

    // Workflow view — derived entirely from the DB
    const workflowSteps = await this.workflowStepRepo.listByFeature(featureId);
    let workflow: ChatState['workflow'] = null;
    if (workflowSteps.length > 0) {
      const running = workflowSteps.find((s) => s.status === WorkflowStepStatus.running);
      workflow = {
        workflowId: workflowSteps[0].workflowId,
        steps: workflowSteps,
        currentStepId: running?.id ?? null,
      };
      if (running) turnStatus = 'processing';
    }

    return {
      messages,
      sessionStatus,
      streamingText,
      sessionInfo,
      turnStatus,
      pendingInteraction,
      workflow,
    };
  }

  subscribeByFeature(featureId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn {
    return this.dispatcher.subscribeByFeature(featureId, onChunk);
  }

  subscribeAll(onChunk: (featureId: string, chunk: StreamChunk) => void): UnsubscribeFn {
    return this.dispatcher.subscribeAll(onChunk);
  }

  async stopByFeature(featureId: string): Promise<void> {
    return this.terminator.stopByFeature(featureId);
  }

  async markRead(featureId: string): Promise<void> {
    const state = this.registry.findActiveStateForFeature(featureId);
    if (state) {
      void this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
      return;
    }
    const latest = await this.sessionRepo.findByFeatureId(featureId);
    if (latest) {
      void this.persistence.updateTurnStatusAndNotify(latest.id, featureId, 'idle');
    }
  }

  async getTurnStatuses(featureIds: string[]): Promise<Map<string, string>> {
    return this.sessionRepo.getTurnStatuses(featureIds);
  }

  async getAllActiveTurnStatuses(): Promise<Map<string, string>> {
    return this.sessionRepo.getAllActiveTurnStatuses();
  }

  async respondToInteraction(featureId: string, answers: Record<string, string>): Promise<void> {
    const state = this.registry.findActiveStateForFeature(featureId);
    if (!state?.pendingInteraction || !state.pendingInteractionResolver) {
      throw new Error(`No pending interaction for feature ${featureId}`);
    }
    return this.interactionCoordinator.respondToInteraction(state, answers);
  }

  // ---------------------------------------------------------------------------
  // Workflow orchestrator hooks
  // ---------------------------------------------------------------------------

  setActiveStep(featureId: string, stepId: string): void {
    this.registry.setActiveStep(featureId, stepId);
  }

  clearActiveStep(featureId: string): void {
    this.registry.clearActiveStep(featureId);
  }

  notifyWorkflowStep(featureId: string, step: WorkflowStep): void {
    this.dispatcher.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      workflowStep: step,
    });
  }

  /**
   * Resolves the next time any subscriber receives a `done: true`
   * chunk for the given feature.
   */
  async waitForTurnDone(featureId: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('waitForTurnDone aborted'));
        return;
      }
      const unsubscribe = this.subscribeByFeature(featureId, (chunk) => {
        if (chunk.done) {
          unsubscribe();
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }
      });
      const onAbort = () => {
        unsubscribe();
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('waitForTurnDone aborted'));
      };
      signal?.addEventListener('abort', onAbort);
    });
  }
}
