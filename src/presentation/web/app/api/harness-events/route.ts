/**
 * SSE API Route: GET /api/harness-events?sessionId=<id>
 *
 * Spec 119. Streams a harness session's append-only events (turns, plans,
 * tool calls, permission requests) so the session page and the feature
 * drawer's Context tab update live. Thin: it polls ListHarnessEventsUseCase
 * after the last sequence it sent. `Last-Event-ID` resumes after a reconnect.
 */
import { resolve } from '@/lib/server-container';
import { getFeatureFlags } from '@/lib/feature-flags';
import type { ListHarnessEventsUseCase } from '@shepai/core/application/use-cases/harness/list-harness-events.use-case';

// Force dynamic — SSE streams must never be statically optimized or cached.
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

/** Wire shape of one `harness` event. */
export interface HarnessStreamEvent {
  sequence: number;
  type: string;
  taskId?: string;
  createdAt: string;
}

export function GET(request: Request): Response {
  if (!getFeatureFlags().queryAwareHarness) return new Response('Not Found', { status: 404 });
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) return new Response('sessionId is required', { status: 400 });
  const resumeFrom = Number.parseInt(
    request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? '0',
    10
  );

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let stopped = false;
      let after = Number.isFinite(resumeFrom) ? resumeFrom : 0;
      let polling = false;
      const enqueue = (text: string) => {
        if (stopped) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream already closed by the client.
        }
      };
      const poll = async () => {
        if (polling || stopped) return;
        polling = true;
        try {
          const events = await resolve<ListHarnessEventsUseCase>(
            'ListHarnessEventsUseCase'
          ).execute({ sessionId, afterSequence: after });
          for (const e of events) {
            after = e.sequence;
            const payload: HarnessStreamEvent = {
              sequence: e.sequence,
              type: e.type,
              ...(e.taskId && { taskId: e.taskId }),
              createdAt: new Date(e.createdAt as string | Date).toISOString(),
            };
            enqueue(`id: ${e.sequence}\nevent: harness\ndata: ${JSON.stringify(payload)}\n\n`);
          }
        } catch {
          // Transient read failure: try again on the next tick.
        } finally {
          polling = false;
        }
      };
      const heartbeat = setInterval(() => enqueue(': heartbeat\n\n'), HEARTBEAT_INTERVAL_MS);
      const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeat);
        clearInterval(pollTimer);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      request.signal.addEventListener('abort', cleanup, { once: true });
      void poll();
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
