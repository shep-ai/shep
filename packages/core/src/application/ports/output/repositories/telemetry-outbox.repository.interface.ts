/**
 * Telemetry Outbox Repository Port (spec 133)
 *
 * The local queue of usage events waiting to be sent. Any process writes to
 * it; only the daemon reads and deletes. It is also the transparency surface:
 * `shep telemetry show` prints what is in it.
 *
 * Synchronous on purpose: the error.unhandled event is written from crash
 * handlers that exit immediately afterwards.
 */

import type { TelemetryEvent } from '../../../../domain/generated/output.js';
import type { TelemetryProperties } from '../services/telemetry-events.js';

export interface TelemetryOutboxEntry {
  /** UUID, sent as the event uuid so retries are recognisable as copies. */
  id: string;
  event: TelemetryEvent;
  properties: TelemetryProperties;
  capturedAt: Date;
  /** Failed sends so far. */
  attempts: number;
  /** Earliest time the entry may be sent again. */
  nextAttemptAt: Date;
}

export interface EnqueueTelemetryOptions {
  /** SHA-256 of a once-key; when it was claimed before, nothing is queued. */
  onceKeyHash?: string;
  /** Keep at most this many entries, trimming the oldest. */
  cap: number;
}

export interface ITelemetryOutboxRepository {
  /**
   * Queue an entry. With `onceKeyHash` the claim and the insert happen in one
   * transaction, so concurrent processes record the event once.
   *
   * @returns true when the entry was queued
   */
  enqueue(
    entry: Omit<TelemetryOutboxEntry, 'attempts' | 'nextAttemptAt'>,
    options: EnqueueTelemetryOptions
  ): boolean;

  /** Entries whose next attempt is due, oldest first. */
  listDue(now: Date, limit: number): TelemetryOutboxEntry[];

  /** Queued entries, oldest first. */
  list(limit: number): TelemetryOutboxEntry[];

  count(): number;

  /** Delete entries (sent or dropped). */
  remove(ids: readonly string[]): void;

  /** Record one more failed send and when to try again. */
  recordFailure(ids: readonly string[], nextAttemptAt: Date): void;

  /** Delete every queued entry (used when telemetry is turned off). */
  clear(): void;
}
