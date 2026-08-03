/**
 * @module Shep.Agents.AgentSession
 *
 * An agent provider CLI session (e.g. a Claude Code conversation).
 * Sessions are read from the provider's local storage — they are not
 * stored in the Shep database. The session ID is the provider-native
 * file identifier (UUID filename without extension), keeping the
 * implementation stateless with no write-on-read index.
 */
import "../common/base.tsp";
import "../common/enums/agent-config.tsp";
import "./agent-session-message.tsp";

@doc("An agent provider CLI session (conversation record read from provider local storage)")
model AgentSession extends BaseEntity {
  @doc("Agent executor type that owns this session (e.g. claude-code)")
  agentType: AgentType;

  @doc("Tilde-abbreviated working directory path for the session (e.g. ~/repos/my-project)")
  projectPath: string;

  @doc("Total number of user and assistant messages in the session")
  messageCount: int32;

  @doc("Truncated first user message text used as a session summary preview (optional)")
  preview?: string;

  /**
   * Absolute path to the conversation file backing this session.
   *
   * For Claude Code and Codex CLI this is the JSONL transcript under the
   * provider's project directory; for Cursor it is the agent-transcript file.
   * Exposed so callers can adopt a session into a feature without
   * re-deriving the provider's on-disk path encoding themselves.
   *
   * @example "~/.claude/projects/-Users-dev-my-project/3f1a9c40.jsonl"
   */
  @doc("Absolute path to the conversation file backing this session (optional)")
  filePath?: string;

  @doc("Conversation messages — populated only in the detail view (shep session show)")
  messages?: AgentSessionMessage[];

  @doc("Timestamp of the first message in the session (optional)")
  firstMessageAt?: utcDateTime;

  @doc("Timestamp of the most recent message in the session (optional)")
  lastMessageAt?: utcDateTime;
}
