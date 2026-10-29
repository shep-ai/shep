/**
 * @module Shep.Domain.Entities.TimelineEvent
 *
 * Defines the TimelineEvent entity that captures significant events in a
 * feature's timeline within the Shep AI platform. Timeline events provide
 * an audit trail of user interactions and system milestones.
 *
 * ## Timeline Purpose
 *
 * Timeline events serve multiple purposes:
 * - **Audit Trail**: Track all significant actions and decisions
 * - **History**: Provide context for how a feature evolved
 * - **Debugging**: Help understand the sequence of events
 * - **Analytics**: Enable analysis of workflow patterns
 *
 * ## Event Types
 *
 * Common timeline events include:
 * - User queries and commands
 * - Lifecycle transitions
 * - Artifact generation completions
 * - Task state changes
 * - Review decisions
 */
import "../../common/base.tsp";

/**
 * TimelineEvent Entity
 *
 * Represents a significant event in the feature's timeline. Events track
 * user interactions, system actions, and milestones throughout the SDLC
 * process. Each event captures the user query or action that triggered it.
 *
 * ## Properties
 *
 * | Property   | Type        | Required | Description                              |
 * |------------|-------------|----------|------------------------------------------|
 * | id         | UUID        | Yes      | Unique identifier (from BaseEntity)      |
 * | userQuery  | string      | Yes      | User query or action that triggered event|
 * | timestamp  | utcDateTime | Yes      | When the event occurred (read-only)      |
 * | createdAt  | utcDateTime | Yes      | When created (from BaseEntity)           |
 * | updatedAt  | utcDateTime | Yes      | When last updated (from BaseEntity)      |
 *
 * ## Example
 *
 * ```json
 * {
 *   "id": "evt-550e8400-e29b-41d4-a716-446655440000",
 *   "userQuery": "Add authentication using OAuth 2.0 with Google",
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 * ```
 *
 * ## Timeline Visualization
 *
 * Timeline events are typically displayed chronologically:
 *
 * ```
 * [10:30] User: "Add authentication using OAuth 2.0"
 *    |
 * [10:31] System: Requirements phase started
 *    |
 * [10:35] User: "Yes, include refresh tokens"
 *    |
 * [10:36] System: Research phase started
 *    |
 * [10:45] System: Plan generated for review
 *    |
 * [10:50] User: "Approved, proceed with implementation"
 * ```
 *
 * ## Immutability
 *
 * Timeline events are immutable once created. The timestamp field
 * is read-only and set by the system when the event is recorded.
 */
@doc("A significant event in the feature's timeline tracking user interactions and milestones")
model TimelineEvent extends BaseEntity {
  /**
   * The user query or action that triggered this event.
   * Captures the exact input or command that led to this
   * timeline entry being created.
   */
  @doc("The user query or action that triggered this timeline event")
  userQuery: string;

  /**
   * Timestamp indicating when this event occurred.
   * This field is read-only and automatically set by the system
   * when the event is recorded. It represents the exact moment
   * the event took place.
   */
  @doc("Timestamp when this event occurred (read-only, set by system)")
  @visibility(Lifecycle.Read)
  timestamp: utcDateTime;
}
