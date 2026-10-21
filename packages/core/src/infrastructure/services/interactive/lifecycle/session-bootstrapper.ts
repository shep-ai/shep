/**
 * SessionBootstrapper
 *
 * Owns the `startSession` / `completeBootAsync` lifecycle that was previously
 * inlined in the monolithic `InteractiveSessionService`.
 *
 * `startSession`:
 * 1. Checks the concurrent-session cap via `AgentConfigResolver.getCap()`.
 * 2. Resolves the previous agent session id (in-memory cache → stopped cache → DB).
 * 3. Creates the DB row in `booting` status.
 * 4. Initialises `SessionState` in the registry with `pendingUserContent` set
 *    BEFORE dispatching `completeBootAsync` (critical ordering — avoids a race
 *    where the async boot reads `undefined` for the first turn).
 * 5. Fires `completeBootAsync` as a fire-and-forget promise.
 * 6. Returns the session immediately so the API caller can poll.
 *
 * `completeBootAsync` (private):
 * 1. Runs one `SessionBootAttempt` (boot prompt, SDK session, boot turn, `ready`).
 * 2. On `AgentSessionNotFoundError` (the resumed conversation is gone on the
 *    agent's side) `DeadAgentSessionRecovery` forgets that id — registry and
 *    DB — and boots once more on a new conversation.
 * 3. Any other failure marks the session `error` and keeps the agent session
 *    id for a later retry.
 *
 * Extracted from `interactive-session.service.ts` in phase 5 of the
 * strangler refactor documented at
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import * as crypto from 'node:crypto';

import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { SessionRegistry, SessionState } from '../core/session-registry.js';
import type { SessionPersistence } from '../core/session-persistence.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';
import type { IAgentExecutorFactory } from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { AgentConfigResolver } from './agent-config.resolver.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import type { InteractiveSession } from '../../../../domain/generated/output.js';
import { InteractiveSessionStatus } from '../../../../domain/generated/output.js';
import { ConcurrentSessionLimitError } from '../../../../domain/errors/concurrent-session-limit.error.js';
import { InteractiveAgentUnsupportedError } from '../../../../domain/errors/interactive-agent-unsupported.error.js';
import type { SessionBootAttempt } from './session-boot-attempt.js';
import type { DeadAgentSessionRecovery } from './dead-agent-session.recovery.js';

export class SessionBootstrapper {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly registry: SessionRegistry,
    private readonly persistence: SessionPersistence,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly executorFactory: IAgentExecutorFactory,
    private readonly agentConfigResolver: AgentConfigResolver,
    private readonly logger: ILogger,
    private readonly bootAttempt: SessionBootAttempt,
    private readonly deadSessionRecovery: DeadAgentSessionRecovery
  ) {}

  /**
   * Throw `InteractiveAgentUnsupportedError` when the agent a session would
   * boot with — the explicit override, else the settings default — has no
   * interactive mode.
   *
   * `createInteractiveExecutor` would throw the same condition, but only
   * inside the background boot, after the caller has been told the session
   * started. Checking here lets callers reject before any side effect.
   */
  assertInteractiveSupported(agentType?: string): void {
    const resolved = this.agentConfigResolver.resolveAgentType(agentType);
    if (!this.executorFactory.supportsInteractive(resolved)) {
      throw new InteractiveAgentUnsupportedError(resolved);
    }
  }

  /**
   * Start a new session for the given feature scope.
   * Returns immediately in `booting` status; the async boot runs in the background.
   *
   * @throws InteractiveAgentUnsupportedError when the agent has no interactive mode
   * @throws ConcurrentSessionLimitError when the configured session cap is reached
   */
  async startSession(
    featureId: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    initialUserMessage?: string
  ): Promise<InteractiveSession> {
    this.assertInteractiveSupported(agentType);

    const cap = this.agentConfigResolver.getCap();
    const activeCount = await this.sessionRepo.countActiveSessions();
    if (activeCount >= cap) {
      throw new ConcurrentSessionLimitError(activeCount, cap);
    }

    // ─────────────────────────────────────────────────────────────
    // Resume-aware boot: look up the previous session's agent
    // sessionId BEFORE inserting the new row.
    //
    // Ordering matters CRITICALLY here. If we created the new DB
    // session row first and then called `findByFeatureId`, the repo
    // would return the row we just inserted (most recent by
    // createdAt) — which has no agentSessionId yet — and the old,
    // semantically-still-meaningful row would be invisible. That
    // silently downgrades every reboot to a `createSession` call,
    // stranding the agent with zero conversation history and making
    // it answer "this appears to be the start of our conversation"
    // to the user's second message. Look it up first.
    // ─────────────────────────────────────────────────────────────
    let previousAgentSessionId: string | undefined;
    for (const s of this.registry.values()) {
      if (s.featureId === featureId && s.agentSessionId) {
        previousAgentSessionId = s.agentSessionId;
        break;
      }
    }
    // Also check stoppedSessions cache (populated on stop)
    previousAgentSessionId ??= this.registry.takeStoppedAgentSessionId(featureId);
    // Fall back to DB — the in-memory cache may be empty after
    // service restart, hot reload, or Turbopack module re-init.
    previousAgentSessionId ??=
      (await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId)) ?? undefined;

    // Create DB record with booting status (AFTER the lookup above).
    const now = new Date();
    const session: InteractiveSession = {
      id: crypto.randomUUID(),
      featureId,
      status: InteractiveSessionStatus.booting,
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.sessionRepo.create(session);
    this.dispatcher.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      sessionStatus: InteractiveSessionStatus.booting,
    });

    // Mark as processing immediately so the FAB shows the spinner during boot
    void this.persistence.updateTurnStatusAndNotify(session.id, featureId, 'processing');

    // Set up in-memory state. CRITICAL: pendingUserContent must be set
    // BEFORE completeBootAsync is dispatched below. Setting it from the
    // caller after startSession returns is a race — the async boot may
    // already be reading state.pendingUserContent === undefined on the
    // same microtask, fall into the "no-first-turn" branch, and silently
    // skip the kickoff send.
    const state: SessionState = {
      sessionId: session.id,
      featureId,
      worktreePath,
      model,
      agentType,
      systemPrompt,
      handle: null,
      agentSessionId: previousAgentSessionId,
      currentAssistantBuffer: '',
      toolEventsLog: [],
      subscribers: new Set(),
      turnInProgress: false,
      turnQueue: [],
      pendingInteraction: null,
      pendingInteractionResolver: null,
      pendingUserContent: initialUserMessage,
    };
    this.registry.set(session.id, state);

    // Fire-and-forget the async boot sequence. The API returns the session
    // immediately in "booting" status; the frontend polls until "ready".
    void this.completeBootAsync(state, featureId, worktreePath);

    return session;
  }

  /**
   * Asynchronously complete the boot sequence via {@link SessionBootAttempt},
   * letting {@link DeadAgentSessionRecovery} retry once on a new conversation
   * when the resumed one is gone. Any failure that remains fails the boot.
   */
  private async completeBootAsync(
    state: SessionState,
    featureId: string,
    worktreePath: string
  ): Promise<void> {
    try {
      await this.deadSessionRecovery.run(state, () =>
        this.bootAttempt.run(state, featureId, worktreePath)
      );
    } catch (err) {
      await this.failBoot(state, featureId, err);
    }
  }

  /** Mark a boot that could not complete as failed, keeping the agent session id for a retry. */
  private async failBoot(state: SessionState, featureId: string, err: unknown): Promise<void> {
    // If session was already cleaned up by stopSession, nothing more to do
    if (!this.registry.has(state.sessionId)) return;

    // Boot failed — mark session as error so the frontend can show the failure
    this.logger.error(`[InteractiveSession] boot failed for session ${state.sessionId}`, {
      sessionId: state.sessionId,
      featureId,
      error: err,
    });
    try {
      // The error's own message is the actionable part ("cursor-agent is not
      // logged in", "cursor-agent was not found") — pass it on, don't just log it.
      await this.persistence.failSessionAndNotify(
        state.sessionId,
        state.featureId,
        err instanceof Error ? err.message : String(err)
      );
      // startSession marked the turn 'processing' before the boot ran;
      // hand it back so the chat stops showing a spinner for a turn that
      // will never produce output.
      await this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
    } catch {
      // Best-effort DB update
    }
    if (state.agentSessionId) {
      this.registry.cacheStoppedAgentSessionId(state.featureId, state.agentSessionId);
    }
    this.registry.delete(state.sessionId);
  }
}
