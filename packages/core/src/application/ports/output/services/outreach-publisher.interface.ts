/**
 * Outreach Publisher Port
 *
 * Output port for posting outreach messages drafted by the contributor
 * pipeline to external channels. v1 supports Discord only (resolved spec
 * product-question 4) — Reddit/HN/X adapters can land later behind the
 * same port without rewriting callers.
 *
 * Implementations MUST:
 *   - Source credentials from existing config (no new secret storage).
 *   - Never log the bot token at any level (NFR-9 / spec security note).
 *
 * Posting itself is gated through `ISupervisorAgent.evaluate(...)` upstream
 * (NFR-5); the publisher trusts that gate has already authorized the call.
 */

/**
 * Result of a successful outreach publish.
 */
export interface OutreachResult {
  /** Channel-native id of the posted message (e.g. Discord message id). */
  messageId: string;
  /** ISO 8601 timestamp the channel reported as the post's `created_at`. */
  postedAt: string;
}

/**
 * Output port for outreach publishing.
 */
export interface IOutreachPublisher {
  /**
   * Post `body` to the given Discord channel.
   *
   * @param channelId Discord channel snowflake id.
   * @param body Markdown-flavored Discord message body.
   * @throws when the bot token is missing, when the channel rejects the
   *   request (4xx), or when the transport fails (5xx, network).
   */
  publishToDiscord(channelId: string, body: string): Promise<OutreachResult>;
}

/**
 * Base error for outreach publisher failures.
 */
export class OutreachPublisherError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'OutreachPublisherError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (cause) this.cause = cause;
  }
}
