/**
 * SessionTerminator
 *
 * Encapsulates the two stop paths previously inlined in the monolithic
 * `InteractiveSessionService`:
 *
 * - `stop(sessionId)`          — tears down a session by its DB id.
 * - `stopByFeature(featureId)` — finds the active session for a feature
 *   scope and delegates to `stop()`.
 *
 * Side-effects on stop:
 * 1. Aborts any in-flight stream (cancels the AbortController).
 * 2. Drains the turn queue so no pending turns run after teardown.
 * 3. Caches the agent SDK session id in the registry so the next boot
 *    can resume the same SDK conversation.
 * 4. Closes the SDK session handle.
 * 5. Persists `stopped` status + `idle` turn status to the DB and notifies
 *    SSE subscribers.
 * 6. Settles a pending AskUserQuestion promise (empty answers) so the
 *    `canUseTool` callback awaiting it does not leak.
 *
 * A session this process does not hold (the server restarted or
 * hot-reloaded) is still stopped: its persisted row is marked `stopped`
 * through a guarded write, so chat-state stops reporting it as live.
 *
 * Replaces the `console.log(new Error().stack)` diagnostic call with a
 * structured `logger.debug` call.
 *
 * Extracted from `interactive-session.service.ts` in phase 5 of the
 * strangler refactor documented at
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import type { SessionRegistry } from '../core/session-registry.js';
import type { SessionPersistence } from '../core/session-persistence.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import type { IInteractiveMessageRepository } from '../../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '../../../../application/ports/output/repositories/workflow-step-repository.interface.js';
import { InteractiveSessionStatus } from '../../../../domain/generated/output.js';

export class SessionTerminator {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly persistence: SessionPersistence,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly logger: ILogger,
    private readonly messageRepo: IInteractiveMessageRepository,
    private readonly workflowStepRepo: IWorkflowStepRepository
  ) {}

  /**
   * Stop and tear down the session identified by `sessionId`.
   * Idempotent — returns silently when the session is already gone.
   */
  async stop(sessionId: string): Promise<void> {
    const state = this.registry.get(sessionId);
    if (!state) {
      // Not live in this process. Idempotent for a stopped row; a row still
      // booting/ready was orphaned by a restart and is stopped here.
      if (await this.persistence.stopOrphanedSession(sessionId)) {
        this.logger.info(`[InteractiveSession] stopped orphaned session ${sessionId}`, {
          sessionId,
        });
      }
      return;
    }

    this.logger.debug(
      `[InteractiveSession] stopSession called for ${sessionId} (feature: ${state.featureId})`,
      { sessionId, featureId: state.featureId }
    );

    // Abort any active stream iteration and clear pending turns
    if (state.streamAbort) {
      state.streamAbort.abort();
      state.streamAbort = undefined;
    }
    state.turnQueue.length = 0;
    state.turnInProgress = false;

    // Settle a pending AskUserQuestion so its awaiter does not leak.
    if (state.pendingInteractionResolver) {
      const settle = state.pendingInteractionResolver;
      state.pendingInteraction = null;
      state.pendingInteractionResolver = null;
      settle({});
    }

    // Cache agentSessionId so resumption works when session restarts
    if (state.agentSessionId) {
      this.registry.cacheStoppedAgentSessionId(state.featureId, state.agentSessionId);
    }
    this.registry.delete(sessionId);

    // Close the SDK session handle
    if (state.handle) {
      try {
        await state.handle.close();
      } catch {
        // Session may already be closed
      }
      state.handle = null;
    }

    await this.persistence.updateSessionStatusAndNotify(
      sessionId,
      state.featureId,
      InteractiveSessionStatus.stopped,
      new Date()
    );
    void this.persistence.updateTurnStatusAndNotify(sessionId, state.featureId, 'idle');
  }

  /**
   * Find the active session for `featureId` and stop it. When none is live
   * in this process, stop the feature's orphaned persisted session instead.
   */
  async stopByFeature(featureId: string): Promise<void> {
    const state = this.registry.findActiveStateForFeature(featureId);
    if (state) {
      await this.stop(state.sessionId);
      return;
    }
    if (await this.persistence.stopOrphanedSessionForFeature(featureId)) {
      this.logger.info(`[InteractiveSession] stopped orphaned session for feature ${featureId}`, {
        featureId,
      });
    }
  }

  /**
   * Clear all messages and workflow steps for a feature scope.
   * Stops any active session first so the agent doesn't retain old context.
   * Also clears the cached agent session id so the next boot starts fresh.
   */
  async clearFeatureMessages(featureId: string): Promise<void> {
    await this.stopByFeature(featureId);
    this.registry.deleteStoppedAgentSessionId(featureId);
    await this.workflowStepRepo.deleteByFeatureId(featureId);
    this.registry.clearActiveStep(featureId);
    await this.messageRepo.deleteByFeatureId(featureId);
  }
}
