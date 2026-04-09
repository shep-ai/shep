/**
 * @module Shep.Agents.InteractiveMessage
 *
 * A single chat message in a per-feature interactive agent session.
 * Messages are scoped to a feature (not a session) so that history
 * persists across session restarts.
 *
 * ## Message Roles
 *
 * ```
 * user      --> message sent by the developer via the Chat tab
 * assistant --> message streamed from the agent process stdout
 * ```
 *
 * @see tsp/agents/interactive-session.tsp
 */
import "../common/base.tsp";

/**
 * Interactive Message Role
 *
 * Identifies the author of a chat message.
 *
 * | Value     | Description                               |
 * |-----------|-------------------------------------------|
 * | user      | Message sent by the human developer       |
 * | assistant | Response streamed from the agent process  |
 */
@doc("Author role for an interactive chat message")
enum InteractiveMessageRole {
  @doc("Message sent by the human developer")
  user: "user",

  @doc("Response streamed from the agent process")
  assistant: "assistant",
}

/**
 * Interactive Message
 *
 * Represents a single turn in the chat conversation for a feature.
 * Messages are scoped by featureId so the full history is available
 * across session restarts. The optional sessionId allows per-session
 * queries when needed.
 *
 * ## Properties
 *
 * | Property  | Type                   | Required | Description                                    |
 * |-----------|------------------------|----------|------------------------------------------------|
 * | id        | UUID                   | Yes      | Unique identifier (from BaseEntity)            |
 * | featureId | string                 | Yes      | Polymorphic scope key (feature/repo/global)    |
 * | sessionId | string                 | No       | Session during which the message was sent      |
 * | role      | InteractiveMessageRole | Yes      | Whether sent by user or agent                  |
 * | content   | string                 | Yes      | Full message text (finalised after streaming)  |
 * | createdAt | utcDateTime            | Yes      | When created (from BaseEntity)                 |
 * | updatedAt | utcDateTime            | Yes      | When last updated (from BaseEntity)            |
 *
 * @example
 * ```json
 * {
 *   "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "featureId": "f3e2d1c0-b9a8-47f6-e5d4-c3b2a1908070",
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "role": "user",
 *   "content": "What is the current implementation status?",
 *   "createdAt": "2026-03-22T10:05:00Z",
 *   "updatedAt": "2026-03-22T10:05:00Z"
 * }
 * ```
 */
@doc("A single chat message in a per-feature interactive agent session")
model InteractiveMessage extends BaseEntity {
  /**
   * Polymorphic scope key — not always an actual feature ID.
   * - Feature chat: actual feature UUID (e.g. "f3e2d1c0-...")
   * - Repository chat: repo identifier (e.g. "repo-<id>")
   * - Global chat: literal string "global"
   *
   * Scoped by this key (not session) for cross-session history continuity.
   * Future: consider renaming to `scopeId` + adding `scopeType` discriminator.
   * @example "f3e2d1c0-b9a8-47f6-e5d4-c3b2a1908070"
   */
  @doc("Polymorphic scope key: feature UUID, 'repo-<id>', or 'global'. Future: rename to scopeId + scopeType.")
  featureId: string;

  /**
   * The session during which this message was exchanged.
   * Optional FK; allows per-session queries while keeping history per-feature.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @doc("Session ID during which this message was sent (optional)")
  sessionId?: string;

  /**
   * Whether this message was sent by the user or the agent.
   * @example "user"
   */
  @doc("Author role: user or assistant")
  role: InteractiveMessageRole;

  /**
   * The full message text.
   * For assistant messages, this is the finalised content after streaming completes.
   * @example "What is the current implementation status?"
   */
  @doc("Full message content (finalised after streaming for assistant messages)")
  content: string;

  /**
   * Optional workflow step this message belongs to. Set by the
   * orchestrator when a message is persisted during a workflow-driven
   * turn so the UI can group messages under their step card.
   * @example "7f8a9b0c-1d2e-3f4a-5b6c-7d8e9f0a1b2c"
   */
  @doc("Optional workflow step ID this message was produced for")
  stepId?: string;
}
