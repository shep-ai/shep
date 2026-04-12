/**
 * Global turn-status SSE stream.
 *
 * GET /api/interactive/chat/turn-statuses/stream
 *
 * One long-lived connection that pushes every turn-status transition
 * from every active session (feat-*, app-*, repo-*, global). The
 * sidebar consumes this instead of polling /api/interactive/chat/turn-statuses
 * every 2 seconds.
 *
 * Emits named events:
 *   - `turn_status` — payload: { featureId, turnStatus }
 *
 * Initial state is NOT replayed — clients fetch the snapshot via the
 * sibling GET endpoint on mount, then consume this stream for live
 * updates.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { IInteractiveSessionService } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const service = resolve<IInteractiveSessionService>('IInteractiveSessionService');
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        function enqueue(text: string) {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Stream may already be closed
          }
        }

        enqueue(': connected\n\n');

        const heartbeat = setInterval(() => {
          enqueue(': heartbeat\n\n');
        }, 15_000);

        // Fan out every session's turn-status transitions through this
        // single subscription. Only emit when a chunk carries a
        // turnStatus — ignore everything else (deltas, tool events,
        // messages) since the sidebar doesn't render those.
        const unsubscribe = service.subscribeAll((featureId, chunk) => {
          if (chunk.turnStatus) {
            enqueue(
              `event: turn_status\ndata: ${JSON.stringify({ featureId, turnStatus: chunk.turnStatus })}\n\n`
            );
          }
        });

        function cleanup() {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Stream may already be closed
          }
        }

        request.signal.addEventListener('abort', cleanup, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/interactive/chat/turn-statuses/stream]', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
