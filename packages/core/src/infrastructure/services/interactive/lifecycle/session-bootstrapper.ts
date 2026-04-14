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
 * 1. Calls `BootPromptResolver.resolve()` for the three-case boot-prompt logic.
 * 2. Resolves agent type + auth config.
 * 3. Creates or resumes the SDK session via `IAgentExecutorFactory`.
 * 4. If there is a non-empty boot prompt, sends it and consumes the stream via
 *    `AgentStreamConsumer`. Uses `BootWatchdog` as an idle timer.
 * 5. Detects CWD-mismatch resumption failures (SDK silently created fresh session).
 * 6. Persists the SDK session id and transitions the DB session to `ready`.
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
import type { BootPromptResolver } from './boot-prompt.resolver.js';
import type { AgentStreamConsumer } from '../runtime/agent-stream.consumer.js';
import type { IAgentExecutorFactory } from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { AgentConfigResolver } from './agent-config.resolver.js';
import type { UserInteractionCoordinator } from '../runtime/user-interaction.coordinator.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import type { InteractiveSession } from '../../../../domain/generated/output.js';
import { InteractiveSessionStatus } from '../../../../domain/generated/output.js';
import { ConcurrentSessionLimitError } from '../../../../domain/errors/concurrent-session-limit.error.js';
import { BootWatchdog } from './boot-watchdog.js';

export class SessionBootstrapper {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly registry: SessionRegistry,
    private readonly persistence: SessionPersistence,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly bootPromptResolver: BootPromptResolver,
    private readonly streamConsumer: AgentStreamConsumer,
    private readonly executorFactory: IAgentExecutorFactory,
    private readonly agentConfigResolver: AgentConfigResolver,
    private readonly interactionCoordinator: UserInteractionCoordinator,
    private readonly logger: ILogger
  ) {}

  /**
   * Start a new session for the given feature scope.
   * Returns immediately in `booting` status; the async boot runs in the background.
   */
  async startSession(
    featureId: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    initialUserMessage?: string
  ): Promise<InteractiveSession> {
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
   * Asynchronously complete the boot sequence: resolve boot prompt, create
   * the SDK session, send the boot prompt, consume the stream, and transition
   * the session to `ready`.
   */
  private async completeBootAsync(
    state: SessionState,
    featureId: string,
    worktreePath: string
  ): Promise<void> {
    try {
      // Capture pendingUserContent NOW, before the resolver clears it.
      // (The resolver only reads it — the value on state is cleared below.)
      const pendingContent = state.pendingUserContent;

      // Resolve context + boot prompt using the three-case branch
      const { context, bootPrompt } = await this.bootPromptResolver.resolve(
        featureId,
        worktreePath,
        pendingContent,
        state.systemPrompt
      );

      // If we consumed pendingUserContent, clear it on state now
      if (pendingContent !== undefined) {
        state.pendingUserContent = undefined;
      }

      // Resolve agent type and auth config from settings
      const resolvedAgentType = this.agentConfigResolver.resolveAgentType(state.agentType);
      const authConfig = this.agentConfigResolver.resolveAuthConfig();

      // Create the interactive executor and session
      const executor = this.executorFactory.createInteractiveExecutor(
        resolvedAgentType,
        authConfig
      );

      // Build the onUserQuestion callback that pauses the SDK stream
      // and waits for user input via the UI.
      const onUserQuestion = this.interactionCoordinator.buildOnUserQuestionCallback(state);

      const previousAgentSessionId = state.agentSessionId;
      let handle;
      if (previousAgentSessionId) {
        // Resume existing SDK session
        handle = await executor.resumeSession(previousAgentSessionId, {
          cwd: worktreePath,
          model: state.model,
          systemPrompt: context,
          onUserQuestion,
        });
      } else {
        // Create new SDK session
        handle = await executor.createSession({
          cwd: worktreePath,
          model: state.model,
          systemPrompt: context,
          onUserQuestion,
        });
      }

      state.handle = handle;

      // If there's no first user turn to act on, don't push anything —
      // the session is ready the moment the SDK handle exists. The user
      // will send their first message through the normal turn path.
      if (!bootPrompt) {
        await this.persistence.updateSessionStatusAndNotify(
          state.sessionId,
          state.featureId,
          InteractiveSessionStatus.ready
        );
        void this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
        return;
      }

      // Send the boot prompt and iterate stream for the greeting
      await handle.send(bootPrompt);

      const bootAbort = new AbortController();
      state.streamAbort = bootAbort;

      // Idle watchdog: reset on every event. If the agent goes silent
      // for longer than BootWatchdog.IDLE_TIMEOUT_MS, abort the boot.
      const watchdog = new BootWatchdog();
      watchdog.start(() => bootAbort.abort());

      let result;
      try {
        result = await this.streamConsumer.consume(handle, state, 'boot', bootAbort, watchdog);
      } finally {
        watchdog.stop();
        state.streamAbort = undefined;
      }

      if (result.completed === 'done') {
        // Capture the SDK session ID (available after first message exchange)
        const sdkSessionId = result.agentSessionIdFromHandle;
        if (sdkSessionId) {
          // Detect CWD mismatch: if we tried to resume but got a different
          // session ID, the SDK silently created a fresh session
          if (previousAgentSessionId && sdkSessionId !== previousAgentSessionId) {
            this.logger.warn(
              `[InteractiveSession] Session resume mismatch for feature ${featureId}: ` +
                `expected ${previousAgentSessionId}, got ${sdkSessionId}. ` +
                `SDK created a fresh session (likely cwd changed or session expired).`
            );
          }
          state.agentSessionId = sdkSessionId;
          // Persist to DB so it survives service restarts
          void this.sessionRepo.updateAgentSessionId(state.sessionId, sdkSessionId);
        }

        await this.persistence.updateSessionStatusAndNotify(
          state.sessionId,
          state.featureId,
          InteractiveSessionStatus.ready
        );

        // If there's a pending user message, the next turn will set 'processing'.
        // Otherwise boot greeting is expected — mark idle.
        if (!state.pendingUserContent) {
          void this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
        }

        state.currentAssistantBuffer = '';
        state.toolEventsLog = [];

        // Notify subscribers of end-of-turn
        this.dispatcher.notify(state, { delta: '', done: true });
        return; // Boot complete
      }

      // ended-without-done: persist trailing text and transition to ready.
      await this.persistence.updateSessionStatusAndNotify(
        state.sessionId,
        state.featureId,
        InteractiveSessionStatus.ready
      );
      if (!state.pendingUserContent) {
        void this.persistence.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
      }
      state.currentAssistantBuffer = '';
      state.toolEventsLog = [];
    } catch (err) {
      // If session was already cleaned up by stopSession, nothing more to do
      if (!this.registry.has(state.sessionId)) return;

      // Boot failed — mark session as error so the frontend can show the failure
      this.logger.error(`[InteractiveSession] boot failed for session ${state.sessionId}`, {
        sessionId: state.sessionId,
        featureId,
        error: err,
      });
      try {
        await this.persistence.updateSessionStatusAndNotify(
          state.sessionId,
          state.featureId,
          InteractiveSessionStatus.error
        );
      } catch {
        // Best-effort DB update
      }
      if (state.agentSessionId) {
        this.registry.cacheStoppedAgentSessionId(state.featureId, state.agentSessionId);
      }
      this.registry.delete(state.sessionId);
    }
  }
}
