/**
 * GET /api/applications/[id]/files/watch
 *
 * Server-Sent Events stream of filesystem change events under an
 * application's repository path. Used by the IDE tab to refresh the
 * file tree and re-read open files when the agent (or any other
 * process) modifies them.
 *
 * Events:
 *   - `change` — `{ kind: 'created'|'modified'|'deleted', path, isDirectory }`
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { WatchApplicationFilesUseCase } from '@shepai/core/application/use-cases/applications/watch-application-files.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id } = await params;

  let unsubscribe: (() => void) | null = null;
  const useCase = resolve<WatchApplicationFilesUseCase>('WatchApplicationFilesUseCase');
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      function enqueue(text: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // stream already closed
        }
      }

      enqueue(': connected\n\n');

      const heartbeat = setInterval(() => {
        enqueue(': heartbeat\n\n');
      }, 15_000);

      try {
        unsubscribe = await useCase.execute({
          applicationId: id,
          onEvent: (event) => {
            enqueue(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        enqueue(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
        return;
      }

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          unsubscribe?.();
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      }

      request.signal.addEventListener('abort', cleanup, { once: true });
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
