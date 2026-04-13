/**
 * SSE API Route: GET /api/deployment-logs
 *
 * Streams deployment log events to the client via Server-Sent Events.
 * Subscribes to the DeploymentService EventEmitter for real-time log
 * entries, filtered by targetId.
 *
 * - Accepts ?targetId query parameter (required)
 * - Sends log entries as SSE "log" events
 * - Sends heartbeat comments every 30 seconds to keep connection alive
 * - Cleans up EventEmitter subscription on client disconnect
 */

import { resolve } from '@/lib/server-container';
import type {
  IDeploymentService,
  LogEntry,
} from '@shepai/core/application/ports/output/services/deployment-service.interface';
import type { ILogger } from '@shepai/core/application/ports/output/services/logger.interface';

// Force dynamic — SSE streams must never be statically optimized or cached
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function GET(request: Request): Response {
  try {
    const url = new URL(request.url);
    const targetId = url.searchParams.get('targetId');

    if (!targetId?.trim()) {
      const errorStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: 'targetId is required' })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(errorStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let stopped = false;

        function enqueue(text: string) {
          if (stopped) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Stream may be closed
          }
        }

        const deploymentService = resolve<IDeploymentService>('IDeploymentService');

        // Subscribe to log events, filtering by targetId
        const logHandler = (entry: LogEntry) => {
          if (entry.targetId !== targetId) return;
          enqueue(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
        };

        deploymentService.on('log', logHandler);

        // Heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          enqueue(': heartbeat\n\n');
        }, HEARTBEAT_INTERVAL_MS);

        // Cleanup on client disconnect
        const cleanup = () => {
          stopped = true;
          deploymentService.off('log', logHandler);
          clearInterval(heartbeatInterval);
          try {
            controller.close();
          } catch {
            // Stream may already be closed
          }
        };

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
    const logger = resolve<ILogger>('ILogger');
    logger.error('[SSE route] GET /api/deployment-logs error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
