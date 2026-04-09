/**
 * Feature-scoped SSE stream for real-time chat updates.
 *
 * This is the single source of truth for chat state changes on the
 * client — the React side drops periodic polling and relies entirely
 * on these events plus a one-shot fetch per (re)connection.
 *
 * Emits named events:
 *   - `delta`         — token chunks (streaming assistant text)
 *   - `log`           — tool use / thinking status text
 *   - `activity`      — structured tool_use / tool_result events
 *   - `interaction`   — agent is asking the user a question
 *   - `message`       — a newly persisted user/assistant/tool message
 *   - `session_status`— session lifecycle transition
 *   - `turn_status`   — turn activity transition (drives "Thinking…")
 *   - `done`          — end-of-turn marker
 *
 * `featureId` is a polymorphic scope key: a feature UUID, `app-<id>`,
 * `repo-<id>`, or `global`.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { IInteractiveSessionService } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ featureId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { featureId } = await params;

  try {
    // SSE streams use service directly for subscribe pattern
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

        const unsubscribe = service.subscribeByFeature(featureId, (chunk) => {
          // A single chunk may carry multiple independent signals (e.g.
          // a `log` alongside an `activity`). Emit every field that is
          // present — order is fixed so clients can rely on it.
          if (chunk.message) {
            enqueue(
              `event: message\ndata: ${JSON.stringify({ message: chunk.message, featureId })}\n\n`
            );
          }
          if (chunk.sessionStatus) {
            enqueue(
              `event: session_status\ndata: ${JSON.stringify({ sessionStatus: chunk.sessionStatus, featureId })}\n\n`
            );
          }
          if (chunk.turnStatus) {
            enqueue(
              `event: turn_status\ndata: ${JSON.stringify({ turnStatus: chunk.turnStatus, featureId })}\n\n`
            );
          }
          if (chunk.interaction) {
            enqueue(
              `event: interaction\ndata: ${JSON.stringify({ interaction: chunk.interaction, featureId })}\n\n`
            );
          }
          if (chunk.activity) {
            enqueue(
              `event: activity\ndata: ${JSON.stringify({ activity: chunk.activity, featureId })}\n\n`
            );
          }
          if (chunk.log) {
            enqueue(`event: log\ndata: ${JSON.stringify({ log: chunk.log, featureId })}\n\n`);
          }
          if (chunk.delta) {
            enqueue(`event: delta\ndata: ${JSON.stringify({ delta: chunk.delta, featureId })}\n\n`);
          }
          if (chunk.done) {
            enqueue(`event: done\ndata: ${JSON.stringify({ done: true, featureId })}\n\n`);
          }
          if (chunk.workflowStep) {
            enqueue(
              `event: workflow_step\ndata: ${JSON.stringify({ step: chunk.workflowStep, featureId })}\n\n`
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
    console.error('[GET /api/interactive/chat/:featureId/stream]', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
