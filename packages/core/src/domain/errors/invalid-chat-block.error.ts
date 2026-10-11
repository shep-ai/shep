/**
 * Invalid Chat Block Error (spec 137)
 *
 * Thrown when a block an agent posts, or a user's answer to one, breaks a rule
 * of the chat-block codec (missing field, unknown type, an action the block
 * does not take, a size cap). The message is written for the agent or person
 * who sent it, so the CLI and MCP adapters print it as is. Web routes match on
 * `code` (no `instanceof` across bundles — see `lib/error-code.ts`).
 */
export const INVALID_CHAT_BLOCK_CODE = 'INVALID_CHAT_BLOCK';

export class InvalidChatBlockError extends Error {
  readonly code = INVALID_CHAT_BLOCK_CODE;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChatBlockError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
