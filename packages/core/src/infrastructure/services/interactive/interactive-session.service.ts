/**
 * Interactive Session Service — THIN FACADE (Phase 7 of 7)
 *
 * Implements `IInteractiveSessionService` by delegating every public method
 * to the appropriate collaborator. Contains NO business logic of its own.
 *
 * Collaborator map:
 * - `SessionBootstrapper`        — startSession
 * - `SessionTerminator`          — stopSession, stopByFeature, clearMessages
 * - `MessageDispatcher`          — sendMessage, sendUserMessage
 * - `IInteractiveMessageRepository` — getMessages
 * - `IInteractiveSessionRepository` — getSession, getTurnStatuses, getAllActiveTurnStatuses
 * - `StreamEventDispatcher`      — subscribe, subscribeByFeature, subscribeAll
 * - `ChatStateAssembler`         — getChatState
 * - `SessionPersistence`         — markRead
 * - `UserInteractionCoordinator` — respondToInteraction
 * - `WorkflowHooks`              — setActiveStep, clearActiveStep, notifyWorkflowStep, waitForTurnDone
 *
 * See `docs/plans/2026-04-14-interactive-session-service-refactor.md` for
 * the full strangler-refactor history (phases 1–7).
 */

import type {
  IInteractiveSessionService,
  StreamChunk,
  UnsubscribeFn,
  ChatState,
} from '../../../application/ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type {
  InteractiveSession,
  InteractiveMessage,
  WorkflowStep,
} from '../../../domain/generated/output.js';
import type { StreamEventDispatcher } from './core/stream-event-dispatcher.js';
import type { SessionPersistence } from './core/session-persistence.js';
import type { SessionBootstrapper } from './lifecycle/session-bootstrapper.js';
import type { SessionTerminator } from './lifecycle/session-terminator.js';
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
    _workflowStepRepo: unknown, // owned by SessionTerminator — kept for signature arity
    _registry: unknown, // owned by collaborators — kept for signature arity
    private readonly dispatcher: StreamEventDispatcher,
    private readonly persistence: SessionPersistence,
    _logger: unknown, // owned by collaborators — kept for signature arity
    private readonly bootstrapper: SessionBootstrapper,
    private readonly terminator: SessionTerminator,
    _turnExecutor: unknown, // owned by MessageDispatcher — kept for signature arity
    private readonly interactionCoordinator: UserInteractionCoordinator,
    private readonly messageDispatcher: MessageDispatcher,
    private readonly chatStateAssembler: ChatStateAssembler,
    private readonly workflowHooks: WorkflowHooks
  ) {}

  // ---------------------------------------------------------------------------
  // Session lifecycle
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

  async stopByFeature(featureId: string): Promise<void> {
    return this.terminator.stopByFeature(featureId);
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  async sendMessage(sessionId: string, content: string): Promise<InteractiveMessage> {
    return this.messageDispatcher.sendMessage(sessionId, content);
  }

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

  async getMessages(featureId: string, limit?: number): Promise<InteractiveMessage[]> {
    return this.messageRepo.findByFeatureId(featureId, limit);
  }

  async clearMessages(featureId: string): Promise<void> {
    return this.terminator.clearFeatureMessages(featureId);
  }

  // ---------------------------------------------------------------------------
  // Session reads
  // ---------------------------------------------------------------------------

  async getSession(sessionId: string): Promise<InteractiveSession | null> {
    return this.sessionRepo.findById(sessionId);
  }

  async getTurnStatuses(featureIds: string[]): Promise<Map<string, string>> {
    return this.sessionRepo.getTurnStatuses(featureIds);
  }

  async getAllActiveTurnStatuses(): Promise<Map<string, string>> {
    return this.sessionRepo.getAllActiveTurnStatuses();
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  subscribe(sessionId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn {
    return this.dispatcher.subscribeSession(sessionId, onChunk);
  }

  subscribeByFeature(featureId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn {
    return this.dispatcher.subscribeByFeature(featureId, onChunk);
  }

  subscribeAll(onChunk: (featureId: string, chunk: StreamChunk) => void): UnsubscribeFn {
    return this.dispatcher.subscribeAll(onChunk);
  }

  // ---------------------------------------------------------------------------
  // Chat state & read tracking
  // ---------------------------------------------------------------------------

  async getChatState(featureId: string): Promise<ChatState> {
    return this.chatStateAssembler.assemble(featureId);
  }

  async markRead(featureId: string): Promise<void> {
    return this.persistence.markRead(featureId);
  }

  // ---------------------------------------------------------------------------
  // Interaction handling
  // ---------------------------------------------------------------------------

  async respondToInteraction(featureId: string, answers: Record<string, string>): Promise<void> {
    return this.interactionCoordinator.respondToInteractionByFeature(featureId, answers);
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
