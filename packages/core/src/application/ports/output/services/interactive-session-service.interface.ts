/**
 * Interactive Session Service Interface
 *
 * Output port for managing per-feature interactive agent sessions.
 * Handles session lifecycle (start, stop), message I/O, and real-time
 * stdout streaming to SSE consumers.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides the concrete implementation (singleton)
 */

import type {
  InteractiveSession,
  InteractiveMessage,
  WorkflowStep,
} from '../../../../domain/generated/output.js';
import type { UserInteractionData } from '../agents/interactive-agent-executor.interface.js';

/**
 * A single streaming chunk forwarded from the interactive session to an
 * SSE consumer. One shape carries every kind of real-time update the UI
 * needs — text deltas, tool activity, interaction requests, AND every
 * persisted-state change (new messages, session/turn status transitions)
 * — so the client can rely on SSE as the single source of truth and
 * drop all periodic polling.
 */
export interface StreamChunk {
  /** Incremental output text from the agent */
  delta: string;
  /** True when the agent has finished this response turn */
  done: boolean;
  /** Optional log entry for tool use / thinking events (shown as status indicator) */
  log?: string;
  /** Structured activity event for rich rendering in the thread */
  activity?: StreamActivity;
  /** Pending user interaction (AskUserQuestion) — agent is waiting for user response */
  interaction?: UserInteractionData;
  /**
   * A newly persisted message (user or assistant, including tool-event
   * messages). Emitted ONCE per `messageRepo.create` call so subscribers
   * can append it to their local cache without refetching the whole
   * history. Idempotent on the client by `message.id`.
   */
  message?: InteractiveMessage;
  /**
   * Session lifecycle transition: 'booting' → 'ready' → 'error' / 'stopped'.
   * Emitted ONCE per `sessionRepo.updateStatus` call.
   */
  sessionStatus?: string;
  /**
   * Turn activity transition: 'idle' / 'processing' / 'unread' /
   * 'awaiting_input'. Emitted ONCE per `sessionRepo.updateTurnStatus`
   * call. This is what drives the client's "Thinking…" indicator
   * without polling.
   */
  turnStatus?: string;
  /**
   * Workflow step transition — emitted by the orchestrator each time
   * a step changes status (pending → running → done / failed /
   * interrupted). Clients use this to update the tracker live
   * without polling; full state is always also recoverable from
   * `getChatState()` so a missed event is never fatal.
   */
  workflowStep?: WorkflowStep;
}

/**
 * A structured activity event emitted during agent execution.
 * Rendered as a distinct inline entry in the chat thread.
 */
export interface StreamActivity {
  kind: 'tool_use' | 'tool_result' | 'thinking' | 'system';
  /** Tool name or system event label */
  label: string;
  /** Human-readable detail (file path, command, pattern, etc.) */
  detail?: string;
}

/**
 * Function returned by subscribe() to remove the listener.
 */
export type UnsubscribeFn = () => void;

/**
 * Chat state returned by getChatState — single response for the frontend.
 */
export interface ChatState {
  /** All persisted messages for the feature, ordered by created_at ASC */
  messages: InteractiveMessage[];
  /** Status of the active session (null if no session exists) */
  sessionStatus: string | null;
  /** In-progress streaming text from the agent (null when idle) */
  streamingText: string | null;
  /** Session info for the toolbar (null if no active session) */
  sessionInfo: SessionInfo | null;
  /** Turn activity status: 'idle' | 'processing' | 'unread' | 'awaiting_input' (for dot indicators) */
  turnStatus: string;
  /** Pending user interaction — agent is waiting for user response (null when no interaction pending) */
  pendingInteraction: UserInteractionData | null;
  /**
   * Persisted workflow view for the feature. Present when the
   * orchestrator has materialised steps in the database; null
   * otherwise. The client renders a step tracker from this field
   * instead of parsing marker strings in the message stream.
   */
  workflow: WorkflowView | null;
}

/**
 * Persisted workflow view for a feature — derived entirely from the
 * `workflow_steps` table plus a trivial "which step is running"
 * query. Because the whole shape is re-derivable from SQL, a
 * browser refresh or daemon restart never loses progress state.
 */
export interface WorkflowView {
  /** Logical workflow id (e.g. 'application-creation-v1'). */
  workflowId: string;
  /** Ordered step rows for the whole workflow. */
  steps: WorkflowStep[];
  /** ID of the step currently in `running` status, if any. */
  currentStepId: string | null;
}

/** Live session metadata for the frontend toolbar. */
export interface SessionInfo {
  pid: number | null;
  sessionId: string | null;
  model: string | null;
  startedAt: string;
  lastActivityAt: string;
  /** Cumulative cost in USD for this session (null if not yet tracked) */
  totalCostUsd: number | null;
  /** Cumulative input tokens for this session */
  totalInputTokens: number | null;
  /** Cumulative output tokens for this session */
  totalOutputTokens: number | null;
}

/**
 * Service interface for interactive session lifecycle management.
 *
 * Implementations are expected to be singletons: they maintain in-memory
 * state (process handles, timers, subscriber maps) across multiple HTTP
 * requests for the duration of the server process.
 *
 * **Polymorphic `featureId` scope key:** The `featureId` parameter used
 * throughout this interface is a polymorphic scope key that determines
 * message and session isolation:
 * - Feature chat: actual feature UUID (e.g. `"feat-abc123"`)
 * - Repository chat: repo identifier (e.g. `"repo-<repoId>"`)
 * - Global chat: literal string `"global"`
 *
 * All messages and sessions are scoped by this key regardless of chat type.
 *
 * @todo Consider renaming to `scopeId` with a `scopeType` discriminator
 *       for better type safety and clarity.
 */
export interface IInteractiveSessionService {
  /**
   * Start a new interactive session for the given feature.
   * Creates a DB record (status=booting), spawns the agent process with
   * the feature worktree as CWD, injects the feature context prompt, and
   * waits for the agent's first response before returning.
   *
   * @param featureId - The feature to associate the session with
   * @param worktreePath - Absolute path to the feature worktree (CWD for the agent)
   * @returns The newly created session record (status may still be 'booting')
   * @throws ConcurrentSessionLimitError when the configured cap is reached
   */
  startSession(
    featureId: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    initialUserMessage?: string
  ): Promise<InteractiveSession>;

  /**
   * Stop an active session: send SIGTERM to the process, cancel the idle
   * timer, and mark the DB record as stopped. Idempotent — calling on an
   * already-stopped session is a no-op.
   *
   * @param sessionId - The session to stop
   */
  stopSession(sessionId: string): Promise<void>;

  /**
   * Send a user message to the agent stdin and persist it to the DB.
   * Resets the idle timeout clock. Returns the persisted message record.
   *
   * @param sessionId - The target session
   * @param content - Message text (max 32 KB)
   * @returns The persisted InteractiveMessage
   * @throws Error if the session is not in 'ready' status
   */
  sendMessage(sessionId: string, content: string): Promise<InteractiveMessage>;

  /**
   * Return all messages for the feature, ordered by created_at ASC.
   * History is scoped per feature (not per session) for cross-session continuity.
   *
   * @param featureId - The feature whose message history to retrieve
   * @param limit - Max messages to return (default 200)
   */
  getMessages(featureId: string, limit?: number): Promise<InteractiveMessage[]>;

  /**
   * Return the most recent session for the given ID, or null if not found.
   *
   * @param sessionId - The session ID to look up
   */
  getSession(sessionId: string): Promise<InteractiveSession | null>;

  /**
   * Delete all messages for a feature (clear chat history).
   *
   * @param featureId - The feature whose messages to delete
   */
  clearMessages(featureId: string): Promise<void>;

  /**
   * Subscribe to real-time stdout chunks for a session.
   * The callback is invoked with each agent output chunk as it arrives and
   * once more with done=true when the turn ends.
   *
   * @param sessionId - The session to subscribe to
   * @param onChunk - Callback invoked with each chunk
   * @returns An unsubscribe function; call it to stop receiving events
   */
  subscribe(sessionId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn;

  // ── Feature-scoped API (frontend doesn't manage sessions) ─────────────

  /**
   * Send a user message for a feature. The service handles session lifecycle:
   * - Persists the user message to DB immediately
   * - If session is ready: sends to agent
   * - If session is booting: queues the message
   * - If no session: boots one and queues the message
   *
   * @param systemPrompt - Optional per-scope system prompt for the agent
   *   SDK. When provided (and the call boots a new session), the service
   *   uses this instead of the default feature-context prompt. Lets
   *   Application/Repository/Global chats each supply their own
   *   scope-appropriate instructions without the service needing to
   *   know anything about the scope shape.
   *
   * @returns The persisted user message
   */
  sendUserMessage(
    featureId: string,
    content: string,
    worktreePath: string,
    model?: string,
    agentType?: string,
    systemPrompt?: string,
    /**
     * When provided AND this call boots a new session, the agent's
     * very first turn content is `agentKickoffOverride` instead of
     * `content`. The UI still shows `content` in the user's first
     * bubble — this is purely the agent-side text. Used by the
     * application-creation flow to inject a "read SHEP_BRIEF.md
     * first" directive without polluting the chat transcript.
     */
    agentKickoffOverride?: string,
    /**
     * When false, SKIP the "persist a user message row for `content`"
     * step. The caller is responsible for having already written the
     * user message to the DB. Used by long-running creation flows
     * that persist the user's first bubble up-front so the chat
     * renders it instantly, and only need this call for the session
     * boot + agent-side kickoff. Defaults to `true`.
     */
    persistUserMessage?: boolean
  ): Promise<InteractiveMessage>;

  /**
   * Get the complete chat state for a feature in a single call.
   * Merges DB messages with any in-flight streaming content.
   */
  getChatState(featureId: string): Promise<ChatState>;

  /**
   * Subscribe to real-time chunks for a feature's active session.
   * Resolves the active session internally.
   */
  subscribeByFeature(featureId: string, onChunk: (chunk: StreamChunk) => void): UnsubscribeFn;

  /**
   * Subscribe to real-time chunks for EVERY active session, regardless
   * of feature. Each chunk is paired with the feature scope key it
   * came from. Used by the global turn-status SSE endpoint to push
   * sidebar activity indicators without polling.
   */
  subscribeAll(onChunk: (featureId: string, chunk: StreamChunk) => void): UnsubscribeFn;

  /**
   * Stop the active session for a feature. Kills the agent process.
   * Idempotent — no-op if no active session exists.
   */
  stopByFeature(featureId: string): Promise<void>;

  /**
   * Mark a feature's chat as read — clears the 'unread' turn status to 'idle'.
   * Called when the user opens/views the chat tab.
   */
  markRead(featureId: string): Promise<void>;

  /**
   * Get turn statuses for multiple features in a single call.
   * Returns a map of featureId → 'idle' | 'processing' | 'unread'.
   * Used by UI to show dot indicators on all chat buttons.
   */
  getTurnStatuses(featureIds: string[]): Promise<Map<string, string>>;

  /**
   * Get ALL non-idle turn statuses. No IDs needed — returns every
   * active session's status ('processing' | 'unread').
   */
  getAllActiveTurnStatuses(): Promise<Map<string, string>>;

  /**
   * Respond to a pending user interaction (AskUserQuestion).
   * Sends the user's answers back to the agent as a tool result,
   * clears the pending interaction, and resumes the agent's turn.
   *
   * @param featureId - The feature scope key
   * @param answers - Map of question text → selected answer(s)
   * @param annotations - Optional per-question annotations (notes, preview)
   */
  respondToInteraction(featureId: string, answers: Record<string, string>): Promise<void>;

  /**
   * Set the currently-active workflow step for a feature. While a
   * step is active, every message persisted via this service is
   * tagged with the step's id, so the UI can group the conversation
   * by step without parsing marker strings.
   *
   * Pass `null` (via `clearActiveStep`) when the orchestrator is
   * between steps. The mapping is in-memory only — the DB is the
   * source of truth for per-message `stepId`.
   */
  setActiveStep(featureId: string, stepId: string): void;

  /** Clear the currently-active workflow step for a feature. */
  clearActiveStep(featureId: string): void;

  /**
   * Notify subscribers of a workflow step transition. The
   * orchestrator calls this immediately after persisting a status
   * change so the client's live tracker updates without polling.
   */
  notifyWorkflowStep(featureId: string, step: WorkflowStep): void;

  /**
   * Wait until the next turn for the given feature finishes — i.e.
   * until the next `done: true` chunk arrives on the feature
   * subscription. Used by the orchestrator to serialise steps: send
   * a step's prompt, then await its agent turn to fully complete
   * before marking the step done and moving on to the next one.
   *
   * Resolves as soon as any `done` chunk is observed; the caller is
   * responsible for subscribing before triggering the turn to avoid
   * races.
   */
  waitForTurnDone(featureId: string, signal?: AbortSignal): Promise<void>;
}
