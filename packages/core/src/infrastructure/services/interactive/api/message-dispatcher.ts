/**
 * MessageDispatcher
 *
 * Handles incoming user messages — the routing logic that decides whether to
 * start a new session, queue to an existing one, or restart on model/agent change.
 *
 * Extracted from `InteractiveSessionService` in Phase 6 of the strangler refactor.
 * See `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import * as crypto from 'node:crypto';
import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveMessage } from '../../../../domain/generated/output.js';
import {
  InteractiveSessionStatus,
  InteractiveMessageRole,
} from '../../../../domain/generated/output.js';
import type { SessionRegistry } from '../core/session-registry.js';
import type { SessionPersistence } from '../core/session-persistence.js';
import type { SessionBootstrapper } from '../lifecycle/session-bootstrapper.js';
import type { SessionTerminator } from '../lifecycle/session-terminator.js';
import type { TurnExecutor } from '../runtime/turn.executor.js';

export class MessageDispatcher {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly messageRepo: IInteractiveMessageRepository,
    private readonly registry: SessionRegistry,
    private readonly persistence: SessionPersistence,
    private readonly bootstrapper: SessionBootstrapper,
    private readonly terminator: SessionTerminator,
    private readonly turnExecutor: TurnExecutor
  ) {}

  /**
   * Send a message to an already-identified session (by session ID).
   * Validates session is ready, persists user message, enqueues turn.
   */
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

  /**
   * Feature-scoped send — the primary entry point used by the UI.
   * Routes to the appropriate action: boot new session, enqueue to ready session,
   * queue to booting session, or restart on model/agent change.
   */
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
      } else {
        // Edge case: in-memory state exists but the DB row is gone or
        // in a terminal state (error/stopped, or row missing entirely).
        // Previously this branch silently dropped the message — the
        // orchestrator would then hang forever waiting on
        // `waitForTurnDone`. Drop the stale in-memory state and fall
        // through to the cold-boot path below so the workflow can
        // recover.
        this.registry.delete(state.sessionId);
        if (state.agentSessionId) {
          this.registry.cacheStoppedAgentSessionId(featureId, state.agentSessionId);
        }
        state = undefined;
      }
    }

    if (!state) {
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
      await this.bootstrapper.startSession(
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
}
