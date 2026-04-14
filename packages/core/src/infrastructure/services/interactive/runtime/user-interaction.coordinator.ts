/**
 * UserInteractionCoordinator
 *
 * Manages the AskUserQuestion interaction lifecycle — the "amber dot" feature.
 * When the agent invokes AskUserQuestion, this coordinator:
 *
 * 1. Flushes the current assistant text buffer so the question text appears
 *    above the green answer bubble in the chat history.
 * 2. Stores the interaction data in session state for the frontend to render.
 * 3. Updates the turn status to `awaiting_input` (amber dot in the UI).
 * 4. Returns a Promise that the SDK stream blocks on until the user answers.
 *
 * `respondToInteraction` is called by the facade when the user submits
 * answers through the API. It persists the answers as a structured message
 * and resolves the pending Promise, unblocking the SDK stream.
 *
 * Extracted from `interactive-session.service.ts` in phase 5 of the
 * strangler refactor documented at
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import * as crypto from 'node:crypto';

import type { SessionPersistence } from '../core/session-persistence.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';
import type { SessionRegistry, SessionState } from '../core/session-registry.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import type { UserInteractionData } from '../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import {
  InteractiveMessageRole,
  type InteractiveMessage,
} from '../../../../domain/generated/output.js';

export class UserInteractionCoordinator {
  constructor(
    private readonly persistence: SessionPersistence,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly logger: ILogger,
    private readonly registry: SessionRegistry
  ) {}

  /**
   * Build the `onUserQuestion` callback for a session.
   * Called by the SDK's `canUseTool` when the agent invokes AskUserQuestion.
   * Returns a Promise that doesn't resolve until `respondToInteraction` is called.
   */
  buildOnUserQuestionCallback(
    state: SessionState
  ): (interaction: UserInteractionData) => Promise<Record<string, string>> {
    return async (interaction: UserInteractionData): Promise<Record<string, string>> => {
      // Flush any accumulated assistant text as a separate message BEFORE
      // the interaction. This ensures the agent's question text appears
      // above the green answer bubble in the conversation history.
      if (state.currentAssistantBuffer.trim()) {
        await this.persistence.flushAssistantBuffer(state);
        state.toolEventsLog = [];

        // Notify subscribers so the frontend picks up the new message
        state.subscribers.forEach((sub) => sub({ delta: '', done: true }));
        // Small delay so the refetch completes before the interaction appears
        await new Promise<void>((r) => setTimeout(r, 100));
      }

      // Store the interaction data for the frontend
      state.pendingInteraction = interaction;

      // Update turn status so the dot indicator shows amber
      void this.persistence.updateTurnStatusAndNotify(
        state.sessionId,
        state.featureId,
        'awaiting_input'
      );

      // Notify subscribers so SSE pushes the interaction to the frontend
      state.subscribers.forEach((sub) =>
        sub({
          delta: '',
          done: false,
          log: 'Waiting for your response...',
          interaction,
        })
      );

      // Create a Promise that will be resolved when the user calls respondToInteraction
      return new Promise<Record<string, string>>((resolve) => {
        state.pendingInteractionResolver = resolve;
      });
    };
  }

  /**
   * Feature-scoped entry point: looks up the active session state for
   * `featureId` and delegates to `respondToInteraction`. Throws when there
   * is no pending interaction for that feature scope.
   */
  async respondToInteractionByFeature(
    featureId: string,
    answers: Record<string, string>
  ): Promise<void> {
    const state = this.registry.findActiveStateForFeature(featureId);
    if (!state?.pendingInteraction || !state.pendingInteractionResolver) {
      throw new Error(`No pending interaction for feature ${featureId}`);
    }
    return this.respondToInteraction(state, answers);
  }

  /**
   * Called by the facade when the user submits answers through the API.
   * Persists the answers as a structured `{{interaction}}` message,
   * resolves the pending Promise, and resets interaction state.
   *
   * @param state   The live session state (caller must have already looked it up).
   * @param answers Key-value map of question answers.
   */
  async respondToInteraction(state: SessionState, answers: Record<string, string>): Promise<void> {
    if (!state.pendingInteraction || !state.pendingInteractionResolver) {
      throw new Error(`No pending interaction for session ${state.sessionId}`);
    }

    // Persist the user's answers as a structured user message.
    // The {{interaction}} prefix lets the frontend detect and render it
    // as a compact green bubble instead of a regular text message.
    const interactionPayload = {
      questions: state.pendingInteraction.questions.map((q) => ({
        header: q.header,
        question: q.question,
      })),
      answers,
    };
    const now = new Date();
    const userMsg: InteractiveMessage = {
      id: crypto.randomUUID(),
      featureId: state.featureId,
      sessionId: state.sessionId,
      role: InteractiveMessageRole.user,
      content: `{{interaction}}${JSON.stringify(interactionPayload)}`,
      createdAt: now,
      updatedAt: now,
    };
    await this.persistence.persistMessage(userMsg);

    // Resolve the Promise that the canUseTool callback is awaiting.
    // This unblocks the SDK stream — the agent resumes with the user's answers.
    state.pendingInteractionResolver(answers);

    // Clear pending interaction state
    state.pendingInteraction = null;
    state.pendingInteractionResolver = null;

    // Update turn status back to processing
    void this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'processing');

    // Clear the "Waiting for your response..." log
    state.subscribers.forEach((sub) => sub({ delta: '', done: false }));
  }
}
