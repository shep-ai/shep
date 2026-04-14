/**
 * Interactive Session Service
 *
 * Singleton service that owns the lifecycle of all interactive agent sessions.
 * Uses the IAgentExecutorFactory to create interactive executors that manage
 * persistent sessions via the agent SDK. Multi-turn context is maintained
 * by the SDK session handle internally.
 *
 * Dependencies are injected via constructor for testability (no real processes
 * are spawned in unit tests — the factory is replaced with a test double).
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
import type { IAgentExecutorFactory } from '../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type {
  InteractiveAgentSessionHandle,
  UserInteractionData,
} from '../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import type {
  InteractiveSession,
  InteractiveMessage,
  WorkflowStep,
} from '../../../domain/generated/output.js';
import {
  InteractiveSessionStatus,
  InteractiveMessageRole,
  AgentType,
  AgentAuthMethod,
  WorkflowStepStatus,
} from '../../../domain/generated/output.js';
import type { AgentConfig } from '../../../domain/generated/output.js';
import { ConcurrentSessionLimitError } from '../../../domain/errors/concurrent-session-limit.error.js';
import { type FeatureContextBuilder } from './feature-context.builder.js';
import { getSettings, hasSettings } from '../settings.service.js';

/** Default concurrent session cap. */
const DEFAULT_CAP = 3;

/**
 * Boot-phase watchdog: how long the agent is allowed to go WITHOUT
 * emitting any stream event (delta / tool_use / tool_result / status)
 * before we consider the boot stuck and abort it.
 *
 * This is an IDLE timer, not a wall-clock budget: each event received
 * resets it. That's essential for application-creation flows where the
 * first turn legitimately takes many minutes (scaffold + install + build
 * a whole project). A fixed wall-clock budget would kill those mid-way.
 */
const BOOT_IDLE_TIMEOUT_MS = 120_000;

/** In-memory state for a single live session. */
interface SessionState {
  sessionId: string;
  featureId: string;
  worktreePath: string;
  /** Agent SDK session handle — null until session is created. */
  handle: InteractiveAgentSessionHandle | null;
  /** Agent SDK session ID for resumption across service restarts. */
  agentSessionId?: string;
  /** Accumulates assistant text between user turns for persistence. */
  currentAssistantBuffer: string;
  /** Accumulates tool events during a turn for rich message persistence. */
  toolEventsLog: string[];
  /** Subscriber callbacks for real-time stdout chunk forwarding. */
  subscribers: Set<(chunk: StreamChunk) => void>;
  /** User message content queued while session boots. */
  pendingUserContent?: string;
  /** Model override for the agent process (e.g. 'claude-sonnet-4-6'). */
  model?: string;
  /** Agent type for this session. */
  agentType?: string;
  /**
   * Per-scope system prompt for the agent SDK. When set, it replaces
   * the default feature-context prompt — lets Feature / Repository /
   * Application / Global chats each supply their own instructions.
   * Caller-owned: the session service never infers or modifies this.
   */
  systemPrompt?: string;
  /** AbortController to cancel active stream iteration on stop. */
  streamAbort?: AbortController;
  /** Whether a turn is currently executing (prevents concurrent turns). */
  turnInProgress: boolean;
  /** Queue of user messages waiting to be sent after the current turn completes. */
  turnQueue: string[];
  /** Pending user interaction (AskUserQuestion) — agent stream is paused, waiting for response. */
  pendingInteraction: UserInteractionData | null;
  /** Resolver for the pending interaction Promise — call to resume the agent. */
  pendingInteractionResolver: ((answers: Record<string, string>) => void) | null;
}

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
  /** Live sessions indexed by sessionId. */
  private sessions = new Map<string, SessionState>();
  /** Cached agentSessionIds from stopped sessions, keyed by featureId. */
  private stoppedAgentSessionIds = new Map<string, string>();
  /**
   * Feature-level subscribers that survive session restarts.
   *
   * Unlike session-level subscribers (in SessionState.subscribers), these
   * persist when a session dies and a new one boots. SSE connections
   * subscribe here so they continue receiving events from new sessions.
   */
  private featureSubscribers = new Map<string, Set<(chunk: StreamChunk) => void>>();
  /**
   * Global subscribers — receive every chunk from every session tagged
   * with its feature scope key. Used by the global turn-status SSE
   * endpoint so the sidebar can track all active sessions without
   * polling.
   */
  private globalSubscribers = new Set<(featureId: string, chunk: StreamChunk) => void>();

  /**
   * Currently-active workflow step id per feature scope. Set by the
   * orchestrator (`RunWorkflowUseCase`) before each agent turn and
   * cleared between steps. `persistMessage` reads this so every row
   * it inserts is tagged with the right `step_id`. In-memory only —
   * the DB is the source of truth for per-message `stepId`.
   */
  private activeStepByFeature = new Map<string, string>();

  /**
   * Monotonic clock for message `createdAt` values. `Date.now()` has
   * millisecond precision, and the SDK can fire `tool_use` + `tool_result`
   * (and their paired persistToolEvent calls) within the same millisecond
   * — which leaves the DB with two rows whose `created_at` are identical,
   * causing `ORDER BY created_at ASC` to return them in insert-race order
   * and breaking the tool→Output pairing in StepTracker.classifyMessages.
   * By pinning each subsequent timestamp to `max(Date.now(), lastTs + 1)`
   * we guarantee monotonically increasing millis even under burst writes.
   */
  private lastMessageTs = 0;

  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly messageRepo: IInteractiveMessageRepository,
    private readonly executorFactory: IAgentExecutorFactory,
    private readonly featureRepo: IFeatureRepository,
    private readonly contextBuilder: FeatureContextBuilder,
    private readonly workflowStepRepo: IWorkflowStepRepository
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async startSession(
    featureId: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    initialUserMessage?: string
  ): Promise<InteractiveSession> {
    const cap = this.getCap();
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
    for (const [, s] of this.sessions) {
      if (s.featureId === featureId && s.agentSessionId) {
        previousAgentSessionId = s.agentSessionId;
        break;
      }
    }
    // Also check stoppedSessions cache (populated on stop)
    previousAgentSessionId ??= this.stoppedAgentSessionIds.get(featureId);
    // Fall back to DB — the in-memory cache may be empty after
    // service restart, hot reload, or Turbopack module re-init.
    //
    // Use `findLatestAgentSessionIdForFeature` (not `findByFeatureId`
    // → `getAgentSessionId`) so we walk BACK through history to find
    // the most recent session that actually captured an
    // agentSessionId. This covers the case where the latest row is a
    // failed-boot session with a NULL agentSessionId — without this,
    // one bad boot would permanently orphan the agent conversation.
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
    this.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      sessionStatus: InteractiveSessionStatus.booting,
    });

    // Mark as processing immediately so the FAB shows the spinner during boot
    void this.updateTurnStatusAndNotify(session.id, featureId, 'processing');

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
    this.sessions.set(session.id, state);

    // Fire-and-forget the async boot sequence. The API returns the session
    // immediately in "booting" status; the frontend polls until "ready".
    void this.completeBootAsync(state, featureId, worktreePath);

    return session;
  }

  /**
   * Asynchronously complete the boot sequence: build feature context,
   * create an SDK session via the interactive executor, send the boot
   * prompt, iterate the stream for the greeting, persist the greeting,
   * and transition the session to "ready".
   */
  private async completeBootAsync(
    state: SessionState,
    featureId: string,
    worktreePath: string
  ): Promise<void> {
    try {
      // Resolve the system prompt for the agent SDK. If the caller
      // supplied one (e.g. Application chat uses the Shep brief,
      // Repository/Global chats their own), use it verbatim. Otherwise
      // fall back to the default feature-context prompt — that's still
      // the right thing for classic `feat-*` scopes where the session
      // service owns context-building.
      let context: string;
      if (state.systemPrompt !== undefined) {
        context = state.systemPrompt;
      } else {
        const feature = await this.featureRepo.findById(featureId);
        const openPRs: string[] = feature?.pr?.url ? [feature.pr.url] : [];
        context = this.contextBuilder.buildContext(
          feature ??
            ({ id: featureId, name: featureId } as Parameters<
              FeatureContextBuilder['buildContext']
            >[0]),
          worktreePath,
          openPRs
        );
      }

      // Decide what to send as the first turn (`handle.send(bootPrompt)`
      // below). The chat is stateless from the agent's point of view —
      // no prior history is injected, no session-restart rules, no
      // "conversation log read-only" wrapper. Three cases:
      //
      // 1. User already sent a message that booted this session
      //    (Application chat, or any scope that calls sendUserMessage
      //    cold) → that pending content IS the first turn.
      //
      // 2. No pending message AND no caller-supplied systemPrompt →
      //    legacy Feature-chat path: send the feature context as the
      //    boot prompt so the agent greets the user based on it.
      //
      // 3. No pending message BUT caller supplied systemPrompt →
      //    scope is self-describing; stay silent and wait for the user
      //    to speak. Applicable to any generic scope (Application,
      //    Repository, Global) where a chatty greeting isn't wanted.
      let bootPrompt: string;
      if (state.pendingUserContent !== undefined) {
        bootPrompt = state.pendingUserContent;
        state.pendingUserContent = undefined;
      } else if (state.systemPrompt === undefined) {
        bootPrompt = context;
      } else {
        bootPrompt = '';
      }

      // Resolve agent type and auth config from settings
      const resolvedAgentType = this.resolveAgentType(state.agentType);
      const authConfig = this.resolveAuthConfig();

      // Create the interactive executor and session
      const executor = this.executorFactory.createInteractiveExecutor(
        resolvedAgentType,
        authConfig
      );
      let handle: InteractiveAgentSessionHandle;

      // Build the onUserQuestion callback that pauses the SDK stream
      // and waits for user input via the UI.
      const onUserQuestion = this.buildOnUserQuestionCallback(state);

      const previousAgentSessionId = state.agentSessionId;
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
        await this.updateSessionStatusAndNotify(
          state.sessionId,
          state.featureId,
          InteractiveSessionStatus.ready
        );
        void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
        return;
      }

      // Send the boot prompt and iterate stream for the greeting
      await handle.send(bootPrompt);

      // No longer needed as a local — delta text is accumulated into
      // `state.currentAssistantBuffer` and flushed inline alongside
      // tool events via `flushAssistantBuffer`.
      const bootAbort = new AbortController();
      state.streamAbort = bootAbort;

      // Idle watchdog: reset on every event. If the agent goes silent
      // for longer than BOOT_IDLE_TIMEOUT_MS, abort the boot. This is
      // NOT a wall-clock budget — long first turns (full project
      // scaffold + install + build) are fine as long as the stream
      // keeps producing events.
      let bootTimeout: NodeJS.Timeout = setTimeout(() => {
        bootAbort.abort();
      }, BOOT_IDLE_TIMEOUT_MS);
      const bumpBootWatchdog = () => {
        clearTimeout(bootTimeout);
        bootTimeout = setTimeout(() => {
          bootAbort.abort();
        }, BOOT_IDLE_TIMEOUT_MS);
      };

      try {
        for await (const event of handle.stream()) {
          if (bootAbort.signal.aborted) {
            throw new Error(
              `Agent boot stalled for ${BOOT_IDLE_TIMEOUT_MS / 1000}s with no stream activity`
            );
          }

          // Any event = proof of life. Reset the boot watchdog so a
          // long-running first turn (full project scaffold) isn't
          // killed as long as the stream keeps producing events.
          bumpBootWatchdog();

          switch (event.type) {
            case 'delta':
              if (event.content) {
                state.currentAssistantBuffer += event.content;
                this.notify(state, { delta: event.content, done: false });
              }
              break;

            case 'thinking':
              if (event.content) {
                await this.persistToolEvent(state, 'Thinking', event.content);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: 'Thinking…',
                  activity: { kind: 'thinking', label: 'Thinking', detail: event.content },
                });
              }
              break;

            case 'tool_use':
              if (event.label) {
                const toolLabel = event.label;
                const toolDetail = event.detail;
                await this.persistToolEvent(state, toolLabel, toolDetail);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: `Using tool: ${toolLabel}`,
                  activity: { kind: 'tool_use', label: toolLabel, detail: toolDetail },
                });
              }
              break;

            case 'tool_result':
              if (event.label) {
                const resultLabel = event.label;
                const resultDetail = event.detail;
                await this.persistToolEvent(state, resultLabel, resultDetail);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: `Completed: ${resultLabel}`,
                  activity: { kind: 'tool_result', label: resultLabel, detail: resultDetail },
                });
              }
              break;

            case 'status':
              if (event.content) {
                const statusContent = event.content;
                this.notify(state, { delta: '', done: false, log: statusContent });
              }
              break;

            case 'done': {
              // All delta text is persisted incrementally via
              // `flushAssistantBuffer` inside `persistToolEvent`, so by
              // the time `done` fires the buffer only holds the trailing
              // prose that came after the last tool call (often the
              // final step confirmation). Flush it here as its own
              // message — persisting `event.content`/`greetingText`
              // would duplicate everything we already flushed between
              // tools.
              await this.flushAssistantBuffer(state);

              // Capture the SDK session ID (available after first message exchange)
              const sdkSessionId = handle.sessionId;
              if (sdkSessionId) {
                // Detect CWD mismatch: if we tried to resume but got a different
                // session ID, the SDK silently created a fresh session (typically
                // because the cwd changed or session JSONL was lost).
                if (previousAgentSessionId && sdkSessionId !== previousAgentSessionId) {
                  // eslint-disable-next-line no-console
                  console.warn(
                    `[InteractiveSession] Session resume mismatch for feature ${featureId}: ` +
                      `expected ${previousAgentSessionId}, got ${sdkSessionId}. ` +
                      `SDK created a fresh session (likely cwd changed or session expired).`
                  );
                }
                state.agentSessionId = sdkSessionId;
                // Persist to DB so it survives service restarts
                void this.sessionRepo.updateAgentSessionId(state.sessionId, sdkSessionId);
              }

              await this.updateSessionStatusAndNotify(
                state.sessionId,
                state.featureId,
                InteractiveSessionStatus.ready
              );

              // If there's a pending user message, the next turn will set 'processing'.
              // Otherwise boot greeting is expected — mark idle.
              if (!state.pendingUserContent) {
                void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
              }

              state.currentAssistantBuffer = '';
              state.toolEventsLog = [];

              // Notify subscribers of end-of-turn
              this.notify(state, { delta: '', done: true });
              return; // Boot complete
            }

            case 'error':
              throw new Error(`Agent error during boot: ${event.content ?? 'unknown'}`);
          }
        }
      } finally {
        clearTimeout(bootTimeout);
        state.streamAbort = undefined;
      }

      // If we get here without a 'done' event, persist whatever
      // trailing text remains in the buffer (earlier text was already
      // flushed incrementally alongside tool events).
      await this.flushAssistantBuffer(state);
      await this.updateSessionStatusAndNotify(
        state.sessionId,
        state.featureId,
        InteractiveSessionStatus.ready
      );
      if (!state.pendingUserContent) {
        void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
      }
      state.currentAssistantBuffer = '';
      state.toolEventsLog = [];
    } catch (err) {
      // If session was already cleaned up by stopSession, nothing more to do
      if (!this.sessions.has(state.sessionId)) return;

      // Boot failed — mark session as error so the frontend can show the failure
      // eslint-disable-next-line no-console
      console.error(`[InteractiveSession] boot failed for session ${state.sessionId}:`, err);
      try {
        await this.updateSessionStatusAndNotify(
          state.sessionId,
          state.featureId,
          InteractiveSessionStatus.error
        );
      } catch {
        // Best-effort DB update
      }
      if (state.agentSessionId) {
        this.stoppedAgentSessionIds.set(state.featureId, state.agentSessionId);
      }
      this.sessions.delete(state.sessionId);
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      // Already stopped — idempotent
      return;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[InteractiveSession] stopSession called for ${sessionId} (feature: ${state.featureId})`,
      new Error().stack?.split('\n').slice(1, 4).join(' <- ')
    );

    // Abort any active stream iteration and clear pending turns
    if (state.streamAbort) {
      state.streamAbort.abort();
      state.streamAbort = undefined;
    }
    state.turnQueue.length = 0;
    state.turnInProgress = false;

    // Cache agentSessionId so resumption works when session restarts
    if (state.agentSessionId) {
      this.stoppedAgentSessionIds.set(state.featureId, state.agentSessionId);
    }
    this.sessions.delete(sessionId);

    // Close the SDK session handle
    if (state.handle) {
      try {
        await state.handle.close();
      } catch {
        // Session may already be closed
      }
      state.handle = null;
    }

    await this.updateSessionStatusAndNotify(
      sessionId,
      state.featureId,
      InteractiveSessionStatus.stopped,
      new Date()
    );
    void this.updateTurnStatusAndNotify(sessionId, state.featureId, 'idle');
  }

  async sendMessage(sessionId: string, content: string): Promise<InteractiveMessage> {
    const dbSession = await this.sessionRepo.findById(sessionId);
    if (!dbSession || dbSession.status !== InteractiveSessionStatus.ready) {
      throw new Error(`Session ${sessionId} is not ready — cannot send message`);
    }

    const state = this.sessions.get(sessionId);
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
    await this.persistMessage(message);

    await this.sessionRepo.updateLastActivity(sessionId, now);

    // Guard: only one turn at a time per session (SDK stream is not concurrent-safe)
    if (state.turnInProgress) {
      state.turnQueue.push(content);
    } else {
      state.turnInProgress = true;
      void this.executeAndPersistTurn(state, content);
    }

    return message;
  }

  /**
   * Execute a turn via the SDK session handle and persist the assistant response.
   */
  private async executeAndPersistTurn(state: SessionState, prompt: string): Promise<void> {
    try {
      if (!state.handle) {
        throw new Error('No active session handle — cannot execute turn');
      }

      state.currentAssistantBuffer = '';
      state.toolEventsLog = [];

      // Mark turn as processing for dot indicator
      void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'processing');

      // Send the message to the SDK session
      await state.handle.send(prompt);

      // Set up abort controller for this stream
      const abort = new AbortController();
      state.streamAbort = abort;

      let responseText = '';

      try {
        for await (const event of state.handle.stream()) {
          if (abort.signal.aborted) break;

          switch (event.type) {
            case 'delta':
              if (event.content) {
                responseText += event.content;
                state.currentAssistantBuffer += event.content;
                this.notify(state, { delta: event.content!, done: false });
              }
              break;

            case 'thinking':
              if (event.content) {
                await this.persistToolEvent(state, 'Thinking', event.content);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: 'Thinking…',
                  activity: { kind: 'thinking', label: 'Thinking', detail: event.content },
                });
              }
              break;

            case 'tool_use':
              if (event.label) {
                const toolLabel = event.label;
                const toolDetail = event.detail;
                await this.persistToolEvent(state, toolLabel, toolDetail);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: `Using tool: ${toolLabel}`,
                  activity: { kind: 'tool_use', label: toolLabel, detail: toolDetail },
                });
              }
              break;

            case 'tool_result':
              if (event.label) {
                const resultLabel = event.label;
                const resultDetail = event.detail;
                await this.persistToolEvent(state, resultLabel, resultDetail);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: `Completed: ${resultLabel}`,
                  activity: { kind: 'tool_result', label: resultLabel, detail: resultDetail },
                });
              }
              break;

            case 'status':
              if (event.content) {
                const statusContent = event.content;
                this.notify(state, { delta: '', done: false, log: statusContent });
              }
              break;

            case 'done': {
              // All delta text has been persisted incrementally via
              // `flushAssistantBuffer` as each tool call was recorded,
              // so the remaining buffer holds only the trailing prose
              // after the final tool call. Flush it as its own message.
              // We intentionally do NOT persist `event.content` /
              // `responseText` here — that would duplicate everything
              // we already flushed between tools.
              await this.flushAssistantBuffer(state);
              state.toolEventsLog = [];

              // Accumulate usage from this turn
              if (event.usage) {
                void this.sessionRepo.accumulateUsage(state.sessionId, {
                  costUsd: event.usage.costUsd ?? 0,
                  inputTokens: event.usage.inputTokens ?? 0,
                  outputTokens: event.usage.outputTokens ?? 0,
                  turns: event.usage.numTurns ?? 1,
                });
              }

              // Mark as unread — if user has the chat open, the frontend
              // will immediately call markRead to clear it
              void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'unread');

              // Notify subscribers of end-of-turn
              this.notify(state, { delta: '', done: true });
              return; // Turn complete
            }

            case 'error':
              // eslint-disable-next-line no-console
              console.error(
                `[InteractiveSession] agent error during turn for session ${state.sessionId}:`,
                event.content
              );
              // Accumulate usage even on errors — cost was still incurred
              if (event.usage) {
                void this.sessionRepo.accumulateUsage(state.sessionId, {
                  costUsd: event.usage.costUsd ?? 0,
                  inputTokens: event.usage.inputTokens ?? 0,
                  outputTokens: event.usage.outputTokens ?? 0,
                  turns: event.usage.numTurns ?? 1,
                });
              }
              this.notify(state, {
                delta: '',
                done: true,
                log: `Error: ${event.content ?? 'unknown'}`,
              });
              break;

            case 'init':
              // The SDK emits init on every turn, but we only show "Session started"
              // during boot (handled in completeBootAsync). Ignore it here to avoid
              // spamming the chat with repeated session-started messages.
              break;

            case 'api_retry':
              this.notify(state, {
                delta: '',
                done: false,
                log: event.content ?? 'Retrying API call...',
              });
              break;

            case 'rate_limit':
              this.notify(state, { delta: '', done: false, log: event.content ?? 'Rate limited' });
              break;

            case 'task_started':
              if (event.content) {
                await this.persistToolEvent(state, 'Subtask started', event.content);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: `Subtask: ${event.content}`,
                  activity: { kind: 'system', label: 'Subtask started', detail: event.content },
                });
              }
              break;

            case 'task_progress':
              if (event.content) {
                this.notify(state, { delta: '', done: false, log: `Subtask: ${event.content}` });
              }
              break;

            case 'task_done':
              if (event.content) {
                const taskStatus = event.detail ?? 'completed';
                await this.persistToolEvent(state, `Subtask ${taskStatus}`, event.content);
                this.notify(state, {
                  delta: '',
                  done: false,
                  log: `Subtask ${taskStatus}: ${event.content}`,
                  activity: {
                    kind: 'system',
                    label: `Subtask ${taskStatus}`,
                    detail: event.content,
                  },
                });
              }
              break;

            case 'user_question':
              // AskUserQuestion is now handled by the canUseTool callback
              // (buildOnUserQuestionCallback) which pauses the SDK stream.
              // This event should not appear in the stream anymore, but if it
              // does (e.g. from a different code path), ignore it here.
              break;
          }
        }
      } finally {
        state.streamAbort = undefined;
      }

      // If we exit the stream loop without a 'done' event (stream ended),
      // persist whatever trailing text remains in the buffer (earlier
      // text was flushed incrementally alongside tool events).
      if (responseText && state.currentAssistantBuffer) {
        await this.flushAssistantBuffer(state);
        state.toolEventsLog = [];
        this.notify(state, { delta: '', done: true });
      } else if (!responseText) {
        // Stream ended without any response — SDK session likely died.
        // Mark as error so the next message triggers a fresh session.
        // eslint-disable-next-line no-console
        console.error(
          `[InteractiveSession] stream ended without response for session ${state.sessionId} — session may have died`
        );
        this.notify(state, {
          delta: '',
          done: true,
          log: 'Session disconnected — will restart on next message',
        });
        if (state.agentSessionId) {
          this.stoppedAgentSessionIds.set(state.featureId, state.agentSessionId);
        }
        this.sessions.delete(state.sessionId);
        try {
          await this.updateSessionStatusAndNotify(
            state.sessionId,
            state.featureId,
            InteractiveSessionStatus.error
          );
        } catch {
          // Best-effort DB update
        }
        return; // Skip queue drain — session is dead
      }
    } catch (err) {
      // If session was already stopped, ignore
      if (!this.sessions.has(state.sessionId)) return;
      // eslint-disable-next-line no-console
      console.error(`[InteractiveSession] turn failed for session ${state.sessionId}:`, err);
    } finally {
      // Release the turn lock and drain the queue
      state.turnInProgress = false;
      if (this.sessions.has(state.sessionId) && state.turnQueue.length > 0) {
        const nextContent = state.turnQueue.shift()!;
        state.turnInProgress = true;
        void this.executeAndPersistTurn(state, nextContent);
      }
    }
  }

  async getMessages(featureId: string, limit?: number): Promise<InteractiveMessage[]> {
    return this.messageRepo.findByFeatureId(featureId, limit);
  }

  async clearMessages(featureId: string): Promise<void> {
    // Stop any active session so the agent doesn't retain old context
    const state = this.findActiveStateForFeature(featureId);
    if (state) {
      await this.stopSession(state.sessionId);
    }
    // Also clear the cached agentSessionId so next session starts fresh
    this.stoppedAgentSessionIds.delete(featureId);
    await this.workflowStepRepo.deleteByFeatureId(featureId);
    this.activeStepByFeature.delete(featureId);
    return this.messageRepo.deleteByFeatureId(featureId);
  }

  async getSession(sessionId: string): Promise<InteractiveSession | null> {
    return this.sessionRepo.findById(sessionId);
  }

  subscribe(sessionId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn {
    const state = this.sessions.get(sessionId);
    if (!state) {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return () => {};
    }
    state.subscribers.add(onChunk);
    return () => state.subscribers.delete(onChunk);
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
    //    of a user message it already wrote in the foreground (so the
    //    chat renders the bubble instantly, long before the slow
    //    scaffold and session-boot work completes).
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
      await this.persistMessage(userMsg);
    }

    // 2. Find active session for this feature
    let state = this.findActiveStateForFeature(featureId);

    // If the caller requested a different model/agent than the running session,
    // silently stop the current session so a new one boots with the new config.
    // Also clear the cached agentSessionId so we create a fresh SDK session
    // instead of resuming the old one (which would keep the old model).
    if (state && model && state.model !== model) {
      await this.stopSession(state.sessionId);
      this.stoppedAgentSessionIds.delete(featureId);
      state = undefined;
    } else if (state && agentType && state.agentType !== agentType) {
      await this.stopSession(state.sessionId);
      this.stoppedAgentSessionIds.delete(featureId);
      state = undefined;
    }

    if (state) {
      const dbSession = await this.sessionRepo.findById(state.sessionId);
      if (dbSession?.status === InteractiveSessionStatus.ready) {
        // Session ready — send to agent (guarded: one turn at a time)
        await this.sessionRepo.updateLastActivity(state.sessionId, now);
        if (state.turnInProgress) {
          state.turnQueue.push(content);
        } else {
          state.turnInProgress = true;
          void this.executeAndPersistTurn(state, content);
        }
      } else if (dbSession?.status === InteractiveSessionStatus.booting) {
        // Session booting — queue the message
        state.pendingUserContent = content;
      }
    } else {
      // No in-memory session — check DB for an orphaned active session (e.g. after
      // service restart / hot-reload) and mark it stopped before booting a new one.
      // The agentSessionId is persisted in DB so startSession will pick it up for
      // SDK session resumption.
      const dbSession = await this.sessionRepo.findByFeatureId(featureId);
      if (
        dbSession &&
        (dbSession.status === InteractiveSessionStatus.ready ||
          dbSession.status === InteractiveSessionStatus.booting)
      ) {
        await this.updateSessionStatusAndNotify(
          dbSession.id,
          featureId,
          InteractiveSessionStatus.stopped,
          new Date()
        );
      }

      // Boot a new session — startSession will find the agentSessionId from DB.
      // Pass the first-turn content as `initialUserMessage` so it's
      // written to the session state atomically BEFORE completeBootAsync
      // is dispatched. Do NOT set pendingUserContent after startSession
      // returns — that races with the async boot and results in the
      // first turn being silently dropped.
      //
      // When the caller supplies `agentKickoffOverride` (e.g. the
      // application-creation flow's "read SHEP_BRIEF.md first"
      // directive), the agent's first turn uses the override while the
      // DB-persisted user message keeps the raw `content` untouched —
      // so the chat UI still shows just the user's verbatim request.
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
    const state = this.findActiveStateForFeature(featureId);
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
      // No in-memory state — check DB for last session (e.g. after server restart / hot-reload)
      const latest = await this.sessionRepo.findByFeatureId(featureId);
      if (latest) {
        sessionStatus = latest.status as string;
        // Show DB info even without live process (process was lost on restart)
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
      // Check DB for the latest session's turn status
      const latest = await this.sessionRepo.findByFeatureId(featureId);
      if (latest) {
        const statuses = await this.sessionRepo.getTurnStatuses([featureId]);
        turnStatus = statuses.get(featureId) ?? 'idle';
      }
    }

    // Include pending interaction if one exists
    const pendingInteraction = state?.pendingInteraction ?? null;

    // ── Workflow view — derived entirely from the DB so a browser
    // refresh or daemon restart sees the exact same progress state.
    // A step row in `running` status means the orchestrator had
    // started that step before the crash; recovery flips it to
    // `interrupted` at boot so we never show stale "running" after
    // the daemon dies.
    const workflowSteps = await this.workflowStepRepo.listByFeature(featureId);
    let workflow: ChatState['workflow'] = null;
    if (workflowSteps.length > 0) {
      const running = workflowSteps.find((s) => s.status === WorkflowStepStatus.running);
      workflow = {
        workflowId: workflowSteps[0].workflowId,
        steps: workflowSteps,
        currentStepId: running?.id ?? null,
      };
      // Derive turnStatus from the workflow: if any step is running,
      // the agent is working — regardless of whether the in-memory
      // session has been reloaded yet. This is the fix for "lose
      // in-progress after refresh": the answer is always a SELECT.
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
    // Subscribe at the feature level so the callback survives session restarts.
    // When a session dies (idle timeout, error) and a new one boots, the SSE
    // connection keeps receiving events from the new session automatically.
    let subs = this.featureSubscribers.get(featureId);
    if (!subs) {
      subs = new Set();
      this.featureSubscribers.set(featureId, subs);
    }
    subs.add(onChunk);
    return () => {
      subs!.delete(onChunk);
      if (subs!.size === 0) {
        this.featureSubscribers.delete(featureId);
      }
    };
  }

  subscribeAll(onChunk: (featureId: string, chunk: StreamChunk) => void): UnsubscribeFn {
    this.globalSubscribers.add(onChunk);
    return () => {
      this.globalSubscribers.delete(onChunk);
    };
  }

  async stopByFeature(featureId: string): Promise<void> {
    const state = this.findActiveStateForFeature(featureId);
    if (!state) return;
    await this.stopSession(state.sessionId);
  }

  async markRead(featureId: string): Promise<void> {
    // Find the active session for this feature and clear unread status
    const state = this.findActiveStateForFeature(featureId);
    if (state) {
      void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
      return;
    }
    // Fallback: check DB for the latest active session
    const latest = await this.sessionRepo.findByFeatureId(featureId);
    if (latest) {
      void this.updateTurnStatusAndNotify(latest.id, featureId, 'idle');
    }
  }

  async getTurnStatuses(featureIds: string[]): Promise<Map<string, string>> {
    return this.sessionRepo.getTurnStatuses(featureIds);
  }

  async getAllActiveTurnStatuses(): Promise<Map<string, string>> {
    return this.sessionRepo.getAllActiveTurnStatuses();
  }

  async respondToInteraction(featureId: string, answers: Record<string, string>): Promise<void> {
    const state = this.findActiveStateForFeature(featureId);
    if (!state?.pendingInteraction || !state.pendingInteractionResolver) {
      throw new Error(`No pending interaction for feature ${featureId}`);
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
    await this.persistMessage(userMsg);

    // Resolve the Promise that the canUseTool callback is awaiting.
    // This unblocks the SDK stream — the agent resumes with the user's answers.
    state.pendingInteractionResolver(answers);

    // Clear pending interaction state
    state.pendingInteraction = null;
    state.pendingInteractionResolver = null;

    // Update turn status back to processing
    void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'processing');

    // Clear the "Waiting for your response..." log
    state.subscribers.forEach((sub) => sub({ delta: '', done: false }));
  }

  // ---------------------------------------------------------------------------
  // Workflow orchestrator hooks
  // ---------------------------------------------------------------------------

  setActiveStep(featureId: string, stepId: string): void {
    this.activeStepByFeature.set(featureId, stepId);
  }

  clearActiveStep(featureId: string): void {
    this.activeStepByFeature.delete(featureId);
  }

  notifyWorkflowStep(featureId: string, step: WorkflowStep): void {
    this.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      workflowStep: step,
    });
  }

  /**
   * Resolves the next time any subscriber receives a `done: true`
   * chunk for the given feature. The orchestrator subscribes BEFORE
   * sending the step prompt so the resolution can't race with the
   * agent finishing before the promise is set up.
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

  /**
   * Build the onUserQuestion callback for a session.
   * Called by the SDK's canUseTool when the agent invokes AskUserQuestion.
   * Returns a Promise that doesn't resolve until the user submits their answers.
   */
  private buildOnUserQuestionCallback(state: SessionState) {
    return async (interaction: UserInteractionData): Promise<Record<string, string>> => {
      // Flush any accumulated assistant text as a separate message BEFORE
      // the interaction. This ensures the agent's question text appears
      // above the green answer bubble in the conversation history.
      if (state.currentAssistantBuffer.trim()) {
        const now = new Date();
        const msg: InteractiveMessage = {
          id: crypto.randomUUID(),
          featureId: state.featureId,
          sessionId: state.sessionId,
          role: InteractiveMessageRole.assistant,
          content: state.currentAssistantBuffer,
          createdAt: now,
          updatedAt: now,
        };
        await this.persistMessage(msg);
        state.currentAssistantBuffer = '';
        state.toolEventsLog = [];

        // Notify subscribers so the frontend picks up the new message
        state.subscribers.forEach((sub) => sub({ delta: '', done: true }));
        // Small delay so the refetch completes before the interaction appears
        await new Promise<void>((r) => setTimeout(r, 100));
      }

      // Store the interaction data for the frontend
      state.pendingInteraction = interaction;

      // Update turn status so the dot indicator shows amber
      void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'awaiting_input');

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

  /** Find the in-memory state for an active session for a feature. */
  private findActiveStateForFeature(featureId: string): SessionState | undefined {
    for (const state of this.sessions.values()) {
      if (state.featureId === featureId) return state;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Agent resolution helpers
  // ---------------------------------------------------------------------------

  /** Resolve the agent type from an explicit override or settings. */
  private resolveAgentType(agentTypeOverride?: string): AgentType {
    if (agentTypeOverride) {
      return agentTypeOverride as AgentType;
    }
    if (hasSettings()) {
      return getSettings().agent.type;
    }
    return AgentType.ClaudeCode;
  }

  /** Resolve the auth config from settings, with a safe fallback. */
  private resolveAuthConfig(): AgentConfig {
    if (hasSettings()) {
      return getSettings().agent;
    }
    // Fallback for when settings haven't been initialized yet
    return {
      type: AgentType.ClaudeCode,
      authMethod: AgentAuthMethod.Session,
    };
  }

  // ---------------------------------------------------------------------------
  // Tool detail extraction
  // ---------------------------------------------------------------------------

  /**
   * Persist a tool/system event as its own assistant message in the DB.
   * Each event gets its own bubble in the chat thread.
   *
   * Before writing the tool row, any prose the agent produced since the
   * last flush is persisted as its own text message so that step cards
   * interleave agent text with tool calls instead of collapsing every
   * step's narration into one blob at `done`.
   */
  private async persistToolEvent(
    state: SessionState,
    label: string,
    detail?: string
  ): Promise<void> {
    try {
      await this.flushAssistantBuffer(state);
      const content = detail ? `**${label}** \`${detail}\`` : `**${label}**`;
      const now = this.nextMessageDate();
      const msg: InteractiveMessage = {
        id: crypto.randomUUID(),
        featureId: state.featureId,
        sessionId: state.sessionId,
        role: InteractiveMessageRole.assistant,
        content,
        createdAt: now,
        updatedAt: now,
      };
      await this.persistMessage(msg);
    } catch {
      // Non-critical — don't fail the turn for a tool event
    }
  }

  /**
   * Persist whatever text has accumulated in `currentAssistantBuffer`
   * as its own assistant message, then clear the buffer. Called right
   * before each tool event so the DB history interleaves agent prose
   * with tool calls — the step tracker groups messages by their
   * persisted `stepId`, so without the flush everything the agent said
   * mid-step ends up in one trailing blob (or tagged to no step at all
   * if the orchestrator has already cleared activeStep by the time
   * `done` fires).
   */
  private async flushAssistantBuffer(state: SessionState): Promise<void> {
    const buffered = state.currentAssistantBuffer.trim();
    if (!buffered) return;
    state.currentAssistantBuffer = '';
    const now = this.nextMessageDate();
    const msg: InteractiveMessage = {
      id: crypto.randomUUID(),
      featureId: state.featureId,
      sessionId: state.sessionId,
      role: InteractiveMessageRole.assistant,
      content: buffered,
      createdAt: now,
      updatedAt: now,
    };
    await this.persistMessage(msg);
  }

  /**
   * Produce the next monotonic timestamp for a persisted interactive
   * message. Guarantees a strictly-increasing sequence even when two
   * calls happen in the same millisecond (which is the norm for rapid
   * `tool_use` + `tool_result` bursts emitted by the Claude SDK) so
   * the repository's `ORDER BY created_at ASC` query returns rows in
   * the exact order they were persisted. Frontend classifyMessages()
   * depends on that order to pair Write/Edit/Read tool calls with
   * their adjacent Output bubble.
   */
  private nextMessageDate(): Date {
    const wallclock = Date.now();
    const next = wallclock > this.lastMessageTs ? wallclock : this.lastMessageTs + 1;
    this.lastMessageTs = next;
    return new Date(next);
  }

  // ---------------------------------------------------------------------------
  // Event dispatch
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a StreamChunk to all subscribers for a session.
   *
   * Sends to both session-level subscribers (legacy, for sessionId-based
   * subscribe()) and feature-level subscribers (for SSE connections that
   * must survive session restarts).
   */
  private notify(state: SessionState, chunk: StreamChunk): void {
    state.subscribers.forEach((sub) => sub(chunk));
    const featureSubs = this.featureSubscribers.get(state.featureId);
    if (featureSubs) {
      featureSubs.forEach((sub) => sub(chunk));
    }
    this.globalSubscribers.forEach((sub) => sub(state.featureId, chunk));
  }

  /**
   * Notify feature-level subscribers when no in-memory session state is
   * available (e.g. while persisting the user message before cold-boot).
   * Session-scoped subscribers don't exist yet at that point.
   */
  private notifyByFeatureId(featureId: string, chunk: StreamChunk): void {
    const featureSubs = this.featureSubscribers.get(featureId);
    if (featureSubs) {
      featureSubs.forEach((sub) => sub(chunk));
    }
    this.globalSubscribers.forEach((sub) => sub(featureId, chunk));
  }

  // ---------------------------------------------------------------------------
  // Mutation helpers — every DB write that changes observable state must go
  // through one of these so SSE subscribers receive a matching notification.
  // This is the contract that lets the client drop periodic polling.
  // ---------------------------------------------------------------------------

  /** Persist a message AND notify subscribers. Use everywhere instead of
   *  calling `messageRepo.create` directly. The current active workflow
   *  step for the feature (if any) is stamped onto the row so every
   *  message is grouped under the right step card in the UI. */
  private async persistMessage(message: InteractiveMessage): Promise<void> {
    const activeStepId = this.activeStepByFeature.get(message.featureId);
    const tagged: InteractiveMessage =
      message.stepId || !activeStepId ? message : { ...message, stepId: activeStepId };
    await this.messageRepo.create(tagged);
    this.notifyByFeatureId(tagged.featureId, {
      delta: '',
      done: false,
      message: tagged,
    });
  }

  /** Update session status AND notify subscribers. Passes `endedAt` to
   *  the repo only when supplied so call-arity matches the legacy
   *  two-argument shape (keeps existing test expectations happy). */
  private async updateSessionStatusAndNotify(
    sessionId: string,
    featureId: string,
    status: InteractiveSessionStatus,
    endedAt?: Date
  ): Promise<void> {
    if (endedAt === undefined) {
      await this.sessionRepo.updateStatus(sessionId, status);
    } else {
      await this.sessionRepo.updateStatus(sessionId, status, endedAt);
    }
    this.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      sessionStatus: status,
    });
  }

  /** Update turn status AND notify subscribers. */
  private async updateTurnStatusAndNotify(
    sessionId: string,
    featureId: string,
    turnStatus: string
  ): Promise<void> {
    await this.sessionRepo.updateTurnStatus(sessionId, turnStatus);
    this.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      turnStatus,
    });
  }

  // Idle-eviction timer removed. Live agent sessions are preserved
  // indefinitely and only stop on an explicit user action (Stop
  // button, new session reset, server shutdown). See `stopSession`
  // for the only teardown path.

  /** Read the concurrent session cap from settings or fall back to default. */
  private getCap(): number {
    if (!hasSettings()) return DEFAULT_CAP;
    const settings = getSettings();
    return settings.interactiveAgent?.maxConcurrentSessions ?? DEFAULT_CAP;
  }
}
