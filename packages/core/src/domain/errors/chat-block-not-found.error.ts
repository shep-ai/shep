/**
 * Chat Block Not Found Error (spec 137)
 *
 * The block a user answered is not in that conversation (wrong scope, or the
 * chat was cleared). Web routes answer 404, matching on `code`.
 */
export const CHAT_BLOCK_NOT_FOUND_CODE = 'CHAT_BLOCK_NOT_FOUND';

export class ChatBlockNotFoundError extends Error {
  readonly code = CHAT_BLOCK_NOT_FOUND_CODE;
  constructor(
    public readonly scope: string,
    public readonly blockId: string
  ) {
    super(`Block ${blockId} is not in conversation ${scope}.`);
    this.name = 'ChatBlockNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
