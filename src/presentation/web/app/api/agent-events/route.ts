/**
 * SSE API Route: GET /api/agent-events
 *
 * Thin SSE adapter around `StreamAgentEventsUseCase` (clean-arch violations
 * #4, #5, #7 in spec 089). All business orchestration — delta computation,
 * crash detection, lifecycle→node mapping, interactive session polling, and
 * cloud deployment event forwarding — now lives in the use case. This route
 * only:
 *
 * - Resolves the use case via DI
 * - Frames each yielded event as an SSE `data:` line
 * - Sends heartbeats every 30 s to keep the connection alive
 * - Propagates the client abort signal into the generator
 */

import { resolve } from '@/lib/server-container';
import type {
  StreamAgentEventsUseCase,
  StreamedAgentEvent,
} from '@shepai/core/application/use-cases/agents/stream-agent-events.use-case';
import type { ILogger } from '@shepai/core/application/ports/output/services/logger.interface';
import type { InteractiveSessionEventType } from '@shepai/core/domain/generated/output';

// Force dynamic — SSE streams must never be statically optimized or cached.
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Wire-shape for interactive session events emitted over SSE. The `type`
 * values (e.g. `'interactive_session_booting'`) come straight from the
 * `InteractiveSessionEventType` enum; we re-export this type so web clients
 * can import it from the route module when they need the schema.
 */
export interface InteractiveSessionEvent {
  type: InteractiveSessionEventType;
  sessionId: string;
  featureId: string;
}

export function GET(request: Request): Response {
  const logger = resolve<ILogger>('ILogger');

  try {
    const url = new URL(request.url);
    const runIdFilter = url.searchParams.get('runId') ?? undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let stopped = false;

        const enqueue = (text: string): void => {
          if (stopped) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Stream may already be closed.
          }
        };

        const writeEvent = (event: StreamedAgentEvent): void => {
          if (event.kind === 'notification') {
            logger.debug(
              `[SSE] emit: ${event.event.eventType} for "${event.event.featureName}"${
                event.event.phaseName ? ` (${event.event.phaseName})` : ''
              }`
            );
            enqueue(`event: notification\ndata: ${JSON.stringify(event.event)}\n\n`);
          } else {
            const payload: InteractiveSessionEvent = {
              type: event.type,
              sessionId: event.sessionId,
              featureId: event.featureId,
            };
            enqueue(`event: interactive_session\ndata: ${JSON.stringify(payload)}\n\n`);
          }
        };

        const abortController = new AbortController();
        const cleanup = (): void => {
          if (stopped) return;
          stopped = true;
          abortController.abort();
          clearInterval(heartbeatInterval);
          try {
            controller.close();
          } catch {
            // Stream may already be closed.
          }
        };

        // Heartbeat to keep connection alive.
        const heartbeatInterval = setInterval(() => {
          enqueue(': heartbeat\n\n');
        }, HEARTBEAT_INTERVAL_MS);

        request.signal.addEventListener('abort', cleanup, { once: true });

        // Kick off the use-case generator — fire and forget; completion is
        // driven entirely by the abort signal.
        void (async () => {
          try {
            const streamUseCase = resolve<StreamAgentEventsUseCase>('StreamAgentEventsUseCase');
            for await (const event of streamUseCase.execute({
              runIdFilter,
              signal: abortController.signal,
            })) {
              if (stopped) break;
              writeEvent(event);
            }
          } catch (error) {
            logger.error(
              `[SSE /api/agent-events] generator error: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          } finally {
            cleanup();
          }
        })();
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
    logger.error(
      `[SSE route] GET handler error: ${error instanceof Error ? error.message : String(error)}`
    );
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
