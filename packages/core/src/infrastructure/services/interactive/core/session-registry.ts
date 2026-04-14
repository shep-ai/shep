/**
 * Session Registry
 *
 * Pure in-memory state container for the interactive session service.
 * Owns three maps:
 *
 * 1. `sessions`                 — live session state indexed by sessionId.
 * 2. `stoppedAgentSessionIds`   — agent SDK session ids cached after a
 *    session stops so the next boot can resume the same SDK conversation.
 * 3. `activeStepByFeature`      — currently-active workflow step id per
 *    feature scope, consulted by `persistMessage` so every row is tagged
 *    with the right `stepId`.
 *
 * No business logic. No repo access. No logger. No imports from the
 * application layer beyond the `StreamChunk` / `UnsubscribeFn` types
 * that `SessionState` needs (and those are type-only).
 */

import type {
  StreamChunk,
  UnsubscribeFn as _UnsubscribeFn,
} from '../../../../application/ports/output/services/interactive-session-service.interface.js';
import type {
  InteractiveAgentSessionHandle,
  UserInteractionData,
} from '../../../../application/ports/output/agents/interactive-agent-executor.interface.js';

/** In-memory state for a single live session. */
export interface SessionState {
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
 * Plain in-memory state container. Methods are typed delegates over
 * the underlying `Map`s plus a few convenience lookups.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, SessionState>();
  private readonly stoppedAgentSessionIds = new Map<string, string>();
  private readonly activeStepByFeature = new Map<string, string>();

  // ── Session state ──

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, state: SessionState): void {
    this.sessions.set(sessionId, state);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  values(): IterableIterator<SessionState> {
    return this.sessions.values();
  }

  /** First in-memory state whose `featureId` matches, or undefined. */
  findActiveStateForFeature(featureId: string): SessionState | undefined {
    for (const state of this.sessions.values()) {
      if (state.featureId === featureId) return state;
    }
    return undefined;
  }

  // ── Stopped agent session id cache ──

  cacheStoppedAgentSessionId(featureId: string, agentSessionId: string): void {
    this.stoppedAgentSessionIds.set(featureId, agentSessionId);
  }

  /** Read-only access — does NOT remove the cached entry. */
  takeStoppedAgentSessionId(featureId: string): string | undefined {
    return this.stoppedAgentSessionIds.get(featureId);
  }

  deleteStoppedAgentSessionId(featureId: string): void {
    this.stoppedAgentSessionIds.delete(featureId);
  }

  // ── Active workflow step tracking ──

  setActiveStep(featureId: string, stepId: string): void {
    this.activeStepByFeature.set(featureId, stepId);
  }

  clearActiveStep(featureId: string): void {
    this.activeStepByFeature.delete(featureId);
  }

  getActiveStep(featureId: string): string | undefined {
    return this.activeStepByFeature.get(featureId);
  }
}
