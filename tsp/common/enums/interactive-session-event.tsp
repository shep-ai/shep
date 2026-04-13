/**
 * @module Shep.Common.Enums.InteractiveSessionEvent
 *
 * Enum for interactive-session SSE event types.
 * Replaces the raw-string union previously declared inline in
 * src/presentation/web/app/api/agent-events/route.ts (clean-arch violation #6).
 */
/**
 * Types of interactive-session events emitted by the agent-events SSE stream.
 */
@doc("Types of interactive-session lifecycle events")
enum InteractiveSessionEventType {
  @doc("Session is starting up")
  Booting: "interactive_session_booting",

  @doc("Session is ready to accept input")
  Ready: "interactive_session_ready",

  @doc("Session was stopped gracefully")
  Stopped: "interactive_session_stopped",

  @doc("Session errored")
  Error: "interactive_session_error",
}
