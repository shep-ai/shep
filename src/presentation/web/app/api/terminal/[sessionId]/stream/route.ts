/**
 * GET /api/terminal/[sessionId]/stream
 *
 * Server-Sent Events stream of PTY output for a terminal session. Events:
 *   - `data`  — raw terminal output chunk (string, may contain ANSI escapes)
 *   - `exit`  — child process exited (`{ code }`)
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ITerminalSessionService } from '@shepai/core/application/ports/output/services/terminal-session-service.interface';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { sessionId } = await params;

  try {
    const service = resolve<ITerminalSessionService>('ITerminalSessionService');
    if (!service.exists(sessionId)) {
      return new Response(JSON.stringify({ error: 'session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
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

        const unsubscribe = service.subscribe(
          sessionId,
          (chunk) => {
            enqueue(`event: data\ndata: ${JSON.stringify({ data: chunk })}\n\n`);
          },
          (code) => {
            enqueue(`event: exit\ndata: ${JSON.stringify({ code })}\n\n`);
          }
        );

        function cleanup() {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
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
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/terminal/:sessionId/stream]', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
