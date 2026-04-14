/**
 * Interactive Session Service
 *
 * Thin facade that implements `IInteractiveSessionService` by delegating
 * to extracted collaborators. Phase 6 of the strangler refactor — see
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 *
 * The following collaborators handle the heavy lifting:
 * - `MessageDispatcher`           — sendMessage + sendUserMessage (phase 6)
 * - `ChatStateAssembler`          — getChatState read-side DTO (phase 6)
 * - `WorkflowHooks`               — setActiveStep + clearActiveStep +
 *                                   notifyWorkflowStep + waitForTurnDone (phase 6)
 * - `SessionBootstrapper`         — startSession + completeBootAsync (phase 5)
 * - `SessionTerminator`           — stopSession + stopByFeature (phase 5)
 * - `TurnExecutor`                — executeAndPersistTurn + queue drain (phase 5)
 * - `UserInteractionCoordinator`  — buildOnUserQuestionCallback + respondToInteraction (phase 5)
 * - `BootPromptResolver`          — three-case boot-prompt logic (phase 5)
 * - `AgentStreamConsumer`         — SDK stream event loop (phase 4)
 * - `AgentConfigResolver`         — agent type/auth/cap resolution (phase 3)
 * - `SessionPersistence`          — monotonic-clock DB writes (phase 2)
 * - `SessionRegistry`             — in-memory state (phase 1)
 * - `StreamEventDispatcher`       — SSE fan-out (phase 1)
 *
 * Remaining direct logic: getSession, getMessages, clearMessages, markRead,
 * getTurnStatuses, getAllActiveTurnStatuses, respondToInteraction,
 * subscribe, subscribeByFeature, subscribeAll — slated for phase 7.
 *
 * Dependencies are injected via constructor for testability (no real
 * processes are spawned in unit tests — the factory is replaced with a
 * test double).
 */

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
import type { SessionRegistry } from './core/session-registry.js';
import type { StreamEventDispatcher } from './core/stream-event-dispatcher.js';
import type { SessionPersistence } from './core/session-persistence.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import type { SessionBootstrapper } from './lifecycle/session-bootstrapper.js';
import type { SessionTerminator } from './lifecycle/session-terminator.js';
import type { TurnExecutor } from './runtime/turn.executor.js';
import type { UserInteractionCoordinator } from './runtime/user-interaction.coordinator.js';
import type { MessageDispatcher } from './api/message-dispatcher.js';
import type { ChatStateAssembler } from './api/chat-state.assembler.js';
import type { WorkflowHooks } from './api/workflow-hooks.js';

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
    _turnExecutor: TurnExecutor, // owned by MessageDispatcher — kept for signature arity
    private readonly interactionCoordinator: UserInteractionCoordinator,
    private readonly messageDispatcher: MessageDispatcher,
    private readonly chatStateAssembler: ChatStateAssembler,
    private readonly workflowHooks: WorkflowHooks
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
    return this.messageDispatcher.sendMessage(sessionId, content);
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
    return this.messageDispatcher.sendUserMessage(
      featureId,
      content,
      worktreePath,
      model,
      agentType,
      systemPrompt,
      agentKickoffOverride,
      persistUserMessage
    );
  }

  async getChatState(featureId: string): Promise<ChatState> {
    return this.chatStateAssembler.assemble(featureId);
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
  // Workflow orchestrator hooks — delegated to WorkflowHooks
  // ---------------------------------------------------------------------------

  setActiveStep(featureId: string, stepId: string): void {
    this.workflowHooks.setActiveStep(featureId, stepId);
  }

  clearActiveStep(featureId: string): void {
    this.workflowHooks.clearActiveStep(featureId);
  }

  notifyWorkflowStep(featureId: string, step: WorkflowStep): void {
    this.workflowHooks.notifyWorkflowStep(featureId, step);
  }

  async waitForTurnDone(featureId: string, signal?: AbortSignal): Promise<void> {
    return this.workflowHooks.waitForTurnDone(featureId, signal);
  }
}
