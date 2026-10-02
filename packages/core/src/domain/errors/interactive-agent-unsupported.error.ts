/**
 * Interactive Agent Unsupported Error
 *
 * Thrown before an interactive (chat) session is started for an agent
 * whose executor has no interactive mode (`supportsInteractive` is false).
 * Raised up front — before the user's message is persisted or a session
 * row is created — so the caller gets an actionable error instead of a
 * session that fails in the background and leaves the chat waiting.
 * The chat API routes translate this to HTTP 422, matching on `code` (web
 * routes cannot use `instanceof` across bundles — see `lib/error-code.ts`).
 */
import { getAgentDescriptor } from '../shared/agent-catalog';

export const INTERACTIVE_AGENT_UNSUPPORTED_CODE = 'INTERACTIVE_AGENT_UNSUPPORTED';

export class InteractiveAgentUnsupportedError extends Error {
  readonly code = INTERACTIVE_AGENT_UNSUPPORTED_CODE;
  constructor(public readonly agentType: string) {
    const label = getAgentDescriptor(agentType)?.label ?? agentType;
    super(
      `${label} does not support chat sessions yet. Choose an agent that does in Settings, then send your message again.`
    );
    this.name = 'InteractiveAgentUnsupportedError';
    // Maintain proper prototype chain in TypeScript/ES5 targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
