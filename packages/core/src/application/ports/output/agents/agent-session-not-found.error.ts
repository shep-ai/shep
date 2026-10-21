/**
 * Raised by an {@link IInteractiveAgentExecutor} when the agent reports that
 * the conversation it was asked to resume no longer exists on its side —
 * deleted, expired, or never written. Resuming that id again can never work,
 * so callers forget it and start a new conversation instead of retrying.
 *
 * Each executor translates its own provider's signal into this error; the
 * provider's wording stays inside that adapter. Transient failures (network,
 * API errors) must NOT use it: those keep the id so a later resume can work.
 */
export class AgentSessionNotFoundError extends Error {
  constructor(
    /** The agent session id that could not be resumed. */
    public readonly agentSessionId: string,
    /** The agent's own explanation, when it gave one. */
    public readonly agentMessage?: string
  ) {
    super(
      `The agent no longer has conversation ${agentSessionId}${agentMessage ? `: ${agentMessage}` : ''}`
    );
    this.name = 'AgentSessionNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
