/**
 * Interactive Agent Executor Interface
 *
 * Output port for creating and managing interactive agent sessions.
 * Provides clean domain types (InteractiveAgentEvent, InteractiveAgentSessionHandle)
 * that decouple the application layer from any SDK specifics.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface and its domain types
 * - Infrastructure layer provides concrete implementations
 * - No SDK types leak through this boundary
 */

/**
 * Callback invoked when the agent calls AskUserQuestion.
 * The SDK stream is PAUSED until this resolves — the agent waits for the user's answers.
 */
export type OnUserQuestionCallback = (
  interaction: UserInteractionData
) => Promise<Record<string, string>>;

/** Options for creating/resuming an interactive agent session. */
export interface InteractiveAgentOptions {
  /** Absolute worktree path (CWD for agent) */
  cwd: string;
  /** Model override (e.g. 'claude-sonnet-4-6') */
  model?: string;
  /** Feature context string to append to system prompt */
  systemPrompt?: string;
  /**
   * Called when agent uses AskUserQuestion. Must return user's answers keyed by question text.
   * The SDK stream pauses until this resolves — the agent cannot continue without answers.
   */
  onUserQuestion?: OnUserQuestionCallback;
}

/** A single question within an AskUserQuestion tool call. */
export interface UserQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface UserQuestion {
  question: string;
  header: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
}

/** Data for a pending user interaction (AskUserQuestion). */
export interface UserInteractionData {
  toolCallId: string;
  questions: UserQuestion[];
}

/** Event emitted by an interactive agent session stream. */
export interface InteractiveAgentEvent {
  type:
    | 'delta' // Streaming text token
    | 'thinking' // Extended-thinking reasoning block (content-only, no tool)
    | 'tool_use' // Agent is calling a tool
    | 'tool_result' // Tool execution summary
    | 'status' // Status update (tool progress, compacting, etc.)
    | 'done' // Turn complete
    | 'error' // Agent error
    | 'init' // Session initialized (model, tools, version)
    | 'api_retry' // API call being retried
    | 'rate_limit' // Rate limit hit
    | 'task_started' // Background subtask started
    | 'task_progress' // Background subtask progress
    | 'task_done' // Background subtask completed/failed
    | 'user_question'; // Agent is asking the user a question (AskUserQuestion)
  content?: string;
  label?: string;
  detail?: string;
  /** Usage/cost metadata (attached to 'done' events) */
  usage?: {
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    numTurns?: number;
    durationMs?: number;
  };
  /** Interaction data (attached to 'user_question' events) */
  interaction?: UserInteractionData;
}

/** Structured tool result message sent back to the agent. */
export interface ToolResultMessage {
  toolCallId: string;
  result: unknown;
}

/** Handle to a live interactive agent session. */
export interface InteractiveAgentSessionHandle {
  /** The agent's session ID (used for resumption) */
  readonly sessionId: string;
  /** Send a user text message to the agent */
  send(message: string): Promise<void>;
  /** Send a tool result back to the agent (e.g. AskUserQuestion response) */
  sendToolResult(toolResult: ToolResultMessage): Promise<void>;
  /** Iterate response events from the agent */
  stream(): AsyncIterable<InteractiveAgentEvent>;
  /** Terminate the session gracefully */
  close(): Promise<void>;
  /** Abort the current operation immediately (kills the agent process) */
  abort(): void;
}

/** Executor interface for interactive agent sessions. */
export interface IInteractiveAgentExecutor {
  createSession(options: InteractiveAgentOptions): Promise<InteractiveAgentSessionHandle>;
  resumeSession(
    sessionId: string,
    options: InteractiveAgentOptions
  ): Promise<InteractiveAgentSessionHandle>;
}
