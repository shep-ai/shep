/**
 * SessionBootAttempt
 *
 * One attempt at booting an interactive session whose `SessionState` is
 * already registered. Throws on any failure; retrying and failure handling
 * belong to the caller (`SessionBootstrapper`, `DeadAgentSessionRecovery`).
 *
 * 1. Calls `BootPromptResolver.resolve()` for the three-case boot-prompt logic.
 * 2. Resolves agent type + auth config and the feature's space environment.
 * 3. Creates or resumes the SDK session via `IAgentExecutorFactory`.
 * 4. If there is a non-empty boot prompt, sends it and consumes the stream via
 *    `AgentStreamConsumer`. Uses `BootWatchdog` as an idle timer.
 * 5. Detects CWD-mismatch resumption failures (SDK silently created fresh session).
 * 6. Persists the SDK session id and transitions the DB session to `ready`.
 *
 * Extracted from `SessionBootstrapper` so each file keeps one responsibility.
 */

import type { IAgentExecutorFactory } from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import { InteractiveSessionStatus } from '../../../../domain/generated/output.js';
import { combineSpaceEnvironments } from '../../../../domain/shared/space-environment.js';
import { chatScopeEnvironment } from '../../../../domain/shared/chat-scope.js';
import type { AgentQuestionBridgeFactory } from '../../agents/agent-question-service/agent-question-bridge.factory.js';
import type { SessionState } from '../core/session-registry.js';
import type { SessionPersistence } from '../core/session-persistence.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';
import type { AgentStreamConsumer } from '../runtime/agent-stream.consumer.js';
import type { UserInteractionCoordinator } from '../runtime/user-interaction.coordinator.js';
import type { AgentConfigResolver } from './agent-config.resolver.js';
import type { BootPromptResolver } from './boot-prompt.resolver.js';
import { BootWatchdog } from './boot-watchdog.js';
import type { SessionSpaceEnvironment } from './session-space-environment.js';

export class SessionBootAttempt {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly persistence: SessionPersistence,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly bootPromptResolver: BootPromptResolver,
    private readonly streamConsumer: AgentStreamConsumer,
    private readonly executorFactory: IAgentExecutorFactory,
    private readonly agentConfigResolver: AgentConfigResolver,
    private readonly interactionCoordinator: UserInteractionCoordinator,
    private readonly logger: ILogger,
    private readonly spaceEnvironment: SessionSpaceEnvironment,
    /**
     * Builds the per-session bridge that records chat questions in the
     * unified inbox (spec 134). Absent in tests that do not exercise it.
     */
    private readonly questionBridges?: Pick<AgentQuestionBridgeFactory, 'create'>
  ) {}

  /** One boot attempt; throws on any failure. */
  async run(state: SessionState, featureId: string, worktreePath: string): Promise<void> {
    // Capture pendingUserContent NOW, before the resolver clears it.
    // (The resolver only reads it — the value on state is cleared below.)
    const pendingContent = state.pendingUserContent;

    // Resolve context + boot prompt using the three-case branch
    const { context, bootPrompt } = await this.bootPromptResolver.resolve(
      featureId,
      worktreePath,
      pendingContent,
      state.systemPrompt,
      Boolean(state.agentSessionId)
    );

    // If we consumed pendingUserContent, clear it on state now
    if (pendingContent !== undefined) {
      state.pendingUserContent = undefined;
    }

    // Resolve agent type and auth config from settings
    const resolvedAgentType = this.agentConfigResolver.resolveAgentType(state.agentType);
    const authConfig = this.agentConfigResolver.resolveAuthConfig();

    // Spec 121: the session runs with its feature's space logins and
    // identity, and a space that does not allow this agent fails the boot.
    const space = await this.spaceEnvironment.resolve(featureId, resolvedAgentType);
    if (space.refusal) throw new Error(space.refusal);

    // Create the interactive executor and session
    const executor = this.executorFactory.createInteractiveExecutor(resolvedAgentType, authConfig);

    // Build the onUserQuestion callback that pauses the SDK stream
    // and waits for user input via the UI.
    const onUserQuestion = this.interactionCoordinator.buildOnUserQuestionCallback(state);
    // Spec 134: the same question is also recorded in the inbox and
    // notifications; whichever surface answers first settles both. The
    // bridge returns null with the collaboration flag off, and the
    // executor then uses onUserQuestion alone.
    const agentQuestionBridge = await this.questionBridges?.create(
      { scopeKey: featureId, worktreePath, sessionId: state.sessionId },
      this.interactionCoordinator.buildLiveSurface(state)
    );

    // Spec 137: the session's tools (`shep chat block`) post into this
    // conversation without the agent having to know its scope key.
    const environment = combineSpaceEnvironments(
      space.environment,
      chatScopeEnvironment(featureId)
    );

    const sessionOptions = {
      cwd: worktreePath,
      model: state.model,
      systemPrompt: context,
      onUserQuestion,
      ...(agentQuestionBridge ? { agentQuestionBridge } : {}),
      environment,
    };
    const previousAgentSessionId = state.agentSessionId;
    // Resume the existing SDK session when there is one, else create a new one.
    const handle = previousAgentSessionId
      ? await executor.resumeSession(previousAgentSessionId, sessionOptions)
      : await executor.createSession(sessionOptions);

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

    if (result.completed !== 'done') {
      // ended-without-done: persist trailing text and transition to ready.
      await this.markReady(state);
      return;
    }

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
      // Persist to DB so it survives service restarts. This used to be
      // fire-and-forget (`void …`), but that opened a race with the
      // next workflow step: `RunWorkflowUseCase` moves on the moment
      // `waitForTurnDone` resolves, and if the next step's
      // `sendUserMessage` fell back to the DB path (in-memory state
      // miss) before this write landed, `findLatestAgentSessionIdForFeature`
      // returned null, and the SDK got `createSession` (fresh session)
      // instead of `resumeSession` — wiping conversation context
      // between steps. Awaiting here closes the race.
      await this.sessionRepo.updateAgentSessionId(state.sessionId, sdkSessionId);
    }

    await this.markReady(state);

    // Notify subscribers of end-of-turn
    this.dispatcher.notify(state, { delta: '', done: true });
  }

  /** Transition a booted session to `ready` and reset its per-turn buffers. */
  private async markReady(state: SessionState): Promise<void> {
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
  }
}
