/**
 * SSE API Route: GET /api/aspm/posture/stream
 *
 * Feature 098, phase 7 (task-42). Streams posture deltas to the
 * dashboard so the headline tiles (open by severity, top at-risk apps,
 * KEV / SLA / exception counts) update without a full reload (FR-39).
 *
 * Implementation notes:
 *
 *  - Thin presentation-only route — orchestration lives in the
 *    {@link GetPostureSummaryUseCase}; this route just polls the use
 *    case at a fixed cadence and emits an SSE `posture` event when the
 *    summary changes.
 *  - Heartbeats every 30s keep the connection alive through proxies.
 *  - The polling cadence (default 5s) is intentionally coarse — the
 *    dashboard is read-mostly and SQLite reads are O(ms) for the
 *    aggregate queries that back the summary.
 *  - The `lastEventId` header is honored: clients reconnecting after a
 *    network blip skip directly to a fresh snapshot rather than
 *    replaying events.
 */

import { resolve } from '@/lib/server-container';
import { getFeatureFlags } from '@/lib/feature-flags';
import type {
  GetPostureSummaryUseCase,
  PostureSummary,
} from '@shepai/core/application/use-cases/aspm/posture/get-posture-summary';

// Force dynamic — SSE streams must never be statically optimized or cached.
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

/**
 * Wire shape — what the client receives on each `posture` event.
 * `eventId` is monotonically increasing so a client can reconcile
 * out-of-order delivery.
 */
export interface PostureStreamEvent {
  eventId: number;
  emittedAt: string;
  summary: PostureSummaryPayload;
}

/** JSON-safe variant — dates serialized, bigints sidestepped. */
export interface PostureSummaryPayload {
  openBySeverity: PostureSummary['openBySeverity'];
  topAtRiskApplications: PostureSummary['topAtRiskApplications'];
  kevOpenCount: number;
  slaBreachCount: number;
  exceptionCount: number;
  aiReviewQueueDepth: number;
  lastIngestedAt: string | null;
}

export function GET(request: Request): Response {
  // Gate the entire stream behind the `aspm` feature flag. Even with the
  // /aspm UI hidden, the POST endpoint here is reachable by URL, so it
  // must enforce the flag itself.
  if (!getFeatureFlags().aspm) {
    return new Response('Not Found', { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let stopped = false;
      let eventId = 0;
      let lastSignature = '';

      const enqueue = (text: string): void => {
        if (stopped) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream may already be closed.
        }
      };

      const emitPosture = async (force = false): Promise<void> => {
        try {
          const summary = await resolve<GetPostureSummaryUseCase>(
            'GetPostureSummaryUseCase'
          ).execute();
          const payload = toPayload(summary);
          const signature = JSON.stringify(payload);
          if (!force && signature === lastSignature) return;
          lastSignature = signature;
          eventId += 1;
          const event: PostureStreamEvent = {
            eventId,
            emittedAt: new Date().toISOString(),
            summary: payload,
          };
          enqueue(`id: ${eventId}\nevent: posture\ndata: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          enqueue(
            `event: error\ndata: ${JSON.stringify({
              message: err instanceof Error ? err.message : String(err),
            })}\n\n`
          );
        }
      };

      const cleanup = (): void => {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeatInterval);
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      const heartbeatInterval = setInterval(() => {
        enqueue(': heartbeat\n\n');
      }, HEARTBEAT_INTERVAL_MS);

      const pollInterval = setInterval(() => {
        void emitPosture();
      }, POLL_INTERVAL_MS);

      request.signal.addEventListener('abort', cleanup, { once: true });

      // Initial snapshot — always force-emit on connect (reconnecting
      // clients with a non-zero Last-Event-ID still want a fresh state
      // dump, not a replay of historical deltas).
      void emitPosture(true);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function toPayload(summary: PostureSummary): PostureSummaryPayload {
  return {
    openBySeverity: summary.openBySeverity,
    topAtRiskApplications: summary.topAtRiskApplications,
    kevOpenCount: summary.kevOpenCount,
    slaBreachCount: summary.slaBreachCount,
    exceptionCount: summary.exceptionCount,
    aiReviewQueueDepth: summary.aiReviewQueueDepth,
    lastIngestedAt: summary.lastIngestedAt ? summary.lastIngestedAt.toISOString() : null,
  };
}
