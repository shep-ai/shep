/**
 * Recap Publisher Port
 *
 * Output port for publishing a generated contributor recap artifact to a
 * single channel. The use case fans out across `IRecapPublisher` adapters
 * (one per channel) using `Promise.allSettled` so a single channel failure
 * does not block the others (research decision 5, NFR-12).
 *
 * Each external side-effect is gated upstream through
 * `ISupervisorAgent.evaluate(...)` (NFR-5); the publisher trusts that gate.
 */

import type { RecapChannel } from '../../../../domain/generated/output.js';

/**
 * Generated recap artifact — a markdown document with a stable identity.
 * Produced by `GenerateMonthlyRecapUseCase`, consumed by every publisher.
 */
export interface RecapArtifact {
  /** Stable id for the recap (e.g. `2026-04`); used for deduplicating posts. */
  recapId: string;
  /** Human-readable title (e.g. "Shep — April 2026 contributor recap"). */
  title: string;
  /** Full markdown body. */
  body: string;
  /** ISO 8601 first-day-of-month for the period the recap covers. */
  periodStartIso: string;
}

/**
 * Discriminated target — which channel to publish to + channel-specific args.
 * The discriminator is the TypeSpec-generated `RecapChannel` enum (NFR-3).
 */
export type RecapTarget =
  | { channel: RecapChannel.File }
  | { channel: RecapChannel.Discord; channelId: string }
  | {
      channel: RecapChannel.GithubDiscussion;
      owner: string;
      repo: string;
      categorySlug: string;
    };

/**
 * Result of a successful publish; channel-native references for traceability.
 */
export interface RecapPublishResult {
  channel: RecapChannel;
  reference: string;
}

/**
 * Output port for a single recap channel adapter.
 */
export interface IRecapPublisher {
  /** Channel this publisher handles. The use case routes based on this. */
  readonly channel: RecapChannel;

  /**
   * Publish the given artifact to this publisher's channel.
   *
   * @throws on transport failure or channel-specific authorization errors.
   */
  publish(artifact: RecapArtifact, target: RecapTarget): Promise<RecapPublishResult>;
}

/**
 * Base error for recap publisher failures.
 */
export class RecapPublisherError extends Error {
  constructor(
    message: string,
    public readonly channel: RecapChannel,
    cause?: Error
  ) {
    super(message);
    this.name = 'RecapPublisherError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (cause) this.cause = cause;
  }
}
