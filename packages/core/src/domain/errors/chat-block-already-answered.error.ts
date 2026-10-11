/**
 * Chat Block Already Answered Error (spec 137)
 *
 * A block takes one answer: a second click (another tab, a double submit)
 * must not send the agent the same instruction twice. Web routes answer 409,
 * matching on `code`.
 */
export const CHAT_BLOCK_ALREADY_ANSWERED_CODE = 'CHAT_BLOCK_ALREADY_ANSWERED';

export class ChatBlockAlreadyAnsweredError extends Error {
  readonly code = CHAT_BLOCK_ALREADY_ANSWERED_CODE;
  constructor(public readonly blockId: string) {
    super(`Block ${blockId} has already been answered.`);
    this.name = 'ChatBlockAlreadyAnsweredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
