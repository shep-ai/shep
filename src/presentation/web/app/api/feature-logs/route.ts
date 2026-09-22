/**
 * SSE API Route: GET /api/feature-logs
 *
 * Streams feature agent log output to the client via Server-Sent Events.
 * Resolves the feature to find its agentRunId, reads the corresponding
 * worker log file, and watches for new content.
 *
 * - Accepts ?featureId query parameter (required)
 * - Sends existing log content as SSE "initial" event
 * - Sends new log content as SSE "log" events
 * - Sends heartbeat comments every 30 seconds to keep connection alive
 * - Cleans up watchers/intervals on client disconnect
 */

import { resolve } from '@/lib/server-container';
import { createLogFileTail } from '@/lib/log-file-tail';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import type { GetWorkerLogPathUseCase } from '@shepai/core/application/use-cases/logs/get-worker-log-path.use-case';
import { watch, type FSWatcher } from 'node:fs';

// Force dynamic — SSE streams must never be statically optimized or cached
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * Create a short-lived SSE error response.
 */
function sseError(error: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const featureId = url.searchParams.get('featureId');

    if (!featureId?.trim()) {
      return sseError('featureId is required');
    }

    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const feature = await featureRepo.findById(featureId);

    if (!feature) {
      return sseError(`Feature not found: ${featureId}`);
    }

    if (!feature.agentRunId) {
      return sseError(`Feature "${feature.name}" has no agent run`);
    }

    // Core owns where the worker writes its log (honours SHEP_HOME).
    const logPath = resolve<GetWorkerLogPathUseCase>('GetWorkerLogPathUseCase').execute(
      feature.agentRunId
    );

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let stopped = false;
        const tail = createLogFileTail(logPath);
        let watcher: FSWatcher | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        function enqueue(text: string) {
          if (stopped) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Stream may be closed
          }
        }

        /**
         * Check for new content and send it as a log event.
         */
        async function checkForUpdates() {
          if (stopped) return;
          try {
            const content = await tail.readAppended();
            if (content) {
              enqueue(`event: log\ndata: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            // Ignore read errors during polling
          }
        }

        // Initialize: read existing content and set up watchers
        (async () => {
          try {
            // Send existing content as initial event
            const initialContent = await tail.readAppended();
            if (initialContent) {
              enqueue(`event: initial\ndata: ${JSON.stringify({ content: initialContent })}\n\n`);
            }

            if (stopped) return;

            // Watch for file changes with fs.watch
            try {
              watcher = watch(logPath, { persistent: false }, () => {
                void checkForUpdates();
              });

              watcher.on('error', () => {
                // Watcher error — fallback poll will handle it
              });
            } catch {
              // File may not exist yet — poll will handle it
            }

            // Fallback poll every 2s (handles cases where fs.watch misses events
            // or the file doesn't exist yet)
            pollInterval = setInterval(() => {
              void checkForUpdates();
            }, POLL_INTERVAL_MS);
          } catch {
            // Initialization error — stream will still stay open for heartbeats
          }
        })();

        // Heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          enqueue(': heartbeat\n\n');
        }, HEARTBEAT_INTERVAL_MS);

        // Cleanup on client disconnect
        const cleanup = () => {
          stopped = true;
          if (watcher) {
            watcher.close();
            watcher = null;
          }
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
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
    // eslint-disable-next-line no-console
    console.error('[SSE route] GET /api/feature-logs error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
