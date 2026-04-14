/**
 * TurnExecutor
 *
 * Manages the per-session turn queue and the single-threaded turn execution
 * loop. The SDK stream is NOT concurrent-safe, so only one turn may execute
 * at a time per session. Additional turns are queued and drained FIFO after
 * the current turn completes.
 *
 * `enqueueTurn` is the public entry point. It:
 * 1. Pushes to `state.turnQueue` if a turn is already running.
 * 2. Otherwise sets `state.turnInProgress = true` and calls `executeTurn`.
 *
 * `executeTurn` (private):
 * 1. Calls `streamConsumer.consume(handle, state, 'turn', abort)`.
 * 2. Accumulates usage via `sessionRepo.accumulateUsage` when the result
 *    contains a usage payload.
 * 3. Marks the turn as `unread` and notifies subscribers.
 * 4. In `finally`, releases the turn lock and recursively drains the queue.
 *
 * Extracted from `interactive-session.service.ts` in phase 5 of the
 * strangler refactor documented at
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { SessionRegistry, SessionState } from '../core/session-registry.js';
import type { SessionPersistence } from '../core/session-persistence.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';
import type { AgentStreamConsumer } from './agent-stream.consumer.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';

export class TurnExecutor {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly registry: SessionRegistry,
    private readonly persistence: SessionPersistence,
    private readonly streamConsumer: AgentStreamConsumer,
    private readonly logger: ILogger,
    private readonly dispatcher: StreamEventDispatcher
  ) {}

  /**
   * Enqueue a prompt for execution. If a turn is already in progress, the
   * prompt is appended to `state.turnQueue` and will run when the current
   * turn completes. Otherwise the turn starts immediately.
   */
  async enqueueTurn(state: SessionState, prompt: string): Promise<void> {
    if (state.turnInProgress) {
      state.turnQueue.push(prompt);
      return;
    }
    state.turnInProgress = true;
    await this.executeTurn(state, prompt);
  }

  /**
   * Execute a single turn: send the prompt to the SDK handle, consume the
   * stream, persist usage, notify done, and drain the queue.
   */
  private async executeTurn(state: SessionState, prompt: string): Promise<void> {
    try {
      if (!state.handle) {
        throw new Error('No active session handle — cannot execute turn');
      }

      state.currentAssistantBuffer = '';
      state.toolEventsLog = [];

      // Mark turn as processing for dot indicator
      void this.persistence.updateTurnStatusAndNotify(
        state.sessionId,
        state.featureId,
        'processing'
      );

      // Send the message to the SDK session
      await state.handle.send(prompt);

      // Set up abort controller for this stream
      const abort = new AbortController();
      state.streamAbort = abort;

      let result;
      try {
        result = await this.streamConsumer.consume(state.handle, state, 'turn', abort);
      } finally {
        state.streamAbort = undefined;
      }

      // Accumulate usage from this turn
      if (result.usage) {
        void this.sessionRepo.accumulateUsage(state.sessionId, {
          costUsd: result.usage.costUsd ?? 0,
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          turns: result.usage.numTurns ?? 1,
        });
      }

      // Re-capture the SDK session id after every turn. The V2 Agent
      // SDK can rotate `session_id` in the message stream (the executor's
      // `mapStream` updates `handle.sessionId` whenever a message carries
      // a new one), so the id that identifies the conversation for future
      // `resumeSession` calls may differ from the one captured at boot.
      // Keeping `state.agentSessionId` fresh — and writing it through to
      // the DB — ensures that if the in-memory session is ever lost
      // between workflow steps, the next `startSession` call picks the
      // correct id via `findLatestAgentSessionIdForFeature` and resumes
      // the same conversation instead of creating a fresh one.
      if (state.handle) {
        const latestSdkId = state.handle.sessionId;
        if (latestSdkId && latestSdkId !== state.agentSessionId) {
          state.agentSessionId = latestSdkId;
          await this.sessionRepo.updateAgentSessionId(state.sessionId, latestSdkId);
        }
      }

      // Mark as unread — if user has the chat open, the frontend
      // will immediately call markRead to clear it
      void this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'unread');

      // Notify subscribers of end-of-turn
      this.dispatcher.notify(state, { delta: '', done: true });
    } catch (err) {
      // If session was already stopped, ignore
      if (!this.registry.has(state.sessionId)) return;
      this.logger.error(`[InteractiveSession] turn failed for session ${state.sessionId}`, {
        sessionId: state.sessionId,
        featureId: state.featureId,
        error: err,
      });
    } finally {
      // Release the turn lock and drain the queue
      state.turnInProgress = false;
      if (this.registry.has(state.sessionId) && state.turnQueue.length > 0) {
        const nextContent = state.turnQueue.shift()!;
        state.turnInProgress = true;
        void this.executeTurn(state, nextContent);
      }
    }
  }
}
