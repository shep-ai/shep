/**
 * PostHog telemetry transport (spec 133).
 *
 * Posts batches to PostHog's `/batch/` capture endpoint with plain `fetch` —
 * no SDK, whose own buffering would duplicate the outbox. GeoIP enrichment is
 * always disabled. Person profiles are processed only for envelopes that carry
 * identity (the user kept "Include my identity" on).
 */

import type {
  ITelemetryTransport,
  TelemetryEnvelope,
} from '../../../application/ports/output/services/telemetry-transport.interface.js';
import type { PostHogConfig } from './telemetry-config.js';

const BATCH_PATH = '/batch/';
/** A hung send would hold the daemon's flush; give up and back off instead. */
const SEND_TIMEOUT_MS = 10_000;
const REDACTED_KEY = '<project key>';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface PostHogEvent {
  uuid: string;
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

function toPostHogEvent(envelope: TelemetryEnvelope): PostHogEvent {
  const identified = envelope.personProperties !== undefined;
  return {
    uuid: envelope.uuid,
    event: envelope.event,
    distinct_id: envelope.distinctId,
    timestamp: envelope.timestamp.toISOString(),
    properties: {
      ...envelope.properties,
      $process_person_profile: identified,
      $geoip_disable: true,
      ...(identified ? { $set: envelope.personProperties } : {}),
    },
  };
}

export class PostHogTelemetryTransport implements ITelemetryTransport {
  constructor(
    private readonly config: PostHogConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init)
  ) {}

  isConfigured(): boolean {
    return this.config.apiKey !== null;
  }

  destination(): string {
    return `${this.config.host}${BATCH_PATH}`;
  }

  describe(envelopes: readonly TelemetryEnvelope[]): unknown {
    return { api_key: REDACTED_KEY, batch: envelopes.map(toPostHogEvent) };
  }

  async send(envelopes: readonly TelemetryEnvelope[]): Promise<void> {
    if (!this.config.apiKey || envelopes.length === 0) return;
    const response = await this.fetchImpl(this.destination(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.config.apiKey, batch: envelopes.map(toPostHogEvent) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`PostHog batch rejected with HTTP ${response.status}`);
    }
  }
}
