/**
 * Telemetry Transport Port (spec 133)
 *
 * Delivers a batch of envelopes to the analytics backend. Only the daemon's
 * flush calls `send`. The production adapter posts to PostHog; tests use a
 * no-op adapter.
 */

import type { TelemetryProperties } from './telemetry-events.js';

/** One event as it leaves the machine, before backend-specific framing. */
export interface TelemetryEnvelope {
  uuid: string;
  event: string;
  /** Always the install id. */
  distinctId: string;
  timestamp: Date;
  properties: TelemetryProperties;
  /** Person properties, only when the user allows identity. */
  personProperties?: TelemetryProperties;
}

export interface ITelemetryTransport {
  /** False when no project key is configured; the flush then sends nothing. */
  isConfigured(): boolean;

  /** Where events go, e.g. `https://eu.i.posthog.com/batch/`. */
  destination(): string;

  /**
   * The exact request body `send` would post, with the project key replaced by
   * a placeholder. Powers `shep telemetry show`.
   */
  describe(envelopes: readonly TelemetryEnvelope[]): unknown;

  /** Post the batch. Rejects on any non-2xx response or network error. */
  send(envelopes: readonly TelemetryEnvelope[]): Promise<void>;
}
